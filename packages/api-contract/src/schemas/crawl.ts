import { z } from 'zod';

export const CrawlMode = z.enum(['create', 'recrawl', 'update']);
export type CrawlModeType = z.infer<typeof CrawlMode>;

export const CrawlNaverPlaceInput = z.object({
  url: z.string().url(),
  mode: CrawlMode.default('create'),
});
export type CrawlNaverPlaceInputType = z.infer<typeof CrawlNaverPlaceInput>;

export const MenuItem = z.object({
  name: z.string(),
  price: z.string().nullable(),
  description: z.string().nullable(),
  recommend: z.boolean().nullable(),
  imageUrls: z.array(z.string().url()),
});
export type MenuItemType = z.infer<typeof MenuItem>;

export const ReviewThemeKeyword = z.object({
  code: z.string(),
  label: z.string(),
  count: z.number(),
});
export type ReviewThemeKeywordType = z.infer<typeof ReviewThemeKeyword>;

export const RatingDistributionBucket = z.object({
  score: z.number().nullable(),
  count: z.number(),
});
export type RatingDistributionBucketType = z.infer<typeof RatingDistributionBucket>;

export const ReviewStats = z.object({
  averageRating: z.number().nullable(),
  totalCount: z.number().nullable(),
  textReviewCount: z.number().nullable(),
  imageReviewCount: z.number().nullable(),
  authorCount: z.number().nullable(),
  themeKeywords: z.array(ReviewThemeKeyword),
  ratingDistribution: z.array(RatingDistributionBucket),
});
export type ReviewStatsType = z.infer<typeof ReviewStats>;

export const BlogReview = z.object({
  type: z.string(),
  title: z.string(),
  excerpt: z.string().nullable(),
  url: z.string().url(),
  thumbnailUrls: z.array(z.string().url()),
  date: z.string().nullable(),
  authorName: z.string().nullable(),
});
export type BlogReviewType = z.infer<typeof BlogReview>;

// Video media on a visitor review. `posterUrl` is a Naver-hosted JPEG
// (video-phinf.pstatic.net) suitable for the thumbnail proxy. `videoUrl`
// is a signed Akamai .mp4 — short-lived and CDN-direct, NOT proxied.
export const VisitorReviewVideo = z.object({
  posterUrl: z.string().url(),
  videoUrl: z.string().url(),
});
export type VisitorReviewVideoType = z.infer<typeof VisitorReviewVideo>;

export const VisitorReview = z.object({
  authorName: z.string().nullable(),
  rating: z.number().nullable(),
  body: z.string(),
  visitedAt: z.string().nullable(),
  imageUrls: z.array(z.string().url()),
  videos: z.array(VisitorReviewVideo).default([]),
  // Naver review id when present in the source (Apollo cache or wire). Used
  // by the persistence layer for dedup; FE clients can ignore it. Optional
  // because not every review entry carries one.
  externalId: z.string().nullable().optional(),
});
export type VisitorReviewType = z.infer<typeof VisitorReview>;

// What a `visitor_batch` SSE event carries: the actual rows that landed in
// the DB, with their server-assigned ids. Defined in this module (not in
// schemas/restaurant.ts) to avoid a circular import — restaurant.ts already
// imports from here.
export const PersistedVisitorReview = VisitorReview.extend({
  id: z.string(),
  externalId: z.string().nullable(),
  fetchedAt: z.string(),
});
export type PersistedVisitorReviewType = z.infer<typeof PersistedVisitorReview>;

export const NaverPlaceData = z.object({
  placeId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  address: z.string().nullable(),
  roadAddress: z.string().nullable(),
  phone: z.string().nullable(),
  businessHours: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  imageUrls: z.array(z.string().url()),
  rating: z.number().nullable(),
  reviewCount: z.number().nullable(),
  menus: z.array(MenuItem),
  reviewStats: ReviewStats.nullable(),
  blogReviews: z.array(BlogReview),
  visitorReviews: z.array(VisitorReview),
  rawSourceUrl: z.string().url(),
});
export type NaverPlaceDataType = z.infer<typeof NaverPlaceData>;

export const CrawlErrorCode = z.enum([
  'invalid_url',
  'unsupported_format',
  'redirect_failed',
  'fetch_failed',
  'parse_failed',
  'place_not_found',
  'rate_limited',
  'max_concurrent',
  'cancelled',
  'not_found',
  'forbidden',
]);
export type CrawlErrorCodeType = z.infer<typeof CrawlErrorCode>;

export const CrawlNaverPlaceResult = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    data: NaverPlaceData,
    fetchedAt: z.string(),
    durationMs: z.number(),
  }),
  z.object({
    ok: z.literal(false),
    error: CrawlErrorCode,
    message: z.string(),
    triedUrl: z.string().optional(),
  }),
]);
export type CrawlNaverPlaceResultType = z.infer<typeof CrawlNaverPlaceResult>;

// Job-based streaming model — SSE.
// Each event carries an incrementing seq used by clients to dedupe across
// reconnects. Stage names are coarse-grained — fine enough for a UI stepper,
// not so fine that they leak adapter implementation details.
export const CrawlStage = z.enum([
  'queued',
  'normalizing',
  'launching',
  'loading_main',
  'parsing_main',
  'loading_visitor',
  'paginating_visitor',
  'finalizing',
  'done',
]);
export type CrawlStageType = z.infer<typeof CrawlStage>;

// 크롤+요약 로그의 레벨. info 는 정상 단계 진입/완료, warn 은 재시도·복구
// 가능 이상, error 는 잡 또는 항목 실패. UI 필터·배지 색의 입력.
export const CrawlLogLevel = z.enum(['info', 'warn', 'error']);
export type CrawlLogLevelType = z.infer<typeof CrawlLogLevel>;

