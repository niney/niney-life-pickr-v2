// 버스 정류장 검색 + 실시간 도착정보/버스 위치 — 서울시 API 프록시.
//
// 검색 캐싱 정책 (개발계정 일 1,000건 한도 보호):
//   - TTL 30일 — 정류소 정보는 거의 안 바뀐다.
//   - force(사용자 강제 갱신)라도 60초 내 재수집은 캐시로 응답.
//   - 빈 결과도 검색 행을 남긴다(네거티브 캐싱 — 무의미 키워드 반복 차단).
//   - 업스트림 실패 시 만료된 캐시라도 있으면 'stale' 로 반환(가용성 우선).
//   - 동일 키워드 동시 요청은 in-flight 합류 — 업스트림 1회만 호출.
//   - 일일 업스트림 쿼터 가드(기본 900) — 단일 인스턴스 전제라 메모리 카운터로
//     충분(Redis 금지 정책).
// 도착정보/버스 위치는 무캐싱 실시간 프록시 — 캐시가 없어 stale 폴백도 없고,
// 일일 쿼터 카운터만 검색과 공유한다(세 경로 합산으로 한도 보호).

import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  BusArrivalEntryType,
  BusArrivalsResultType,
  BusNearbyResultType,
  BusPositionsResultType,
  BusRouteDetailResultType,
  BusRouteInfoType,
  BusRoutePathPointType,
  BusRouteStationItemType,
  BusStationSearchResultType,
} from '@repo/api-contract';
import {
  BusApiError,
  getBusPositionsByRouteSt,
  getBusPositionsByRtid,
  getRouteInfo,
  getRoutePath,
  getStationArrivals,
  getStationsByName,
  getStationsByPos,
  getStationsByRoute,
  toLatLng,
  type BusApiRequestOptions,
  type RawBusPosition,
  type RawBusStation,
  type RawNearbyStation,
  type RawRouteInfo,
  type RawRoutePathPoint,
  type RawRouteStation,
  type RawStationArrival,
} from './bus-api.adapter.js';

export const BUS_SEARCH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const FORCE_MIN_INTERVAL_MS = 60_000;
// 응답 상한 — total 은 절단 전 건수 (FE 가 '일부만 표시' 안내).
const MAX_ITEMS = 100;
// 일일 업스트림 호출 한도 기본값 — 개발계정 일 1,000건에서 여유를 둔 900.
export const DEFAULT_DAILY_UPSTREAM_LIMIT = 900;
// 주변 정류장 격자 캐시 — 지도 자동 조회를 감당하기 위해 셀 단위로 DB 에
// 30일 캐싱한다(정류소는 사실상 불변 — 키워드 검색과 동일 정책).
// 셀 한 변 0.005° ≈ 550m. 쿼리 좌표를 셀에 스냅해 cellKey 로 쓴다.
export const NEARBY_CELL_DEG = 0.005;
export const BUS_NEARBY_TTL_MS = BUS_SEARCH_TTL_MS;
// 노선 상세(형상+정류소+기본정보)도 사실상 정적 — 검색과 동일 30일 TTL.
export const BUS_ROUTE_TTL_MS = BUS_SEARCH_TTL_MS;

// 실시간(도착/위치) 마이크로 캐시 TTL — 동시 사용자의 업스트림 중복콜을 흡수해
// 일일 쿼터를 지킨다. 실시간성 훼손을 막기 위해 15초로 짧게(지하철과 동일 규율).
export const BUS_REALTIME_MICRO_CACHE_TTL_MS = 15_000;
// 업스트림 호출 반경 — 셀 중심에서 셀 내 임의 지점(반 대각 ≈390m) + 최대 요청
// 반경(1000m)을 다 덮어야 셀 캐시를 어떤 쿼리에도 재사용할 수 있다. 1500m.
export const NEARBY_UPSTREAM_RADIUS_M = 1500;

// Asia/Seoul 기준 YYYY-MM-DD — 쿼터 리셋 경계. en-CA 로캘이 ISO 형식을 낸다.
const SEOUL_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const seoulDateKey = (d: Date): string => SEOUL_DATE_FMT.format(d);

// 라우트가 HTTP status 로 변환하는 서비스 에러. error-handler 플러그인은
// statusCode >= 500 을 일괄 500 으로 응답하므로 라우트가 직접 코드를 내린다.
export class BusServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    opts: { cause?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'BusServiceError';
  }
}

