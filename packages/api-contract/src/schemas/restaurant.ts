import { z } from 'zod';
import { CategoryTreeNode } from './analytics.js';
import { CanonicalSuggestion } from './canonical.js';
import {
  BlogReview,
  CrawlLogLevel,
  DiningcodeShopBusinessHour,
  MenuItem,
  NaverPlaceData,
  TablingBusinessDay,
  TablingRatingItem,
  TablingServiceFlags,
  VisitorReview,
} from './crawl.js';

// 단계 의미:
//   queued    — queueSummariesForReviews 진입 시점에 즉시 박힘. chain 대기.
//               chain 휘발(서버 재시작) 시 흔적이 사라지지 않도록 한 안전망.
//   pending   — run() 진입 후 청크에 할당되기 직전. 이 상태가 도달하면 batch
//               가 chain 에서 꺼내져 처리가 시작된 것이다.
//   running   — 청크에 포함되어 실제 LLM 호출 중.
//   done      — 파싱 + 저장 성공 (최종).
//   failed    — 재시도 모두 실패 또는 서버 재시작으로 cleanup 됨 (최종).
//   cancelled — 어드민이 명시적으로 "요약 중지" 누름 (최종). 부팅 자동 재큐잉
//               에서 제외되어 재개되지 않는다. 재시도하려면 명시적 reanalyze.
// 구버전 데이터에 'pending' 행이 남아 있을 수 있어 enum 에 보존한다.
export const ReviewSummaryStatus = z.enum([
  'queued',
  'pending',
  'running',
  'done',
  'failed',
  'cancelled',
]);
export type ReviewSummaryStatusType = z.infer<typeof ReviewSummaryStatus>;

export const ReviewSentiment = z.enum(['positive', 'negative', 'neutral', 'mixed']);
export type ReviewSentimentType = z.infer<typeof ReviewSentiment>;

// LLM이 한 번의 호출로 출력하는 구조화 분석. 최상위 summary는 기존
// ReviewSummary.text 컬럼에 그대로 저장되어 1~2문장 요약 UI와 호환됨.
// 메뉴 단위 감정은 mixed 없이 단순화 — 한 메뉴에 대해 보통 한 방향의
// 감정만 표현된다. 중립이거나 추출 불가하면 null.
export const MenuSentiment = z.enum(['positive', 'negative', 'neutral']);
export type MenuSentimentType = z.infer<typeof MenuSentiment>;

export const ReviewAnalysisMenu = z.object({
  name: z.string(),
  sentiment: MenuSentiment.nullable().optional(),
  // 맛/식감/특징 태그 (예: "독특한 맛", "매콤한", "바삭한"). v4 부터 LLM 출력에
  // 포함됨. v3 잔존 데이터 호환을 위해 optional + default([]) 로 둔다 — DB 에서
  // 읽을 때 누락된 행은 빈 배열로 정규화돼서 클라이언트는 항상 배열로 다룰 수 있다.
  traits: z.array(z.string()).optional().default([]),
});
export type ReviewAnalysisMenuType = z.infer<typeof ReviewAnalysisMenu>;

export const ReviewAnalysis = z.object({
  summary: z.string(),
  sentiment: ReviewSentiment,
  // -1.0(매우 부정) ~ 1.0(매우 긍정)
  sentimentScore: z.number().min(-1).max(1),
  // 1~5 별점 환산
  satisfactionScore: z.number().int().min(1).max(5),
  menus: z.array(ReviewAnalysisMenu),
  tips: z.array(z.string()),
  keywords: z.array(z.string()),
});
export type ReviewAnalysisType = z.infer<typeof ReviewAnalysis>;

export const ReviewSummary = z.object({
  status: ReviewSummaryStatus,
  text: z.string().nullable(),
  model: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  // 분석이 아직 없거나 (구버전 행) 파싱 실패 시 null. 클라이언트는
  // null-safe 하게 렌더해야 한다.
  sentiment: ReviewSentiment.nullable(),
  sentimentScore: z.number().nullable(),
  satisfactionScore: z.number().int().nullable(),
  menus: z.array(ReviewAnalysisMenu).nullable(),
  tips: z.array(z.string()).nullable(),
  keywords: z.array(z.string()).nullable(),
});
export type ReviewSummaryType = z.infer<typeof ReviewSummary>;

export const VisitorReviewWithSummary = VisitorReview.extend({
  id: z.string(),
  externalId: z.string().nullable(),
  fetchedAt: z.string(),
  summary: ReviewSummary.nullable(),
});
export type VisitorReviewWithSummaryType = z.infer<typeof VisitorReviewWithSummary>;

