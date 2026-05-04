import { z } from 'zod';

export const CrawlNaverPlaceInput = z.object({
  url: z.string().url(),
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

export const VisitorReview = z.object({
  authorName: z.string().nullable(),
  rating: z.number().nullable(),
  body: z.string(),
  visitedAt: z.string().nullable(),
  imageUrls: z.array(z.string().url()),
});
export type VisitorReviewType = z.infer<typeof VisitorReview>;

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
