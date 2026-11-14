import { describe, expect, it } from 'vitest';
import type { MealPlaceMenuFoodType, MealPlaceMenuType } from '@repo/api-contract';
import {
  placeMenuKcal,
  placeMenuKcalLabel,
  placeMenuMatches,
  placeMenuSub,
  placeMenuSwapOptions,
} from './mealPlaceMenu';

// 식당 메뉴 한 줄의 표시 값 — 열량 범위, 무엇으로 기록되는지, 메뉴 찾기, 고른 줄을 바꿀 후보.

const food = (name: string, kcal: number | null, over: Partial<MealPlaceMenuFoodType> = {}): MealPlaceMenuFoodType => ({
  name,
  foodId: kcal === null ? null : `f-${name}`,
  dishType: null,
  mainIngredient: null,
  cuisine: null,
  isMain: true,
  kcal,
  ...over,
});

const single: MealPlaceMenuType = {
  menuName: '묵은지 김치찌개',
  price: 9000,
  recommend: true,
  foods: [food('김치찌개', 240)],
};
const plain: MealPlaceMenuType = { menuName: '주모의 한상', price: null, recommend: false, foods: [food('주모의 한상', null)] };
const set: MealPlaceMenuType = {
  menuName: '수제돈까스 + 우동',
  price: 12000,
  recommend: false,
  foods: [food('돈가스', 650), food('우동', 420)],
};
const course: MealPlaceMenuType = {
  menuName: '이 코스(2인이상)',
  price: 35000,
  recommend: false,
  foods: [food('유산슬', 114, { portion: 'small' }), food('꽃빵', null, { portion: 'small' })],
  choices: [{ label: '식사', options: [food('짜장면', 551, { portion: 'small' }), food('짬뽕', 278, { portion: 'small' })] }],
};
const pickOnly: MealPlaceMenuType = {
  menuName: '후식 냉면(물/비빔)',
  price: 6000,
  recommend: false,
  foods: [],
  choices: [{ label: null, options: [food('물냉면', 480), food('비빔냉면', 560)] }],
};

describe('placeMenuKcal', () => {
  it('정해진 구성의 합에 고르는 묶음의 가장 낮은~높은 선택지를 더한 범위', () => {
    expect(placeMenuKcal(single)).toEqual({ min: 240, max: 240, known: 1, total: 1 });
    expect(placeMenuKcal(set)).toEqual({ min: 1070, max: 1070, known: 2, total: 2 });
    expect(placeMenuKcal(course)).toEqual({ min: 392, max: 665, known: 2, total: 3 });
    expect(placeMenuKcal(pickOnly)).toEqual({ min: 480, max: 560, known: 1, total: 1 });
    expect(placeMenuKcal(plain)).toBeNull();
  });

  it('글로는 하나면 숫자, 달라지면 범위', () => {
    expect(placeMenuKcalLabel(single)).toBe('240kcal');
    expect(placeMenuKcalLabel(course)).toBe('392~665kcal');
    expect(placeMenuKcalLabel(pickOnly)).toBe('480~560kcal');
    expect(placeMenuKcalLabel(plain)).toBeNull();
  });
});

describe('placeMenuSub', () => {
  it('가격 · 대표 · 무엇으로 기록되는지 — 못 이은 메뉴는 밝힐 것이 없다', () => {
    expect(placeMenuSub(single)).toBe('9,000원 · 대표 · 김치찌개로 기록');
    expect(placeMenuSub(plain)).toBe('');
    expect(placeMenuSub(set)).toBe('12,000원 · 돈가스 + 우동으로 나눠 기록');
  });

  it('구성으로 풀리는 메뉴는 구성과 고르는 것을, 열량을 일부만 알면 그것도 밝힌다', () => {
    expect(placeMenuSub(course)).toBe(
      '35,000원 · 유산슬 + 꽃빵 + (짜장면·짬뽕 중 하나) · 조금씩 · 열량은 3가지 중 2가지만',
    );
    expect(placeMenuSub(pickOnly)).toBe('6,000원 · (물냉면·비빔냉면 중 하나)');
    // 카탈로그로 못 이은 구성이라도 나눠 기록된다는 것은 밝힌다.
    expect(
      placeMenuSub({ menuName: 'B세트', price: null, recommend: false, foods: [food('유린기', null), food('가지튀김', null)] }),
    ).toBe('유린기 + 가지튀김으로 나눠 기록');
  });
});

describe('placeMenuMatches', () => {
  it('메뉴명·기록 이름·선택지 어디에 든 말로든 찾는다', () => {
    expect(placeMenuMatches(course, '코스')).toBe(true);
    expect(placeMenuMatches(course, '유산 슬')).toBe(true);
    expect(placeMenuMatches(course, '짬뽕')).toBe(true);
    expect(placeMenuMatches(course, '탕수육')).toBe(false);
    expect(placeMenuMatches(course, '  ')).toBe(true);
  });
});

describe('placeMenuSwapOptions', () => {
  const menus = [single, course, pickOnly];

  it('고르는 묶음에서 온 줄이면 고르지 않은 선택지를 준다', () => {
    expect(
      placeMenuSwapOptions(menus, { name: '짬뽕', foodId: 'f-짬뽕', menuName: '이 코스(2인이상)' }).map((o) => o.name),
    ).toEqual(['짜장면']);
    expect(
      placeMenuSwapOptions(menus, { name: '물 냉면', foodId: null, menuName: '후식 냉면(물/비빔)' }).map((o) => o.name),
    ).toEqual(['비빔냉면']);
  });

  it('정해진 구성·다른 메뉴의 줄·메뉴에서 넣지 않은 줄은 후보가 없다', () => {
    expect(placeMenuSwapOptions(menus, { name: '유산슬', foodId: 'f-유산슬', menuName: '이 코스(2인이상)' })).toEqual([]);
    expect(placeMenuSwapOptions(menus, { name: '짬뽕', foodId: null, menuName: '묵은지 김치찌개' })).toEqual([]);
    expect(placeMenuSwapOptions(menus, { name: '짬뽕', foodId: null, menuName: null })).toEqual([]);
    expect(placeMenuSwapOptions([], { name: '짬뽕', foodId: null, menuName: '이 코스(2인이상)' })).toEqual([]);
  });
});
