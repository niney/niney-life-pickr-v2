import { Prisma, type HousingComplex, type HousingComplexPrice, type HousingComplexStat, type PrismaClient } from '@prisma/client';
import type {
  HousingAreaBandType,
  HousingBandStatType,
  HousingComplexDetailType,
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
  haversineM,
  isHousingAreaBand,
  isHousingComplexKind,
  isHousingDealType,
  lifeCellSizeDeg,
  type HousingAreaBandStrict,
} from '@repo/utils';
import { LRUCache } from 'lru-cache';

// 집값 조회 — 로컬 SQLite(HousingComplex ≈4.6만 / HousingComplexStat / HousingComplexPrice / HousingTrade
// 수백만)만 읽는다. 업스트림 없음. 지도 배지·주변·상세 통계는 파생 표(HousingComplexStat: 단지 × 유형 ×
// 구간 + 단지당 폴백 행 'any/all')와 공시가격 표(HousingComplexPrice: 단지 × 구간)만 조인하고, 거래 표는
// 단지 상세의 거래 목록에서만 읽는다.
//
// 뷰포트 조회는 일상지도와 같은 두 모드: 줌이 임계(HOUSING_POINT_MIN_ZOOM) 이상이고 bbox 가 좁으면
// 단지별 점(배지값 = 축의 최근 거래, 상한 HOUSING_POINTS_MAX + truncated), 아니면 전국 고정 원점 도(°)
// 격자로 GROUP BY 한 셀(단지 수·거래 있는 단지 수·그 단지들의 최근 거래 단위가 평균). 셀은 bbox 를 셀
// 경계로 정렬한 키로 LRU 10분 캐시 — 통계가 재계산되면 sync id 가 바뀌어 키가 갈린다.
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

const POINTS_MAX_SPAN_DEG = 1.5;
const CELL_CACHE_TTL_MS = 10 * 60_000;
const CELL_CACHE_MAX = 300;
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
}

export class HousingService {
  private readonly cellCache = new LRUCache<string, HousingPointsResultType>({ max: CELL_CACHE_MAX, ttl: CELL_CACHE_TTL_MS });

  constructor(private readonly deps: HousingServiceDeps) {}

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

  async getStatus(): Promise<HousingStatusResultType> {
    const prisma = this.deps.prisma;
    const [complex, stats, pricesSync, kaptSync, buildingsSync] = await Promise.all([
      this.latestSync('complex'),
      this.latestSync('stats'),
      this.latestSync('prices'),
      this.latestSync('kapt'),
      this.latestSync('buildings'),
    ]);
    const [count, geocoded] = complex
      ? await Promise.all([
          prisma.housingComplex.count({ where: { kind: 'apt' } }),
          prisma.housingComplex.count({ where: { kind: 'apt', lat: { not: null } } }),
        ])
      : [0, 0];
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
    const [trades, rents, priceAgg, kaptMatched, buildingsFetched, buildingsTotal] = await Promise.all([
      ledger(['trade']),
      ledger(['jeonse', 'monthly']),
      prisma.housingComplexPrice.aggregate({ where: { band: ALL_BAND }, _count: { complexId: true }, _max: { year: true } }),
      prisma.housingComplex.count({ where: { kind: 'apt', kaptCode: { not: null } } }),
      prisma.housingComplex.count({ where: { kind: 'apt', buildingFetchedAt: { not: null } } }),
      prisma.housingComplex.count({ where: { kind: 'apt', pnu: { not: null } } }),
    ]);
    return {
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
      fetchedAt: this.now().toISOString(),
    };
  }

  async getPoints(q: HousingPointsQueryType): Promise<HousingPointsResultType> {
    const { syncId, fetchedAt } = await this.requireLoaded();
    const bbox = parseBbox(q.bbox);
    const zoom = Math.floor(q.zoom);
    const narrow = bbox.maxLat - bbox.minLat <= POINTS_MAX_SPAN_DEG && bbox.maxLng - bbox.minLng <= POINTS_MAX_SPAN_DEG;
    if (zoom >= HOUSING_POINT_MIN_ZOOM && narrow) return this.points(bbox, q.dealType, q.band, fetchedAt);
    return this.cells(zoom, bbox, q.dealType, q.band, syncId, fetchedAt);
  }

