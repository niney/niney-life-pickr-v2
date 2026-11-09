import {
  Routes,
  type MealStoryFoodResultType,
  type MealStoryListResultType,
  type MealStoryType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 건강식단 스토리 — 목록·한 편은 누구나(로그인했으면 토큰이 실려 관리자는 초안도), 기록 연결은 로그인.
export const mealStoryApi = {
  list: () => apiFetch<MealStoryListResultType>(Routes.MealStory.list),
  get: (slug: string) => apiFetch<MealStoryType>(Routes.MealStory.detail(encodeURIComponent(slug))),
  /** [이 레시피로 기록] — 레시피를 카탈로그 음식으로 맞추고 그 id 를 받는다. */
  food: (slug: string) =>
    apiFetch<MealStoryFoodResultType>(Routes.MealStory.food(encodeURIComponent(slug)), { method: 'POST' }),
};
