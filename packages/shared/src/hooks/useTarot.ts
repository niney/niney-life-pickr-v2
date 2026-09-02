import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTarotReadingInputType, CreateTarotShareInputType } from '@repo/api-contract';
import { tarotApi } from '../api/tarot.api.js';
import { useAuthStore } from '../stores/authStore.js';
import { getGuestKey } from '../stores/guestKeyStore.js';

// 타로 훅 — 웹/앱 공용. 리딩은 mutation(카드를 다 고른 순간 호출하고 플립 애니메이션이 대기를
// 덮는다), 회원 기록은 query. 게스트 키는 스토어에서 읽어 헤더로 붙인다.

const mineKey = ['tarot', 'mine'] as const;
const sharedKey = (token: string) => ['tarot', 'shared', token] as const;

export const useCreateTarotReading = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTarotReadingInputType) => tarotApi.createReading(input, getGuestKey()),
    onSuccess: (data) => {
      // 회원 자동 저장분이 기록 목록에 바로 보이게.
      if (data.readingId) void queryClient.invalidateQueries({ queryKey: mineKey });
    },
  });
};

// 공유 토큰 발급 — 응답의 path 에 클라이언트 origin 을 붙여 링크를 만든다.
export const useCreateTarotShare = () =>
  useMutation({
    mutationFn: (input: CreateTarotShareInputType) => tarotApi.createShare(input, getGuestKey()),
  });

// 공개 공유 조회 — 공유 행은 불변이라 오래 캐시.
export const useSharedTarotReading = (token: string | null) =>
  useQuery({
    queryKey: sharedKey(token ?? ''),
    queryFn: () => {
      if (!token) throw new Error('token required');
      return tarotApi.getShared(token);
    },
    enabled: !!token,
    staleTime: 10 * 60_000,
    retry: false,
  });

export const useMyTarotReadings = (limit = 20) => {
  const loggedIn = useAuthStore((s) => !!s.token);
  return useQuery({
    queryKey: [...mineKey, { limit }],
    queryFn: () => tarotApi.listMine({ limit }),
    enabled: loggedIn,
    staleTime: 30_000,
  });
};

export const useMyTarotReading = (id: string | null) => {
  const loggedIn = useAuthStore((s) => !!s.token);
  return useQuery({
    queryKey: [...mineKey, 'detail', id ?? ''],
    queryFn: () => {
      if (!id) throw new Error('id required');
      return tarotApi.getMine(id);
    },
    enabled: loggedIn && !!id,
    staleTime: 5 * 60_000,
  });
};

export const useDeleteTarotReading = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tarotApi.deleteMine(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mineKey });
    },
  });
};
