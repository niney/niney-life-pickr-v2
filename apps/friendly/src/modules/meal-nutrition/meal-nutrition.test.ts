import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEAL_DATA_DELETE_CONFIRMATION,
  type MealNutrientResultType,
  type MealNutritionAnalysisType,
  type MealStatsNutrientsResultType,
  type MealStatsNutritionResultType,
} from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { AiConfigService, type LlmProviderEnv } from '../ai/ai.config.service.js';
import type { AdapterCache } from '../ai/adapter-cache.js';
import type {
  LLMCompleteOptions,
  LLMCompleteResult,
  LLMProvider,
} from '../ai/adapters/llm-provider.js';
import { serializeNutrientsPer100g, type NutrientsPer100g } from '../food/food-nutrients.js';
import { upsertFoodSeeds } from '../food/food-import.service.js';
import { MealDataService } from '../meal/meal-data.service.js';
import { mealMutationBarrier } from '../meal/meal-mutation-barrier.js';
import { shiftDate } from '../meal-recommendation/meal-pattern.service.js';
import { ageGroupFor, energyRequirement, nutrientReference } from './kdri.js';
import {
  MealNutritionAdviceError,
  MealNutritionAdviceService,
  adviceCandidates,
  adviceOverflowNote,
  adviceVerdict,
  allowedNumbersFor,
  fallbackAdviceItem,
  fallbackSummary,
  sanitizeAdvice,
  textProblem,
} from './meal-nutrition-advice.service.js';
import { NOT_MEASURED_NUTRIENTS, NUTRIENT_DEFS } from './meal-nutrition.defs.js';
import {
  MEAL_NUTRITION_ADVICE_VERSION,
  buildMealNutritionAdviceUserPrompt,
  roundSignificant,
  shortfallOf,
  upperLimitText,
} from './meal-nutrition.prompts.js';
import {
  MealNutritionService,
  analyzeMealNutrition,
  assessNutrient,
  intakeForDisplay,
  profileFrom,
  type AnalysisCatalogRow,
  type AnalysisItem,
} from './meal-nutrition.service.js';

// 영양소 점검 — 섭취기준·판단·분석은 순수 함수로, 조언(LLM)은 FakeProvider 로, 라우트는 격리 DB 로 본다.

const def = (key: string) => NUTRIENT_DEFS.find((d) => d.key === key)!;

describe('kdri', () => {
  it('성별·연령 구간 기준을 그대로 준다', () => {
    expect(nutrientReference('calcium', 'male', '30-49')).toEqual({ ear: 650, rni: 800, ul: 2500 });
    expect(nutrientReference('iron', 'female', '19-29')).toMatchObject({ ear: 11, rni: 14 });
    expect(nutrientReference('vitaminD', 'female', '65-74')).toMatchObject({ ai: 15, ul: 100 });
    expect(nutrientReference('sodium', 'male', '75+')).toMatchObject({ ai: 1100, cdrr: 1700 });
  });

  it('성별을 모르면 남녀 중 낮은 기준으로 본다(부족을 과하게 말하지 않게)', () => {
    expect(nutrientReference('calcium', null, '30-49')).toMatchObject({ ear: 550, rni: 700 });
    expect(nutrientReference('iron', null, '30-49')).toMatchObject({ ear: 8, rni: 10 });
    expect(energyRequirement(null, '30-49')).toBe(1900);
    expect(energyRequirement('male', '30-49')).toBe(2500);
  });

  it('나이 → 연령 구간(만 12세 미만은 판단하지 않음)', () => {
    expect(ageGroupFor(11)).toBeNull();
    expect(ageGroupFor(12)).toBe('12-14');
    expect(ageGroupFor(29)).toBe('19-29');
    expect(ageGroupFor(30)).toBe('30-49');
    expect(ageGroupFor(64)).toBe('50-64');
    expect(ageGroupFor(90)).toBe('75+');
  });

  it('profileFrom — 둘 다 있어야 사용자 기준, 어린이는 판단 보류', () => {
    expect(profileFrom('female', 1990, '2026-10-04')).toMatchObject({
      sex: 'female',
      ageGroup: '30-49',
      basis: 'user',
    });
    expect(profileFrom(null, 1990, '2026-10-04').basis).toBe('default');
    expect(profileFrom('male', null, '2026-10-04')).toMatchObject({ ageGroup: '30-49', basis: 'default' });
    expect(profileFrom('male', 2020, '2026-10-04').unsupportedReason).toContain('12세');
  });
});

describe('assessNutrient', () => {
  const base = { coverage: 1, energyRatio: 1, insufficient: false, produceGap: false };
  const calciumRef = nutrientReference('calcium', 'female', '30-49'); // ear 550 · rni 700 · ul 2500

  it('평균필요량 미만 low · 권장 미만 borderline · 이상 ok · 상한 초과 high', () => {
    const at = (intake: number) => assessNutrient({ ...base, def: def('calcium'), intake, ref: calciumRef });
    expect(at(400)).toMatchObject({ status: 'low', supplementCandidate: true, percent: 57, recordGap: false });
    expect(at(600)).toMatchObject({ status: 'borderline', supplementCandidate: true });
    expect(at(800)).toMatchObject({ status: 'ok', supplementCandidate: false });
    expect(at(3000)).toMatchObject({ status: 'high', supplementCandidate: false });
  });

  it('충분섭취량만 있는 영양소는 70% 아래를 low 로', () => {
    const ref = nutrientReference('vitaminD', 'female', '30-49'); // ai 10
    const at = (intake: number) => assessNutrient({ ...base, def: def('vitaminD'), intake, ref });
    expect(at(6).status).toBe('low');
    expect(at(8).status).toBe('borderline');
    expect(at(8).reference).toEqual({ kind: 'ai', amount: 10, ear: null });
  });

  it('기록 열량이 모자라면 필요량만큼 채워 봐도(최대 2배) 모자랄 때만 조언 대상', () => {
    const half = assessNutrient({
      ...base,
      def: def('calcium'),
      intake: 400,
      ref: calciumRef,
      energyRatio: 0.5,
    });
    // 400 × 2 = 800 ≥ 700 — 기록이 빠졌을 수 있어 조언하지 않고, 화면은 '부족' 대신 '기록 더 필요'(recordGap).
    expect(half).toMatchObject({ status: 'low', supplementCandidate: false, recordGap: true });
    expect(half.note).toContain('빠진 끼니');
  });

  it('기준에 못 미치면 반올림해도 100% 로 보이지 않고, 섭취량도 기준과 같은 숫자로 보이지 않게 한 자리 더', () => {
    const fiber = nutrientReference('fiber', 'female', '30-49'); // ai 20
    expect(assessNutrient({ ...base, def: def('fiber'), intake: 19.95, ref: fiber })).toMatchObject({
      status: 'borderline',
      percent: 99,
    });
    expect(intakeForDisplay(19.8, 20)).toBe(19.8);
    expect(intakeForDisplay(19.96, 20)).toBe(19.96);
    expect(intakeForDisplay(699.6, 700)).toBe(699.6);
    expect(intakeForDisplay(260.4, 700)).toBe(260);
    expect(intakeForDisplay(8.456, 10)).toBe(8.46);
  });

  it('정보가 적거나 기록이 모자라면 unknown, 과일·채소 공백은 해당 영양소만 보류', () => {
    expect(
      assessNutrient({ ...base, def: def('calcium'), intake: 400, ref: calciumRef, coverage: 0.4 }),
    ).toMatchObject({ status: 'unknown', supplementCandidate: false });
    expect(
      assessNutrient({ ...base, def: def('calcium'), intake: 400, ref: calciumRef, insufficient: true })
        .status,
    ).toBe('unknown');
    const vitC = nutrientReference('vitaminC', 'female', '30-49');
    const gap = assessNutrient({ ...base, def: def('vitaminC'), intake: 20, ref: vitC, produceGap: true });
    expect(gap).toMatchObject({ status: 'low', supplementCandidate: false, recordGap: false });
    expect(gap.note).toContain('과일·채소');
    // 칼슘은 과일·채소 공백과 무관.
    expect(
      assessNutrient({ ...base, def: def('calcium'), intake: 400, ref: calciumRef, produceGap: true })
        .supplementCandidate,
    ).toBe(true);
  });

  it('니아신·비타민 A 는 음식만으로 상한을 넘었다고 하지 않는다(상한이 보충제·레티놀 기준)', () => {
    const niacin = nutrientReference('niacin', 'male', '30-49'); // rni 16 · ul 35
    expect(assessNutrient({ ...base, def: def('niacin'), intake: 50, ref: niacin })).toMatchObject({
      status: 'ok',
      upperLimit: 35,
    });
    const vitA = nutrientReference('vitaminA', 'male', '30-49'); // rni 800 · ul 3000
    expect(assessNutrient({ ...base, def: def('vitaminA'), intake: 4000, ref: vitA }).status).toBe('ok');
  });

  it('나트륨은 만성질환위험감소섭취량 초과만 high', () => {
    const ref = nutrientReference('sodium', 'female', '30-49');
    const a = assessNutrient({ ...base, def: def('sodium'), intake: 3200, ref });
    expect(a).toMatchObject({ status: 'high', supplementCandidate: false });
    expect(a.reference.kind).toBe('cdrr');
  });
});

