import { Prisma, type ParkingLot, type PrismaClient } from '@prisma/client';
import type {
  ParkingAirportsResultType,
  ParkingLotDetailType,
  ParkingLotItemType,
  ParkingLotNearbyResultType,
  ParkingLotPointsQueryType,
  ParkingLotPointsResultType,
  ParkingNearbyQueryType,
  ParkingStatusResultType,
  RestaurantParkingReviewsType,
} from '@repo/api-contract';
import {
  LIFE_CELL_ORIGIN,
  PARKING_POINTS_MAX,
  PARKING_POINT_MIN_ZOOM,
  haversineM,
  lifeCellSizeDeg,
  type ParkingFeeType,
  type ParkingLotType,
  type ParkingOwnership,
} from '@repo/utils';
import { LRUCache } from 'lru-cache';
import { resolveCanonicalMembersByPlaceId } from '../restaurant/canonical-members.js';
import { airportLotKey, buildAirportList, type ParkingLiveService, type ParkingLiveValue } from './parking-live.service.js';

// 주차장 조회 — 로컬 SQLite(ParkingLot ~2만)만 읽고, 실시간은 폴러 메모리(ParkingLiveService)를 합친다. 뷰포트 조회는
// 일상지도와 같은 두 모드(임계 줌 이상 + 좁은 bbox 면 점, 아니면 전국 고정 원점 격자 GROUP BY 셀 + LRU 10분).
// 필터: 공영만·무료만·실시간 연계만(liveOnly — 폴러가 지금 값을 가진 키만, 그래서 셀 캐시 키에 넣지 않는다).

export class ParkingServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ParkingServiceError';
  }
}

const POINTS_MAX_SPAN_DEG = 1.5;
const CELL_CACHE_TTL_MS = 10 * 60_000;
const CELL_CACHE_MAX = 300;
const TIP_LIMIT = 5;
const PARKING_ASPECT = '주차';

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

interface LotFilters {
  publicOnly: boolean;
  freeOnly: boolean;
  liveOnly: boolean;
}

const toLive = (v: ParkingLiveValue | null) =>
  v
    ? { total: v.total, occupied: v.occupied, available: v.available, level: v.level, updatedAt: v.updatedAt, fetchedAt: v.fetchedAt }
    : null;

export const toParkingLotItem = (r: ParkingLot, live: ParkingLiveValue | null): ParkingLotItemType => ({
  id: r.id,
  source: r.source === 'seoul' || r.source === 'kotsa' ? r.source : 'std',
  name: r.name,
  ownership: (r.ownership as ParkingOwnership | null) ?? null,
  lotType: (r.lotType as ParkingLotType | null) ?? null,
  feeType: (r.feeType as ParkingFeeType | null) ?? null,
  roadAddr: r.roadAddr,
  lotAddr: r.lotAddr,
  phone: r.phone,
  orgName: r.orgName,
  totalSpaces: r.totalSpaces,
  hours: {
    wd: { open: r.wdOpen, close: r.wdClose },
    sat: { open: r.satOpen, close: r.satClose },
    hol: { open: r.holOpen, close: r.holClose },
  },
  operDays: r.operDays,
  fee: {
    baseMin: r.baseMin,
    baseFee: r.baseFee,
    addMin: r.addMin,
    addFee: r.addFee,
    dayMaxFee: r.dayMaxFee,
    dayPassFee: r.dayPassFee,
    monthlyFee: r.monthlyFee,
  },
  satFree: r.satFree,
  holFree: r.holFree,
  payMethods: r.payMethods,
  note: r.note,
  disabledZone: r.disabledZone,
  lat: r.lat,
  lng: r.lng,
  geoSource: r.geoSource === 'source' || r.geoSource === 'road' || r.geoSource === 'parcel' ? r.geoSource : null,
  baseDate: r.baseDate,
  live: toLive(live),
});

