import { z } from 'zod';

// 맛집 자동 발견(auto-discover) 잡 스키마. 한 어드민이 "강남역" + 카테고리 칩 +
// targetCount 만 던지면, AI 가 키워드 8 개를 만들고 → 네이버 검색 → dedupe →
// 그룹 5 개씩 직렬 크롤(=Naver Place 등록) 까지 백그라운드로 처리. 진행은 SSE.
//
// 기존 /admin/discover 의 수동 흐름은 그대로 두고 별도 메뉴로 추가.

// ── 입력 ────────────────────────────────────────────────────────────────────
export const AutoDiscoverJobInput = z.object({
  // 사용자가 입력한 자유 키워드. 예: "강남역", "압구정 파스타".
  q: z.string().trim().min(1).max(80),
  // 카테고리 칩 — 다중 선택. AI 가 일부 변형에 카테고리를 결합한다.
  // 빈 배열이면 카테고리 힌트 없이 변형 8 개 생성.
  categories: z.array(z.string().trim().min(1).max(20)).max(10).default([]),
  // 신규 등록 목표 수. 도달하면 잔여 후보는 skipped(target_reached).
  // 50 까지 — 한 번 잡으로 너무 큰 부담은 의도적으로 막는다.
  targetCount: z.coerce.number().int().min(1).max(50),
});
export type AutoDiscoverJobInputType = z.infer<typeof AutoDiscoverJobInput>;

// ── 상태 enum ───────────────────────────────────────────────────────────────
export const AutoDiscoverJobState = z.enum([
  'pending',
  'running',
  'done',
  'failed',
  'cancelled',
]);
export type AutoDiscoverJobStateType = z.infer<typeof AutoDiscoverJobState>;

// 잡 한 개의 단계 — UI 가 단계 배지 노출.
//   queued: 시작 직전.
//   generating_keywords: AI 호출 중.
//   searching: 키워드별 네이버 검색 중.
//   crawling: 그룹 5 개씩 직렬 크롤 중.
//   done: 모든 단계 종료.
export const AutoDiscoverPhase = z.enum([
  'queued',
  'generating_keywords',
  'searching',
  'crawling',
  'done',
]);
export type AutoDiscoverPhaseType = z.infer<typeof AutoDiscoverPhase>;

// 키워드 한 줄의 진행 상태. UI 8 칸 그리드에 표시.
export const AutoDiscoverKeywordState = z.enum([
  'pending',
  'searching',
  'done',
  'failed',
]);
export type AutoDiscoverKeywordStateType = z.infer<
  typeof AutoDiscoverKeywordState
>;

export const AutoDiscoverKeyword = z.object({
  keyword: z.string(),
  state: AutoDiscoverKeywordState,
  // 검색 결과 건수. done 일 때만 채움.
  hitCount: z.number().int().nullable(),
  searchedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
export type AutoDiscoverKeywordType = z.infer<typeof AutoDiscoverKeyword>;

// 후보 한 건의 진행 상태. UI 가 그룹별로 묶어 노출.
export const AutoDiscoverCandidateState = z.enum([
  'pending',
  'running',
  'done',
  'failed',
  'skipped',
]);
export type AutoDiscoverCandidateStateType = z.infer<
  typeof AutoDiscoverCandidateState
>;

// skipped 의 사유 — UI 가 회색 배지에 라벨 노출.
//   already_registered: 이미 등록된 placeId 라 dedupe 단계에서 제외.
//   target_reached: targetCount 도달 후 잔여.
//   cancelled: 사용자가 취소.
export const AutoDiscoverSkipReason = z.enum([
  'already_registered',
  'target_reached',
  'cancelled',
]);
export type AutoDiscoverSkipReasonType = z.infer<
  typeof AutoDiscoverSkipReason
>;

export const AutoDiscoverCandidate = z.object({
  placeId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  roadAddress: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  // 이 후보를 처음 발견한 키워드(중복 시 첫 등장만 보존).
  sourceKeyword: z.string(),
  // 0-based 그룹 인덱스. UI 가 그룹 헤더 그룹화에 사용.
  // already_registered 로 사전 제외된 후보는 -1.
  groupIndex: z.number().int(),
  state: AutoDiscoverCandidateState,
  skipReason: AutoDiscoverSkipReason.nullable(),
  // 성공 시 채움 — UI 가 등록된 식당 상세 link.
  restaurantId: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type AutoDiscoverCandidateType = z.infer<typeof AutoDiscoverCandidate>;

export const AutoDiscoverJobSnapshot = z.object({
  jobId: z.string(),
  state: AutoDiscoverJobState,
  phase: AutoDiscoverPhase,
  input: AutoDiscoverJobInput,
  keywords: z.array(AutoDiscoverKeyword),
  candidates: z.array(AutoDiscoverCandidate),
  // 그룹 직렬 처리에서 새로 등록 성공한 수 — targetCount 와 비교.
  newlyRegistered: z.number().int(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type AutoDiscoverJobSnapshotType = z.infer<
  typeof AutoDiscoverJobSnapshot
>;

// ── SSE 이벤트 ──────────────────────────────────────────────────────────────
// snapshot 은 router 가 EventSource 연결 직후 한 번 보낸다 (재접속 시 현재 상태
// 복구). 그 다음 부터는 keyword/candidate/phase/done 이벤트가 흐른다.

export const AutoDiscoverKeywordEvent = z.object({
  type: z.literal('keyword'),
  jobId: z.string(),
  keyword: AutoDiscoverKeyword,
});
export type AutoDiscoverKeywordEventType = z.infer<
  typeof AutoDiscoverKeywordEvent
>;

export const AutoDiscoverCandidateEvent = z.object({
  type: z.literal('candidate'),
  jobId: z.string(),
  candidate: AutoDiscoverCandidate,
});
export type AutoDiscoverCandidateEventType = z.infer<
  typeof AutoDiscoverCandidateEvent
>;

export const AutoDiscoverPhaseEvent = z.object({
  type: z.literal('phase'),
  jobId: z.string(),
  phase: AutoDiscoverPhase,
  newlyRegistered: z.number().int(),
});
export type AutoDiscoverPhaseEventType = z.infer<typeof AutoDiscoverPhaseEvent>;

export const AutoDiscoverDoneEvent = z.object({
  type: z.literal('done'),
  jobId: z.string(),
  state: AutoDiscoverJobState,
  finishedAt: z.string(),
});
export type AutoDiscoverDoneEventType = z.infer<typeof AutoDiscoverDoneEvent>;
