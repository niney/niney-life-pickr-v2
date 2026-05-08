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