  private async points(
    bbox: Bbox,
    dealType: HousingDealTypeType,
    band: HousingAreaBandType,
    fetchedAt: string,
  ): Promise<HousingPointsResultType> {
    const rows = await this.deps.prisma.$queryRaw<
      {
        id: string;
        lat: number;
        lng: number;
        name: string;
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
    >(Prisma.sql`SELECT c."id", c."lat", c."lng", c."name", c."households", c."saleType",
                        s."latestPrice", s."latestRent", s."latestArea", s."latestFloor", s."latestDate",
                        f."latestPrice" AS "anyPrice", f."latestRent" AS "anyRent", f."latestArea" AS "anyArea",
                        f."latestFloor" AS "anyFloor", f."latestDate" AS "anyDate", f."latestDealType" AS "anyType",
                        p."year" AS "prYear", p."median" AS "prMedian", p."count" AS "prCount"
                 FROM "housing_complexes" c
                 LEFT JOIN "housing_complex_stats" s ON s."complexId" = c."id" AND s."dealType" = ${dealType} AND s."band" = ${band}
                 LEFT JOIN "housing_complex_stats" f ON f."complexId" = c."id" AND f."dealType" = ${ANY_DEAL_TYPE} AND f."band" = ${ALL_BAND}
                 LEFT JOIN "housing_complex_prices" p ON p."complexId" = c."id" AND p."band" = ${ALL_BAND}
                 WHERE c."kind" = 'apt' AND c."lat" >= ${bbox.minLat} AND c."lat" <= ${bbox.maxLat}
                   AND c."lng" >= ${bbox.minLng} AND c."lng" <= ${bbox.maxLng}
                 LIMIT ${HOUSING_POINTS_MAX + 1}`);
    const truncated = rows.length > HOUSING_POINTS_MAX;
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
      };
    });
    const total = truncated
      ? await this.deps.prisma.housingComplex.count({
          where: { kind: 'apt', lat: { gte: bbox.minLat, lte: bbox.maxLat }, lng: { gte: bbox.minLng, lte: bbox.maxLng } },
        })
      : items.length;
    return { mode: 'points', dealType, band, items, cells: [], total, truncated, minPointZoom: HOUSING_POINT_MIN_ZOOM, fetchedAt };
  }

  // 집계 셀 — 일상지도와 같은 전국 고정 원점 격자(bbox 셀 경계 바깥 정렬)이되 한 칸을 **두 배**(화면
  // ~128px)로 잡는다: 알약(평당가 글자 ~60~80px)이 일상지도의 숫자 버블보다 넓어 64px 칸에선 이웃과
  // 겹친다(2026-08-30 실화면 확인). 단지 수·거래 있는 단지 수·최근 거래 단위가(만원/㎡) 평균.
  private async cells(
    zoom: number,
    bbox: Bbox,
    dealType: HousingDealTypeType,
    band: HousingAreaBandType,
    syncId: number,
    fetchedAt: string,
  ): Promise<HousingPointsResultType> {
    const { dLng, dLat } = lifeCellSizeDeg(Math.max(0, zoom - 1));
    const o = LIFE_CELL_ORIGIN;
    const q: Bbox = {
      minLng: o.lng + Math.floor((bbox.minLng - o.lng) / dLng) * dLng,
      maxLng: o.lng + Math.ceil((bbox.maxLng - o.lng) / dLng) * dLng,
      minLat: o.lat + Math.floor((bbox.minLat - o.lat) / dLat) * dLat,
      maxLat: o.lat + Math.ceil((bbox.maxLat - o.lat) / dLat) * dLat,
    };
    const key = `${zoom}|${q.minLng.toFixed(6)},${q.minLat.toFixed(6)},${q.maxLng.toFixed(6)},${q.maxLat.toFixed(6)}|${dealType}|${band}|${syncId}`;
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
                 FROM "housing_complexes" c
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

  async getComplex(id: string): Promise<HousingComplexDetailType> {
    const c = await this.deps.prisma.housingComplex.findUnique({ where: { id } });
    if (!c) throw new HousingServiceError('해당 단지를 찾을 수 없습니다.', 404);
    const [stats, prices] = await Promise.all([
      this.deps.prisma.housingComplexStat.findMany({ where: { complexId: id } }),
      this.deps.prisma.housingComplexPrice.findMany({ where: { complexId: id } }),
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
