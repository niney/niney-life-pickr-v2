import { Prisma, type HousingComplex, type HousingComplexPrice, type HousingComplexStat, type PrismaClient } from '@prisma/client';
import type {
  HousingAreaBandType,
  HousingBandStatType,
  HousingComplexDetailType,
  HousingInfraType,
  HousingComplexSummaryType,
  HousingDealTypeType,
  HousingFallbackDealType,
  HousingLatestDealType,
  HousingNearbyQueryType,
  HousingNearbyResultType,
  HousingOfficialGlanceType,
  HousingOfficialPriceType,
  HousingPointsQueryType,
  HousingPointsResultType,
  HousingSearchResultType,
  HousingStatusResultType,
  HousingTradeType,
  HousingTradesQueryType,
  HousingTradesResultType,
} from '@repo/api-contract';
import {
  HOUSING_AREA_BANDS,
  HOUSING_AREA_BAND_RANGE,
  HOUSING_POINTS_MAX,
  HOUSING_POINT_MIN_ZOOM,
  LIFE_CELL_ORIGIN,
  computeBboxAround,
  haversineM,
  LIFE_STORE_INFRA_RADIUS_M,
  isHousingAreaBand,
  isHousingComplexKind,
  isHousingDealType,
  type HousingAreaBandStrict,
} from '@repo/utils';
import { LRUCache } from 'lru-cache';
import {
  CELL_CACHE_MAX_UNITS,
  POINTS_DEMOTE_COUNT,
  cellGrid,
  cellKeyOf,
  cellResultSize,
  pointsSpanOk,
} from '../../lib/map-cells.js';
import { HousingFloodIndex } from './housing-flood.service.js';

// 집값 조회 — 로컬 SQLite(HousingComplex ≈4.6만 / HousingComplexStat / HousingComplexPrice / HousingTrade
// 수백만)만 읽는다. 업스트림 없음. 지도 배지·주변·상세 통계는 파생 표(HousingComplexStat: 단지 × 유형 ×
// 구간 + 단지당 폴백 행 'any/all')와 공시가격 표(HousingComplexPrice: 단지 × 구간)만 조인하고, 거래 표는
// 단지 상세의 거래 목록에서만 읽는다. 침수 흔적(상세 flood·점 flood 개수)은 LifeFloodTrace 메모리 격자 색인
// (HousingFloodIndex — 요청 시점 단지 좌표 반경 100m, 적재가 바뀌면 다시 올림).
//
// 뷰포트 조회는 일상지도와 같은 두 모드: 줌이 임계(HOUSING_POINT_MIN_ZOOM) 이상이고 bbox 가 그 줌의
// 화면 크기 안(lib/map-cells pointsSpanOk)이면 단지별 점(배지값 = 축의 최근 거래, 상한 HOUSING_POINTS_MAX +
// truncated — 잘릴 때는 세대수 작은 순, 아래 points 참고), 아니면 전국 고정 원점 도(°) 격자로 GROUP BY 한
// 셀(단지 수·거래 있는 단지 수·그 단지들의 최근 거래 단위가 평균). 셀은 bbox 를 셀 경계로 정렬한 키로 LRU
// 10분 캐시(셀 수 상한) — 통계가 재계산되면 sync id 가 바뀌어 키가 갈린다.
//
// 지도 원시 SQL 은 좌표 인덱스를 INDEXED BY 로 고정한다: kind 는 'apt' 단일값인데 통계(sqlite_stat1)가 없으면
// 플래너가 (kind, households) 인덱스를 골라 4.7만 단지를 전부 룩업한다(points z15 207→3ms, D-5).
//
// 축에 거래가 없는 단지의 보강 순서(점·주변 목록 공통): fallback(다른 유형·전체 면적의 마지막 거래) →
// official(전체 면적 공시가격 중위) → 없음. 둘 다 축에 거래가 있으면 채우지 않는다(fallback 은 null,
// official 은 있으면 항상 실어 상세 없이도 배지 옆에 쓸 수 있게).

export class HousingServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'HousingServiceError';
  }
}

