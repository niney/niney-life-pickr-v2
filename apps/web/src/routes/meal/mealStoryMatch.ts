import type { MealStoryListItemType } from '@repo/api-contract';

// 건강식단 이야기를 내 영양 판정에 잇는 규칙 — 영양 탭·통계·홈·건강식단 목록이 같이 쓴다(2026-11-10: 건강식단을 별도 메뉴가
// 아니라 식단 안에서 맥락에 맞게 보인다). '많음'이면 그 영양소를 줄이는 이야기, '부족'·'조금 부족'이면 채우는 이야기.
// 목록은 새 것이 앞이라 처음 맞는 것이 가장 새 이야기다.
// 게시 여부는 서버가 가른다 — 초안은 관리자에게만 온다. 화면은 받은 대로 잇고 초안이면 '초안'이라고 표시한다: 메뉴 항목이
// 없어 초안으로 들어가는 길도 이 연결뿐이고, 관리자가 게시 전에 식단 안에서 어떻게 보일지 확인한다.

export type StoryDirection = 'reduce' | 'increase';

/** 판정(영양 탭의 status 또는 화면 판정) → 이야기 방향. '충분'·'기록 더 필요'·'판단 보류'는 잇지 않는다. */
export const storyDirectionFor = (status: string | null | undefined): StoryDirection | null =>
  status === 'high' ? 'reduce' : status === 'low' || status === 'borderline' ? 'increase' : null;

export const findStoryFor = (
  items: readonly MealStoryListItemType[],
  nutrient: string,
  status: string | null | undefined,
): MealStoryListItemType | null => {
  const direction = storyDirectionFor(status);
  if (!direction) return null;
  return (
    items.find((s) => s.topic?.nutrient === nutrient && s.topic.direction === direction) ?? null
  );
};

/** 이 음식(기록 항목의 foodId)이 건강식단 레시피로 적은 것이면 그 이야기 — 서버가 목록에 맞춘 음식 id 를 실어 보낸다. */
export const storyForFood = (
  items: readonly MealStoryListItemType[],
  foodId: string | null | undefined,
): MealStoryListItemType | null => (foodId ? (items.find((s) => s.recipeFoodId === foodId) ?? null) : null);
