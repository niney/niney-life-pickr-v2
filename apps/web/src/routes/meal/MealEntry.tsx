import { lazy } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@repo/shared';
import { MEAL_STORY_PATH } from './mealPaths';

// 식단(/meal/*) 들머리 — 로그인했으면 식단 하위 사이트(전용 셸과 화면들을 한 덩어리로 늦게 부른다 — 어드민과 같은 방식).
// 건강식단(목록·이야기·레시피)도 그 안에 뜬다 — 사이드 메뉴가 남아 식단을 떠나지 않는다.
// 로그인 전에는 건강식단(/meal/stories…)만 셸 없이 열어 준다 — 식단의 공개 얼굴이고(사이트 메뉴 '식단'이 로그인 전에는 목록으로
// 온다) 이야기는 공유 링크로 들어온다. 그 밖의 식단 주소는 로그인으로(2026-11-10: 건강식단을 별도 메뉴·별도 화면으로 두지 않는다).

const MealApp = lazy(() => import('./MealApp'));
const MealStoryApp = lazy(() => import('../meal-story/MealStoryApp'));

export const MealEntry = () => {
  const token = useAuthStore((s) => s.token);
  const { pathname } = useLocation();
  if (token) return <MealApp />;
  const path = pathname.replace(/\/+$/, '');
  if (path === MEAL_STORY_PATH.list || path.startsWith(`${MEAL_STORY_PATH.list}/`)) return <MealStoryApp />;
  return <Navigate to="/login" replace />;
};