// 지도 원시 SQL 이 INDEXED BY 로 고정하는 좌표 인덱스 — 이름이 바뀌면 쿼리가 오류가 되므로 테스트가 고정한다.
export const HOUSING_COMPLEX_COORD_INDEX = 'housing_complexes_lat_lng_idx';
const COORD_INDEX = Prisma.raw(`"${HOUSING_COMPLEX_COORD_INDEX}"`);
const CELL_CACHE_TTL_MS = 10 * 60_000;
const CELL_CACHE_MAX = 300;
// /housing/status 집계 재사용 — 적재 이력(sync id·거래 장부 시각)이 그대로면 다시 세지 않는다. 이력에 안 남는 변화
// (단지 행 직접 수정 등)는 이 나이가 지나면 다시 센다.
const STATUS_MAX_AGE_MS = 10 * 60_000;
const STATUS_SYNC_KINDS = ['complex', 'stats', 'prices', 'kapt', 'buildings', 'geocode'] as const;
// 단지 생활 인프라(반경 개수) 캐시 — 상가·병의원 표는 분기/월 단위로만 바뀐다. 키는 단지 id.
const INFRA_CACHE_TTL_MS = 10 * 60_000;
const INFRA_CACHE_MAX = 2000;
// LifeStore 에서 세는 인프라 항목(병원은 LifeHospital).
const INFRA_STORE_KINDS = ['convenience', 'mart', 'cafe', 'food', 'academy', 'pharmacy'] as const;
const LOAD_HINT = 'pnpm --filter friendly load:housing-complexes 실행 필요';
// 폴백 통계 행의 키 — rebuildHousingStats 가 만드는 dealType/band.
const ANY_DEAL_TYPE = 'any';
const ALL_BAND = 'all';

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

type LatestSource = Pick<HousingComplexStat, 'latestPrice' | 'latestRent' | 'latestArea' | 'latestFloor' | 'latestDate'>;
const toLatest = (s: LatestSource): HousingLatestDealType => ({
  price: s.latestPrice,
  rent: s.latestRent,
  area: s.latestArea,
  floor: s.latestFloor,
  dealDate: s.latestDate,
});

// 폴백 행 → 계약. latestDealType 이 유형 밖(손상)이면 폴백 없음으로 본다.
const toFallback = (f: HousingComplexStat | null | undefined): HousingFallbackDealType | null =>
  f && isHousingDealType(f.latestDealType) ? { ...toLatest(f), dealType: f.latestDealType } : null;

const toOfficialGlance = (p: HousingComplexPrice | null | undefined): HousingOfficialGlanceType | null =>
  p ? { year: p.year, median: p.median, count: p.count } : null;

const toOfficialPrice = (p: HousingComplexPrice): HousingOfficialPriceType => ({
  band: isHousingAreaBand(p.band) ? p.band : 'all',
  year: p.year,
  count: p.count,
  median: p.median,
  min: p.min,
  max: p.max,
  avgArea: p.avgArea,
});

const toBandStat = (s: HousingComplexStat): HousingBandStatType => ({
  band: s.band as HousingAreaBandType,
  latest: toLatest(s),
  count12: s.count12,
  count: s.count,
  unitPrice12: s.unitPrice12,
});

interface SummaryExtras {
  stat: HousingComplexStat | undefined;
  any: HousingComplexStat | undefined;
  price: HousingComplexPrice | undefined;
}
const toSummary = (c: HousingComplex, x: SummaryExtras): HousingComplexSummaryType => ({
  id: c.id,
  name: c.name,
  kind: isHousingComplexKind(c.kind) ? c.kind : 'apt',
  addr: c.addr,
  lat: c.lat,
  lng: c.lng,
  households: c.households,
  dongCount: c.dongCount,
  approvedDate: c.approvedDate,
  latest: x.stat ? toLatest(x.stat) : null,
  count12: x.stat?.count12 ?? 0,
  fallback: x.stat ? null : toFallback(x.any),
  official: toOfficialGlance(x.price),
  saleType: c.saleType,
});

const areaWhere = (band: HousingAreaBandType): Prisma.HousingTradeWhereInput => {
  if (band === 'all') return {};
  const r = HOUSING_AREA_BAND_RANGE[band as HousingAreaBandStrict];
  return { area: { gt: r.min, ...(r.max !== null ? { lte: r.max } : {}) } };
};

const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const bandOrder = (band: string): number => HOUSING_AREA_BANDS.indexOf(band as HousingAreaBandType);

export interface HousingServiceDeps {
  prisma: PrismaClient;
  now?: () => Date;
  // 점 모드 강등 기준(기본 POINTS_DEMOTE_COUNT) — 테스트 주입용.
  pointsDemoteCount?: number;
}

