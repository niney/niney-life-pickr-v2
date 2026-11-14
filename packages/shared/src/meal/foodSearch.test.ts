import { describe, expect, it } from 'vitest';
import type { FoodSearchItemType, FrequentMealItemType, MealEntryType } from '@repo/api-contract';
import {
  mealCatalogSub,
  mealFoodSearchTerm,
  mealItemReplacePatch,
  mealQuickFromCatalog,
  mealQuickFromEntryItem,
  mealQuickFromTyped,
  mealQuickSub,
  pickRecentMeals,
  splitMealFoodResults,
} from './foodSearch';

// 음식 찾기 시트 규칙(웹 휴대폰·앱 공통) — 앱에는 테스트 러너가 없어 여기서 고정한다.

const food = (over: Partial<FoodSearchItemType>): FoodSearchItemType => ({
  id: 'f-stew',
  name: '김치찌개',
  repName: null,
  dishType: 'stew',
  mainIngredient: 'pork',
  cuisine: 'korean',
  popularity: 9,
  servingKcal: 450,
  myCount: 0,
  ...over,
});

const quick = (over: Partial<FrequentMealItemType>): FrequentMealItemType => ({
  name: '제육볶음',
  foodId: 'f-jeyuk',
  dishType: 'stir_fry',
  mainIngredient: 'pork',
  cuisine: 'korean',
  isMain: true,
  portion: null,
  servings: null,
  portionSource: null,
  count: 4,
  lastEatenDate: '2026-11-07',
  from: 'history',
  kcal: 610,
  ...over,
});

const entryItem = (name: string, kcal: number | null): MealEntryType['items'][number] => ({
  id: `i-${name}`,
  name,
  foodId: null,
  dishType: null,
  mainIngredient: null,
  cuisine: null,
  portion: 'large',
  servings: null,
  portionSource: 'vision_ordinal',
  isMain: false,
  confidence: null,
  recognitionDishId: null,
  selectedCandidateRank: null,
  catalogMatchedBy: 'none',
  catalogMatchScore: null,
  source: 'manual',
  menuName: null,
  menuPrice: null,
  sortOrder: 0,
  kcal,
  proteinG: null,
  sodiumMg: null,
  nutritionFrom: null,
  nutritionBasis: kcal === null ? 'missing' : 'direct',
});

const entry = (
  id: string,
  eatenDate: string,
  slot: MealEntryType['slot'],
  items: MealEntryType['items'],
): MealEntryType => ({
  id,
  eatenAt: `${eatenDate}T03:00:00.000Z`,
  eatenDate,
  slot,
  mealType: null,
  placeId: null,
  placeName: null,
  memo: null,
  source: 'manual',
  originRecommendationId: null,
  items,
  photos: [],
  recognition: null,
  photoPurgedAt: null,
  createdAt: `${eatenDate}T03:00:00.000Z`,
  updatedAt: `${eatenDate}T03:00:00.000Z`,
});

describe('mealFoodSearchTerm', () => {
  it('끝에 붙은 낱자모(한글 조합 중)를 떼고 앞뒤 공백을 지운다', () => {
    expect(mealFoodSearchTerm('김ㅊ')).toBe('김');
    expect(mealFoodSearchTerm('  김치찌 ')).toBe('김치찌');
    expect(mealFoodSearchTerm('김치 ㅉ')).toBe('김치');
    expect(mealFoodSearchTerm('김ㅊ ')).toBe('김');
    expect(mealFoodSearchTerm('ㄱ')).toBe('');
    expect(mealFoodSearchTerm('ㅋㅋ라면')).toBe('ㅋㅋ라면');
  });

  it('서버 한도(40자)까지만 보낸다', () => {
    expect(mealFoodSearchTerm('가'.repeat(60))).toHaveLength(40);
  });
});

describe('넣을 항목 만들기', () => {
  it('음식 목록 — 김치·나물은 반찬으로, 1인분 열량과 내 기록 횟수를 싣는다', () => {
    expect(
      mealQuickFromCatalog(
        food({ id: 'f-kimchi', name: '배추김치', dishType: 'kimchi', servingKcal: 18, myCount: 2 }),
      ),
    ).toMatchObject({
      name: '배추김치',
      foodId: 'f-kimchi',
      isMain: false,
      count: 2,
      kcal: 18,
      from: 'default',
    });
    expect(mealQuickFromCatalog(food({})).isMain).toBe(true);
  });

  it('친 이름 그대로 — 연결 없이 주식으로', () => {
    expect(mealQuickFromTyped('엄마표 김치')).toMatchObject({
      name: '엄마표 김치',
      foodId: null,
      dishType: null,
      isMain: true,
      kcal: null,
    });
  });

  it('지난 끼니 음식 — 그때 양·주식/반찬 그대로', () => {
    expect(mealQuickFromEntryItem(entryItem('계란말이', 150))).toMatchObject({
      name: '계란말이',
      isMain: false,
      portion: 'large',
      portionSource: 'vision_ordinal',
      from: 'history',
      kcal: 150,
    });
  });

  it('줄 바꾸기 — 연결·출처를 고른 것에 맞추고, 인식 계보(recognitionDishId)는 건드리지 않는다', () => {
    const fromCatalog = mealItemReplacePatch(mealQuickFromCatalog(food({})));
    expect(fromCatalog).toMatchObject({
      name: '김치찌개',
      foodId: 'f-stew',
      catalogMatchedBy: 'food_id',
      catalogMatchScore: 1,
      selectedCandidateRank: null,
      source: 'catalog',
    });
    expect('recognitionDishId' in fromCatalog).toBe(false);
    expect(mealItemReplacePatch(mealQuickFromTyped('라면'))).toMatchObject({
      foodId: null,
      catalogMatchedBy: 'none',
      catalogMatchScore: null,
      source: 'manual',
    });
  });
});

