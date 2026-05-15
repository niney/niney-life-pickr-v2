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

export const CrawlEvent = z.discriminatedUnion('type', [
  z.object({
    seq: z.number().int(),
    type: z.literal('progress'),
    stage: CrawlStage,
    message: z.string().optional(),
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