export const CrawlEvent = z.discriminatedUnion('type', [
  z.object({
    seq: z.number().int(),
    type: z.literal('progress'),
    stage: CrawlStage,
    message: z.string().optional(),
    at: z.string(),
  }),
  // 단계별 로그. progress 보다 더 세밀한 디버그/관찰용 — 모델·지연·attempt
  // 같은 메타가 함께 흐른다. stage 는 CrawlStage union 이 아닌 string —
  // 요약 파이프라인의 단계(summary_queue/summary_attempt 등)까지 같은
  // 채널로 흘려 보내기 위함. UI 는 'log' 타입을 별도 탭에서 누적 표시.
  z.object({
    seq: z.number().int(),
    type: z.literal('log'),
    level: CrawlLogLevel,
    stage: z.string(),
    message: z.string(),
    meta: z.record(z.unknown()).optional(),
    at: z.string(),
  }),
  // Main page parsed but visitor reviews still loading — UI can render the
  // place card immediately while visitor list streams in below.
  z.object({
    seq: z.number().int(),
    type: z.literal('partial'),
    data: NaverPlaceData,
    at: z.string(),
  }),
  // Emitted on each "더보기" click during visitor pagination so UI can show
  // a live count without rebuilding the card.
  z.object({
    seq: z.number().int(),
    type: z.literal('visitor_progress'),
    count: z.number().int(),
    at: z.string(),
  }),
  // Emitted after a "더보기" page has been persisted to the DB. `addedCount`
  // is the post-dedup count actually inserted; the client uses this to drive
  // the AI summary progress UI without needing an extra round-trip.
  z.object({
    seq: z.number().int(),
    type: z.literal('visitor_batch'),
    reviews: z.array(VisitorReview),
    addedCount: z.number().int(),
    // The actually-INSERTed rows for this batch. Carries the DB ids and
    // fetchedAt so the client can merge directly into the detail cache,
    // avoiding a follow-up GET /restaurants/place/:placeId per batch.
    // `summary` is always null here — it'll be filled in by the
    // /summary-events SSE stream once AI summarization finishes.
    persistedReviews: z.array(PersistedVisitorReview),
    at: z.string(),
  }),
  z.object({
    seq: z.number().int(),
    type: z.literal('done'),
    result: CrawlNaverPlaceResult,
    at: z.string(),
  }),
  z.object({
    seq: z.number().int(),
    type: z.literal('error'),
    error: CrawlErrorCode,
    message: z.string(),
    at: z.string(),
  }),
]);
export type CrawlEventType = z.infer<typeof CrawlEvent>;

export const CrawlJobStatus = z.enum(['running', 'done', 'failed', 'cancelled']);
export type CrawlJobStatusType = z.infer<typeof CrawlJobStatus>;

export const CrawlJob = z.object({
  id: z.string(),
  url: z.string(),
  placeId: z.string().nullable(),
  status: CrawlJobStatus,
  stage: CrawlStage,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  visitorCount: z.number().int(),
  // Final result attached only when status !== 'running'.
  result: CrawlNaverPlaceResult.nullable(),
});
export type CrawlJobType = z.infer<typeof CrawlJob>;

export const StartCrawlInput = CrawlNaverPlaceInput;
export type StartCrawlInputType = z.infer<typeof StartCrawlInput>;

export const StartCrawlResult = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    jobId: z.string(),
    // Server may dedupe and return an existing in-flight jobId.
    deduped: z.boolean(),
    // True if the actor is at the concurrency cap and this job is waiting in
    // the FIFO queue. The job will start automatically when a slot frees.
    // SSE subscribers see stage='queued' until then.
    queued: z.boolean().optional(),
  }),
  z.object({
    ok: z.literal(false),
    error: CrawlErrorCode,
    message: z.string(),
    triedUrl: z.string().optional(),
  }),
]);
export type StartCrawlResultType = z.infer<typeof StartCrawlResult>;

export const CrawlJobListResult = z.object({
  jobs: z.array(CrawlJob),
});
export type CrawlJobListResultType = z.infer<typeof CrawlJobListResult>;

// ── 키워드 검색 (어드민 /discover 페이지) ────────────────────────────────
// 네이버 PC 지도 검색 결과를 그대로 노출. id 가 placeId, x/y 가 lng/lat.
// rawSourceUrl 은 url-normalizer 가 placeId 를 추출할 수 있는 정규 진입 URL.

export const NaverSearchResult = z.object({
  placeId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  address: z.string().nullable(),
  roadAddress: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  phone: z.string().nullable(),
  thumbnailUrl: z.string().url().nullable(),
  reviewCount: z.number().int().nullable(),
  // 검색 좌표(center)로부터의 거리 — nx-api 응답이 미리 포맷한 문자열
  // ("350m", "1.2km"). 좌표 없거나 응답에 없으면 null.
  distance: z.string().nullable(),
  rawSourceUrl: z.string().url(),
});
export type NaverSearchResultType = z.infer<typeof NaverSearchResult>;

// bbox: "minLng,minLat,maxLng,maxLat" — RestaurantsPage 의 bbox 와 같은 포맷.
const BboxString = z
  .string()
  .regex(
    /^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/,
    'Invalid bbox format (expected "minLng,minLat,maxLng,maxLat")',
  );

export const CrawlSearchQuery = z.object({
  q: z.string().min(1).max(100),
  bbox: BboxString.optional(),
});
export type CrawlSearchQueryType = z.infer<typeof CrawlSearchQuery>;

