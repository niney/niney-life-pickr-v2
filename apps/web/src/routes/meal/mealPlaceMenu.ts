import type { MealPlaceMenuFoodType, MealPlaceMenuType } from '@repo/api-contract';
import { mealItemNameKey } from '@repo/shared';
import { formatMenuPrice } from '@repo/utils';

// 식당 메뉴 한 줄의 표시 값 — 입력 화면의 메뉴 목록(MealPlaceMenus)과 휴대폰 음식 찾기 시트가 같이 쓴다.

const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

export interface PlaceMenuKcal {
  /** 넣으면 붙을 열량의 범위 — 고르는 묶음이 없으면 min 과 max 가 같다. */
  min: number;
  max: number;
  /** 열량을 아는 구성 수 / 전체 구성 수(정해진 음식 + 고르는 묶음). 다르면 합계가 실제보다 작다. */
  known: number;
  total: number;
}

/**
 * 넣으면 붙을 열량 — 정해진 구성의 합에, 고르는 묶음마다 가장 낮은 선택지~가장 높은 선택지를 더한 범위.
 * 열량을 아는 구성이 하나도 없으면 null.
 */
export const placeMenuKcal = (menu: MealPlaceMenuType): PlaceMenuKcal | null => {
  let min = 0;
  let max = 0;
  let known = 0;
  for (const food of menu.foods) {
    if (food.kcal === null) continue;
    min += food.kcal;
    max += food.kcal;
    known += 1;
  }
  const groups = menu.choices ?? [];
  for (const group of groups) {
    const kcals = group.options.flatMap((option) => (option.kcal === null ? [] : [option.kcal]));
    if (kcals.length === 0) continue;
    min += Math.min(...kcals);
    max += Math.max(...kcals);
    known += 1;
  }
  return known === 0 ? null : { min, max, known, total: menu.foods.length + groups.length };
};

/** 메뉴 줄 오른쪽의 열량 글 — "740kcal", 고르기에 따라 달라지면 "740~1,010kcal". 모르면 null. */
export const placeMenuKcalLabel = (menu: MealPlaceMenuType): string | null => {
  const kcal = placeMenuKcal(menu);
  if (!kcal) return null;
  return fmt(kcal.min) === fmt(kcal.max) ? `${fmt(kcal.min)}kcal` : `${fmt(kcal.min)}~${fmt(kcal.max)}kcal`;
};

/**
 * 메뉴명 아래 한 줄 — 가격 · 대표 · 무엇으로 기록되는지. 기록 이름이 메뉴명과 다를 때만 밝힌다("김치찌개로 기록" —
 * 통계는 그 이름으로 묶인다). 카탈로그로 못 이은 메뉴는 메뉴명 그대로 들어가 밝힐 것이 없다. 구성으로 풀리는 메뉴는
 * 구성을 적고(코스는 조금씩), 고르는 묶음은 "(짜장면·짬뽕 중 하나)"로, 열량을 일부만 알면 그것도 밝힌다.
 */
export const placeMenuSub = (menu: MealPlaceMenuType): string => {
  const groups = menu.choices ?? [];
  const recorded = menu.foods.map((food) => food.name).join(' + ');
  const small = [...menu.foods, ...groups.flatMap((group) => group.options)].some((food) => food.portion === 'small');
  const how = (): string | null => {
    if (groups.length > 0) {
      const picks = groups.map((group) => `(${group.options.map((option) => option.name).join('·')} 중 하나)`);
      return `${[...(recorded ? [recorded] : []), ...picks].join(' + ')}${small ? ' · 조금씩' : ''}`;
    }
    if (menu.foods.length > 1) {
      return `${recorded}${particle(recorded)} ${small ? '조금씩 ' : ''}나눠 기록`;
    }
    const renamed =
      menu.foods.some((food) => food.foodId !== null) &&
      mealItemNameKey(recorded) !== mealItemNameKey(menu.menuName);
    return renamed ? `${recorded}${particle(recorded)} 기록` : null;
  };
  const kcal = placeMenuKcal(menu);
  return [
    menu.price !== null ? formatMenuPrice(menu.price) : null,
    menu.recommend ? '대표' : null,
    how(),
    kcal && kcal.known < kcal.total ? `열량은 ${kcal.total}가지 중 ${kcal.known}가지만` : null,
  ]
    .filter(Boolean)
    .join(' · ');
};

// 조사 '로/으로' — 받침이 없거나 ㄹ 받침이면 '로'.
const particle = (word: string): string => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '로';
  const final = code % 28;
  return final !== 0 && final !== 8 ? '으로' : '로';
};

/** 메뉴 찾기 — 띄어쓰기·대소문자 무시하고 메뉴명이나 기록 이름(구성·선택지 포함)에 그 말이 들었는지. */
export const placeMenuMatches = (menu: MealPlaceMenuType, term: string): boolean => {
  const key = mealItemNameKey(term);
  if (!key) return true;
  return (
    mealItemNameKey(menu.menuName).includes(key) ||
    menu.foods.some((food) => mealItemNameKey(food.name).includes(key)) ||
    (menu.choices ?? []).some((group) => group.options.some((option) => mealItemNameKey(option.name).includes(key)))
  );
};

const sameFood = (food: MealPlaceMenuFoodType, item: { name: string; foodId: string | null }): boolean =>
  mealItemNameKey(food.name) === mealItemNameKey(item.name) || (food.foodId !== null && food.foodId === item.foodId);

/**
 * 메뉴에서 고른 줄을 다른 선택지로 바꿀 때의 후보 — 그 줄이 어느 메뉴의 어느 묶음에서 왔는지 찾아, 고르지 않은
 * 선택지를 준다("짜장면" 줄 → 짬뽕). 메뉴에서 넣은 줄이 아니거나 정해진 구성이면 빈 배열.
 */
export const placeMenuSwapOptions = (
  menus: MealPlaceMenuType[],
  item: { name: string; foodId: string | null; menuName?: string | null },
): MealPlaceMenuFoodType[] => {
  if (!item.menuName) return [];
  const menu = menus.find((m) => m.menuName === item.menuName);
  const group = menu?.choices?.find((g) => g.options.some((option) => sameFood(option, item)));
  return group ? group.options.filter((option) => !sameFood(option, item)) : [];
};
