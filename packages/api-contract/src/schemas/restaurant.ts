import { z } from 'zod';
import { CategoryTreeNode } from './analytics.js';
import { CanonicalSuggestion } from './canonical.js';
import {
  BlogReview,
  CrawlLogLevel,
  DiningcodeShopBusinessHour,
  MenuGroup,
  MenuItem,
  NaverPlaceData,
  TablingBusinessDay,
  TablingRatingItem,
  TablingServiceFlags,
  VisitorReview,
} from './crawl.js';

// Ã«ÂÂ¨ÃªÂ³Â Ã¬ÂÂÃ«Â¯Â¸:
//   queued    Ã¢ÂÂ queueSummariesForReviews Ã¬Â§ÂÃ¬ÂÂ Ã¬ÂÂÃ¬Â ÂÃ¬ÂÂ Ã¬Â¦ÂÃ¬ÂÂ Ã«Â°ÂÃ­ÂÂ. chain Ã«ÂÂÃªÂ¸Â°.
//               chain Ã­ÂÂÃ«Â°Â(Ã¬ÂÂÃ«Â²Â Ã¬ÂÂ¬Ã¬ÂÂÃ¬ÂÂ) Ã¬ÂÂ Ã­ÂÂÃ¬Â ÂÃ¬ÂÂ´ Ã¬ÂÂ¬Ã«ÂÂ¼Ã¬Â§ÂÃ¬Â§Â Ã¬ÂÂÃ«ÂÂÃ«Â¡Â Ã­ÂÂ Ã¬ÂÂÃ¬Â ÂÃ«Â§Â.
//   pending   Ã¢ÂÂ run() Ã¬Â§ÂÃ¬ÂÂ Ã­ÂÂ Ã¬Â²Â­Ã­ÂÂ¬Ã¬ÂÂ Ã­ÂÂ Ã«ÂÂ¹Ã«ÂÂÃªÂ¸Â° Ã¬Â§ÂÃ¬Â Â. Ã¬ÂÂ´ Ã¬ÂÂÃ­ÂÂÃªÂ°Â Ã«ÂÂÃ«ÂÂ¬Ã­ÂÂÃ«Â©Â´ batch
//               ÃªÂ°Â chain Ã¬ÂÂÃ¬ÂÂ ÃªÂºÂ¼Ã«ÂÂ´Ã¬Â Â¸ Ã¬Â²ÂÃ«Â¦Â¬ÃªÂ°Â Ã¬ÂÂÃ¬ÂÂÃ«ÂÂ ÃªÂ²ÂÃ¬ÂÂ´Ã«ÂÂ¤.
//   running   Ã¢ÂÂ Ã¬Â²Â­Ã­ÂÂ¬Ã¬ÂÂ Ã­ÂÂ¬Ã­ÂÂ¨Ã«ÂÂÃ¬ÂÂ´ Ã¬ÂÂ¤Ã¬Â Â LLM Ã­ÂÂ¸Ã¬Â¶Â Ã¬Â¤Â.
//   done      Ã¢ÂÂ Ã­ÂÂÃ¬ÂÂ± + Ã¬Â ÂÃ¬ÂÂ¥ Ã¬ÂÂ±ÃªÂ³Âµ (Ã¬ÂµÂÃ¬Â¢Â).
//   failed    Ã¢ÂÂ Ã¬ÂÂ¬Ã¬ÂÂÃ«ÂÂ Ã«ÂªÂ¨Ã«ÂÂ Ã¬ÂÂ¤Ã­ÂÂ¨ Ã«ÂÂÃ«ÂÂ Ã¬ÂÂÃ«Â²Â Ã¬ÂÂ¬Ã¬ÂÂÃ¬ÂÂÃ¬ÂÂ¼Ã«Â¡Â cleanup Ã«ÂÂ¨ (Ã¬ÂµÂÃ¬Â¢Â).
//   cancelled Ã¢ÂÂ Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼Ã¬ÂÂ´ Ã«ÂªÂÃ¬ÂÂÃ¬Â ÂÃ¬ÂÂ¼Ã«Â¡Â "Ã¬ÂÂÃ¬ÂÂ½ Ã¬Â¤ÂÃ¬Â§Â" Ã«ÂÂÃ«Â¦Â (Ã¬ÂµÂÃ¬Â¢Â). Ã«Â¶ÂÃ­ÂÂ Ã¬ÂÂÃ«ÂÂ Ã¬ÂÂ¬Ã­ÂÂÃ¬ÂÂ
//               Ã¬ÂÂÃ¬ÂÂ Ã¬Â ÂÃ¬ÂÂ¸Ã«ÂÂÃ¬ÂÂ´ Ã¬ÂÂ¬ÃªÂ°ÂÃ«ÂÂÃ¬Â§Â Ã¬ÂÂÃ«ÂÂÃ«ÂÂ¤. Ã¬ÂÂ¬Ã¬ÂÂÃ«ÂÂÃ­ÂÂÃ«Â Â¤Ã«Â©Â´ Ã«ÂªÂÃ¬ÂÂÃ¬Â Â reanalyze.
// ÃªÂµÂ¬Ã«Â²ÂÃ¬Â Â Ã«ÂÂ°Ã¬ÂÂ´Ã­ÂÂ°Ã¬ÂÂ 'pending' Ã­ÂÂÃ¬ÂÂ´ Ã«ÂÂ¨Ã¬ÂÂ Ã¬ÂÂÃ¬ÂÂ Ã¬ÂÂ Ã¬ÂÂÃ¬ÂÂ´ enum Ã¬ÂÂ Ã«Â³Â´Ã¬Â¡Â´Ã­ÂÂÃ«ÂÂ¤.
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

// LLMÃ¬ÂÂ´ Ã­ÂÂ Ã«Â²ÂÃ¬ÂÂ Ã­ÂÂ¸Ã¬Â¶ÂÃ«Â¡Â Ã¬Â¶ÂÃ«Â Â¥Ã­ÂÂÃ«ÂÂ ÃªÂµÂ¬Ã¬Â¡Â°Ã­ÂÂ Ã«Â¶ÂÃ¬ÂÂ. Ã¬ÂµÂÃ¬ÂÂÃ¬ÂÂ summaryÃ«ÂÂ ÃªÂ¸Â°Ã¬Â¡Â´
// ReviewSummary.text Ã¬Â»Â¬Ã«ÂÂ¼Ã¬ÂÂ ÃªÂ·Â¸Ã«ÂÂÃ«Â¡Â Ã¬Â ÂÃ¬ÂÂ¥Ã«ÂÂÃ¬ÂÂ´ 1~2Ã«Â¬Â¸Ã¬ÂÂ¥ Ã¬ÂÂÃ¬ÂÂ½ UIÃ¬ÂÂ Ã­ÂÂ¸Ã­ÂÂÃ«ÂÂ¨.
// Ã«Â©ÂÃ«ÂÂ´ Ã«ÂÂ¨Ã¬ÂÂ ÃªÂ°ÂÃ¬Â ÂÃ¬ÂÂ mixed Ã¬ÂÂÃ¬ÂÂ´ Ã«ÂÂ¨Ã¬ÂÂÃ­ÂÂ Ã¢ÂÂ Ã­ÂÂ Ã«Â©ÂÃ«ÂÂ´Ã¬ÂÂ Ã«ÂÂÃ­ÂÂ´ Ã«Â³Â´Ã­ÂÂµ Ã­ÂÂ Ã«Â°Â©Ã­ÂÂ¥Ã¬ÂÂ
// ÃªÂ°ÂÃ¬Â ÂÃ«Â§Â Ã­ÂÂÃ­ÂÂÃ«ÂÂÃ«ÂÂ¤. Ã¬Â¤ÂÃ«Â¦Â½Ã¬ÂÂ´ÃªÂ±Â°Ã«ÂÂ Ã¬Â¶ÂÃ¬Â¶Â Ã«Â¶ÂÃªÂ°ÂÃ­ÂÂÃ«Â©Â´ null.
export const MenuSentiment = z.enum(['positive', 'negative', 'neutral']);
export type MenuSentimentType = z.infer<typeof MenuSentiment>;

export const ReviewAnalysisMenu = z.object({
  name: z.string(),
  sentiment: MenuSentiment.nullable().optional(),
  // Ã«Â§Â/Ã¬ÂÂÃªÂ°Â/Ã­ÂÂ¹Ã¬Â§Â Ã­ÂÂÃªÂ·Â¸ (Ã¬ÂÂ: "Ã«ÂÂÃ­ÂÂ¹Ã­ÂÂ Ã«Â§Â", "Ã«Â§Â¤Ã¬Â½Â¤Ã­ÂÂ", "Ã«Â°ÂÃ¬ÂÂ­Ã­ÂÂ"). v4 Ã«Â¶ÂÃ­ÂÂ° LLM Ã¬Â¶ÂÃ«Â Â¥Ã¬ÂÂ
  // Ã­ÂÂ¬Ã­ÂÂ¨Ã«ÂÂ¨. v3 Ã¬ÂÂÃ¬Â¡Â´ Ã«ÂÂ°Ã¬ÂÂ´Ã­ÂÂ° Ã­ÂÂ¸Ã­ÂÂÃ¬ÂÂ Ã¬ÂÂÃ­ÂÂ´ optional + default([]) Ã«Â¡Â Ã«ÂÂÃ«ÂÂ¤ Ã¢ÂÂ DB Ã¬ÂÂÃ¬ÂÂ
  // Ã¬ÂÂ½Ã¬ÂÂ Ã«ÂÂ Ã«ÂÂÃ«ÂÂ½Ã«ÂÂ Ã­ÂÂÃ¬ÂÂ Ã«Â¹Â Ã«Â°Â°Ã¬ÂÂ´Ã«Â¡Â Ã¬Â ÂÃªÂ·ÂÃ­ÂÂÃ«ÂÂ¼Ã¬ÂÂ Ã­ÂÂ´Ã«ÂÂ¼Ã¬ÂÂ´Ã¬ÂÂ¸Ã­ÂÂ¸Ã«ÂÂ Ã­ÂÂ­Ã¬ÂÂ Ã«Â°Â°Ã¬ÂÂ´Ã«Â¡Â Ã«ÂÂ¤Ã«Â£Â° Ã¬ÂÂ Ã¬ÂÂÃ«ÂÂ¤.
  traits: z.array(z.string()).optional().default([]),
});
export type ReviewAnalysisMenuType = z.infer<typeof ReviewAnalysisMenu>;

