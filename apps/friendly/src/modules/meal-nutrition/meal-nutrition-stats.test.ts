import { describe, expect, it } from 'vitest';
import { serializeNutrientsPer100g, type NutrientsPer100g } from '../food/food-nutrients.js';
import { NUTRIENT_DEFS } from './meal-nutrition.defs.js';
import { statsMealNutrients } from './meal-nutrition-stats.js';
import {
  analyzeMealNutrition,
  profileFrom,
  type AnalysisCatalogRow,
  type AnalysisItem,
} from './meal-nutrition.service.js';

// 통계의 영양소별 하루 평균 — 하루 평균·판정은 영양소 점검을 이 기간에 돌린 값 그대로(두 끼 이상 기록한 날), 점검 밖
// 성분(탄수화물·당류·지방·포화지방·콜레스테롤)은 같은 풀이로 더하고, 흐름은 모든 날, 열량 중 비율·많이 준 음식은 기간의
// 모든 기록에서 낸다.

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
    sugarG: null,
    ...rest,
  };
};

const ROWS = new Map<string, AnalysisCatalogRow>([
  // 라면 1인분 500kcal(550g → 먹은 양은 100g 의 5.5배) — 탄수화물 80g·지방 16g·당류 4g, 100g당 칼슘 10mg·포화지방 2g·
  // 콜레스테롤 2mg.
  [
    'ramen',
    row('ramen', '라면', 500, 550, {
      carbG: 80,
      fatG: 16,
      sugarG: 4,
      per100: { calciumMg: 10, saturatedFatG: 2, cholesterolMg: 2 },
    }),
  ],
  // 계란말이 1인분 200kcal(100g) — 탄수화물 4g·지방 14g, 100g당 칼슘 50mg·콜레스테롤 400mg(당류·포화지방 모름).
  ['egg', row('egg', '계란말이', 200, 100, { carbG: 4, fatG: 14, per100: { calciumMg: 50, cholesterolMg: 400 } })],
]);

const item = (
  eatenDate: string,
  entryId: string,
  foodId: 'ramen' | 'egg',
  kcal: number,
  proteinG: number,
  sodiumMg: number,
): AnalysisItem => ({
  eatenDate,
  entryId,
  name: foodId === 'ramen' ? '라면' : '계란말이',
  foodId,
  dishType: null,
  kcal,
  proteinG,
  sodiumMg,
});

// 11/1~4 는 두 끼(점심 라면+계란말이, 저녁 라면), 11/5 는 한 끼(라면), 11/6 은 기록 없음.
const ITEMS: AnalysisItem[] = [
  ...['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'].flatMap((d) => [
    item(d, `${d}-l`, 'ramen', 500, 10, 1800),
    item(d, `${d}-l`, 'egg', 200, 12, 300),
    item(d, `${d}-d`, 'ramen', 500, 10, 1800),
  ]),
  item('2026-11-05', '2026-11-05-l', 'ramen', 500, 10, 1800),
];
const FROM = '2026-11-01';
const TO = '2026-11-06';
const adult = profileFrom(null, null, TO);

const run = (items = ITEMS, profile = adult) => statsMealNutrients({ items, rowsById: ROWS, profile, from: FROM, to: TO });
const rowOf = (r: ReturnType<typeof run>, key: string) => r.rows.find((x) => x.key === key)!;