type HousingStatusBody = Omit<HousingStatusResultType, 'fetchedAt'>;

export class HousingService {
  private readonly cellCache = new LRUCache<string, HousingPointsResultType>({
    max: CELL_CACHE_MAX,
    maxSize: CELL_CACHE_MAX_UNITS,
    sizeCalculation: cellResultSize,
    ttl: CELL_CACHE_TTL_MS,
  });
  private readonly infraCache = new LRUCache<string, HousingInfraType>({ max: INFRA_CACHE_MAX, ttl: INFRA_CACHE_TTL_MS });
  private statusMemo: { key: string; at: number; value: HousingStatusBody } | null = null;
  private statusInflight: Promise<HousingStatusBody> | null = null;
  // 침수 흔적 색인(서울시 침수흔적도) — 상세 flood·지도 점 flood 개수.
  private readonly flood: HousingFloodIndex;

  constructor(private readonly deps: HousingServiceDeps) {
    this.flood = new HousingFloodIndex(deps.prisma, () => this.now().getTime());
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private latestSync(kind: string) {
    return this.deps.prisma.housingSync.findFirst({ where: { kind }, orderBy: { loadedAt: 'desc' } });
  }

  // 미적재 = 503 + 적재 명령 안내(일상지도·지하철 마스터 규약). fetchedAt 은 통계 시각(없으면 단지 적재 시각).
  private async requireLoaded(): Promise<{ syncId: number; fetchedAt: string }> {
    const complex = await this.latestSync('complex');
    if (!complex) throw new HousingServiceError(`집값 단지 데이터가 적재되지 않았습니다 — ${LOAD_HINT}`, 503);
    const stats = await this.latestSync('stats');
    return { syncId: stats?.id ?? complex.id, fetchedAt: (stats ?? complex).loadedAt.toISOString() };
  }

  // 무인증 /housing/status — 예전엔 요청마다 COUNT 풀스캔 5개 포함 13쿼리(~0.7초, D-6). 적재 이력 키(최신 sync id 6종 +
  // 거래 장부 최신 시각)가 그대로면 이전 집계를 쓰고(확인 7쿼리, 수 ms), 동시 요청은 한 번만 센다.
  async getStatus(): Promise<HousingStatusResultType> {
    this.statusInflight ??= this.loadStatus().finally(() => {
      this.statusInflight = null;
    });
    const body = await this.statusInflight;
    return { ...body, fetchedAt: this.now().toISOString() };
  }

  private async loadStatus(): Promise<HousingStatusBody> {
    const prisma = this.deps.prisma;
    const [syncs, ledgerAt] = await Promise.all([
      Promise.all(STATUS_SYNC_KINDS.map((k) => this.latestSync(k))),
      prisma.housingTradeSync.aggregate({ _max: { fetchedAt: true } }),
    ]);
    const key = [...syncs.map((s) => s?.id ?? 0), ledgerAt._max.fetchedAt?.getTime() ?? 0].join('|');
    const nowMs = this.now().getTime();
    const memo = this.statusMemo;
    if (memo && memo.key === key && nowMs - memo.at < STATUS_MAX_AGE_MS) return memo.value;

    const [complex, stats, pricesSync, kaptSync, buildingsSync] = syncs;
    // 단지 수·보강 수 — 표 한 번 스캔. +kind 로 (kind, households) 인덱스를 끈다('apt' 단일값이라 타면 행마다 룩업).
    const [c] = await prisma.$queryRaw<{ n: unknown; geocoded: unknown; kapt: unknown; fetched: unknown; pnu: unknown }[]>(
      Prisma.sql`SELECT COUNT(*) AS n, COUNT("lat") AS geocoded, COUNT("kaptCode") AS kapt,
                        COUNT("buildingFetchedAt") AS fetched, COUNT("pnu") AS pnu
                 FROM "housing_complexes" WHERE +"kind" = 'apt'`,
    );
    const count = complex ? Number(c?.n ?? 0) : 0;
    const geocoded = complex ? Number(c?.geocoded ?? 0) : 0;
    const kaptMatched = Number(c?.kapt ?? 0);
    const buildingsFetched = Number(c?.fetched ?? 0);
    const buildingsTotal = Number(c?.pnu ?? 0);
    const ledger = async (dealTypes: string[]) => {
      const agg = await prisma.housingTradeSync.aggregate({
        where: { dealType: { in: dealTypes } },
        _sum: { count: true },
        _min: { dealYm: true },
        _max: { dealYm: true, fetchedAt: true },
      });
      const loaded = agg._max.dealYm !== null;
      return {
        loaded,
        count: agg._sum.count ?? 0,
        fromYm: agg._min.dealYm,
        toYm: agg._max.dealYm,
        loadedAt: agg._max.fetchedAt?.toISOString() ?? null,
      };
    };
    // 보강 — 공시가격은 'all' 행 수가 곧 단지 수, K-apt 는 단지코드가 붙은 수, 건축물대장은 조회한 수/PNU 보유 수.
    const [trades, rents, priceAgg] = await Promise.all([
      ledger(['trade']),
      ledger(['jeonse', 'monthly']),
      prisma.housingComplexPrice.aggregate({ where: { band: ALL_BAND }, _count: { complexId: true }, _max: { year: true } }),
    ]);
    const value: HousingStatusBody = {
      complexes: {
        loaded: complex !== null,
        count,
        geocoded,
        baseDate: complex?.baseDate ?? null,
        loadedAt: complex?.loadedAt.toISOString() ?? null,
      },
      trades,
      rents,
      statsAt: stats?.loadedAt.toISOString() ?? null,
      officialPrices: {
        loaded: pricesSync !== null,
        year: priceAgg._max.year,
        complexes: priceAgg._count.complexId,
        loadedAt: pricesSync?.loadedAt.toISOString() ?? null,
      },
      kapt: { loaded: kaptSync !== null, matched: kaptMatched, loadedAt: kaptSync?.loadedAt.toISOString() ?? null },
      buildings: { fetched: buildingsFetched, total: buildingsTotal, loadedAt: buildingsSync?.loadedAt.toISOString() ?? null },
    };
    this.statusMemo = { key, at: nowMs, value };
    return value;
  }

  async getPoints(q: HousingPointsQueryType): Promise<HousingPointsResultType> {
    const { syncId, fetchedAt } = await this.requireLoaded();
    const bbox = parseBbox(q.bbox);
    const zoom = Math.floor(q.zoom);
    if (zoom >= HOUSING_POINT_MIN_ZOOM && pointsSpanOk(zoom, bbox)) {
      // 일상지도와 같은 규약 — 먼저 세고, 정상 화면이 닿지 않는 밀도면 셀로 강등. total 은 이 COUNT.
      const total = await this.countIn(bbox);
      if (total <= (this.deps.pointsDemoteCount ?? POINTS_DEMOTE_COUNT)) {
        return this.points(bbox, q.dealType, q.band, fetchedAt, total);
      }
    }
    return this.cells(zoom, bbox, q.dealType, q.band, syncId, fetchedAt);
  }

  private async countIn(b: Bbox): Promise<number> {
    const rows = await this.deps.prisma.$queryRaw<{ n: unknown }[]>(
      Prisma.sql`SELECT COUNT(*) AS n FROM "housing_complexes" INDEXED BY ${COORD_INDEX}
                 WHERE "kind" = 'apt' AND "lat" >= ${b.minLat} AND "lat" <= ${b.maxLat}
                   AND "lng" >= ${b.minLng} AND "lng" <= ${b.maxLng}`,
    );
    return Number(rows[0]?.n ?? 0);
  }

  // 점 — 박스 안 단지를 세대수 작은 순(없으면 앞, 같으면 rowid)으로 상한까지. 예전엔 플래너가 고른 (kind, households)
  // 인덱스 순서가 그대로 잘림 표본·응답 순서(배지 겹침 순서)가 됐다 — 좌표 인덱스로 바꾸면 위도 순(화면 남쪽 띠)이
  // 되므로 같은 순서를 명시한다. 정렬은 단지 표만 도는 하위 질의에서 하고, 통계·공시가격 조인은 잘린 뒤에만.
  private async points(
    bbox: Bbox,
    dealType: HousingDealTypeType,
    band: HousingAreaBandType,
    fetchedAt: string,
    total: number,
  ): Promise<HousingPointsResultType> {
    const rows = await this.deps.prisma.$queryRaw<
      {
        id: string;
        lat: number;
        lng: number;
        name: string;
        sggCd: string;
        households: unknown;
        saleType: string | null;
        latestPrice: unknown;
        latestRent: unknown;
        latestArea: unknown;
        latestFloor: unknown;
        latestDate: string | null;
        anyPrice: unknown;
        anyRent: unknown;
        anyArea: unknown;
        anyFloor: unknown;
        anyDate: string | null;
        anyType: string | null;
        prYear: unknown;
        prMedian: unknown;
        prCount: unknown;
      }[]
    >(Prisma.sql`SELECT c."id", c."lat", c."lng", c."name", c."sggCd", c."households", c."saleType",
                        s."latestPrice", s."latestRent", s."latestArea", s."latestFloor", s."latestDate",
                        f."latestPrice" AS "anyPrice", f."latestRent" AS "anyRent", f."latestArea" AS "anyArea",
                        f."latestFloor" AS "anyFloor", f."latestDate" AS "anyDate", f."latestDealType" AS "anyType",
                        p."year" AS "prYear", p."median" AS "prMedian", p."count" AS "prCount"
                 FROM (SELECT "id", "lat", "lng", "name", "sggCd", "households", "saleType", rowid AS "rid"
                       FROM "housing_complexes" INDEXED BY ${COORD_INDEX}
                       WHERE "kind" = 'apt' AND "lat" >= ${bbox.minLat} AND "lat" <= ${bbox.maxLat}
                         AND "lng" >= ${bbox.minLng} AND "lng" <= ${bbox.maxLng}
                       ORDER BY "households", rowid
                       LIMIT ${HOUSING_POINTS_MAX + 1}) c
                 LEFT JOIN "housing_complex_stats" s ON s."complexId" = c."id" AND s."dealType" = ${dealType} AND s."band" = ${band}
                 LEFT JOIN "housing_complex_stats" f ON f."complexId" = c."id" AND f."dealType" = ${ANY_DEAL_TYPE} AND f."band" = ${ALL_BAND}
                 LEFT JOIN "housing_complex_prices" p ON p."complexId" = c."id" AND p."band" = ${ALL_BAND}
                 ORDER BY c."households", c."rid"`);
    const truncated = rows.length > HOUSING_POINTS_MAX;
    const flood = await this.flood.ensure();
    const items = (truncated ? rows.slice(0, HOUSING_POINTS_MAX) : rows).map((r) => {
      const latest =
        r.latestPrice === null || r.latestPrice === undefined || r.latestDate === null
          ? null
          : {
              price: Number(r.latestPrice),
              rent: Number(r.latestRent ?? 0),
              area: Number(r.latestArea),
              floor: numOrNull(r.latestFloor),
              dealDate: r.latestDate,
            };
      const fallback: HousingFallbackDealType | null =
        latest === null && r.anyPrice !== null && r.anyPrice !== undefined && r.anyDate !== null && isHousingDealType(r.anyType)
          ? {
              price: Number(r.anyPrice),
              rent: Number(r.anyRent ?? 0),
              area: Number(r.anyArea),
              floor: numOrNull(r.anyFloor),
              dealDate: r.anyDate,
              dealType: r.anyType,
            }
          : null;
      const official: HousingOfficialGlanceType | null =
        r.prMedian === null || r.prMedian === undefined
          ? null
          : { year: Number(r.prYear), median: Number(r.prMedian), count: Number(r.prCount ?? 0) };
      return {
        id: r.id,
        lat: Number(r.lat),
        lng: Number(r.lng),
        name: r.name,
        households: numOrNull(r.households),
        latest,
        fallback,
        official,
        saleType: r.saleType ?? null,
        flood:
          flood && HousingFloodIndex.covers(flood, r.sggCd) ? HousingFloodIndex.countNear(flood, Number(r.lat), Number(r.lng)) : null,
      };
    });
    return { mode: 'points', dealType, band, items, cells: [], total, truncated, minPointZoom: HOUSING_POINT_MIN_ZOOM, fetchedAt };
  }

  // 집계 셀 — 일상지도와 같은 전국 고정 원점 격자(bbox 셀 경계 바깥 정렬)이되 한 칸을 **두 배**(화면
  // ~128px)로 잡는다: 알약(평당가 글자 ~60~80px)이 일상지도의 숫자 버블보다 넓어 64px 칸에선 이웃과
  // 겹친다(2026-08-30 실화면 확인). 단지 수·거래 있는 단지 수·최근 거래 단위가(만원/㎡) 평균. 셀 수가 상한을
  // 넘으면 셀을 키운다(cellGrid — 캐시 키도 실제 쓴 줌).
  private async cells(
    zoom: number,
    bbox: Bbox,
    dealType: HousingDealTypeType,
    band: HousingAreaBandType,
    syncId: number,
    fetchedAt: string,
  ): Promise<HousingPointsResultType> {
    const grid = cellGrid(zoom, bbox, { zoomOffset: -1 });
    const { dLng, dLat, q } = grid;
    const o = LIFE_CELL_ORIGIN;
    const key = `${cellKeyOf(grid)}|${dealType}|${band}|${syncId}`;
    const hit = this.cellCache.get(key);
    if (hit) return hit;
    const rows = await this.deps.prisma.$queryRaw<
      { cx: unknown; cy: unknown; n: unknown; traded: unknown; unit: unknown; lat: unknown; lng: unknown }[]
    >(Prisma.sql`SELECT CAST((c."lng" - ${o.lng}) / ${dLng} AS INTEGER) AS cx,
                        CAST((c."lat" - ${o.lat}) / ${dLat} AS INTEGER) AS cy,
                        COUNT(*) AS n,
                        SUM(CASE WHEN s."latestPrice" IS NOT NULL THEN 1 ELSE 0 END) AS traded,
                        AVG(CASE WHEN s."latestPrice" IS NOT NULL THEN s."latestPrice" * 1.0 / s."latestArea" END) AS unit,
                        AVG(c."lat") AS lat, AVG(c."lng") AS lng
                 FROM "housing_complexes" AS c INDEXED BY ${COORD_INDEX}
                 LEFT JOIN "housing_complex_stats" s ON s."complexId" = c."id" AND s."dealType" = ${dealType} AND s."band" = ${band}
                 WHERE c."kind" = 'apt' AND c."lat" >= ${q.minLat} AND c."lat" <= ${q.maxLat}
                   AND c."lng" >= ${q.minLng} AND c."lng" <= ${q.maxLng}
                 GROUP BY cx, cy`);
    const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
    const cells = rows
      .map((r) => {
        const cx = Number(r.cx);
        const cy = Number(r.cy);
        const centerLng = o.lng + (cx + 0.5) * dLng;
        const centerLat = o.lat + (cy + 0.5) * dLat;
        const unit = r.unit === null || r.unit === undefined ? null : Number(r.unit);
        return {
          lat: clamp(Number(r.lat), centerLat - 0.15 * dLat, centerLat + 0.15 * dLat),
          lng: clamp(Number(r.lng), centerLng - 0.15 * dLng, centerLng + 0.15 * dLng),
          count: Number(r.n),
          traded: Number(r.traded ?? 0),
          unitPrice: unit !== null && Number.isFinite(unit) ? unit : null,
        };
      })
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.count > 0);
    const result: HousingPointsResultType = {
      mode: 'cells',
      dealType,
      band,
      items: [],
      cells,
      total: cells.reduce((acc, c) => acc + c.count, 0),
      truncated: false,
      minPointZoom: HOUSING_POINT_MIN_ZOOM,
      fetchedAt,
    };
    this.cellCache.set(key, result);
    return result;
  }

