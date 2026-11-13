import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { DEFAULT_LEXICON, MenuNutritionEngine, buildCatalogIndex, catalogRow } from '../food/engine/index.js';
import { MealPlaceMenuService, parseMenuPrice, type MealPlaceMenuSource } from './meal-place-menu.service.js';

// 식당 메뉴에서 넣기 — 그 집 메뉴명을 기록에 넣을 음식(표준명·분류·1인분 열량)으로 바꾸는 규칙. DB 없이 인메모리
// 카탈로그로 고정한다: 같은 음식으로 볼 수 있는 매칭만 이름이 되고, 세트는 모두 이어질 때만 풀린다.

const catalog = [
  { row: catalogRow('김치찌개', { dishType: 'stew', servingG: 400, kcal: 240, kcalPer100g: 60 }), mainIngredient: 'pork', cuisine: 'korean' },
  { row: catalogRow('된장찌개', { dishType: 'stew', servingG: 400, kcal: 180, kcalPer100g: 45 }), mainIngredient: 'bean', cuisine: 'korean' },
  { row: catalogRow('곰탕', { dishType: 'soup', servingG: 600, kcal: 330, kcalPer100g: 55 }), mainIngredient: 'beef', cuisine: 'korean' },
  { row: catalogRow('돈가스', { dishType: 'fried', servingG: 250, kcal: 650, kcalPer100g: 260 }), mainIngredient: 'pork', cuisine: 'japanese' },
  { row: catalogRow('우동', { dishType: 'noodle', servingG: 500, kcal: 420, kcalPer100g: 84 }), mainIngredient: 'grain', cuisine: 'japanese' },
  { row: catalogRow('가지', { dishType: 'other', servingG: 100, kcal: 19, kcalPer100g: 19 }), mainIngredient: 'vegetable', cuisine: null },
  { row: catalogRow('콜라', { dishType: 'beverage', servingG: 250, kcal: 105, kcalPer100g: 42 }), mainIngredient: null, cuisine: null },
  { row: catalogRow('사이다', { dishType: 'beverage', servingG: 250, kcal: 110, kcalPer100g: 44 }), mainIngredient: null, cuisine: null },
  { row: catalogRow('배추김치', { dishType: 'kimchi', servingG: 150, kcal: 45, kcalPer100g: 30 }), mainIngredient: 'vegetable', cuisine: 'korean' },
];
const engine = new MenuNutritionEngine(buildCatalogIndex(catalog.map((c) => c.row)));

const makeService = (place: MealPlaceMenuSource | null, opts: { inactive?: string[] } = {}) =>
  new MealPlaceMenuService({
    prisma: {
      foodItem: {
        findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
          catalog
            .filter((c) => where.id.in.includes(c.row.id) && !opts.inactive?.includes(c.row.name))
            .map((c) => ({
              ...c.row,
              proteinG: null,
              sodiumMg: null,
              mainIngredient: c.mainIngredient,
              cuisine: c.cuisine,
            })),
      },
    } as unknown as PrismaClient,
    food: { servingLexicon: async () => DEFAULT_LEXICON },
    resolver: { resolveMany: async (names: string[]) => engine.resolveMany(names) },
    loadPlace: async () => place,
  });

const menusOf = async (menus: MealPlaceMenuSource['menus'], opts?: { inactive?: string[] }) =>
  (await makeService({ name: '숯토리', menus }, opts).forPlace('place-1'))!.menus;

describe('parseMenuPrice', () => {
  it('숫자·쉼표·원만 값으로 보고, 변동·무료·범위는 비운다', () => {
    expect(parseMenuPrice('9000')).toBe(9000);
    expect(parseMenuPrice('23,000원')).toBe(23000);
    expect(parseMenuPrice('가격 변동')).toBeNull();
    expect(parseMenuPrice('무료')).toBeNull();
    expect(parseMenuPrice('16,000~31,000원')).toBeNull();
    expect(parseMenuPrice(null)).toBeNull();
  });
});

