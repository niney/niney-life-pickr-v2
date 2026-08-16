import type { SharedVoteSessionType, VoteOptionType } from '@repo/api-contract';

// 투표 화면들이 보는 계약(SharedVoteSession)의 fixture. 각 테스트는 관심 있는
// 필드만 덮어쓴다 — 기본값은 "막 만들어진 진행 중 투표"(마감 전, 0표)다.

export const voteOption = (over: Partial<VoteOptionType> & { id: string }): VoteOptionType => ({
  orderIndex: 0,
  placeId: '9900000001',
  name: '후보',
  category: null,
  thumbnailUrl: null,
  count: 0,
  voters: [],
  ...over,
});

export const voteSession = (
  over: Partial<SharedVoteSessionType> = {},
): SharedVoteSessionType => ({
  id: 'vote-1',
  title: '오늘 점심 어디?',
  options: [],
  totalVoters: 0,
  closedAt: null,
  winnerOptionId: null,
  decidedBy: null,
  expiresAt: '2026-08-23T03:00:00.000Z',
  isOwner: false,
  createdAt: '2026-08-16T02:00:00.000Z',
  ...over,
});
