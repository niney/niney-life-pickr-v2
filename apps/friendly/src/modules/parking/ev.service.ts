import { Prisma, type EvCharger, type EvStation, type PrismaClient } from '@prisma/client';
import type {
  EvNearbyQueryType,
  EvNearbyResultType,
  EvPointsQueryType,
  EvPointsResultType,
  EvStationDetailType,
  EvStationItemType,
} from '@repo/api-contract';
import { EV_POINT_MIN_ZOOM, LIFE_CELL_ORIGIN, PARKING_POINTS_MAX, evKindLabel, evStationLevel, haversineM, lifeCellSizeDeg } from '@repo/utils';
import { LRUCache } from 'lru-cache';
import { kstToIso } from './parking-live.service.js';
import { ParkingServiceError } from './parking.service.js';

// 전기차 충전소 조회 — 로컬 SQLite(EvStation ~10만+, EvCharger ~52만). 점/셀 두 모드는 주차장과 같고, 셀 캐시는 짧게(상태
// 폴러가 사용 가능 칸을 10분마다 바꾸므로 '사용 가능만' 필터 셀은 캐시하지 않는다).

const POINTS_MAX_SPAN_DEG = 1.5;
const CELL_CACHE_TTL_MS = 10 * 60_000;
const CELL_CACHE_MAX = 300;
const STATUS_AT_TTL_MS = 60_000;

interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}
const parseBbox = (s: string): Bbox => {
  const [a, b, c, d] = s.split(',').map(Number) as [number, number, number, number];
  return { minLng: Math.min(a, c), maxLng: Math.max(a, c), minLat: Math.min(b, d), maxLat: Math.max(b, d) };
};

interface EvFilters {
  fastOnly: boolean;
  freeParkingOnly: boolean;
  availableOnly: boolean;
  openOnly: boolean;
}

export const toEvStationItem = (r: EvStation): EvStationItemType => ({
  id: r.id,
  name: r.name,
  addr: r.addr,
  addrDetail: r.addrDetail,
  location: r.location,
  lat: r.lat,
  lng: r.lng,
  useTime: r.useTime,
  operator: r.operator,
  operatorCall: r.operatorCall,
  parkingFree: r.parkingFree,
  limited: r.limited,
  limitDetail: r.limitDetail,
  note: r.note,
  kind: r.kind,
  kindDetail: r.kindDetail,
  kindLabel: evKindLabel(r.kind, r.kindDetail),
  floorType: r.floorType,
  floorNum: r.floorNum,
  chargerCount: r.chargerCount,
  fastCount: r.fastCount,
  availableCount: r.availableCount,
  chargingCount: r.chargingCount,
  level: evStationLevel(r.availableCount, r.chargingCount),
});

const toChargerItem = (c: EvCharger) => ({
  id: c.chgerId,
  type: c.type,
  outputKw: c.outputKw,
  method: c.method,
  fast: c.fast,
  stat: c.stat,
  statUpdatedAt: kstToIso(c.statUpdDt),
  lastChargeEndAt: kstToIso(c.lastTedt),
  chargingSince: kstToIso(c.nowTsdt),
});

export interface EvServiceDeps {
  prisma: PrismaClient;
}

export class EvService {
  private readonly cellCache = new LRUCache<string, EvPointsResultType>({ max: CELL_CACHE_MAX, ttl: CELL_CACHE_TTL_MS });

  constructor(private readonly deps: EvServiceDeps) {}

  private async requireLoaded() {
    const sync = await this.deps.prisma.parkingSync.findFirst({ where: { kind: 'ev' }, orderBy: { loadedAt: 'desc' } });
    if (!sync) throw new ParkingServiceError('전기차 충전소 데이터가 적재되지 않았습니다 — pnpm --filter friendly load:ev-chargers 실행 필요', 503);
    return sync;
  }