// ── 분석 픽스처: 현미밥(100g 150kcal)·된장찌개(100g 37.5kcal) 를 하루 두 끼씩 ─────────────────
const RICE: NutrientsPer100g = {
  calciumMg: 5,
  ironMg: 0.5,
  vitaminCMg: 0,
  vitaminDUg: 0,
  thiaminMg: 0.1,
  riboflavinMg: 0.02,
  niacinMg: 1.5,
  vitaminAUg: 0,
  fiberG: 1.5,
  potassiumMg: 80,
};
const STEW: NutrientsPer100g = {
  calciumMg: 30,
  ironMg: 0.8,
  vitaminCMg: 3,
  vitaminDUg: 0,
  thiaminMg: 0.05,
  riboflavinMg: 0.05,
  niacinMg: 0.6,
  vitaminAUg: 40,
  fiberG: 1.2,
  potassiumMg: 150,
};
const row = (id: string, name: string, kcal: number, servingG: number, n: NutrientsPer100g | null, over: Partial<AnalysisCatalogRow> = {}): AnalysisCatalogRow => ({
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
  nutrientsPer100gJson: n ? serializeNutrientsPer100g(n) : null,
  ...over,
});
const ROWS = new Map<string, AnalysisCatalogRow>([
  ['rice', row('rice', '현미밥', 300, 200, RICE)],
  ['stew', row('stew', '된장찌개', 150, 400, STEW)],
  ['beer', row('beer', '맥주', 150, 355, null, { dishType: 'alcohol' })],
  ['apple', row('apple', '사과', 57, 100, null, { source: 'mfds-raw', sourceCategory: '과일류' })],
]);
const meal = (date: string, entryId: string, extra: AnalysisItem[] = []): AnalysisItem[] => [
  { eatenDate: date, entryId, name: '현미밥', foodId: 'rice', dishType: 'rice', kcal: 300, proteinG: 6, sodiumMg: 5 },
  { eatenDate: date, entryId, name: '된장찌개', foodId: 'stew', dishType: 'stew', kcal: 150, proteinG: 10, sodiumMg: 1800 },
  ...extra,
];
const days = (n: number, end = '2026-10-04'): string[] =>
  Array.from({ length: n }, (_, i) => shiftDate(end, -i));
const twoMealsPerDay = (n: number): AnalysisItem[] =>
  days(n).flatMap((d) => [...meal(d, `${d}-l`), ...meal(d, `${d}-d`)]);
const analyze = (items: AnalysisItem[], profile = profileFrom(null, null, '2026-10-04')) =>
  analyzeMealNutrition({ items, rowsById: ROWS, profile, from: '2026-09-21', to: '2026-10-04', days: 14 });
const nutrient = (a: MealNutritionAnalysisType, key: string): MealNutrientResultType =>
  a.nutrients.find((n) => n.key === key)!;

