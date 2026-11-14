import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { DEFAULT_LEXICON, MenuNutritionEngine, buildCatalogIndex, catalogRow } from '../food/engine/index.js';
import { compositionKey, type MenuComposition } from '../food/menu-composition.js';
import type { MenuLine } from '../food/menu-composition.service.js';
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

type Deps = ConstructorParameters<typeof MealPlaceMenuService>[0];

const makeService = (
  place: MealPlaceMenuSource | null,
  opts: { inactive?: string[] } & Partial<Pick<Deps, 'compositions' | 'estimator'>> = {},
) =>
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
    // 이름 매칭은 엔진이 맡는다 — 여기서는 저장 경로의 이름 매칭(matchFood)이 아무것도 못 찾는 경우로 둔다.
    food: { servingLexicon: async () => DEFAULT_LEXICON, matchFood: async () => null },
    resolver: { resolveMany: async (names: string[]) => engine.resolveMany(names) },
    loadPlace: async () => place,
    ...(opts.compositions ? { compositions: opts.compositions } : {}),
    ...(opts.estimator ? { estimator: opts.estimator } : {}),
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

  it('못 이은 메뉴도 저장할 때 붙을 이름 추정 열량을 미리 보여 준다 — 이름은 그대로', async () => {
    const service = makeService(
      { name: '숯토리', menus: [{ name: '어향완자가지' }] },
      {
        estimator: {
          lookup: async (name: string) => ({
            estimate:
              name === '어향완자가지'
                ? { kcal: 312.4, proteinG: null, sodiumMg: null, nutritionFrom: '어향가지', basis: 'donor_estimate' as const }
                : null,
            askable: false,
          }),
          ask: async () => undefined,
        },
      },
    );
    expect((await service.forPlace('place-1'))!.menus[0]!.foods).toEqual([
      { name: '어향완자가지', foodId: null, dishType: null, mainIngredient: null, cuisine: null, isMain: true, kcal: 312 },
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

// 설명에 적힌 구성 — 읽어 둔 구성(menu_llm_compositions)을 넣을 음식과 고르는 묶음으로 바꾼다.
describe('MealPlaceMenuService.forPlace — 메뉴 설명의 구성', () => {
  // 저장된 구성 흉내 — 키는 글(이름 + 설명). 값 null = 물어봤고 구성 없음, 키 없음 = 아직 안 읽음.
  const fakeCompositions = (stored: [MenuLine, MenuComposition | null][]) => {
    const cache = new Map(stored.map(([line, c]) => [compositionKey(line.name, line.description), c]));
    const asked: MenuLine[][] = [];
    return {
      asked,
      cache,
      service: {
        lookupCached: async (lines: MenuLine[]) =>
          new Map(
            lines.flatMap((line) => {
              const key = compositionKey(line.name, line.description);
              return cache.has(key) ? [[key, cache.get(key) ?? null] as const] : [];
            }),
          ),
        readMany: async (lines: MenuLine[]) => {
          asked.push(lines);
          return new Map<string, MenuComposition | null>();
        },
      },
    };
  };

  const course = { name: '이 코스(2인이상)', description: '수제돈까스 + 우동 + 꽃빵 + (김치찌개,된장찌개 택1)' };

  it('코스는 정해진 구성을 조금씩(0.6배) 넣고, 택1 은 고르는 묶음으로 준다', async () => {
    const compositions = fakeCompositions([
      [course, { fixed: ['수제돈까스', '우동', '꽃빵'], choices: [{ label: '식사', options: ['김치찌개', '된장찌개'] }] }],
    ]);
    const result = await makeService(
      { name: '도원반점', menus: [{ ...course, price: '35,000원' }] },
      { compositions: compositions.service },
    ).forPlace('place-1');
    expect(result!.pending).toBeUndefined();
    expect(result!.menus).toEqual([
      {
        menuName: '이 코스(2인이상)',
        price: 35000,
        recommend: false,
        foods: [
          // 엔진이 같은 음식으로 본 것은 표준명·분류, 열량은 '조금'만큼.
          { name: '돈가스', foodId: 'id-돈가스', dishType: 'fried', mainIngredient: 'pork', cuisine: 'japanese', isMain: true, kcal: 390, portion: 'small' },
          { name: '우동', foodId: 'id-우동', dishType: 'noodle', mainIngredient: 'grain', cuisine: 'japanese', isMain: true, kcal: 252, portion: 'small' },
          // 카탈로그에 없는 구성은 적힌 이름 그대로.
          { name: '꽃빵', foodId: null, dishType: null, mainIngredient: null, cuisine: null, isMain: true, kcal: null, portion: 'small' },
        ],
        choices: [
          {
            label: '식사',
            options: [
              { name: '김치찌개', foodId: 'id-김치찌개', dishType: 'stew', mainIngredient: 'pork', cuisine: 'korean', isMain: true, kcal: 144, portion: 'small' },
              // 카탈로그 픽스처의 주재료('bean')는 계약의 분류에 없는 값이라 비어 온다.
              { name: '된장찌개', foodId: 'id-된장찌개', dishType: 'stew', mainIngredient: null, cuisine: 'korean', isMain: true, kcal: 108, portion: 'small' },
            ],
          },
        ],
      },
    ]);
    expect(compositions.asked).toHaveLength(0);
  });

  it('코스가 아닌 세트는 1인분으로, 이름에 적힌 대안은 고르는 것만 있는 메뉴로', async () => {
    const set = { name: '점심 세트', description: '수제돈까스 + 콜라' };
    const pick = { name: '음료수(콜라,사이다)', description: null };
    const compositions = fakeCompositions([
      [set, { fixed: ['수제돈까스', '콜라'], choices: [] }],
      [pick, { fixed: [], choices: [{ label: null, options: ['콜라', '사이다'] }] }],
    ]);
    const menus = (await makeService(
      { name: '숯토리', menus: [set, pick] },
      { compositions: compositions.service },
    ).forPlace('place-1'))!.menus;
    expect(menus[0]).toMatchObject({
      menuName: '점심 세트',
      foods: [
        { name: '돈가스', kcal: 650, isMain: true },
        { name: '콜라', kcal: 105, isMain: false },
      ],
    });
    expect(menus[0]!.foods.every((food) => food.portion === undefined)).toBe(true);
    expect(menus[0]!.choices).toBeUndefined();
    expect(menus[1]).toMatchObject({
      menuName: '음료수(콜라,사이다)',
      foods: [],
      choices: [{ label: null, options: [{ name: '콜라' }, { name: '사이다' }] }],
    });
  });

  it('표준명으로 바꾸면 같은 음식이 되는 선택지는 합친다 — 하나만 남으면 정해진 구성', async () => {
    const line = { name: '찌개 정식', description: '수제돈까스 + 김치찌개 or 묵은지 김치찌개' };
    const compositions = fakeCompositions([
      [line, { fixed: ['수제돈까스'], choices: [{ label: null, options: ['김치찌개', '김치 찌개'] }] }],
    ]);
    const [menu] = (await makeService({ name: '숯토리', menus: [line] }, { compositions: compositions.service }).forPlace(
      'place-1',
    ))!.menus;
    expect(menu!.foods.map((food) => food.name)).toEqual(['돈가스', '김치찌개']);
    expect(menu!.choices).toBeUndefined();
  });

  it('정해진 구성이 표준명으로는 선택지와 같은 음식이 되어도 고르는 묶음은 남는다 — 그 구성은 적힌 이름으로', async () => {
    // 운영 사례: "…+백짬뽕+(짜장,짬뽕 택1)" — 백짬뽕이 표준명 짬뽕이 되며 택1 의 짬뽕과 겹쳤다.
    const line = { name: '여 코스', description: '수제돈까스 + 특곰탕 + (곰탕, 우동 택1)' };
    const compositions = fakeCompositions([
      [line, { fixed: ['수제돈까스', '특곰탕'], choices: [{ label: null, options: ['곰탕', '우동'] }] }],
    ]);
    const [menu] = (await makeService({ name: '숯토리', menus: [line] }, { compositions: compositions.service }).forPlace(
      'place-1',
    ))!.menus;
    expect(menu!.foods).toMatchObject([
      { name: '돈가스', foodId: 'id-돈가스' },
      // 곰탕의 열량은 빌리되, 이름은 적힌 그대로(카탈로그 연결 없이).
      { name: '특곰탕', foodId: null, dishType: null, kcal: 198, portion: 'small' },
    ]);
    expect(menu!.choices).toMatchObject([{ options: [{ name: '곰탕', kcal: 198 }, { name: '우동', kcal: 252 }] }]);
  });

  it('구성이 없다고 판정된 메뉴와 표식 없는 메뉴는 메뉴 한 줄 그대로 — 엔진이 이은 메뉴는 구성을 보지 않는다', async () => {
    const promo = { name: '오늘의 요리 or 특선', description: '주방장 추천' };
    const known = { name: '김치찌개', description: '돼지고기 + 두부 + 묵은지' };
    const compositions = fakeCompositions([[promo, null]]);
    const menus = (await makeService(
      { name: '숯토리', menus: [promo, known, { name: '어향완자가지', description: '깊은 맛' }] },
      { compositions: compositions.service },
    ).forPlace('place-1'))!.menus;
    expect(menus.map((m) => m.foods.map((f) => f.name))).toEqual([['오늘의 요리 or 특선'], ['김치찌개'], ['어향완자가지']]);
    expect(menus.every((m) => m.choices === undefined)).toBe(true);
    expect(compositions.asked).toHaveLength(0);
  });

  it("가격 칸이 '무료'인 안내문은 구성으로 읽지 않는다", async () => {
    const notice = { name: '*화덕의 특별함*', description: '매장에서 식사시 순두부찌개 + 쟁반국수or고르곤졸라피자 제공', price: '무료' };
    const compositions = fakeCompositions([]);
    const result = await makeService({ name: '족발집', menus: [notice] }, { compositions: compositions.service }).forPlace('place-1');
    expect(result!.menus[0]!.foods).toHaveLength(1);
    expect(result!.pending).toBeUndefined();
    expect(compositions.asked).toHaveLength(0);
  });

  it('아직 읽지 않은 글이 있으면 pending 으로 답하고 백그라운드로 읽는다 — 읽고 나면 구성으로 온다', async () => {
    const compositions = fakeCompositions([]);
    let release = (): void => undefined;
    const reading = new Promise<void>((resolve) => {
      release = resolve;
    });
    const asked: string[] = [];
    const service = makeService(
      { name: '도원반점', menus: [course] },
      {
        compositions: {
          lookupCached: compositions.service.lookupCached,
          readMany: async (lines: MenuLine[]) => {
            await reading;
            const fresh = new Map<string, MenuComposition | null>();
            for (const line of lines) {
              const key = compositionKey(line.name, line.description);
              const value = { fixed: ['수제돈까스', '꽃빵'], choices: [] };
              compositions.cache.set(key, value);
              fresh.set(key, value);
            }
            return fresh;
          },
        },
        estimator: {
          // 꽃빵만 아직 안 물어본 이름.
          lookup: async (name: string) => ({ estimate: null, askable: name === '꽃빵' }),
          ask: async (names: string[]) => {
            asked.push(...names);
          },
        },
      },
    );
    const first = await service.forPlace('place-1');
    expect(first!.pending).toBe(true);
    expect(first!.menus[0]!.foods.map((f) => f.name)).toEqual(['이 코스']);
    // 읽는 동안 다시 불러도 새로 시작하지 않고 pending 그대로.
    expect((await service.forPlace('place-1'))!.pending).toBe(true);

    release();
    await vi.waitFor(async () => {
      expect((await service.forPlace('place-1'))!.pending).toBeUndefined();
    });
    const done = await service.forPlace('place-1');
    expect(done!.menus[0]!.foods.map((f) => [f.name, f.portion])).toEqual([
      ['돈가스', 'small'],
      ['꽃빵', 'small'],
    ]);
    // 읽은 구성 가운데 열량을 모르는 이름만 미리 물어 둔다.
    expect(asked).toEqual(['꽃빵']);
  });

  it('한 줄도 못 읽었으면(LLM 미설정) 그 식당은 한동안 pending 을 주지 않는다', async () => {
    const compositions = fakeCompositions([]);
    const service = makeService({ name: '도원반점', menus: [course] }, { compositions: compositions.service });
    expect((await service.forPlace('place-1'))!.pending).toBe(true);
    await vi.waitFor(async () => {
      expect((await service.forPlace('place-1'))!.pending).toBeUndefined();
    });
    expect(compositions.asked).toHaveLength(1);
  });
});
