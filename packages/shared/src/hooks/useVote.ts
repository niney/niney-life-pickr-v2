import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateVoteInputType,
  SharedVoteSessionType,
  SubmitBallotInputType,
} from '@repo/api-contract';
import { voteApi } from '../api/vote.api.js';
import { useAuthStore } from '../stores/authStore.js';
import { useVoteGuestStore } from '../stores/voteGuestStore.js';

// 그룹 투표 픽 훅 — 웹/앱 공용.
//
// 실시간 갱신은 폴링(비인증 SSE 선례가 없는 코드베이스 관례) — 진행 중에만
// 15초, 마감되면 중단. 변경(투표/마감) 응답은 갱신된 세션 전체라 캐시를 통째로
// 교체한다(즐겨찾기와 동일 계약).

const sharedKey = (token: string) => ['vote', 'shared', token] as const;

export const useCreateVote = () =>
  useMutation({
    mutationFn: (input: CreateVoteInputType) => voteApi.create(input),
  });

// 내가 만든 투표(최근 20) — 링크(토큰) 복구 용도. 로그인 시에만.
export const useMyVotes = () => {
  const loggedIn = useAuthStore((s) => !!s.token);
  return useQuery({
    queryKey: ['vote', 'mine'],
    queryFn: () => voteApi.listMine(),
    enabled: loggedIn,
    staleTime: 30_000,
  });
};

export const useSharedVote = (token: string | null) =>
  useQuery({
    queryKey: sharedKey(token ?? ''),
    queryFn: () => {
      if (!token) throw new Error('token required');
      return voteApi.getShared(token);
    },
    enabled: !!token,
    // 집계는 다른 참가자 투표로 수시로 바뀐다 — 진행 중 15초 폴링, 마감이면
    // 중단. 탭 비활성 시 자동 중단(refetchIntervalInBackground 기본 false).
    staleTime: 0,
    placeholderData: (prev) => prev,
    refetchInterval: (query) => (query.state.data?.closedAt ? false : 15_000),
  });

export const useSubmitBallot = (token: string) => {
  const queryClient = useQueryClient();
  const recordBallot = useVoteGuestStore((s) => s.recordBallot);
  return useMutation({
    mutationFn: (input: SubmitBallotInputType) => voteApi.submitBallot(token, input),
    onSuccess: (data, vars) => {
      queryClient.setQueryData<SharedVoteSessionType>(sharedKey(token), data);
      // 재방문 시 체크 상태 복원용 로컬 기록.
      recordBallot(token, vars.optionIds);
    },
  });
};

export const useCloseVote = (token: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => voteApi.close(id),
    onSuccess: (data) => {
      // 방장 응답(VoteSession)은 Shared 의 슈퍼셋 — 공개 캐시에 그대로 반영해
      // 폴링을 기다리지 않고 즉시 마감 화면으로 전환.
      queryClient.setQueryData<SharedVoteSessionType>(sharedKey(token), data);
    },
  });
};
