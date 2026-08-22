import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MEAL_DEFAULT_WEIGHTS, type MealPreferenceType } from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { AiConfigService, type LlmProviderEnv } from '../ai/ai.config.service.js';
import type { AdapterCache } from '../ai/adapter-cache.js';
import type { LLMCompleteOptions, LLMCompleteResult, LLMProvider } from '../ai/adapters/llm-provider.js';
import { upsertFoodSeeds } from '../food/food-import.service.js';
import {
  buildProfile,
  isExcluded,
  scoreCandidate,
  type CandidateInput,
  type HistoryItem,
} from './meal-pattern.service.js';
import { MealRecommendationService, mapLlmItems, parseRecommendationOutput } from './meal-recommendation.service.js';

// 추천 — 결정적 절반(프로필·점수·후보 매핑)은 순수 함수로, LLM 절반은 FakeProvider 로 검증한다.

const TODAY = '2026-08-22';

const item = (name: string, date: string, over: Partial<HistoryItem> = {}): HistoryItem => ({
  eatenDate: date,
  slot: 'lunch',
  name,
  nameNorm: name.replace(/\s+/g, ''),
  foodId: null,
  dishType: null,
  mainIngredient: null,
  cuisine: null,
  isMain: true,
  ...over,
});

const candidate = (name: string, over: Partial<CandidateInput> = {}): CandidateInput => ({
  name,
  nameNorm: name.replace(/\s+/g, ''),
  foodId: null,
  dishType: null,
  mainIngredient: null,
  cuisine: null,
  popularity: 0,
  fromHistory: false,
  liked: false,
  kcal: null,
  sodiumMg: null,
  proteinG: null,
  ingredientCount: null,
  ...over,
});

const prefs = (over: Partial<MealPreferenceType> = {}): MealPreferenceType => ({
  weights: { ...MEAL_DEFAULT_WEIGHTS },
  excludedFoods: [],
  likedFoods: [],
  mealTypes: [],
  slots: ['breakfast', 'lunch', 'dinner'],
  onboarded: true,
  updatedAt: new Date(0).toISOString(),
  ...over,
});

describe('buildProfile', () => {
  const history = [
    item('김치찌개', '2026-08-21', { dishType: 'stew', mainIngredient: 'pork', cuisine: 'korean' }),
    item('김치찌개', '2026-08-15', { dishType: 'stew', mainIngredient: 'pork', cuisine: 'korean' }),
    item('비빔밥', '2026-08-10', { dishType: 'rice', mainIngredient: 'vegetable', cuisine: 'korean', slot: 'dinner' }),
    item('김치', '2026-08-21', { isMain: false }),
  ];
  const profile = buildProfile(history, 'lunch', TODAY);

  it('주식만 집계하고 최신 섭취일·감쇠 빈도를 기록한다', () => {
    expect(profile.topFoods.map((f) => f.name)).toEqual(['김치찌개', '비빔밥']);
    expect(profile.topFoods[0]).toMatchObject({ count: 2, lastEatenDate: '2026-08-21', daysSince: 1 });
    // 최근 것이 더 큰 가중치를 갖는다.
    expect(profile.topFoods[0]!.weight).toBeGreaterThan(profile.topFoods[1]!.weight);
  });

  it('최근 7일·끼니별 습관·분포', () => {
    expect(profile.recentFoods).toContain('김치찌개');
    expect(profile.recentFoods).not.toContain('비빔밥');
    expect(profile.slotFoods).toEqual(['김치찌개']);
    expect(profile.dishTypeShare['stew']).toBeCloseTo(2 / 3, 2);
    expect(profile.entryCount).toBe(3);
  });
});