// source 는 어떤 어댑터가 응답을 만들었는지 노출 — 운영 중 폴백 발동 여부를
// UI 디버그 배지나 로그에서 확인할 수 있게. 'http' 는 nx-api GraphQL 직접
// 호출(현 default), 'playwright' 는 옛 PC `allSearch` 페이지 캡처 방식 — 캡차
// 차단으로 사용 안 함이지만 enum 에 남겨 두었다가 나중에 정리.
export const CrawlSearchResult = z.object({
  items: z.array(NaverSearchResult),
  source: z.enum(['http', 'playwright']),
});
export type CrawlSearchResultType = z.infer<typeof CrawlSearchResult>;

// ── 캐치테이블 키워드 검색 (어드민 /catchtable-test 페이지) ────────────────
// 캐치테이블 자체 검색 API(`POST /api/v6/search/list`) 응답을 정규화.
// 검색은 캐치테이블 가맹점 한정(contractedOnly default=true). 직접 호출 시 CF
// 봇 보호에 막히므로 어댑터가 페이지를 띄워 그 안에서 fetch 한다.

export const CatchtableSearchResult = z.object({
  shopRef: z.string(),
  shopName: z.string(),
  foodKind: z.string().nullable(),
  // 빌딩/위치 라벨 — 정규 주소가 아니라 "현대백화점 무역센터점" 같은 단축 라벨.
  landName: z.string().nullable(),
  // 캐치테이블 내부 base64 슬러그. shopRef 만으로도 정규 URL 이 잡힌다.
  urlPathAlias: z.string().nullable(),
  // /ct/shop/{shopRef} — 어드민이 새 탭으로 캐치테이블 상세 페이지 열 때 사용.
  rawSourceUrl: z.string().url(),
  imageUrl: z.string().url().nullable(),
  reviewCount: z.number().int(),
  avgScore: z.number().nullable(),
  shopPhone: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  // "OPEN" | "DAY_OFF" 등. UI 매핑은 호출자 책임.
  operationStatus: z.string().nullable(),
  // "DINING" | "WAITING" | "PICKUP".
  mainService: z.string().nullable(),
  badges: z.array(z.string()),
});
export type CatchtableSearchResultType = z.infer<typeof CatchtableSearchResult>;

export const CatchtableSearchQuery = z.object({
  q: z.string().min(1).max(100),
  // 백엔드 정렬 좌표 (서울시청 default).
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
  // 페이지네이션 토큰. 첫 호출은 미지정, 다음 호출은 직전 응답의 nextOffset.
  offset: z.string().optional(),
  // 1~30. 기본 30.
  limit: z.coerce.number().int().min(1).max(30).optional(),
  // 가맹점만 (default true).
  contractedOnly: z.coerce.boolean().optional(),
});
export type CatchtableSearchQueryType = z.infer<typeof CatchtableSearchQuery>;

export const CatchtableSearchResponse = z.object({
  items: z.array(CatchtableSearchResult),
  totalShopCount: z.number().int(),
  hasMore: z.boolean(),
  nextOffset: z.string().nullable(),
  source: z.literal('playwright'),
  // true 면 키워드가 백엔드에 매칭 안 되고 추천 DB fallback 으로 떨어진 상태.
  // UI 는 이 경우 "결과가 적절하지 않을 수 있다" 안내.
  fallback: z.boolean(),
  elapsedMs: z.number().int(),
});
export type CatchtableSearchResponseType = z.infer<typeof CatchtableSearchResponse>;

// ── 캐치테이블 가게 상세 (가벼운 미리보기) ──────────────────────────────────
// /ct/shop/{shopRef} 페이지 진입 시 자동 발사되는 응답을 가로채 정규화한다.
// 메뉴·리뷰는 lazy 영역이라 가게/contractState 에 따라 비어 있을 수 있어 nullable.

export const CatchtableShopImage = z.object({
  thumbUrl: z.string().url(),
  imgUrl: z.string().url(),
  imgWidth: z.number().int().nullable(),
  imgHeight: z.number().int().nullable(),
});

export const CatchtableShopSubway = z.object({
  lines: z.array(z.string()),
  station: z.string(),
  distance: z.string(),
});

export const CatchtableShopReview = z.object({
  averageScore: z.number().nullable(),
  totalCount: z.number().int(),
  blogReviewCount: z.number().int(),
  foodScore: z.number().nullable(),
  ambienceScore: z.number().nullable(),
  serviceScore: z.number().nullable(),
});