export const ReviewAnalysis = z.object({
  summary: z.string(),
  sentiment: ReviewSentiment,
  // -1.0(Ã«Â§Â¤Ã¬ÂÂ° Ã«Â¶ÂÃ¬Â Â) ~ 1.0(Ã«Â§Â¤Ã¬ÂÂ° ÃªÂ¸ÂÃ¬Â Â)
  sentimentScore: z.number().min(-1).max(1),
  // 1~5 Ã«Â³ÂÃ¬Â Â Ã­ÂÂÃ¬ÂÂ°
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
  // Ã«Â¶ÂÃ¬ÂÂÃ¬ÂÂ´ Ã¬ÂÂÃ¬Â§Â Ã¬ÂÂÃªÂ±Â°Ã«ÂÂ (ÃªÂµÂ¬Ã«Â²ÂÃ¬Â Â Ã­ÂÂ) Ã­ÂÂÃ¬ÂÂ± Ã¬ÂÂ¤Ã­ÂÂ¨ Ã¬ÂÂ null. Ã­ÂÂ´Ã«ÂÂ¼Ã¬ÂÂ´Ã¬ÂÂ¸Ã­ÂÂ¸Ã«ÂÂ
  // null-safe Ã­ÂÂÃªÂ²Â Ã«Â ÂÃ«ÂÂÃ­ÂÂ´Ã¬ÂÂ¼ Ã­ÂÂÃ«ÂÂ¤.
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

// Ã¬ÂÂÃªÂ°ÂÃ¬ÂÂÃ¬ÂÂ Ã«Â§Â¤Ã¬Â¹Â­ Ã¬Â ÂÃ«Â³Â´ Ã¢ÂÂ Ã¬ÂÂÃ¬ÂÂÃªÂ³ÂµÃ¬ÂÂ¸Ã¬ÂÂÃ¬ÂÂ¥Ã¬Â§ÂÃ­ÂÂ¥ÃªÂ³ÂµÃ«ÂÂ¨ Ã¬ÂÂÃªÂ°Â(Ã¬ÂÂÃªÂ¶Â)Ã¬Â ÂÃ«Â³Â´(LifeStore)Ã¬ÂÂÃ¬ÂÂ Ã¬Â¢ÂÃ­ÂÂ 80m + Ã¬ÂÂÃ­ÂÂ¸ Ã¬ÂÂ Ã¬ÂÂ¬Ã«ÂÂÃ«Â¡Â Ã«Â¶ÂÃ¬ÂÂ¸
// Ã¬ÂÂÃ¬ÂÂ(RestaurantStoreMatch). closedSuspect = Ã¬ÂµÂÃªÂ·Â¼ Ã«Â¶ÂÃªÂ¸Â° Ã¬Â ÂÃ¬ÂÂ¬Ã«Â³Â¸Ã¬ÂÂÃ¬ÂÂ Ã¬ÂÂÃ¬ÂÂÃªÂ°Â Ã¬ÂÂ¬Ã«ÂÂ¼Ã¬Â§Â(Ã­ÂÂÃ¬ÂÂ Ã¬ÂÂÃ¬ÂÂ¬ Ã¢ÂÂ Ã«Â§Â¤Ã¬Â¹Â­ Ã¬ÂÂ¤Ã­ÂÂ¨Ã¬ÂÂ¼
// Ã¬ÂÂÃ«ÂÂ Ã¬ÂÂÃ¬ÂÂ´ Ã«ÂªÂ©Ã«Â¡ÂÃÂ·Ã¬Â§ÂÃ«ÂÂÃ¬ÂÂÃ¬ÂÂÃ«ÂÂ Ã¬ÂÂ¨ÃªÂ¸Â°Ã¬Â§Â Ã¬ÂÂÃªÂ³Â  Ã«Â°Â°Ã¬Â§ÂÃ«Â§Â). baseDate Ã«ÂÂ ÃªÂ·Â¸ Ã¬Â ÂÃ¬ÂÂ¬Ã«Â³Â¸ ÃªÂ¸Â°Ã¬Â¤ÂÃ¬ÂÂ¼(YYYY-MM-DD, Ã¬ÂÂÃ¬ÂÂ¼Ã«Â©Â´ null).
export const RestaurantStoreInfo = z.object({
  bizesId: z.string(),
  name: z.string(),
  branch: z.string().nullable(),
  // @repo/utils LIFE_STORE_KINDS (food | cafe).
  kind: z.string(),
  // Ã¬ÂÂÃªÂ¶ÂÃ¬ÂÂÃ¬Â¢Â Ã¬ÂÂÃ«Â¶ÂÃ«Â¥ÂÃ«ÂªÂ(Ã«Â°Â±Ã«Â°Â/Ã­ÂÂÃ¬Â ÂÃ¬ÂÂ ÃÂ· Ã¬Â¹Â´Ã­ÂÂ Ã¢ÂÂ¦) / Ã­ÂÂÃ¬Â¤ÂÃ¬ÂÂ°Ã¬ÂÂÃ«Â¶ÂÃ«Â¥ÂÃ«ÂªÂ.
  industry: z.string(),
  ksicName: z.string().nullable(),
  distM: z.number().int().min(0),
  nameScore: z.number().min(0).max(1),
  closedSuspect: z.boolean(),
  missingSince: z.string().nullable(),
  baseDate: z.string().nullable(),
});
export type RestaurantStoreInfoType = z.infer<typeof RestaurantStoreInfo>;

// ì¬íë¡ê·¸ ì¥ì ë§¤ì¹­ ì ë³´ â AI íë¸ 71780 ì¬íë¡ê·¸(TourPlace)ì ì¢í 100m + ìí¸ ì ì¬ë(ìì ì¼ì¹ 300m)ë¡ ë¶ì¸ ì¥ì
// (RestaurantTourMatch)ì ê·¸ ì¥ìì ì§ê³Â·êµ­ì¸ì²­ ì¬ìì ìí. ì´ëë¯¼ ìì¸ í¤ë ë°°ì§ì©(2ì°¨). ê³µê° ìì¸ë 4ì°¨ìì
// ë³ë ìì½ ì¤í¤ë§ë¡ â ì´ ê°ì²´ì ê°ë³ ë°©ë¬¸ íì´ ìë¤. docs/PLAN-tour-log.md
export const RestaurantTourMatchInfo = z.object({
  tourPlaceId: z.string(),
  placeName: z.string(),
  typeShort: z.string(),
  distM: z.number().int().min(0),
  nameScore: z.number().min(0).max(1),
  status: z.enum(['matched', 'missing']),
  matchedAt: z.string(),
  nTravelers: z.number().int(),
  nVisits: z.number().int(),
  nRated: z.number().int(),
  bayesScore: z.number().nullable(),
  meanDgstfn: z.number().nullable(),
  revisitRate: z.number().nullable(),
  stayMedian: z.number().nullable(),
  spendPpMedian: z.number().nullable(),
  topReasonNm: z.string().nullable(),
  // íë³¸ ìë´ ë¬¸êµ¬(@repo/utils TOUR_SAMPLE_LABEL).
  sampleLabel: z.string(),
  bizStatus: z
    .object({
      bStt: z.string(),
      endDt: z.string().nullable(),
      checkedAt: z.string(),
    })
    .nullable(),
});
export type RestaurantTourMatchInfoType = z.infer<typeof RestaurantTourMatchInfo>;

// Restaurant detail returned by GET /admin/restaurants/place/:placeId.
// `snapshot` is the last NaverPlaceData captured (visitorReviews stripped Ã¢ÂÂ
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
  // Ã¬ÂÂÃªÂ°ÂÃ¬ÂÂÃ¬ÂÂ Ã«Â§Â¤Ã¬Â¹Â­ Ã¢ÂÂ Ã¬ÂÂÃ¬ÂÂ¼Ã«Â©Â´ null.
  store: RestaurantStoreInfo.nullable(),
  // 여행로그 매칭(AI 허브 71780, 2차) — 없으면 null.
  tour: RestaurantTourMatchInfo.nullable(),
});
export type RestaurantDetailType = z.infer<typeof RestaurantDetail>;

// Ã¬Â¶ÂÃ¬Â²ÂÃ«Â³Â Ã­ÂÂ 1Ã¬Â¤Â Ã¢ÂÂ Restaurant 1Ã­ÂÂ = 1 source. Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼ list Ã­ÂÂÃ¬ÂÂ´ canonical Ã«Â¡Â
// ÃªÂ·Â¸Ã«Â£Â¹Ã«ÂÂ Ã­ÂÂ sources Ã«Â°Â°Ã¬ÂÂ´Ã¬ÂÂ Ã«ÂÂ¤Ã¬ÂÂ´ÃªÂ°ÂÃ«ÂÂ¤. placeId Ã«ÂÂ source='naver' Ã¬ÂÂ¼ Ã«ÂÂÃ«Â§Â Ã¬Â±ÂÃ¬ÂÂÃ¬Â§Â.
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
  // source Ã«ÂÂ¨Ã¬ÂÂ Ã¬Â¹Â´Ã¬ÂÂ´Ã­ÂÂ¸ Ã¢ÂÂ SSE snapshot Ã¬ÂÂ´ Ã¬ÂÂ´ source Ã¬ÂÂ placeId Ã«Â¡Â patch.
  totalReviews: z.number().int(),
  summaryPending: z.number().int(),
  summaryRunning: z.number().int(),
  summaryDone: z.number().int(),
  summaryFailed: z.number().int(),
  // Ã«Â¶ÂÃ¬ÂÂ Ã¬Â§ÂÃªÂ³Â Ã¢ÂÂ done Ã­ÂÂÃ«Â§Â Ã«ÂÂÃ¬ÂÂ.
  avgSentimentScore: z.number().nullable(),
  avgSatisfactionScore: z.number().nullable(),
  positiveCount: z.number().int(),
  negativeCount: z.number().int(),
  neutralCount: z.number().int(),
  mixedCount: z.number().int(),
});
export type RestaurantSourceSummaryType = z.infer<typeof RestaurantSourceSummary>;

// Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼ list Ã¬ÂÂ Ã­ÂÂ = canonical(ÃªÂ°ÂÃ¬ÂÂ ÃªÂ°ÂÃªÂ²Â). sources Ã¬ÂÂ Ã­ÂÂ©Ã¬ÂÂ¼Ã«Â¡Â Ã­ÂÂµÃ­ÂÂ© Ã¬Â¹Â´Ã¬ÂÂ´Ã­ÂÂ¸Ã«ÂÂ
// ÃªÂ°ÂÃ¬ÂÂ´ Ã«ÂÂ´Ã«Â Â¤Ã¬Â¤ÂÃ«ÂÂ¤ Ã¢ÂÂ SSE patch Ã­ÂÂ Ã­ÂÂ´Ã«ÂÂ¼Ã¬ÂÂ´Ã¬ÂÂ¸Ã­ÂÂ¸ÃªÂ°Â Ã«ÂÂ¤Ã¬ÂÂ Ã­ÂÂ©Ã¬ÂÂ°Ã­ÂÂ  Ã«ÂÂ helper Ã«Â¡Â Ã¬ÂÂ¬ÃªÂ³ÂÃ¬ÂÂ°.
export const CanonicalListItem = z.object({
  canonicalId: z.string(),
  name: z.string(),
  primaryCategory: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  // ÃªÂ°ÂÃ¬ÂÂ¥ Ã¬ÂµÂÃªÂ·Â¼ Ã­ÂÂÃ«ÂÂÃ­ÂÂ source Ã¬ÂÂ lastCrawledAt Ã¢ÂÂ ÃªÂ¸Â°Ã«Â³Â¸ Ã¬Â ÂÃ«Â Â¬ Ã­ÂÂ¤.
  lastCrawledAt: z.string(),
  // ÃªÂ¸Â¸Ã¬ÂÂ´ Ã¢ÂÂ¥ 1 Ã¢ÂÂ Ã¬Â¶ÂÃ¬Â²ÂÃ«Â³Â Ã­ÂÂ. Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼ UI Ã«ÂÂ ÃªÂ°Â source Ã¬ÂÂ Ã¬ÂÂ¡Ã¬ÂÂÃ¬ÂÂ Ã«Â¶ÂÃªÂ¸Â°.
  sources: z.array(RestaurantSourceSummary),
  // Ã­ÂÂµÃ­ÂÂ© Ã¬Â¹Â´Ã¬ÂÂ´Ã­ÂÂ¸ (sources Ã­ÂÂ©). Ã«Â¶ÂÃ¬ÂÂ Ã­ÂÂÃªÂ·Â Ã¬ÂÂ done Ã­ÂÂ Ã¬ÂÂÃ«Â¡Â ÃªÂ°ÂÃ¬Â¤ÂÃ­ÂÂÃªÂ·Â .
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
  // Ã¬ÂÂ´ canonical ÃªÂ³Â¼ ÃªÂ°ÂÃ¬ÂÂ ÃªÂ°ÂÃªÂ²ÂÃ¬ÂÂ¼ ÃªÂ°ÂÃ«ÂÂ¥Ã¬ÂÂ±Ã¬ÂÂ´ Ã¬ÂÂÃ«ÂÂ Ã«ÂÂ¤Ã«Â¥Â¸ canonical Ã¬ÂÂ Ã¬ÂÂ. cross-source
  // Ã«Â§Â (ÃªÂ°ÂÃ¬ÂÂ source Ã«ÂÂ¼Ã«Â¦Â¬Ã«ÂÂ Ã­ÂÂÃ«Â³Â´Ã«Â¡Â Ã¬ÂÂ Ã¬ÂÂ¡Ã­ÂÂ). Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼Ã¬ÂÂ´ "Ã«Â³ÂÃ­ÂÂ©" Ã«Â²ÂÃ­ÂÂ¼Ã¬ÂÂ Ã«ÂÂÃ«Â¥Â´ÃªÂ¸Â° Ã¬Â ÂÃ¬ÂÂ
  // Ã­ÂÂÃ«Â³Â´ÃªÂ°Â Ã¬ÂÂÃ«ÂÂÃ¬Â§Â Ã­ÂÂÃ«ÂÂÃ¬ÂÂ Ã¬ÂÂ Ã¬ÂÂ Ã¬ÂÂÃ«ÂÂÃ«Â¡Â list Ã¬ÂÂÃ«ÂÂµÃ¬ÂÂ Ã¬Â¹Â´Ã¬ÂÂ´Ã­ÂÂ¸Ã«Â§Â Ã­ÂÂ¬Ã­ÂÂ¨ Ã¢ÂÂ Ã¬ÂÂ¤Ã¬Â Â Ã­ÂÂÃ«Â³Â´
  // Ã«ÂÂ°Ã¬ÂÂ´Ã­ÂÂ°Ã«ÂÂ Ã­ÂÂ´Ã«Â¦Â­ Ã¬ÂÂ GET /admin/canonical/:id/candidates Ã«Â¡Â Ã«Â³ÂÃ«ÂÂ Ã¬Â¡Â°Ã­ÂÂ.
  candidateCount: z.number().int(),
  // 1Ã¬Â°Â¨ Ã«Â§Â¤Ã¬Â¹Â­ Ã¬Â ÂÃ¬ÂÂ (ÃªÂ°ÂÃ¬ÂÂ¥ Ã¬Â ÂÃ¬ÂÂ Ã«ÂÂÃ¬ÂÂ Ã­ÂÂÃ«Â³Â´ 1ÃªÂ±Â´). Ã«ÂÂ¤Ã¬ÂÂ Ã¬Â¡Â°ÃªÂ±Â´ Ã«ÂªÂ¨Ã«ÂÂ Ã«Â§ÂÃ¬Â¡Â±Ã­ÂÂ  Ã«ÂÂÃ«Â§Â Ã¬Â±ÂÃ¬ÂÂÃ¬Â§Â:
  //   - sources.length === 1 (Ã¬ÂÂÃ¬Â§Â Ã«ÂÂ¤Ã«Â¥Â¸ Ã¬Â¶ÂÃ¬Â²ÂÃ¬ÂÂ Ã«Â¬Â¶Ã¬ÂÂ´Ã¬Â§Â Ã¬ÂÂÃ¬ÂÂ Ã¬ÂÂ ÃªÂ·Â ÃªÂ°ÂÃªÂ²Â)
  //   - suggestionDismissedAt === null (Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼Ã¬ÂÂ´ "Ã«Â¬Â´Ã¬ÂÂ" Ã­ÂÂ´Ã«Â¦Â­ Ã¬ÂÂ Ã­ÂÂ¨)
  //   - candidateCount >= 1
  // Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼Ã¬ÂÂ´ Ã«ÂÂ±Ã«Â¡Â Ã¬Â§ÂÃ­ÂÂ ÃªÂ°ÂÃ¬ÂÂ ÃªÂ°ÂÃªÂ²Â Ã¬Â§ÂÃ¬ÂÂ Ã­ÂÂÃ«ÂÂÃ¬ÂÂ Ã«Â³Â´ÃªÂ³Â  Ã¬Â²ÂÃ«Â¦Â¬Ã­ÂÂ  Ã¬ÂÂ Ã¬ÂÂÃ«ÂÂÃ«Â¡Â Ã­ÂÂ Ã¬ÂÂÃ¬ÂÂ
  // Ã¬ÂÂ¸Ã«ÂÂ¼Ã¬ÂÂ¸ Ã¬ÂÂÃ«Â¦Â¼Ã¬ÂÂ¼Ã«Â¡Â Ã«Â ÂÃ«ÂÂ. Ã­ÂÂ Ã­ÂÂÃ«Â³Â´ Ã«ÂªÂ©Ã«Â¡ÂÃ¬ÂÂ Ã¬ÂÂ¬Ã¬Â ÂÃ­ÂÂ "Ã«Â³ÂÃ­ÂÂ©" Ã«Â²ÂÃ­ÂÂ¼ Ã¢ÂÂ candidates API.
  suggestion: CanonicalSuggestion.nullable(),
});
export type CanonicalListItemType = z.infer<typeof CanonicalListItem>;

