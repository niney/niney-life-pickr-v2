import { z } from 'zod';

// 가게 정체(canonical) — 출처 가로지르는 한 가게의 식별자. 한 canonical 에는
// source 별 Restaurant 행이 0~N 개 매달려 있다.

// 한 canonical 행에 묶인 source 측 행 한 줄 요약. 어드민 후보 카드의 "Naver"
// 칩이나 "DC" 칩 라벨에 쓰인다.
export const CanonicalSourceSummary = z.object({
  restaurantId: z.string(),
  source: z.string(),
  sourceId: z.string(),
  placeId: z.string().nullable(),
  name: z.string(),
  category: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
});
export type CanonicalSourceSummaryType = z.infer<typeof CanonicalSourceSummary>;

export const CanonicalSummary = z.object({
  id: z.string(),
  name: z.string(),
  primaryCategory: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  sources: z.array(CanonicalSourceSummary),
});
export type CanonicalSummaryType = z.infer<typeof CanonicalSummary>;

// 매칭 점수 + 후보 canonical. 어드민이 카드 누르면 merge API 로 통합.
export const CanonicalMatchCandidate = z.object({
  canonical: CanonicalSummary,
  score: z.number(),
  nameScore: z.number(),
  // 좌표 둘 다 있을 때만 채워짐. null = 거리 비교 안 함(이름만으로 채택).
  distanceM: z.number().nullable(),
});
export type CanonicalMatchCandidateType = z.infer<typeof CanonicalMatchCandidate>;

export const CanonicalCandidatesResult = z.object({
  target: CanonicalSummary,
  candidates: z.array(CanonicalMatchCandidate),
});
export type CanonicalCandidatesResultType = z.infer<typeof CanonicalCandidatesResult>;

// 두 canonical 통합. source 의 모든 Restaurant 가 target.canonicalId 로 옮겨가고
// source 행은 삭제. target 의 name/category/coords 는 유지 — primary 선택 정책은
// 호출자(어드민)가 직접 정한다 (필요하면 후속 PATCH 로 갱신).
export const CanonicalMergeInput = z.object({
  sourceCanonicalId: z.string(),
  targetCanonicalId: z.string(),
});
export type CanonicalMergeInputType = z.infer<typeof CanonicalMergeInput>;

export const CanonicalMergeResult = z.object({
  ok: z.literal(true),
  target: CanonicalSummary,
  movedRestaurantIds: z.array(z.string()),
});
export type CanonicalMergeResultType = z.infer<typeof CanonicalMergeResult>;

// canonical 분리 — 한 Restaurant 만 새 canonical 로 떼어냄. 잘못된 merge 를 되돌리는
// 용도. 원래 canonical 에 남는 행이 0이 되면 그 canonical 은 삭제(잔여 1 이상은 유지).
export const CanonicalSplitInput = z.object({
  restaurantId: z.string(),
});
export type CanonicalSplitInputType = z.infer<typeof CanonicalSplitInput>;

export const CanonicalSplitResult = z.object({
  ok: z.literal(true),
  newCanonical: CanonicalSummary,
  // 원본 canonical 이 비어 삭제됐는지 — UI 가 후보 캐시를 무효화할 때 참고.
  sourceCanonicalDeleted: z.boolean(),
});
export type CanonicalSplitResultType = z.infer<typeof CanonicalSplitResult>;

// 신규 canonical(sources 1개) 등록 직후 list 응답에 끼어오는 1차 매칭 제안.
// 어드민이 "병합" 버튼을 직접 누르지 않아도 같은 가게로 보이는 짝이 있는지
// 행 위 알림 줄로 즉시 노출하기 위한 데이터. 풀 후보 목록은 여전히 GET
// /admin/canonical/:id/candidates 로 별도 조회.
export const CanonicalSuggestion = z.object({
  canonicalId: z.string(),
  name: z.string(),
  primaryCategory: z.string().nullable(),
  score: z.number(),
  distanceM: z.number().nullable(),
});
export type CanonicalSuggestionType = z.infer<typeof CanonicalSuggestion>;

// 사용자가 "이 가게는 합칠 게 없어" 를 명시적으로 닫을 때. 한 번 닫으면
// suggestionDismissedAt 가 채워져 list 응답의 suggestion 이 더 이상 노출되지 않는다.
export const CanonicalDismissSuggestionResult = z.object({
  ok: z.literal(true),
});
export type CanonicalDismissSuggestionResultType = z.infer<
  typeof CanonicalDismissSuggestionResult
>;
