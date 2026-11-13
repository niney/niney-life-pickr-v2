import type { MealPlaceMenuType } from '@repo/api-contract';
import { mealItemNameKey } from '@repo/shared';
import { formatMenuPrice } from '@repo/utils';

// 식당 메뉴 한 줄의 표시 값 — 입력 화면의 메뉴 목록(MealPlaceMenus)과 휴대폰 음식 찾기 시트가 같이 쓴다.

/** 넣으면 붙을 열량 — 세트는 구성요소를 모두 알 때만 합친다(일부만 알면 작게 보인다). */
export const placeMenuKcal = (menu: MealPlaceMenuType): number | null =>
  menu.foods.every((food) => food.kcal !== null)
    ? menu.foods.reduce((sum, food) => sum + (food.kcal ?? 0), 0)
    : null;

/**
 * 메뉴명 아래 한 줄 — 가격 · 대표 · 무엇으로 기록되는지. 기록 이름이 메뉴명과 다를 때만 밝힌다("김치찌개로 기록" —
 * 통계는 그 이름으로 묶인다). 카탈로그로 못 이은 메뉴는 메뉴명 그대로 들어가 밝힐 것이 없다.
 */
export const placeMenuSub = (menu: MealPlaceMenuType): string => {
  const recorded = menu.foods.map((food) => food.name).join(' + ');
  const renamed =
    menu.foods.some((food) => food.foodId !== null) &&
    mealItemNameKey(recorded) !== mealItemNameKey(menu.menuName);
  const particle = hasFinalConsonant(recorded) ? '으로' : '로';
  return [
    menu.price !== null ? formatMenuPrice(menu.price) : null,
    menu.recommend ? '대표' : null,
    renamed ? `${recorded}${particle} ${menu.foods.length > 1 ? '나눠 기록' : '기록'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
};

// 조사 '로/으로' — 받침이 없거나 ㄹ 받침이면 '로'.
const hasFinalConsonant = (word: string): boolean => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return false;
  const final = code % 28;
  return final !== 0 && final !== 8;
};

/** 메뉴 찾기 — 띄어쓰기·대소문자 무시하고 메뉴명이나 기록 이름에 그 말이 들었는지. */
export const placeMenuMatches = (menu: MealPlaceMenuType, term: string): boolean => {
  const key = mealItemNameKey(term);
  if (!key) return true;
  return (
    mealItemNameKey(menu.menuName).includes(key) ||
    menu.foods.some((food) => mealItemNameKey(food.name).includes(key))
  );
};
