import { z } from 'zod';

// 집값(/housing) — 국토교통부 아파트 실거래가(매매 15126468·전월세 15126474, 시군구×계약년월 단위
// 적재) + 한국부동산원 공동주택 단지 식별정보(CSV 적재 + VWorld 지오코딩) 공개 조회 계약.
// 지도는 일상지도와 같은 뷰포트(bbox)+줌 단위 — 줌이 충분하면 단지별 가격 배지(points), 아니면
// 서버 집계 셀(평당가·단지 수)을 내려준다. 축은 거래 유형(매매/전세/월세) × 전용면적 구간이며
// 점·셀·주변·상세 통계에 같은 축이 걸린다. 가격 단위는 전부 만원(정수).

export const HousingDealType = z.enum(['trade', 'jeonse', 'monthly']);
export type HousingDealTypeType = z.infer<typeof HousingDealType>;
export const HousingAreaBand = z.enum(['all', 'b1', 'b2', 'b3', 'b4']);
export type HousingAreaBandType = z.infer<typeof HousingAreaBand>;
export const HousingComplexKind = z.enum(['apt', 'row', 'multi']);
export type HousingComplexKindType = z.infer<typeof HousingComplexKind>;

// "minLng,minLat,maxLng,maxLat" — 맛집·일상지도와 같은 문자열 규약(@repo/utils formatBbox).
const HousingBboxParam = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'bbox must be "minLng,minLat,maxLng,maxLat"');

const housingAxisFields = {
  dealType: HousingDealType.default('trade'),
  band: HousingAreaBand.default('all'),
} as const;

// ── 최근 거래 요약(단지 × 유형 × 구간) ───────────────────────────────────────
export const HousingLatestDeal = z.object({
  // 매매가 / 전세 보증금 / 월세 보증금(만원).
  price: z.number().int(),
  // 월세(만원) — 매매·전세는 0.
  rent: z.number().int(),
  area: z.number(),
  floor: z.number().int().nullable(),
  // 계약일 'YYYY-MM-DD'.
  dealDate: z.string(),
});
export type HousingLatestDealType = z.infer<typeof HousingLatestDeal>;

// 선택 축(유형×구간)에 거래가 없을 때 대신 보여 주는 "다른 조건의 마지막 거래" — 유형 무관·전체 면적 중 최근.
export const HousingFallbackDeal = HousingLatestDeal.extend({ dealType: HousingDealType });
export type HousingFallbackDealType = z.infer<typeof HousingFallbackDeal>;

// 공동주택 공시가격 요약(단지 × 면적 구간) — 국토교통부 주택 공시가격 정보(호별) 파일을 접은 값, 만원.
export const HousingOfficialPrice = z.object({
  band: HousingAreaBand,
  year: z.number().int(),
  count: z.number().int().min(1),
  median: z.number().int(),
  min: z.number().int(),
  max: z.number().int(),
  avgArea: z.number(),
});
export type HousingOfficialPriceType = z.infer<typeof HousingOfficialPrice>;
// 배지·목록용 축약 — 전체 면적 구간의 중위 공시가격.
export const HousingOfficialGlance = z.object({ year: z.number().int(), median: z.number().int(), count: z.number().int().min(1) });
export type HousingOfficialGlanceType = z.infer<typeof HousingOfficialGlance>;

export const HousingBandStat = z.object({
  band: HousingAreaBand,
  latest: HousingLatestDeal,
  // 최근 12개월 거래 건수·전체 적재 기간 건수.
  count12: z.number().int().min(0),
  count: z.number().int().min(0),
  // 최근 12개월 평균 단위가(만원/㎡, 월세는 보증금 기준). 거래 없으면 null.
  unitPrice12: z.number().nullable(),
});
export type HousingBandStatType = z.infer<typeof HousingBandStat>;

// ── 뷰포트 조회 ──────────────────────────────────────────────────────────────
export const HousingPointsQuery = z.object({
  bbox: HousingBboxParam,
  // 지도 줌(소수 허용, 서버는 내림) — HOUSING_POINT_MIN_ZOOM 이상이면 points.
  zoom: z.coerce.number().min(0).max(22),
  ...housingAxisFields,
});
export type HousingPointsQueryType = z.infer<typeof HousingPointsQuery>;

// 지도 단지 — 배지에 필요한 최소 필드. latest 가 null 이면 이 축에 거래가 없는 단지 → fallback(다른 조건의
// 마지막 거래, 회색 배지) → official(공시가격 중위, 회색 점선 배지) → 회색 점 순으로 그린다.
export const HousingPoint = z.object({
  id: z.string(),
  lat: z.number(),
  lng: z.number(),
  name: z.string(),
  households: z.number().int().nullable(),
  latest: HousingLatestDeal.nullable(),
  fallback: HousingFallbackDeal.nullable(),
  official: HousingOfficialGlance.nullable(),
  // K-apt 분양형태('분양' | '임대' | '혼합') — 임대단지는 실거래가 없는 게 정상.
  saleType: z.string().nullable(),
});
export type HousingPointType = z.infer<typeof HousingPoint>;