describe('statsMealNutrients', () => {
  it('하루 평균·판정은 같은 기간 영양소 점검과 같다 — 두 끼 이상 기록한 날만', () => {
    const r = run();
    const analysis = analyzeMealNutrition({ items: ITEMS, rowsById: ROWS, profile: adult, from: FROM, to: TO, days: 6 });
    expect(r).toMatchObject({ days: 6, analyzedDays: 4, status: 'ok', insufficientReason: null });
    expect(r.dates).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(r.meals).toEqual([2, 2, 2, 2, 1, 0]);
    expect(r.skipped).toEqual([0, 0, 0, 0, 0, 0]);
    expect(r.counted).toEqual([true, true, true, true, false, false]);
    for (const n of analysis.nutrients) {
      const s = rowOf(r, n.key);
      expect([s.intakePerDay, s.percent, s.status, s.coverage, s.recordGap]).toEqual([
        n.intakePerDay,
        n.percent,
        n.status,
        n.coverage,
        n.recordGap,
      ]);
    }
    // 하루 1,200kcal(라면 둘 + 계란말이) — 11/5 의 한 끼는 평균에 안 든다. 기준은 30-49세 남녀 중 낮은 필요량.
    expect(rowOf(r, 'kcal')).toMatchObject({
      intakePerDay: 1200,
      reference: { kind: 'eer', amount: analysis.energy.requirement },
      percent: analysis.energy.percent,
      status: null,
    });
    // 나트륨 3,900mg — 만성질환위험감소섭취량 2,300mg 를 넘어 많음.
    expect(rowOf(r, 'sodium')).toMatchObject({ intakePerDay: 3900, status: 'high', reference: { kind: 'cdrr', amount: 2300 } });
    expect(r.rows).toHaveLength(6 + NUTRIENT_DEFS.length);
  });

  it('차례와 묶음 — 위 묶음(열량·탄수화물·당류·단백질·지방·포화지방·나트륨·콜레스테롤) 다음 식이섬유·비타민·무기질', () => {
    const r = run();
    expect(r.rows.filter((x) => x.group === 'core').map((x) => x.key)).toEqual([
      'kcal',
      'carb',
      'sugar',
      'protein',
      'fat',
      'saturatedFat',
      'sodium',
      'cholesterol',
    ]);
    expect(r.rows.find((x) => x.group === 'micro')?.key).toBe('fiber');
    expect([rowOf(r, 'sugar').parent, rowOf(r, 'saturatedFat').parent, rowOf(r, 'carb').parent]).toEqual(['carb', 'fat', null]);
  });

  it('점검 밖 성분 — 카탈로그 1인분 비율(탄수화물·지방·당류)·100g당 값(포화지방·콜레스테롤)으로, 판정 없이 양과 열량 중 비율', () => {
    const r = run();
    // 탄수화물 80 + 80 + 4 = 164g, 지방 16 + 16 + 14 = 46g.
    expect(rowOf(r, 'carb')).toMatchObject({ intakePerDay: 164, coverage: 1, status: null, reference: null });
    expect(rowOf(r, 'fat')).toMatchObject({ intakePerDay: 46, coverage: 1 });
    // 당류는 라면만 안다 — 하루 8g, 정보 비율은 하루 1,200kcal 중 1,000kcal.
    expect(rowOf(r, 'sugar')).toMatchObject({ intakePerDay: 8, coverage: 0.83 });
    // 포화지방 100g당 2g × 5.5 = 라면 하나 11g → 하루 22g. 콜레스테롤 라면 11mg 둘 + 계란말이 400mg = 422mg.
    expect(rowOf(r, 'saturatedFat')).toMatchObject({ intakePerDay: 22, coverage: 0.83 });
    expect(rowOf(r, 'cholesterol')).toMatchObject({ intakePerDay: 422, coverage: 1, energyShare: null });

    // 열량 중 비율 — 기간의 모든 기록(라면 9 · 계란말이 4)에서, 탄·단·지는 셋을 다 아는 기록의 열량 구성.
    // 탄수화물 9×320 + 4×16 = 2,944 · 단백질 9×40 + 4×48 = 552 · 지방 9×144 + 4×126 = 1,800 kcal (합 5,296).
    expect(rowOf(r, 'carb').energyShare).toBe(0.556);
    expect(rowOf(r, 'protein').energyShare).toBe(0.104);
    expect(rowOf(r, 'fat').energyShare).toBe(0.34);
    // 당류 4g×4kcal ÷ 라면 500kcal, 포화지방 11g×9kcal ÷ 500kcal — 값을 아는 기록의 열량이 분모.
    expect(rowOf(r, 'sugar').energyShare).toBe(0.032);
    expect(rowOf(r, 'saturatedFat').energyShare).toBe(0.198);
    // 에너지적정비율(2020) — 성인은 포화지방 7% 미만까지.
    expect(rowOf(r, 'carb').energyRange).toEqual({ min: 0.55, max: 0.65 });
    expect(rowOf(r, 'fat').energyRange).toEqual({ min: 0.15, max: 0.3 });
    expect(rowOf(r, 'protein').energyRange).toEqual({ min: 0.07, max: 0.2 });
    expect(rowOf(r, 'saturatedFat').energyRange).toEqual({ min: null, max: 0.07 });
    expect(rowOf(r, 'sugar').energyRange).toBeNull();
  });

  it('흐름은 모든 날 — 한 끼만 기록한 날도 값, 기록이 없는 날·값을 모르는 날은 null', () => {
    const r = run();
    expect(rowOf(r, 'kcal').daily).toEqual([1200, 1200, 1200, 1200, 500, null]);
    expect(rowOf(r, 'sodium').daily).toEqual([3900, 3900, 3900, 3900, 1800, null]);
    // 계란말이는 당류를 몰라 그날 라면 몫만.
    expect(rowOf(r, 'sugar').daily).toEqual([8, 8, 8, 8, 4, null]);
  });

  it('많이 준 음식 — 기간의 모든 기록에서 그 영양소 몫과 먹은 횟수(최대 5)', () => {
    const r = run();
    // 나트륨: 라면 9 × 1,800 = 16,200 · 계란말이 4 × 300 = 1,200 (합 17,400).
    expect(rowOf(r, 'sodium').topFoods).toEqual([
      { name: '라면', share: 0.931, count: 9 },
      { name: '계란말이', share: 0.069, count: 4 },
    ]);
    // 콜레스테롤: 계란말이 4 × 400 = 1,600 · 라면 9 × 11 = 99.
    expect(rowOf(r, 'cholesterol').topFoods.map((f) => f.name)).toEqual(['계란말이', '라면']);
  });

  it("한 끼만 적은 날도 나머지를 '안 먹음'으로 표시하면 평균에 든다 — counted·skipped 로 화면에 알린다", () => {
    const r = statsMealNutrients({
      items: ITEMS,
      rowsById: ROWS,
      profile: adult,
      from: FROM,
      to: TO,
      skipsByDate: new Map([
        ['2026-11-05', 2],
        ['2026-11-06', 1],
      ]),
    });
    expect(r.skipped).toEqual([0, 0, 0, 0, 2, 1]);
    // 11/6 은 기록이 없어 표시만으로는 넣지 않는다.
    expect(r.counted).toEqual([true, true, true, true, true, false]);
    expect(r.analyzedDays).toBe(5);
    // 하루 평균 열량 — (1,200 × 4 + 500) ÷ 5.
    expect(rowOf(r, 'kcal').intakePerDay).toBe(1060);
    // 많이 준 음식·흐름은 그대로(모든 기록).
    expect(rowOf(r, 'kcal').daily).toEqual([1200, 1200, 1200, 1200, 500, null]);
  });

  it('두 끼 이상 기록한 날이 4일 미만이면 판정은 보류 — 양은 그대로 준다', () => {
    const few = ITEMS.filter((it) => it.eatenDate !== '2026-11-04');
    const r = run(few);
    expect(r).toMatchObject({ analyzedDays: 3, status: 'insufficient' });
    expect(r.insufficientReason).toContain('두 끼 이상 기록한 날이 3일');
    expect(rowOf(r, 'sodium')).toMatchObject({ intakePerDay: 3900, status: 'unknown' });
    expect(rowOf(r, 'carb').intakePerDay).toBe(164);
  });

  it('탄단지를 모르는 행은 탄단지 기준 음식의 열량당 비율로 — 비타민만 빌린 공기밥은 쌀밥의 탄수화물·지방으로', () => {
    // 공기밥 1인분 349kcal(210g) — 비타민은 있고(쌀밥에서 빌림) 탄수화물·지방은 비어 있다. 쌀밥 100g 166kcal: 탄 37.3g·지 0.3g.
    const rows = new Map<string, AnalysisCatalogRow>([
      ['gongi', row('gongi', '공기밥', 349, 210, { per100: { calciumMg: 3 } })],
    ]);
    const macroRowsByName = new Map<string, AnalysisCatalogRow>([
      ['공기밥', row('rice', '쌀밥', 166, 100, { carbG: 37.3, fatG: 0.3, per100: { calciumMg: 3, saturatedFatG: 0.1 } })],
    ]);
    const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'];
    const items: AnalysisItem[] = days.flatMap((d) =>
      ['l', 'd'].map((s) => ({
        eatenDate: d,
        entryId: `${d}-${s}`,
        name: '공기밥',
        foodId: 'gongi',
        dishType: null,
        kcal: 300,
        proteinG: 5,
        sodiumMg: 2,
      })),
    );
    const base = statsMealNutrients({ items, rowsById: rows, profile: adult, from: '2026-11-01', to: '2026-11-04' });
    expect(rowOf(base, 'carb')).toMatchObject({ intakePerDay: null, coverage: 0 });
    const r = statsMealNutrients({
      items,
      rowsById: rows,
      macroRowsByName,
      profile: adult,
      from: '2026-11-01',
      to: '2026-11-04',
    });
    // 하루 두 공기(600kcal) × 쌀밥 탄수화물 37.3g/166kcal = 134.8g, 지방 1.08g.
    expect(rowOf(r, 'carb')).toMatchObject({ intakePerDay: 135, coverage: 1 });
    expect(rowOf(r, 'fat')).toMatchObject({ intakePerDay: 1.08, coverage: 1 });
    // 포화지방도 행 자신이 모르면 같은 기준 음식의 100g당 값 × 먹은 양.
    expect(rowOf(r, 'saturatedFat').intakePerDay).toBe(0.36);
    // 비타민 풀이는 그대로 행 자신(공기밥)의 값 — 칼슘 하루 600kcal ÷ 166kcal × 3mg.
    expect(rowOf(r, 'calcium').intakePerDay).toBe(rowOf(base, 'calcium').intakePerDay);
  });

  it('1인분이 없는 원재료는 100g당 탄수화물·지방으로 — 광어회(넙치 100g 137kcal: 탄 0g·지 6g)', () => {
    const rows = new Map<string, AnalysisCatalogRow>([
      [
        'fish',
        {
          ...row('fish', '넙치', 0, 100, { per100: { calciumMg: 61, carbG: 0, fatG: 6, proteinG: 20 } }),
          kcal: null,
          servingG: null,
          kcalPer100g: 137,
        },
      ],
    ]);
    const items: AnalysisItem[] = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'].flatMap((d) =>
      ['l', 'd'].map((s) => ({
        eatenDate: d,
        entryId: `${d}-${s}`,
        name: '광어회',
        foodId: 'fish',
        dishType: null,
        kcal: 274,
        proteinG: 40,
        sodiumMg: 100,
      })),
    );
    const r = statsMealNutrients({ items, rowsById: rows, profile: adult, from: '2026-11-01', to: '2026-11-04' });
    // 하루 두 접시(548kcal) × 지방 6g/137kcal = 24g, 탄수화물 0g.
    expect(rowOf(r, 'fat')).toMatchObject({ intakePerDay: 24, coverage: 1 });
    expect(rowOf(r, 'carb')).toMatchObject({ intakePerDay: 0, coverage: 1 });
    // 열량 구성 — 단백질 40g×4 = 160 · 지방 12g×9 = 108 (한 접시).
    expect(rowOf(r, 'fat').energyShare).toBe(0.403);
  });

  it('청소년은 포화지방 성인 기준을 붙이지 않고, 만 12세 미만은 적정 비율을 아예 붙이지 않는다', () => {
    const teen = run(ITEMS, profileFrom('female', 2010, TO));
    expect(rowOf(teen, 'saturatedFat').energyRange).toBeNull();
    expect(rowOf(teen, 'carb').energyRange).toEqual({ min: 0.55, max: 0.65 });
    const child = run(ITEMS, profileFrom('female', 2018, TO));
    expect(child.status).toBe('insufficient');
    expect(child.rows.every((x) => x.energyRange === null)).toBe(true);
  });
});
