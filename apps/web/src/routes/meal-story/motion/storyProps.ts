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

/**
 * 표지 식탁의 소품 셋(왼쪽·가운데·오른쪽) — 레시피가 있으면 [둘째 재료, 완성 그릇, 첫째 재료]. 레시피가 없는 편(외식 메뉴를 줄
 * 세우는 편)은 줄 세우기·목록에 나온 소품 가운데 앞의 셋을 [둘째, 첫째, 셋째]로 놓는다 — 그 편에서 가장 먼저 나오는 것이 가운데.
 */
export const coverIcons = (story: Scenes): (MealStoryIconType | null)[] => {
  const dish = dishIcon(story);
  const [first = null, second = null] = ingredientIcons(story);
  if (dish || first) return [second, dish, first];
  const seen = new Set<MealStoryIconType>();
  for (const sc of story.scenes) {
    if (sc.type === 'lineup') for (const r of sc.rows) if (r.icon) seen.add(r.icon);
    if (sc.type === 'list') for (const it of sc.items) if (it.icon) seen.add(it.icon);
  }
  const [a = null, b = null, c = null] = [...seen];
  return [b, a, c];
};

/** 재료 소품 — 재료 장면에 나온 차례대로, 같은 그림은 한 번만. */
export const ingredientIcons = (story: Scenes): MealStoryIconType[] => {
  const used = new Set<MealStoryIconType>();
  for (const sc of story.scenes) if (sc.type === 'ingredients') for (const it of sc.items) if (it.icon) used.add(it.icon);
  return [...used];
};