// 집계 셀 — 셀 안 단지들의 무게중심, 단지 수, 그중 이 축에 거래가 있는 단지 수, 그 단지들의 최근
// 거래 단위가 평균(만원/㎡ — 거래 없으면 null).
export const HousingCell = z.object({
  lat: z.number(),
  lng: z.number(),
  count: z.number().int().min(1),
  traded: z.number().int().min(0),
  unitPrice: z.number().nullable(),
});
export type HousingCellType = z.infer<typeof HousingCell>;

export const HousingPointsResult = z.object({
  mode: z.enum(['points', 'cells']),
  dealType: HousingDealType,
  band: HousingAreaBand,
  items: z.array(HousingPoint),
  cells: z.array(HousingCell),
  // bbox 안 단지 수(절단 전).
  total: z.number().int().min(0),
  truncated: z.boolean(),
  minPointZoom: z.number().int().min(0).max(22),
  // 통계 재계산 시각(HousingSync stats).
  fetchedAt: z.string(),
});
export type HousingPointsResultType = z.infer<typeof HousingPointsResult>;

// ── 단지 요약(주변 목록·검색) ────────────────────────────────────────────────
export const HousingComplexSummary = z.object({
  id: z.string(),
  name: z.string(),
  kind: HousingComplexKind,
  // 지번 주소('서울특별시 종로구 청운동 56-45').
  addr: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  households: z.number().int().nullable(),
  dongCount: z.number().int().nullable(),
  // 사용승인일 'YYYY-MM-DD'.
  approvedDate: z.string().nullable(),
  // 요청 축(dealType×band)의 최근 거래 — 없으면 null.
  latest: HousingLatestDeal.nullable(),
  count12: z.number().int().min(0),
  fallback: HousingFallbackDeal.nullable(),
  official: HousingOfficialGlance.nullable(),
  saleType: z.string().nullable(),
});
export type HousingComplexSummaryType = z.infer<typeof HousingComplexSummary>;

export const HousingNearbyQuery = z.object({
  lat: z.coerce.number().min(33).max(39),
  lng: z.coerce.number().min(124).max(132),
  // 반경(m).
  radius: z.coerce.number().int().min(100).max(3000).default(1000),
  limit: z.coerce.number().int().min(1).max(30).default(15),
  ...housingAxisFields,
});
export type HousingNearbyQueryType = z.infer<typeof HousingNearbyQuery>;

export const HousingNearbyItem = HousingComplexSummary.extend({ dist: z.number().int().min(0) });
export type HousingNearbyItemType = z.infer<typeof HousingNearbyItem>;

export const HousingNearbyResult = z.object({
  center: z.object({ lat: z.number(), lng: z.number() }),
  dealType: HousingDealType,
  band: HousingAreaBand,
  // 거리(m) 오름차순.
  items: z.array(HousingNearbyItem),
  total: z.number().int().min(0),
  fetchedAt: z.string(),
});
export type HousingNearbyResultType = z.infer<typeof HousingNearbyResult>;

