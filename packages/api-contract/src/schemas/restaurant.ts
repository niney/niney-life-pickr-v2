import { z } from 'zod';
import { NaverPlaceData, VisitorReview } from './crawl.js';

export const ReviewSummaryStatus = z.enum(['pending', 'running', 'done', 'failed']);
export type ReviewSummaryStatusType = z.infer<typeof ReviewSummaryStatus>;

export const ReviewSummary = z.object({
  status: ReviewSummaryStatus,
  text: z.string().nullable(),
  model: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
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
