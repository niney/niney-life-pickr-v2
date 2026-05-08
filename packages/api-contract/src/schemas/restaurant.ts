import { z } from 'zod';
import { NaverPlaceData, VisitorReview } from './crawl.js';

export const ReviewSummaryStatus = z.enum(['pending', 'running', 'done', 'failed']);
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

// Compact list-row shape — drives the restaurants admin page. Includes the
// summary counts inline so the page can render progress badges without an
// extra round-trip per row.
export const RestaurantListItem = z.object({
  id: z.string(),
  placeId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
  rawSourceUrl: z.string(),
  firstCrawledAt: z.string(),
  lastCrawledAt: z.string(),
  totalReviews: z.number().int(),
  summaryPending: z.number().int(),
  summaryRunning: z.number().int(),
  summaryDone: z.number().int(),
  summaryFailed: z.number().int(),
  // AI 분석 집계 — done 행만 대상. 분석 안 된 행이 많으면 null.
  // FE는 정렬 기준으로 사용하고 null은 가장 뒤로 보낸다.
  avgSentimentScore: z.number().nullable(),
  avgSatisfactionScore: z.number().nullable(),
  positiveCount: z.number().int(),
  negativeCount: z.number().int(),
  neutralCount: z.number().int(),
  mixedCount: z.number().int(),
});
export type RestaurantListItemType = z.infer<typeof RestaurantListItem>;

export const RestaurantListResult = z.object({
  items: z.array(RestaurantListItem),
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

// SSE per-review payload pushed by the summary-events stream when a single
// row's AI summary finishes (success or failure). The client merges this
// directly into the restaurant detail cache, so a fresh summary appears in
// the UI without a follow-up GET. The multiplexed endpoint tags every event
// with placeId so the client can demux when one connection serves many
// restaurants.
export const RestaurantSummaryReviewEvent = z.object({
  type: z.literal('review'),
  placeId: z.string(),
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
  pending: z.number().int(),
  running: z.number().int(),
  done: z.number().int(),
  failed: z.number().int(),
  recentDone: z.array(
    z.object({
      reviewId: z.string(),
      text: z.string(),
      finishedAt: z.string().nullable(),
    }),
  ),
});
export type RestaurantSummaryProgressType = z.infer<typeof RestaurantSummaryProgress>;

// SSE snapshot payload — same shape as the GET /summary-status response but
// tagged with placeId for the multiplexed stream.
export const RestaurantSummarySnapshotEvent = RestaurantSummaryProgress.extend({
  placeId: z.string(),
});
export type RestaurantSummarySnapshotEventType = z.infer<
  typeof RestaurantSummarySnapshotEvent
>;
