import { describe, expect, it } from 'vitest';
import type { MealNutrientResultType, MealNutritionAnalysisType } from '@repo/api-contract';
import {
  isSoupLike,
  nutritionFit,
  nutritionSignalsFrom,
  nutritionSignalsKey,
  recommendationSides,
  stripUnsupportedNutrientClaims,
  supportedGapKeys,
  unsupportedNutrients,
  type NutritionSignals,
} from './nutrition-signals.js';

// 식단 추천의 영양 보정 — 영양소 점검 결과 → 신호, 후보 보정, 이유 문장의 영양 주장 검사(순수 함수).

const nutrient = (over: Partial<MealNutrientResultType>): MealNutrientResultType => ({
  key: 'calcium',
  label: '칼슘',
  unit: 'mg',
  intakePerDay: 265,
  reference: { kind: 'rni', amount: 700, ear: 550 },
  upperLimit: 2500,
  percent: 38,
  coverage: 1,
  status: 'low',
  supplementCandidate: true,
  recordGap: false,
  topSources: [],
  foodSuggestions: [],
  sideSuggestions: [],
  typicalFoods: [],
  note: null,
  ...over,
});

const analysisOf = (
  nutrients: MealNutrientResultType[],
  status: 'ok' | 'insufficient' = 'ok',
): MealNutritionAnalysisType => ({
  from: '2026-10-25',
  to: '2026-11-07',
  days: 14,
  analyzedDays: 7,
  mealCount: 18,
  profile: { sex: null, ageGroup: '30-49', basis: 'default' },
  energy: { intakePerDay: 1421, requirement: 1900, percent: 75 },
  coverage: 1,
  status,
  insufficientReason: status === 'ok' ? null : '기록 부족',
  nutrients,
  notMeasured: [],
  notes: [],
});

const SODIUM_HIGH = nutrient({
  key: 'sodium',
  label: '나트륨',
  status: 'high',
  percent: 152,
  reference: { kind: 'cdrr', amount: 2300, ear: null },
  supplementCandidate: false,
});

describe('nutritionSignalsFrom', () => {
  it('나트륨 많음과 부족·조금 부족을 비율 낮은 순으로 — 기록 더 필요·판단 보류·단백질은 뺀다', () => {
    const s = nutritionSignalsFrom(
      analysisOf([
        SODIUM_HIGH,
        nutrient({ key: 'calcium', label: '칼슘', percent: 38 }),
        nutrient({ key: 'vitaminD', label: '비타민 D', percent: 7, reference: { kind: 'ai', amount: 10, ear: null } }),
        nutrient({ key: 'zinc', label: '아연', percent: 84, recordGap: true, supplementCandidate: false }),
        nutrient({ key: 'iron', label: '철', percent: 90, status: 'borderline' }),
        nutrient({ key: 'protein', label: '단백질', percent: 60 }),
        nutrient({ key: 'magnesium', label: '마그네슘', status: 'unknown', percent: null }),
      ]),
    )!;
    expect(s).toMatchObject({ days: 14, sodiumHigh: true, sodiumPercent: 152 });
    expect(s.gaps.map((g) => [g.key, g.weight])).toEqual([
      ['vitaminD', 1],
      ['calcium', 1],
      ['iron', 0.5],
    ]);
    expect(s.gaps[1]).toMatchObject({ per100: 'calciumMg', reference: 700 });
    expect(nutritionSignalsKey(s)).toBe('Na+vitaminD:1,calcium:1,iron:0.5');
  });

  it('기록이 모자라거나 신호가 하나도 없으면 null', () => {
    expect(nutritionSignalsFrom(analysisOf([SODIUM_HIGH], 'insufficient'))).toBeNull();
    expect(nutritionSignalsFrom(analysisOf([nutrient({ status: 'ok', percent: 120, supplementCandidate: false })]))).toBeNull();
    expect(nutritionSignalsFrom(null)).toBeNull();
    expect(nutritionSignalsKey(null)).toBeNull();
  });
});

const SIGNALS: NutritionSignals = {
  days: 14,
  sodiumHigh: true,
  sodiumPercent: 152,
  gaps: [
    { key: 'vitaminD', label: '비타민 D', per100: 'vitaminDUg', reference: 10, percent: 7, weight: 1 },
    { key: 'calcium', label: '칼슘', per100: 'calciumMg', reference: 700, percent: 38, weight: 1 },
  ],
};

