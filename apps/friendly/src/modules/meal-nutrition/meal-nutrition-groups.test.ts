import { describe, expect, it } from 'vitest';
import { serializeNutrientsPer100g, type NutrientsPer100g } from '../food/food-nutrients.js';
import { groupMealNutrition, type GroupItem } from './meal-nutrition-groups.js';
import type { AnalysisCatalogRow } from './meal-nutrition.service.js';

// 통계의 묶음별 영양 몫 — 몫은 이 기간 내가 먹은 양 중 그 묶음 몫(반찬 포함, 다 더하면 100%), 탄수화물·지방은 카탈로그
// 1인분의 열량당 비율 × 먹은 열량, 비타민·무기질은 영양소 점검과 같은 풀이, 열량 몫보다 크게 채운 것만 '많이 채운'.

const row = (
  id: string,
  name: string,
  kcal: number,
  servingG: number,
  over: Partial<AnalysisCatalogRow> & { per100?: NutrientsPer100g } = {},
): AnalysisCatalogRow => {
  const { per100, ...rest } = over;
  return {
    id,
    name,
    source: 'mfds-nutrition',
    sourceCategory: null,
    dishType: null,
    servingG,
    kcal,
    kcalPer100g: (kcal * 100) / servingG,
    proteinG: null,
    sodiumMg: null,
    nutritionFrom: null,
    nutrientsPer100gJson: per100 ? serializeNutrientsPer100g(per100) : null,
    carbG: null,
    fatG: null,
    ...rest,
  };
};

const ROWS = new Map<string, AnalysisCatalogRow>([
  // 치킨 1인분 500kcal(250g) — 지방 30g·탄수화물 20g, 100g당 니아신 8mg.
  ['chicken', row('chicken', '치킨', 500, 250, { fatG: 30, carbG: 20, per100: { niacinMg: 8 } })],
  // 라면 1인분 500kcal(550g) — 지방 16g·탄수화물 80g, 100g당 칼슘 10mg.
  ['ramen', row('ramen', '라면', 500, 550, { fatG: 16, carbG: 80, per100: { calciumMg: 10 } })],
  // 배추김치 1회 20kcal(50g) — 100g당 비타민 C 20mg·칼슘 40mg.
  ['kimchi', row('kimchi', '배추김치', 20, 50, { fatG: 0.5, carbG: 3, per100: { vitaminCMg: 20, calciumMg: 40 } })],
]);

const item = (over: Partial<GroupItem>): GroupItem => ({
  eatenDate: '2026-11-01',
  entryId: 'e1',
  name: '음식',
  foodId: null,
  dishType: null,
  mainIngredient: null,
  cuisine: null,
  isMain: true,
  kcal: null,
  proteinG: null,
  sodiumMg: null,
  ...over,
});

const ITEMS: GroupItem[] = [
  // 치킨 두 마리 몫(1,000kcal) — 지방 1,000 × 30/500 = 60g.
  item({ name: '치킨', foodId: 'chicken', dishType: 'fried', mainIngredient: 'chicken', cuisine: 'korean', kcal: 1000, proteinG: 80, sodiumMg: 1200 }),
  item({ entryId: 'e2', name: '라면', foodId: 'ramen', dishType: 'noodle', mainIngredient: 'grain', cuisine: 'korean', kcal: 500, proteinG: 10, sodiumMg: 1800 }),
  item({ entryId: 'e2', name: '배추김치', foodId: 'kimchi', dishType: 'kimchi', mainIngredient: 'vegetable', cuisine: 'korean', isMain: false, kcal: 20, proteinG: 1, sodiumMg: 500 }),
  // 열량을 모르는 기록 — 횟수·음식에는 들고 몫에서는 빠진다.
  item({ entryId: 'e3', name: '엄마표 반찬' }),
];

const result = () => groupMealNutrition({ items: ITEMS, rowsById: ROWS, from: '2026-10-10', to: '2026-11-08' });
const group = (key: string) => result().byDishType.find((g) => g.key === key)!;
const share = (key: string, nutrient: string) => group(key).nutrients.find((n) => n.key === nutrient)?.share;

