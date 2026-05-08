import { z } from 'zod';

// MENU_GROUPING_VERSION 변경 시 이전 매핑은 stale — UI 가 "재실행 권장" 배지
// 노출. 서버는 ranking 응답에 modelVersion 을 같이 내려서 클라가 판단한다.

export const MenuRankingSort = z.enum([
  // 기본 — 언급 수 내림차순.
  'mentions',
  // 긍정 카운트 절대값.
  'positive',
  // 긍정/(긍정+부정) 비율 — 동률은 mentionCount 내림차순.
  'positiveRatio',
  'negative',
]);
export type MenuRankingSortType = z.infer<typeof MenuRankingSort>;

export const MenuRankingQuery = z.object({
  sort: MenuRankingSort.default('mentions'),
  // 노이즈 제거 — UI 기본 1, 통계 차트는 2 권장.
  minMentions: z.coerce.number().int().min(1).default(1),
});
export type MenuRankingQueryType = z.infer<typeof MenuRankingQuery>;

export const MenuRankingItem = z.object({
  // UI 표시용 그룹 대표 표기. canonical 매핑이 있으면 LLM 이 정한 표기,
  // 없으면 변형 중 가장 많이 등장한 표기.
  canonicalName: z.string(),
  // 그룹 키 (canonicalName 의 nameNorm).
  canonicalKey: z.string(),
  // 매핑 적용 여부 — false 면 fallback (nameNorm 자체를 그룹키로 사용).
  // FE 가 "재분류 권장" 마크 표시할 때 활용.
  mapped: z.boolean(),
  mentionCount: z.number().int(),
  positive: z.number().int(),
  negative: z.number().int(),
  neutral: z.number().int(),
  // (positive) / (positive + negative). 둘 다 0 이면 null (정렬 시 마지막).
  positiveRatio: z.number().nullable(),
  // 이 그룹에 속한 원문 표기들 — UI tooltip / "변형 보기" 펼치기용.
  variants: z.array(z.string()),
  // 이 그룹의 traits 빈도 TOP3 (예: ["진한", "얼큰한", "푸짐한"]).
  topTraits: z.array(z.string()),
  // 대표 리뷰 — 긍정/부정 각 한 건 미리보기 용도.
  sampleReviewIds: z.array(z.string()),
});
export type MenuRankingItemType = z.infer<typeof MenuRankingItem>;

export const MenuRankingResult = z.object({
  placeId: z.string(),
  totalMentions: z.number().int(),
  // 매핑 적용된 그룹 수.
  groupedCount: z.number().int(),
  // 매핑 없는 (fallback 으로 처리된) 원문들. UI 가 "분류" 버튼/배너 노출.
  unmappedMenus: z.array(z.string()),
  // 마지막 그룹핑 실행 시각 — null 이면 아직 한 번도 안 돌림.
  groupedAt: z.string().nullable(),
  // 마지막 실행 시점의 MENU_GROUPING_VERSION. 현재 버전과 다르면 FE 재실행 권장.
  modelVersion: z.number().int().nullable(),
  // 현재 서버가 인식하는 버전 — FE 비교용.
  currentVersion: z.number().int(),
  items: z.array(MenuRankingItem),
});
export type MenuRankingResultType = z.infer<typeof MenuRankingResult>;

// 단일 식당 그룹핑 결과 (POST /menus/group 응답).
export const MenuGroupRunResult = z.object({
  ok: z.literal(true),
  placeId: z.string(),
  // 입력으로 들어간 distinct nameNorm 수.
  inputCount: z.number().int(),
  // LLM 이 만들어낸 그룹 수 (canonicalNorm distinct).
  groupCount: z.number().int(),
  // 실제 매핑 저장된 nameNorm 수 (= inputCount 와 같으면 전부 처리됨).
  mappedCount: z.number().int(),
  model: z.string().nullable(),
  version: z.number().int(),
});
export type MenuGroupRunResultType = z.infer<typeof MenuGroupRunResult>;

