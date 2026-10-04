import { Prisma, type EvCharger, type EvStation, type PrismaClient } from '@prisma/client';
import type {
  EvNearbyQueryType,
  EvNearbyResultType,
  EvPointsQueryType,
  EvPointsResultType,
  EvStationDetailType,
  EvStationItemType,
} from '@repo/api-contract';
import { EV_POINT_MIN_ZOOM, LIFE_CELL_ORIGIN, PARKING_POINTS_MAX, evKindLabel, evStationLevel, haversineM } from '@repo/utils';
import { LRUCache } from 'lru-cache';
import { CELL_CACHE_MAX_UNITS, cellGrid, cellKeyOf, cellResultSize, pointsSpanOk } from '../../lib/map-cells.js';
import { kstToIso } from './parking-live.service.js';
import { ParkingServiceError } from './parking.service.js';

// 전기차 충전소 조회 — 로컬 SQLite(EvStation ~10만+, EvCharger ~52만). 점/셀 두 모드는 주차장과 같다. 셀 캐시 키에는
// '사용 가능만' 필터일 때 마지막 상태 반영 시각(statusAt)을 넣는다 — 상태 폴러가 사용 가능 칸을 10분마다 바꾸므로
// 폴링 사이에는 같은 결과를 재사용하고 폴링 뒤엔 키가 갈린다. 필터 셀 집계는 좌표+필터 커버링 인덱스를 탄다(E-5).

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
  private readonly cellCache = new LRUCache<string, EvPointsResultType>({
    max: CELL_CACHE_MAX,
    maxSize: CELL_CACHE_MAX_UNITS,
    sizeCalculation: cellResultSize,
    ttl: CELL_CACHE_TTL_MS,
  });

  constructor(private readonly deps: EvServiceDeps) {}

  private async requireLoaded() {
    const sync = await this.deps.prisma.parkingSync.findFirst({ where: { kind: 'ev' }, orderBy: { loadedAt: 'desc' } });
    if (!sync) throw new ParkingServiceError('전기차 충전소 데이터가 적재되지 않았습니다 — pnpm --filter friendly load:ev-chargers 실행 필요', 503);
    return sync;
  }

  // 마지막 상태 반영 시각 — 10만 행 MAX 스캔이라 1분 메모이즈. 같은 프로세스의 상태 폴러는 반영 직후 noteStatusAt 으로
  // 바로 갱신하고, 주차 status(ParkingService)도 이 값을 같이 쓴다(E-9). 다른 프로세스의 재적재는 1분 안에 따라온다.
  private statusAtCache: { value: string | null; at: number } | null = null;
  async getStatusAt(): Promise<string | null> {
    const now = Date.now();
    if (this.statusAtCache && now - this.statusAtCache.at < STATUS_AT_TTL_MS) return this.statusAtCache.value;
    const agg = await this.deps.prisma.evStation.aggregate({ _max: { statusAt: true } });
    const value = agg._max.statusAt?.toISOString() ?? null;
    this.statusAtCache = { value, at: now };
    return value;
  }

  // 상태 폴러가 충전소 칸을 at 시각으로 고친 직후 — 그 시각이 곧 새 MAX(statusAt).
  noteStatusAt(at: Date): void {
    this.statusAtCache = { value: at.toISOString(), at: Date.now() };
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
    const fetchedAt = sync.loadedAt.toISOString();
    const statusAt = await this.getStatusAt();
    // 점 모드는 그 줌의 화면 크기 안 bbox 만(lib/map-cells) — 넘는 bbox 는 셀.
    if (zoom >= EV_POINT_MIN_ZOOM && pointsSpanOk(zoom, bbox)) {
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

  // 셀 수가 상한을 넘으면 셀을 키운다(cellGrid — 캐시 키도 실제 쓴 줌).
  private async cells(zoom: number, bbox: Bbox, f: EvFilters, syncId: number, fetchedAt: string, statusAt: string | null): Promise<EvPointsResultType> {
    const grid = cellGrid(zoom, bbox);
    const { dLng, dLat, q } = grid;
    const o = LIFE_CELL_ORIGIN;
    const key = `${cellKeyOf(grid)}|${Number(f.fastOnly)}${Number(f.freeParkingOnly)}${Number(f.openOnly)}${Number(f.availableOnly)}|${syncId}${f.availableOnly ? `|${statusAt ?? '-'}` : ''}`;
    const hit = this.cellCache.get(key);
    if (hit) return { ...hit, statusAt };
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
    this.cellCache.set(key, result);
    return result;
  }

  // 좌표 기준 거리순 — 1단계는 박스 안 id·좌표만 읽어 거리 상위 limit 개를 고르고, 2단계에서 그 id 만 전 컬럼으로 읽는다
  // (도심 r=3km 는 박스 안 1,200행 전 컬럼을 매번 읽고 30건만 썼다, E-10). 같은 거리는 1단계 행 순서(안정 정렬).
  async getNearby(q: EvNearbyQueryType): Promise<EvNearbyResultType> {
    const sync = await this.requireLoaded();
    const center = { lat: q.lat, lng: q.lng };
    const degLat = q.radius / 111_320;
    const degLng = q.radius / (111_320 * Math.cos((q.lat * Math.PI) / 180));
    const coords = await this.deps.prisma.evStation.findMany({
      where: this.where(
        { minLat: q.lat - degLat, maxLat: q.lat + degLat, minLng: q.lng - degLng, maxLng: q.lng + degLng },
        { fastOnly: q.fastOnly, freeParkingOnly: q.freeParkingOnly, availableOnly: q.availableOnly, openOnly: q.openOnly },
      ),
      select: { id: true, lat: true, lng: true },
    });
    const inRadius = coords
      .map((r) => ({ id: r.id, dist: Math.round(haversineM(center, { lat: r.lat, lng: r.lng })) }))
      .filter((it) => it.dist <= q.radius)
      .sort((a, b) => a.dist - b.dist);
    const page = inRadius.slice(0, q.limit);
    const rows = page.length > 0 ? await this.deps.prisma.evStation.findMany({ where: { id: { in: page.map((p) => p.id) } } }) : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = page.flatMap((p) => {
      const r = byId.get(p.id);
      return r ? [{ ...toEvStationItem(r), dist: p.dist }] : [];
    });
    return { center, items, total: inRadius.length, fetchedAt: sync.loadedAt.toISOString(), statusAt: await this.getStatusAt() };
  }

  async getDetail(id: string): Promise<EvStationDetailType> {
    const row = await this.deps.prisma.evStation.findUnique({ where: { id } });
    if (!row) throw new ParkingServiceError('해당 충전소를 찾을 수 없습니다.', 404);
    const chargers = await this.deps.prisma.evCharger.findMany({ where: { statId: id }, orderBy: { chgerId: 'asc' } });
    return { ...toEvStationItem(row), chargers: chargers.map(toChargerItem), statusAt: row.statusAt?.toISOString() ?? null };
  }
}