describe('analyzeMealNutrition', () => {
  it('두 끼 이상 기록한 날이 4일 미만이면 판단하지 않는다(한 끼만 적은 날은 세지 않음)', () => {
    const items = [...twoMealsPerDay(3), ...meal('2026-09-25', 'only-one')];
    const a = analyze(items);
    expect(a.status).toBe('insufficient');
    expect(a.analyzedDays).toBe(3);
    expect(a.insufficientReason).toContain('4일');
    expect(a.nutrients.every((n) => n.status === 'unknown' && !n.supplementCandidate)).toBe(true);
  });

  it("한 끼만 적은 날도 나머지 끼니를 '안 먹음'으로 표시했으면 평균에 넣는다(기록이 없는 날은 표시만으로는 안 넣는다)", () => {
    const items = [...twoMealsPerDay(3), ...meal('2026-09-25', 'only-one')];
    const a = analyzeMealNutrition({
      items,
      rowsById: ROWS,
      profile: profileFrom(null, null, '2026-10-04'),
      from: '2026-09-21',
      to: '2026-10-04',
      days: 14,
      // 9/25 은 저녁 '안 먹음', 9/24 은 기록 없이 표시만.
      skipsByDate: new Map([
        ['2026-09-25', 1],
        ['2026-09-24', 3],
      ]),
    });
    expect(a).toMatchObject({ status: 'ok', analyzedDays: 4 });
    // 하루 평균 — 두 끼 날 사흘(900kcal) + 한 끼 날 하루(450kcal) ÷ 4.
    expect(a.energy.intakePerDay).toBe(788);
    expect(a.insufficientReason).toBeNull();
  });

  it('먹은 g = 저장 열량 ÷ 100g당 열량 — 하루 평균과 기준 대비를 낸다', () => {
    const a = analyze(twoMealsPerDay(5));
    expect(a.status).toBe('ok');
    expect(a.analyzedDays).toBe(5);
    expect(a.energy).toEqual({ intakePerDay: 900, requirement: 1900, percent: 47 });
    // 끼니당 칼슘: 현미밥 200g → 10mg + 된장찌개 400g → 120mg = 130 → 하루 260mg.
    const ca = nutrient(a, 'calcium');
    expect(ca.intakePerDay).toBe(260);
    expect(ca.reference).toEqual({ kind: 'rni', amount: 700, ear: 550 });
    // 260 × 2(열량 보정 상한) = 520 < 700 → 조언 대상.
    expect(ca).toMatchObject({ status: 'low', supplementCandidate: true, percent: 37 });
    expect(ca.topSources[0]).toBe('된장찌개');
    // 철 8.4mg — 평균필요량 8 은 넘고, 열량을 채우면 권장 10 을 넘는다 → 조언하지 않고 화면은 '기록 더 필요'.
    expect(nutrient(a, 'iron')).toMatchObject({ status: 'borderline', supplementCandidate: false, recordGap: true });
    expect(ca.recordGap).toBe(false);
    // 단백질·나트륨은 항목 스냅샷.
    expect(nutrient(a, 'protein').intakePerDay).toBe(32);
    expect(nutrient(a, 'sodium')).toMatchObject({ intakePerDay: 3610, status: 'high' });
    expect(a.notes.some((n) => n.includes('30-49세'))).toBe(true);
    expect(a.notes.some((n) => n.includes('필요량의 47%'))).toBe(true);
  });

  it('주류·음료는 영양 정보가 없어도 0 으로 아는 셈 — 정보 비율을 깎지 않는다', () => {
    const items = days(4).flatMap((d) => [
      ...meal(d, `${d}-l`),
      ...meal(d, `${d}-d`, [
        { eatenDate: d, entryId: `${d}-d`, name: '맥주', foodId: 'beer', dishType: 'alcohol', kcal: 150, proteinG: 1, sodiumMg: 10 },
      ]),
    ]);
    const a = analyze(items);
    expect(a.coverage).toBe(1);
    expect(nutrient(a, 'calcium').coverage).toBe(1);
  });

  it('영양 정보 없는 과일 기록이 있으면 비타민 C·칼륨·식이섬유·비타민 A 는 조언을 미룬다', () => {
    const items = days(4).flatMap((d) => [
      ...meal(d, `${d}-l`, [
        { eatenDate: d, entryId: `${d}-l`, name: '사과', foodId: 'apple', dishType: null, kcal: 57, proteinG: null, sodiumMg: null },
      ]),
      ...meal(d, `${d}-d`),
    ]);
    const a = analyze(items);
    expect(a.notes.some((n) => n.includes('과일·채소 기록 4개'))).toBe(true);
    for (const key of ['vitaminC', 'potassium', 'vitaminA']) {
      expect(nutrient(a, key).supplementCandidate).toBe(false);
    }
    expect(nutrient(a, 'calcium').supplementCandidate).toBe(true);
  });

  it('열량을 모르는 음식은 몇 개 빠졌는지 밝히고(음료는 세지 않음), 기록 열량이 필요량의 85% 아래면 안내한다', () => {
    const extra = (d: string, entryId: string): AnalysisItem[] => [
      { eatenDate: d, entryId, name: '삼겹살', foodId: null, dishType: 'grill', kcal: 310, proteinG: 20, sodiumMg: 100 },
    ];
    const items = days(4).flatMap((d) => [
      ...meal(d, `${d}-l`, [
        ...extra(d, `${d}-l`),
        { eatenDate: d, entryId: `${d}-l`, name: '참치', foodId: null, dishType: null, kcal: null, proteinG: null, sodiumMg: null },
      ]),
      ...meal(d, `${d}-d`, [
        ...extra(d, `${d}-d`),
        { eatenDate: d, entryId: `${d}-d`, name: '맥주', foodId: 'beer', dishType: 'alcohol', kcal: null, proteinG: null, sodiumMg: null },
      ]),
    ]);
    const a = analyze(items);
    // 하루 (450 + 310) × 2 = 1,520kcal = 필요량 1,900 의 80% — 예전 기준(70%)이면 안내가 없었다.
    expect(a.energy.percent).toBe(80);
    expect(a.notes.some((n) => n.includes('필요량의 80%'))).toBe(true);
    // 참치 4개만 — 열량을 모르는 맥주(음료)는 세지 않는다.
    expect(a.notes).toContain('열량을 모르는 음식 4개(참치)는 점검에서 빠졌어요.');
  });

  it('성별·출생연도가 있으면 그 기준으로 보고 안내 문구를 빼다', () => {
    const a = analyze(twoMealsPerDay(5), profileFrom('male', 1990, '2026-10-04'));
    expect(a.profile).toEqual({ sex: 'male', ageGroup: '30-49', basis: 'user' });
    expect(nutrient(a, 'calcium').reference.amount).toBe(800);
    expect(a.notes.some((n) => n.includes('30-49세 성인 기준'))).toBe(false);
  });
});

describe('analyzeMealNutrition — 영양 기준 음식(2026-11-07)', () => {
  // 운영 모양: 외식 어휘 '공기밥'(1인분 349kcal·210g, 비타민·무기질·단백질 없음) → 쌀밥 기준.
  const RICE_STD: NutrientsPer100g = { ...RICE, proteinG: 3, sodiumMg: 2 };
  const rows = new Map<string, AnalysisCatalogRow>([
    ...ROWS,
    ['gongi', row('gongi', '공기밥', 349, 210, null, { source: 'menu-canonical', nameNorm: '공기밥' })],
    ['chicken', row('chicken', '치킨', 342, 300, null, { source: 'menu-canonical', nameNorm: '치킨', kcalPer100g: null, servingG: null })],
  ]);
  const ref = new Map<string, AnalysisCatalogRow>([
    ['공기밥', row('ricestd', '쌀밥', 150, 100, RICE_STD, { nameNorm: '쌀밥' })],
    ['치킨', row('friedstd', '닭튀김', 600, 300, STEW, { nameNorm: '닭튀김' })],
  ]);
  const gongiMeal = (d: string, entryId: string): AnalysisItem[] => [
    { eatenDate: d, entryId, name: '공기밥', foodId: 'gongi', dishType: 'rice', kcal: 300, proteinG: null, sodiumMg: null },
    { eatenDate: d, entryId, name: '된장찌개', foodId: 'stew', dishType: 'stew', kcal: 150, proteinG: 10, sodiumMg: 1800 },
  ];
  const items = days(5).flatMap((d) => [...gongiMeal(d, `${d}-l`), ...gongiMeal(d, `${d}-d`)]);
  const run = (refRowsByName?: Map<string, AnalysisCatalogRow>) =>
    analyzeMealNutrition({ items, rowsById: rows, refRowsByName, profile: profileFrom(null, null, '2026-10-04'), from: '2026-09-21', to: '2026-10-04', days: 14 });

  it('기준 음식이 없으면 그 열량은 정보 없음 — 있으면 열량당 밀도로 계산해 현미밥 행과 같은 값', () => {
    const without = run();
    expect(nutrient(without, 'calcium').coverage).toBeCloseTo(150 / 450, 2);
    const withRef = run(ref);
    // 쌀밥 기준: 300kcal ÷ 150kcal/100g = 200g 어치 → 칼슘 10mg(위 '현미밥 200g' 과 같다).
    expect(nutrient(withRef, 'calcium').intakePerDay).toBe(260);
    expect(nutrient(withRef, 'calcium').coverage).toBe(1);
    // 스냅샷이 빈 단백질은 기준 음식의 100g당 단백질로 — 끼니당 6g + 된장찌개 10g → 하루 32g.
    expect(nutrient(withRef, 'protein').intakePerDay).toBe(32);
    expect(nutrient(withRef, 'protein').coverage).toBe(1);
    // 추정 몫이 크면 밝힌다(공기밥 300/450 = 67%).
    expect(withRef.notes.some((n) => n.includes('공기밥') && n.includes('비슷한 음식') && n.includes('67%'))).toBe(true);
  });

  it('행이 영양을 빌려 왔어도 100g당 열량이 없으면 기준 음식으로 — 카탈로그 밖 이름은 항목 이름으로 찾는다', () => {
    const chickenItems = days(4).flatMap((d) => [
      ...meal(d, `${d}-l`),
      { eatenDate: d, entryId: `${d}-d`, name: '치킨', foodId: 'chicken', dishType: 'fried', kcal: 600, proteinG: 40, sodiumMg: 900 },
      { eatenDate: d, entryId: `${d}-d`, name: '양념 반 후라이드 반', nameNorm: '치킨', foodId: null, dishType: null, kcal: 300, proteinG: null, sodiumMg: null },
    ]);
    const a = analyzeMealNutrition({ items: chickenItems, rowsById: rows, refRowsByName: ref, profile: profileFrom(null, null, '2026-10-04'), from: '2026-09-21', to: '2026-10-04', days: 14 });
    expect(nutrient(a, 'calcium').coverage).toBe(1);
    // 닭튀김 기준(200kcal/100g): 600kcal → 300g 어치 → 칼슘 90mg, 300kcal → 45mg.
    expect(nutrient(a, 'calcium').topSources).toContain('치킨');
  });
});