// ── batch 운영용 ────────────────────────────────────────────────────

// 관리자 페이지 식당 리스트 행 — 정규화 운영 화면에서 보여줄 컬럼들.
export const MenuGroupingRestaurantStatus = z.object({
  placeId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  totalReviews: z.number().int(),
  // 분석 done 리뷰 수 — 메뉴 멘션의 잠재적 전체.
  analyzedReviews: z.number().int(),
  // distinct nameNorm 수.
  distinctMenus: z.number().int(),
  // 매핑된 nameNorm 수.
  mappedMenus: z.number().int(),
  // 미분류 nameNorm 수 (= distinctMenus - mappedMenus).
  unmappedMenus: z.number().int(),
  // 매핑 행 중 가장 마지막 createdAt — null 이면 한 번도 실행 안 됨.
  lastGroupedAt: z.string().nullable(),
  // 그 매핑들의 version. 매핑 모두 currentVersion 인 경우만 currentVersion,
  // 일부라도 옛 버전이면 그 옛 버전을 노출 → UI "재실행 권장" 배지.
  storedVersion: z.number().int().nullable(),
});
export type MenuGroupingRestaurantStatusType = z.infer<typeof MenuGroupingRestaurantStatus>;

export const MenuGroupingRestaurantStatusList = z.object({
  currentVersion: z.number().int(),
  items: z.array(MenuGroupingRestaurantStatus),
});
export type MenuGroupingRestaurantStatusListType = z.infer<
  typeof MenuGroupingRestaurantStatusList
>;

export const MenuGroupingJobInput = z.object({
  // 비어있으면 거부 — 글로벌 "전체 정규화"는 명시적 placeIds 로만 받는다
  // (UI 가 테이블에서 전체 선택해서 명시적으로 보냄).
  placeIds: z.array(z.string()).min(1),
});
export type MenuGroupingJobInputType = z.infer<typeof MenuGroupingJobInput>;

export const MenuGroupingJobState = z.enum(['pending', 'running', 'done', 'failed']);
export type MenuGroupingJobStateType = z.infer<typeof MenuGroupingJobState>;

export const MenuGroupingJobItemState = z.enum([
  'pending',
  'running',
  'done',
  'failed',
  'skipped',
]);
export type MenuGroupingJobItemStateType = z.infer<typeof MenuGroupingJobItemState>;

export const MenuGroupingJobItem = z.object({
  placeId: z.string(),
  state: MenuGroupingJobItemState,
  // 그 식당의 그룹핑 결과 요약 — done 만 채움.
  inputCount: z.number().int().nullable(),
  groupCount: z.number().int().nullable(),
  mappedCount: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type MenuGroupingJobItemType = z.infer<typeof MenuGroupingJobItem>;

export const MenuGroupingJobSnapshot = z.object({
  jobId: z.string(),
  state: MenuGroupingJobState,
  total: z.number().int(),
  doneCount: z.number().int(),
  failedCount: z.number().int(),
  skippedCount: z.number().int(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  items: z.array(MenuGroupingJobItem),
});
export type MenuGroupingJobSnapshotType = z.infer<typeof MenuGroupingJobSnapshot>;

// SSE per-event — 한 식당이 끝날 때마다 push.
export const MenuGroupingJobItemEvent = z.object({
  type: z.literal('item'),
  jobId: z.string(),
  item: MenuGroupingJobItem,
});
export type MenuGroupingJobItemEventType = z.infer<typeof MenuGroupingJobItemEvent>;

export const MenuGroupingJobDoneEvent = z.object({
  type: z.literal('done'),
  jobId: z.string(),
  state: MenuGroupingJobState,
  finishedAt: z.string(),
});
export type MenuGroupingJobDoneEventType = z.infer<typeof MenuGroupingJobDoneEvent>;