export interface ParkingServiceDeps {
  prisma: PrismaClient;
  live: ParkingLiveService;
  now?: () => Date;
}

export class ParkingService {
  private readonly cellCache = new LRUCache<string, ParkingLotPointsResultType>({ max: CELL_CACHE_MAX, ttl: CELL_CACHE_TTL_MS });

  constructor(private readonly deps: ParkingServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private latestSync(kind: 'lots' | 'ev') {
    return this.deps.prisma.parkingSync.findFirst({ where: { kind }, orderBy: { loadedAt: 'desc' } });
  }

  private async requireLots() {
    const sync = await this.latestSync('lots');
    if (!sync) throw new ParkingServiceError('주차장 데이터가 적재되지 않았습니다 — pnpm --filter friendly load:parking-lots 실행 필요', 503);
    return sync;
  }

  private where(b: Bbox, f: LotFilters): Prisma.ParkingLotWhereInput {
    return {
      lat: { gte: b.minLat, lte: b.maxLat },
      lng: { gte: b.minLng, lte: b.maxLng },
      ...(f.publicOnly ? { ownership: 'public' } : {}),
      ...(f.freeOnly ? { feeType: 'free' } : {}),
      ...(f.liveOnly ? { liveKey: { in: this.deps.live.liveKeys() } } : {}),
    };
  }

  async getStatus(): Promise<ParkingStatusResultType> {
    const [lots, ev] = await Promise.all([this.latestSync('lots'), this.latestSync('ev')]);
    const parseDetail = (s: string | null | undefined): Record<string, number> => {
      try {
        return s ? (JSON.parse(s) as Record<string, number>) : {};
      } catch {
        return {};
      }
    };
    const detail = parseDetail(lots?.detail);
    // 충전기 수는 적재 이력에 적어 둔 값(52만 행 count 를 매번 하지 않는다).
    const evChargers = parseDetail(ev?.detail)['chargers'] ?? 0;
    const statusAt = ev ? await this.deps.prisma.evStation.aggregate({ _max: { statusAt: true } }) : null;
    const live = this.deps.live.lotStatus();
    const airports = this.deps.live.airportSnapshot();
    return {
      lots: {
        loaded: lots !== null,
        count: lots?.count ?? 0,
        bySource: { std: detail['std'] ?? 0, seoul: detail['seoul'] ?? 0, kotsa: detail['kotsa'] ?? 0 },
        geocoded: lots?.geocoded ?? 0,
        baseDate: lots?.baseDate ?? null,
        loadedAt: lots?.loadedAt.toISOString() ?? null,
      },
      ev: {
        loaded: ev !== null,
        stations: ev?.count ?? 0,
        chargers: evChargers,
        loadedAt: ev?.loadedAt.toISOString() ?? null,
        statusAt: statusAt?._max.statusAt?.toISOString() ?? null,
      },
      live: {
        lotCount: live.count,
        lotAt: live.at,
        airportLotCount: airports.lots.length,
        airportAt: airports.at,
      },
      fetchedAt: this.now().toISOString(),
    };
  }

  async getPoints(q: ParkingLotPointsQueryType): Promise<ParkingLotPointsResultType> {
    const sync = await this.requireLots();
    const bbox = parseBbox(q.bbox);
    const f: LotFilters = { publicOnly: q.publicOnly, freeOnly: q.freeOnly, liveOnly: q.liveOnly };
    const zoom = Math.floor(q.zoom);
    const narrow = bbox.maxLat - bbox.minLat <= POINTS_MAX_SPAN_DEG && bbox.maxLng - bbox.minLng <= POINTS_MAX_SPAN_DEG;
    const fetchedAt = sync.loadedAt.toISOString();
    if (zoom >= PARKING_POINT_MIN_ZOOM && narrow) {
      const where = this.where(bbox, f);
      const rows = await this.deps.prisma.parkingLot.findMany({
        where,
        select: { id: true, lat: true, lng: true, name: true, feeType: true, liveKey: true },
        take: PARKING_POINTS_MAX + 1,
      });
      const truncated = rows.length > PARKING_POINTS_MAX;
      const items = (truncated ? rows.slice(0, PARKING_POINTS_MAX) : rows).flatMap((r) => {
        if (r.lat === null || r.lng === null) return [];
        const live = this.deps.live.getLot(r.liveKey);
        return [
          {
            id: r.id,
            lat: r.lat,
            lng: r.lng,
            name: r.name,
            feeType: (r.feeType as ParkingFeeType | null) ?? null,
            level: live?.level ?? null,
            available: live?.available ?? null,
          },
        ];
      });
      const total = truncated ? await this.deps.prisma.parkingLot.count({ where }) : items.length;
      return { mode: 'points', items, cells: [], total, truncated, minPointZoom: PARKING_POINT_MIN_ZOOM, fetchedAt };
    }
    return this.cells(zoom, bbox, f, sync.id, fetchedAt);
  }

  private async cells(zoom: number, bbox: Bbox, f: LotFilters, syncId: number, fetchedAt: string): Promise<ParkingLotPointsResultType> {
    const { dLng, dLat } = lifeCellSizeDeg(zoom);
    const o = LIFE_CELL_ORIGIN;
    const q: Bbox = {
      minLng: o.lng + Math.floor((bbox.minLng - o.lng) / dLng) * dLng,
      maxLng: o.lng + Math.ceil((bbox.maxLng - o.lng) / dLng) * dLng,
      minLat: o.lat + Math.floor((bbox.minLat - o.lat) / dLat) * dLat,
      maxLat: o.lat + Math.ceil((bbox.maxLat - o.lat) / dLat) * dLat,
    };
    const key = `${zoom}|${q.minLng.toFixed(6)},${q.minLat.toFixed(6)},${q.maxLng.toFixed(6)},${q.maxLat.toFixed(6)}|${Number(f.publicOnly)}${Number(f.freeOnly)}|${syncId}`;
    // 실시간 필터는 폴링마다 집합이 바뀌어 캐시하지 않는다(대상도 수백 곳뿐).
    if (!f.liveOnly) {
      const hit = this.cellCache.get(key);
      if (hit) return hit;
    }
    const conds: Prisma.Sql[] = [
      Prisma.sql`"lat" >= ${q.minLat}`,
      Prisma.sql`"lat" <= ${q.maxLat}`,
      Prisma.sql`"lng" >= ${q.minLng}`,
      Prisma.sql`"lng" <= ${q.maxLng}`,
    ];
    if (f.publicOnly) conds.push(Prisma.sql`"ownership" = 'public'`);
    if (f.freeOnly) conds.push(Prisma.sql`"feeType" = 'free'`);
    if (f.liveOnly) {
      const keys = this.deps.live.liveKeys();
      if (keys.length === 0) return { mode: 'cells', items: [], cells: [], total: 0, truncated: false, minPointZoom: PARKING_POINT_MIN_ZOOM, fetchedAt };
      conds.push(Prisma.sql`"liveKey" IN (${Prisma.join(keys)})`);
    }
    const rows = await this.deps.prisma.$queryRaw<{ cx: unknown; cy: unknown; n: unknown; lat: unknown; lng: unknown }[]>(
      Prisma.sql`SELECT CAST(("lng" - ${o.lng}) / ${dLng} AS INTEGER) AS cx,
                        CAST(("lat" - ${o.lat}) / ${dLat} AS INTEGER) AS cy,
                        COUNT(*) AS n, AVG("lat") AS lat, AVG("lng") AS lng
                 FROM "parking_lots"
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
    const result: ParkingLotPointsResultType = {
      mode: 'cells',
      items: [],
      cells,
      total: cells.reduce((acc, c) => acc + c.count, 0),
      truncated: false,
      minPointZoom: PARKING_POINT_MIN_ZOOM,
      fetchedAt,
    };
    if (!f.liveOnly) this.cellCache.set(key, result);
    return result;
  }

  // 좌표 기준 거리순 — 등거리 근사 bbox 로 후보를 좁힌 뒤 하버사인 거리로 반경 필터·정렬.
  async getNearby(q: ParkingNearbyQueryType): Promise<ParkingLotNearbyResultType> {
    const sync = await this.requireLots();
    const center = { lat: q.lat, lng: q.lng };
    const degLat = q.radius / 111_320;
    const degLng = q.radius / (111_320 * Math.cos((q.lat * Math.PI) / 180));
    const rows = await this.deps.prisma.parkingLot.findMany({
      where: this.where(
        { minLat: q.lat - degLat, maxLat: q.lat + degLat, minLng: q.lng - degLng, maxLng: q.lng + degLng },
        { publicOnly: q.publicOnly, freeOnly: q.freeOnly, liveOnly: q.liveOnly },
      ),
    });
    const withDist = rows
      .flatMap((r) =>
        r.lat !== null && r.lng !== null
          ? [{ ...toParkingLotItem(r, this.deps.live.getLot(r.liveKey)), dist: Math.round(haversineM(center, { lat: r.lat, lng: r.lng })) }]
          : [],
      )
      .filter((it) => it.dist <= q.radius)
      .sort((a, b) => a.dist - b.dist);
    return { center, items: withDist.slice(0, q.limit), total: withDist.length, fetchedAt: sync.loadedAt.toISOString() };
  }

  async getDetail(id: string): Promise<ParkingLotDetailType> {
    const row = await this.deps.prisma.parkingLot.findUnique({ where: { id } });
    if (!row) throw new ParkingServiceError('해당 주차장을 찾을 수 없습니다.', 404);
    const live = this.deps.live.getLot(row.liveKey);
    const pattern = row.liveKey ? await this.deps.live.getPattern(row.liveKey) : null;
    return { ...toParkingLotItem(row, live), pattern };
  }

  async getAirports(): Promise<ParkingAirportsResultType> {
    const snap = this.deps.live.airportSnapshot();
    const usual = await this.deps.live.usualNow(snap.lots.map((l) => airportLotKey(l.airportCode, l.name)));
    return { airports: buildAirportList(snap.lots, usual), fetchedAt: snap.at, stale: snap.stale };
  }

  // 맛집 '가는 법' — 공개 멤버(네이버+다이닝코드+테이블링) 리뷰 분석의 '주차' 관점 극성 + 주차 팁 상위.
  async getRestaurantReviews(placeId: string): Promise<RestaurantParkingReviewsType | null> {
    const members = await resolveCanonicalMembersByPlaceId(this.deps.prisma, placeId);
    if (!members) return null;
    const rows = await this.deps.prisma.reviewSummary.findMany({
      where: { review: { restaurantId: { in: members.memberIds } }, status: 'done' },
      select: { aspectsJson: true, tipsJson: true },
    });
    const aspect = { pos: 0, neg: 0, neu: 0 };
    const tips = new Map<string, number>();
    for (const r of rows) {
      const asp = safeJson<Record<string, string>>(r.aspectsJson, {});
      const pol = asp[PARKING_ASPECT];
      if (pol === 'pos') aspect.pos += 1;
      else if (pol === 'neg') aspect.neg += 1;
      else if (pol === 'neu') aspect.neu += 1;
      for (const t of safeJson<unknown[]>(r.tipsJson, [])) {
        if (typeof t !== 'string') continue;
        const term = t.replace(/\s+/g, ' ').trim();
        if (term.length === 0 || term.length > 40 || !term.includes('주차')) continue;
        tips.set(term, (tips.get(term) ?? 0) + 1);
      }
    }
    return {
      analyzed: rows.length,
      aspect,
      tips: [...tips.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
        .slice(0, TIP_LIMIT)
        .map(([term, count]) => ({ term, count })),
    };
  }
}

const safeJson = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