describe('groupMealNutrition', () => {
  it('분모는 이 기간 먹은 양 전체(반찬 포함) — 탄수화물·지방은 카탈로그 1인분의 열량당 비율로 어림한다', () => {
    const r = result();
    expect(r.itemCount).toBe(4);
    expect(r.totals).toEqual([
      { key: 'kcal', label: '열량', unit: 'kcal', amount: 1520 },
      { key: 'carb', label: '탄수화물', unit: 'g', amount: 123 },
      { key: 'protein', label: '단백질', unit: 'g', amount: 91 },
      { key: 'fat', label: '지방', unit: 'g', amount: 76.5 },
      { key: 'sodium', label: '나트륨', unit: 'mg', amount: 3500 },
    ]);
  });

  it('묶음 몫 — 튀김은 열량 66% 인데 지방 78%, 라면은 나트륨 51%·탄수화물 65%', () => {
    expect(share('fried', 'kcal')).toBe(0.658);
    expect(share('fried', 'fat')).toBe(0.784);
    expect(share('noodle', 'sodium')).toBe(0.514);
    expect(share('noodle', 'carb')).toBe(0.65);
    // 묶음 몫을 다 더하면 100%(열량을 아는 기록만).
    const kcalShares = result().byDishType.map((g) => g.nutrients.find((n) => n.key === 'kcal')?.share ?? 0);
    expect(kcalShares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
    expect(group('fried')).toMatchObject({ label: '튀김', mainCount: 1, sideCount: 0, knownCount: 1, macroKnownCount: 1, kcalPerItem: 1000 });
  });

  it('반찬도 그 묶음에 든다 — 김치·절임은 반찬 1번, 비타민 C 를 혼자 채워 열량 몫보다 크게 채운 영양소로', () => {
    const kimchi = group('kimchi');
    expect(kimchi).toMatchObject({ mainCount: 0, sideCount: 1, foods: [{ name: '배추김치', count: 1 }] });
    expect(kimchi.highlights.map((h) => [h.key, h.share])).toEqual([
      ['vitaminC', 1],
      // 칼슘: 라면 55mg + 김치 20mg — 김치 몫 27%.
      ['calcium', 0.267],
    ]);
    // 치킨의 니아신 — 열량 몫(66%)보다 커서(100%) 많이 채운 영양소.
    expect(group('fried').highlights.map((h) => h.key)).toEqual(['niacin']);
    // 라면의 칼슘 73% 는 열량 몫(33%)의 1.2 배를 넘는다.
    expect(group('noodle').highlights.map((h) => h.key)).toEqual(['calcium']);
  });

  it('열량을 모르는 기록·분류가 없는 기록은 미분류 — 횟수만 세고 몫은 없다', () => {
    const unknown = group('unknown');
    expect(unknown).toMatchObject({ label: '미분류', mainCount: 1, knownCount: 0, kcalPerItem: null, nutrients: [], highlights: [] });
    // 다른 축도 같은 규칙.
    expect(result().byMainIngredient.find((g) => g.key === 'chicken')).toMatchObject({ label: '닭', mainCount: 1 });
    expect(result().byCuisine.find((g) => g.key === 'korean')).toMatchObject({ mainCount: 2, sideCount: 1 });
  });

  it('열량 구성 — 탄수화물·단백질·지방(4·4·9kcal) 비율, 내 평균도 같은 규칙', () => {
    // 치킨: 탄수화물 40g(160) · 단백질 80g(320) · 지방 60g(540) = 1,020kcal.
    expect(group('fried').composition).toEqual({ carb: 0.157, protein: 0.314, fat: 0.529, count: 1 });
    // 내 평균: 탄수화물 492 · 단백질 364 · 지방 688.5kcal(치킨·라면·김치).
    expect(result().composition).toEqual({ carb: 0.319, protein: 0.236, fat: 0.446, count: 3 });
    expect(group('unknown').composition).toBeNull();
  });

  it('열량 구성은 셋을 다 아는 기록만 — 단백질만 아는 기록은 몫에는 들고 구성에서는 빠진다', () => {
    const r = groupMealNutrition({
      items: [
        item({ name: '라면', foodId: 'ramen', dishType: 'rice', kcal: 500, proteinG: 10, sodiumMg: 1800 }),
        // 카탈로그에 없는 이름 — 단백질 스냅샷만 있고 탄수화물·지방을 모른다.
        item({ entryId: 'e2', name: '엄마표 볶음밥', dishType: 'rice', kcal: 300, proteinG: 30, sodiumMg: 600 }),
      ],
      rowsById: ROWS,
      from: '2026-10-10',
      to: '2026-11-08',
    });
    const rice = r.byDishType.find((g) => g.key === 'rice')!;
    // 라면만: 탄수화물 320 · 단백질 40 · 지방 144kcal.
    expect(rice.composition).toEqual({ carb: 0.635, protein: 0.079, fat: 0.286, count: 1 });
    expect(rice.nutrients.find((n) => n.key === 'protein')?.amount).toBe(40);
  });
});