// Restaurant detail returned by GET /admin/restaurants/place/:placeId.
// `snapshot` is the last NaverPlaceData captured (visitorReviews stripped —
// the live list comes from `reviews` instead).
export const RestaurantDetail = z.object({
  id: z.string(),
  placeId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
  rawSourceUrl: z.string(),
  firstCrawledAt: z.string(),
  lastCrawledAt: z.string(),
  snapshot: NaverPlaceData,
  reviews: z.array(VisitorReviewWithSummary),
});
export type RestaurantDetailType = z.infer<typeof RestaurantDetail>;

// 출처별 행 1줄 — Restaurant 1행 = 1 source. 어드민 list 행이 canonical 로
// 그룹된 후 sources 배열에 들어간다. placeId 는 source='naver' 일 때만 채워짐.
export const RestaurantSourceSummary = z.object({
  restaurantId: z.string(),
  source: z.string(),
  sourceId: z.string(),
  placeId: z.string().nullable(),
  name: z.string(),
  category: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
  rawSourceUrl: z.string(),
  firstCrawledAt: z.string(),
  lastCrawledAt: z.string(),
  // source 단위 카운트 — SSE snapshot 이 이 source 의 placeId 로 patch.
  totalReviews: z.number().int(),
  summaryPending: z.number().int(),
  summaryRunning: z.number().int(),
  summaryDone: z.number().int(),
  summaryFailed: z.number().int(),
  // 분석 집계 — done 행만 대상.
  avgSentimentScore: z.number().nullable(),
  avgSatisfactionScore: z.number().nullable(),
  positiveCount: z.number().int(),
  negativeCount: z.number().int(),
  neutralCount: z.number().int(),
  mixedCount: z.number().int(),
});
export type RestaurantSourceSummaryType = z.infer<typeof RestaurantSourceSummary>;

// 어드민 list 의 행 = canonical(같은 가게). sources 의 합으로 통합 카운트도
// 같이 내려준다 — SSE patch 후 클라이언트가 다시 합산할 때 helper 로 재계산.
export const CanonicalListItem = z.object({
  canonicalId: z.string(),
  name: z.string(),
  primaryCategory: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  // 가장 최근 활동한 source 의 lastCrawledAt — 기본 정렬 키.
  lastCrawledAt: z.string(),
  // 길이 ≥ 1 — 출처별 행. 어드민 UI 는 각 source 의 액션을 분기.
  sources: z.array(RestaurantSourceSummary),
  // 통합 카운트 (sources 합). 분석 평균은 done 행 수로 가중평균.
  totalReviews: z.number().int(),
  summaryPending: z.number().int(),
  summaryRunning: z.number().int(),
  summaryDone: z.number().int(),
  summaryFailed: z.number().int(),
  avgSentimentScore: z.number().nullable(),
  avgSatisfactionScore: z.number().nullable(),
  positiveCount: z.number().int(),
  negativeCount: z.number().int(),
  neutralCount: z.number().int(),
  mixedCount: z.number().int(),
  // 이 canonical 과 같은 가게일 가능성이 있는 다른 canonical 의 수. cross-source
  // 만 (같은 source 끼리는 후보로 안 잡힘). 어드민이 "병합" 버튼을 누르기 전에
  // 후보가 있는지 한눈에 알 수 있도록 list 응답에 카운트만 포함 — 실제 후보
  // 데이터는 클릭 시 GET /admin/canonical/:id/candidates 로 별도 조회.
  candidateCount: z.number().int(),
  // 1차 매칭 제안 (가장 점수 높은 후보 1건). 다음 조건 모두 만족할 때만 채워짐:
  //   - sources.length === 1 (아직 다른 출처와 묶이지 않은 신규 가게)
  //   - suggestionDismissedAt === null (어드민이 "무시" 클릭 안 함)
  //   - candidateCount >= 1
  // 어드민이 등록 직후 같은 가게 짝을 한눈에 보고 처리할 수 있도록 행 위에
  // 인라인 알림으로 렌더. 풀 후보 목록은 여전히 "병합" 버튼 → candidates API.
  suggestion: CanonicalSuggestion.nullable(),
});
export type CanonicalListItemType = z.infer<typeof CanonicalListItem>;

// SSE patch 등 클라이언트가 source 갱신 후 통합 카운트를 다시 계산할 때 호출.
// 서버 list() 가 처음 내려준 값과 동일 로직.
export const recomputeCanonicalAggregates = (
  sources: RestaurantSourceSummaryType[],
): Pick<
  CanonicalListItemType,
  | 'totalReviews'
  | 'summaryPending'
  | 'summaryRunning'
  | 'summaryDone'
  | 'summaryFailed'
  | 'avgSentimentScore'
  | 'avgSatisfactionScore'
  | 'positiveCount'
  | 'negativeCount'
  | 'neutralCount'
  | 'mixedCount'