export const CatchtableShopScheduleDay = z.object({
  date: z.string().nullable(),
  dayOfWeek: z.string().nullable(),
  isClosed: z.boolean(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  breakStartTime: z.string().nullable(),
  breakEndTime: z.string().nullable(),
  lastOrderTime: z.string().nullable(),
});

export const CatchtableShopSchedule = z.object({
  today: CatchtableShopScheduleDay.nullable(),
  weekly: z.array(
    z.object({
      dayOfWeek: z.string(),
      isClosed: z.boolean(),
      startTime: z.string().nullable(),
      endTime: z.string().nullable(),
    }),
  ),
});

export const CatchtableShopPriceRange = z.object({
  lunchMin: z.number().nullable(),
  lunchMax: z.number().nullable(),
  dinnerMin: z.number().nullable(),
  dinnerMax: z.number().nullable(),
  lunchText: z.string().nullable(),
  dinnerText: z.string().nullable(),
});

export const CatchtableShopMenu = z.object({
  name: z.string(),
  price: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
});

export const CatchtableShopReviewSample = z.object({
  authorName: z.string().nullable(),
  score: z.number().nullable(),
  body: z.string(),
  visitedAt: z.string().nullable(),
});

export const CatchtableShopRelatedKeyword = z.object({
  label: z.string(),
  type: z.string(),
});

export const CatchtableShopMenuBoard = z.object({
  thumbUrl: z.string().url(),
  imageUrl: z.string().url(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  type: z.string().nullable(),
  regDate: z.string().nullable(),
});

export const CatchtableShopMenuItem = z.object({
  foodMenuSeq: z.number().int().nullable(),
  name: z.string(),
  minPrice: z.string().nullable(),
  maxPrice: z.string().nullable(),
  description: z.string().nullable(),
  isRecommended: z.boolean(),
  isNew: z.boolean(),
  isRepresentative: z.boolean(),
  imageUrl: z.string().url().nullable(),
});

export const CatchtableShopMenuDetailInfo = z.object({
  isKidsMenu: z.boolean().nullable(),
  kidsMenuGuide: z.string().nullable(),
  isAllergyMenuSubstitute: z.boolean().nullable(),
  allergyMenuSubstituteGuide: z.string().nullable(),
  isVeganMenuSubstitute: z.boolean().nullable(),
  veganMenuSubstituteGuide: z.string().nullable(),
  isAlcoholOrderRequired: z.boolean(),
  corkChargeGuide: z.string().nullable(),
  lastMenuUpdateDateTime: z.string().nullable(),
});

export const CatchtableShopMenusResponse = z.object({
  shopRef: z.string(),
  menuBoards: z.array(CatchtableShopMenuBoard),
  menus: z.array(CatchtableShopMenuItem),
  menuDetailInfo: CatchtableShopMenuDetailInfo.nullable(),
  fetchedAt: z.string(),
  elapsedMs: z.number().int(),
  source: z.literal('playwright'),
});
export type CatchtableShopMenusResponseType = z.infer<typeof CatchtableShopMenusResponse>;

// 캐치테이블 AI 가 만든 가게 한 줄 요약 + 3~4 문장 특징. 등록 검증 시 가게가
// 어떤 곳인지 한눈에 보는 용도로 매우 유용.
export const CatchtableShopReviewOverviewResponse = z.object({
  shopRef: z.string(),
  title: z.string().nullable(),
  sentences: z.array(z.string()),
  latestUpdateDate: z.string().nullable(),
  fetchedAt: z.string(),
  elapsedMs: z.number().int(),
  source: z.literal('playwright'),
});
export type CatchtableShopReviewOverviewResponseType = z.infer<typeof CatchtableShopReviewOverviewResponse>;

export const CatchtableShopData = z.object({
  shopRef: z.string(),
  alias: z.string().nullable(),
  shopName: z.string(),
  shopNameEn: z.string().nullable(),
  category: z.string().nullable(),
  landName: z.string().nullable(),
  serviceDesc: z.string().nullable(),
  address: z.string().nullable(),
  addressDetail: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  subways: z.array(CatchtableShopSubway),
  phone: z.string().nullable(),
  images: z.array(CatchtableShopImage),
  priceRange: CatchtableShopPriceRange,
  review: CatchtableShopReview,
  schedule: CatchtableShopSchedule.nullable(),
  disableDays: z.array(z.string()),
  awardItems: z.array(z.string()),
  relatedKeywords: z.array(CatchtableShopRelatedKeyword),
  bookmarkCount: z.number().int().nullable(),
  mainService: z.string().nullable(),
  contractState: z.string().nullable(),
  exposeCatchtable: z.boolean(),
  useOnline: z.boolean(),
  useCatchtable: z.boolean(),
  // lazy. 비가맹점이거나 영역 트리거 실패면 null.
  menus: z.array(CatchtableShopMenu).nullable(),
  reviewSamples: z.array(CatchtableShopReviewSample).nullable(),
  rawSourceUrl: z.string().url(),
  fetchedAt: z.string(),
  elapsedMs: z.number().int(),
  source: z.literal('playwright'),
});
export type CatchtableShopDataType = z.infer<typeof CatchtableShopData>;

// ── 다이닝코드 키워드 검색 (어드민 /diningcode-test 페이지) ──────────────────
// 다이닝코드 자체 검색 API(`POST /API/isearch/`) 응답을 정규화. CORS 가 열려
// 있고 CF 보호 없음이라 Playwright 불필요 — 네이버 nx-api 와 동일한 HTTP 어댑터.
// `query` 만 있어도 동작하고, lat/lng 박으면 "내주변" 모드로 자동 전환.

export const DiningcodeKeywordTag = z.object({
  // 메뉴/특성 키워드 (예: "백년가게", "테라스"). mark 1 이면 검색어 매칭 강조.
  term: z.string(),
  mark: z.number().int(),
});

export const DiningcodeDisplayReview = z.object({
  user_nm: z.string().nullable(),
  review_cont: z.string().nullable(),
  review_reg_dt: z.string().nullable(),
});

export const DiningcodeSearchResult = z.object({
  // 다이닝코드 placeId. profile.php?rid=<vRid> 진입의 그 rid.
  vRid: z.string(),
  name: z.string(),
  branch: z.string().nullable(),
  category: z.string().nullable(),
  address: z.string().nullable(),
  roadAddress: z.string().nullable(),
  // 행정동 등 다중 영역 (예: ["은행동", "중구"]).
  areas: z.array(z.string()),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  phone: z.string().nullable(),
  // 다이닝코드 자체 점수 (0~100, 빅데이터 기반 랭킹).
  score: z.number().int().nullable(),
  // 사용자 평균 평점 (1~5).
  userScore: z.number().nullable(),
  reviewCount: z.number().int(),
  thumbnailUrl: z.string().url().nullable(),
  imageUrls: z.array(z.string().url()),
  // "영업 중" / "영업 종료" 등 응답 그대로. UI 매핑 책임은 호출자.
  openStatus: z.string().nullable(),
  // nx-api 의 distance 와 비슷한 포맷 문자열 — 좌표 검색 시에만 채워짐.
  distance: z.string().nullable(),
  keywords: z.array(DiningcodeKeywordTag),
  displayReview: DiningcodeDisplayReview.nullable(),
  // /profile.php?rid=<vRid> — 어드민이 새 탭으로 다이닝코드 상세를 여는 용도.
  rawSourceUrl: z.string().url(),
});
export type DiningcodeSearchResultType = z.infer<typeof DiningcodeSearchResult>;

// 다이닝코드는 `data` querystring 으로 from/size 를 JSON 인코딩해 받지만
// 어댑터가 그 변환을 흡수하고, 호출자는 평탄한 파라미터만 본다.
export const DiningcodeSearchQuery = z.object({
  q: z.string().min(1).max(100),
  // 0-based offset (다이닝코드 API 의 `from`).
  from: z.coerce.number().int().min(0).max(10000).optional(),
  // 1~30. 기본 20. (서버에서 더 큰 값도 받지만 검증 도구로 충분).
  size: z.coerce.number().int().min(1).max(30).optional(),
  // 정렬 — 미지정 시 다이닝코드 기본 랭킹(r_score). UI 셀렉트의 값을 그대로.
  order: z.enum(['r_score', 'score', 'review', 'distance']).optional(),
  // 좌표 박으면 검색 모드가 "내주변" 으로 전환되고, 응답의 region 이
  // "내주변" 으로 표시된다. lat/lng 둘 다 있어야 의미 있음 — 한쪽만 들어오면
  // 어댑터가 무시.
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  // 반경(m). 좌표 동반 시에만 의미. 미지정 시 다이닝코드 기본 500.
  distance: z.coerce.number().int().min(50).max(20000).optional(),
});
export type DiningcodeSearchQueryType = z.infer<typeof DiningcodeSearchQuery>;

// 응답에 같이 실리는 다이닝코드 특유의 메타. 어드민 검증 페이지가 별도
// 패널로 노출해 "이 영역에서 다이닝코드가 어떤 키워드를 인기로 보는지" 등을
// 한눈에 확인할 수 있게 한다. 모두 nullable — 좌표/지역 시그널이 없을 때 비어옴.
export const DiningcodeSearchMeta = z.object({
  // 응답이 인식한 검색 영역 — "강남" / "내주변" 등.
  region: z.string().nullable(),
  // 자동 추론된 영역명 (region 과 살짝 다른 키, 응답에 둘 다 있을 때 별도 노출).
  regionName: z.string().nullable(),
  // 다이닝코드가 매긴 실제 매칭 수. total 은 10000 캡이 걸려있어 비교 부정확,
  // 진짜 매칭 카운트는 rcount.
  rcount: z.number().int().nullable(),
  // 적용된 정렬 — 서버가 정규화해 돌려준 값. 호출자가 보낸 order 와 다를 수 있음.
  order: z.string().nullable(),
  // "ranking_search" 등.
  searchType: z.string().nullable(),
  // 응답이 추천하는 대체 검색어 (오타·유사어 보정).
  altQueries: z.array(z.string()),
  // "강남" 검색 시 가는 동·역 이름들.
  relatedRegions: z.array(z.string()),
  // 이 영역/키워드의 연관 검색어.
  relatedKeywords: z.array(z.string()),
  // 이 지역의 인기 메뉴/카테고리 키워드.
  regionMainKeywords: z.array(z.string()),
});
export type DiningcodeSearchMetaType = z.infer<typeof DiningcodeSearchMeta>;

export const DiningcodeSearchResponse = z.object({
  items: z.array(DiningcodeSearchResult),
  // total 은 10000 캡 — 정확한 매칭 수는 meta.rcount.
  total: z.number().int(),
  // 적용된 from/size 를 그대로 돌려줌 (서버 echo).
  from: z.number().int(),
  size: z.number().int(),
  // hasMore 는 from+size < total 이면서 응답 items 가 비지 않은 경우 true.
  hasMore: z.boolean(),
  meta: DiningcodeSearchMeta,
  source: z.literal('http'),
  elapsedMs: z.number().int(),
  // 좌표+반경 동반 시 어댑터가 클라이언트 측 후필터링으로 잘라낸 항목 수.
  // > 0 이면 다이닝코드 API 가 반경 밖 결과를 끼워보냈다는 신호 — UI 가
  // "키워드 매칭이 반경 안에 없어 광역 결과를 숨겼습니다" 안내를 띄울 수 있다.
  filteredOutCount: z.number().int(),
});
export type DiningcodeSearchResponseType = z.infer<typeof DiningcodeSearchResponse>;

// ── 다이닝코드 가게 상세 (어드민 /diningcode-test/:vRid) ────────────────────
// POST /API/profile/ 한 방에 가게 기본·메뉴·사진·리뷰(첫 페이지)·블로그·평점
// 분포 + 워드클라우드 등이 모두 옴. 같은 endpoint 를 tab=review&page=N 으로
// 다시 호출해 리뷰 페이지를 따로 받을 수 있어, 페이지 단위 lazy 호출은
// DiningcodeShopReviewsResponse 로 분리한다.

export const DiningcodeShopImage = z.object({
  pdId: z.string().nullable(),
  origin: z.string().url(),
  thumb: z.string().url(),
  middle: z.string().url(),
  // 사용자 사진(photo 섹션)에만 채워짐. restaurant.images.list 는 익명 표시 이미지.
  uploaderName: z.string().nullable(),
  uploaderProfileImg: z.string().url().nullable(),
  // "2일 전" 같은 다이닝코드 자체 포맷. 정규 datetime 아님.
  date: z.string().nullable(),
  // "user" / "owner" 등.
  type: z.string().nullable(),
});

export const DiningcodeShopReviewImage = z.object({
  pdId: z.string().nullable(),
  // "PHOTO" / "VIDEO" 등 응답 그대로.
  type: z.string(),
  origin: z.string().url(),
  thumb: z.string().url(),
  middle: z.string().url(),
});

// 리뷰 단건. 다이닝코드는 점수 5개 카테고리 — 종합은 정수(1~5), 세부는 문자열
// 라벨("좋음"/"보통"/"나쁨"). UI 매핑은 호출자 책임.
export const DiningcodeShopReview = z.object({
  rvId: z.string(),
  vRvid: z.string(),
  vUid: z.string(),
  userName: z.string().nullable(),
  userProfileImg: z.string().url().nullable(),
  // "NORMAL_TASTER" 등 코드. dc_level.title 은 빈 string 빈번 — text 와 별개.
  userLevelCode: z.string().nullable(),
  // "5월 2일" / "13일 전" 등 다이닝코드 포맷.
  reviewDt: z.string(),
  totalScore: z.number().int().nullable(),
  // 세부 점수는 라벨 텍스트("좋음" 등) — 응답 정수 아님.
  tasteScore: z.string().nullable(),
  serviceScore: z.string().nullable(),
  priceScore: z.string().nullable(),
  cleanScore: z.string().nullable(),
  content: z.string().nullable(),
  keywords: z.array(z.string()),
  images: z.array(DiningcodeShopReviewImage),
  // 리뷰어가 주문한 메뉴들.
  orderMenu: z.array(z.string()),
  // 사장 답글. 없으면 null.
  replyComment: z.string().nullable(),
  replyDt: z.string().nullable(),
  replyPartner: z.string().nullable(),
  favoritesCount: z.number().int(),
  // 우리 DB 의 ReviewSummary.text 와 join 결과. DB에 미저장이거나 분석 status!=done
  // 이면 null. 어댑터는 항상 null 로 채우고, 서비스 레이어가 (source='diningcode',
  // sourceId=vRid) 인 Restaurant 의 Review.externalId='dc:rv:<rvId>' 매칭으로 주입.
  summaryText: z.string().nullable(),
});
export type DiningcodeShopReviewType = z.infer<typeof DiningcodeShopReview>;

export const DiningcodeShopReviewsSection = z.object({
  page: z.number().int(),
  totalCount: z.number().int(),
  totalPage: z.number().int(),
  list: z.array(DiningcodeShopReview),
});
export type DiningcodeShopReviewsSectionType = z.infer<typeof DiningcodeShopReviewsSection>;

export const DiningcodeShopMenu = z.object({
  name: z.string(),
  price: z.string().nullable(),
  description: z.string().nullable(),
  rank: z.number().int(),
  // 인기 메뉴 플래그 (best 1 → true).
  best: z.boolean(),
  selectionCount: z.number().int(),
  selectionRate: z.number().int(),
  reviewCount: z.number().int(),
  commentCount: z.number().int(),
});

export const DiningcodeShopBlog = z.object({
  pId: z.string(),
  title: z.string(),
  // 다이닝코드가 https 미접두 URL 을 그대로 박아 보내는 경우가 있어 nullable 처리.
  url: z.string(),
  // 본문 발췌 (다이닝코드가 잘라서 보내는 길이).
  contents: z.string().nullable(),
  nickname: z.string().nullable(),
  // 빈 string 빈번 — 어댑터가 빈 string 을 null 로 정규화한다.
  image: z.string().nullable(),
  // "naver" / "tistory" 등.
  site: z.string().nullable(),
  // "11시간 전" 등.
  date: z.string().nullable(),
});

export const DiningcodeShopBlogsSection = z.object({
  page: z.number().int(),
  totalPage: z.number().int(),
  list: z.array(DiningcodeShopBlog),
});

// detail.bhour / bhour_seo 의 한 항목. bhour 는 7일치 (오늘 포함), bhour_seo 는
// 요약("매일 08:00-22:00" 한 줄).
export const DiningcodeShopBusinessHour = z.object({
  duration: z.string(),
  time: z.string(),
  today: z.boolean(),
});

export const DiningcodeShopStatus = z.object({
  // "영업 중" / "영업 종료" / "휴무" 등.
  isOpen: z.string().nullable(),
  color: z.string().nullable(),
  // "영업시간: 08:00 - 22:00" 등.
  time: z.string().nullable(),
});

// 평점 분포 한 카테고리 (taste/service/price/clean) — good/normal/bad 3가지 비율.
export const DiningcodeShopScoreSlice = z.object({
  text: z.string().nullable(),
  percent: z.number().int(),
});

export const DiningcodeShopScoreBucket = z.object({
  average: z.number().nullable(),
  good: DiningcodeShopScoreSlice,
  normal: DiningcodeShopScoreSlice,
  bad: DiningcodeShopScoreSlice,
});

export const DiningcodeShopScore = z.object({
  average: z.number().nullable(),
  total: z.number().int(),
  reviewTotal: z.number().int(),
  taste: z.number().nullable(),
  service: z.number().nullable(),
  price: z.number().nullable(),
  clean: z.number().nullable(),
  // 별점 분포 (5/4.5/4/3.5/3/2/1). 다이닝코드가 string 으로 주는 카운트.
  distribution: z.object({
    s5: z.number().int(),
    s4_5: z.number().int(),
    s4: z.number().int(),
    s3_5: z.number().int(),
    s3: z.number().int(),
    s2: z.number().int(),
    s1: z.number().int(),
  }),
  tasteInfo: DiningcodeShopScoreBucket.nullable(),
  priceInfo: DiningcodeShopScoreBucket.nullable(),
  serviceInfo: DiningcodeShopScoreBucket.nullable(),
  cleanInfo: DiningcodeShopScoreBucket.nullable(),
  // "이 음식점의 평가결과는 신뢰할 수 있을 만큼 이루어졌습니다." 등 안내.
  text: z.string().nullable(),
});

export const DiningcodeShopData = z.object({
  vRid: z.string(),
  // rn (가게 본 이름)
  name: z.string(),
  // "본점" 등 branch — 없는 가게 다수.
  branch: z.string().nullable(),
  // "성심당 본점" — rn + branch 결합 응답 그대로.
  fullName: z.string(),
  // "은행동" 등 행정동 1개. (검색 결과의 area[]와 달리 단일 string.)
  area: z.string().nullable(),
  categories: z.array(z.string()),
  // 특징 키워드 ("시끌벅적한", "저렴" 등).
  descTags: z.array(z.string()),
  // 다이닝코드 0~100.
  score: z.number().int().nullable(),

  address: z.string().nullable(),
  roadAddress: z.string().nullable(),
  phone: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),

  thumbnailUrl: z.string().url().nullable(),
  // restaurant.images.list — 가게 대표 사진들 (anonymous, photo 섹션과 별개).
  images: z.array(DiningcodeShopImage),
  // photo.list — 사용자 사진 12장 (date, uploaderName 풍부).
  photos: z.array(DiningcodeShopImage),

  // detail.tag — "백년가게" 등 인증/특징.
  tags: z.array(z.string()),
  // detail.facility — "테라스", "주차" 등.
  facilities: z.array(z.string()),
  status: DiningcodeShopStatus.nullable(),
  // 7일치 영업시간.
  businessHours: z.array(DiningcodeShopBusinessHour),
  // bhour_seo — "매일 08:00-22:00" 한 줄 요약(들).
  businessHoursSummary: z.array(DiningcodeShopBusinessHour),

  menus: z.array(DiningcodeShopMenu),
  menuTotalCount: z.number().int(),
  hasPopularMenu: z.boolean(),

  scoreDetail: DiningcodeShopScore.nullable(),

  // 응답 첫 페이지 리뷰. 페이지네이션은 별도 endpoint(/reviews?page=N) 사용.
  reviewsFirstPage: DiningcodeShopReviewsSection,
  // 응답 첫 페이지 블로그. blog 도 페이지네이션 가능하지만 1차 스코프에선 첫 페이지만.
  blogsFirstPage: DiningcodeShopBlogsSection,

  // 워드클라우드 이미지 — tag.word (PC 사이즈 기본). word_w/word_m 은 wide/mobile 변형.
  wordcloudUrl: z.string().url().nullable(),
  wordcloudUrlMobile: z.string().url().nullable(),

  // /profile.php?rid=<vRid> — 어드민이 새 탭으로 다이닝코드 원본을 열 때 쓰는 URL.
  rawSourceUrl: z.string().url(),
  fetchedAt: z.string(),
  elapsedMs: z.number().int(),
  source: z.literal('http'),
});
export type DiningcodeShopDataType = z.infer<typeof DiningcodeShopData>;

// 리뷰 페이지네이션 응답 — 가게 메타 없이 리뷰 한 페이지만. 호출이 가볍게
// 끝나도록 reviewsFirstPage 의 shape 만 그대로 + vRid 식별자.
export const DiningcodeShopReviewsResponse = z.object({
  vRid: z.string(),
  page: z.number().int(),
  totalCount: z.number().int(),
  totalPage: z.number().int(),
  list: z.array(DiningcodeShopReview),
  source: z.literal('http'),
  elapsedMs: z.number().int(),
});
export type DiningcodeShopReviewsResponseType = z.infer<typeof DiningcodeShopReviewsResponse>;

// 다이닝코드 가게를 DB 에 저장(+AI 분석 큐잉) 결과. POST /API/crawl/diningcode/:vRid/save.
// 라우트는 모든 페이지의 리뷰를 끌어와 persistReviewBatch 후 SummaryService 큐에 태운다.
export const SaveDiningcodeShopResult = z.object({
  vRid: z.string(),
  // Restaurant.id (cuid).
  restaurantId: z.string(),
  // 끌어온 총 리뷰 페이지 수 (첫 페이지 포함).
  fetchedPages: z.number().int(),
  // 응답의 total — 다이닝코드가 보고한 리뷰 총수.
  totalReviewsReported: z.number().int(),
  // persistReviewBatch 결과 신규 저장된 리뷰 개수 (dedup 후).
  newReviewCount: z.number().int(),
  // queueSummariesForReviews 에 태운 reviewId 개수 (= newReviewCount).
  queuedForAnalysis: z.number().int(),
  elapsedMs: z.number().int(),
});
export type SaveDiningcodeShopResultType = z.infer<typeof SaveDiningcodeShopResult>;

// ── 다이닝코드 정식 페이지 (/admin/diningcode) 전용 ─────────────────────────
// 검색 결과 카드에 '등록됨' 배지를 띄우기 위해 vRid 들이 이미 DB 에 있는지 확인.
// vRid 다수를 한 번에 조회하는 가벼운 GET — restaurants where (source='diningcode',
// sourceId IN (ids)). 결과는 vRid → { restaurantId, canonicalId } map.

export const DiningcodeRegisteredQuery = z.object({
  // 콤마 분리 vRid 목록. URL 길이 안전 범위 — 한 페이지 카드 30개 기준 충분.
  ids: z.string().min(1).max(4000),
});
export type DiningcodeRegisteredQueryType = z.infer<typeof DiningcodeRegisteredQuery>;

export const DiningcodeRegisteredEntry = z.object({
  vRid: z.string(),
  restaurantId: z.string(),
  canonicalId: z.string(),
});
export type DiningcodeRegisteredEntryType = z.infer<typeof DiningcodeRegisteredEntry>;

export const DiningcodeRegisteredResult = z.object({
  // 등록된 행만 포함 — vRid 가 결과에 없으면 미등록.
  items: z.array(DiningcodeRegisteredEntry),
});
export type DiningcodeRegisteredResultType = z.infer<typeof DiningcodeRegisteredResult>;

// ── 다이닝코드 일괄 저장 잡 (SSE) ───────────────────────────────────────────
// 어드민 페이지에서 결과 카드 다수 선택 후 일괄 저장. 한 vRid 가 끝날 때마다
// item 이벤트, 전부 끝나면 done. 패턴은 menu-grouping 잡과 거의 동일.

export const DiningcodeBulkSaveJobInput = z.object({
  // 최대 50개 — 다이닝코드 부담 의식해 보수적으로 잡음. 더 큰 batch 가 필요해지면
  // 어댑터의 페이지 간 200ms 간격과 함께 재검토.
  vRids: z.array(z.string().min(1).max(80)).min(1).max(50),
});
export type DiningcodeBulkSaveJobInputType = z.infer<typeof DiningcodeBulkSaveJobInput>;

export const DiningcodeBulkSaveJobState = z.enum(['pending', 'running', 'done', 'failed']);
export type DiningcodeBulkSaveJobStateType = z.infer<typeof DiningcodeBulkSaveJobState>;

export const DiningcodeBulkSaveJobItemState = z.enum([
  'pending',
  'running',
  'done',
  'failed',
  'skipped',
]);
export type DiningcodeBulkSaveJobItemStateType = z.infer<typeof DiningcodeBulkSaveJobItemState>;

export const DiningcodeBulkSaveJobItem = z.object({
  vRid: z.string(),
  state: DiningcodeBulkSaveJobItemState,
  // 성공 시 채워짐 — UI 에서 "등록된 가게 보기" link.
  restaurantId: z.string().nullable(),
  // 끌어온 리뷰 페이지 수 (성공 시).
  fetchedPages: z.number().int().nullable(),
  // 신규 저장된 리뷰 수 (dedup 후, 성공 시).
  newReviewCount: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type DiningcodeBulkSaveJobItemType = z.infer<typeof DiningcodeBulkSaveJobItem>;

export const DiningcodeBulkSaveJobSnapshot = z.object({
  jobId: z.string(),
  state: DiningcodeBulkSaveJobState,
  total: z.number().int(),
  doneCount: z.number().int(),
  failedCount: z.number().int(),
  skippedCount: z.number().int(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  items: z.array(DiningcodeBulkSaveJobItem),
});
export type DiningcodeBulkSaveJobSnapshotType = z.infer<typeof DiningcodeBulkSaveJobSnapshot>;

// SSE per-event — snapshot/item/done. menu-grouping 과 동일 shape.
export const DiningcodeBulkSaveJobItemEvent = z.object({
  type: z.literal('item'),
  jobId: z.string(),
  item: DiningcodeBulkSaveJobItem,
});
export type DiningcodeBulkSaveJobItemEventType = z.infer<
  typeof DiningcodeBulkSaveJobItemEvent
>;

export const DiningcodeBulkSaveJobDoneEvent = z.object({
  type: z.literal('done'),
  jobId: z.string(),
  state: DiningcodeBulkSaveJobState,
  finishedAt: z.string(),
});
export type DiningcodeBulkSaveJobDoneEventType = z.infer<
  typeof DiningcodeBulkSaveJobDoneEvent
>;

// ── 크롤+요약 잡 로그 조회 ─────────────────────────────────────────────────
// SSE 의 실시간 'log' 이벤트와 동일한 데이터를 DB 에 영속화해, 잡 종료 후에도
// 어드민 패널에서 로그 탭을 다시 열 수 있게 한다. 페이지네이션은 createdAt
// 기준 cursor — 같은 ms 충돌 회피를 위해 id 도 cursor 토큰에 포함된다.

export const CrawlJobLogEntry = z.object({
  id: z.string(),
  jobId: z.string(),
  placeId: z.string().nullable(),
  stage: z.string(),
  level: CrawlLogLevel,
  message: z.string(),
  // 모델·지연ms·토큰·attempt 등 디버깅 메타. parse_failed 의 경우 rawSnippet
  // (응답 앞 ~200 자) 도 여기에. JSON 직렬화 가능한 값만 들어옴.
  meta: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
});
export type CrawlJobLogEntryType = z.infer<typeof CrawlJobLogEntry>;

export const CrawlJobLogsQuery = z.object({
  // 다음 페이지 토큰. 응답 nextCursor 를 그대로 전달. 미지정이면 최신부터.
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  level: CrawlLogLevel.optional(),
  // 단계 필터 — exact match. 'summary' 처럼 접두 매칭이 필요해지면 후속.
  stage: z.string().optional(),
});
export type CrawlJobLogsQueryType = z.infer<typeof CrawlJobLogsQuery>;

export const CrawlJobLogsResult = z.object({
  // 최신 → 과거 순. UI 는 표시 시 다시 뒤집어 시간 오름차순으로 보여줄 수 있음.
  items: z.array(CrawlJobLogEntry),
  nextCursor: z.string().nullable(),
});
export type CrawlJobLogsResultType = z.infer<typeof CrawlJobLogsResult>;