describe('MealPlaceMenuService.forPlace', () => {
  it('식당이 없으면 null, 메뉴가 없으면 빈 목록', async () => {
    expect(await makeService(null).forPlace('nope')).toBeNull();
    expect(await makeService({ name: '숯토리', menus: [] }).forPlace('place-1')).toEqual({
      placeId: 'place-1',
      placeName: '숯토리',
      menus: [],
    });
  });

  it('같은 음식으로 볼 수 있는 메뉴는 카탈로그 표준명·분류·1인분 열량으로, 메뉴명·가격은 그 집 표기 그대로', async () => {
    const menus = await menusOf([
      { name: '[대표] 김치찌개', price: '9,000원', recommend: true },
      { name: '특곰탕', price: '15000' },
      { name: '수제돈까스', price: '가격 변동' },
    ]);
    expect(menus).toEqual([
      {
        menuName: '[대표] 김치찌개',
        price: 9000,
        recommend: true,
        foods: [
          { name: '김치찌개', foodId: 'id-김치찌개', dishType: 'stew', mainIngredient: 'pork', cuisine: 'korean', isMain: true, kcal: 240 },
        ],
      },
      {
        menuName: '특곰탕',
        price: 15000,
        recommend: false,
        foods: [{ name: '곰탕', foodId: 'id-곰탕', dishType: 'soup', mainIngredient: 'beef', cuisine: 'korean', isMain: true, kcal: 330 }],
      },
      {
        menuName: '수제돈까스',
        price: null,
        recommend: false,
        foods: [
          { name: '돈가스', foodId: 'id-돈가스', dishType: 'fried', mainIngredient: 'pork', cuisine: 'japanese', isMain: true, kcal: 650 },
        ],
      },
    ]);
  });

  it('접미로 이어진 음식은 메뉴명의 절반 이상일 때만 이름이 된다 — 끝말만 같은 메뉴는 메뉴명 그대로', async () => {
    const menus = await menusOf([{ name: '차돌된장찌개' }, { name: '어향완자가지' }]);
    expect(menus[0]!.foods).toMatchObject([{ name: '된장찌개', foodId: 'id-된장찌개', kcal: 180 }]);
    expect(menus[1]!.foods).toEqual([
      { name: '어향완자가지', foodId: null, dishType: null, mainIngredient: null, cuisine: null, isMain: true, kcal: null },
    ]);
  });

  it("'+' 로 이은 세트는 구성요소가 모두 이어질 때만 풀고, 하나라도 못 이으면 메뉴 한 줄", async () => {
    const menus = await menusOf([{ name: '수제돈까스 + 우동', price: '12000' }, { name: '야키토리 7종 + 우동 SET' }]);
    expect(menus[0]).toMatchObject({
      menuName: '수제돈까스 + 우동',
      price: 12000,
      foods: [
        { name: '돈가스', foodId: 'id-돈가스', kcal: 650 },
        { name: '우동', foodId: 'id-우동', kcal: 420 },
      ],
    });
    expect(menus[1]!.foods).toHaveLength(1);
    expect(menus[1]!.foods[0]).toMatchObject({ foodId: null, kcal: null });
  });

  it('쉼표로 이은 것은 고르는 메뉴일 수 있어 풀지 않는다', async () => {
    const [menu] = await menusOf([{ name: '음료수(콜라,사이다)' }]);
    expect(menu!.foods).toHaveLength(1);
    expect(menu!.foods[0]!.foodId).toBeNull();
  });

  it('음료·김치는 곁들임으로 들어간다', async () => {
    const menus = await menusOf([{ name: '콜라' }, { name: '배추김치' }]);
    expect(menus.map((m) => m.foods[0])).toMatchObject([
      { name: '콜라', isMain: false },
      { name: '배추김치', isMain: false },
    ]);
  });

  it('같은 메뉴가 두 번 실리면 처음 자리에 한 번만 — 대표 표시와 가격은 합친다', async () => {
    const menus = await menusOf([
      { name: '김치찌개', price: '가격 변동', recommend: true },
      { name: '특곰탕' },
      { name: '김치찌개', price: '9000' },
    ]);
    expect(menus.map((m) => [m.menuName, m.price, m.recommend])).toEqual([
      ['김치찌개', 9000, true],
      ['특곰탕', null, false],
    ]);
  });

  it('이어진 카탈로그 행이 비활성이면 메뉴명 그대로 — 풀어 둔 세트도 한 줄로 되돌린다', async () => {
    const menus = await menusOf([{ name: '특곰탕' }, { name: '수제돈까스 + 우동' }], { inactive: ['곰탕', '우동'] });
    expect(menus[0]!.foods).toEqual([
      { name: '특곰탕', foodId: null, dishType: null, mainIngredient: null, cuisine: null, isMain: true, kcal: null },
    ]);
    expect(menus[1]!.foods).toHaveLength(1);
    expect(menus[1]!.foods[0]).toMatchObject({ foodId: null });
  });
});