// ── 단지명 검색 ──────────────────────────────────────────────────────────────
export const HousingSearchQuery = z.object({
  q: z
    .string()
    .trim()
    .transform((v) => v.normalize('NFC').replace(/\s+/g, ' '))
    .refine((v) => v.length >= 1 && v.length <= 40, { message: '검색어는 1자 이상 40자 이하여야 합니다.' }),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
export type HousingSearchQueryType = z.infer<typeof HousingSearchQuery>;

export const HousingSearchItem = z.object({
  id: z.string(),
  name: z.string(),
  addr: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  households: z.number().int().nullable(),
});
export type HousingSearchItemType = z.infer<typeof HousingSearchItem>;

export const HousingSearchResult = z.object({
  q: z.string(),
  // 세대수 큰 순.
  items: z.array(HousingSearchItem),
  fetchedAt: z.string(),
});
export type HousingSearchResultType = z.infer<typeof HousingSearchResult>;

// ── 단지 상세 ────────────────────────────────────────────────────────────────
export const HousingComplexParams = z.object({ id: z.string().min(1).max(200) });
export type HousingComplexParamsType = z.infer<typeof HousingComplexParams>;

export const HousingComplexDetail = z.object({
  id: z.string(),
  name: z.string(),
  // 공시가격·건축물대장·도로명주소 단지명, 단지명 변경 이력 — 표시명과 다른 것만.
  altNames: z.array(z.string()),
  kind: HousingComplexKind,
  addr: z.string(),
  sido: z.string(),
  sgg: z.string(),
  umd: z.string(),
  // 필지고유번호(19자리) — 한국부동산원 원천 단지만.
  pnu: z.string().nullable(),
  households: z.number().int().nullable(),
  dongCount: z.number().int().nullable(),
  approvedDate: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  // 'road' | 'parcel' | null(좌표 없음).
  geoSource: z.string().nullable(),
  // 'reb' 한국부동산원 단지 식별정보 / 'rtms' 실거래 주소로만 만든 단지(마스터에 없던 단지).
  source: z.enum(['reb', 'rtms']),
  // 유형별 면적 구간 통계(거래가 있는 구간만, 'all' 포함).
  stats: z.object({
    trade: z.array(HousingBandStat),
    jeonse: z.array(HousingBandStat),
    monthly: z.array(HousingBandStat),
  }),
  // 공시가격(구간 순, 'all' 포함) — 미적재면 빈 배열.
  officialPrices: z.array(HousingOfficialPrice),
  // 보강 속성 — K-apt(kaptCode·분양형태·난방·승강기) / 건축물대장(도로명주소·주차·최고층·구조). 없으면 null.
  kaptCode: z.string().nullable(),
  saleType: z.string().nullable(),
  heating: z.string().nullable(),
  elevatorCount: z.number().int().nullable(),
  roadAddr: z.string().nullable(),
  parkingCount: z.number().int().nullable(),
  floorsMax: z.number().int().nullable(),
  structure: z.string().nullable(),
  // 단지 마스터 기준일.
  baseDate: z.string(),
});
export type HousingComplexDetailType = z.infer<typeof HousingComplexDetail>;

// ── 거래 목록 ────────────────────────────────────────────────────────────────
export const HousingTradesQuery = z.object({
  ...housingAxisFields,
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  // true 면 해제된 거래도 포함(기본 제외).
  includeCanceled: z
    .enum(['1', '0', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});
export type HousingTradesQueryType = z.infer<typeof HousingTradesQuery>;

export const HousingTrade = z.object({
  id: z.string(),
  dealType: HousingDealType,
  dealDate: z.string(),
  area: z.number(),
  floor: z.number().int().nullable(),
  price: z.number().int(),
  rent: z.number().int(),
  buildYear: z.number().int().nullable(),
  // 매매: 중개거래/직거래, 해제 여부·해제일, 등기일자, 동, 매도·매수자 구분(개인/법인/공공기관…).
  dealingGbn: z.string().nullable(),
  canceled: z.boolean(),
  canceledDate: z.string().nullable(),
  rgstDate: z.string().nullable(),
  aptDong: z.string().nullable(),
  buyerGbn: z.string().nullable(),
  slerGbn: z.string().nullable(),
  // 전월세: 계약구분(신규/갱신), 갱신요구권 사용, 계약기간('25.07~27.07'), 종전 보증금·월세(만원).
  contractType: z.string().nullable(),
  useRRRight: z.string().nullable(),
  contractTerm: z.string().nullable(),
  preDeposit: z.number().int().nullable(),
  preRent: z.number().int().nullable(),
});
export type HousingTradeType = z.infer<typeof HousingTrade>;

export const HousingTradesResult = z.object({
  complexId: z.string(),
  dealType: HousingDealType,
  band: HousingAreaBand,
  // 계약일 내림차순.
  items: z.array(HousingTrade),
  total: z.number().int().min(0),
  fetchedAt: z.string(),
});
export type HousingTradesResultType = z.infer<typeof HousingTradesResult>;

// ── 적재 상태 ────────────────────────────────────────────────────────────────
export const HousingStatusResult = z.object({
  complexes: z.object({
    loaded: z.boolean(),
    count: z.number().int().min(0),
    // 좌표를 확보한 단지 수.
    geocoded: z.number().int().min(0),
    // 단지 마스터 CSV 기준일.
    baseDate: z.string().nullable(),
    loadedAt: z.string().nullable(),
  }),
  // 유형별 거래 적재 — 건수·적재된 계약년월 범위·마지막 적재 시각. 매매/전월세 각각.
  trades: z.object({
    loaded: z.boolean(),
    count: z.number().int().min(0),
    fromYm: z.string().nullable(),
    toYm: z.string().nullable(),
    loadedAt: z.string().nullable(),
  }),
  rents: z.object({
    loaded: z.boolean(),
    count: z.number().int().min(0),
    fromYm: z.string().nullable(),
    toYm: z.string().nullable(),
    loadedAt: z.string().nullable(),
  }),
  // 통계(단지×유형×구간) 재계산 시각.
  statsAt: z.string().nullable(),
  // 보강 적재 — 공시가격(연도·단지 수), K-apt 매칭 단지 수, 건축물대장 조회 단지 수.
  officialPrices: z.object({
    loaded: z.boolean(),
    year: z.number().int().nullable(),
    complexes: z.number().int().min(0),
    loadedAt: z.string().nullable(),
  }),
  kapt: z.object({ loaded: z.boolean(), matched: z.number().int().min(0), loadedAt: z.string().nullable() }),
  buildings: z.object({ fetched: z.number().int().min(0), total: z.number().int().min(0), loadedAt: z.string().nullable() }),
  fetchedAt: z.string(),
});
export type HousingStatusResultType = z.infer<typeof HousingStatusResult>;
