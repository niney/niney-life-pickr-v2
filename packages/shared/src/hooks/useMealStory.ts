import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MealStoryListResultType } from '@repo/api-contract';
import { mealStoryApi } from '../api/meal-story.api.js';
import { useAuthStore } from '../stores/authStore.js';

// 건강식단 스토리 — 원고는 배포로만 바뀌어 오래 둔다. 관리자는 초안까지 받으니 키를 나눈다(로그인·로그아웃 뒤 섞이지 않게).
const STALE = 5 * 60_000;
const LIST_KEY = ['meal-story', 'list'] as const;
const useAudience = (): 'admin' | 'public' => (useAuthStore((s) => s.user?.role) === 'ADMIN' ? 'admin' : 'public');

export const useMealStories = (enabled = true) => {
  const audience = useAudience();
  return useQuery({
    queryKey: [...LIST_KEY, audience],
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

/**
 * [이 레시피로 기록] — 성공하면 부르는 쪽이 새 기록 draft 를 이 음식으로 채운다. 받은 음식 id 는 목록 캐시의 그 스토리에
 * 바로 적는다(recipeFoodId) — 방금 처음 만든 음식이어도 곧 저장할 기록의 상세가 이야기를 이을 수 있게.
 */
export const useMealStoryFood = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => mealStoryApi.food(slug),
    onSuccess: (food, slug) => {
      qc.setQueriesData<MealStoryListResultType>({ queryKey: LIST_KEY }, (prev) =>
        prev
          ? { items: prev.items.map((s) => (s.slug === slug ? { ...s, recipeFoodId: food.foodId } : s)) }
          : prev,
      );
    },
  });
};
