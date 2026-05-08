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
