import {
  Routes,
  type CreateVoteInputType,
  type MyVotesResultType,
  type SharedVoteSessionType,
  type SubmitBallotInputType,
  type VoteSessionType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 그룹 투표 픽 — 생성/목록/마감은 Bearer 인증, 조회/투표는 토큰 공개.
// apiFetch 는 토큰이 있으면 Authorization 을 자동 첨부한다 — 공개 라우트에서도
// 그대로 두면 서버의 옵셔널 인증이 isOwner(마감 버튼 노출)를 판정한다.
export const voteApi = {
  create: (input: CreateVoteInputType) =>
    apiFetch<VoteSessionType>(Routes.Vote.create, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listMine: () => apiFetch<MyVotesResultType>(Routes.Vote.list),

  close: (id: string) => apiFetch<VoteSessionType>(Routes.Vote.close(id), { method: 'POST' }),

  getShared: (token: string) => apiFetch<SharedVoteSessionType>(Routes.Vote.shared(token)),

  // voterKey 의 찬성 집합 풀 리플레이스(재투표=수정, 빈 배열=철회).
  // 응답 = 갱신된 세션 전체 → 캐시 통째 교체.
  submitBallot: (token: string, input: SubmitBallotInputType) =>
    apiFetch<SharedVoteSessionType>(Routes.Vote.sharedBallot(token), {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
};
