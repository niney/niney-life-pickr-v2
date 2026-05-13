import { z } from 'zod';

// 글로벌 메뉴 항목 — 식당 가로질러 묶인 단일 그룹.
export const GlobalMenuStat = z.object({
  globalKey: z.string(),
  displayName: z.string(),
  // 계층 카테고리 path (예: "한식 > 찌개 > 김치찌개"). null = 분류 없음.
  categoryPath: z.string().nullable(),
  // 전체 멘션 수 (모든 식당의 합).
  totalMentions: z.number().int(),
  // 이 메뉴를 가진 식당 수.
  restaurantCount: z.number().int(),
  positive: z.number().int(),
  negative: z.number().int(),
  neutral: z.number().int(),
  // 정규화 안 된 그룹은 ratio = null (긍·부 둘 다 0).
  positiveRatio: z.number().nullable(),
  // 이 메뉴 멘션이 가장 많은 식당 TOP3 (긍/부 상관없이 빈도 desc).
  topRestaurants: z.array(
    z.object({
      placeId: z.string(),
      name: z.string(),
      mentionCount: z.number().int(),
      positive: z.number().int(),
      negative: z.number().int(),
      positiveRatio: z.number().nullable(),
    }),
  ),
});
export type GlobalMenuStatType = z.infer<typeof GlobalMenuStat>;

export const GlobalMenuQuerySort = z.enum(['mentions', 'positive', 'positiveRatio', 'restaurants']);
export type GlobalMenuQuerySortType = z.infer<typeof GlobalMenuQuerySort>;

export const GlobalMenuQuery = z.object({
  // 부분 일치 검색 — displayName / variants 모두 매칭.
  q: z.string().optional(),
  // 카테고리 path prefix 필터 — "한식" → "한식 > %" 모두 포함, "한식 > 찌개"
  // → 그 prefix, 정확한 path 도 포함.
  category: z.string().optional(),
  sort: GlobalMenuQuerySort.default('mentions'),
  // 노이즈 제거 — 기본 5.
  minMentions: z.coerce.number().int().min(1).default(5),
  // 페이지네이션. limit 은 deprecated — 신규 코드는 page/pageSize 사용.
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  // 매핑되지 않은 (unlinked) MenuCanonical 도 결과에 포함. 기본 false.
  // true 면 식당별 그룹 그대로 보임 — "전역 정규화 전 모습" 확인용.
  includeUnlinked: z.coerce.boolean().default(false),
});
export type GlobalMenuQueryType = z.infer<typeof GlobalMenuQuery>;

export const GlobalMenuResult = z.object({
  // 매핑된 글로벌 메뉴 수.
  totalGroups: z.number().int(),
  // 글로벌 매핑이 있는 식당의 수 (overview 카드용).
  linkedRestaurantCount: z.number().int(),
  // 식당별 그룹 (MenuCanonical) 중 글로벌 링크가 있는 것 / 전체.
  linkedRatio: z.number().nullable(),
  currentVersion: z.number().int(),
  // 현재 페이지 행만.
  items: z.array(GlobalMenuStat),
  // 필터(q/category/minMentions/includeUnlinked) 적용 후 매칭 전체 수 — 페이저용.
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type GlobalMenuResultType = z.infer<typeof GlobalMenuResult>;

// 카테고리 트리 노드 (재귀). path 의 모든 prefix 가 노드. 자식은 직속만.
// leaf 의 통계는 부모로 누적 합산되어 있어 어느 레벨에서도 해당 가지의 합계.
export type CategoryTreeNodeType = {
  path: string;
  label: string;
  totalMentions: number;
  positive: number;
  negative: number;
  positiveRatio: number | null;
  children?: CategoryTreeNodeType[];
};
export const CategoryTreeNode: z.ZodType<CategoryTreeNodeType> = z.lazy(() =>
  z.object({
    path: z.string(),
    label: z.string(),
    totalMentions: z.number().int(),
    positive: z.number().int(),
    negative: z.number().int(),
    positiveRatio: z.number().nullable(),
    children: z.array(CategoryTreeNode).optional(),
  }),
);

export const CategoryTreeResult = z.object({
  currentVersion: z.number().int(),
  roots: z.array(CategoryTreeNode),
});
export type CategoryTreeResultType = z.infer<typeof CategoryTreeResult>;

// overview — admin 대시보드 카드용. 핵심 카운터 만.
export const AnalyticsOverview = z.object({
  restaurantCount: z.number().int(),
  analyzedReviewCount: z.number().int(),
  totalMentionCount: z.number().int(),
  // 식당 단위 그룹핑 누적 카운트.
  perRestaurantGroupCount: z.number().int(),
  // 글로벌 매핑 카운트 / 식당 단위 그룹 총합.
  globalLinkedCount: z.number().int(),
  globalGroupCount: z.number().int(),
  globalLinkedRatio: z.number().nullable(),
  // 마지막 글로벌 머지 실행 시각 / 버전.
  lastGlobalMergeAt: z.string().nullable(),
  globalVersion: z.number().int(),
});
export type AnalyticsOverviewType = z.infer<typeof AnalyticsOverview>;

// 글로벌 머지 잡 — grouping-job 과 같은 모양이지만 placeIds 가 아니라 단일 잡.
export const GlobalMergeJobInput = z.object({
  // 강제 재실행 여부 — false 면 새로 추가된 MenuCanonical 만 머지에 포함.
  full: z.boolean().default(false),
});
export type GlobalMergeJobInputType = z.infer<typeof GlobalMergeJobInput>;

export const GlobalMergeJobState = z.enum(['pending', 'running', 'done', 'failed']);
export type GlobalMergeJobStateType = z.infer<typeof GlobalMergeJobState>;

export const GlobalMergeJobChunkProgress = z.object({
  // pass = 1: 1차 청크별 매핑, pass = 2: 청크간 충돌 해소.
  pass: z.number().int(),
  // pass 안에서의 청크 인덱스 (0-base).
  chunkIndex: z.number().int(),
  // 이 pass 의 전체 청크 수.
  chunkTotal: z.number().int(),
  // 이번 청크에서 매핑된 항목 수.
  mappedInChunk: z.number().int(),
});
export type GlobalMergeJobChunkProgressType = z.infer<typeof GlobalMergeJobChunkProgress>;

export const GlobalMergeJobSnapshot = z.object({
  jobId: z.string(),
  state: GlobalMergeJobState,
  // 입력으로 들어간 distinct MenuCanonical 그룹 수.
  inputCount: z.number().int(),
  // 1차/2차 통합 후 최종 글로벌 그룹 수.
  finalGroupCount: z.number().int(),
  // 청크 진행 — 누적 진행률 계산용.
  totalChunks: z.number().int(),
  doneChunks: z.number().int(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type GlobalMergeJobSnapshotType = z.infer<typeof GlobalMergeJobSnapshot>;

// SSE event 페이로드.
export const GlobalMergeJobChunkEvent = z.object({
  type: z.literal('chunk'),
  jobId: z.string(),
  progress: GlobalMergeJobChunkProgress,
});
export type GlobalMergeJobChunkEventType = z.infer<typeof GlobalMergeJobChunkEvent>;

export const GlobalMergeJobDoneEvent = z.object({
  type: z.literal('done'),
  jobId: z.string(),
  state: GlobalMergeJobState,
  finalGroupCount: z.number().int(),
  finishedAt: z.string(),
});
export type GlobalMergeJobDoneEventType = z.infer<typeof GlobalMergeJobDoneEvent>;
