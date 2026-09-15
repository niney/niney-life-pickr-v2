import { z } from 'zod';
import { StartCrawlResult } from './crawl.js';

// 여행로그(AI 허브 71780 제주·도서 + 71779 서부권) — 2차: 관리자 시드 콘솔 계약. 공개 집계 계약은 4차에서 이 파일에 합류한다.
// 원본 행(개별 여행·방문)은 어디에도 없다 — 시드 목록은 장소(TourPlace) 단위 집계와 매칭·폐업 상태뿐.
// 계획·이용조건: docs/PLAN-tour-log.md

// 적재 단위(데이터셋) 키 — 여기가 원본이고 utils(TOUR_DATASETS)·서버가 이 목록을 쓴다(패키지 순환 금지: utils → api-contract 방향).
export const TOUR_DATASET_KEYS = ['jeju', 'west'] as const;
export type TourDatasetType = (typeof TOUR_DATASET_KEYS)[number];
export const TourDataset = z.enum(TOUR_DATASET_KEYS);

// 지역 축(7차) 키 — jeju 는 isJeju(본섬+부속섬), 시도 키는 방문 sido, west 는 서부권 7개 시도, all 은 전체. 라벨·bbox·거점은 utils TOUR_REGIONS.
export const TOUR_REGION_KEYS = ['jeju', 'west', 'jeonbuk', 'jeonnam', 'chungnam', 'daejeon', 'chungbuk', 'gwangju', 'sejong', 'all'] as const;
export const TourRegion = z.enum(TOUR_REGION_KEYS);
export type TourRegionType = (typeof TOUR_REGION_KEYS)[number];

// 국세청 사업자 상태 — '' 로 오는 미등록 번호는 unknown.
export const TourBizStatusKind = z.enum(['계속사업자', '휴업자', '폐업자', 'unknown']);
export type TourBizStatusKindType = z.infer<typeof TourBizStatusKind>;

export const TourSeedBiz = z.object({
  brno: z.string(),
  bStt: TourBizStatusKind,
  // 폐업일 'YYYY-MM-DD'(폐업자만).
  endDt: z.string().nullable(),
  checkedAt: z.string(),
});
export type TourSeedBizType = z.infer<typeof TourSeedBiz>;

export const TourSeedMatch = z.object({
  canonicalId: z.string(),
  // 매칭된 맛집의 네이버 placeId — 어드민 식당 상세 링크용(네이버 행이 없으면 null).
  naverPlaceId: z.string().nullable(),
  restaurantName: z.string().nullable(),
  distM: z.number().int(),
  nameScore: z.number(),
  status: z.enum(['matched', 'missing']),
});
export type TourSeedMatchType = z.infer<typeof TourSeedMatch>;

export const TourSeedItem = z.object({
  placeId: z.string(),
  name: z.string(),
  typeShort: z.string(),
  roadAddr: z.string().nullable(),
  sigungu: z.string().nullable(),
  emd: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  poiId: z.string().nullable(),
  nTravelers: z.number().int(),
  nVisits: z.number().int(),
  nRated: z.number().int(),
  bayesScore: z.number().nullable(),
  spendPpMedian: z.number().nullable(),
  match: TourSeedMatch.nullable(),
  biz: TourSeedBiz.nullable(),
});
export type TourSeedItemType = z.infer<typeof TourSeedItem>;

export const TourSeedStatusFilter = z.enum(['all', 'unmatched', 'matched', 'closed']);
export type TourSeedStatusFilterType = z.infer<typeof TourSeedStatusFilter>;

