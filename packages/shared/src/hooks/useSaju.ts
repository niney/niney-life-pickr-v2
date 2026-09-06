import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSajuReadingInputType,
  CreateSajuShareInputType,
  SajuDailyInputType,
  SajuDatePickInputType,
  SajuFoodInputType,
  SajuJobPollResultType,
  SajuMatchInputType,
  SajuProfileInputType,
} from '@repo/api-contract';
import { ApiError } from '../api/client.js';
import { sajuApi } from '../api/saju.api.js';
import { useAuthStore } from '../stores/authStore.js';
import { getGuestKey } from '../stores/guestKeyStore.js';

// 사주 훅 — 웹/앱 공용. 전체 풀이는 mutation(입력 확정 순간 호출, 무대 연출이 대기를 덮는다) + job long-poll
// query. 오늘·궁합·택일·음식은 단일 mutation. 게스트 키는 스토어에서 읽어 헤더로 붙인다.

const jobKey = (jobId: string) => ['saju', 'job', jobId] as const;

export const useCreateSajuReading = () =>
  useMutation({
    mutationFn: (input: CreateSajuReadingInputType) => sajuApi.createReading(input, getGuestKey()),
  });

export interface SajuJobState {
  /** 마지막 poll 결과(없으면 null). */
  data: SajuJobPollResultType | null;
  /** 서버 재시작 등으로 job 이 사라짐(410) — 정적 본문 유지 + 다시 시도 안내. */
  gone: boolean;
  polling: boolean;
}

// 섹션 long-poll — 이전 결과의 version 을 after 로 넘겨 새 섹션만 기다린다. done 이면 멈춘다.
// 요청 자체가 최대 20초 서버 대기이므로 refetchInterval 은 짧게(연결 사이 틈만).
export const useSajuJob = (jobId: string | null): SajuJobState => {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: jobKey(jobId ?? ''),
    queryFn: async () => {
      if (!jobId) throw new Error('jobId required');
      const prev = queryClient.getQueryData<SajuJobPollResultType>(jobKey(jobId));
      return sajuApi.pollJob(jobId, prev?.version ?? 0);
    },
    enabled: !!jobId,
    refetchInterval: (query) => (query.state.data?.done || query.state.error ? false : 200),
    refetchOnWindowFocus: false,
    retry: (count, err) => !(err instanceof ApiError && err.statusCode === 410) && count < 2,
    staleTime: Infinity,
  });
  const gone = q.error instanceof ApiError && q.error.statusCode === 410;
  return { data: q.data ?? null, gone, polling: !!jobId && !gone && !(q.data?.done ?? false) };
};

export const useSajuDaily = () =>
  useMutation({ mutationFn: (input: SajuDailyInputType) => sajuApi.daily(input, getGuestKey()) });

export const useSajuMatch = () =>
  useMutation({ mutationFn: (input: SajuMatchInputType) => sajuApi.match(input, getGuestKey()) });

export const useSajuDatePick = () =>
  useMutation({ mutationFn: (input: SajuDatePickInputType) => sajuApi.datePick(input, getGuestKey()) });

export const useSajuFood = () =>
  useMutation({ mutationFn: (input: SajuFoodInputType) => sajuApi.food(input, getGuestKey()) });

// 탭을 열면 자동으로 부르는 query 판 — 같은 입력은 캐시(서버도 캐시라 한도 소비 없음). null 이면 대기.
const inputKey = (v: unknown): string => JSON.stringify(v);
const TOOL_STALE_MS = 10 * 60_000;

export const useSajuDailyQuery = (input: SajuDailyInputType | null) =>
  useQuery({
    queryKey: ['saju', 'daily', inputKey(input)],
    queryFn: () => sajuApi.daily(input as SajuDailyInputType, getGuestKey()),
    enabled: !!input,
    staleTime: TOOL_STALE_MS,
    retry: false,
  });

export const useSajuFoodQuery = (input: SajuFoodInputType | null) =>
  useQuery({
    queryKey: ['saju', 'food', inputKey(input)],
    queryFn: () => sajuApi.food(input as SajuFoodInputType, getGuestKey()),
    enabled: !!input,
    staleTime: TOOL_STALE_MS,
    retry: false,
  });

export const useSajuDatePickQuery = (input: SajuDatePickInputType | null) =>
  useQuery({
    queryKey: ['saju', 'date-pick', inputKey(input)],
    queryFn: () => sajuApi.datePick(input as SajuDatePickInputType, getGuestKey()),
    enabled: !!input,
    staleTime: TOOL_STALE_MS,
    retry: false,
  });

export const useSajuMatchQuery = (input: SajuMatchInputType | null) =>
  useQuery({
    queryKey: ['saju', 'match', inputKey(input)],
    queryFn: () => sajuApi.match(input as SajuMatchInputType, getGuestKey()),
    enabled: !!input,
    staleTime: TOOL_STALE_MS,
    retry: false,
  });

// ── 공유·회원 프로필·기록 (4차) ─────────────────────────────────────────────

const mineKey = ['saju', 'mine'] as const;
const profilesKey = ['saju', 'profiles'] as const;

export const useCreateSajuShare = () =>
  useMutation({ mutationFn: (input: CreateSajuShareInputType) => sajuApi.createShare(input, getGuestKey()) });

export const useSharedSajuReading = (token: string | null) =>
  useQuery({
    queryKey: ['saju', 'shared', token ?? ''],
    queryFn: () => {
      if (!token) throw new Error('token required');
      return sajuApi.getShared(token);
    },
    enabled: !!token,
    staleTime: 10 * 60_000,
    retry: false,
  });

export const useSajuProfiles = () => {
  const loggedIn = useAuthStore((s) => !!s.token);
  return useQuery({ queryKey: profilesKey, queryFn: () => sajuApi.listProfiles(), enabled: loggedIn, staleTime: 60_000 });
};

export const useUpsertSajuProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SajuProfileInputType }) => (id ? sajuApi.updateProfile(id, input) : sajuApi.createProfile(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profilesKey });
    },
  });
};

export const useDeleteSajuProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sajuApi.deleteProfile(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profilesKey });
    },
  });
};

export const useMySajuReadingsInfinite = (limit = 20) => {
  const loggedIn = useAuthStore((s) => !!s.token);
  return useInfiniteQuery({
    queryKey: [...mineKey, 'infinite', { limit }],
    queryFn: ({ pageParam }) => sajuApi.listMine({ limit, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: loggedIn,
    staleTime: 30_000,
  });
};

export const useMySajuReading = (id: string | null) => {
  const loggedIn = useAuthStore((s) => !!s.token);
  return useQuery({
    queryKey: [...mineKey, 'detail', id ?? ''],
    queryFn: () => {
      if (!id) throw new Error('id required');
      return sajuApi.getMine(id);
    },
    enabled: loggedIn && !!id,
    staleTime: 5 * 60_000,
  });
};

export const useDeleteSajuReading = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sajuApi.deleteMine(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mineKey });
    },
  });
};