describe('scoreCandidate', () => {
  const profile = buildProfile(
    [
      item('김치찌개', '2026-08-21', { dishType: 'stew', mainIngredient: 'pork' }),
      item('김치찌개', '2026-08-18', { dishType: 'stew', mainIngredient: 'pork' }),
      item('된장찌개', '2026-08-20', { dishType: 'stew', mainIngredient: 'tofu_bean' }),
    ],
    'lunch',
    TODAY,
  );
  const ctx = {
    profile,
    preference: prefs(),
    targetSlot: 'lunch' as const,
    mealType: null,
    month: 8,
    tempC: null,
    rain: null,
    today: TODAY,
  };

  it('어제 먹은 음식은 variety 가 낮고, 안 먹어본 음식은 novelty 만점', () => {
    const recent = scoreCandidate(candidate('김치찌개', { dishType: 'stew', fromHistory: true }), ctx);
    const fresh = scoreCandidate(candidate('연어초밥', { dishType: 'raw_fish', mainIngredient: 'fish' }), ctx);
    expect(recent.features.variety).toBeLessThan(0.2);
    expect(fresh.features.variety).toBe(1);
    expect(fresh.features.novelty).toBe(1);
    expect(fresh.score).toBeGreaterThan(recent.score);
    expect(fresh.tags).toContain('새로운 음식');
  });

  it('최근에 몰린 분류는 balance 가 낮다', () => {
    const stew = scoreCandidate(candidate('부대찌개', { dishType: 'stew', mainIngredient: 'pork' }), ctx);
    const noodle = scoreCandidate(candidate('막국수', { dishType: 'noodle', mainIngredient: 'grain' }), ctx);
    expect(noodle.features.balance).toBeGreaterThan(stew.features.balance);
  });

  it('좋아요 표시는 taste 가점 + 태그', () => {
    const liked = scoreCandidate(candidate('돈까스', { liked: true }), ctx);
    expect(liked.features.taste).toBeGreaterThanOrEqual(0.5);
    expect(liked.tags).toContain('좋아하는 음식');
  });

  it('건강 — 튀김은 감점, 채소·저나트륨은 가점', () => {
    const fried = scoreCandidate(candidate('감자튀김', { dishType: 'fried', sodiumMg: 1600, kcal: 950 }), ctx);
    const salad = scoreCandidate(candidate('나물비빔밥', { dishType: 'salad', mainIngredient: 'vegetable', sodiumMg: 500, proteinG: 22 }), ctx);
    expect(salad.features.health).toBeGreaterThan(fried.features.health);
    expect(salad.tags.some((t) => t.includes('가벼운') || t.includes('채소') || t.includes('단백질'))).toBe(true);
  });

  it('계절 — 여름엔 시원한 것, 겨울엔 국물', () => {
    const summerCold = scoreCandidate(candidate('물냉면', { dishType: 'noodle' }), { ...ctx, month: 7 });
    const summerHot = scoreCandidate(candidate('설렁탕', { dishType: 'soup' }), { ...ctx, month: 7 });
    expect(summerCold.features.weather).toBeGreaterThan(summerHot.features.weather);
    const winterHot = scoreCandidate(candidate('설렁탕', { dishType: 'soup' }), { ...ctx, month: 1 });
    expect(winterHot.features.weather).toBe(1);
    expect(winterHot.tags).toContain('추운 날 국물');
    // 비 오는 날은 전·국물이 우선.
    const rainy = scoreCandidate(candidate('해물파전', { dishType: 'pancake' }), { ...ctx, rain: true });
    expect(rainy.tags).toContain('비 오는 날');
  });

  it('가중치가 결과를 바꾼다 — novelty 만 켜면 미경험이 1등', () => {
    const onlyNovelty = { ...ctx, preference: prefs({ weights: { ...MEAL_DEFAULT_WEIGHTS, variety: 0, taste: 0, balance: 0, health: 0, weather: 0, convenience: 0, novelty: 5 } }) };
    const known = scoreCandidate(candidate('김치찌개', { fromHistory: true }), onlyNovelty);
    const unknown = scoreCandidate(candidate('타코'), onlyNovelty);
    expect(unknown.score).toBe(1);
    expect(known.score).toBe(0);
  });

  it('제외 음식은 부분 일치로도 걸러진다', () => {
    expect(isExcluded(candidate('오이냉국'), ['오이'])).toBe(true);
    expect(isExcluded(candidate('김치찌개'), ['오이'])).toBe(false);
  });
});