describe('마그네슘·아연·엽산(2026-11-07)', () => {
  it('2020 KDRI 원문 값 — 성별을 모르면 남녀 중 낮은 값, 상한은 음식으로 판단하지 않는 영양소가 있다', () => {
    expect(nutrientReference('magnesium', 'male', '30-49')).toEqual({ ear: 310, rni: 370, ul: 350 });
    expect(nutrientReference('magnesium', 'female', '19-29')).toEqual({ ear: 230, rni: 280, ul: 350 });
    expect(nutrientReference('zinc', null, '30-49')).toEqual({ ear: 7, rni: 8, ul: 35 });
    expect(nutrientReference('folate', null, '15-18')).toEqual({ ear: 330, rni: 400, ul: 900 });
    const byKey = new Map(NUTRIENT_DEFS.map((d) => [d.key, d]));
    expect(byKey.get('magnesium')?.foodUpperLimit).toBe(false);
    expect(byKey.get('folate')?.foodUpperLimit).toBe(false);
    expect(byKey.get('zinc')?.foodUpperLimit).toBe(true);
    expect(NOT_MEASURED_NUTRIENTS).not.toContain('마그네슘');
  });

  it('카탈로그에 값이 있으면 다른 영양소처럼 판정하고, 마그네슘 보충제 상한(350mg)을 음식으로 넘어도 많음이 아니다', () => {
    const RICH = new Map<string, AnalysisCatalogRow>([
      ['rice', row('rice', '현미밥', 300, 200, { ...RICE, magnesiumMg: 150, zincMg: 1.5, folateUg: 10 })],
      ['stew', row('stew', '된장찌개', 150, 400, { ...STEW, magnesiumMg: 20, zincMg: 0.5, folateUg: 30 })],
    ]);
    const a = analyzeMealNutrition({ items: twoMealsPerDay(5), rowsById: RICH, profile: profileFrom(null, null, '2026-10-04'), from: '2026-09-21', to: '2026-10-04', days: 14 });
    // 끼니당 마그네슘: 현미밥 200g → 300mg + 된장찌개 400g → 80mg = 380 → 하루 760mg(보충제 상한 350 초과지만 음식이라 많음 아님).
    expect(nutrient(a, 'magnesium')).toMatchObject({ intakePerDay: 760, status: 'ok', coverage: 1 });
    // 엽산: 끼니당 20 + 120 = 140μg → 하루 280 < 평균필요량 320 → 부족.
    expect(nutrient(a, 'folate')).toMatchObject({ intakePerDay: 280, status: 'low', unit: 'μg DFE' });
    // 상한은 형태가 정해져 있어 기준·단위를 밝힌다(엽산 섭취는 μg DFE, 상한은 엽산 μg).
    expect(upperLimitText(nutrient(a, 'folate'))).toBe('1,000μg(영양제·강화식품의 엽산 기준)');
    expect(upperLimitText(nutrient(a, 'magnesium'))).toBe('350mg(영양제(식품 외) 마그네슘 기준)');
    expect(upperLimitText(nutrient(a, 'zinc'))).toBe('35mg');
  });
});