export interface BusServiceDeps {
  serviceKey: string;
  // 테스트 주입용 — 기본은 실제 서울시 API 어댑터.
  adapter?: {
    getStationsByName: (
      keyword: string,
      opts: BusApiRequestOptions,
    ) => Promise<RawBusStation[]>;
    getStationArrivals?: (
      arsId: string,
      opts: BusApiRequestOptions,
    ) => Promise<RawStationArrival[]>;
    getBusPositionsByRouteSt?: (
      busRouteId: string,
      startOrd: number,
      endOrd: number,
      opts: BusApiRequestOptions,
    ) => Promise<RawBusPosition[]>;
    getBusPositionsByRtid?: (
      busRouteId: string,
      opts: BusApiRequestOptions,
    ) => Promise<RawBusPosition[]>;
    getStationsByPos?: (
      lng: number,
      lat: number,
      radiusM: number,
      opts: BusApiRequestOptions,
    ) => Promise<RawNearbyStation[]>;
    getRoutePath?: (
      busRouteId: string,
      opts: BusApiRequestOptions,
    ) => Promise<RawRoutePathPoint[]>;
    getStationsByRoute?: (
      busRouteId: string,
      opts: BusApiRequestOptions,
    ) => Promise<RawRouteStation[]>;
    getRouteInfo?: (
      busRouteId: string,
      opts: BusApiRequestOptions,
    ) => Promise<RawRouteInfo | null>;
  };
  // 테스트 주입용 — TTL/60초 가드 시간 제어 (가짜 타이머 불필요).
  now?: () => Date;
  // 일일 업스트림 호출 한도 (기본 DEFAULT_DAILY_UPSTREAM_LIMIT) — 테스트 주입용.
  dailyLimit?: number;
}

type CachedSearch = Prisma.BusStationSearchGetPayload<{
  include: { hits: { include: { station: true } } };
}>;

// 도착예정 항목 정규화 — 서울시는 '도착예정 차량 없음'을 vehId '0' 으로
// 표현하므로 null 로 정규화한다. 메시지 자체가 없으면 항목이 없는 것.
const toArrivalEntry = (
  vehId: string | null,
  message: string | null,
): BusArrivalEntryType | null =>
  message === null ? null : { vehId: vehId === '0' ? null : vehId, message };

// 셀 캐시 서빙에 필요한 정류소 필드 (dist 는 쿼리 시점 재계산).
interface CellStation {
  stId: string;
  arsId: string;
  name: string;
  lat: number;
  lng: number;
}

// 쿼리 좌표 → 셀 스냅(0.005° 격자 중심이 아닌 격자점 — 키 일관성만 중요).
const snapToCell = (v: number): number =>
  Math.round(v / NEARBY_CELL_DEG) * NEARBY_CELL_DEG;

