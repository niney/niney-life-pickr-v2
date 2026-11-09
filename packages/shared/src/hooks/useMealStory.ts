import { useMutation, useQuery } from '@tanstack/react-query';
import { mealStoryApi } from '../api/meal-story.api.js';
import { useAuthStore } from '../stores/authStore.js';

// 건강식단 스토리 — 원고는 배포로만 바뀌어 오래 둔다. 관리자는 초안까지 받으니 키를 나눈다(로그인·로그아웃 뒤 섞이지 않게).
const STALE = 5 * 60_000;
const useAudience = (): 'admin' | 'public' => (useAuthStore((s) => s.user?.role) === 'ADMIN' ? 'admin' : 'public');

export const useMealStories = (enabled = true) => {
  const audience = useAudience();
  return useQuery({
    queryKey: ['meal-story', 'list', audience],
    queryFn: () => mealStoryApi.list(),
    enabled,
    staleTime: STALE,
  });
};

export const useMealStory = (slug: string | undefined) => {
  const audience = useAudience();
  return useQuery({
    queryKey: ['meal-story', 'detail', slug ?? '', audience],
    queryFn: () => mealStoryApi.get(slug!),
    enabled: !!slug,
    staleTime: STALE,
    retry: false,
  });
};

/** [이 레시피로 기록] — 성공하면 부르는 쪽이 새 기록 draft 를 이 음식으로 채운다. */
export const useMealStoryFood = () =>
  useMutation({
    mutationFn: (slug: string) => mealStoryApi.food(slug),
  });