  // 요약에 필요한 보조 행 — 축 통계 + 폴백('any/all') 통계 + 전체 면적 공시가격을 id 목록으로 한 번에.
  private async extrasFor(
    ids: string[],
    dealType: HousingDealTypeType,
    band: HousingAreaBandType,
  ): Promise<Map<string, SummaryExtras>> {
    const out = new Map<string, SummaryExtras>();
    for (const id of ids) out.set(id, { stat: undefined, any: undefined, price: undefined });
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const [stats, prices] = await Promise.all([
        this.deps.prisma.housingComplexStat.findMany({
          where: {
            complexId: { in: chunk },
            OR: [{ dealType, band }, { dealType: ANY_DEAL_TYPE, band: ALL_BAND }],
          },
        }),
        this.deps.prisma.housingComplexPrice.findMany({ where: { complexId: { in: chunk }, band: ALL_BAND } }),
      ]);
      for (const s of stats) {
        const x = out.get(s.complexId);
        if (!x) continue;
        if (s.dealType === ANY_DEAL_TYPE) x.any = s;
        else x.stat = s;
      }
      for (const p of prices) {
        const x = out.get(p.complexId);
        if (x) x.price = p;
      }
    }
    return out;
  }

  // 좌표 기준 거리순 — 등거리 근사 bbox 로 후보를 좁힌 뒤 하버사인 거리로 반경 필터·정렬.
  async getNearby(q: HousingNearbyQueryType): Promise<HousingNearbyResultType> {
    const { fetchedAt } = await this.requireLoaded();
    const center = { lat: q.lat, lng: q.lng };
    const degLat = q.radius / 111_320;
    const degLng = q.radius / (111_320 * Math.cos((q.lat * Math.PI) / 180));
    const rows = await this.deps.prisma.housingComplex.findMany({
      where: {
        kind: 'apt',
        lat: { gte: q.lat - degLat, lte: q.lat + degLat },
        lng: { gte: q.lng - degLng, lte: q.lng + degLng },
      },
    });
    const inRadius = rows
      .flatMap((c) => (c.lat !== null && c.lng !== null ? [{ c, dist: Math.round(haversineM(center, { lat: c.lat, lng: c.lng })) }] : []))
      .filter((x) => x.dist <= q.radius)
      .sort((a, b) => a.dist - b.dist || a.c.name.localeCompare(b.c.name));
    const page = inRadius.slice(0, q.limit);
    const extras = await this.extrasFor(
      page.map((x) => x.c.id),
      q.dealType,
      q.band,
    );
    const empty: SummaryExtras = { stat: undefined, any: undefined, price: undefined };
    return {
      center,
      dealType: q.dealType,
      band: q.band,
      items: page.map((x) => ({ ...toSummary(x.c, extras.get(x.c.id) ?? empty), dist: x.dist })),
      total: inRadius.length,
      fetchedAt,
    };
  }

  // 단지명 검색 — name·altNames 부분 일치, 세대수 큰 순(없으면 뒤).
  async search(q: string, limit: number): Promise<HousingSearchResultType> {
    const { fetchedAt } = await this.requireLoaded();
    const rows = await this.deps.prisma.housingComplex.findMany({
      where: { kind: 'apt', OR: [{ name: { contains: q } }, { altNames: { contains: q } }] },
      orderBy: [{ households: 'desc' }, { name: 'asc' }],
      take: limit,
    });
    return {
      q,
      items: rows.map((c) => ({ id: c.id, name: c.name, addr: c.addr, lat: c.lat, lng: c.lng, households: c.households })),
      fetchedAt,
    };
  }

  // 생활 인프라 — 단지 좌표 반경 500m 안 상가(LifeStore, kind 별)·병의원(LifeHospital) 개수. bbox(위도 ±500m,
  // 경도 cos 보정 — computeBboxAround)로 인덱스 범위를 좁힌 뒤 haversine 으로 원 안만 센다. 상가 미적재면
  // 0 + baseDate null(상세가 깨지지 않게). 좌표 없는 단지는 호출자가 null 로 둔다.
  private async getInfra(id: string, lat: number, lng: number): Promise<HousingInfraType> {
    const cached = this.infraCache.get(id);
    if (cached) return cached;
    const center = { lat, lng };
    const b = computeBboxAround(center, LIFE_STORE_INFRA_RADIUS_M / 1000);
    const range = { lat: { gte: b.minLat, lte: b.maxLat }, lng: { gte: b.minLng, lte: b.maxLng } };
    const [stores, hospitals, sync] = await Promise.all([
      this.deps.prisma.lifeStore.findMany({
        where: { ...range, kind: { in: [...INFRA_STORE_KINDS] } },
        select: { kind: true, lat: true, lng: true },
      }),
      this.deps.prisma.lifeHospital.findMany({ where: range, select: { lat: true, lng: true } }),
      this.deps.prisma.lifeMasterSync.findFirst({ where: { layer: 'store' }, orderBy: { loadedAt: 'desc' } }),
    ]);
    const within = (p: { lat: number | null; lng: number | null }): boolean =>
      p.lat !== null && p.lng !== null && haversineM(center, { lat: p.lat, lng: p.lng }) <= LIFE_STORE_INFRA_RADIUS_M;
    const counts: HousingInfraType['counts'] = { convenience: 0, mart: 0, cafe: 0, food: 0, academy: 0, hospital: 0, pharmacy: 0 };
    for (const s of stores) {
      if (!within(s)) continue;
      const k = s.kind as (typeof INFRA_STORE_KINDS)[number];
      if (k in counts) counts[k] += 1;
    }
    for (const h of hospitals) if (within(h)) counts.hospital += 1;
    const infra: HousingInfraType = { radiusM: LIFE_STORE_INFRA_RADIUS_M, baseDate: sync?.baseDate ?? null, counts };
    this.infraCache.set(id, infra);
    return infra;
  }

  async getComplex(id: string): Promise<HousingComplexDetailType> {
    const c = await this.deps.prisma.housingComplex.findUnique({ where: { id } });
    if (!c) throw new HousingServiceError('해당 단지를 찾을 수 없습니다.', 404);
    const [stats, prices, infra, flood] = await Promise.all([
      this.deps.prisma.housingComplexStat.findMany({ where: { complexId: id } }),
      this.deps.prisma.housingComplexPrice.findMany({ where: { complexId: id } }),
      c.lat !== null && c.lng !== null ? this.getInfra(id, c.lat, c.lng) : Promise.resolve(null),
      c.lat !== null && c.lng !== null ? this.flood.detailFor(c.lat, c.lng, c.sggCd) : Promise.resolve(null),
    ]);
    // 폴백 행('any')은 유형별 표에 들지 않는다 — dealType 정확 일치로 자연히 빠진다.
    const byType = (dealType: HousingDealTypeType): HousingBandStatType[] =>
      stats
        .filter((s) => s.dealType === dealType)
        .sort((a, b) => bandOrder(a.band) - bandOrder(b.band))
        .map(toBandStat);
    return {
      id: c.id,
      name: c.name,
      altNames: c.altNames ? c.altNames.split('|').filter(Boolean) : [],
      kind: isHousingComplexKind(c.kind) ? c.kind : 'apt',
      addr: c.addr,
      sido: c.sido,
      sgg: c.sgg,
      umd: c.umd,
      pnu: c.pnu,
      households: c.households,
      dongCount: c.dongCount,
      approvedDate: c.approvedDate,
      lat: c.lat,
      lng: c.lng,
      geoSource: c.geoSource,
      source: c.source === 'rtms' ? 'rtms' : 'reb',
      stats: { trade: byType('trade'), jeonse: byType('jeonse'), monthly: byType('monthly') },
      officialPrices: [...prices].sort((a, b) => bandOrder(a.band) - bandOrder(b.band)).map(toOfficialPrice),
      kaptCode: c.kaptCode,
      saleType: c.saleType,
      heating: c.heating,
      elevatorCount: c.elevatorCount,
      roadAddr: c.roadAddr,
      parkingCount: c.parkingCount,
      floorsMax: c.floorsMax,
      structure: c.structure,
      baseDate: c.baseDate,
      infra,
      flood,
    };
  }

  async getTrades(id: string, q: HousingTradesQueryType): Promise<HousingTradesResultType> {
    const c = await this.deps.prisma.housingComplex.findUnique({ where: { id }, select: { id: true } });
    if (!c) throw new HousingServiceError('해당 단지를 찾을 수 없습니다.', 404);
    const where: Prisma.HousingTradeWhereInput = {
      complexId: id,
      dealType: q.dealType,
      ...areaWhere(q.band),
      ...(q.includeCanceled ? {} : { canceled: false }),
    };
    const [rows, total, stats] = await Promise.all([
      this.deps.prisma.housingTrade.findMany({
        where,
        orderBy: [{ dealDate: 'desc' }, { id: 'asc' }],
        skip: q.offset,
        take: q.limit,
      }),
      this.deps.prisma.housingTrade.count({ where }),
      this.latestSync('stats'),
    ]);
    const items: HousingTradeType[] = rows.map((t) => ({
      id: t.id,
      dealType: q.dealType,
      dealDate: t.dealDate,
      area: t.area,
      floor: t.floor,
      price: t.price,
      rent: t.rent,
      buildYear: t.buildYear,
      dealingGbn: t.dealingGbn,
      canceled: t.canceled,
      canceledDate: t.canceledDate,
      rgstDate: t.rgstDate,
      aptDong: t.aptDong,
      buyerGbn: t.buyerGbn,
      slerGbn: t.slerGbn,
      contractType: t.contractType,
      useRRRight: t.useRRRight,
      contractTerm: t.contractTerm,
      preDeposit: t.preDeposit,
      preRent: t.preRent,
    }));
    return {
      complexId: id,
      dealType: q.dealType,
      band: q.band,
      items,
      total,
      fetchedAt: stats?.loadedAt.toISOString() ?? this.now().toISOString(),
    };
  }
}