// 등거리 사각 근사 거리(m) — 반경 1.5km 내 판정·표시용으로 하버사인 불필요.
const approxDistanceM = (
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number => {
  const mPerLatDeg = 111_320;
  const dLat = (aLat - bLat) * mPerLatDeg;
  const dLng = (aLng - bLng) * mPerLatDeg * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

// 셀 정류소 목록 → 쿼리 지점 기준 반경 필터 + dist 재계산 + 오름차순.
const serveNearby = (
  stations: CellStation[],
  lat: number,
  lng: number,
  radiusM: number,
  fetchedAt: Date,
  source: BusNearbyResultType['source'],
): BusNearbyResultType => {
  const items = stations
    .map((s) => ({ ...s, dist: Math.round(approxDistanceM(lat, lng, s.lat, s.lng)) }))
    .filter((s) => s.dist <= radiusM)
    .sort((a, b) => a.dist - b.dist);
  return {
    items: items.slice(0, MAX_ITEMS),
    total: items.length,
    fetchedAt: fetchedAt.toISOString(),
    source,
  };
};

const toResult = (
  cached: CachedSearch,
  source: 'cache' | 'stale',
): BusStationSearchResultType => ({
  items: cached.hits.slice(0, MAX_ITEMS).map((h) => ({
    stId: h.station.stId,
    arsId: h.station.arsId,
    name: h.station.name,
    lat: h.station.lat,
    lng: h.station.lng,
  })),
  total: cached.hits.length,
  fetchedAt: cached.fetchedAt.toISOString(),
  source,
});

// ── 5차(노선 보기) 정규화 ────────────────────────────────────────────────
// DB payload 에 담기는 정규화 blob — 서빙 시 busRouteId/fetchedAt/source 만 덧댄다.
interface RouteDetailBlob {
  info: BusRouteInfoType;
  path: BusRoutePathPointType[];
  stations: BusRouteStationItemType[];
}

// 연속 공백을 한 칸으로 접고 trim — corpNm('아진교통  02-955-2321') 정리. 비면 null.
const collapseSpaces = (v: string | null): string | null => {
  if (v === null) return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
};

// 'yyyyMMddHHmm(ss)' → 'HH:mm'. 날짜 8자리 뒤 시:분을 취한다(초 유무 무관).
// 공백/자릿수 부족/시분 범위 밖이면 null.
const toHhmm = (v: string | null): string | null => {
  if (v === null) return null;
  const t = v.trim();
  if (!/^\d{12}/.test(t)) return null;
  const hh = t.slice(8, 10);
  const mm = t.slice(10, 12);
  if (Number(hh) > 23 || Number(mm) > 59) return null;
  return `${hh}:${mm}`;
};

const parseFloatOrNull = (v: string | null): number | null => {
  if (v === null) return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const parseIntOrNull = (v: string | null): number | null => {
  if (v === null) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const trimOrNull = (v: string | null): string | null => {
  if (v === null) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

const normalizeRouteInfo = (raw: RawRouteInfo): BusRouteInfoType => ({
  // busRouteAbrv 우선, 비면 busRouteNm, 둘 다 비면 ''.
  routeName: trimOrNull(raw.busRouteAbrv) ?? trimOrNull(raw.busRouteNm) ?? '',
  routeType: raw.routeType ?? '',
  stStationName: raw.stStationNm ?? '',
  edStationName: raw.edStationNm ?? '',
  lengthKm: parseFloatOrNull(raw.length),
  termMin: parseIntOrNull(raw.term),
  firstBusTime: toHhmm(raw.firstBusTm),
  lastBusTime: toHhmm(raw.lastBusTm),
  corpName: collapseSpaces(raw.corpNm),
});

const toRouteResult = (
  busRouteId: string,
  cached: { payload: string; fetchedAt: Date },
  source: 'cache' | 'stale',
): BusRouteDetailResultType => {
  const blob = JSON.parse(cached.payload) as RouteDetailBlob;
  return {
    busRouteId,
    info: blob.info,
    path: blob.path,
    stations: blob.stations,
    fetchedAt: cached.fetchedAt.toISOString(),
    source,
  };
};

export class BusService {
  // 동일 키워드 동시 요청 합류용 — 진행 중 Promise 를 공유하고 finally 에서 제거.
  private readonly inflight = new Map<string, Promise<BusStationSearchResultType>>();
  // Asia/Seoul 날짜 단위 업스트림 호출 카운터 — 단일 인스턴스 전제(메모리).
  private quota = { dateKey: '', count: 0 };
  // 주변 셀 동시 요청 합류 — 같은 셀의 업스트림 수집은 1회만.
  private readonly nearbyInflight = new Map<string, Promise<CellStation[]>>();
  // 실시간(도착/위치) 키 단위 15초 마이크로 캐시 + in-flight 합류 — 동시 폴링의
  // 업스트림 중복콜을 흡수한다(지하철 fetchRealtime 골격 이식). 쿼터는 캐시 미스 시만.
  private readonly realtimeCache = new Map<
    string,
    { data: unknown[]; fetchedAt: Date; expiresAt: number }
  >();
  private readonly realtimeInflight = new Map<
    string,
    Promise<{ data: unknown[]; fetchedAt: Date }>
  >();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: BusServiceDeps,
  ) {}

  async searchStations(q: string, force: boolean): Promise<BusStationSearchResultType> {
    if (!this.deps.serviceKey) {
      throw new BusServiceError(
        'BUS_API_KEY 가 설정되지 않아 버스 정류장 검색을 사용할 수 없습니다.',
        503,
      );
    }

    // 1차 방어는 스키마(BusStationSearchQuery 가 NFC 정규화 후 길이 검증) —
    // 여기는 라우트 밖 호출자 대비 이중 방어 + in-flight/캐시 키 정규화.
    const keyword = q.trim().normalize('NFC');

    const existing = this.inflight.get(keyword);
    if (existing) return existing;
    const task = this.executeSearch(keyword, force).finally(() => {
      this.inflight.delete(keyword);
    });
    this.inflight.set(keyword, task);
    return task;
  }

  private async executeSearch(
    keyword: string,
    force: boolean,
  ): Promise<BusStationSearchResultType> {
    const now = this.deps.now?.() ?? new Date();

    const cached = await this.prisma.busStationSearch.findUnique({
      where: { keyword },
      include: { hits: { include: { station: true }, orderBy: { rank: 'asc' } } },
    });

    if (cached) {
      const ageMs = now.getTime() - cached.fetchedAt.getTime();
      if (!force && ageMs < BUS_SEARCH_TTL_MS) return toResult(cached, 'cache');
      // force 라도 60초 내 재수집은 캐시로 — 갱신 버튼 연타로 한도 소진 방지.
      if (force && ageMs < FORCE_MIN_INTERVAL_MS) return toResult(cached, 'cache');
    }

    // 일일 쿼터 가드 — 한도 초과 시 업스트림 호출 없이 만료 캐시(stale)나 503.
    // consumeQuota 는 초과 시 소비 없이 throw 하므로 stale 폴백이 쿼터를 안 먹는다.
    try {
      this.consumeQuota(now);
    } catch (e) {
      if (cached) return toResult(cached, 'stale');
      throw e;
    }

    const fetchStations = this.deps.adapter?.getStationsByName ?? getStationsByName;
    let raw: RawBusStation[];
    try {
      raw = await fetchStations(keyword, { serviceKey: this.deps.serviceKey });
    } catch (e) {
      // 만료된 캐시라도 있으면 stale 로 반환 — 업스트림 장애에 검색이 통째로
      // 죽는 것보다 오래된 정류소 목록이 낫다.
      if (cached) return toResult(cached, 'stale');
      if (e instanceof BusApiError) throw e; // statusCode 502/503 내장
      throw new BusServiceError(
        e instanceof Error ? e.message : '버스 API 호출 실패',
        502,
        { cause: e },
      );
    }

    // 좌표 정규화 실패(WGS84 범위 밖/누락) 행은 drop — 계약(lat 33~39)을
    // 만족할 수 없어 직렬화에서 어차피 막힌다. stId 중복은 첫 등장(상위 rank)
    // 만 채택 — hits 복합 PK 충돌 방지.
    const seen = new Set<string>();
    const stations: { stId: string; arsId: string; name: string; lat: number; lng: number }[] =
      [];
    for (const r of raw) {
      const coord = toLatLng(r);
      if (!coord || seen.has(r.stId)) continue;
      seen.add(r.stId);
      stations.push({
        stId: r.stId,
        arsId: r.arsId,
        name: r.stNm,
        lat: coord.lat,
        lng: coord.lng,
      });
    }

    // 전량 좌표 정규화 실패 = TM-only 응답 신호 — 빈 결과로 30일 네거티브
    // 캐싱하면 박제되므로 캐시 기록 없이 502 (만료 캐시가 있으면 stale 우선).
    // raw 자체가 빈 경우(진짜 결과 없음)는 아래에서 기존대로 네거티브 캐싱.
    if (raw.length > 0 && stations.length === 0) {
      if (cached) return toResult(cached, 'stale');
      throw new BusServiceError(
        '좌표 정규화 실패 — 서울시 응답이 WGS84 가 아닙니다(좌표계 미지원, probe:bus 확인 필요).',
        502,
      );
    }

    // 빈 결과도 검색 행을 남긴다 — 네거티브 캐싱.
    await this.prisma.$transaction(async (tx) => {
      for (const s of stations) {
        await tx.busStation.upsert({
          where: { stId: s.stId },
          create: s,
          update: { arsId: s.arsId, name: s.name, lat: s.lat, lng: s.lng },
        });
      }
      const search = await tx.busStationSearch.upsert({
        where: { keyword },
        create: { keyword, fetchedAt: now },
        update: { fetchedAt: now },
      });
      await tx.busStationSearchHit.deleteMany({ where: { searchId: search.id } });
      if (stations.length > 0) {
        await tx.busStationSearchHit.createMany({
          data: stations.map((s, i) => ({ searchId: search.id, stId: s.stId, rank: i })),
        });
      }
    });

    return {
      items: stations.slice(0, MAX_ITEMS),
      total: stations.length,
      fetchedAt: now.toISOString(),
      source: 'api',
    };
  }

  // 일일 업스트림 쿼터 소비 — 검색·도착·위치가 공유하는 단일 카운터.
  // 초과 시 소비 없이 503 throw — 검색은 만료 캐시(stale) 폴백을 위해 catch.
  private consumeQuota(now: Date): void {
    const dateKey = seoulDateKey(now);
    if (this.quota.dateKey !== dateKey) this.quota = { dateKey, count: 0 };
    if (this.quota.count >= (this.deps.dailyLimit ?? DEFAULT_DAILY_UPSTREAM_LIMIT)) {
      throw new BusServiceError(
        '서울시 버스 API 일일 호출 한도를 소진해 요청을 처리할 수 없습니다. 내일 다시 시도해주세요.',
        503,
      );
    }
    // 실패해도 호출 시도 자체가 한도를 소모하므로 호출 직전 증가.
    this.quota.count += 1;
  }

  // 실시간 키 1개 — 캐시 히트 시 fetchedAt 보존, 미스는 in-flight 합류(같은 키 동시
  // 요청 업스트림 1콜). 쿼터는 실제 업스트림 직전(미스 확정)에만 소비. 도착/위치 공용.
  private fetchRealtime<T>(
    key: string,
    now: Date,
    load: () => Promise<T[]>,
  ): Promise<{ data: T[]; fetchedAt: Date }> {
    const cached = this.realtimeCache.get(key);
    if (cached) {
      if (now.getTime() <= cached.expiresAt) {
        return Promise.resolve({ data: cached.data as T[], fetchedAt: cached.fetchedAt });
      }
      this.realtimeCache.delete(key); // 만료 청소.
    }

    const existing = this.realtimeInflight.get(key) as
      | Promise<{ data: T[]; fetchedAt: Date }>
      | undefined;
    if (existing) return existing;

    const task = this.loadRealtime(key, now, load).finally(() => {
      this.realtimeInflight.delete(key);
    });
    this.realtimeInflight.set(key, task as Promise<{ data: unknown[]; fetchedAt: Date }>);
    return task;
  }

  private async loadRealtime<T>(
    key: string,
    now: Date,
    load: () => Promise<T[]>,
  ): Promise<{ data: T[]; fetchedAt: Date }> {
    this.consumeQuota(now); // 캐시 미스 확정 — 실제 업스트림 콜 직전에만 쿼터 소비.
    const data = await load();
    this.realtimeCache.set(key, {
      data,
      fetchedAt: now,
      expiresAt: now.getTime() + BUS_REALTIME_MICRO_CACHE_TTL_MS,
    });
    return { data, fetchedAt: now };
  }

  // 좌표 기반 주변 정류장 — 셀(0.005°≈550m) 단위 DB 30일 캐시 프록시.
  // 지도 자동 조회(패닝 시 재조회)를 감당하는 층: 같은 동네는 셀당 한 달에
  // 업스트림 1회. 응답 dist 는 쿼리 지점마다 달라 저장하지 않고 서빙 시
  // 정류소 좌표로 재계산한다.
  async getNearbyStations(
    lat: number,
    lng: number,
    radiusM: number,
  ): Promise<BusNearbyResultType> {
    if (!this.deps.serviceKey) {
      throw new BusServiceError(
        'BUS_API_KEY 가 설정되지 않아 주변 정류장 조회를 사용할 수 없습니다.',
        503,
      );
    }
    const now = this.deps.now?.() ?? new Date();

    const cellLat = snapToCell(lat);
    const cellLng = snapToCell(lng);
    const cellKey = `${cellLat.toFixed(3)},${cellLng.toFixed(3)}`;

    const cached = await this.prisma.busNearbyCell.findUnique({
      where: { cellKey },
      include: { hits: { include: { station: true }, orderBy: { rank: 'asc' } } },
    });
    const cachedStations: CellStation[] | null = cached
      ? cached.hits.map((h) => ({
          stId: h.station.stId,
          arsId: h.station.arsId,
          name: h.station.name,
          lat: h.station.lat,
          lng: h.station.lng,
        }))
      : null;

    if (cached && now.getTime() - cached.fetchedAt.getTime() < BUS_NEARBY_TTL_MS) {
      return serveNearby(cachedStations!, lat, lng, radiusM, cached.fetchedAt, 'cache');
    }

    // 만료/부재 — 셀 재수집. 실패(쿼터 소진 포함) 시 만료 캐시라도 stale 반환.
    let stations: CellStation[];
    try {
      stations = await this.collectNearbyCell(cellKey, cellLat, cellLng, now);
    } catch (e) {
      if (cached) {
        return serveNearby(cachedStations!, lat, lng, radiusM, cached.fetchedAt, 'stale');
      }
      if (e instanceof BusApiError || e instanceof BusServiceError) throw e;
      throw new BusServiceError(
        e instanceof Error ? e.message : '버스 API 호출 실패',
        502,
        { cause: e },
      );
    }
    return serveNearby(stations, lat, lng, radiusM, now, 'api');
  }

  // 셀 업스트림 수집 + DB 반영 — 동일 셀 동시 요청은 in-flight 합류.
  private collectNearbyCell(
    cellKey: string,
    cellLat: number,
    cellLng: number,
    now: Date,
  ): Promise<CellStation[]> {
    const existing = this.nearbyInflight.get(cellKey);
    if (existing) return existing;
    const task = this.executeCollectNearbyCell(cellKey, cellLat, cellLng, now).finally(
      () => {
        this.nearbyInflight.delete(cellKey);
      },
    );
    this.nearbyInflight.set(cellKey, task);
    return task;
  }

  private async executeCollectNearbyCell(
    cellKey: string,
    cellLat: number,
    cellLng: number,
    now: Date,
  ): Promise<CellStation[]> {
    this.consumeQuota(now);

    const fetchNearby = this.deps.adapter?.getStationsByPos ?? getStationsByPos;
    // 셀 중심 + 고정 반경 — 셀 내 어떤 쿼리(반경 ≤1000m)도 커버(주석: 상수 정의).
    const raw = await fetchNearby(cellLng, cellLat, NEARBY_UPSTREAM_RADIUS_M, {
      serviceKey: this.deps.serviceKey,
    });

    // 검색과 동일 정책 — 좌표 정규화 실패 행 drop + stId 중복 첫 등장만.
    const seen = new Set<string>();
    const stations: CellStation[] = [];
    for (const r of raw) {
      const coord = toLatLng(r);
      if (!coord || seen.has(r.stId)) continue;
      seen.add(r.stId);
      stations.push({
        stId: r.stId,
        arsId: r.arsId,
        name: r.stNm,
        lat: coord.lat,
        lng: coord.lng,
      });
    }

    // 전량 좌표 정규화 실패 = 좌표계 이상 신호 — 빈 셀로 30일 박제 금지, 502.
    if (raw.length > 0 && stations.length === 0) {
      throw new BusServiceError(
        '좌표 정규화 실패 — 서울시 응답이 WGS84 가 아닙니다(좌표계 미지원, probe:bus 확인 필요).',
        502,
      );
    }

    // 빈 결과도 셀 행을 남긴다 — 네거티브 캐싱(정류장 없는 지역 반복 호출 방지).
    await this.prisma.$transaction(async (tx) => {
      for (const s of stations) {
        await tx.busStation.upsert({
          where: { stId: s.stId },
          create: s,
          update: { arsId: s.arsId, name: s.name, lat: s.lat, lng: s.lng },
        });
      }
      const cell = await tx.busNearbyCell.upsert({
        where: { cellKey },
        create: { cellKey, fetchedAt: now },
        update: { fetchedAt: now },
      });
      await tx.busNearbyCellHit.deleteMany({ where: { cellId: cell.id } });
      if (stations.length > 0) {
        await tx.busNearbyCellHit.createMany({
          data: stations.map((s, i) => ({ cellId: cell.id, stId: s.stId, rank: i })),
        });
      }
    });

    return stations;
  }

  // 정류소 실시간 도착정보 — 무캐싱 프록시. 캐시가 없어 stale 폴백도 없고,
  // 업스트림 실패는 BusApiError(statusCode 내장) 그대로 라우트에 전달된다.
  async getArrivals(arsId: string): Promise<BusArrivalsResultType> {
    if (!this.deps.serviceKey) {
      throw new BusServiceError(
        'BUS_API_KEY 가 설정되지 않아 버스 도착정보 조회를 사용할 수 없습니다.',
        503,
      );
    }
    const now = this.deps.now?.() ?? new Date();
    const serviceKey = this.deps.serviceKey;
    const fetchArrivals = this.deps.adapter?.getStationArrivals ?? getStationArrivals;
    // 15초 마이크로 캐시 + in-flight 합류 — 동시/연속 폴링의 업스트림 중복콜 흡수.
    const { data, fetchedAt } = await this.fetchRealtime(`arrivals:${arsId}`, now, () =>
      fetchArrivals(arsId, { serviceKey }),
    );

    return {
      arsId,
      items: data.map((r) => ({
        busRouteId: r.busRouteId,
        routeName: r.rtNm ?? '',
        staOrd: r.staOrd,
        first: toArrivalEntry(r.vehId1, r.arrmsg1),
        second: toArrivalEntry(r.vehId2, r.arrmsg2),
      })),
      fetchedAt: fetchedAt.toISOString(),
    };
  }

  // 노선 실시간 버스 위치 — 무캐싱 프록시 (가드/에러 정책은 도착정보와 동일).
  // startOrd/endOrd 지정 시 구간(getBusPosByRouteSt), 둘 다 생략 시 노선 전체
  // (getBusPosByRtid) — 업스트림 둘 다 1콜이라 쿼터 비용 동일. 페어 검증은
  // 라우트 zod(BusPositionsQuery)가 담당하고, 여기선 startOrd 유무만 본다.
  async getPositions(
    busRouteId: string,
    startOrd?: number,
    endOrd?: number,
  ): Promise<BusPositionsResultType> {
    if (!this.deps.serviceKey) {
      throw new BusServiceError(
        'BUS_API_KEY 가 설정되지 않아 버스 위치 조회를 사용할 수 없습니다.',
        503,
      );
    }
    const now = this.deps.now?.() ?? new Date();
    const serviceKey = this.deps.serviceKey;
    // 15초 마이크로 캐시 + in-flight 합류(구간별 키). 쿼터는 캐시 미스 시에만 소비.
    const load = (): Promise<RawBusPosition[]> => {
      if (startOrd !== undefined && endOrd !== undefined) {
        const fetchPositions =
          this.deps.adapter?.getBusPositionsByRouteSt ?? getBusPositionsByRouteSt;
        return fetchPositions(busRouteId, startOrd, endOrd, { serviceKey });
      }
      const fetchAll = this.deps.adapter?.getBusPositionsByRtid ?? getBusPositionsByRtid;
      return fetchAll(busRouteId, { serviceKey });
    };
    const key = `positions:${busRouteId}:${startOrd ?? ''}:${endOrd ?? ''}`;
    const { data: raw, fetchedAt } = await this.fetchRealtime(key, now, load);

    // 검색과 동일 정책 — 좌표 정규화 실패(WGS84 쌍 없음)나 vehId 누락 행은
    // 계약(lat 33~39, vehId min 1)을 만족할 수 없어 drop.
    const items: BusPositionsResultType['items'] = [];
    for (const r of raw) {
      const coord = toLatLng(r);
      if (!coord || r.vehId === null) continue;
      items.push({
        vehId: r.vehId,
        plainNo: r.plainNo,
        lat: coord.lat,
        lng: coord.lng,
        sectOrd: r.sectOrd,
        stopFlag: r.stopFlag,
      });
    }

    return { busRouteId, items, fetchedAt: fetchedAt.toISOString() };
  }

  // 노선 상세 — 형상+경유 정류소+기본정보 합본. busRouteInfo 3콜을 한 번에
  // 수집해 정규화 blob 을 DB 30일 캐싱한다(노선당 최초 1회만 업스트림, 쿼터 3).
  // 실패/쿼터 소진 시 만료 캐시라도 있으면 stale — 검색·주변과 동일 정책.
  async getRouteDetail(busRouteId: string): Promise<BusRouteDetailResultType> {
    if (!this.deps.serviceKey) {
      throw new BusServiceError(
        'BUS_API_KEY 가 설정되지 않아 노선 조회를 사용할 수 없습니다.',
        503,
      );
    }
    const now = this.deps.now?.() ?? new Date();

    const cached = await this.prisma.busRouteShape.findUnique({ where: { busRouteId } });
    if (cached && now.getTime() - cached.fetchedAt.getTime() < BUS_ROUTE_TTL_MS) {
      return toRouteResult(busRouteId, cached, 'cache');
    }

    // 3콜분 쿼터를 한 번에 소비 — 중간에 소진돼 1콜만 하고 실패하는 걸 막는다.
    // 소진 시 만료 캐시가 있으면 stale, 없으면 503(consumeQuota throw).
    try {
      this.consumeQuota(now);
      this.consumeQuota(now);
      this.consumeQuota(now);
    } catch (e) {
      if (cached) return toRouteResult(busRouteId, cached, 'stale');
      throw e;
    }

    let blob: RouteDetailBlob;
    try {
      blob = await this.collectRouteDetail(busRouteId);
    } catch (e) {
      // 업스트림/정규화 실패 — 만료 캐시라도 있으면 stale 로 가용성 우선.
      if (cached) return toRouteResult(busRouteId, cached, 'stale');
      if (e instanceof BusApiError || e instanceof BusServiceError) throw e;
      throw new BusServiceError(
        e instanceof Error ? e.message : '버스 API 호출 실패',
        502,
        { cause: e },
      );
    }

    await this.prisma.busRouteShape.upsert({
      where: { busRouteId },
      create: { busRouteId, payload: JSON.stringify(blob), fetchedAt: now },
      update: { payload: JSON.stringify(blob), fetchedAt: now },
    });

    return {
      busRouteId,
      info: blob.info,
      path: blob.path,
      stations: blob.stations,
      fetchedAt: now.toISOString(),
      source: 'api',
    };
  }

  // 업스트림 3콜 + 정규화. 쿼터는 호출측(getRouteDetail)이 이미 소비했다.
  private async collectRouteDetail(busRouteId: string): Promise<RouteDetailBlob> {
    const fetchPath = this.deps.adapter?.getRoutePath ?? getRoutePath;
    const fetchStations = this.deps.adapter?.getStationsByRoute ?? getStationsByRoute;
    const fetchInfo = this.deps.adapter?.getRouteInfo ?? getRouteInfo;
    const key = { serviceKey: this.deps.serviceKey };

    const [rawPath, rawStations, rawInfo] = await Promise.all([
      fetchPath(busRouteId, key),
      fetchStations(busRouteId, key),
      fetchInfo(busRouteId, key),
    ]);

    // 기본정보가 없으면 사실상 존재하지 않는 노선 — 계약상 info 는 필수라 502.
    if (!rawInfo) {
      throw new BusServiceError('해당 노선 정보를 찾을 수 없습니다.', 502);
    }

    // 형상: no 오름차순 + 좌표 정규화 실패 점 drop(검색과 동일 정책).
    const path: BusRoutePathPointType[] = [...rawPath]
      .sort((a, b) => (a.no ?? Number.POSITIVE_INFINITY) - (b.no ?? Number.POSITIVE_INFINITY))
      .map((p) => toLatLng(p))
      .filter((c): c is BusRoutePathPointType => c !== null);

    // 정류소: seq 오름차순 + 좌표/seq 없는 행 drop. isTurnPoint=transYn 'Y'.
    const stations: BusRouteStationItemType[] = [...rawStations]
      .sort((a, b) => (a.seq ?? Number.POSITIVE_INFINITY) - (b.seq ?? Number.POSITIVE_INFINITY))
      .map((s): BusRouteStationItemType | null => {
        const coord = toLatLng(s);
        if (!coord || s.seq === null) return null;
        return {
          seq: s.seq,
          stId: s.stId,
          arsId: s.arsId,
          name: s.stNm,
          lat: coord.lat,
          lng: coord.lng,
          direction: s.direction ?? '',
          isTurnPoint: s.transYn === 'Y',
        };
      })
      .filter((s): s is BusRouteStationItemType => s !== null);

    return { info: normalizeRouteInfo(rawInfo), path, stations };
  }
}