// SSE patch Ã«ÂÂ± Ã­ÂÂ´Ã«ÂÂ¼Ã¬ÂÂ´Ã¬ÂÂ¸Ã­ÂÂ¸ÃªÂ°Â source ÃªÂ°Â±Ã¬ÂÂ  Ã­ÂÂ Ã­ÂÂµÃ­ÂÂ© Ã¬Â¹Â´Ã¬ÂÂ´Ã­ÂÂ¸Ã«Â¥Â¼ Ã«ÂÂ¤Ã¬ÂÂ ÃªÂ³ÂÃ¬ÂÂ°Ã­ÂÂ  Ã«ÂÂ Ã­ÂÂ¸Ã¬Â¶Â.
// Ã¬ÂÂÃ«Â²Â list() ÃªÂ°Â Ã¬Â²ÂÃ¬ÂÂ Ã«ÂÂ´Ã«Â Â¤Ã¬Â¤Â ÃªÂ°ÂÃªÂ³Â¼ Ã«ÂÂÃ¬ÂÂ¼ Ã«Â¡ÂÃ¬Â§Â.
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
  // ÃªÂ°ÂÃ¬Â¤ÂÃ­ÂÂÃªÂ·Â : source Ã¬ÂÂ (avg, done Ã¬ÂÂ) ÃªÂ³Â±Ã¬ÂÂ Ã­ÂÂ©Ã¬ÂÂ° / Ã¬Â ÂÃ¬Â²Â´ done Ã¬ÂÂ.
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

// Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼ list ÃªÂ²ÂÃ¬ÂÂ/Ã­ÂÂÃ¬ÂÂ´Ã¬Â§Â/Ã¬Â ÂÃ«Â Â¬ Ã¬Â¿Â¼Ã«Â¦Â¬. q Ã«ÂÂ canonical Ã¬Â¡Â°Ã«Â¦Â½Ã¬ÂÂ´ Ã«ÂÂÃ«ÂÂ Ã­ÂÂµÃ­ÂÂ© Ã­ÂÂÃ¬ÂÂÃ¬ÂÂ
// ÃªÂ°ÂÃªÂ²ÂÃ«ÂªÂÃÂ·Ã¬Â¹Â´Ã­ÂÂÃªÂ³Â Ã«Â¦Â¬ÃÂ·Ã¬Â¶ÂÃ¬Â²ÂÃ«Â³Â Ã¬ÂÂÃ«Â³ÂÃ¬ÂÂÃ«Â¥Â¼ Ã­ÂÂ Ã­ÂÂ° AND Ã«Â°Â©Ã¬ÂÂÃ¬ÂÂ¼Ã«Â¡Â Ã¬Â°Â¾Ã«ÂÂÃ«ÂÂ¤. Ã¬Â ÂÃ«Â Â¬ Ã­ÂÂ¤Ã«ÂÂ Ã­ÂÂ´Ã«ÂÂ¼ ÃªÂ¸Â°Ã¬Â¡Â´ Ã¬ÂÂµÃ¬ÂÂÃªÂ³Â¼ Ã«ÂÂÃ¬ÂÂ¼ Ã¢ÂÂ
// recent(=lastCrawledAt desc) / satisfaction / positive / negativeRatio.
// Ã¬Â ÂÃ«Â Â¬Ã¬ÂÂ Ã¬ÂÂÃ«Â²ÂÃ«Â¡Â Ã¬ÂÂ®ÃªÂ¸Â´ Ã¬ÂÂ´Ã¬ÂÂ : Ã­ÂÂ´Ã«ÂÂ¼ÃªÂ°Â Ã­ÂÂÃ¬ÂÂ´Ã¬Â§Â Ã«ÂÂ¨Ã¬ÂÂÃ«Â¡ÂÃ«Â§Â Ã¬Â ÂÃ«Â Â¬Ã­ÂÂÃ«Â©Â´ Ã­ÂÂÃ¬ÂÂ´Ã¬Â§Â ÃªÂ²Â½ÃªÂ³ÂÃ¬ÂÂÃ¬ÂÂ
// Ã¬ÂÂÃ¬ÂÂÃªÂ°Â Ã«ÂÂ¤Ã¬ÂÂÃ¬ÂÂ¬ Ã¬ÂÂ¬Ã¬ÂÂ©Ã¬ÂÂÃªÂ°Â Ã­ÂÂ¼Ã«ÂÂÃ¬ÂÂ ÃªÂ²ÂªÃ«ÂÂÃ«ÂÂ¤.
export const RestaurantListQuery = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['recent', 'satisfaction', 'positive', 'negativeRatio']).default('recent'),
});
export type RestaurantListQueryType = z.infer<typeof RestaurantListQuery>;

