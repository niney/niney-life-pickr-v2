import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateVoteInputType,
  SharedVoteSessionType,
  SubmitBallotInputType,
} from '@repo/api-contract';
import { ApiError } from '../api/client.js';
import { voteApi } from '../api/vote.api.js';
import { useAuthStore } from '../stores/authStore.js';
import { useVoteGuestStore } from '../stores/voteGuestStore.js';

// 그룹 투표 픽 훅 — 웹/앱 공용.
//
// 실시간 갱신은 폴링(비인증 SSE 선례가 없는 코드베이스 관례) — 진행 중에만
// 15초, 마감되면 중단. 변경(투표/마감) 응답은 갱신된 세션 전체라 캐시를 통째로
// 교체한다(즐겨찾기와 동일 계약).

const sharedKey = (token: string) => ['vote', 'shared', token] as const;

const VOTE_POLL_INTERVAL_MS = 15_000;

/**
 * 공개 투표 조회의 폴링 간격. 진행 중엔 15초, 마감이면 중단.
 *
 * 만료(410)·없는 링크(404)처럼 다시 물어도 답이 같은 4xx 에서도 멈춘다 — 한 번도
 * 성공한 적 없는 쿼리는 재조회 때 pending 으로 되돌아가 에러 화면이 15초마다
 * 스피너로 깜빡이고, 그때마다 요청이 나간다. 네트워크 단절·5xx·시간 초과(408)·
 * 요청 과다(429) 같은 일시 오류는 계속 폴링해 스스로 회복한다.
 */
export const sharedVoteRefetchInterval = (state: {
  data?: Pick<SharedVoteSessionType, 'closedAt'>;
  error: unknown;
}): number | false => {
  if (state.data?.closedAt) return false;
  const { error } = state;
  if (
    error instanceof ApiError &&
    error.statusCode >= 400 &&
    error.statusCode < 500 &&
    error.statusCode !== 408 &&
    error.statusCode !== 429
  ) {
    return false;
  }
  return VOTE_POLL_INTERVAL_MS;
};

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
    // 집계는 다른 참가자 투표로 수시로 바뀐다 — 진행 중 15초 폴링, 마감이나
    // 만료·없는 링크면 중단. 탭 비활성 시 자동 중단(refetchIntervalInBackground
    // 기본 false).
    staleTime: 0,
    placeholderData: (prev) => prev,
    refetchInterval: (query) => sharedVoteRefetchInterval(query.state),
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