describe('nutritionFit', () => {
  it('나트륨이 많은 사람 — 1인분 1,500mg 이상은 감점, 국물(조리형태·이름)은 덜 감점, 700mg 이하는 조금 가점', () => {
    expect(nutritionFit({ dishType: 'noodle', nameNorm: '짬뽕', sodiumMg: 1800 }, SIGNALS).delta).toBeCloseTo(-0.25);
    expect(nutritionFit({ dishType: 'stew', nameNorm: '된장찌개', sodiumMg: 636 }, SIGNALS).delta).toBeCloseTo(-0.15);
    // 조리형태가 밥으로 분류된 국밥도 이름으로 국물.
    expect(isSoupLike({ dishType: 'rice', nameNorm: '순대국밥' })).toBe(true);
    expect(nutritionFit({ dishType: 'rice', nameNorm: '순대국밥', sodiumMg: null }, SIGNALS).delta).toBeCloseTo(-0.15);
    expect(nutritionFit({ dishType: 'grill', nameNorm: '삼치구이', sodiumMg: 434 }, SIGNALS).delta).toBeCloseTo(0.05);
    // 나트륨이 많지 않으면 나트륨으로는 보정하지 않는다.
    expect(nutritionFit({ dishType: 'noodle', nameNorm: '짬뽕', sodiumMg: 1800 }, { ...SIGNALS, sodiumHigh: false }).delta).toBe(0);
  });

  it('부족 영양소를 한 끼에 기준의 25% 이상 채우면 만점 — 가중 평균만큼 가점, 가장 많이 채우는 것을 보충 태그로', () => {
    const fit = nutritionFit(
      { dishType: 'grill', nameNorm: '삼치구이', sodiumMg: null, servingNutrients: { vitaminDUg: 5, calciumMg: 70 } },
      { ...SIGNALS, sodiumHigh: false },
    );
    // 비타민 D 5/10 = 50% → 1, 칼슘 70/700 = 10% → 0.4 — 평균 0.7, 가점 0.3 × 0.7.
    expect(fit).toEqual({ delta: expect.closeTo(0.21, 5), coverage: 0.7, gapTag: '비타민 D 보충' });
    // 1회 분량 영양소를 모르면 중립.
    expect(nutritionFit({ dishType: 'grill', nameNorm: '모름', sodiumMg: null }, { ...SIGNALS, sodiumHigh: false })).toEqual({
      delta: 0,
      coverage: 0,
      gapTag: null,
    });
  });
});

describe('이유 문장의 영양 주장', () => {
  const supported = supportedGapKeys({ servingNutrients: { vitaminDUg: 5, calciumMg: 70 } }, SIGNALS);

  it('그 후보가 기준의 25% 이상 채우는 부족 영양소만 말할 수 있다', () => {
    expect([...supported]).toEqual(['vitaminD']);
    expect([...supportedGapKeys({ servingNutrients: null }, SIGNALS)]).toEqual([]);
    expect([...supportedGapKeys({ servingNutrients: { vitaminDUg: 5 } }, null)]).toEqual([]);
    expect(unsupportedNutrients('비타민 D와 칼슘을 채워요.', supported)).toEqual(['calcium']);
    // '제철'의 철·일반 '비타민'·단백질·나트륨은 보지 않는다.
    expect(unsupportedNutrients('제철 채소로 비타민을 챙기고 단백질도, 나트륨은 낮아요.', new Set())).toEqual([]);
    expect(unsupportedNutrients('철분과 니아신(비타민 B3), 식이섬유가 많아요.', new Set())).toEqual(['niacin', 'iron', 'fiber']);
  });

  it('근거 없는 영양소를 말한 문장만 빼고, 다 빠지면 null', () => {
    expect(stripUnsupportedNutrientClaims('구이를 2주간 안 드셨어요. 비타민 D 도 채울 수 있어요.', supported)).toBe(
      '구이를 2주간 안 드셨어요. 비타민 D 도 채울 수 있어요.',
    );
    expect(stripUnsupportedNutrientClaims('구이를 2주간 안 드셨어요. 칼슘도 풍부해요.', supported)).toBe('구이를 2주간 안 드셨어요.');
    expect(stripUnsupportedNutrientClaims('칼륨 보충으로 비타민 C 부족을 보완해요.', new Set())).toBeNull();
  });
});