export const RestaurantListResult = z.object({
  items: z.array(CanonicalListItem),
  // Ã­ÂÂÃ­ÂÂ° Ã¬Â ÂÃ¬ÂÂ© Ã­ÂÂ Ã¬Â ÂÃ¬Â²Â´ canonical Ã¬ÂÂ Ã¢ÂÂ Ã­ÂÂÃ¬ÂÂ´Ã¬Â ÂÃªÂ°Â totalPages ÃªÂ³ÂÃ¬ÂÂ°Ã¬ÂÂ Ã¬ÂÂ¬Ã¬ÂÂ©.
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

// Ã«Â°Â±Ã­ÂÂ Ã­ÂÂ¸Ã«Â¦Â¬ÃªÂ±Â° Ã¬ÂÂÃ«ÂÂµ. queued = Ã¬ÂÂ´Ã«Â²ÂÃ¬ÂÂ Ã¬ÂÂ¬Ã«Â¶ÂÃ¬ÂÂ Ã­ÂÂÃ¬ÂÂÃ«ÂÂ Ã«Â¦Â¬Ã«Â·Â° Ã¬ÂÂ.
export const RestaurantReanalyzeResult = z.object({
  ok: z.literal(true),
  queued: z.number().int(),
});
export type RestaurantReanalyzeResultType = z.infer<typeof RestaurantReanalyzeResult>;

// Ã«ÂÂ¨ÃªÂ±Â´ Ã«Â¦Â¬Ã«Â·Â° Ã¬ÂÂ¬Ã¬ÂÂÃ¬ÂÂ½ Ã¬ÂÂÃ«Â Â¥. Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼Ã¬ÂÂ´ Ã«ÂªÂ¨Ã«ÂÂ¸Ã¬ÂÂ ÃªÂ³Â¨Ã«ÂÂ¼ ÃªÂ·Â¸ Ã«Â¦Â¬Ã«Â·Â° Ã­ÂÂÃ«ÂÂÃ«Â§Â Ã«ÂÂ¤Ã¬ÂÂ Ã¬ÂÂÃ¬ÂÂ½Ã­ÂÂÃ«ÂÂ¤.
// Ã«ÂªÂ¨Ã«ÂÂ¸Ã¬ÂÂ Ã¬ÂÂ´Ã«Â²Â 1Ã­ÂÂÃ¬ÂÂ± Ã¢ÂÂ Ã¬Â ÂÃ¬ÂÂ­ defaultModel Ã¬ÂÂ Ã«Â°ÂÃªÂ¾Â¸Ã¬Â§Â Ã¬ÂÂÃ«ÂÂÃ«ÂÂ¤.
export const ReviewResummarizeInput = z.object({
  model: z.string().min(1).max(100),
});
export type ReviewResummarizeInputType = z.infer<typeof ReviewResummarizeInput>;

// Ã«ÂÂ¨ÃªÂ±Â´ Ã¬ÂÂ¬Ã¬ÂÂÃ¬ÂÂ½ Ã¬ÂÂÃ«ÂÂµ. Ã­ÂÂÃ¬ÂÂÃ«Â§Â Ã­ÂÂÃªÂ³Â  Ã¬Â¦ÂÃ¬ÂÂ Ã«Â°ÂÃ­ÂÂ Ã¢ÂÂ Ã¬Â§ÂÃ­ÂÂ/ÃªÂ²Â°ÃªÂ³Â¼Ã«ÂÂ ÃªÂ¸Â°Ã¬Â¡Â´ summary-events
// SSE Ã«Â¡Â Ã­ÂÂÃ«ÂÂ¬Ã¬ÂÂ¨Ã«ÂÂ¤. placeId Ã«ÂÂ SSE ÃªÂµÂ¬Ã«ÂÂ Ã­ÂÂ¤ (Naver ÃªÂ°Â Ã¬ÂÂÃ«ÂÂÃ«Â©Â´ null).
export const ReviewResummarizeResult = z.object({
  ok: z.literal(true),
  placeId: z.string().nullable(),
});
export type ReviewResummarizeResultType = z.infer<typeof ReviewResummarizeResult>;

// Ã¬ÂÂÃ¬ÂÂ½ Ã¬Â¤ÂÃ¬Â§Â Ã¬ÂÂÃ«ÂÂµ. cancelled = 'cancelled' Ã«Â¡Â Ã«Â§ÂÃ­ÂÂ¹Ã«ÂÂ Ã­ÂÂ Ã¬ÂÂ (queued + pending).
// running Ã­ÂÂÃ¬ÂÂ Ã¬ÂÂ´Ã«Â²Â Ã­ÂÂ¸Ã¬Â¶ÂÃ¬ÂÂÃ¬ÂÂ Ã¬ÂÂÃ«ÂÂÃ¬Â§Â Ã¬ÂÂÃªÂ³Â  Ã­ÂÂÃ¬ÂÂ¬ Ã¬Â²Â­Ã­ÂÂ¬ÃªÂ°Â Ã«ÂÂÃ«ÂÂÃ«Â©Â´ Ã¬ÂÂÃ¬ÂÂ° Ã¬Â¢ÂÃ«Â£ÂÃ«ÂÂÃ«ÂÂ¤.
export const RestaurantCancelSummaryResult = z.object({
  ok: z.literal(true),
  cancelled: z.number().int(),
});
export type RestaurantCancelSummaryResultType = z.infer<typeof RestaurantCancelSummaryResult>;

// Ã¬ÂÂÃ¬ÂÂ½ Ã¬ÂÂ¬ÃªÂ°Â Ã¬ÂÂÃ«ÂÂµ. resumed = 'cancelled' Ã¢ÂÂ 'queued' Ã«Â¡Â Ã«ÂÂ¤Ã¬ÂÂ Ã­ÂÂÃ¬ÂÂÃ«ÂÂ Ã­ÂÂ Ã¬ÂÂ.
// Ã«ÂªÂÃ¬ÂÂÃ¬Â ÂÃ¬ÂÂ¼Ã«Â¡Â Ã¬Â¤ÂÃ¬Â§Â(cancelled)Ã­ÂÂÃ«ÂÂ Ã­ÂÂÃ«Â§Â Ã¬ÂÂ¬Ã­ÂÂ¬Ã¬ÂÂÃ­ÂÂÃ«ÂÂ¤. failed/parse_failed ÃªÂ°ÂÃ¬ÂÂ
// LLM Ã¬ÂÂÃ«ÂÂ¬Ã«ÂÂ Ã«Â³ÂÃªÂ°Â Ã¢ÂÂ ÃªÂ·Â¸Ã¬ÂªÂ½Ã¬ÂÂ reanalyze Ã«Â¡Â Ã¬ÂÂ¬Ã¬ÂÂÃ«ÂÂ.
export const RestaurantResumeSummaryResult = z.object({
  ok: z.literal(true),
  resumed: z.number().int(),
});
export type RestaurantResumeSummaryResultType = z.infer<typeof RestaurantResumeSummaryResult>;

// Ã¬Â ÂÃªÂ·ÂÃ­ÂÂ Ã«Â¶ÂÃ¬ÂÂ Ã­ÂÂÃ¬ÂÂ´Ã«Â¸Â Ã«Â°Â±Ã­ÂÂ Ã¬ÂÂÃ«ÂÂµ. processed = Ã¬ÂÂÃ«Â¡Â Ã­ÂÂÃ¬ÂÂ Ã¬Â±ÂÃ¬ÂÂ´ summary Ã¬ÂÂ.
export const RestaurantAnalyticsBackfillResult = z.object({
  ok: z.literal(true),
  processed: z.number().int(),
});
export type RestaurantAnalyticsBackfillResultType = z.infer<
  typeof RestaurantAnalyticsBackfillResult
>;

// ÃªÂ°ÂÃ¬Â¤Â Ã«ÂÂÃ«ÂÂ¤ Ã­ÂÂ½ Ã¬ÂÂÃ«Â Â¥. candidatePlaceIds ÃªÂ°Â Ã«Â¹ÂÃ«Â©Â´ Ã«ÂÂ±Ã«Â¡ÂÃ«ÂÂ Ã«ÂªÂ¨Ã«ÂÂ  Ã¬ÂÂÃ«ÂÂ¹ Ã«ÂÂÃ¬ÂÂ.
// strategy: balanced(Ã«Â§ÂÃ¬Â¡Â±Ã«ÂÂ+ÃªÂ¸ÂÃ¬Â Â Ã­ÂÂ©), satisfaction(Ã«Â§ÂÃ¬Â¡Â±Ã«ÂÂÃ«Â§Â), positive(ÃªÂ¸ÂÃ¬Â ÂÃ«Â§Â).
export const RestaurantSmartPickInput = z.object({
  candidatePlaceIds: z.array(z.string()).optional(),
  strategy: z.enum(['balanced', 'satisfaction', 'positive']).default('balanced'),
});
export type RestaurantSmartPickInputType = z.infer<typeof RestaurantSmartPickInput>;

// ÃªÂ³ÂµÃªÂ°Â Ã¬ÂÂ¤Ã«Â§ÂÃ­ÂÂ¸ Ã­ÂÂ½ Ã¬ÂÂÃ«Â Â¥ Ã¢ÂÂ Ã«Â¬Â´Ã¬ÂÂ¸Ã¬Â¦Â Ã­ÂÂÃ«Â©Â´Ã¬ÂÂ´Ã«ÂÂ¼ Ã­ÂÂÃ«Â³Â´ Ã«Â°Â°Ã¬ÂÂ´Ã¬ÂÂ ÃªÂ³ÂÃ¬ÂÂ½Ã¬ÂÂ¼Ã«Â¡Â Ã«Â°ÂÃ¬ÂÂ´Ã«ÂÂ(Ã¬ÂÂÃ­ÂÂ 200 =
// publicList limit Ã¬ÂµÂÃ«ÂÂÃ¬ÂÂ Ã¬Â ÂÃ«Â Â¬). Ã¬ÂÂÃ«ÂÂµÃ¬ÂÂ Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼ÃªÂ³Â¼ Ã«ÂÂÃ¬ÂÂ¼Ã­ÂÂ RestaurantSmartPickResult.
export const RestaurantPublicSmartPickInput = z.object({
  candidatePlaceIds: z.array(z.string().min(1).max(64)).max(200).optional(),
  strategy: z.enum(['balanced', 'satisfaction', 'positive']).default('balanced'),
});
export type RestaurantPublicSmartPickInputType = z.infer<typeof RestaurantPublicSmartPickInput>;

export const RestaurantSmartPickResult = z.object({
  // Ã­ÂÂÃ«Â³Â´ÃªÂ°Â Ã¬ÂÂÃªÂ±Â°Ã«ÂÂ Ã«ÂªÂ¨Ã«ÂÂ ÃªÂ°ÂÃ¬Â¤ÂÃ¬Â¹Â 0Ã¬ÂÂ´Ã«Â©Â´ picked = null.
  picked: z
    .object({
      placeId: z.string(),
      name: z.string(),
      // Ã«ÂÂÃ«Â²ÂÃªÂ¹Â/UI Ã­ÂÂÃ¬ÂÂÃ¬ÂÂ© Ã¢ÂÂ Ã¬ÂÂ´Ã«ÂÂ¤ ÃªÂ°ÂÃ¬Â¤ÂÃ¬Â¹ÂÃªÂ°Â Ã¬Â ÂÃ¬ÂÂ©Ã«ÂÂÃ«ÂÂÃ¬Â§Â.
      weight: z.number(),
      avgSentimentScore: z.number().nullable(),
      avgSatisfactionScore: z.number().nullable(),
    })
    .nullable(),
  candidates: z.number().int(),
  strategy: z.enum(['balanced', 'satisfaction', 'positive']),
});
export type RestaurantSmartPickResultType = z.infer<typeof RestaurantSmartPickResult>;

// Ã¬ÂÂÃ«ÂÂ¹ Ã«ÂÂ¨Ã¬ÂÂ Ã¬Â§ÂÃªÂ³Â Ã¢ÂÂ done Ã­ÂÂÃ¬ÂÂÃ¬ÂÂ Ã¬Â¶ÂÃ¬Â¶Â. Ã«Â¹ÂÃ«ÂÂÃ¬ÂÂ Ã¬Â ÂÃ«Â Â¬.
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
  // Ã«Â¶ÂÃ¬ÂÂÃ«ÂÂ(done) Ã«Â¦Â¬Ã«Â·Â° Ã¬ÂÂ. 0Ã¬ÂÂ´Ã«Â©Â´ Ã«ÂªÂ¨Ã«ÂÂ  Ã­ÂÂµÃªÂ³ÂÃ«ÂÂ Ã«Â¹Â Ã«Â°Â°Ã¬ÂÂ´/0.
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

// Ã¬ÂÂ´ Ã¬ÂÂÃ«ÂÂ¹Ã¬ÂÂ Ã¬ÂÂ¸ÃªÂ¸Â Ã«Â©ÂÃ«ÂÂ´Ã«Â¥Â¼ Ã¬Â¹Â´Ã­ÂÂÃªÂ³Â Ã«Â¦Â¬ ÃªÂ³ÂÃ¬Â¸Âµ Ã­ÂÂ¸Ã«Â¦Â¬Ã«Â¡Â. Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼ Ã¬Â ÂÃ¬ÂÂ­ Ã­ÂÂ¸Ã«Â¦Â¬(analytics)Ã¬ÂÂ
// ÃªÂ°ÂÃ¬ÂÂ Ã«ÂÂ¸Ã«ÂÂ ÃªÂµÂ¬Ã¬Â¡Â°Ã«Â¥Â¼ Ã¬ÂÂ°Ã«ÂÂ Ã¬ÂÂ´ Ã¬ÂÂÃ«ÂÂ¹Ã¬ÂÂ Ã«Â©ÂÃ¬ÂÂÃ«Â§Â Ã«ÂÂÃ¬Â Â. coverage ÃªÂ°Â Ã¬ÂÂÃ¬ÂÂ¼Ã«Â©Â´ roots Ã«ÂÂ Ã«Â¹Â Ã«Â°Â°Ã¬ÂÂ´.
export const RestaurantCategoryTreeResult = z.object({
  roots: z.array(CategoryTreeNode),
});
export type RestaurantCategoryTreeResultType = z.infer<typeof RestaurantCategoryTreeResult>;

// ÃªÂ³ÂµÃªÂ°Â Ã¬ÂÂÃ«ÂÂ¹ Ã«ÂÂ­Ã­ÂÂ¹ Ã¢ÂÂ Ã«Â¹ÂÃ«Â¡ÂÃªÂ·Â¸Ã¬ÂÂ¸/ÃªÂ²ÂÃ¬ÂÂ¤Ã­ÂÂ¸Ã«ÂÂ Ã«Â³Â¼ Ã¬ÂÂ Ã¬ÂÂÃ«ÂÂ Ã«Â£Â¨Ã­ÂÂ¸ Ã­ÂÂÃ¬ÂÂ´Ã¬Â§ÂÃ¬ÂÂ©. Ã¬Â ÂÃ«Â Â¬Ã¬ÂÂ ÃªÂ¸ÂÃ¬Â Â/Ã«Â¶ÂÃ¬Â Â
// Ã«Â¹ÂÃ¬ÂÂ¨, Ã¬Â¤ÂÃ«Â¦Â½ Ã­ÂÂ¬Ã­ÂÂ¨/Ã¬Â ÂÃ¬ÂÂ¸ Ã­ÂÂ ÃªÂ¸ÂÃ«Â¡Â Ã«Â¶ÂÃ«ÂªÂ¨Ã«Â¥Â¼ Ã«Â°ÂÃªÂ¾Â¼Ã«ÂÂ¤. Ã­ÂÂÃ«Â³Â¸ Ã«Â¶ÂÃ¬Â¡Â± Ã¬ÂÂÃ«ÂÂ¹Ã¬ÂÂ´ 1ÃÂ·2ÃªÂ±Â´ Ã«Â©ÂÃ¬ÂÂÃ¬ÂÂ¼Ã«Â¡Â
// 1Ã¬ÂÂÃ«Â¥Â¼ Ã¬ÂÂ¡Ã¬Â§Â Ã«ÂªÂ»Ã­ÂÂÃªÂ²Â minMentions Ã¬Â»Â·Ã¬ÂÂ¤Ã­ÂÂ(ÃªÂ¸Â°Ã«Â³Â¸ 5).
export const RestaurantRankingQuery = z.object({
  sort: z.enum(['positive', 'negative']).default('positive'),
  // true = Ã«Â¶ÂÃ«ÂªÂ¨Ã¬ÂÂ neutral Ã¬Â ÂÃ¬ÂÂ¸ Ã¢ÂÂ positive/(positive+negative)
  // false = Ã«Â¶ÂÃ«ÂªÂ¨Ã¬ÂÂ neutral Ã­ÂÂ¬Ã­ÂÂ¨ Ã¢ÂÂ positive/(positive+negative+neutral)
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
  // Ã¬Â ÂÃ«Â Â¬ Ã¬Â ÂÃ¬ÂÂ (0~1). sort=positive Ã¢ÂÂ positive Ã«Â¹ÂÃ¬ÂÂ¨, sort=negative Ã¢ÂÂ negative Ã«Â¹ÂÃ¬ÂÂ¨.
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

// ÃªÂ³ÂµÃªÂ°Â Ã¬ÂÂÃ«ÂÂ¹ Ã«Â¦Â¬Ã¬ÂÂ¤Ã­ÂÂ¸(Ã¬Â§ÂÃ«ÂÂ Ã­ÂÂÃ¬ÂÂ´Ã¬Â§Â) Ã¢ÂÂ Ã«Â¹ÂÃ«Â¡ÂÃªÂ·Â¸Ã¬ÂÂ¸Ã«ÂÂ Ã­ÂÂ¸Ã¬Â¶Â. Ã¬Â¢ÂÃ­ÂÂ + Ã­ÂÂµÃ¬ÂÂ¬ Ã«Â©ÂÃ­ÂÂ + AI Ã­ÂÂµÃªÂ³Â Ã­ÂÂ
// Ã¬ÂÂÃ«ÂÂµÃ¬ÂÂ Ã«Â¬Â¶Ã¬ÂÂ. RestaurantListItem(Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼) ÃªÂ³Â¼ Ã«Â¶ÂÃ«Â¦Â¬Ã­ÂÂ Ã¬ÂÂ´Ã¬ÂÂ :
//   - Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼ Ã­ÂÂÃ¬ÂÂ Ã­ÂÂ¬Ã«Â¡Â¤ Ã¬Â§ÂÃ­ÂÂ/Ã¬ÂÂÃ¬ÂÂ½ Ã¬Â§ÂÃ­ÂÂÃ«Â¥Â  ÃªÂ°ÂÃ¬ÂÂ Ã¬ÂÂ´Ã¬ÂÂ Ã«Â©ÂÃ­ÂÂÃªÂ°Â Ã­ÂÂµÃ¬ÂÂ¬Ã¬ÂÂ´ÃªÂ³Â 
//   - ÃªÂ³ÂµÃªÂ°Â Ã­ÂÂÃ¬ÂÂ Ã¬Â¢ÂÃ­ÂÂ/Ã«ÂÂÃ­ÂÂ Ã¬ÂÂ¬Ã¬Â§Â/Ã«ÂÂÃ«Â¡ÂÃ«ÂªÂ/AI Ã¬ÂÂÃ¬ÂÂ½ Ã¬Â ÂÃ¬ÂÂÃªÂ°Â Ã­ÂÂµÃ¬ÂÂ¬Ã¬ÂÂ´Ã«ÂÂ¼ Ã­ÂÂÃ«ÂÂ Ã¬ÂÂÃ¬ÂÂ´ Ã«ÂÂ¤Ã«Â¥Â´Ã«ÂÂ¤.
export const RestaurantPublicListQuery = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  // "minLng,minLat,maxLng,maxLat" Ã¢ÂÂ Ã¬Â§ÂÃ«ÂÂ viewport bbox.
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
  // Ã­ÂÂ¬Ã«Â¡Â¤Ã«ÂÂ visitorReview Ã¬Â´Â Ã¬ÂÂ + Ã¬ÂÂÃ¬ÂÂ½ status Ã«Â¶ÂÃ­ÂÂ¬. Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼ Ã«Â°ÂÃªÂ²Â¬ Ã­ÂÂÃ¬ÂÂ´Ã¬Â§ÂÃªÂ°Â Ã¬Â§ÂÃ­ÂÂ
  // Ã«Â°Â°Ã¬Â§ÂÃ«Â¥Â¼ Ã«ÂÂ¼Ã¬ÂÂ´Ã«Â¸ÂÃ«Â¡Â ÃªÂ°Â±Ã¬ÂÂ Ã­ÂÂÃªÂ¸Â° Ã¬ÂÂÃ­ÂÂ´ Ã­ÂÂÃ¬ÂÂ Ã¢ÂÂ SSE summary Ã¬ÂÂ¤Ã«ÂÂÃ¬ÂÂ·Ã¬ÂÂ Ã­ÂÂÃ«ÂÂ Ã¬ÂÂ´Ã«Â¦ÂÃªÂ³Â¼
  // 1:1 Ã«Â§Â¤Ã¬Â¹Â­Ã«ÂÂÃ¬ÂÂ´ Ã¬ÂºÂÃ¬ÂÂ Ã­ÂÂ¨Ã¬Â¹ÂÃªÂ°Â ÃªÂ¹ÂÃ«ÂÂ.
  totalReviews: z.number().int(),
  summaryPending: z.number().int(),
  summaryRunning: z.number().int(),
  summaryDone: z.number().int(),
  summaryFailed: z.number().int(),
  // AI Ã­ÂÂµÃªÂ³Â (done Ã­ÂÂÃ«Â§Â). analyzedCount === 0 Ã¬ÂÂ´Ã«Â©Â´ Ã«ÂÂÃ«Â¨Â¸Ã¬Â§Â Ã¬Â ÂÃ¬ÂÂ/Ã¬Â¹Â´Ã¬ÂÂ´Ã­ÂÂ¸Ã«ÂÂ Ã¬ÂÂÃ«Â¯Â¸ Ã¬ÂÂÃ¬ÂÂ.
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

// ÃªÂ³ÂµÃªÂ°Â Ã¬ÂÂÃ¬ÂÂ¸ Ã¢ÂÂ Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼ detail Ã¬ÂÂÃ¬ÂÂ ReviewSummary Ã¬Â§ÂÃ­ÂÂ/Ã¬ÂÂÃ«ÂÂ¬ Ã«Â©ÂÃ­ÂÂÃ«ÂÂ°Ã¬ÂÂ´Ã­ÂÂ°Ã«Â¥Â¼ Ã¬Â ÂÃªÂ±Â°Ã­ÂÂÃªÂ³Â 
// Ã«Â¶ÂÃ¬ÂÂ ÃªÂ²Â°ÃªÂ³Â¼Ã«Â§Â Ã­ÂÂÃ­ÂÂÃ­ÂÂÃ­ÂÂÃ«ÂÂ¤. Ã«Â¶ÂÃ¬ÂÂ Ã¬ÂÂ Ã«ÂÂ Ã«Â¦Â¬Ã«Â·Â°Ã«ÂÂ analysis=null Ã«Â¡Â Ã«Â³Â¸Ã«Â¬Â¸Ã«Â§Â Ã«ÂÂ¸Ã¬Â¶Â.
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
  // Ã¬ÂÂ¸ Ã¬Â¶ÂÃ¬Â²ÂÃ¬ÂÂ Ã«Â¦Â¬Ã«Â·Â°ÃªÂ°Â ÃªÂ°ÂÃ¬ÂÂ Ã«Â°Â°Ã¬ÂÂ´Ã¬ÂÂ Ã¬ÂÂÃ¬ÂÂ¬ Ã«ÂÂ¤Ã¬ÂÂ´ÃªÂ°ÂÃ«Â¯ÂÃ«Â¡Â Ã¬Â¹Â´Ã«ÂÂ/Ã­ÂÂÃ­ÂÂ°ÃªÂ°Â Ã¬Â¶ÂÃ¬Â²ÂÃ«Â¥Â¼ ÃªÂµÂ¬Ã«Â¶Â.
  // DC/Ã­ÂÂÃ¬ÂÂ´Ã«Â¸ÂÃ«Â§Â Ã«Â¦Â¬Ã«Â·Â°Ã¬ÂÂ Ã¬Â ÂÃ¬ÂÂ Ã«ÂÂ¼Ã«Â²Â¨/Ã­ÂÂ¤Ã¬ÂÂÃ«ÂÂ/Ã¬Â£Â¼Ã«Â¬Â¸Ã«Â©ÂÃ«ÂÂ´/Ã¬ÂÂ¬Ã¬ÂÂ¥Ã«ÂÂµÃ«Â³Â ÃªÂ°ÂÃ¬ÂÂ Ã¬Â¶ÂÃªÂ°Â Ã«Â©ÂÃ­ÂÂÃ«ÂÂ
  // Ã­ÂÂÃ¬ÂÂ¬ DBÃ¬ÂÂ Ã¬Â ÂÃ¬ÂÂ¥Ã­ÂÂÃ¬Â§Â Ã¬ÂÂÃ¬ÂÂ¼Ã«Â¯ÂÃ«Â¡Â Ã«Â³Â¸ Ã¬ÂÂÃ«ÂÂµÃ¬ÂÂÃ«ÂÂ Ã­ÂÂ¬Ã­ÂÂ¨Ã­ÂÂÃ¬Â§Â Ã¬ÂÂÃ«ÂÂÃ«ÂÂ¤(Ã­ÂÂÃ¬ÂÂÃ­ÂÂ´Ã¬Â§ÂÃ«Â©Â´
  // VisitorReview Ã­ÂÂÃ¬ÂÂ extras Ã¬Â»Â¬Ã«ÂÂ¼Ã¬ÂÂ Ã¬Â¶ÂÃªÂ°ÂÃ­ÂÂÃ«ÂÂ Ã«Â³ÂÃ«ÂÂ Ã«Â§ÂÃ¬ÂÂ´ÃªÂ·Â¸Ã«Â ÂÃ¬ÂÂ´Ã¬ÂÂÃ¬ÂÂ´ Ã¬ÂÂ Ã­ÂÂ Ã­ÂÂÃ¬ÂÂ).
  // Ã­ÂÂÃ¬ÂÂ´Ã«Â¸ÂÃ«Â§Â Ã«Â¦Â¬Ã«Â·Â°Ã«ÂÂ Ã¬ÂÂÃ¬ÂÂ½/Ã¬ÂÂ¨Ã¬ÂÂ´Ã­ÂÂ Ã¬ÂÂ¤Ã¬ÂÂ¬Ã¬ÂÂ©Ã¬ÂÂÃ«Â§Â Ã¬ÂÂÃ¬ÂÂ± ÃªÂ°ÂÃ«ÂÂ¥ Ã¢ÂÂ UI ÃªÂ°Â "Ã«Â°Â©Ã«Â¬Â¸ Ã¬ÂÂ¸Ã¬Â¦Â"
  // Ã«ÂÂ¼Ã«Â²Â¨Ã¬ÂÂ Ã«Â¶ÂÃ¬ÂÂ¼ ÃªÂ·Â¼ÃªÂ±Â°.
  source: z.enum(['naver', 'diningcode', 'tabling']),
  authorName: z.string().nullable(),
  rating: z.number().nullable(),
  body: z.string(),
  visitedAt: z.string().nullable(),
  imageUrls: z.array(z.string().url()),
  videos: z.array(
    z.object({
      posterUrl: z.string().url(),
      videoUrl: z.string().url(),
    }),
  ),
  fetchedAt: z.string(),
  analysis: PublicReviewAnalysis.nullable(),
});
export type PublicVisitorReviewType = z.infer<typeof PublicVisitorReview>;

// Ã¬Â¶ÂÃ¬Â²ÂÃ«Â³Â Ã­ÂÂÃ¬ÂÂÃ¬ÂÂ© Ã«Â©ÂÃ­ÂÂ Ã¢ÂÂ Ã­ÂÂ¤Ã«ÂÂÃ¬ÂÂÃ¬ÂÂ Ã«Â³ÂÃ¬Â Â/Ã«Â¦Â¬Ã«Â·Â°Ã¬ÂÂÃ«Â¥Â¼ Ã¬Â¶ÂÃ¬Â²ÂÃ«Â³ÂÃ«Â¡Â Ã«Â¶ÂÃ«Â¦Â¬Ã­ÂÂ´ Ã«Â³Â´Ã¬ÂÂ¬ Ã¬Â¤Â Ã«ÂÂ Ã¬ÂÂ¬Ã¬ÂÂ©.
// `siteReviewCount` Ã«ÂÂ Ã¬ÂÂ¬Ã¬ÂÂ´Ã­ÂÂ¸ÃªÂ°Â Ã«Â³Â´ÃªÂ³Â Ã­ÂÂ Ã¬Â¹Â´Ã¬ÂÂ´Ã­ÂÂ¸(Ã«ÂÂ¤Ã¬ÂÂ´Ã«Â²Â reviewCount / DC reviewTotal).
// Ã¬ÂÂ°Ã«Â¦Â¬ÃªÂ°Â Ã¬ÂÂ¤Ã¬Â Â Ã¬ÂÂÃ¬Â§ÂÃ­ÂÂ Ã«Â¦Â¬Ã«Â·Â° Ã¬ÂÂÃ«ÂÂ Ã«Â³ÂÃ«ÂÂ `storedReviewCount` Ã­ÂÂÃ«ÂÂÃ¬ÂÂÃ¬ÂÂ Ã«ÂÂ¸Ã¬Â¶Â.
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

// Ã­ÂÂÃ¬ÂÂ´Ã«Â¸ÂÃ«Â§Â partner ÃªÂ°ÂÃªÂ²Â(idx Ã­ÂÂ°Ã¬ÂÂ´)Ã«Â§Â ÃªÂ³ÂµÃªÂ°Â ÃªÂ²Â½Ã«Â¡ÂÃ¬ÂÂ Ã«ÂÂ¸Ã¬Â¶Â Ã¢ÂÂ Ã«Â¯Â¸Ã¬ÂÂÃ¬Â Â place Ã­ÂÂ
// (sourceId 'place:' prefix) Ã¬ÂÂ Ã¬ÂÂÃ¬ÂÂ Ã¬ÂÂ¤Ã«ÂÂÃ¬ÂÂ·Ã¬ÂÂ´Ã«ÂÂ¼ Ã¬Â ÂÃ¬ÂÂ¸.
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

// Ã¬ÂÂ¤Ã¬Â Â DBÃ¬ÂÂ Ã¬Â ÂÃ¬ÂÂ¬Ã«ÂÂ Ã«Â¦Â¬Ã«Â·Â° Ã¬ÂÂ Ã¢ÂÂ Ã¬ÂÂ¬Ã¬ÂÂ´Ã­ÂÂ¸ Ã¬Â¹Â´Ã¬ÂÂ´Ã­ÂÂ¸Ã¬ÂÂ Ã«Â³ÂÃªÂ°ÂÃ«Â¡Â "Ã¬ÂÂ°Ã«Â¦Â¬ÃªÂ°Â Ã«Â¶ÂÃ¬ÂÂÃ¬ÂÂ Ã¬ÂÂ¸ Ã¬ÂÂ
// Ã¬ÂÂÃ«ÂÂ Ã«Â¦Â¬Ã«Â·Â° Ã­ÂÂ" Ã­ÂÂ¬ÃªÂ¸Â°. Ã¬Â¶ÂÃ¬Â²Â Ã­ÂÂÃ­ÂÂ° Ã¬Â¹Â©Ã¬ÂÂ Ã¬Â¹Â´Ã¬ÂÂ´Ã­ÂÂ¸Ã«Â¡Â Ã¬ÂÂ¬Ã¬ÂÂ©.
export const PublicStoredReviewCount = z.object({
  naver: z.number().int(),
  diningcode: z.number().int(),
  tabling: z.number().int(),
  total: z.number().int(),
});
export type PublicStoredReviewCountType = z.infer<typeof PublicStoredReviewCount>;

// Ã«ÂÂ¤Ã¬ÂÂ´Ã«ÂÂÃ¬Â½ÂÃ«ÂÂÃ«Â§Â ÃªÂ°ÂÃ¬Â§Â Ã«Â³Â´Ã¬Â¡Â° Ã¬Â ÂÃ«Â³Â´. canonical Ã¬ÂÂ DC Ã­ÂÂÃ¬ÂÂ´ Ã¬ÂÂÃ¬ÂÂ¼Ã«Â©Â´ Ã­ÂÂµÃ¬Â§Â¸Ã«Â¡Â null.
// scoreDetail Ã¬ÂÂ DC scoreDetail Ã¬ÂÂ Ã­ÂÂµÃ¬ÂÂ¬ Ã¬ÂÂÃ¬Â¹ÂÃ«Â§Â Ã¬Â¶ÂÃ«Â Â¤ Ã«ÂÂ¸Ã¬Â¶Â (bucket Ã«Â³Â Ã«Â¹ÂÃ¬ÂÂ¨Ã¬ÂÂ Ã¬Â ÂÃ¬ÂÂ¸).
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
export type PublicDiningcodeScoreDetailType = z.infer<typeof PublicDiningcodeScoreDetail>;

export const PublicDiningcodeAddon = z.object({
  scoreDetail: PublicDiningcodeScoreDetail.nullable(),
  descTags: z.array(z.string()),
  facilities: z.array(z.string()),
  tags: z.array(z.string()),
  wordcloudUrl: z.string().url().nullable(),
  // DC Ã¬ÂÂ "Ã«Â§Â¤Ã¬ÂÂ¼ 08:00-22:00" Ã­ÂÂ Ã¬Â¤Â Ã¬ÂÂÃ¬ÂÂ½ (Ã¬ÂÂ¬Ã«ÂÂ¬ Ã¬Â¤Â ÃªÂ°ÂÃ«ÂÂ¥).
  businessHoursSummary: z.array(DiningcodeShopBusinessHour),
  // Ã¬ÂÂÃ¬ÂÂ¼Ã«Â³Â 7Ã¬ÂÂ¼Ã¬Â¹Â.
  businessHoursWeekly: z.array(DiningcodeShopBusinessHour),
});
export type PublicDiningcodeAddonType = z.infer<typeof PublicDiningcodeAddon>;

// Ã­ÂÂÃ¬ÂÂ´Ã«Â¸ÂÃ«Â§ÂÃ«Â§Â ÃªÂ°ÂÃ¬Â§Â Ã«Â³Â´Ã¬Â¡Â° Ã¬Â ÂÃ«Â³Â´. canonical Ã¬ÂÂ Ã­ÂÂÃ¬ÂÂ´Ã«Â¸ÂÃ«Â§Â partner Ã­ÂÂÃ¬ÂÂ´ Ã¬ÂÂÃ¬ÂÂ¼Ã«Â©Â´ Ã­ÂÂµÃ¬Â§Â¸Ã«Â¡Â
// null. waitingCount(Ã¬ÂÂ¤Ã¬ÂÂÃªÂ°Â Ã¬ÂÂ¨Ã¬ÂÂ´Ã­ÂÂ Ã­ÂÂ Ã¬ÂÂ) Ã«ÂÂ Ã­ÂÂ¬Ã«Â¡Â¤ Ã¬ÂÂÃ¬Â Â Ã¬ÂÂ¤Ã«ÂÂÃ¬ÂÂ·Ã¬ÂÂ´Ã«ÂÂ¼ Ã¬ÂÂ¤Ã­ÂÂÃ¬ÂÂ¼ Ã­ÂÂÃ¬ÂÂ
// Ã¬ÂÂÃ­ÂÂÃ¬ÂÂ´ Ã¬Â»Â¤Ã¬ÂÂ Ã¬ÂÂÃ«ÂÂÃ¬Â ÂÃ¬ÂÂ¼Ã«Â¡Â Ã¬Â ÂÃ¬ÂÂ¸ Ã¢ÂÂ ÃªÂ°ÂÃ¬ÂÂ© Ã¬ÂÂ¬Ã«Â¶Â Ã­ÂÂÃ«ÂÂÃªÂ·Â¸Ã«Â§Â Ã«ÂÂ¸Ã¬Â¶Â.
export const PublicTablingAddon = z.object({
  // Ã¬ÂÂ¨Ã¬ÂÂ´Ã­ÂÂ/Ã¬ÂÂÃªÂ²Â©Ã¬ÂÂ¨Ã¬ÂÂ´Ã­ÂÂ/Ã¬ÂÂÃ¬ÂÂ½/Ã­ÂÂ¬Ã¬ÂÂ¥/Ã­ÂÂÃ¬ÂÂ¥Ã¬Â£Â¼Ã«Â¬Â¸ ÃªÂ°ÂÃ¬ÂÂ© Ã­ÂÂÃ«ÂÂÃªÂ·Â¸ Ã¢ÂÂ Ã¬Â¹Â´Ã«ÂÂ/Ã­ÂÂ¤Ã«ÂÂ Ã«Â°Â°Ã¬Â§ÂÃ¬ÂÂ©.
  flags: TablingServiceFlags,
  // 4Ã¬Â¶Â Ã­ÂÂ­Ã«ÂªÂ© Ã­ÂÂÃ¬Â Â (Ã«Â§Â/Ã«Â¶ÂÃ¬ÂÂÃªÂ¸Â°/Ã¬ÂÂÃ«Â¹ÂÃ¬ÂÂ¤/Ã¬Â²Â­ÃªÂ²Â° Ã¢ÂÂ Ã¬ÂÂ¬Ã¬ÂÂ´Ã­ÂÂ¸ Ã­ÂÂÃªÂ¸Â° ÃªÂ·Â¸Ã«ÂÂÃ«Â¡Â).
  ratings: z.array(TablingRatingItem),
  favoriteCount: z.number().int().nullable(),
  // Ã¬ÂÂÃ¬ÂÂ¼Ã«Â³Â Ã¬ÂÂÃ¬ÂÂÃ¬ÂÂÃªÂ°Â Ã¢ÂÂ InfoTab Ã¬ÂÂ "Ã¬Â£Â¼ÃªÂ°Â Ã¬ÂÂÃ¬ÂÂÃ¬ÂÂÃªÂ°Â Ã¬ÂÂÃ¬ÂÂ¸" Ã­ÂÂ¼Ã¬Â¹Â¨Ã¬ÂÂ©.
  businessDays: z.array(TablingBusinessDay),
});
export type PublicTablingAddonType = z.infer<typeof PublicTablingAddon>;

// ÃªÂ³ÂµÃªÂ°Â Ã¬ÂÂÃ«ÂÂ¹ Ã¬ÂÂÃ¬ÂÂ¸. ÃªÂ¸Â°Ã¬Â¡Â´ Ã¬ÂÂ¤Ã¬Â¹Â¼Ã«ÂÂ¼ Ã­ÂÂÃ«ÂÂ (name/category/address/rating Ã«ÂÂ±) Ã«ÂÂ
// Ã¬ÂÂ¸ Ã¬Â¶ÂÃ¬Â²ÂÃªÂ°Â Ã«Â¨Â¸Ã¬Â§ÂÃ«ÂÂ ÃªÂ²Â°ÃªÂ³Â¼ Ã¢ÂÂ Ã¬Â Â Ã­ÂÂÃ«ÂÂ Naver 1Ã¬ÂÂÃ¬ÂÂ, Ã«Â¹ÂÃ«Â©Â´ Ã­ÂÂ´Ã«Â°Â± (Ã¬ÂÂÃ¬ÂÂÃ¬ÂÂÃªÂ°ÂÃÂ·Ã«Â©ÂÃ«ÂÂ´Ã«ÂÂ
// Ã­ÂÂÃ¬ÂÂ´Ã«Â¸ÂÃ«Â§Â > DC, ÃªÂ·Â¸ Ã¬ÂÂ¸ DC > Ã­ÂÂÃ¬ÂÂ´Ã«Â¸ÂÃ«Â§Â). Ã¬Â¶ÂÃ¬Â²ÂÃ«Â³Â Ã«Â¶ÂÃ«Â¦Â¬ÃªÂ°ÂÃ¬ÂÂ `sources` Ã¬ÂÂ Ã«ÂÂ°Ã«Â¡Â
// Ã«ÂÂ¸Ã¬Â¶ÂÃ«ÂÂÃ¬ÂÂ´ UI ÃªÂ°Â Ã­ÂÂ¤Ã«ÂÂ Ã«ÂÂ±Ã¬ÂÂÃ¬ÂÂ Ã­ÂÂÃ¬ÂÂÃ­ÂÂ  Ã¬ÂÂ Ã¬ÂÂÃ«ÂÂ¤.
export const RestaurantPublicDetail = z.object({
  placeId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  address: z.string().nullable(),
  roadAddress: z.string().nullable(),
  phone: z.string().nullable(),
  // Naver text Ã¬ÂÂ°Ã¬ÂÂ , Ã«Â¹ÂÃ«Â©Â´ Ã­ÂÂÃ¬ÂÂ´Ã«Â¸ÂÃ«Â§Â Ã¬ÂÂÃ¬ÂÂ¼Ã«Â³Â Ã¬Â§ÂÃ«Â Â¬Ã­ÂÂ string, ÃªÂ·Â¸ÃªÂ²ÂÃ«ÂÂ Ã¬ÂÂÃ¬ÂÂ¼Ã«Â©Â´ DC summary.
  businessHours: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  // Naver imageUrls + DC photos/images origin + Ã­ÂÂÃ¬ÂÂ´Ã«Â¸ÂÃ«Â§Â images Ã­ÂÂ©Ã¬Â§ÂÃ­ÂÂ© (URL dedup).
  // Ã¬Â ÂÃ«ÂÂ URL(Ã¬ÂÂ¸Ã«Â¶Â CDN) Ã«ÂÂÃ«ÂÂ same-origin Ã¬Â ÂÃ«ÂÂÃªÂ²Â½Ã«Â¡Â(/api/v1/media/panorama/Ã¢ÂÂ¦ Ã¢ÂÂ
  // Ã«Â§ÂÃ«Â£ÂÃ«ÂÂÃ«ÂÂ Ã«ÂÂ¤Ã¬ÂÂ´Ã«Â²Â Ã­ÂÂÃ«ÂÂ¸Ã«ÂÂ¼Ã«Â§ÂÃ«Â¥Â¼ Ã­ÂÂ¬Ã«Â¡Â¤ Ã¬ÂÂÃ¬Â ÂÃ¬ÂÂ Ã«Â°ÂÃ¬ÂÂÃ«ÂÂ Ã¬ÂÂ°Ã«Â¦Â¬ Ã¬ÂÂ¬Ã«Â³Â¸) Ã«ÂÂ Ã«ÂÂ¤ Ã­ÂÂÃ¬ÂÂ©Ã­ÂÂÃ«ÂÂ¤.
  imageUrls: z.array(z.string().url().or(z.string().startsWith('/'))),
  // Naver ÃªÂ°Â Ã«Â¹ÂÃ¬ÂÂ´Ã¬ÂÂÃ¬ÂÂ Ã«ÂÂÃ«Â§Â Ã­ÂÂÃ¬ÂÂ´Ã«Â¸ÂÃ«Â§Â menus, ÃªÂ·Â¸ÃªÂ²ÂÃ«ÂÂ Ã¬ÂÂÃ¬ÂÂ¼Ã«Â©Â´ DC menus Ã«Â¥Â¼ Ã«Â§Â¤Ã­ÂÂÃ­ÂÂ´ Ã¬Â±ÂÃ¬ÂÂ.
  menus: z.array(MenuItem),
  // Ã¬ÂÂÃ«Â³Â¸ Ã«Â©ÂÃ«ÂÂ´ ÃªÂ·Â¸Ã«Â£Â¹. ÃªÂ¸Â°Ã¬Â¡Â´ `menus` Ã«ÂÂ ÃªÂ³ÂÃ¬ÂÂ Ã­ÂÂÃ­ÂÂÃ­ÂÂ Ã«ÂªÂ©Ã«Â¡ÂÃ¬ÂÂ¼Ã«Â¡Â Ã¬Â ÂÃªÂ³ÂµÃ­ÂÂÃªÂ³Â , ÃªÂ·Â¸Ã«Â£Â¹Ã¬ÂÂ
  // Ã­ÂÂÃ¬ÂÂÃ­ÂÂ  Ã¬ÂÂ Ã¬ÂÂÃ«ÂÂ Ã­ÂÂ´Ã«ÂÂ¼Ã¬ÂÂ´Ã¬ÂÂ¸Ã­ÂÂ¸Ã«Â§Â Ã¬ÂÂ´ optional Ã­ÂÂÃ«ÂÂÃ«Â¥Â¼ Ã¬ÂÂ¬Ã¬ÂÂ©Ã­ÂÂÃ«ÂÂ¤.
  menuGroups: z.array(MenuGroup).optional(),
  // Naver blogReviews + DC blogsFirstPage Ã­ÂÂ©Ã¬Â³Â dedup.
  blogReviews: z.array(BlogReview),
  rawSourceUrl: z.string(),
  firstCrawledAt: z.string(),
  // Ã«Â°Â©Ã«Â¬Â¸Ã¬ÂÂ Ã«Â¦Â¬Ã«Â·Â°Ã«ÂÂ Ã­ÂÂÃ¬ÂÂ´Ã¬Â§ÂÃ«ÂÂ¤Ã¬ÂÂ´Ã¬ÂÂ. Ã¬Â²Â« Ã­ÂÂÃ¬ÂÂ´Ã¬Â§ÂÃ«Â§Â detail Ã¬ÂÂ Ã«ÂÂÃ«Â´ÂÃ­ÂÂ´Ã¬ÂÂ ReviewsTab Ã¬Â²Â«
  // Ã¬Â§ÂÃ¬ÂÂÃ¬ÂÂ Ã¬Â¶ÂÃªÂ°Â fetch Ã¬ÂÂÃ¬ÂÂ´ Ã¬Â¦ÂÃ¬ÂÂ ÃªÂ·Â¸Ã«Â¦Â´ Ã¬ÂÂ Ã¬ÂÂÃªÂ²Â Ã­ÂÂÃ«ÂÂ¤. Ã¬Â¶ÂÃªÂ°Â Ã­ÂÂÃ¬ÂÂ´Ã¬Â§ÂÃ«ÂÂ Ã«Â³ÂÃ«ÂÂ
  // Ã¬ÂÂÃ«ÂÂÃ­ÂÂ¬Ã¬ÂÂ¸Ã­ÂÂ¸(Routes.Restaurant.publicReviews)Ã«Â¡Â ÃªÂ°ÂÃ¬Â Â¸Ã¬ÂÂ´.
  // Ã¬Â ÂÃ«Â Â¬: Ã¬ÂÂ¤Ã¬Â Â Ã«Â°Â©Ã«Â¬Â¸Ã¬ÂÂ¼ desc(Ã­ÂÂ´Ã¬ÂÂ Ã«Â¶ÂÃªÂ°Â Ã¬ÂÂ fetchedAt desc), Ã­ÂÂÃ­ÂÂ°: all.
  // ReviewsTab Ã¬ÂÂ ÃªÂ¸Â°Ã«Â³Â¸ UI Ã¬ÂÂÃ­ÂÂÃ¬ÂÂ Ã¬ÂÂ¼Ã¬Â¹Â.
  reviewsFirstPage: z.array(PublicVisitorReview),
  // sentiment chip Ã¬ÂÂ Ã¬Â¹Â´Ã¬ÂÂ´Ã­ÂÂ¸. Ã«Â³ÂÃ«ÂÂ fetch Ã¬ÂÂ Ã­ÂÂÃªÂ³Â  detail Ã¬ÂÂÃ¬ÂÂ Ã­ÂÂ Ã«Â²ÂÃ¬ÂÂ.
  reviewCounts: z.object({
    all: z.number().int(),
    positive: z.number().int(),
    negative: z.number().int(),
  }),
  // Ã¬Â¶ÂÃ¬Â²ÂÃ«Â³Â Ã«Â³ÂÃ¬Â Â/Ã«Â¦Â¬Ã«Â·Â°Ã¬ÂÂ Ã¢ÂÂ Ã­ÂÂ¤Ã«ÂÂ Ã«Â¶ÂÃ«Â¦Â¬ Ã­ÂÂÃ¬ÂÂÃ¬ÂÂ©. Ã«ÂÂ Ã«ÂÂ¤ Ã¬ÂÂÃ«ÂÂ ÃªÂ²Â½Ã¬ÂÂ° Ã«ÂÂ Ã«ÂÂ¤ Ã¬Â±ÂÃ¬ÂÂ.
  sources: PublicSources,
  // DB Ã¬Â ÂÃ¬ÂÂ¥ Ã«Â¦Â¬Ã«Â·Â° Ã¬Â¹Â´Ã¬ÂÂ´Ã­ÂÂ¸ Ã¢ÂÂ Ã¬Â¶ÂÃ¬Â²Â Ã­ÂÂÃ­ÂÂ° Ã¬Â¹Â© Ã¬Â¹Â´Ã¬ÂÂ´Ã­ÂÂ¸Ã«Â¡Â Ã¬ÂÂ¬Ã¬ÂÂ©.
  storedReviewCount: PublicStoredReviewCount,
  // DC Ã«Â³Â´Ã¬Â¡Â° Ã¬Â ÂÃ«Â³Â´ Ã¢ÂÂ canonical Ã¬ÂÂ DC Ã­ÂÂÃ¬ÂÂ´ Ã¬ÂÂÃ¬ÂÂ¼Ã«Â©Â´ null.
  diningcode: PublicDiningcodeAddon.nullable(),
  // Ã­ÂÂÃ¬ÂÂ´Ã«Â¸ÂÃ«Â§Â Ã«Â³Â´Ã¬Â¡Â° Ã¬Â ÂÃ«Â³Â´ Ã¢ÂÂ canonical Ã¬ÂÂ Ã­ÂÂÃ¬ÂÂ´Ã«Â¸ÂÃ«Â§Â partner Ã­ÂÂÃ¬ÂÂ´ Ã¬ÂÂÃ¬ÂÂ¼Ã«Â©Â´ null.
  tabling: PublicTablingAddon.nullable(),
  // Ã¬ÂÂÃªÂ°ÂÃ¬ÂÂÃ¬ÂÂ Ã«Â§Â¤Ã¬Â¹Â­(Ã¬ÂÂÃ¬Â¢ÂÃÂ·Ã­ÂÂÃ¬ÂÂ Ã¬ÂÂÃ¬ÂÂ¬) Ã¢ÂÂ Ã«Â§Â¤Ã¬Â¹Â­ Ã¬ÂÂÃ¬ÂÂ¼Ã«Â©Â´ null.
  store: RestaurantStoreInfo.nullable(),
});
export type RestaurantPublicDetailType = z.infer<typeof RestaurantPublicDetail>;

// `/restaurants/public/:placeId/reviews` Ã¬Â¿Â¼Ã«Â¦Â¬. ReviewsTab Ã¬ÂÂ chip + Ã¬Â ÂÃ«Â Â¬Ã¬ÂÂ ÃªÂ·Â¸Ã«ÂÂÃ«Â¡Â
// Ã«Â°Â±Ã¬ÂÂÃ«ÂÂ Ã­ÂÂÃ¬ÂÂ´Ã¬Â§ÂÃ«ÂÂ¤Ã¬ÂÂ´Ã¬ÂÂÃ¬ÂÂ¼Ã«Â¡Â Ã¬ÂÂÃ¬ÂÂ. UI Ã¬ÂÂ SentimentFilter / SortMode Ã¬ÂÂ ÃªÂ°ÂÃ¬ÂÂ ÃªÂ°Â.
export const RestaurantPublicReviewSentiment = z.enum(['all', 'positive', 'negative']);
export type RestaurantPublicReviewSentimentType = z.infer<typeof RestaurantPublicReviewSentiment>;

export const RestaurantPublicReviewSort = z.enum(['recent', 'rating']);
export type RestaurantPublicReviewSortType = z.infer<typeof RestaurantPublicReviewSort>;

export const RestaurantPublicReviewsQuery = z.object({
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  sentiment: RestaurantPublicReviewSentiment.default('all'),
  sort: RestaurantPublicReviewSort.default('recent'),
  // Ã«Â°Â©Ã«Â¬Â¸ Ã­ÂÂ Ã­ÂÂÃ­ÂÂ°. Ã¬ÂÂ¸Ã¬ÂÂ¬Ã¬ÂÂ´Ã­ÂÂ¸Ã¬ÂÂ topTips(Ã¬Â ÂÃªÂ·ÂÃ­ÂÂ Ã«Â¹ÂÃ«ÂÂ Ã¬Â§ÂÃªÂ³Â)Ã¬ÂÂÃ¬ÂÂ Ã­ÂÂ Ã­ÂÂ­Ã«ÂªÂ©Ã¬ÂÂ Ã­ÂÂ´Ã«Â¦Â­Ã­ÂÂÃ«Â©Â´
  // ÃªÂ·Â¸ Ã­ÂÂÃ¬ÂÂ´ Ã«ÂÂ¬Ã«Â¦Â° Ã«Â¦Â¬Ã«Â·Â°Ã«Â§Â Ã«Â³Â´Ã¬ÂÂ¬Ã¬Â¤ÂÃ«ÂÂ¤. Ã¬ÂÂÃ«Â²ÂÃ«ÂÂ termNorm Ã¬Â ÂÃ­ÂÂ Ã¬ÂÂ¼Ã¬Â¹ÂÃ«Â¡Â ÃªÂ±Â°Ã«Â¥Â¸Ã«ÂÂ¤.
  tip: z.string().trim().min(1).optional(),
  // Ã«Â©ÂÃ«ÂÂ´ Ã­ÂÂÃ­ÂÂ°. Ã«Â©ÂÃ«ÂÂ´ Ã¬Â¹Â´Ã«ÂÂ(topMenus Ã¬ÂÂ canonical Ã­ÂÂÃ¬ÂÂÃ«ÂªÂ)Ã«Â¥Â¼ Ã­ÂÂ´Ã«Â¦Â­Ã­ÂÂÃ«Â©Â´ ÃªÂ·Â¸ Ã«Â©ÂÃ«ÂÂ´Ã«Â¥Â¼
  // Ã¬ÂÂ¸ÃªÂ¸ÂÃ­ÂÂ Ã«Â¦Â¬Ã«Â·Â°Ã«Â§Â. Ã¬ÂÂÃ«Â²ÂÃ«ÂÂ topMenus Ã¬ÂÂ Ã«ÂÂÃ¬ÂÂ¼Ã­ÂÂ MenuCanonical ÃªÂ·Â¸Ã«Â£Â¹Ã­ÂÂÃ¬ÂÂ¼Ã«Â¡Â Ã«Â§Â¤Ã¬Â¹Â­Ã­ÂÂ´
  // Ã¬Â¹Â´Ã«ÂÂÃ¬ÂÂ 'NÃ­ÂÂ Ã¬ÂÂ¸ÃªÂ¸Â' Ã¬Â¹Â´Ã¬ÂÂ´Ã­ÂÂ¸Ã¬ÂÂ ÃªÂ²Â°ÃªÂ³Â¼ Ã¬ÂÂÃªÂ°Â Ã¬ÂÂ¼Ã¬Â¹ÂÃ­ÂÂÃ«ÂÂ¤(Ã¬ÂÂ½Ã¬ÂÂ´/Ã­ÂÂÃªÂ¸Â° Ã«Â³ÂÃ­ÂÂ Ã­ÂÂ¬Ã­ÂÂ¨).
  menu: z.string().trim().min(1).optional(),
});
export type RestaurantPublicReviewsQueryType = z.infer<typeof RestaurantPublicReviewsQuery>;

export const RestaurantPublicReviewsResult = z.object({
  items: z.array(PublicVisitorReview),
  // Ã­ÂÂÃ¬ÂÂ¬ Ã­ÂÂÃ­ÂÂ°(sentiment) Ã¬Â ÂÃ¬ÂÂ© Ã­ÂÂ Ã¬Â´Â Ã¬Â¹Â´Ã¬ÂÂ´Ã­ÂÂ¸. hasMore Ã­ÂÂÃ«ÂÂ¨Ã¬ÂÂ©.
  total: z.number().int(),
});
export type RestaurantPublicReviewsResultType = z.infer<typeof RestaurantPublicReviewsResult>;

// SSE per-review payload pushed by the summary-events stream when a single
// row's AI summary finishes (success or failure). The client merges this
// directly into the restaurant detail cache, so a fresh summary appears in
// the UI without a follow-up GET. The multiplexed endpoint tags every event
// with placeId so the client can demux when one connection serves many
// restaurants.
// SSE Ã¬ÂÂ´Ã«Â²Â¤Ã­ÂÂ¸Ã¬ÂÂ ÃªÂ³ÂµÃ­ÂÂµ source Ã¬ÂÂÃ«Â³ÂÃ¬ÂÂ Ã¢ÂÂ Ã­ÂÂ canonical Ã¬ÂÂ Ã¬ÂÂ´Ã«ÂÂ source Ã­ÂÂ Ã¬Â¤ÂÃ¬ÂÂÃ¬ÂÂ
// Ã«Â°ÂÃ¬ÂÂÃ­ÂÂÃ«ÂÂÃ¬Â§Â. placeId Ã«ÂÂ source='naver' Ã¬ÂÂ¼ Ã«ÂÂÃ«Â§Â Ã¬Â±ÂÃ¬ÂÂÃ¬Â§Â.
export const RestaurantSummaryEventSource = z.object({
  canonicalId: z.string(),
  restaurantId: z.string(),
  source: z.string(),
  sourceId: z.string(),
  placeId: z.string().nullable(),
});
export type RestaurantSummaryEventSourceType = z.infer<typeof RestaurantSummaryEventSource>;

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
  // Ã­ÂÂÃ¬ÂÂ Ã«ÂÂ¤Ã¬ÂÂ´ÃªÂ°ÂÃ¬Â§ÂÃ«Â§Â Ã¬ÂÂÃ¬Â§Â run() Ã¬Â§ÂÃ¬ÂÂ Ã¬Â Â. chain Ã«ÂÂÃªÂ¸Â°. ReviewSummaryStatus Ã¬ÂÂ
  // 'queued' Ã«ÂÂ¨ÃªÂ³ÂÃ¬ÂÂ Ã¬ÂÂ¼Ã«ÂÂÃ¬ÂÂ¼.
  queued: z.number().int(),
  pending: z.number().int(),
  running: z.number().int(),
  done: z.number().int(),
  failed: z.number().int(),
  // Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼Ã¬ÂÂ´ Ã«ÂªÂÃ¬ÂÂÃ¬Â ÂÃ¬ÂÂ¼Ã«Â¡Â Ã¬ÂÂÃ¬ÂÂ½ Ã¬Â¤ÂÃ¬Â§ÂÃ«Â¥Â¼ Ã«ÂÂÃ«Â¥Â¸ ÃªÂ²Â°ÃªÂ³Â¼. inFlight Ã­ÂÂ©Ã¬ÂÂ°Ã¬ÂÂÃ¬ÂÂ Ã«Â¹Â Ã¬Â§ÂÃ«ÂÂ¤.
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

// SSE snapshot payload Ã¢ÂÂ GET /summary-status Ã¬ÂÂÃ«ÂÂµ + source Ã¬ÂÂÃ«Â³ÂÃ¬ÂÂ. canonicalId
// Ã«Â¡Â list Ã­ÂÂÃ¬ÂÂ Ã¬Â°Â¾ÃªÂ³Â , restaurantId Ã«Â¡Â ÃªÂ·Â¸ Ã­ÂÂÃ¬ÂÂ source Ã­ÂÂ Ã¬Â¤ÂÃ¬ÂÂ Ã¬Â°Â¾Ã¬ÂÂ ÃªÂ°Â±Ã¬ÂÂ Ã­ÂÂÃ«ÂÂ¤.
export const RestaurantSummarySnapshotEvent = RestaurantSummaryProgress.merge(
  RestaurantSummaryEventSource,
);
export type RestaurantSummarySnapshotEventType = z.infer<typeof RestaurantSummarySnapshotEvent>;

// Ã¬ÂÂÃ¬ÂÂ½ SSE Ã¬ÂÂ¤Ã­ÂÂ¸Ã«Â¦Â¼(/summary-events)Ã¬ÂÂ¼Ã«Â¡Â Ã­ÂÂÃ«Â Â¤Ã«Â³Â´Ã«ÂÂ´Ã«ÂÂ Ã«ÂÂ¨ÃªÂ³ÂÃ«Â³Â Ã«Â¡ÂÃªÂ·Â¸ Ã¬ÂÂ´Ã«Â²Â¤Ã­ÂÂ¸. Ã­ÂÂ¬Ã«Â¡Â¤
// SSE Ã¬ÂÂ 'log' Ã¬ÂÂ´Ã«Â²Â¤Ã­ÂÂ¸Ã¬ÂÂ ÃªÂ°ÂÃ¬ÂÂ Ã­ÂÂÃ¬ÂÂ´Ã«Â¡ÂÃ«ÂÂ + source Ã¬ÂÂÃ«Â³ÂÃ¬ÂÂ. UI Ã«ÂÂ SummaryEvent Ã¬ÂÂ
// CrawlEvent Ã¬ÂÂ 'log' Ã«Â³ÂÃ¬Â¢ÂÃ¬ÂÂ Ã­ÂÂÃ«ÂÂÃ¬ÂÂ Ã«Â¡ÂÃªÂ·Â¸ Ã­ÂÂ­Ã¬ÂÂ Ã­ÂÂ©Ã¬Â³Â Ã«ÂÂÃ¬Â Â Ã­ÂÂÃ¬ÂÂÃ­ÂÂ  Ã¬ÂÂ Ã¬ÂÂÃ«ÂÂ¤.
// jobId Ã«ÂÂ Ã­ÂÂÃ¬ÂÂ Ã¬ÂÂÃ¬Â ÂÃ¬ÂÂ Ã­ÂÂ¬Ã«Â¡Â¤ Ã¬ÂÂ¡ ID ÃªÂ°Â Ã¬Â ÂÃ«ÂÂ¬Ã«ÂÂ ÃªÂ²Â½Ã¬ÂÂ°Ã¬ÂÂÃ«Â§Â Ã¬Â±ÂÃ¬ÂÂÃ¬Â§Â (Ã¬ÂÂÃ«ÂÂ Ã¬ÂÂÃ¬ÂÂ½ Ã¬ÂÂ¬Ã¬ÂÂ¤Ã­ÂÂ
// ÃªÂ°ÂÃ¬ÂÂ´ Ã¬ÂÂ¡ Ã¬Â»Â¨Ã­ÂÂÃ¬ÂÂ¤Ã­ÂÂ¸ Ã¬ÂÂÃ«ÂÂ ÃªÂ²Â½Ã«Â¡ÂÃ¬ÂÂÃ¬ÂÂÃ«ÂÂ null).
// seq Ã«ÂÂ ÃªÂ°ÂÃ¬ÂÂ Ã¬ÂÂ¡ Ã¬ÂÂÃ¬ÂÂÃ¬ÂÂ Ã«ÂªÂ¨Ã«ÂÂ¸Ã­ÂÂ¤. Ã­ÂÂ¬Ã«Â¡Â¤ SSE Ã¬ÂÂ Ã¬ÂÂÃ¬ÂÂ½ SSE Ã¬ÂÂÃ¬ÂªÂ½Ã¬ÂÂ¼Ã«Â¡Â fan-out Ã«ÂÂ
// ÃªÂ°ÂÃ¬ÂÂ Ã«Â¡ÂÃªÂ·Â¸Ã«Â¥Â¼ (jobId, seq) Ã«Â¡Â dedup Ã­ÂÂÃªÂ¸Â° Ã¬ÂÂÃ­ÂÂ¨.
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

// Ã¢ÂÂÃ¢ÂÂ Ã¬Â§ÂÃ¬ÂÂ­ Ã­ÂÂµÃªÂ³Â (Ã¬ÂÂ´Ã«ÂÂÃ«Â¯Â¼ Ã­ÂÂ Ã«ÂÂÃ¬ÂÂÃ«Â³Â´Ã«ÂÂ) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Ã«ÂÂ±Ã«Â¡ÂÃ«ÂÂ ÃªÂ°ÂÃªÂ²Â(canonical)Ã«Â¥Â¼ Ã¬ÂÂ/Ã«ÂÂÃÂ·Ã¬ÂÂÃªÂµÂ°ÃªÂµÂ¬Ã«Â¡Â Ã«Â¬Â¶Ã¬ÂÂ Ã«Â¶ÂÃ­ÂÂ¬. Ã¬ÂÂÃªÂµÂ°ÃªÂµÂ¬Ã«ÂÂ Ã¬Â£Â¼Ã¬ÂÂ Ã«Â¬Â¸Ã¬ÂÂÃ¬ÂÂ´Ã¬ÂÂ
// regions.json Ã¬ÂÂ¬Ã¬Â ÂÃªÂ³Â¼ Ã«Â§Â¤Ã¬Â¹Â­Ã­ÂÂ´ Ã­ÂÂÃ¬ÂÂÃ­ÂÂÃªÂ³Â , Ã¬Â£Â¼Ã¬ÂÂÃªÂ°Â Ã¬ÂÂÃ¬ÂÂ¼Ã«Â©Â´ Ã¬Â¢ÂÃ­ÂÂ Ã¬ÂµÂÃªÂ·Â¼Ã¬Â Â Ã¬ÂÂÃªÂµÂ°ÃªÂµÂ¬Ã«Â¡Â
// Ã­ÂÂ´Ã«Â°Â±Ã­ÂÂÃ«ÂÂ¤. Ã«ÂÂ Ã«ÂÂ¤ Ã¬ÂÂ¤Ã­ÂÂ¨Ã­ÂÂÃ«Â©Â´ unclassified Ã«Â¡Â Ã¬Â§ÂÃªÂ³ÂÃ«ÂÂÃ¬ÂÂ´ Ã¬ÂÂ´Ã«ÂÂÃ¬ÂÂÃ«ÂÂ Ã¬ÂÂÃ­ÂÂÃ¬Â§Â Ã¬ÂÂÃ«ÂÂÃ«ÂÂ¤.
export const RegionStatsSigungu = z.object({
  sigungu: z.string(),
  count: z.number().int(),
  // regions.json Ã¬ÂÂ Ã¬ÂÂÃªÂµÂ°ÃªÂµÂ¬ Ã¬Â¤ÂÃ¬ÂÂ¬Ã¬Â¢ÂÃ­ÂÂ Ã¢ÂÂ Ã¬Â§ÂÃ«ÂÂ(Ã­ÂÂ´Ã«ÂÂ¬Ã¬ÂÂ¤Ã­ÂÂ°/choropleth) Ã«Â·Â°ÃªÂ°Â Ã¬ÂÂ¼Ã­ÂÂ°Ã«Â§ÂÃ¬ÂÂ
  // Ã¬ÂÂ´Ã«ÂÂ¤. Ã¬ÂÂ¬Ã¬Â ÂÃ¬ÂÂ Ã¬ÂÂÃ«ÂÂ Ã¬ÂÂÃªÂµÂ°ÃªÂµÂ¬Ã«Â¡Â Ã­ÂÂÃ¬ÂÂÃ«ÂÂ ÃªÂ²Â½Ã¬ÂÂ°(Ã¬ÂÂ´Ã«Â¡Â Ã¬ÂÂ Ã«ÂÂÃ«Â¬Â¾) null.
  lat: z.number().nullable(),
  lng: z.number().nullable(),
});
export type RegionStatsSigunguType = z.infer<typeof RegionStatsSigungu>;

export const RegionStatsSido = z.object({
  sido: z.string(),
  count: z.number().int(),
  // count Ã«ÂÂ´Ã«Â¦Â¼Ã¬Â°Â¨Ã¬ÂÂ Ã¬Â ÂÃ«Â Â¬Ã«ÂÂ¨. Ã«ÂÂÃ«Â¥Â Ã¬ÂÂ Ã¬ÂÂÃªÂµÂ°ÃªÂµÂ¬Ã«ÂªÂ Ã¬ÂÂ¤Ã«Â¦ÂÃ¬Â°Â¨Ã¬ÂÂ.
  sigungus: z.array(RegionStatsSigungu),
});
export type RegionStatsSidoType = z.infer<typeof RegionStatsSido>;

// Ã¬Â§ÂÃ«ÂÂ(Ã­ÂÂ´Ã«ÂÂ¬Ã¬ÂÂ¤Ã­ÂÂ°/choropleth) Ã«Â·Â°Ã¬ÂÂ© ÃªÂ°ÂÃ«Â³Â ÃªÂ°ÂÃªÂ²Â Ã­ÂÂ¬Ã¬ÂÂ¸Ã­ÂÂ¸. Ã¬Â¢ÂÃ­ÂÂÃªÂ°Â Ã¬ÂÂÃ«ÂÂ ÃªÂ°ÂÃªÂ²ÂÃ«Â§Â Ã­ÂÂ¬Ã­ÂÂ¨.
// sido/sigungu Ã«ÂÂ Ã­ÂÂÃ¬ÂÂÃªÂ°Â(Ã¬ÂÂÃ¬Â¹Â ÃÂ·Ã­ÂÂÃ­ÂÂ°Ã¬ÂÂ©) Ã¢ÂÂ Ã«ÂªÂ» Ã«Â½ÂÃ¬ÂÂÃ¬ÂÂ¼Ã«Â©Â´ null Ã¬ÂÂ´Ã¬Â§ÂÃ«Â§Â Ã¬Â¢ÂÃ­ÂÂÃ«ÂÂ Ã­ÂÂ­Ã¬ÂÂ Ã¬ÂÂÃ«ÂÂ¤.
export const RegionStatsPoint = z.object({
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  sido: z.string().nullable(),
  sigungu: z.string().nullable(),
});
export type RegionStatsPointType = z.infer<typeof RegionStatsPoint>;

export const RegionStatsResult = z.object({
  // Ã«Â¶ÂÃ«Â¥ÂÃ«ÂÂ ÃªÂ°ÂÃªÂ²Â Ã¬ÂÂ (= sidos Ã¬Â ÂÃ¬Â²Â´ count Ã­ÂÂ©). unclassified Ã«ÂÂ Ã¬Â ÂÃ¬ÂÂ¸.
  total: z.number().int(),
  // Ã¬Â£Â¼Ã¬ÂÂÃÂ·Ã¬Â¢ÂÃ­ÂÂ Ã¬ÂÂ´Ã«ÂÂ Ã¬ÂªÂ½Ã¬ÂÂ¼Ã«Â¡ÂÃ«ÂÂ Ã¬ÂÂÃªÂµÂ°ÃªÂµÂ¬Ã«Â¥Â¼ Ã«ÂªÂ» Ã«Â½ÂÃ¬ÂÂ ÃªÂ°ÂÃªÂ²Â Ã¬ÂÂ.
  unclassified: z.number().int(),
  // count Ã«ÂÂ´Ã«Â¦Â¼Ã¬Â°Â¨Ã¬ÂÂ Ã¬Â ÂÃ«Â Â¬Ã«ÂÂ¨. Ã«ÂÂÃ«Â¥Â Ã¬ÂÂ Ã¬ÂÂÃ«ÂÂÃ«ÂªÂ Ã¬ÂÂ¤Ã«Â¦ÂÃ¬Â°Â¨Ã¬ÂÂ.
  sidos: z.array(RegionStatsSido),
  // Ã¬Â¢ÂÃ­ÂÂ Ã«Â³Â´Ã¬ÂÂ  ÃªÂ°ÂÃªÂ²ÂÃ¬ÂÂ ÃªÂ°ÂÃ«Â³Â Ã­ÂÂ¬Ã¬ÂÂ¸Ã­ÂÂ¸(Ã¬Â§ÂÃ«ÂÂ Ã«Â·Â°). Ã«Â§ÂÃ«ÂÂ/Ã­ÂÂÃ«ÂÂ sidos Ã«Â§Â Ã¬ÂÂ´Ã«ÂÂ¤.
  points: z.array(RegionStatsPoint),
});
export type RegionStatsResultType = z.infer<typeof RegionStatsResult>;
