import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEAL_DATA_DELETE_CONFIRMATION,
  type MealNutrientResultType,
  type MealNutritionAnalysisType,
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
  allowedNumbersFor,
  fallbackAdviceItem,
  fallbackSummary,
  sanitizeAdvice,
  textProblem,
} from './meal-nutrition-advice.service.js';
import { NUTRIENT_DEFS } from './meal-nutrition.defs.js';
import { buildMealNutritionAdviceUserPrompt } from './meal-nutrition.prompts.js';
import {
  MealNutritionService,
  analyzeMealNutrition,
  assessNutrient,
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
    expect(at(400)).toMatchObject({ status: 'low', supplementCandidate: true, percent: 57 });
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
    // 400 × 2 = 800 ≥ 700 — 기록이 빠졌을 수 있어 조언하지 않는다.
    expect(half).toMatchObject({ status: 'low', supplementCandidate: false });
    expect(half.note).toContain('빠진 끼니');
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
    expect(gap).toMatchObject({ status: 'low', supplementCandidate: false });
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
    // 철 8.4mg — 평균필요량 8 은 넘고, 열량을 채우면 권장 10 을 넘는다 → 조언하지 않는다.
    expect(nutrient(a, 'iron')).toMatchObject({ status: 'borderline', supplementCandidate: false });
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

  it('성별·출생연도가 있으면 그 기준으로 보고 안내 문구를 빼다', () => {
    const a = analyze(twoMealsPerDay(5), profileFrom('male', 1990, '2026-10-04'));
    expect(a.profile).toEqual({ sex: 'male', ageGroup: '30-49', basis: 'user' });
    expect(nutrient(a, 'calcium').reference.amount).toBe(800);
    expect(a.notes.some((n) => n.includes('30-49세 성인 기준'))).toBe(false);
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

  it('textProblem — 한자·효능 주장·점검 밖 영양소·프롬프트에 없는 용량', () => {
    const allowed = new Set([8.5, 340, 100, 4000, 60]);
    expect(textProblem('칼슘(鈣)이 부족해요.', allowed)).toBe('hanja');
    expect(textProblem('골다공증 예방에 좋아요.', allowed)).toBe('claim');
    expect(textProblem('마그네슘도 함께 드세요.', allowed)).toBe('offlist');
    expect(textProblem('비타민 E 도 챙기세요.', allowed)).toBe('offlist');
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
      // 음식 제안용 흔한 한 끼 — 국물 요리(싱거운 편)·구이·니아신 값이 비정상인 찌개.
      {
        name: '순두부찌개',
        dishType: 'stew',
        source: 'manual',
        servingG: 200,
        kcalPer100g: 35,
        nutrition: { kcal: 70, carbG: null, proteinG: 6, fatG: null, sodiumMg: 300, sugarG: null },
        nutrientsPer100g: { calciumMg: 50, niacinMg: 0 },
      },
      {
        name: '고등어구이',
        dishType: 'grill',
        source: 'manual',
        servingG: 150,
        kcalPer100g: 180,
        nutrition: { kcal: 270, carbG: null, proteinG: 25, fatG: null, sodiumMg: 400, sugarG: null },
        nutrientsPer100g: { calciumMg: 60, niacinMg: 6 },
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
    expect((await svc.latest('nut-u'))?.id).toBe(first.advice.id);
  });

  it('어드민 추론을 켜면 kimi 에 그 단계와 늘린 출력 예산을 보낸다', async () => {
    await setPurposeRow({ enabled: true, thinking: 'high' });
    try {
      await build().create('nut-u', { days: 14, force: true }, '2026-08-22');
      expect(provider.calls[0]).toMatchObject({ think: 'high', maxTokens: 6000 });
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
    release();
    await expect(pending).rejects.toMatchObject({ code: 'conflict' });
    expect(await app.prisma.mealNutritionAdvice.count({ where: { userId: 'nut-conflict' } })).toBe(0);
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
    expect(empty.json()).toEqual({ advice: null });

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
    expect(latest.json().advice.id).toBe(created.json().id);

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
