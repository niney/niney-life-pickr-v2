import { z } from 'zod';

// review-clustering — "비슷한 문맥의 리뷰끼리 묶고 카운팅". 저장된 bge-m3 임베딩으로
// UMAP→HDBSCAN→c-TF-IDF(Python 배치) 후 LLM 한 줄 라벨을 붙여 영속한다. 계산은
// 배치(어드민/크롤후 훅)로만 — 공개 API 는 저장된 결과를 읽기만 한다(질의 비용 0).

export const ClusterTone = z.enum(['positive', 'negative', 'mixed', 'neutral']);
export type ClusterToneType = z.infer<typeof ClusterTone>;

// 군집 대표 리뷰(medoid 근처). body 는 읽기 시 join 으로 채운다.
export const ReviewClusterRepReview = z.object({
  reviewId: z.string(),
  body: z.string(),
  rating: z.number().nullable(),
});
export type ReviewClusterRepReviewType = z.infer<typeof ReviewClusterRepReview>;

// 집계 관점 — key 는 "맛:pos" 형태, count 는 군집 내 등장 수. (record 대신 배열 —
// zod 버전 무관·와이어 명시적.)
export const ReviewClusterAspect = z.object({ key: z.string(), count: z.number().int() });
export type ReviewClusterAspectType = z.infer<typeof ReviewClusterAspect>;

export const ReviewClusterItem = z.object({
  id: z.string(),
  ordinal: z.number().int().nonnegative(), // 표시 순서(size desc)
  label: z.string(), // LLM 한 줄 라벨
  tone: ClusterTone,
  size: z.number().int().positive(), // 멤버 수 = 카운트
  keywords: z.array(z.string()), // c-TF-IDF 상위 키워드
  aspects: z.array(ReviewClusterAspect), // 집계 관점→극성
  repReviews: z.array(ReviewClusterRepReview),
});
export type ReviewClusterItemType = z.infer<typeof ReviewClusterItem>;

// 관점별 집계 — 토픽 군집이 안 잡히는(전부 노이즈) 식당의 폴백. aspectsJson 집계.
export const ReviewClusterAspectSummary = z.object({
  aspect: z.string(), // 맛/서비스/웨이팅 …
  pos: z.number().int().nonnegative(),
  neg: z.number().int().nonnegative(),
  neu: z.number().int().nonnegative(),
});
export type ReviewClusterAspectSummaryType = z.infer<typeof ReviewClusterAspectSummary>;

// 공개 조회 결과(placeId 기반, 인증 없음). 군집도 관점집계도 없으면 ready=false.
export const ReviewClustersResult = z.object({
  ready: z.boolean(),
  total: z.number().int().nonnegative(), // 군집 대상 리뷰 수(분류+노이즈)
  clustered: z.number().int().nonnegative(), // 군집에 속한 리뷰 수
  noiseCount: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  clusteredAt: z.string().nullable(), // ISO 8601
  clusters: z.array(ReviewClusterItem),
  // 토픽 군집이 비었을 때(전부 노이즈) 폴백 — 관점별 긍/부/중립 집계. 군집 있으면 빈 배열.
  aspectSummary: z.array(ReviewClusterAspectSummary),
});
export type ReviewClustersResultType = z.infer<typeof ReviewClustersResult>;

// 어드민 군집화 실행(동기) — restaurantId 단위.
export const ReviewClusterRunInput = z.object({ restaurantId: z.string() });
export type ReviewClusterRunInputType = z.infer<typeof ReviewClusterRunInput>;

export const ReviewClusterRunResult = z.object({
  clusters: z.number().int().nonnegative(),
  noise: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  // 최소 리뷰 미달·enrich 미완료·계산 엔진 미설치 등으로 건너뛴 경우.
  skipped: z.boolean(),
  reason: z.string().nullable(),
  ms: z.number().int().nonnegative(),
});
export type ReviewClusterRunResultType = z.infer<typeof ReviewClusterRunResult>;

// ── 군집 상태 관리 (어드민) — enrich 상태 미러링 ──
export const ReviewClusterStatusItem = z.object({
  restaurantId: z.string(),
  placeId: z.string().nullable(),
  name: z.string(),
  totalReviews: z.number().int().nonnegative(),
  enrichedReviews: z.number().int().nonnegative(), // 검색가능(임베딩) 리뷰 수
  eligible: z.boolean(), // enrichedReviews >= MIN_REVIEWS (군집화 가능)
  clustered: z.boolean(), // 현재 버전 군집 존재
  clusterCount: z.number().int().nonnegative(),
  clusteredAt: z.string().nullable(), // ISO, 마지막 군집 시각
  inProgress: z.boolean(),
  // 마지막 실행이 스킵/오류면 그 사유("리뷰 부족…", "전부 노이즈", "계산 엔진 오류…").
  // 성공·미실행이면 null. "대기로만 남는" 원인을 어드민에 노출.
  lastReason: z.string().nullable(),
});
export type ReviewClusterStatusItemType = z.infer<typeof ReviewClusterStatusItem>;

export const ReviewClusterStatusQuery = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(30),
});
export type ReviewClusterStatusQueryType = z.infer<typeof ReviewClusterStatusQuery>;

export const ReviewClusterStatusList = z.object({
  items: z.array(ReviewClusterStatusItem),
  total: z.number().int().nonnegative(), // 필터 적용 후
  eligibleCount: z.number().int().nonnegative(), // 군집화 가능 식당 수
  clusteredCount: z.number().int().nonnegative(), // 군집된 식당 수
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type ReviewClusterStatusListType = z.infer<typeof ReviewClusterStatusList>;

// 단건 백그라운드 군집화(즉시 반환, 상태는 폴링).
export const ReviewClusterBgInput = z.object({ restaurantId: z.string() });
export type ReviewClusterBgInputType = z.infer<typeof ReviewClusterBgInput>;
export const ReviewClusterBgResult = z.object({ started: z.boolean(), inProgress: z.boolean() });
export type ReviewClusterBgResultType = z.infer<typeof ReviewClusterBgResult>;

// 군집화 가능하나 아직 군집 안 된 식당 일괄 백그라운드 군집화(순차).
export const ReviewClusterPendingResult = z.object({ queued: z.number().int().nonnegative() });
export type ReviewClusterPendingResultType = z.infer<typeof ReviewClusterPendingResult>;