export const TourSeedQuery = z.object({
  region: TourRegion.default('jeju'),
  minTravelers: z.coerce.number().int().min(1).max(1000).default(5),
  status: TourSeedStatusFilter.default('all'),
  q: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type TourSeedQueryType = z.infer<typeof TourSeedQuery>;

export const TourSeedList = z.object({
  items: z.array(TourSeedItem),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type TourSeedListType = z.infer<typeof TourSeedList>;

// 네이버 검색 후보 — 크롤 검색 결과에 여행로그 장소 기준 거리·상호 점수·수락 여부·등록 여부를 얹는다.
export const TourSeedCandidate = z.object({
  placeId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  address: z.string().nullable(),
  roadAddress: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  thumbnailUrl: z.string().nullable(),
  reviewCount: z.number().int().nullable(),
  rawSourceUrl: z.string(),
  distM: z.number().int().nullable(),
  nameScore: z.number(),
  // 매칭 규칙(100m·0.5 / 완전일치 300m)을 통과하는 후보.
  accepted: z.boolean(),
  registered: z.boolean(),
});
export type TourSeedCandidateType = z.infer<typeof TourSeedCandidate>;

export const TourSeedDiscoverResult = z.object({
  tourPlaceId: z.string(),
  query: z.string(),
  candidates: z.array(TourSeedCandidate),
  source: z.enum(['http', 'playwright']),
});
export type TourSeedDiscoverResultType = z.infer<typeof TourSeedDiscoverResult>;

export const TourSeedRegisterBody = z.object({
  rawSourceUrl: z.string().url(),
});
export type TourSeedRegisterBodyType = z.infer<typeof TourSeedRegisterBody>;

export const TourSeedRegisterResult = z.object({
  tourPlaceId: z.string(),
  start: StartCrawlResult,
});
export type TourSeedRegisterResultType = z.infer<typeof TourSeedRegisterResult>;

export const TourMatchRunResult = z.object({
  scanned: z.number().int(),
  created: z.number().int(),
  rematched: z.number().int(),
  kept: z.number().int(),
  newlyMissing: z.number().int(),
  stillMissing: z.number().int(),
  recovered: z.number().int(),
  unmatched: z.number().int(),
  durationMs: z.number().int(),
});
export type TourMatchRunResultType = z.infer<typeof TourMatchRunResult>;

export const TourBizCheckBody = z.object({
  // 국세청 API 호출 상한(100 사업자번호/콜).
  maxCalls: z.number().int().min(1).max(50).default(10),
  minTravelers: z.number().int().min(1).max(1000).default(3),
  region: TourRegion.default('jeju'),
  // true 면 30일 안에 조회한 장소도 다시.
  force: z.boolean().default(false),
});
export type TourBizCheckBodyType = z.infer<typeof TourBizCheckBody>;

export const TourBizCheckResult = z.object({
  // 사업자번호가 있는 대상 장소 / 이번에 조회가 필요한 장소 / 실제 호출 수 / 갱신한 장소.
  candidates: z.number().int(),
  pending: z.number().int(),
  calls: z.number().int(),
  checked: z.number().int(),
  byStatus: z.object({
    open: z.number().int(),
    suspended: z.number().int(),
    closed: z.number().int(),
    unknown: z.number().int(),
  }),
  stopped: z.enum(['done', 'maxCalls', 'auth', 'quota', 'error']),
  error: z.string().nullable(),
});
export type TourBizCheckResultType = z.infer<typeof TourBizCheckResult>;

// 데이터셋별 적재 상태(7차) — places 0 이면 미적재.
export const TourAdminDatasetStatus = z.object({
  key: TourDataset,
  label: z.string(),
  loaded: z.boolean(),
  places: z.number().int(),
  trips: z.number().int(),
  visits: z.number().int(),
  photos: z.number().int(),
  baseDate: z.string().nullable(),
  sourceFile: z.string().nullable(),
  loadedAt: z.string().nullable(),
});
export type TourAdminDatasetStatusType = z.infer<typeof TourAdminDatasetStatus>;

export const TourAdminStatus = z.object({
  // 전체(모든 데이터셋 합) — loaded 는 하나라도 적재됐으면 true.
  loaded: z.boolean(),
  places: z.number().int(),
  baseDate: z.string().nullable(),
  sourceFile: z.string().nullable(),
  loadedAt: z.string().nullable(),
  counts: z.record(z.string(), z.number().int()),
  datasets: z.array(TourAdminDatasetStatus),
  match: z.object({
    matched: z.number().int(),
    missing: z.number().int(),
    // 매칭 대상(좌표 있고 식당 행이 1개 이상인 canonical).
    candidates: z.number().int(),
  }),
  biz: z.object({
    checked: z.number().int(),
    open: z.number().int(),
    suspended: z.number().int(),
    closed: z.number().int(),
    unknown: z.number().int(),
    lastCheckedAt: z.string().nullable(),
    keyConfigured: z.boolean(),
  }),
  seeds: z.object({
    // 식당류(식당·상업·상점) 장소 수(적재된 전체 데이터셋)와 방문자 5/3명 이상, 그중 미매칭(5명 이상).
    restaurants: z.number().int(),
    t5: z.number().int(),
    t3: z.number().int(),
    unmatchedT5: z.number().int(),
  }),
  thumbsDir: z.string().nullable(),
  thumbsExists: z.boolean(),
});
export type TourAdminStatusType = z.infer<typeof TourAdminStatus>;

// ── 3차: 관리자 원본 열람(allowlist) ─────────────────────────────────────────
// 이 아래 스키마에는 여행 ID·여행자 라벨이 들어 있다 — 공개 라우트에서는 절대 쓰지 않는다(공개 집계 스키마는 4차에서
// 식별자 없이 따로). 라우트는 admin + TOUR_RAW_USER_IDS, 응답은 no-store·noindex.

export const TourRawPageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type TourRawPageQueryType = z.infer<typeof TourRawPageQuery>;

export const TourRawVisit = z.object({
  id: z.string(),
  travelId: z.string(),
  travelerLabel: z.string().nullable(),
  visitDate: z.string(),
  dayIndex: z.number().int().nullable(),
  arrivalTs: z.string().nullable(),
  stayMin: z.number().int().nullable(),
  dgstfn: z.number().int().nullable(),
  revisitInt: z.number().int().nullable(),
  rcmdInt: z.number().int().nullable(),
  revisitYn: z.string().nullable(),
  reasonNm: z.string().nullable(),
  mvmnNm: z.string().nullable(),
  spendSum: z.number().nullable(),
  spendPp: z.number().nullable(),
  nPhotos: z.number().int(),
  nActivities: z.number().int(),
  gender: z.string().nullable(),
  ageGrp: z.string().nullable(),
  accompany: z.string().nullable(),
  residenceSido: z.string().nullable(),
  nights: z.number().int().nullable(),
  month: z.number().int().nullable(),
  prevPlaceName: z.string().nullable(),
  nextPlaceName: z.string().nullable(),
});
export type TourRawVisitType = z.infer<typeof TourRawVisit>;

export const TourRawVisitsResult = z.object({ tourPlaceId: z.string(), items: z.array(TourRawVisit), total: z.number().int() });
export type TourRawVisitsResultType = z.infer<typeof TourRawVisitsResult>;

export const TourRawActivity = z.object({
  travelId: z.string(),
  visitAreaId: z.string(),
  typeNm: z.string().nullable(),
  seq: z.number().int(),
  detail: z.string().nullable(),
  rsvtYn: z.string().nullable(),
  expndNm: z.string().nullable(),
  admissionNm: z.string().nullable(),
  visitDate: z.string().nullable(),
  dayIndex: z.number().int().nullable(),
  ageGrp: z.string().nullable(),
  accompany: z.string().nullable(),
});
export type TourRawActivityType = z.infer<typeof TourRawActivity>;
export const TourRawActivitiesResult = z.object({ tourPlaceId: z.string(), items: z.array(TourRawActivity), total: z.number().int() });
export type TourRawActivitiesResultType = z.infer<typeof TourRawActivitiesResult>;

export const TourRawSpend = z.object({
  id: z.number().int(),
  travelId: z.string(),
  category: z.string(),
  subtypeNm: z.string().nullable(),
  item: z.string().nullable(),
  storeNm: z.string().nullable(),
  brno: z.string().nullable(),
  amount: z.number().nullable(),
  payNum: z.number().int().nullable(),
  perPerson: z.number().nullable(),
  methodNm: z.string().nullable(),
  paidTs: z.string().nullable(),
  dayIndex: z.number().int().nullable(),
  ageGrp: z.string().nullable(),
  accompany: z.string().nullable(),
  roadAddr: z.string().nullable(),
});
export type TourRawSpendType = z.infer<typeof TourRawSpend>;
export const TourRawSpendResult = z.object({ tourPlaceId: z.string(), items: z.array(TourRawSpend), total: z.number().int() });
export type TourRawSpendResultType = z.infer<typeof TourRawSpendResult>;

export const TourPhotoSize = z.enum(['s', 'm']);
export type TourPhotoSizeType = z.infer<typeof TourPhotoSize>;

export const TourRawPhoto = z.object({
  id: z.string(),
  travelId: z.string().nullable(),
  visitAreaId: z.string().nullable(),
  takenTs: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  caption: z.string().nullable(),
  landmark: z.string().nullable(),
  source: z.string(),
});
export type TourRawPhotoType = z.infer<typeof TourRawPhoto>;
export const TourRawPhotosResult = z.object({
  tourPlaceId: z.string(),
  items: z.array(TourRawPhoto),
  total: z.number().int(),
  // 서버에 있는 썸네일 크기(없으면 빈 배열 — 파일 미배포).
  sizes: z.array(TourPhotoSize),
});
export type TourRawPhotosResultType = z.infer<typeof TourRawPhotosResult>;

export const TourRawTripDay = z.object({
  dayIndex: z.number().int(),
  visitDate: z.string().nullable(),
  nStops: z.number().int(),
  typeSeq: z.string(),
  placeSeq: z.string().nullable(),
});
export const TourRawTripSummary = z.object({
  travelId: z.string(),
  travelerLabel: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  nights: z.number().int(),
  month: z.number().int(),
  gender: z.string().nullable(),
  ageGrp: z.string().nullable(),
  accompany: z.string().nullable(),
  residenceSido: z.string().nullable(),
  mvmnNm: z.string().nullable(),
  missionNames: z.string().nullable(),
  nPublic: z.number().int(),
  nPhotos: z.number().int(),
  spendTotal: z.number().nullable(),
  mainRegion: z.string().nullable(),
  days: z.array(TourRawTripDay),
});
export type TourRawTripSummaryType = z.infer<typeof TourRawTripSummary>;
export const TourRawTripsResult = z.object({ tourPlaceId: z.string(), items: z.array(TourRawTripSummary), total: z.number().int() });
export type TourRawTripsResultType = z.infer<typeof TourRawTripsResult>;

export const TourRawTripVisit = z.object({
  visitAreaId: z.string(),
  visitOrder: z.number().int(),
  dayIndex: z.number().int().nullable(),
  visitDate: z.string(),
  arrivalTs: z.string().nullable(),
  departTs: z.string().nullable(),
  stayMin: z.number().int().nullable(),
  typeShort: z.string(),
  isPrivate: z.boolean(),
  // 비공개 방문은 이름 대신 역할만("출발지"·"귀가"·"비공개 장소").
  privateRole: z.string().nullable(),
  placeId: z.string().nullable(),
  name: z.string().nullable(),
  sigungu: z.string().nullable(),
  emd: z.string().nullable(),
  dgstfn: z.number().int().nullable(),
  reasonNm: z.string().nullable(),
  mvmnNm: z.string().nullable(),
  spendSum: z.number().nullable(),
  nPhotos: z.number().int(),
  activities: z.array(z.object({ typeNm: z.string().nullable(), detail: z.string().nullable() })),
  spend: z.array(z.object({ storeNm: z.string().nullable(), item: z.string().nullable(), amount: z.number().nullable(), payNum: z.number().int().nullable(), methodNm: z.string().nullable() })),
  photoIds: z.array(z.string()),
});
export type TourRawTripVisitType = z.infer<typeof TourRawTripVisit>;

export const TourRawTripDetail = z.object({
  trip: TourRawTripSummary,
  companions: z.array(z.object({ relNm: z.string().nullable(), genderNm: z.string().nullable(), ageNm: z.string().nullable(), situationNm: z.string().nullable() })),
  visits: z.array(TourRawTripVisit),
  // 방문에 안 붙는 소비(숙박·이동·사전).
  otherSpend: z.array(
    z.object({
      category: z.string(),
      subtypeNm: z.string().nullable(),
      item: z.string().nullable(),
      amount: z.number().nullable(),
      payNum: z.number().int().nullable(),
      methodNm: z.string().nullable(),
      dayIndex: z.number().int().nullable(),
    }),
  ),
});
export type TourRawTripDetailType = z.infer<typeof TourRawTripDetail>;

// ── 4차: 공개 집계(식별자 없음·소셀 억제) ───────────────────────────────────────
// 맛집 상세 요약(RestaurantPublicDetail.tour)·목록 행(RestaurantPublicListItem.tour)·"여행자" 탭(RestaurantTourStats).
// 여행 ID·방문 ID·여행자 라벨이 없는 것이 계약의 핵심 — 서버가 무엇을 넣어도 serializer 가 걷어낸다.

export const RestaurantTourSummary = z.object({
  nTravelers: z.number().int(),
  nVisits: z.number().int(),
  nRated: z.number().int(),
  // 평가 3건 미만이면 null(한 사람의 평가일 수 있어 가린다). 보정 = (n·mean + 10·C)/(n+10).
  bayesScore: z.number().nullable(),
  meanDgstfn: z.number().nullable(),
  revisitRate: z.number().nullable(),
  stayMedian: z.number().nullable(),
  spendPpMedian: z.number().nullable(),
  topReasonNm: z.string().nullable(),
  // "2023년 4~9월 여행자 표본" · 출처 표기 문구 — 화면이 그대로 붙인다.
  sampleLabel: z.string(),
  sourceNote: z.string(),
});
export type RestaurantTourSummaryType = z.infer<typeof RestaurantTourSummary>;

export const RestaurantPublicListTour = z.object({
  nTravelers: z.number().int(),
  bayesScore: z.number().nullable(),
  spendPpMedian: z.number().nullable(),
  revisitRate: z.number().nullable(),
});
export type RestaurantPublicListTourType = z.infer<typeof RestaurantPublicListTour>;

export const TourCount = z.object({ label: z.string(), n: z.number().int() });
export type TourCountType = z.infer<typeof TourCount>;
// 집단(동반·연령) — n ≥ 5 만 온다. mean 은 평가 3건 미만이면 null.
export const TourGroupStat = z.object({ label: z.string(), n: z.number().int(), mean: z.number().nullable() });
export type TourGroupStatType = z.infer<typeof TourGroupStat>;
// 전후·동행 장소 — placeId 는 등록된 맛집이면 네이버 placeId(링크용), 아니면 null.
export const TourPlaceRef = z.object({ name: z.string(), typeShort: z.string(), n: z.number().int(), placeId: z.string().nullable() });
export type TourPlaceRefType = z.infer<typeof TourPlaceRef>;

export const RestaurantTourStats = z.object({
  summary: RestaurantTourSummary,
  // 1~5점 건수(인덱스 0 = 1점) / 추천 의향 1~5.
  satisfaction: z.array(z.number().int()).length(5),
  recommend: z.array(z.number().int()).length(5),
  revisit: z.object({ first: z.number().int(), again: z.number().int() }),
  // 도착 시각 0~23시 건수 / 요일 월~일(0=월).
  hours: z.array(z.number().int()).length(24),
  weekdays: z.array(z.number().int()).length(7),
  months: z.array(TourCount),
  stay: z.array(TourCount),
  dayPosition: z.object({ first: z.number().int(), mid: z.number().int(), last: z.number().int() }),
  reasons: z.array(TourCount),
  accompany: z.array(TourGroupStat),
  ages: z.array(TourGroupStat),
  prevPlaces: z.array(TourPlaceRef),
  nextPlaces: z.array(TourPlaceRef),
  togetherPlaces: z.array(TourPlaceRef),
  // 취식 기록 어절(2건 이상).
  menuTerms: z.array(TourCount),
  spend: z.object({
    n: z.number().int(),
    medianPp: z.number().nullable(),
    q1Pp: z.number().nullable(),
    q3Pp: z.number().nullable(),
    medianAmount: z.number().nullable(),
    avgPayNum: z.number().nullable(),
    methods: z.array(TourCount),
  }),
});
export type RestaurantTourStatsType = z.infer<typeof RestaurantTourStats>;

// ── 5차: 공개 인사이트·코스 추천(식별자 없음·소셀 억제) ─────────────────────────
export const TourAgeGrp = z.enum(['20', '30', '40', '50', '60']);
export const TourGender = z.enum(['남', '여']);

// 인사이트 필터 — 전부 선택. nights 4 = 4박 이상. 필터 후 여행이 20건 미만이면 insufficient.
export const TourInsightsQuery = z.object({
  region: TourRegion.default('jeju'),
  ageGrp: TourAgeGrp.optional(),
  gender: TourGender.optional(),
  accompany: z.string().trim().min(1).max(40).optional(),
  month: z.coerce.number().int().min(4).max(9).optional(),
  nights: z.coerce.number().int().min(0).max(4).optional(),
});
export type TourInsightsQueryType = z.infer<typeof TourInsightsQuery>;

export const TourInsightsFilters = z.object({
  region: TourRegion,
  ageGrp: TourAgeGrp.nullable(),
  gender: TourGender.nullable(),
  accompany: z.string().nullable(),
  month: z.number().int().nullable(),
  nights: z.number().int().nullable(),
});
export type TourInsightsFiltersType = z.infer<typeof TourInsightsFilters>;

export const TourTypeStat = z.object({
  type: z.string(),
  n: z.number().int(),
  mean: z.number().nullable(),
  stayMedian: z.number().nullable(),
  spendPpMedian: z.number().nullable(),
});
export const TourTransitionStat = z.object({ from: z.string(), to: z.string(), n: z.number().int() });
export const TourEmdStat = z.object({ sigungu: z.string().nullable(), emd: z.string(), n: z.number().int(), mean: z.number().nullable() });
export const TourSpendCategoryStat = z.object({ category: z.string(), n: z.number().int(), total: z.number(), median: z.number().nullable() });
export const TourMvmnStat = z.object({ label: z.string(), n: z.number().int(), medianMin: z.number().nullable() });
export const TourAgeGenderStat = z.object({ ageGrp: z.string(), gender: z.string(), n: z.number().int() });

export const TourInsightsResult = z.object({
  filters: TourInsightsFilters,
  insufficient: z.boolean(),
  scale: z.object({
    trips: z.number().int(),
    visits: z.number().int(),
    places: z.number().int(),
    restaurants: z.number().int(),
    spendMedian: z.number().nullable(),
  }),
  nights: z.array(TourCount),
  months: z.array(TourCount),
  accompany: z.array(TourGroupStat),
  // 유형별 24시간 도착 분포(식당·자연·숙소·상업).
  hourType: z.array(z.object({ type: z.string(), hours: z.array(z.number().int()).length(24) })),
  typeSat: z.array(TourTypeStat),
  transitions: z.array(TourTransitionStat),
  templates: z.array(TourCount),
  emd: z.array(TourEmdStat),
  reasons: z.array(TourCount),
  spendComposition: z.array(TourSpendCategoryStat),
  tripSpend: z.object({ p10: z.number(), median: z.number(), p90: z.number() }).nullable(),
  mvmn: z.array(TourMvmnStat),
  // 거점(공항·역·터미널 — 지역별 utils TOUR_REGIONS.hubs) 다음 첫 목적지. hubLabel 은 화면 제목.
  airportNext: z.array(TourPlaceRef),
  hubLabel: z.string(),
  residence: z.array(TourCount),
  ageGender: z.array(TourAgeGenderStat),
  sampleLabel: z.string(),
  sourceNote: z.string(),
});
export type TourInsightsResultType = z.infer<typeof TourInsightsResult>;

// 코스 추천 입력 — 조건이 맞는 여행이 20건 미만이면 month → gender → nights → ageGrp 순으로 풀며(relaxed 에 기록) 찾는다.
export const TourPlanBody = z.object({
  region: TourRegion.default('jeju'),
  ageGrp: TourAgeGrp.optional(),
  gender: TourGender.optional(),
  accompany: z.string().trim().min(1).max(40).optional(),
  month: z.number().int().min(4).max(9).optional(),
  nights: z.number().int().min(0).max(4).optional(),
});
export type TourPlanBodyType = z.infer<typeof TourPlanBody>;

export const TourPlanPlace = z.object({
  name: z.string(),
  kind: z.string(),
  sigungu: z.string().nullable(),
  emd: z.string().nullable(),
  // 방문 여행 수(≥5) · 평균 만족도 · 점수 = n × (mean − 3.3).
  n: z.number().int(),
  mean: z.number().nullable(),
  score: z.number(),
  // 등록된 맛집이면 네이버 placeId(상세 링크·그룹투표 후보), 아니면 null.
  placeId: z.string().nullable(),
});
export type TourPlanPlaceType = z.infer<typeof TourPlanPlace>;

export const TourPlanResult = z.object({
  matchedTrips: z.number().int(),
  relaxed: z.array(z.string()),
  insufficient: z.boolean(),
  places: z.array(TourPlanPlace),
  templates: z.array(TourCount),
  sampleLabel: z.string(),
  sourceNote: z.string(),
});
export type TourPlanResultType = z.infer<typeof TourPlanResult>;

// ── 6차 공개 — 지도 밀도 격자·숙소 통계·지역 비교 ─────────────────────────────────────
// 밀도: 공개 방문(좌표 있음)을 0.02° 격자로 센 칸 — 여행자 5명 미만 칸은 없다. bbox 는 선택(없으면 전국 칸 전부, 수백 개).
export const TourDensityKind = z.enum(['all', 'restaurant']);
export type TourDensityKindType = z.infer<typeof TourDensityKind>;
export const TourDensityQuery = z.object({
  kind: TourDensityKind.default('all'),
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'bbox must be "minLng,minLat,maxLng,maxLat"')
    .optional(),
});
export type TourDensityQueryType = z.infer<typeof TourDensityQuery>;
// x = floor(lng/cellDeg), y = floor(lat/cellDeg). n = 방문 수, travelers = 서로 다른 여행 수(≥ 5).
export const TourDensityCell = z.object({ x: z.number().int(), y: z.number().int(), n: z.number().int(), travelers: z.number().int() });
export type TourDensityCellType = z.infer<typeof TourDensityCell>;
export const TourDensityResult = z.object({
  kind: TourDensityKind,
  cellDeg: z.number(),
  cells: z.array(TourDensityCell),
  // 칸 방문 수의 20/40/60/80 분위 — 5등급 색칠 경계.
  breaks: z.array(z.number()).length(4),
  total: z.object({ cells: z.number().int(), visits: z.number().int() }),
  sampleLabel: z.string(),
  sourceNote: z.string(),
});
export type TourDensityResultType = z.infer<typeof TourDensityResult>;

// 숙소 — 숙박 결제(소비 표) × 숙소 방문 평가. 유형은 원본 숙박 유형명(호텔·펜션·콘도미니엄/리조트·게스트하우스…).
export const TourLodgingTypeStat = z.object({
  label: z.string(),
  // 결제 건수(금액 > 0) · 이용 여행 수(≥ 5).
  n: z.number().int(),
  trips: z.number().int(),
  // 결제 1건 중앙 · 1박 추정 중앙(결제액 × 그 여행의 숙박 건수 ÷ 박수) · 1인 중앙 — 금액 3건 미만이면 null.
  amountMedian: z.number().nullable(),
  nightlyMedian: z.number().nullable(),
  perPersonMedian: z.number().nullable(),
  // 예약 비율(0~1) — 예약 여부가 기록된 결제 기준.
  rsvtRate: z.number().nullable(),
  // 숙소 방문 평가 건수·평균 만족도(3건 미만이면 null).
  visits: z.number().int(),
  mean: z.number().nullable(),
});
export type TourLodgingTypeStatType = z.infer<typeof TourLodgingTypeStat>;
export const TourLodgingResult = z.object({
  filters: TourInsightsFilters,
  insufficient: z.boolean(),
  total: z.object({ trips: z.number().int(), withLodging: z.number().int(), rsvtRate: z.number().nullable() }),
  types: z.array(TourLodgingTypeStat),
  sampleLabel: z.string(),
  sourceNote: z.string(),
});
export type TourLodgingResultType = z.infer<typeof TourLodgingResult>;

// 지역 비교 — region=jeju 는 제주시·서귀포시·부속섬(우도·마라도 …) 3집단, 시도·서부권은 시군구 집단(방문 수 상위, 여행 5건 이상).
// 필터는 인사이트와 같은 축. key 는 집단 식별자(jeju-si | seogwipo | island | 시군구 이름).
export const TourRegionKey = z.string().min(1).max(40);
export type TourRegionKeyType = z.infer<typeof TourRegionKey>;
export const TourRegionGroup = z.object({
  key: TourRegionKey,
  label: z.string(),
  trips: z.number().int(),
  visits: z.number().int(),
  // 제주 공개 방문 중 비중(0~1).
  share: z.number(),
  mean: z.number().nullable(),
  // 식당 방문 수·식당 만족도.
  restaurants: z.number().int(),
  restaurantMean: z.number().nullable(),
  stayMedian: z.number().nullable(),
  spendPpMedian: z.number().nullable(),
  topTypes: z.array(TourCount),
  topEmd: z.array(TourCount),
});
export type TourRegionGroupType = z.infer<typeof TourRegionGroup>;
export const TourRegionEmd = z.object({
  sigungu: z.string().nullable(),
  emd: z.string(),
  island: z.boolean(),
  n: z.number().int(),
  mean: z.number().nullable(),
  restaurants: z.number().int(),
  stayMedian: z.number().nullable(),
  spendPpMedian: z.number().nullable(),
});
export type TourRegionEmdType = z.infer<typeof TourRegionEmd>;
export const TourRegionsResult = z.object({
  filters: TourInsightsFilters,
  insufficient: z.boolean(),
  groups: z.array(TourRegionGroup),
  // 읍면동 상위(방문 5건 이상, 방문 수 내림차순, 최대 20).
  emd: z.array(TourRegionEmd),
  sampleLabel: z.string(),
  sourceNote: z.string(),
});
export type TourRegionsResultType = z.infer<typeof TourRegionsResult>;