> => {
  let totalReviews = 0;
  let summaryPending = 0;
  let summaryRunning = 0;
  let summaryDone = 0;
  let summaryFailed = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let mixedCount = 0;
  // 가중평균: source 의 (avg, done 수) 곱을 합산 / 전체 done 수.
  let sentSum = 0;
  let sentN = 0;
  let satSum = 0;
  let satN = 0;
  for (const s of sources) {
    totalReviews += s.totalReviews;
    summaryPending += s.summaryPending;
    summaryRunning += s.summaryRunning;
    summaryDone += s.summaryDone;
    summaryFailed += s.summaryFailed;
    positiveCount += s.positiveCount;
    negativeCount += s.negativeCount;
    neutralCount += s.neutralCount;
    mixedCount += s.mixedCount;
    if (s.avgSentimentScore !== null && s.summaryDone > 0) {
      sentSum += s.avgSentimentScore * s.summaryDone;
      sentN += s.summaryDone;
    }
    if (s.avgSatisfactionScore !== null && s.summaryDone > 0) {
      satSum += s.avgSatisfactionScore * s.summaryDone;
      satN += s.summaryDone;
    }
  }
  return {
    totalReviews,
    summaryPending,
    summaryRunning,
    summaryDone,
    summaryFailed,
    avgSentimentScore: sentN > 0 ? sentSum / sentN : null,
    avgSatisfactionScore: satN > 0 ? satSum / satN : null,
    positiveCount,
    negativeCount,
    neutralCount,
    mixedCount,
  };
};

// 어드민 list 페이징/정렬 쿼리. 정렬 키는 클라 기존 옵션과 동일 —
// recent(=lastCrawledAt desc) / satisfaction / positive / negativeRatio.
// 정렬을 서버로 옮긴 이유: 클라가 페이지 단위로만 정렬하면 페이지 경계에서
// 순서가 뒤섞여 사용자가 혼란을 겪는다.
export const RestaurantListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z
    .enum(['recent', 'satisfaction', 'positive', 'negativeRatio'])
    .default('recent'),
});
export type RestaurantListQueryType = z.infer<typeof RestaurantListQuery>;