describe('parseRecommendationOutput / mapLlmItems', () => {
  const pool = [
    { ...candidate('김치찌개'), score: 0.7, tags: ['3번 먹음'], lastEatenDate: '2026-08-10', features: {} },
    { ...candidate('연어초밥'), score: 0.9, tags: ['새로운 음식'], lastEatenDate: null, features: {} },
  ];

  it('후보 풀 밖 이름은 버린다', () => {
    const mapped = mapLlmItems(
      [
        { name: '연어초밥', reason: '2주간 생선을 안 드셨어요.' },
        { name: '없는음식', reason: '지어낸 것' },
        { name: '김치 찌개', reason: '정규화하면 후보와 같다' },
      ],
      pool,
    );
    expect(mapped.map((i) => i.name)).toEqual(['연어초밥', '김치찌개']);
    expect(mapped[0]).toMatchObject({ reason: '2주간 생선을 안 드셨어요.', score: 0.9, lastEatenDate: null });
  });

  it('코드펜스 섞인 응답도 파싱, 형식이 아니면 null', () => {
    expect(parseRecommendationOutput('```json\n{"items":[{"name":"a","reason":"b"}],"summary":"s"}\n```')?.summary).toBe('s');
    expect(parseRecommendationOutput('그냥 텍스트')).toBeNull();
  });
});

class FakeProvider implements LLMProvider {
  calls: LLMCompleteOptions[] = [];
  responses: string[] = [];
  fail = false;

  async complete(opts: LLMCompleteOptions): Promise<LLMCompleteResult> {
    this.calls.push(opts);
    if (this.fail) throw new Error('boom');
    return { text: this.responses.shift() ?? '{"items":[],"summary":""}', model: opts.model, promptTokens: 1, completionTokens: 1 };
  }
}

const envBlock = (recommendModel: string): LlmProviderEnv => ({
  apiKey: 'k',
  baseUrl: 'https://ollama.test',
  timeoutMs: 5000,
  maxConcurrent: 2,
  defaultModels: {
    chat: 'text',
    image: 'vision',
    'log-analysis': 'text',
    'meal-photo': 'vision',
    'meal-recommend': recommendModel,
  },
});