// 2026-11-07 흔한 한 끼 중 한 끼로 비타민 C 25%를 채우는 유일한 음식이 훈제오리(1인분 51mg — 첨가물일 수 있는 값)였다.
describe('가공육의 비타민 C', () => {
  const vitaminC: NutritionSignals = {
    days: 14,
    sodiumHigh: false,
    sodiumPercent: 80,
    gaps: [{ key: 'vitaminC', label: '비타민 C', per100: 'vitaminCMg', reference: 100, percent: 19, weight: 1 }],
  };
  const duck = { dishType: 'grill', nameNorm: '훈제오리', sodiumMg: 1220, servingNutrients: { vitaminCMg: 51 } };

  it('보충 가점·태그·이유에서 말할 근거로 세지 않는다', () => {
    expect(nutritionFit(duck, vitaminC)).toEqual({ delta: 0, coverage: 0, gapTag: null });
    expect([...supportedGapKeys(duck, vitaminC)]).toEqual([]);
    // 같은 값이라도 가공육이 아니면 그대로 — 햄버거는 가공육 이름이 아니다.
    expect(nutritionFit({ ...duck, nameNorm: '햄버거' }, vitaminC).gapTag).toBe('비타민 C 보충');
    expect([...supportedGapKeys({ ...duck, nameNorm: '파프리카볶음' }, vitaminC)]).toEqual(['vitaminC']);
  });
});

describe('추천 카드의 곁들임 한 줄', () => {
  // nutritionSignalsFrom 처럼 비율 낮은 순.
  const signals: NutritionSignals = {
    days: 14,
    sodiumHigh: false,
    sodiumPercent: 80,
    gaps: [
      { key: 'vitaminD', label: '비타민 D', per100: 'vitaminDUg', reference: 10, percent: 7, weight: 1 },
      { key: 'vitaminC', label: '비타민 C', per100: 'vitaminCMg', reference: 100, percent: 19, weight: 1 },
      { key: 'magnesium', label: '마그네슘', per100: 'magnesiumMg', reference: 350, percent: 59, weight: 1 },
      { key: 'iron', label: '철', per100: 'ironMg', reference: 10, percent: 60, weight: 1 },
      { key: 'niacin', label: '니아신(비타민 B3)', per100: 'niacinMg', reference: 16, percent: 72, weight: 0.5 },
      { key: 'calcium', label: '칼슘', per100: 'calciumMg', reference: 700, percent: 80, weight: 0.5 },
    ],
  };
  const pool = [
    { nameNorm: '삼치구이', servingNutrients: { vitaminDUg: 5 } },
    { nameNorm: '파프리카', servingNutrients: null },
  ];
  const sides = new Map<string, string[]>([
    ['vitaminD', ['우유']],
    ['vitaminC', ['파프리카', '딸기']],
    ['magnesium', ['파래무침', '두부조림']],
    ['iron', ['파래무침']],
    ['niacin', ['땅콩']],
    ['calcium', ['우유']],
  ]);

  it('고른 음식이 못 채운 부족 영양소마다 첫 곁들임 — 같은 곁들임은 묶고 최대 3개, 괄호 설명은 뗀다', () => {
    // 비타민 D 는 삼치구이가 한 끼로 50% 를 채운다 → 곁들임 없음. 칼슘(우유)은 네 번째라 잘린다.
    expect(recommendationSides([{ name: '삼치구이' }], pool, signals, sides)).toEqual([
      { name: '파프리카', nutrients: ['비타민 C'] },
      { name: '파래무침', nutrients: ['마그네슘', '철'] },
      { name: '땅콩', nutrients: ['니아신'] },
    ]);
  });

  it('이미 고른 음식은 곁들임으로 다시 권하지 않고, 신호·고른 음식이 없으면 비운다', () => {
    // 삼치구이를 안 골랐으니 비타민 D 도 곁들임으로, 3개가 찬 뒤에도 같은 곁들임(우유)이 채우는 칼슘은 묶는다.
    expect(recommendationSides([{ name: '파프리카' }], pool, signals, sides)).toEqual([
      { name: '우유', nutrients: ['비타민 D', '칼슘'] },
      { name: '딸기', nutrients: ['비타민 C'] },
      { name: '파래무침', nutrients: ['마그네슘', '철'] },
    ]);
    expect(recommendationSides([{ name: '삼치구이' }], pool, null, sides)).toEqual([]);
    expect(recommendationSides([], pool, signals, sides)).toEqual([]);
    expect(recommendationSides([{ name: '삼치구이' }], pool, { ...signals, gaps: [] }, sides)).toEqual([]);
  });
});