  // 마지막 상태 반영 시각 — 10만 행 MAX 스캔이라 1분 메모이즈(폴러가 10분마다 바꾼다).
  private statusAtCache: { value: string | null; at: number } | null = null;
  private async statusAt(): Promise<string | null> {
    const now = Date.now();
    if (this.statusAtCache && now - this.statusAtCache.at < STATUS_AT_TTL_MS) return this.statusAtCache.value;
    const agg = await this.deps.prisma.evStation.aggregate({ _max: { statusAt: true } });
    const value = agg._max.statusAt?.toISOString() ?? null;
    this.statusAtCache = { value, at: now };
    return value;
  }

  private where(b: Bbox, f: EvFilters): Prisma.EvStationWhereInput {
    return {
      lat: { gte: b.minLat, lte: b.maxLat },
      lng: { gte: b.minLng, lte: b.maxLng },
      ...(f.fastOnly ? { hasFast: true } : {}),
      ...(f.freeParkingOnly ? { parkingFree: true } : {}),
      ...(f.availableOnly ? { availableCount: { gt: 0 } } : {}),
      ...(f.openOnly ? { OR: [{ limited: false }, { limited: null }] } : {}),
    };
  }

  async getPoints(q: EvPointsQueryType): Promise<EvPointsResultType> {
    const sync = await this.requireLoaded();
    const bbox = parseBbox(q.bbox);
    const f: EvFilters = { fastOnly: q.fastOnly, freeParkingOnly: q.freeParkingOnly, availableOnly: q.availableOnly, openOnly: q.openOnly };
    const zoom = Math.floor(q.zoom);
    const narrow = bbox.maxLat - bbox.minLat <= POINTS_MAX_SPAN_DEG && bbox.maxLng - bbox.minLng <= POINTS_MAX_SPAN_DEG;
    const fetchedAt = sync.loadedAt.toISOString();
    const statusAt = await this.statusAt();
    if (zoom >= EV_POINT_MIN_ZOOM && narrow) {
      const where = this.where(bbox, f);
      const rows = await this.deps.prisma.evStation.findMany({
        where,
        select: { id: true, lat: true, lng: true, name: true, availableCount: true, chargingCount: true, hasFast: true },
        take: PARKING_POINTS_MAX + 1,
      });
      const truncated = rows.length > PARKING_POINTS_MAX;
      const items = (truncated ? rows.slice(0, PARKING_POINTS_MAX) : rows).map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        name: r.name,
        level: evStationLevel(r.availableCount, r.chargingCount),
        fast: r.hasFast,
      }));
      const total = truncated ? await this.deps.prisma.evStation.count({ where }) : items.length;
      return { mode: 'points', items, cells: [], total, truncated, minPointZoom: EV_POINT_MIN_ZOOM, fetchedAt, statusAt };
    }
    return this.cells(zoom, bbox, f, sync.id, fetchedAt, statusAt);
  }

  private async cells(zoom: number, bbox: Bbox, f: EvFilters, syncId: number, fetchedAt: string, statusAt: string | null): Promise<EvPointsResultType> {
    const { dLng, dLat } = lifeCellSizeDeg(zoom);
    const o = LIFE_CELL_ORIGIN;
    const q: Bbox = {
      minLng: o.lng + Math.floor((bbox.minLng - o.lng) / dLng) * dLng,
      maxLng: o.lng + Math.ceil((bbox.maxLng - o.lng) / dLng) * dLng,
      minLat: o.lat + Math.floor((bbox.minLat - o.lat) / dLat) * dLat,
      maxLat: o.lat + Math.ceil((bbox.maxLat - o.lat) / dLat) * dLat,
    };
    const key = `${zoom}|${q.minLng.toFixed(6)},${q.minLat.toFixed(6)},${q.maxLng.toFixed(6)},${q.maxLat.toFixed(6)}|${Number(f.fastOnly)}${Number(f.freeParkingOnly)}${Number(f.openOnly)}|${syncId}`;
    if (!f.availableOnly) {
      const hit = this.cellCache.get(key);
      if (hit) return { ...hit, statusAt };
    }
    const conds: Prisma.Sql[] = [
      Prisma.sql`"lat" >= ${q.minLat}`,
      Prisma.sql`"lat" <= ${q.maxLat}`,
      Prisma.sql`"lng" >= ${q.minLng}`,
      Prisma.sql`"lng" <= ${q.maxLng}`,
    ];
    if (f.fastOnly) conds.push(Prisma.sql`"hasFast" = 1`);
    if (f.freeParkingOnly) conds.push(Prisma.sql`"parkingFree" = 1`);
    if (f.availableOnly) conds.push(Prisma.sql`"availableCount" > 0`);
    if (f.openOnly) conds.push(Prisma.sql`("limited" IS NULL OR "limited" = 0)`);
    const rows = await this.deps.prisma.$queryRaw<{ cx: unknown; cy: unknown; n: unknown; lat: unknown; lng: unknown }[]>(
      Prisma.sql`SELECT CAST(("lng" - ${o.lng}) / ${dLng} AS INTEGER) AS cx,
                        CAST(("lat" - ${o.lat}) / ${dLat} AS INTEGER) AS cy,
                        COUNT(*) AS n, AVG("lat") AS lat, AVG("lng") AS lng
                 FROM "ev_stations"
                 WHERE ${Prisma.join(conds, ' AND ')}
                 GROUP BY cx, cy`,
    );
    const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
    const cells = rows
      .map((r) => {
        const cx = Number(r.cx);
        const cy = Number(r.cy);
        const centerLng = o.lng + (cx + 0.5) * dLng;
        const centerLat = o.lat + (cy + 0.5) * dLat;
        return {
          lat: clamp(Number(r.lat), centerLat - 0.15 * dLat, centerLat + 0.15 * dLat),
          lng: clamp(Number(r.lng), centerLng - 0.15 * dLng, centerLng + 0.15 * dLng),
          count: Number(r.n),
        };
      })
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.count > 0);
    const result: EvPointsResultType = {
      mode: 'cells',
      items: [],
      cells,
      total: cells.reduce((acc, c) => acc + c.count, 0),
      truncated: false,
      minPointZoom: EV_POINT_MIN_ZOOM,
      fetchedAt,
      statusAt,
    };
    if (!f.availableOnly) this.cellCache.set(key, result);
    return result;
  }

  async getNearby(q: EvNearbyQueryType): Promise<EvNearbyResultType> {
    const sync = await this.requireLoaded();
    const center = { lat: q.lat, lng: q.lng };
    const degLat = q.radius / 111_320;
    const degLng = q.radius / (111_320 * Math.cos((q.lat * Math.PI) / 180));
    const rows = await this.deps.prisma.evStation.findMany({
      where: this.where(
        { minLat: q.lat - degLat, maxLat: q.lat + degLat, minLng: q.lng - degLng, maxLng: q.lng + degLng },
        { fastOnly: q.fastOnly, freeParkingOnly: q.freeParkingOnly, availableOnly: q.availableOnly, openOnly: q.openOnly },
      ),
    });
    const withDist = rows
      .map((r) => ({ ...toEvStationItem(r), dist: Math.round(haversineM(center, { lat: r.lat, lng: r.lng })) }))
      .filter((it) => it.dist <= q.radius)
      .sort((a, b) => a.dist - b.dist);
    return { center, items: withDist.slice(0, q.limit), total: withDist.length, fetchedAt: sync.loadedAt.toISOString(), statusAt: await this.statusAt() };
  }

  async getDetail(id: string): Promise<EvStationDetailType> {
    const row = await this.deps.prisma.evStation.findUnique({ where: { id } });
    if (!row) throw new ParkingServiceError('해당 충전소를 찾을 수 없습니다.', 404);
    const chargers = await this.deps.prisma.evCharger.findMany({ where: { statId: id }, orderBy: { chgerId: 'asc' } });
    return { ...toEvStationItem(row), chargers: chargers.map(toChargerItem), statusAt: row.statusAt?.toISOString() ?? null };
  }
}