describe('MealRecommendationService (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let provider: FakeProvider;
  let cache: AdapterCache;

  const build = (model = 'gpt-oss:120b') =>
    new MealRecommendationService(app.prisma, new AiConfigService(app.prisma, envBlock(model)), { cache });

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [{ id: 'rec-u', role: 'USER' }]);
    provider = new FakeProvider();
    cache = { get: () => provider } as unknown as AdapterCache;
    await upsertFoodSeeds(app.prisma, [
      { name: '김치찌개', dishType: 'stew', mainIngredient: 'pork', cuisine: 'korean', source: 'manual', popularity: 20 },
      { name: '연어초밥', dishType: 'raw_fish', mainIngredient: 'fish', cuisine: 'japanese', source: 'manual', popularity: 12 },
      { name: '비빔밥', dishType: 'rice', mainIngredient: 'vegetable', cuisine: 'korean', source: 'manual', popularity: 8 },
      { name: '소주', dishType: 'alcohol', source: 'manual', popularity: 30 },
    ]);
    // 기록 2건 — 김치찌개를 어제 먹었다.
    await app.prisma.mealEntry.create({
      data: {
        userId: 'rec-u',
        eatenAt: new Date('2026-08-21T03:00:00Z'),
        eatenDate: '2026-08-21',
        slot: 'lunch',
        source: 'manual',
        items: {
          createMany: {
            data: [
              { name: '김치찌개', nameNorm: '김치찌개', dishType: 'stew', mainIngredient: 'pork', cuisine: 'korean', isMain: true, source: 'manual', sortOrder: 0 },
            ],
          },
        },
      },
    });
  });
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });
  beforeEach(() => {
    provider.calls = [];
    provider.responses = [];
    provider.fail = false;
  });

  it('LLM 이 고른 것을 저장하고, 프롬프트에 원시 기록이 아니라 요약·후보만 들어간다', async () => {
    provider.responses = [
      JSON.stringify({ items: [{ name: '연어초밥', reason: '2주간 생선을 안 드셨어요.' }], summary: '오늘은 가볍게' }),
    ];
    const { recommendation, cached } = await build().create(
      'rec-u',
      { targetDate: '2026-08-22', targetSlot: 'dinner', force: false },
      TODAY,
    );
    expect(cached).toBe(false);
    expect(recommendation.status).toBe('done');
    expect(recommendation.model).toBe('gpt-oss:120b');
    expect(recommendation.items[0]).toMatchObject({ name: '연어초밥', reason: '2주간 생선을 안 드셨어요.' });
    // 폴백으로 3개까지 채운다.
    expect(recommendation.items.length).toBeGreaterThanOrEqual(3);
    expect(recommendation.summary).toBe('오늘은 가볍게');

    const prompt = provider.calls[0]!.prompt;
    expect(prompt).toContain('[후보 목록]');
    expect(prompt).toContain('중요도');
    // 술은 후보에서 제외된다.
    expect(prompt).not.toContain('소주');
  });

  it('같은 날·끼니·프로필이면 캐시를 돌려주고 LLM 을 다시 안 부른다', async () => {
    provider.responses = [JSON.stringify({ items: [{ name: '비빔밥', reason: 'r' }], summary: 's' })];
    const first = await build().create('rec-u', { targetDate: '2026-08-23', targetSlot: 'lunch', force: false }, TODAY);
    const callsAfterFirst = provider.calls.length;
    const second = await build().create('rec-u', { targetDate: '2026-08-23', targetSlot: 'lunch', force: false }, TODAY);
    expect(second.cached).toBe(true);
    expect(second.recommendation.id).toBe(first.recommendation.id);
    expect(provider.calls.length).toBe(callsAfterFirst);

    // force 면 다시 부른다.
    provider.responses = [JSON.stringify({ items: [{ name: '연어초밥', reason: 'r2' }], summary: 's2' })];
    const forced = await build().create('rec-u', { targetDate: '2026-08-23', targetSlot: 'lunch', force: true }, TODAY);
    expect(forced.cached).toBe(false);
    expect(provider.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('LLM 실패·미설정이면 점수 상위로 폴백한다(추천은 항상 나온다)', async () => {
    provider.fail = true;
    const failed = await build().create('rec-u', { targetDate: '2026-08-24', targetSlot: 'dinner', force: false }, TODAY);
    expect(failed.recommendation.status).toBe('fallback');
    expect(failed.recommendation.items.length).toBeGreaterThanOrEqual(3);
    expect(failed.recommendation.model).toBeNull();

    const noModel = await build('').create('rec-u', { targetDate: '2026-08-25', targetSlot: 'dinner', force: false }, TODAY);
    expect(noModel.recommendation.status).toBe('fallback');
    expect(noModel.recommendation.items.length).toBeGreaterThanOrEqual(3);
  });

  it('컨텍스트·이력·피드백', async () => {
    const svc = build();
    const ctx = await svc.context('rec-u', TODAY);
    expect(ctx.entryCount).toBe(1);
    expect(ctx.recentFoods).toContain('김치찌개');
    expect(ctx.preference.weights.variety).toBe(4);
    expect(ctx.latest).not.toBeNull();

    const list = await svc.list('rec-u', 10);
    expect(list.length).toBeGreaterThan(0);

    const withFeedback = await svc.feedback('rec-u', list[0]!.id, { rating: 1, pickedName: '연어초밥' });
    expect(withFeedback.feedback).toMatchObject({ rating: 1, pickedName: '연어초밥' });
    // 부분 갱신 — 앞서 준 값은 유지된다.
    const merged = await svc.feedback('rec-u', list[0]!.id, { eatenEntryId: 'e1' });
    expect(merged.feedback).toMatchObject({ rating: 1, pickedName: '연어초밥', eatenEntryId: 'e1' });

    await expect(svc.feedback('other-user', list[0]!.id, { rating: -1 })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('제외 음식은 후보에서 빠진다', async () => {
    await app.prisma.mealPreference.upsert({
      where: { userId: 'rec-u' },
      create: { userId: 'rec-u', weightsJson: JSON.stringify(MEAL_DEFAULT_WEIGHTS), excludedFoodsJson: JSON.stringify(['초밥']) },
      update: { excludedFoodsJson: JSON.stringify(['초밥']) },
    });
    provider.responses = [JSON.stringify({ items: [], summary: '' })];
    await build().create('rec-u', { targetDate: '2026-08-26', targetSlot: 'lunch', force: false }, TODAY);
    expect(provider.calls[0]!.prompt).not.toContain('연어초밥');
  });
});
