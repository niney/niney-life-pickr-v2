import { z } from 'zod';

// 그룹 투표 픽 — "우리 뭐 먹을까?" 링크 투표.
//
// 방장(로그인)이 등록 맛집에서 후보 2~8곳을 골라 투표방을 만들고, 링크를 받은
// 참가자는 비로그인으로 이름만 입력해 복수 찬성(approval) 투표한다. 방장이
// 수동 마감하면 결과 확정 — 동점이면 동점 후보만 대상으로 서버 smart-pick
// 가중 랜덤이 최종 결정한다.
//
// 참가자 식별은 클라이언트 영속 UUID(voterKey) — 기기 단위 수준의 중복 방지로
// 완벽하지 않음을 제품 결정으로 수용한다(위조 방어는 IP rate-limit + 바운드).

export const VOTE_OPTIONS_MIN = 2;
export const VOTE_OPTIONS_MAX = 8;

// 후보 스냅샷 — 즐겨찾기 계약(restaurant-favorite)과 동일한 바운드의 축소판.
// 클라이언트가 목록/즐겨찾기에서 고른 항목을 그대로 보낸다(서버 재조회 없음).
const placeIdSchema = z.string().regex(/^\d{1,20}$/);

export const VoteOptionInput = z.object({
  placeId: placeIdSchema,
  name: z.string().trim().min(1).max(200),
  category: z.string().max(120).nullable(),
  thumbnailUrl: z.string().max(500).nullable(),
});
export type VoteOptionInputType = z.infer<typeof VoteOptionInput>;

export const CreateVoteInput = z.object({
  title: z.string().trim().min(1).max(80),
  options: z
    .array(VoteOptionInput)
    .min(VOTE_OPTIONS_MIN)
    .max(VOTE_OPTIONS_MAX)
    .refine(
      (opts) => new Set(opts.map((o) => o.placeId)).size === opts.length,
      '같은 식당을 후보에 두 번 넣을 수 없습니다.',
    ),
});
export type CreateVoteInputType = z.infer<typeof CreateVoteInput>;

// 마감 결정 방식 — votes(단독 최다) / smart-pick(동점 → AI 가중) / random(동점 →
// 분석 데이터 없어 균등 랜덤).
export const VoteDecidedBy = z.enum(['votes', 'smart-pick', 'random']);
export type VoteDecidedByType = z.infer<typeof VoteDecidedBy>;

// 응답 후보 — 집계 동봉. voters 는 찬성한 참가자 표시 이름(createdAt asc).
export const VoteOption = VoteOptionInput.extend({
  id: z.string(),
  orderIndex: z.number().int(),
  count: z.number().int(),
  voters: z.array(z.string()),
});
export type VoteOptionType = z.infer<typeof VoteOption>;

// 공개(토큰) 조회 응답 — userId 미포함. isOwner 는 Authorization 헤더가 있고
// 방장 본인일 때만 true(마감 버튼 노출용 표시 플래그). 세션 id 는 노출해도
// 무해(모든 변경 라우트가 인증+소유자 검사, id 기반 공개 조회는 없음)하며
// 방장의 마감 호출(POST /votes/:id/close)에 필요해 포함한다.
export const SharedVoteSession = z.object({
  id: z.string(),
  title: z.string(),
  options: z.array(VoteOption),
  // distinct voterKey 수 — 찬성 수 합계가 아니라 "참여한 사람 수".
  totalVoters: z.number().int(),
  closedAt: z.string().nullable(),
  winnerOptionId: z.string().nullable(),
  decidedBy: VoteDecidedBy.nullable(),
  expiresAt: z.string(),
  isOwner: z.boolean(),
  createdAt: z.string(),
});
export type SharedVoteSessionType = z.infer<typeof SharedVoteSession>;

// 방장용 응답(생성/마감) — 공개 응답 + 공유 token. isOwner 는 자명하므로
// 그대로 true 를 담아 SharedVoteSession 소비 코드와 호환되게 한다.
export const VoteSession = SharedVoteSession.extend({
  token: z.string(),
});
export type VoteSessionType = z.infer<typeof VoteSession>;

// 투표 제출 — 해당 voterKey 의 찬성 집합 풀 리플레이스(재투표=수정).
// 빈 배열 = 투표 철회. optionIds 중복은 서버가 dedupe.
export const SubmitBallotInput = z.object({
  voterKey: z.string().min(8).max(64),
  voterLabel: z.string().trim().min(1).max(20),
  optionIds: z.array(z.string().min(1).max(64)).max(VOTE_OPTIONS_MAX),
});
export type SubmitBallotInputType = z.infer<typeof SubmitBallotInput>;

// 내가 만든 투표 목록 — 링크(토큰) 복구 용도. 최근 20개.
export const MyVoteListItem = z.object({
  id: z.string(),
  title: z.string(),
  token: z.string(),
  optionCount: z.number().int(),
  closedAt: z.string().nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type MyVoteListItemType = z.infer<typeof MyVoteListItem>;

export const MyVotesResult = z.object({
  items: z.array(MyVoteListItem),
});
export type MyVotesResultType = z.infer<typeof MyVotesResult>;
