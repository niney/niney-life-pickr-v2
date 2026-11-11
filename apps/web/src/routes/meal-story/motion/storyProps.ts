import type { MealStoryIconType, MealStoryType } from '@repo/api-contract';

// 장면 틀이 '그 편의 소품'을 고르는 규칙 — 틀에 특정 편의 그림(토마토·파스타 접시)을 박아 두지 않고 원고의 레시피에서 고른다.
// 표지 식탁과 영양정보 장면이 같이 쓴다. 소품을 달지 않은 원고는 그 자리를 비운다.

type Scenes = Pick<MealStoryType, 'scenes'>;

/** 완성 그릇 — 마지막 만드는 법 단계의 소품(첫 편 = 파스타 접시, 식이섬유 편 = 비빔밥). */
export const dishIcon = (story: Scenes): MealStoryIconType | null => {
  let done: MealStoryIconType | null = null;
  for (const sc of story.scenes) if (sc.type === 'step' && sc.icon) done = sc.icon;
  return done;
};

/** 재료 소품 — 재료 장면에 나온 차례대로, 같은 그림은 한 번만. */
export const ingredientIcons = (story: Scenes): MealStoryIconType[] => {
  const used = new Set<MealStoryIconType>();
  for (const sc of story.scenes) if (sc.type === 'ingredients') for (const it of sc.items) if (it.icon) used.add(it.icon);
  return [...used];
};
