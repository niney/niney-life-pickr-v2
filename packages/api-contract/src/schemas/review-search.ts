import { z } from 'zod';

// review-search — 리뷰 문맥검색 / RAG 도메인 계약. 제품 표면은 RAG(질문)만 —
// standalone 시맨틱/관점 검색 엔드포인트는 제거됨(검색 엔진은 RAG 내부에서만 사용).

export const ReviewSearchRestaurant = z.object({
  id: z.string(),
  name: z.string(),
  reviewCount: z.number().int().nonnegative(),
});
export type ReviewSearchRestaurantType = z.infer<typeof ReviewSearchRestaurant>;

export const ReviewSearchRestaurantsResult = z.object({
  restaurants: z.array(ReviewSearchRestaurant),
});
export type ReviewSearchRestaurantsResultType = z.infer<typeof ReviewSearchRestaurantsResult>;

export const ReviewSearchHit = z.object({
  reviewId: z.string(),
  body: z.string(),
  rating: z.number().nullable(),
  score: z.number(),
  keyword: z.boolean(),
});
export type ReviewSearchHitType = z.infer<typeof ReviewSearchHit>;

// enrich (관점+문맥+임베딩 생성·영속) — on-demand.
export const ReviewSearchEnrichInput = z.object({ restaurantId: z.string() });
export type ReviewSearchEnrichInputType = z.infer<typeof ReviewSearchEnrichInput>;

export const ReviewSearchEnrichResult = z.object({
  enriched: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  ms: z.number().int().nonnegative(),
});
export type ReviewSearchEnrichResultType = z.infer<typeof ReviewSearchEnrichResult>;

// RAG.
export const ReviewAskInput = z.object({
  restaurantId: z.string(),
  query: z.string().min(1),
});
export type ReviewAskInputType = z.infer<typeof ReviewAskInput>;

export const ReviewAskResult = z.object({
  answer: z.string(),
  confidence: z.enum(['high', 'medium', 'low', 'none']),
  hyde: z.string().nullable(),
  citations: z.array(ReviewSearchHit),
  // 검증 가드레일: applied=2차 검증 실행됨, dropped=근거 부족으로 제거된 주장.
  verification: z
    .object({ applied: z.boolean(), dropped: z.array(z.string()) })
    .nullable(),
});
export type ReviewAskResultType = z.infer<typeof ReviewAskResult>;

// 공개 QA (placeId 기반). placeId 는 경로 파라미터이므로 본문엔 query 만.
export const ReviewPublicAskBody = z.object({ query: z.string().min(1).max(200) });
export type ReviewPublicAskBodyType = z.infer<typeof ReviewPublicAskBody>;

// 공개 QA 준비 여부 — 해당 식당에 enrich(검색가능) 리뷰가 있는지(LLM 호출 없음).
export const ReviewQaReadyResult = z.object({
  ready: z.boolean(),
  count: z.number().int().nonnegative(),
});
export type ReviewQaReadyResultType = z.infer<typeof ReviewQaReadyResult>;

// ── enrich 상태 관리 (어드민) — "식당별 정규화 상태" 미러링 ──
export const ReviewEnrichStatusItem = z.object({
  restaurantId: z.string(),
  placeId: z.string().nullable(),
  name: z.string(),
  totalReviews: z.number().int().nonnegative(),
  enrichedReviews: z.number().int().nonnegative(), // embeddingJson 채워진(검색가능) 리뷰 수
  ready: z.boolean(), // enrichedReviews > 0
  inProgress: z.boolean(), // 백그라운드 enrich 진행 중
});
export type ReviewEnrichStatusItemType = z.infer<typeof ReviewEnrichStatusItem>;

export const ReviewEnrichStatusQuery = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ReviewEnrichStatusQueryType = z.infer<typeof ReviewEnrichStatusQuery>;

export const ReviewEnrichStatusList = z.object({
  items: z.array(ReviewEnrichStatusItem),
  total: z.number().int().nonnegative(), // 필터 적용 후 식당 수
  totalRestaurants: z.number().int().nonnegative(), // 리뷰 있는 전체 식당 수
  readyCount: z.number().int().nonnegative(), // 검색가능(enrich됨) 식당 수
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type ReviewEnrichStatusListType = z.infer<typeof ReviewEnrichStatusList>;

// 백그라운드 enrich 트리거(즉시 반환 — HTTP 타임아웃 회피, 상태는 폴링).
export const ReviewEnrichBgInput = z.object({ restaurantId: z.string() });
export type ReviewEnrichBgInputType = z.infer<typeof ReviewEnrichBgInput>;
export const ReviewEnrichBgResult = z.object({ started: z.boolean(), inProgress: z.boolean() });
export type ReviewEnrichBgResultType = z.infer<typeof ReviewEnrichBgResult>;

// 미완료(검색가능 0) 식당 일괄 백그라운드 enrich(순차).
export const ReviewEnrichPendingResult = z.object({ queued: z.number().int().nonnegative() });
export type ReviewEnrichPendingResultType = z.infer<typeof ReviewEnrichPendingResult>;