describe('조언 후보·검사', () => {
  const a = analyze(twoMealsPerDay(5));
  const candidates = adviceCandidates(a);

  it('조언 대상만, 부족 → 조금 부족·비율 낮은 순, 6개까지', () => {
    expect(candidates.map((c) => c.key)).toEqual([
      'vitaminD',
      'vitaminC',
      'calcium',
      'riboflavin',
      'potassium',
      'vitaminA',
    ]);
    expect(adviceCandidates({ ...a, status: 'insufficient' })).toEqual([]);
  });

  it('프롬프트 — 서버가 계산한 숫자, 비타민 D 는 IU 환산, 음식으로만 권하는 영양소 표시', () => {
    const prompt = buildMealNutritionAdviceUserPrompt({
      analysis: a,
      candidates,
      sodiumHigh: nutrient(a, 'sodium'),
    });
    expect(prompt).toContain('[대상] 30-49세 성인 기준');
    expect(prompt).toContain('하루 부족분 약 10μg(400IU)');
    expect(prompt).toContain('상한 100μg(4,000IU)');
    expect(prompt).toContain('calcium 칼슘 — 하루 평균 260mg, 권장섭취량 700mg의 37%');
    expect(prompt).toMatch(/potassium 칼륨[\s\S]*영양제: 음식으로만/);
    expect(prompt).toContain('[여러 개]');
    expect(prompt).toContain('나트륨은 하루 평균 3,610mg');
  });

  it('부족분은 유효숫자 두 자리 — 화면·프롬프트·서버 문장이 같은 값(9.33μg(373IU) → 9.3μg(370IU))', () => {
    expect(roundSignificant(9.33)).toBe(9.3);
    expect(roundSignificant(435)).toBe(440);
    expect(roundSignificant(1863)).toBe(1900);
    expect(roundSignificant(0.05)).toBe(0.05);
    expect(roundSignificant(4000)).toBe(4000);
    const vitD = { ...nutrient(a, 'vitaminD'), intakePerDay: 0.67 };
    expect(shortfallOf(vitD)).toBe(9.3);
    const prompt = buildMealNutritionAdviceUserPrompt({ analysis: a, candidates: [vitD], sodiumHigh: null });
    expect(prompt).toContain('하루 부족분 약 9.3μg(370IU)');
    expect(fallbackAdviceItem(vitD).shortfallPerDay).toBe(9.3);
  });

  it('곁들임 후보가 있으면 프롬프트·서버 문장에 함께 쓴다 — 한 끼 후보가 없어도', () => {
    const vitC = { ...nutrient(a, 'vitaminC'), foodSuggestions: [], sideSuggestions: ['파프리카', '키위', '딸기'] };
    const prompt = buildMealNutritionAdviceUserPrompt({ analysis: a, candidates: [vitC], sodiumHigh: null });
    expect(prompt).toContain('   - 곁들임 후보: 파프리카·키위·딸기');
    expect(prompt).not.toContain('한 끼 후보');
    expect(fallbackAdviceItem(vitC).foodTip).toBe(
      `곁들임으로는 파프리카·키위, 평소에는 ${vitC.typicalFoods.slice(0, 3).join('·')} 같은 음식을 챙겨 보세요.`,
    );
    const both = { ...vitC, foodSuggestions: ['비빔밥'] };
    expect(fallbackAdviceItem(both).foodTip).toMatch(/^한 끼로는 비빔밥, 곁들임으로는 파프리카·키위, 평소에는/);
  });

  it('6개를 넘는 조언 대상은 요약 끝 한 문장으로 — 판정 지문은 숫자가 아니라 판정만 본다', () => {
    expect(adviceOverflowNote(a)).toBeNull();
    const more = {
      ...a,
      nutrients: a.nutrients.map((n) =>
        n.key === 'thiamin' || n.key === 'niacin'
          ? { ...n, status: 'low' as const, supplementCandidate: true, recordGap: false, percent: 90 }
          : n,
      ),
    };
    expect(adviceCandidates(more)).toHaveLength(6);
    expect(adviceOverflowNote(more)).toBe(`그 밖에 ${def('thiamin').label}·${def('niacin').label}도 기준보다 적어요.`);
    const nudged = {
      ...a,
      nutrients: a.nutrients.map((n) => ({ ...n, intakePerDay: (n.intakePerDay ?? 0) + 1, percent: (n.percent ?? 0) + 1 })),
    };
    expect(adviceVerdict(nudged)).toBe(adviceVerdict(a));
    expect(adviceVerdict(more)).not.toBe(adviceVerdict(a));
  });

  it('textProblem — 한자·효능 주장·점검 밖 영양소·프롬프트에 없는 용량', () => {
    const allowed = new Set([8.5, 340, 100, 4000, 60]);
    expect(textProblem('칼슘(鈣)이 부족해요.', allowed)).toBe('hanja');
    expect(textProblem('골다공증 예방에 좋아요.', allowed)).toBe('claim');
    expect(textProblem('오메가-3도 함께 드세요.', allowed)).toBe('offlist');
    expect(textProblem('비타민 E 도 챙기세요.', allowed)).toBe('offlist');
    // 마그네슘·아연·엽산은 2026-11-07 부터 점검하는 영양소 — 목록 밖 검사에 걸리지 않는다.
    expect(textProblem('마그네슘은 현미밥·두부로 채워 보세요.', allowed)).toBeNull();
    expect(textProblem('하루 1,000IU 를 드세요.', allowed)).toBe('number');
    expect(textProblem('하루 8.5μg(340IU) 정도면 돼요. 상한 4,000IU', allowed)).toBeNull();
    expect(textProblem('하루 1~2번 나눠, 15~20분 햇빛', allowed)).toBeNull();
    expect(textProblem('', allowed)).toBe('empty');
    // B1·B2 는 점검하는 영양소라 막지 않는다.
    expect(textProblem('비타민 B1(티아민)', allowed)).toBeNull();
  });

  it('sanitizeAdvice — 후보 순서로, 빠진 영양소·걸린 칸은 서버 문장, 음식으로만인 영양소는 영양제 칸 비움', () => {
    const prompt = buildMealNutritionAdviceUserPrompt({ analysis: a, candidates, sodiumHigh: null });
    const out = sanitizeAdvice(
      {
        summary: '비타민 D 와 칼슘부터 챙겨 보세요.',
        items: [
          { nutrient: 'iron', reason: 'x', foodTip: 'x', supplementTip: 'x' },
          {
            nutrient: 'vitaminD',
            reason: '하루 평균 0μg이라 기준 10μg에 못 미쳐요.',
            foodTip: '고등어 같은 등푸른생선을 드셔 보세요.',
            supplementTip: '비타민 D3 를 하루 1000IU 드세요.',
          },
          {
            nutrient: 'calcium',
            reason: '칼슘(鈣)이 모자라요.',
            foodTip: '두부를 곁들여 보세요.',
            supplementTip: '구연산칼슘을 나눠 드세요.',
          },
          {
            nutrient: 'potassium',
            reason: '칼륨이 기준의 43%예요.',
            foodTip: '바나나를 드셔 보세요.',
            supplementTip: '칼륨 보충제를 드세요.',
          },
        ],
      },
      { analysis: a, candidates, allowedNumbers: allowedNumbersFor(prompt, candidates) },
    );
    expect(out.items.map((i) => i.nutrient)).toEqual(candidates.map((c) => c.key));
    expect(out.llmItems).toBe(3);
    const [vitD, , calcium, , potassium] = out.items;
    expect(vitD!.reason).toBe('하루 평균 0μg이라 기준 10μg에 못 미쳐요.');
    expect(vitD!.supplementTip).toContain('비타민 D3(콜레칼시페롤)');
    expect(vitD!.shortfallPerDay).toBe(10);
    expect(vitD!.caution).toBe(def('vitaminD').caution);
    expect(calcium!.reason).toContain('수준이에요');
    expect(calcium!.foodTip).toBe('두부를 곁들여 보세요.');
    expect(calcium!.supplementTip).toBe('구연산칼슘을 나눠 드세요.');
    expect(potassium!.supplementTip).toBeNull();
    expect(out.repairs).toEqual(
      expect.arrayContaining([
        'vitaminD.supplementTip:number',
        'calcium.reason:hanja',
        'vitaminC:missing',
        'riboflavin:missing',
        'vitaminA:missing',
      ]),
    );
    expect(out.summary).toBe('비타민 D 와 칼슘부터 챙겨 보세요.');
  });

  it("'조금 부족'은 영양제 영양소라도 음식으로만 — 영양제 칸을 비우고 프롬프트에도 그렇게 적는다", () => {
    const borderline = candidates.map((c) =>
      c.key === 'riboflavin' ? { ...c, status: 'borderline' as const } : c,
    );
    const ribo = borderline.find((c) => c.key === 'riboflavin')!;
    expect(fallbackAdviceItem(ribo).supplementTip).toBeNull();
    expect(fallbackAdviceItem(borderline.find((c) => c.key === 'calcium')!).supplementTip).toContain(
      '구연산칼슘',
    );
    const prompt = buildMealNutritionAdviceUserPrompt({ analysis: a, candidates: borderline, sodiumHigh: null });
    expect(prompt).toMatch(/riboflavin [^\n]*\n(?: {3}- [^\n]*\n)*? {3}- 영양제: 조금 모자란 정도라 음식으로만/);
    const out = sanitizeAdvice(
      {
        summary: '요약',
        items: [{ nutrient: 'riboflavin', reason: '이유', foodTip: '우유를 드세요.', supplementTip: 'B 복합제를 드세요.' }],
      },
      { analysis: a, candidates: borderline, allowedNumbers: new Set() },
    );
    expect(out.items.find((i) => i.nutrient === 'riboflavin')!.supplementTip).toBeNull();
  });

  it('fallbackSummary — 모자란 것·종합비타민·나트륨, 없으면 없다고', () => {
    const s = fallbackSummary(a, candidates);
    expect(s).toContain('비타민 D·비타민 C·칼슘');
    expect(s).toContain('종합비타민');
    expect(s).toContain('나트륨');
    expect(fallbackSummary(a, [])).toContain('모자란 영양소는 없어요');
    expect(fallbackSummary({ ...a, status: 'insufficient', insufficientReason: '기록 부족' }, [])).toBe(
      '기록 부족',
    );
  });
});

// ── 서비스·라우트 (격리 DB) ─────────────────────────────────────────────────

class FakeProvider implements LLMProvider {
  calls: LLMCompleteOptions[] = [];
  responses: string[] = [];
  fail = false;

  async complete(opts: LLMCompleteOptions): Promise<LLMCompleteResult> {
    this.calls.push(opts);
    if (this.fail) throw new Error('boom');
    return {
      text: this.responses.shift() ?? '{"summary":"","items":[]}',
      model: opts.model,
      promptTokens: 1,
      completionTokens: 1,
    };
  }
}

const envBlock = (model: string): LlmProviderEnv => ({
  apiKey: 'k',
  baseUrl: 'https://ollama.test',
  timeoutMs: 5000,
  maxConcurrent: 2,
  defaultModels: { chat: 'text', 'meal-supplement': model },
});

const kstToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