export const RestaurantListResult = z.object({
  items: z.array(CanonicalListItem),
  // 필터 적용 후 전체 canonical 수 — 페이저가 totalPages 계산에 사용.
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type RestaurantListResultType = z.infer<typeof RestaurantListResult>;

export const RestaurantDeleteResult = z.object({
  ok: z.literal(true),
  deletedReviewCount: z.number().int(),
});
export type RestaurantDeleteResultType = z.infer<typeof RestaurantDeleteResult>;

// 백필 트리거 응답. queued = 이번에 재분석 큐잉된 리뷰 수.
export const RestaurantReanalyzeResult = z.object({
  ok: z.literal(true),
  queued: z.number().int(),
});
export type RestaurantReanalyzeResultType = z.infer<typeof RestaurantReanalyzeResult>;

// 단건 리뷰 재요약 입력. 어드민이 모델을 골라 그 리뷰 하나만 다시 요약한다.
// 모델은 이번 1회성 — 전역 defaultModel 은 바꾸지 않는다.
export const ReviewResummarizeInput = z.object({
  model: z.string().min(1).max(100),
});
export type ReviewResummarizeInputType = z.infer<typeof ReviewResummarizeInput>;

// 단건 재요약 응답. 큐잉만 하고 즉시 반환 — 진행/결과는 기존 summary-events
// SSE 로 흘러온다. placeId 는 SSE 구독 키 (Naver 가 아니면 null).
export const ReviewResummarizeResult = z.object({
  ok: z.literal(true),
  placeId: z.string().nullable(),
});
export type ReviewResummarizeResultType = z.infer<typeof ReviewResummarizeResult>;

// 요약 중지 응답. cancelled = 'cancelled' 로 마킹된 행 수 (queued + pending).
// running 행은 이번 호출에서 손대지 않고 현재 청크가 끝나면 자연 종료된다.
export const RestaurantCancelSummaryResult = z.object({
  ok: z.literal(true),
  cancelled: z.number().int(),
});
export type RestaurantCancelSummaryResultType = z.infer<
  typeof RestaurantCancelSummaryResult
>;

// 요약 재개 응답. resumed = 'cancelled' → 'queued' 로 다시 큐잉된 행 수.
// 명시적으로 중지(cancelled)했던 행만 재투입한다. failed/parse_failed 같은
// LLM 에러는 별개 — 그쪽은 reanalyze 로 재시도.
export const RestaurantResumeSummaryResult = z.object({
  ok: z.literal(true),
  resumed: z.number().int(),
});
export type RestaurantResumeSummaryResultType = z.infer<
  typeof RestaurantResumeSummaryResult
>;

// 정규화 분석 테이블 백필 응답. processed = 새로 행을 채운 summary 수.
export const RestaurantAnalyticsBackfillResult = z.object({
  ok: z.literal(true),
  processed: z.number().int(),
});
export type RestaurantAnalyticsBackfillResultType = z.infer<
  typeof RestaurantAnalyticsBackfillResult
>;

// 가중 랜덤 픽 입력. candidatePlaceIds 가 비면 등록된 모든 식당 대상.
// strategy: balanced(만족도+긍정 합), satisfaction(만족도만), positive(긍정만).
export const RestaurantSmartPickInput = z.object({
  candidatePlaceIds: z.array(z.string()).optional(),
  strategy: z.enum(['balanced', 'satisfaction', 'positive']).default('balanced'),
});
export type RestaurantSmartPickInputType = z.infer<typeof RestaurantSmartPickInput>;

export const RestaurantSmartPickResult = z.object({
  // 후보가 없거나 모두 가중치 0이면 picked = null.
  picked: z
    .object({
      placeId: z.string(),
      name: z.string(),
      // 디버깅/UI 표시용 — 어떤 가중치가 적용됐는지.
      weight: z.number(),
      avgSentimentScore: z.number().nullable(),
      avgSatisfactionScore: z.number().nullable(),
    })
    .nullable(),
  candidates: z.number().int(),
  strategy: z.enum(['balanced', 'satisfaction', 'positive']),
});
export type RestaurantSmartPickResultType = z.infer<typeof RestaurantSmartPickResult>;

// 식당 단위 집계 — done 행에서 추출. 빈도순 정렬.
export const RestaurantInsightMenuStat = z.object({
  name: z.string(),
  count: z.number().int(),
  positive: z.number().int(),
  negative: z.number().int(),
  neutral: z.number().int(),
});
export type RestaurantInsightMenuStatType = z.infer<typeof RestaurantInsightMenuStat>;

export const RestaurantInsightTermStat = z.object({
  term: z.string(),
  count: z.number().int(),
});
export type RestaurantInsightTermStatType = z.infer<typeof RestaurantInsightTermStat>;

export const RestaurantInsights = z.object({
  // 분석된(done) 리뷰 수. 0이면 모든 통계는 빈 배열/0.
  analyzedCount: z.number().int(),
  avgSentimentScore: z.number().nullable(),
  avgSatisfactionScore: z.number().nullable(),
  sentimentDistribution: z.object({
    positive: z.number().int(),
    negative: z.number().int(),
    neutral: z.number().int(),
    mixed: z.number().int(),
  }),
  topMenus: z.array(RestaurantInsightMenuStat),
  topTips: z.array(RestaurantInsightTermStat),
  topKeywords: z.array(RestaurantInsightTermStat),
});
export type RestaurantInsightsType = z.infer<typeof RestaurantInsights>;

// 이 식당의 언급 메뉴를 카테고리 계층 트리로. 어드민 전역 트리(analytics)와
// 같은 노드 구조를 쓰되 이 식당의 멘션만 누적. coverage 가 없으면 roots 는 빈 배열.
export const RestaurantCategoryTreeResult = z.object({
  roots: z.array(CategoryTreeNode),
});
export type RestaurantCategoryTreeResultType = z.infer<
  typeof RestaurantCategoryTreeResult
>;

// 공개 식당 랭킹 — 비로그인/게스트도 볼 수 있는 루트 페이지용. 정렬은 긍정/부정
// 비율, 중립 포함/제외 토글로 분모를 바꾼다. 표본 부족 식당이 1·2건 멘션으로
// 1위를 잡지 못하게 minMentions 컷오프(기본 5).
export const RestaurantRankingQuery = z.object({
  sort: z.enum(['positive', 'negative']).default('positive'),
  // true = 분모에 neutral 제외 → positive/(positive+negative)
  // false = 분모에 neutral 포함 → positive/(positive+negative+neutral)
  excludeNeutral: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .default(false)
    .transform((v) => (typeof v === 'string' ? v === 'true' : v)),
  minMentions: z.coerce.number().int().min(0).max(1000).default(5),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type RestaurantRankingQueryType = z.infer<typeof RestaurantRankingQuery>;

export const RestaurantRankingItem = z.object({
  rank: z.number().int(),
  placeId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  positiveCount: z.number().int(),
  negativeCount: z.number().int(),
  neutralCount: z.number().int(),
  totalMentions: z.number().int(),
  // 정렬 점수 (0~1). sort=positive → positive 비율, sort=negative → negative 비율.
  score: z.number(),
});
export type RestaurantRankingItemType = z.infer<typeof RestaurantRankingItem>;

export const RestaurantRankingResult = z.object({
  items: z.array(RestaurantRankingItem),
  total: z.number().int(),
  sort: z.enum(['positive', 'negative']),
  excludeNeutral: z.boolean(),
  minMentions: z.number().int(),
});
export type RestaurantRankingResultType = z.infer<typeof RestaurantRankingResult>;

// 공개 식당 리스트(지도 페이지) — 비로그인도 호출. 좌표 + 핵심 메타 + AI 통계 한
// 응답에 묶음. RestaurantListItem(어드민) 과 분리한 이유:
//   - 어드민 행은 크롤 진행/요약 진행률 같은 운영 메타가 핵심이고
//   - 공개 행은 좌표/대표 사진/도로명/AI 요약 점수가 핵심이라 필드 셋이 다르다.
export const RestaurantPublicListQuery = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  // "minLng,minLat,maxLng,maxLat" — 지도 viewport bbox.
  bbox: z
    .string()
    .regex(
      /^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/,
      'bbox must be "minLng,minLat,maxLng,maxLat"',
    )
    .optional(),
  sort: z.enum(['recent', 'satisfaction', 'positive', 'rating']).default('recent'),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});
export type RestaurantPublicListQueryType = z.infer<typeof RestaurantPublicListQuery>;

export const RestaurantPublicListItem = z.object({
  placeId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  address: z.string().nullable(),
  roadAddress: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  thumbnailUrl: z.string().nullable(),
  firstCrawledAt: z.string(),
  // 크롤된 visitorReview 총 수 + 요약 status 분포. 어드민 발견 페이지가 진행
  // 배지를 라이브로 갱신하기 위해 필요 — SSE summary 스냅샷의 필드 이름과
  // 1:1 매칭되어 캐시 패치가 깔끔.
  totalReviews: z.number().int(),
  summaryPending: z.number().int(),
  summaryRunning: z.number().int(),
  summaryDone: z.number().int(),
  summaryFailed: z.number().int(),
  // AI 통계 (done 행만). analyzedCount === 0 이면 나머지 점수/카운트는 의미 없음.
  analyzedCount: z.number().int(),
  avgSentimentScore: z.number().nullable(),
  avgSatisfactionScore: z.number().nullable(),
  positiveCount: z.number().int(),
  negativeCount: z.number().int(),
  neutralCount: z.number().int(),
});
export type RestaurantPublicListItemType = z.infer<typeof RestaurantPublicListItem>;

export const RestaurantPublicListResult = z.object({
  items: z.array(RestaurantPublicListItem),
  total: z.number().int(),
});
export type RestaurantPublicListResultType = z.infer<typeof RestaurantPublicListResult>;

// 공개 상세 — 어드민 detail 에서 ReviewSummary 진행/에러 메타데이터를 제거하고
// 분석 결과만 평탄화한다. 분석 안 된 리뷰는 analysis=null 로 본문만 노출.
export const PublicReviewAnalysis = z.object({
  text: z.string(),
  sentiment: ReviewSentiment,
  sentimentScore: z.number(),
  satisfactionScore: z.number().int(),
  menus: z.array(ReviewAnalysisMenu),
  tips: z.array(z.string()),
  keywords: z.array(z.string()),
  finishedAt: z.string(),
});
export type PublicReviewAnalysisType = z.infer<typeof PublicReviewAnalysis>;

export const PublicVisitorReview = z.object({
  id: z.string(),
  // 세 출처의 리뷰가 같은 배열에 섞여 들어가므로 카드/필터가 출처를 구분.
  // DC/테이블링 리뷰의 점수 라벨/키워드/주문메뉴/사장답변 같은 추가 메타는
  // 현재 DB에 저장하지 않으므로 본 응답에는 포함하지 않는다(필요해지면
  // VisitorReview 행에 extras 컬럼을 추가하는 별도 마이그레이션이 선행 필요).
  // 테이블링 리뷰는 예약/웨이팅 실사용자만 작성 가능 — UI 가 "방문 인증"
  // 라벨을 붙일 근거.
  source: z.enum(['naver', 'diningcode', 'tabling']),
  authorName: z.string().nullable(),
  rating: z.number().nullable(),
  body: z.string(),
  visitedAt: z.string().nullable(),
  imageUrls: z.array(z.string().url()),
  videos: z.array(z.object({
    posterUrl: z.string().url(),
    videoUrl: z.string().url(),
  })),
  fetchedAt: z.string(),
  analysis: PublicReviewAnalysis.nullable(),
});
export type PublicVisitorReviewType = z.infer<typeof PublicVisitorReview>;

// 출처별 표시용 메타 — 헤더에서 별점/리뷰수를 출처별로 분리해 보여 줄 때 사용.
// `siteReviewCount` 는 사이트가 보고한 카운트(네이버 reviewCount / DC reviewTotal).
// 우리가 실제 수집한 리뷰 수는 별도 `storedReviewCount` 필드에서 노출.
export const PublicSourceNaver = z.object({
  placeId: z.string(),
  rating: z.number().nullable(),
  siteReviewCount: z.number().int().nullable(),
  rawSourceUrl: z.string(),
});
export type PublicSourceNaverType = z.infer<typeof PublicSourceNaver>;

export const PublicSourceDiningcode = z.object({
  vRid: z.string(),
  rating: z.number().nullable(),
  siteReviewCount: z.number().int().nullable(),
  rawSourceUrl: z.string(),
});
export type PublicSourceDiningcodeType = z.infer<typeof PublicSourceDiningcode>;

// 테이블링 partner 가게(idx 티어)만 공개 경로에 노출 — 미입점 place 행
// (sourceId 'place:' prefix) 은 얕은 스냅샷이라 제외.
export const PublicSourceTabling = z.object({
  idx: z.number().int(),
  rating: z.number().nullable(),
  siteReviewCount: z.number().int().nullable(),
  rawSourceUrl: z.string(),
});
export type PublicSourceTablingType = z.infer<typeof PublicSourceTabling>;

export const PublicSources = z.object({
  naver: PublicSourceNaver.nullable(),
  diningcode: PublicSourceDiningcode.nullable(),
  tabling: PublicSourceTabling.nullable(),
});
export type PublicSourcesType = z.infer<typeof PublicSources>;

// 실제 DB에 적재된 리뷰 수 — 사이트 카운트와 별개로 "우리가 분석에 쓸 수
// 있는 리뷰 풀" 크기. 출처 필터 칩의 카운트로 사용.
export const PublicStoredReviewCount = z.object({
  naver: z.number().int(),
  diningcode: z.number().int(),
  tabling: z.number().int(),
  total: z.number().int(),
});
export type PublicStoredReviewCountType = z.infer<typeof PublicStoredReviewCount>;

// 다이닝코드만 가진 보조 정보. canonical 에 DC 행이 없으면 통째로 null.
// scoreDetail 은 DC scoreDetail 의 핵심 수치만 추려 노출 (bucket 별 비율은 제외).
export const PublicDiningcodeScoreDetail = z.object({
  average: z.number().nullable(),
  total: z.number().int(),
  reviewTotal: z.number().int(),
  taste: z.number().nullable(),
  service: z.number().nullable(),
  price: z.number().nullable(),
  clean: z.number().nullable(),
  distribution: z.object({
    s5: z.number().int(),
    s4_5: z.number().int(),
    s4: z.number().int(),
    s3_5: z.number().int(),
    s3: z.number().int(),
    s2: z.number().int(),
    s1: z.number().int(),
  }),
  text: z.string().nullable(),
});
export type PublicDiningcodeScoreDetailType = z.infer<
  typeof PublicDiningcodeScoreDetail
>;

export const PublicDiningcodeAddon = z.object({
  scoreDetail: PublicDiningcodeScoreDetail.nullable(),
  descTags: z.array(z.string()),
  facilities: z.array(z.string()),
  tags: z.array(z.string()),
  wordcloudUrl: z.string().url().nullable(),
  // DC 의 "매일 08:00-22:00" 한 줄 요약 (여러 줄 가능).
  businessHoursSummary: z.array(DiningcodeShopBusinessHour),
  // 요일별 7일치.
  businessHoursWeekly: z.array(DiningcodeShopBusinessHour),
});
export type PublicDiningcodeAddonType = z.infer<typeof PublicDiningcodeAddon>;

// 테이블링만 가진 보조 정보. canonical 에 테이블링 partner 행이 없으면 통째로
// null. waitingCount(실시간 웨이팅 팀 수) 는 크롤 시점 스냅샷이라 스테일 표시
// 위험이 커서 의도적으로 제외 — 가용 여부 플래그만 노출.
export const PublicTablingAddon = z.object({
  // 웨이팅/원격웨이팅/예약/포장/현장주문 가용 플래그 — 카드/헤더 배지용.
  flags: TablingServiceFlags,
  // 4축 항목 평점 (맛/분위기/서비스/청결 — 사이트 표기 그대로).
  ratings: z.array(TablingRatingItem),
  favoriteCount: z.number().int().nullable(),
  // 요일별 영업시간 — InfoTab 의 "주간 영업시간 상세" 펼침용.
  businessDays: z.array(TablingBusinessDay),
});
export type PublicTablingAddonType = z.infer<typeof PublicTablingAddon>;

// 공개 식당 상세. 기존 스칼라 필드 (name/category/address/rating 등) 는
// 세 출처가 머지된 결과 — 전 필드 Naver 1순위, 비면 폴백 (영업시간·메뉴는
// 테이블링 > DC, 그 외 DC > 테이블링). 출처별 분리값은 `sources` 에 따로
// 노출되어 UI 가 헤더 등에서 표시할 수 있다.
export const RestaurantPublicDetail = z.object({
  placeId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  address: z.string().nullable(),
  roadAddress: z.string().nullable(),
  phone: z.string().nullable(),
  // Naver text 우선, 비면 테이블링 요일별 직렬화 string, 그것도 없으면 DC summary.
  businessHours: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  // Naver imageUrls + DC photos/images origin + 테이블링 images 합집합 (URL dedup).
  // 절대 URL(외부 CDN) 또는 same-origin 절대경로(/api/v1/media/panorama/… —
  // 만료되는 네이버 파노라마를 크롤 시점에 받아둔 우리 사본) 둘 다 허용한다.
  imageUrls: z.array(z.string().url().or(z.string().startsWith('/'))),
  // Naver 가 비어있을 때만 테이블링 menus, 그것도 없으면 DC menus 를 매핑해 채움.
  menus: z.array(MenuItem),
  // Naver blogReviews + DC blogsFirstPage 합쳐 dedup.
  blogReviews: z.array(BlogReview),
  rawSourceUrl: z.string(),
  firstCrawledAt: z.string(),
  // 방문자 리뷰는 페이지네이션. 첫 페이지만 detail 에 동봉해서 ReviewsTab 첫
  // 진입을 추가 fetch 없이 즉시 그릴 수 있게 한다. 추가 페이지는 별도
  // 엔드포인트(Routes.Restaurant.publicReviews)로 가져옴.
  // 정렬: fetchedAt desc, 필터: all. ReviewsTab 의 기본 UI 상태와 일치.
  reviewsFirstPage: z.array(PublicVisitorReview),
  // sentiment chip 의 카운트. 별도 fetch 안 하고 detail 에서 한 번에.
  reviewCounts: z.object({
    all: z.number().int(),
    positive: z.number().int(),
    negative: z.number().int(),
  }),
  // 출처별 별점/리뷰수 — 헤더 분리 표시용. 둘 다 있는 경우 둘 다 채움.
  sources: PublicSources,
  // DB 저장 리뷰 카운트 — 출처 필터 칩 카운트로 사용.
  storedReviewCount: PublicStoredReviewCount,
  // DC 보조 정보 — canonical 에 DC 행이 없으면 null.
  diningcode: PublicDiningcodeAddon.nullable(),
  // 테이블링 보조 정보 — canonical 에 테이블링 partner 행이 없으면 null.
  tabling: PublicTablingAddon.nullable(),
});
export type RestaurantPublicDetailType = z.infer<typeof RestaurantPublicDetail>;

// `/restaurants/public/:placeId/reviews` 쿼리. ReviewsTab 의 chip + 정렬을 그대로
// 백엔드 페이지네이션으로 위임. UI 의 SentimentFilter / SortMode 와 같은 값.
export const RestaurantPublicReviewSentiment = z.enum(['all', 'positive', 'negative']);
export type RestaurantPublicReviewSentimentType = z.infer<
  typeof RestaurantPublicReviewSentiment
>;

export const RestaurantPublicReviewSort = z.enum(['recent', 'rating']);
export type RestaurantPublicReviewSortType = z.infer<typeof RestaurantPublicReviewSort>;

export const RestaurantPublicReviewsQuery = z.object({
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  sentiment: RestaurantPublicReviewSentiment.default('all'),
  sort: RestaurantPublicReviewSort.default('recent'),
  // 방문 팁 필터. 인사이트의 topTips(정규화 빈도 집계)에서 한 항목을 클릭하면
  // 그 팁이 달린 리뷰만 보여준다. 서버는 termNorm 정확 일치로 거른다.
  tip: z.string().trim().min(1).optional(),
  // 메뉴 필터. 메뉴 카드(topMenus 의 canonical 표시명)를 클릭하면 그 메뉴를
  // 언급한 리뷰만. 서버는 topMenus 와 동일한 MenuCanonical 그룹핑으로 매칭해
  // 카드의 'N회 언급' 카운트와 결과 수가 일치한다(약어/표기 변형 포함).
  menu: z.string().trim().min(1).optional(),
});
export type RestaurantPublicReviewsQueryType = z.infer<
  typeof RestaurantPublicReviewsQuery
>;

export const RestaurantPublicReviewsResult = z.object({
  items: z.array(PublicVisitorReview),
  // 현재 필터(sentiment) 적용 후 총 카운트. hasMore 판단용.
  total: z.number().int(),
});
export type RestaurantPublicReviewsResultType = z.infer<
  typeof RestaurantPublicReviewsResult
>;

// SSE per-review payload pushed by the summary-events stream when a single
// row's AI summary finishes (success or failure). The client merges this
// directly into the restaurant detail cache, so a fresh summary appears in
// the UI without a follow-up GET. The multiplexed endpoint tags every event
// with placeId so the client can demux when one connection serves many
// restaurants.
// SSE 이벤트의 공통 source 식별자 — 한 canonical 의 어느 source 한 줄에서
// 발생했는지. placeId 는 source='naver' 일 때만 채워짐.
export const RestaurantSummaryEventSource = z.object({
  canonicalId: z.string(),
  restaurantId: z.string(),
  source: z.string(),
  sourceId: z.string(),
  placeId: z.string().nullable(),
});
export type RestaurantSummaryEventSourceType = z.infer<
  typeof RestaurantSummaryEventSource
>;

export const RestaurantSummaryReviewEvent = RestaurantSummaryEventSource.extend({
  type: z.literal('review'),
  reviewId: z.string(),
  status: z.enum(['done', 'failed']),
  text: z.string().nullable(),
  model: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  finishedAt: z.string(),
  sentiment: ReviewSentiment.nullable(),
  sentimentScore: z.number().nullable(),
  satisfactionScore: z.number().int().nullable(),
  menus: z.array(ReviewAnalysisMenu).nullable(),
  tips: z.array(z.string()).nullable(),
  keywords: z.array(z.string()).nullable(),
});
export type RestaurantSummaryReviewEventType = z.infer<typeof RestaurantSummaryReviewEvent>;

export const RestaurantSummaryProgress = z.object({
  totalReviews: z.number().int(),
  // 큐에 들어갔지만 아직 run() 진입 전. chain 대기. ReviewSummaryStatus 의
  // 'queued' 단계와 일대일.
  queued: z.number().int(),
  pending: z.number().int(),
  running: z.number().int(),
  done: z.number().int(),
  failed: z.number().int(),
  // 어드민이 명시적으로 요약 중지를 누른 결과. inFlight 합산에서 빠진다.
  cancelled: z.number().int(),
  recentDone: z.array(
    z.object({
      reviewId: z.string(),
      text: z.string(),
      finishedAt: z.string().nullable(),
    }),
  ),
});
export type RestaurantSummaryProgressType = z.infer<typeof RestaurantSummaryProgress>;

// SSE snapshot payload — GET /summary-status 응답 + source 식별자. canonicalId
// 로 list 행을 찾고, restaurantId 로 그 행의 source 한 줄을 찾아 갱신한다.
export const RestaurantSummarySnapshotEvent = RestaurantSummaryProgress.merge(
  RestaurantSummaryEventSource,
);
export type RestaurantSummarySnapshotEventType = z.infer<
  typeof RestaurantSummarySnapshotEvent
>;

// 요약 SSE 스트림(/summary-events)으로 흘려보내는 단계별 로그 이벤트. 크롤
// SSE 의 'log' 이벤트와 같은 페이로드 + source 식별자. UI 는 SummaryEvent 와
// CrawlEvent 의 'log' 변종을 하나의 로그 탭에 합쳐 누적 표시할 수 있다.
// jobId 는 큐잉 시점에 크롤 잡 ID 가 전달된 경우에만 채워짐 (수동 요약 재실행
// 같이 잡 컨텍스트 없는 경로에서는 null).
// seq 는 같은 잡 안에서 모노톤. 크롤 SSE 와 요약 SSE 양쪽으로 fan-out 된
// 같은 로그를 (jobId, seq) 로 dedup 하기 위함.
export const RestaurantSummaryLogEvent = RestaurantSummaryEventSource.extend({
  type: z.literal('log'),
  jobId: z.string().nullable(),
  level: CrawlLogLevel,
  stage: z.string(),
  message: z.string(),
  meta: z.record(z.unknown()).nullable(),
  seq: z.number().int(),
  at: z.string(),
});
export type RestaurantSummaryLogEventType = z.infer<typeof RestaurantSummaryLogEvent>;