describe('보조 문구', () => {
  it('자주 먹은 음식·내 기록 — 횟수·반찬·지난번 양', () => {
    expect(mealQuickSub(quick({ portion: 'large' }))).toBe('4번 · 지난번 많이');
    expect(mealQuickSub(quick({ servings: 1.5 }))).toBe('4번 · 지난번 1.5인분');
    expect(
      mealQuickSub(quick({ from: 'default', count: 0, isMain: false, portion: 'large' })),
    ).toBe('기본 · 반찬');
  });

  it('음식 목록 — 분류·반찬으로·내 기록 횟수', () => {
    expect(mealCatalogSub(food({ dishType: 'kimchi' }))).toBe('김치·절임·젓갈 · 반찬으로');
    expect(mealCatalogSub(food({ myCount: 3 }))).toBe('찌개·전골 · 내 기록 3번');
    expect(mealCatalogSub(food({ dishType: null }))).toBe('');
  });
});

describe('splitMealFoodResults', () => {
  it('내 기록과 같은 음식(foodId·띄어쓰기 무시한 이름)은 음식 목록에서 뺀다', () => {
    const mine = [quick({ name: '김치 볶음밥', foodId: 'f-kbb' })];
    const { catalog } = splitMealFoodResults(
      mine,
      [
        food({ id: 'f-kbb', name: '김치볶음밥(곱빼기)' }),
        food({ id: 'f-other', name: '김치볶음밥' }),
        food({ id: 'f-kimchi', name: '배추김치' }),
      ],
      '김치',
    );
    expect(catalog.map((f) => f.id)).toEqual(['f-kimchi']);
  });

  it('친 이름이 목록에 그대로 있으면 exactKnown — 그대로 넣기 줄을 감춘다', () => {
    expect(
      splitMealFoodResults([quick({ name: '김치볶음밥' })], [], '김치 볶음밥').exactKnown,
    ).toBe(true);
    expect(splitMealFoodResults([], [food({ name: '배추김치' })], '배추김치').exactKnown).toBe(
      true,
    );
    expect(splitMealFoodResults([], [food({ name: '배추김치' })], '김치').exactKnown).toBe(false);
    expect(splitMealFoodResults([], [], '').exactKnown).toBe(false);
  });

  it('exact — 친 이름과 같은 줄을 넣을 항목으로: 내 기록이 먼저(지난번 양), 없으면 음식 목록(김치는 반찬)', () => {
    const mine = [quick({ name: '김치볶음밥', foodId: 'f-kbb', portion: 'large' })];
    const catalog = [
      food({ id: 'f-other', name: '김치 볶음밥' }),
      food({ id: 'f-kimchi', name: '배추김치', dishType: 'kimchi', servingKcal: 18 }),
    ];
    // 내 기록의 줄 그대로 — 음식 목록의 같은 이름이 아니라.
    expect(splitMealFoodResults(mine, catalog, '김치 볶음밥').exact).toBe(mine[0]);
    expect(splitMealFoodResults(mine, catalog, '배추김치').exact).toMatchObject({
      name: '배추김치',
      foodId: 'f-kimchi',
      isMain: false,
      kcal: 18,
    });
    // 일부만 같으면 고른 것으로 보지 않는다.
    expect(splitMealFoodResults(mine, catalog, '김치').exact).toBeNull();
    expect(splitMealFoodResults(mine, catalog, '').exact).toBeNull();
  });
});

describe('pickRecentMeals', () => {
  const today = '2026-11-08';

  it('같은 차림은 가장 최근 한 번만, 음식 없는 기록은 건너뛰고 개수를 자른다', () => {
    const meals = pickRecentMeals(
      [
        entry('e1', '2026-11-07', 'dinner', [
          entryItem('김치찌개', 450),
          entryItem('계란말이', 150),
        ]),
        entry('e2', '2026-11-07', 'lunch', []),
        entry('e3', '2026-11-06', 'dinner', [
          entryItem('계란 말이', 140),
          entryItem('김치찌개', 450),
        ]),
        entry('e4', '2026-11-05', 'breakfast', [entryItem('누룽지', 200)]),
        entry('e5', '2026-11-04', 'breakfast', [entryItem('토스트', 300)]),
      ],
      today,
      2,
    );
    expect(meals.map((m) => m.entry.id)).toEqual(['e1', 'e4']);
    expect(meals[0]).toMatchObject({
      title: '김치찌개, 계란말이',
      sub: '어제 저녁 · 2개',
      kcal: 600,
    });
    expect(meals[1]).toMatchObject({ sub: '3일 전 아침 · 1개' });
  });

  it('셋을 넘는 이름은 "외 n", 열량은 아는 것만 더하고 하나도 모르면 null', () => {
    const [many] = pickRecentMeals(
      [
        entry('e1', today, 'lunch', [
          entryItem('비빔밥', null),
          entryItem('된장국', 80),
          entryItem('배추김치', null),
          entryItem('계란후라이', 90),
          entryItem('식혜', null),
        ]),
      ],
      today,
    );
    expect(many).toMatchObject({
      title: '비빔밥, 된장국, 배추김치 외 2',
      sub: '오늘 점심 · 5개',
      kcal: 170,
    });
    const [unknown] = pickRecentMeals(
      [entry('e2', today, 'snack', [entryItem('떡', null)])],
      today,
    );
    expect(unknown?.kcal).toBeNull();
  });
});