describe('MealNutritionAdviceService · 라우트 (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  const provider = new FakeProvider();
  const cache = { get: () => provider } as unknown as AdapterCache;
  let foodIds: { rice: string; stew: string };
  const quota: string[] = [];
  let allowQuota = true;

  const build = (model = 'kimi-k3') =>
    new MealNutritionAdviceService(app.prisma, new AiConfigService(app.prisma, envBlock(model)), {
      cache,
      consumeQuota: (userId) => {
        quota.push(userId);
        return allowQuota;
      },
    });

  const seedDays = async (userId: string, end: string, n: number) => {
    for (const d of days(n, end)) {
      for (const slot of ['lunch', 'dinner']) {
        await app.prisma.mealEntry.create({
          data: {
            userId,
            eatenAt: new Date(`${d}T${slot === 'lunch' ? '03' : '10'}:00:00Z`),
            eatenDate: d,
            slot,
            source: 'manual',
            items: {
              createMany: {
                data: [
                  { name: '현미밥', nameNorm: '현미밥', foodId: foodIds.rice, kcal: 300, proteinG: 6, sodiumMg: 5, sortOrder: 0 },
                  { name: '된장찌개', nameNorm: '된장찌개', foodId: foodIds.stew, kcal: 150, proteinG: 10, sodiumMg: 1800, sortOrder: 1 },
                ],
              },
            },
          },
        });
      }
    }
  };

  const authFor = (userId: string) => ({
    authorization: `Bearer ${app.jwt.sign({ userId, email: `${userId}@x.com`, role: 'USER' })}`,
  });

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'nut-u', role: 'USER' },
      { id: 'nut-few', role: 'USER' },
      { id: 'nut-route', role: 'USER' },
    ]);
    await upsertFoodSeeds(app.prisma, [
      {
        name: '현미밥',
        dishType: 'rice',
        source: 'manual',
        servingG: 200,
        kcalPer100g: 150,
        nutrition: { kcal: 300, carbG: null, proteinG: 6, fatG: null, sodiumMg: 5, sugarG: null },
        nutrientsPer100g: RICE,
      },
      {
        name: '된장찌개',
        dishType: 'stew',
        source: 'manual',
        servingG: 400,
        kcalPer100g: 37.5,
        nutrition: { kcal: 150, carbG: null, proteinG: 10, fatG: null, sodiumMg: 1800, sugarG: null },
        nutrientsPer100g: STEW,
      },
      // 음식 제안용 흔한 한 끼 — 국물 요리(싱거운 편)·구이·니아신 값이 비정상인 찌개. 칼슘은 1인분이 기준(700mg)의
      // 25% 를 넘게(순두부찌개 200mg·고등어구이 195mg).
      {
        name: '순두부찌개',
        dishType: 'stew',
        source: 'manual',
        servingG: 200,
        kcalPer100g: 35,
        nutrition: { kcal: 70, carbG: null, proteinG: 6, fatG: null, sodiumMg: 300, sugarG: null },
        nutrientsPer100g: { calciumMg: 100, niacinMg: 0 },
      },
      {
        name: '고등어구이',
        dishType: 'grill',
        source: 'manual',
        servingG: 150,
        kcalPer100g: 180,
        nutrition: { kcal: 270, carbG: null, proteinG: 25, fatG: null, sodiumMg: 400, sugarG: null },
        nutrientsPer100g: { calciumMg: 130, niacinMg: 6 },
      },
      // 곁들임(common-sides) — 1회 분량을 모르는 과일(100g 로 봄)·짠 편인 반찬.
      { name: '귤', source: 'manual', kcalPer100g: 40, nutrientsPer100g: { vitaminCMg: 30 } },
      { name: '사과', source: 'manual', kcalPer100g: 52, nutrientsPer100g: { vitaminCMg: 4 } },
      {
        name: '멸치볶음',
        dishType: 'stir_fry',
        source: 'manual',
        servingG: 50,
        kcalPer100g: 276,
        nutrition: { kcal: 138, carbG: null, proteinG: 12, fatG: null, sodiumMg: 500, sugarG: null },
        nutrientsPer100g: { calciumMg: 600 },
      },
      {
        name: '김치찌개',
        dishType: 'stew',
        source: 'manual',
        servingG: 400,
        kcalPer100g: 40,
        nutrition: { kcal: 160, carbG: null, proteinG: 9, fatG: null, sodiumMg: 900, sugarG: null },
        nutrientsPer100g: { calciumMg: 5, niacinMg: 40 },
      },
    ]);
    const rows = await app.prisma.foodItem.findMany({
      where: { name: { in: ['현미밥', '된장찌개'] } },
      select: { id: true, name: true },
    });
    foodIds = {
      rice: rows.find((r) => r.name === '현미밥')!.id,
      stew: rows.find((r) => r.name === '된장찌개')!.id,
    };
    await seedDays('nut-u', '2026-08-22', 5);
    await seedDays('nut-few', '2026-08-22', 2);
    await seedDays('nut-route', kstToday(), 5);
  });

  // 이 용도의 설정 행(어드민 추론·끄기) — 테스트마다 만들고 지운다.
  const purposeRow = { provider_purpose: { provider: 'ollama-cloud', purpose: 'meal-supplement' } };
  const setPurposeRow = (data: { enabled: boolean; thinking?: string | null }) =>
    app.prisma.llmProviderConfig.upsert({
      where: purposeRow,
      create: { provider: 'ollama-cloud', purpose: 'meal-supplement', apiKey: '', ...data },
      update: data,
    });
  const clearPurposeRow = () => app.prisma.llmProviderConfig.deleteMany({ where: { purpose: 'meal-supplement' } });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  beforeEach(() => {
    provider.calls = [];
    provider.responses = [];
    provider.fail = false;
    quota.length = 0;
    allowQuota = true;
  });


  it('kimi 로 조언을 만들고(추론 끔), 같은 날·같은 기록이면 저장된 조언을 다시 준다', async () => {
    provider.responses.push(
      JSON.stringify({
        summary: '비타민 D 와 칼슘부터 챙겨 보세요.',
        items: [
          {
            nutrient: 'vitaminD',
            reason: '하루 평균 0μg이에요.',
            foodTip: '등푸른생선을 드셔 보세요.',
            supplementTip: '비타민 D3 를 기름기 있는 식사와 함께 드세요.',
          },
        ],
      }),
    );
    const svc = build();
    const first = await svc.create('nut-u', { days: 14, force: false }, '2026-08-22');
    expect(first.cached).toBe(false);
    expect(first.advice).toMatchObject({ status: 'done', model: 'kimi-k3', targetDate: '2026-08-22' });
    expect(first.advice.items.map((i) => i.nutrient)).toEqual([
      'vitaminD',
      'vitaminC',
      'calcium',
      'riboflavin',
      'potassium',
      'vitaminA',
    ]);
    expect(first.advice.items[0]!.reason).toBe('하루 평균 0μg이에요.');
    expect(first.advice.disclaimer).toContain('진단이 아니에요');
    expect(first.advice.analysis.status).toBe('ok');
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.think).toBe(false);
    expect(provider.calls[0]!.maxTokens).toBe(2000);
    expect(JSON.stringify(provider.calls[0]!.format)).toContain('"vitaminD"');
    expect(quota).toEqual(['nut-u']);

    const again = await svc.create('nut-u', { days: 14, force: false }, '2026-08-22');
    expect(again).toMatchObject({ cached: true, advice: { id: first.advice.id } });
    expect(provider.calls).toHaveLength(1);
    expect(quota).toEqual(['nut-u']);
    expect((await svc.latest('nut-u', '2026-08-22')).advice?.id).toBe(first.advice.id);
  });

  it('최근 조언 — 방금 만든 조언은 stale 이 아니고, 조언 방식(버전)이 다르거나 지금 점검의 판정이 달라지면 stale', async () => {
    await seedAuthUsers(app, [{ id: 'nut-stale', role: 'USER' }]);
    await seedDays('nut-stale', '2026-08-22', 5);
    provider.fail = true; // 서버 문장(fallback)으로 충분하다
    const svc = build();
    const { advice } = await svc.create('nut-stale', { days: 14, force: false }, '2026-08-22');
    expect(await svc.latest('nut-stale', '2026-08-22')).toMatchObject({ advice: { id: advice.id }, stale: false });
    // 다음 날 봐도 같은 기록·같은 판정이면 stale 이 아니다.
    expect((await svc.latest('nut-stale', '2026-08-23')).stale).toBe(false);

    await app.prisma.mealNutritionAdvice.update({ where: { id: advice.id }, data: { promptVersion: MEAL_NUTRITION_ADVICE_VERSION - 1 } });
    expect((await svc.latest('nut-stale', '2026-08-22')).stale).toBe(true);

    // 조언 때는 칼슘이 '충분'이었다고 치면(카탈로그 보강·연결로 판정이 바뀐 경우) 지금 점검과 다르다.
    const stored: MealNutritionAnalysisType = structuredClone(advice.analysis);
    stored.nutrients = stored.nutrients.map((n) => (n.key === 'calcium' ? { ...n, status: 'ok', supplementCandidate: false } : n));
    await app.prisma.mealNutritionAdvice.update({
      where: { id: advice.id },
      data: { promptVersion: MEAL_NUTRITION_ADVICE_VERSION, analysisJson: JSON.stringify(stored) },
    });
    expect((await svc.latest('nut-stale', '2026-08-22')).stale).toBe(true);
  });

  it('어드민 추론을 켜면 kimi 에 그 단계와 늘린 출력 예산을 보낸다', async () => {
    await setPurposeRow({ enabled: true, thinking: 'high' });
    try {
      await build().create('nut-u', { days: 14, force: true }, '2026-08-22');
      expect(provider.calls[0]).toMatchObject({ think: 'high', maxTokens: 7000, timeoutMs: 240_000 });
    } finally {
      await clearPurposeRow();
    }
  });

  it('LLM 이 실패하면 서버 문장으로(fallback) 답하고, 그 조언은 다시 쓰지 않는다', async () => {
    provider.fail = true;
    const svc = build();
    const res = await svc.create('nut-u', { days: 21, force: false }, '2026-08-22');
    expect(res.advice).toMatchObject({ status: 'fallback', model: null });
    expect(res.advice.items[0]!.supplementTip).toContain('비타민 D3');
    expect(res.advice.summary).toContain('모자라요');
    provider.fail = false;
    const retry = await svc.create('nut-u', { days: 21, force: false }, '2026-08-22');
    expect(retry.cached).toBe(false);
    expect(provider.calls).toHaveLength(2);
  });

  it('한도를 넘으면 모델을 부르지 않고 quota 오류', async () => {
    allowQuota = false;
    await expect(
      build().create('nut-u', { days: 14, force: true }, '2026-08-22'),
    ).rejects.toBeInstanceOf(MealNutritionAdviceError);
    expect(provider.calls).toHaveLength(0);
  });

  it('기록이 모자라면 모델·한도 없이 insufficient', async () => {
    const res = await build().create('nut-few', { days: 14, force: false }, '2026-08-22');
    expect(res.advice).toMatchObject({ status: 'insufficient', items: [] });
    expect(res.advice.summary).toContain('2일');
    expect(provider.calls).toHaveLength(0);
    expect(quota).toEqual([]);
  });

  it('음식 제안 — 나트륨이 많으면 국물 요리를 빼고, 1인분이 상한을 넘는 값(원자료 오류)·제외 음식은 뺀다', async () => {
    const svc = new MealNutritionService(app.prisma);
    const calcium = new Map([['calcium' as const, { reference: 700, upperLimit: 2500 }]]);
    // 된장찌개는 1인분 나트륨 1,800mg 이라 처음부터 빠진다.
    expect((await svc.foodSuggestions(calcium, [], [])).get('calcium')).toEqual(['순두부찌개', '고등어구이']);
    expect((await svc.foodSuggestions(calcium, [], [], { sodiumHigh: true })).get('calcium')).toEqual([
      '고등어구이',
    ]);
    expect((await svc.foodSuggestions(calcium, [], ['고등어'])).get('calcium')).toEqual(['순두부찌개']);
    // 김치찌개 니아신 160mg/1인분 > 상한 35mg — 원자료 오류로 보고 뺀다.
    const niacin = new Map([['niacin' as const, { reference: 14, upperLimit: 35 }]]);
    expect((await svc.foodSuggestions(niacin, [], [])).get('niacin')).toEqual(['고등어구이']);
  });

  it('곁들임 제안 — 흔한 곁들임 목록 안에서 1회 분량이 기준의 15% 이상, 분량을 모르면 100g, 나트륨이 많으면 짠 반찬을 뺀다', async () => {
    const svc = new MealNutritionService(app.prisma);
    const vitC = new Map([['vitaminC' as const, { reference: 100, upperLimit: 2000 }]]);
    // 귤 100g → 30mg(30%) · 사과 100g → 4mg(4%, 문턱 아래).
    expect((await svc.sideSuggestions(vitC, [], [])).get('vitaminC')).toEqual(['귤']);
    expect((await svc.sideSuggestions(vitC, [], ['귤'])).get('vitaminC')).toEqual([]);
    // 한 끼 제안은 흔한 한 끼 목록만 — 귤이 '한 끼로는'에 나오지 않는다.
    expect((await svc.foodSuggestions(vitC, [], [])).get('vitaminC')).toEqual([]);
    const calcium = new Map([['calcium' as const, { reference: 700, upperLimit: 2500 }]]);
    // 멸치볶음 50g → 300mg(43%), 1회 나트륨 500mg — 나트륨이 많은 사람(1회 300mg 미만만)에겐 뺀다.
    expect((await svc.sideSuggestions(calcium, [], [])).get('calcium')).toEqual(['멸치볶음']);
    expect((await svc.sideSuggestions(calcium, [], [], { sodiumHigh: true })).get('calcium')).toEqual([]);
  });

  it('음식 제안 후보(카탈로그 파생)는 10분 동안 한 번만 읽고, 결과는 새로 계산한 것과 같다', async () => {
    let catalogLoads = 0;
    const counting = new Proxy(app.prisma, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver) as unknown;
        if (prop !== 'foodItem') return value;
        return new Proxy(value as object, {
          get(delegate, method, r) {
            const fn = Reflect.get(delegate, method, r) as unknown;
            if (method !== 'findMany' || typeof fn !== 'function') return fn;
            return (...args: unknown[]) => {
              catalogLoads += 1;
              return (fn as (...a: unknown[]) => unknown).apply(delegate, args);
            };
          },
        });
      },
    }) as PrismaClient;
    const svc = new MealNutritionService(counting);
    const calcium = new Map([['calcium' as const, { reference: 700, upperLimit: 2500 }]]);
    const niacin = new Map([['niacin' as const, { reference: 14, upperLimit: 35 }]]);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const first = await svc.foodSuggestions(calcium, [], []);
      expect(catalogLoads).toBe(1);
      // 사용자 조건이 달라도 카탈로그는 다시 읽지 않는다(알레르기·제외·나트륨 필터만 요청마다).
      expect((await svc.foodSuggestions(calcium, [], [], { sodiumHigh: true })).get('calcium')).toEqual(['고등어구이']);
      expect((await svc.foodSuggestions(niacin, [], ['고등어'])).get('niacin')).toEqual([]);
      expect(catalogLoads).toBe(1);
      expect(first).toEqual(await new MealNutritionService(app.prisma).foodSuggestions(calcium, [], []));
      vi.setSystemTime(Date.now() + 11 * 60 * 1000);
      await svc.foodSuggestions(calcium, [], []);
      expect(catalogLoads).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('조언 LLM 을 기다리는 동안 같은 사용자 쓰기가 막히지 않고, 그 사이 전체 삭제되면 저장하지 않는다(conflict)', async () => {
    await seedAuthUsers(app, [{ id: 'nut-conflict', role: 'USER' }]);
    await seedDays('nut-conflict', '2026-08-22', 5);
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const slow: LLMProvider = {
      complete: async (opts) => {
        entered();
        await released;
        return { text: '{"summary":"","items":[]}', model: opts.model, promptTokens: 1, completionTokens: 1 };
      },
    };
    const svc = new MealNutritionAdviceService(app.prisma, new AiConfigService(app.prisma, envBlock('kimi-k3')), {
      cache: { get: () => slow } as unknown as AdapterCache,
    });
    const pending = svc.create('nut-conflict', { days: 14, force: true }, '2026-08-22');
    await started;
    const write = mealMutationBarrier.runExclusive('nut-conflict', async () => 'saved');
    expect(await Promise.race([write, new Promise((resolve) => setTimeout(() => resolve('blocked'), 1_000))])).toBe('saved');
    await new MealDataService(app.prisma, {
      photos: app.mealPhotos,
      purgeRecognitionDebugForUser: vi.fn().mockResolvedValue(undefined),
    }).deleteAll('nut-conflict', { confirmation: MEAL_DATA_DELETE_CONFIRMATION });
    // 삭제 뒤에 들어온 같은 요청은 삭제 전 계산(곧 conflict 로 버려질)에 합류하지 않고 새로 돈다 —
    // 지운 뒤라 기록이 모자라 모델 없이 '기록 부족' 조언으로 끝난다.
    const after = svc.create('nut-conflict', { days: 14, force: true }, '2026-08-22');
    release();
    await expect(pending).rejects.toMatchObject({ code: 'conflict' });
    await expect(after).resolves.toMatchObject({ cached: false, advice: { status: 'insufficient' } });
    const saved = await app.prisma.mealNutritionAdvice.findMany({ where: { userId: 'nut-conflict' } });
    expect(saved.map((a) => a.status)).toEqual(['insufficient']); // 삭제 전 계산의 조언은 저장되지 않았다
  });

  it('통계 묶음별 영양 몫 라우트 — 로그인 필요, 기간 검사, 기간 기록 전체의 묶음 몫', async () => {
    const to = kstToday();
    const url = (from: string, until = to) => `/api/v1/meals/stats/nutrition?from=${from}&to=${until}`;
    expect((await app.inject({ method: 'GET', url: url(shiftDate(to, -6)) })).statusCode).toBe(401);
    const auth = authFor('nut-route');
    expect((await app.inject({ method: 'GET', url: url(to, shiftDate(to, -1)), headers: auth })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: url(shiftDate(to, -400)), headers: auth })).statusCode).toBe(400);

    const res = await app.inject({ method: 'GET', url: url(shiftDate(to, -6)), headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json<MealStatsNutritionResultType>();
    // 5일 × 두 끼 × (현미밥 300 + 된장찌개 150) — 두 끼 이상 기록한 날만 고르지 않고 기간 기록 전체.
    expect(body.itemCount).toBe(20);
    expect(body.totals.find((t) => t.key === 'kcal')?.amount).toBe(4500);
    expect(body.totals.find((t) => t.key === 'sodium')?.amount).toBe(18050);
    // 분류 없이 저장된 기록은 미분류 한 묶음 — 몫 100%.
    expect(body.byDishType.map((g) => [g.key, g.mainCount, g.nutrients.find((n) => n.key === 'kcal')?.share])).toEqual([
      ['unknown', 20, 1],
    ]);
    expect(body.byDishType[0]?.foods).toEqual([
      { name: '된장찌개', count: 10 },
      { name: '현미밥', count: 10 },
    ]);
  });

  it('통계 영양소별 하루 평균 라우트 — 로그인 필요, 기간 검사, 같은 기간 영양 탭 점검과 같은 숫자·판정', async () => {
    const to = kstToday();
    const from = shiftDate(to, -6);
    const url = (f: string, until = to) => `/api/v1/meals/stats/nutrients?from=${f}&to=${until}`;
    expect((await app.inject({ method: 'GET', url: url(from) })).statusCode).toBe(401);
    const auth = authFor('nut-route');
    expect((await app.inject({ method: 'GET', url: url(to, shiftDate(to, -1)), headers: auth })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: url(shiftDate(to, -400)), headers: auth })).statusCode).toBe(400);

    const res = await app.inject({ method: 'GET', url: url(from), headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json<MealStatsNutrientsResultType>();
    // 5일 × 두 끼 × (현미밥 300 + 된장찌개 150) — 7일 중 기록 없는 이틀은 끼니 0.
    expect(body).toMatchObject({ days: 7, analyzedDays: 5, status: 'ok' });
    expect(body.meals.filter((m) => m === 2)).toHaveLength(5);
    expect(body.rows.find((r) => r.key === 'kcal')?.intakePerDay).toBe(900);
    // 영양 탭 점검(최근 7일 = 같은 기간)과 영양소마다 같은 하루 평균·판정.
    const check = (
      await app.inject({ method: 'GET', url: '/api/v1/meals/nutrition?days=7', headers: auth })
    ).json<MealNutritionAnalysisType>();
    expect(check.from).toBe(from);
    for (const n of check.nutrients) {
      const s = body.rows.find((r) => r.key === n.key);
      expect([n.key, s?.intakePerDay, s?.status]).toEqual([n.key, n.intakePerDay, n.status]);
    }
  });

  it('라우트 — 점검·조언 생성·최근 조언, 로그인 필요, 일일 한도 429', async () => {
    // 라우트는 실제 설정(.env 키)을 읽는다 — 진짜 모델을 부르지 않게 이 용도를 꺼 둔다(서버 문장 폴백).
    await setPurposeRow({ enabled: false });
    try {
      await routeScenario();
    } finally {
      await clearPurposeRow();
    }
  });

  const routeScenario = async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/meals/nutrition' })).statusCode).toBe(401);

    const analysis = await app.inject({
      method: 'GET',
      url: '/api/v1/meals/nutrition?days=7',
      headers: authFor('nut-route'),
    });
    expect(analysis.statusCode).toBe(200);
    expect(analysis.json()).toMatchObject({ status: 'ok', days: 7, analyzedDays: 5 });
    expect(analysis.json().nutrients).toHaveLength(NUTRIENT_DEFS.length);

    const empty = await app.inject({
      method: 'GET',
      url: '/api/v1/meals/nutrition/advice',
      headers: authFor('nut-route'),
    });
    expect(empty.json()).toEqual({ advice: null, stale: false });

    // 이 용도를 꺼 두어 모델 없이 서버 문장으로 답한다.
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/meals/nutrition/advice',
      headers: authFor('nut-route'),
      payload: { days: 14 },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ status: 'fallback', model: null });
    const latest = await app.inject({
      method: 'GET',
      url: '/api/v1/meals/nutrition/advice',
      headers: authFor('nut-route'),
    });
    expect(latest.json()).toMatchObject({ advice: { id: created.json().id }, stale: false });

    await app.prisma.mealDailyQuota.upsert({
      where: { userId_date_purpose: { userId: 'nut-route', date: kstToday(), purpose: 'supplement' } },
      create: { userId: 'nut-route', date: kstToday(), purpose: 'supplement', count: 999 },
      update: { count: 999 },
    });
    const limited = await app.inject({
      method: 'POST',
      url: '/api/v1/meals/nutrition/advice',
      headers: authFor('nut-route'),
      payload: { days: 14, force: true },
    });
    expect(limited.statusCode).toBe(429);
  };
});
