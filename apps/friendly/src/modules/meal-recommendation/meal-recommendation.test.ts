import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEAL_DEFAULT_WEIGHTS, type MealPreferenceType } from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { env } from '../../config/env.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { AiConfigService, type LlmProviderEnv } from '../ai/ai.config.service.js';
import type { AdapterCache } from '../ai/adapter-cache.js';
import type {
  LLMCompleteOptions,
  LLMCompleteResult,
  LLMProvider,
} from '../ai/adapters/llm-provider.js';
import { upsertFoodSeeds } from '../food/food-import.service.js';
import {
  MealPatternService,
  allergenData,
  buildProfile,
  isExcluded,
  scoreCandidate,
  type CandidateInput,
  type HistoryItem,
} from './meal-pattern.service.js';
import {
  MealRecommendationService,
  mapLlmItems,
  parseRecommendationOutput,
  type MealRecommendationDeps,
} from './meal-recommendation.service.js';

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
  nutritionFrom: null,
  nutritionBasis: 'missing',
  ingredientCount: null,
  ingredients: [],
  allergenWarnings: [],
  allergenEvidence: [],
  allergenMetadataKnown: false,
  ...over,
});

const prefs = (over: Partial<MealPreferenceType> = {}): MealPreferenceType => ({
  weights: { ...MEAL_DEFAULT_WEIGHTS },
  excludedFoods: [],
  allergens: [],
  dislikedFoods: [],
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
    item('비빔밥', '2026-08-10', {
      dishType: 'rice',
      mainIngredient: 'vegetable',
      cuisine: 'korean',
      slot: 'dinner',
    }),
    item('김치', '2026-08-21', { isMain: false }),
  ];
  const profile = buildProfile(history, 'lunch', TODAY);

  it('주식만 집계하고 최신 섭취일·감쇠 빈도를 기록한다', () => {
    expect(profile.topFoods.map((f) => f.name)).toEqual(['김치찌개', '비빔밥']);
    expect(profile.topFoods[0]).toMatchObject({
      count: 2,
      lastEatenDate: '2026-08-21',
      daysSince: 1,
    });
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

describe('allergenData', () => {
  it('이름·재료와 구조화 메타를 합쳐 best-effort 경고 근거를 만든다', () => {
    const result = allergenData(
      '새우 크림 파스타',
      JSON.stringify(['밀가루 면', '우유', '토마토']),
      JSON.stringify(['egg']),
      JSON.stringify(['알류: 제품 표시']),
    );
    expect(result.allergenWarnings).toEqual(
      expect.arrayContaining(['egg', 'milk', 'wheat', 'shrimp', 'tomato']),
    );
    expect(result.allergenEvidence.some((value) => value.includes('새우'))).toBe(true);
    expect(result.allergenMetadataKnown).toBe(true);
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
    const recent = scoreCandidate(
      candidate('김치찌개', { dishType: 'stew', fromHistory: true }),
      ctx,
    );
    const fresh = scoreCandidate(
      candidate('연어초밥', { dishType: 'raw_fish', mainIngredient: 'fish' }),
      ctx,
    );
    expect(recent.features.variety).toBeLessThan(0.2);
    expect(fresh.features.variety).toBe(1);
    expect(fresh.features.novelty).toBe(1);
    expect(fresh.score).toBeGreaterThan(recent.score);
    expect(fresh.tags).toContain('새로운 음식');
  });

  it('최근에 몰린 분류는 balance 가 낮다', () => {
    const stew = scoreCandidate(
      candidate('부대찌개', { dishType: 'stew', mainIngredient: 'pork' }),
      ctx,
    );
    const noodle = scoreCandidate(
      candidate('막국수', { dishType: 'noodle', mainIngredient: 'grain' }),
      ctx,
    );
    expect(noodle.features.balance).toBeGreaterThan(stew.features.balance);
  });

  it('좋아요 표시는 taste 가점 + 태그', () => {
    const liked = scoreCandidate(candidate('돈까스', { liked: true }), ctx);
    expect(liked.features.taste).toBeGreaterThanOrEqual(0.5);
    expect(liked.tags).toContain('좋아하는 음식');
  });

  it('덜 선호는 이름·재료가 맞아도 후보를 남기고 taste 를 강하게 낮추며 좋아요보다 우선한다', () => {
    const normal = scoreCandidate(candidate('김치찌개', { fromHistory: true, liked: true }), ctx);
    const dislikedByName = scoreCandidate(
      candidate('김치찌개', { fromHistory: true, liked: true }),
      {
        ...ctx,
        preference: prefs({ dislikedFoods: ['김치'] }),
      },
    );
    const likedGimbap = scoreCandidate(
      candidate('김밥', { liked: true, ingredients: ['단무지', '오이'] }),
      ctx,
    );
    const dislikedByIngredient = scoreCandidate(
      candidate('김밥', { liked: true, ingredients: ['단무지', '오이'] }),
      {
        ...ctx,
        preference: prefs({ dislikedFoods: ['오이'] }),
      },
    );

    expect(dislikedByName.features.taste).toBeLessThan(normal.features.taste);
    expect(dislikedByName.score).toBeLessThan(normal.score);
    expect(dislikedByName.tags[0]).toBe('가능하면 피함');
    expect(dislikedByIngredient.features.taste).toBeLessThan(likedGimbap.features.taste);
    expect(dislikedByIngredient.tags).not.toContain('좋아하는 음식');
  });

  it('최근 추천 선택·실제 기록·평가를 오래된 반응보다 크게 taste 에 반영한다', () => {
    const signals = (targetDate: string) => [
      {
        targetDate,
        candidateNames: ['연어초밥'],
        pickedName: '연어초밥',
        rating: 1,
        logged: true,
      },
    ];
    const recentProfile = buildProfile([], 'lunch', TODAY, signals(TODAY));
    const oldProfile = buildProfile([], 'lunch', TODAY, signals('2026-07-23'));
    const baseProfile = buildProfile([], 'lunch', TODAY);
    const score = (p: typeof profile) =>
      scoreCandidate(candidate('연어초밥'), { ...ctx, profile: p }).features.taste;

    expect(score(recentProfile)).toBeGreaterThan(score(oldProfile));
    expect(score(oldProfile)).toBeGreaterThan(score(baseProfile));
    expect(
      scoreCandidate(candidate('연어초밥'), { ...ctx, profile: recentProfile }).tags,
    ).toContain('추천 후 먹었어요');
  });

  it('평가만 남긴 경우에도 오래된 평가는 시간 감쇠된다', () => {
    const profileWithRating = (targetDate: string) =>
      buildProfile([], 'lunch', TODAY, [
        {
          targetDate,
          candidateNames: ['비빔밥'],
          pickedName: null,
          rating: 1,
          logged: false,
        },
      ]);
    const taste = (targetDate: string) =>
      scoreCandidate(candidate('비빔밥'), { ...ctx, profile: profileWithRating(targetDate) })
        .features.taste;

    expect(taste(TODAY)).toBeGreaterThan(taste('2026-07-23'));
  });

  it('건강 — 튀김은 감점, 채소·저나트륨은 가점', () => {
    const fried = scoreCandidate(
      candidate('감자튀김', { dishType: 'fried', sodiumMg: 1600, kcal: 950 }),
      ctx,
    );
    const salad = scoreCandidate(
      candidate('나물비빔밥', {
        dishType: 'salad',
        mainIngredient: 'vegetable',
        sodiumMg: 500,
        proteinG: 22,
      }),
      ctx,
    );
    expect(salad.features.health).toBeGreaterThan(fried.features.health);
    expect(
      salad.tags.some((t) => t.includes('가벼운') || t.includes('채소') || t.includes('단백질')),
    ).toBe(true);
  });

  it('계절 — 여름엔 시원한 것, 겨울엔 국물', () => {
    const summerCold = scoreCandidate(candidate('물냉면', { dishType: 'noodle' }), {
      ...ctx,
      month: 7,
    });
    const summerHot = scoreCandidate(candidate('설렁탕', { dishType: 'soup' }), {
      ...ctx,
      month: 7,
    });
    expect(summerCold.features.weather).toBeGreaterThan(summerHot.features.weather);
    const winterHot = scoreCandidate(candidate('설렁탕', { dishType: 'soup' }), {
      ...ctx,
      month: 1,
    });
    expect(winterHot.features.weather).toBe(1);
    expect(winterHot.tags).toContain('추운 날 국물');
    // 비 오는 날은 전·국물이 우선.
    const rainy = scoreCandidate(candidate('해물파전', { dishType: 'pancake' }), {
      ...ctx,
      rain: true,
    });
    expect(rainy.tags).toContain('비 오는 날');
  });

  it('가중치가 결과를 바꾼다 — novelty 만 켜면 미경험이 1등', () => {
    const onlyNovelty = {
      ...ctx,
      preference: prefs({
        weights: {
          ...MEAL_DEFAULT_WEIGHTS,
          variety: 0,
          taste: 0,
          balance: 0,
          health: 0,
          weather: 0,
          convenience: 0,
          novelty: 5,
        },
      }),
    };
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
    {
      ...candidate('김치찌개'),
      score: 0.7,
      tags: ['3번 먹음'],
      lastEatenDate: '2026-08-10',
      features: {},
    },
    {
      ...candidate('연어초밥'),
      score: 0.9,
      tags: ['새로운 음식'],
      lastEatenDate: null,
      features: {},
    },
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
    expect(mapped[0]).toMatchObject({
      reason: '2주간 생선을 안 드셨어요.',
      score: 0.9,
      lastEatenDate: null,
    });
  });

  it('코드펜스 섞인 응답도 파싱, 형식이 아니면 null', () => {
    expect(
      parseRecommendationOutput('```json\n{"items":[{"name":"a","reason":"b"}],"summary":"s"}\n```')
        ?.summary,
    ).toBe('s');
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
    return {
      text: this.responses.shift() ?? '{"items":[],"summary":""}',
      model: opts.model,
      promptTokens: 1,
      completionTokens: 1,
    };
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

  const build = (model = 'gpt-oss:120b', deps: Partial<MealRecommendationDeps> = {}) =>
    new MealRecommendationService(app.prisma, new AiConfigService(app.prisma, envBlock(model)), {
      cache,
      ...deps,
    });

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'rec-u', role: 'USER' },
      { id: 'rec-retention-u', role: 'USER' },
      { id: 'rec-signal-u', role: 'USER' },
    ]);
    provider = new FakeProvider();
    cache = { get: () => provider } as unknown as AdapterCache;
    await upsertFoodSeeds(app.prisma, [
      {
        name: '김치찌개',
        dishType: 'stew',
        mainIngredient: 'pork',
        cuisine: 'korean',
        source: 'manual',
        popularity: 20,
      },
      {
        name: '연어초밥',
        dishType: 'raw_fish',
        mainIngredient: 'fish',
        cuisine: 'japanese',
        source: 'manual',
        popularity: 12,
      },
      {
        name: '비빔밥',
        dishType: 'rice',
        mainIngredient: 'vegetable',
        cuisine: 'korean',
        source: 'manual',
        popularity: 8,
      },
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
              {
                name: '김치찌개',
                nameNorm: '김치찌개',
                dishType: 'stew',
                mainIngredient: 'pork',
                cuisine: 'korean',
                isMain: true,
                source: 'manual',
                sortOrder: 0,
              },
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
      JSON.stringify({
        items: [{ name: '연어초밥', reason: '2주간 생선을 안 드셨어요.' }],
        summary: '오늘은 가볍게',
      }),
    ];
    const { recommendation, cached } = await build().create(
      'rec-u',
      { targetDate: '2026-08-22', targetSlot: 'dinner', force: false },
      TODAY,
    );
    expect(cached).toBe(false);
    expect(recommendation.status).toBe('done');
    expect(recommendation.model).toBe('gpt-oss:120b');
    expect(recommendation.items[0]).toMatchObject({
      name: '연어초밥',
      reason: '2주간 생선을 안 드셨어요.',
    });
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
    provider.responses = [
      JSON.stringify({ items: [{ name: '비빔밥', reason: 'r' }], summary: 's' }),
    ];
    const first = await build().create(
      'rec-u',
      { targetDate: '2026-08-23', targetSlot: 'lunch', force: false },
      TODAY,
    );
    const callsAfterFirst = provider.calls.length;
    const second = await build().create(
      'rec-u',
      { targetDate: '2026-08-23', targetSlot: 'lunch', force: false },
      TODAY,
    );
    expect(second.cached).toBe(true);
    expect(second.recommendation.id).toBe(first.recommendation.id);
    expect(provider.calls.length).toBe(callsAfterFirst);

    // force 면 다시 부른다.
    provider.responses = [
      JSON.stringify({ items: [{ name: '연어초밥', reason: 'r2' }], summary: 's2' }),
    ];
    const forced = await build().create(
      'rec-u',
      { targetDate: '2026-08-23', targetSlot: 'lunch', force: true },
      TODAY,
    );
    expect(forced.cached).toBe(false);
    expect(provider.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('후보 선택·후보 평가는 불변 이벤트로 남고 세트 평가는 후보 취향 신호가 되지 않는다', async () => {
    provider.responses = [
      JSON.stringify({ items: [{ name: '연어초밥', reason: 'r' }], summary: 's' }),
    ];
    const service = build();
    const created = await service.create(
      'rec-u',
      { targetDate: '2026-09-03', targetSlot: 'dinner', force: true },
      TODAY,
    );
    const candidate = created.recommendation.items[0]!;

    await service.recordEvent('rec-u', created.recommendation.id, {
      kind: 'candidate_picked',
      candidateName: candidate.name,
      candidateFoodId: candidate.foodId,
      candidateRank: 0,
      platform: 'web',
    });
    await service.recordEvent('rec-u', created.recommendation.id, {
      kind: 'candidate_rated',
      candidateName: candidate.name,
      candidateFoodId: candidate.foodId,
      candidateRank: 0,
      rating: 1,
      platform: 'web',
    });
    await service.recordEvent('rec-u', created.recommendation.id, {
      kind: 'set_rated',
      rating: -1,
      platform: 'web',
    });

    const saved = (await service.list('rec-u', 20)).find(
      (item) => item.id === created.recommendation.id,
    )!;
    expect(saved.feedback).toMatchObject({ pickedName: candidate.name, rating: -1 });
    expect(saved.candidateRatings).toEqual([{ name: candidate.name, rating: 1 }]);

    const signals = await new MealPatternService(app.prisma).loadFeedbackSignals(
      'rec-u',
      '2026-09-03',
    );
    const ratings = signals.filter((signal) => signal.rating !== null);
    expect(
      ratings.some(
        (signal) => signal.candidateNames.includes(candidate.name) && signal.rating === 1,
      ),
    ).toBe(true);
    expect(ratings.some((signal) => signal.rating === -1)).toBe(false);
  });

  it('반응 없는 이력을 정리해도 불변 이벤트가 있는 추천은 보존한다', async () => {
    const eventBearingId = 'retention-event-bearing';
    const oldestUnreactedId = 'retention-unreacted-00';
    await app.prisma.mealRecommendation.create({
      data: {
        id: eventBearingId,
        userId: 'rec-retention-u',
        targetDate: '2026-01-01',
        targetSlot: 'lunch',
        status: 'fallback',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await app.prisma.mealRecommendationEvent.create({
      data: {
        id: 'retention-shown-event',
        recommendationId: eventBearingId,
        userId: 'rec-retention-u',
        kind: 'shown',
        platform: 'web',
        rankingVersion: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await app.prisma.mealRecommendation.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        id: `retention-unreacted-${String(index).padStart(2, '0')}`,
        userId: 'rec-retention-u',
        targetDate: '2026-01-02',
        targetSlot: 'lunch',
        status: 'fallback',
        createdAt: new Date(Date.UTC(2026, 0, index + 2)),
      })),
    });

    await build('').create(
      'rec-retention-u',
      { targetDate: '2026-10-01', targetSlot: 'dinner', force: true },
      TODAY,
    );

    expect(
      await app.prisma.mealRecommendation.findUnique({ where: { id: eventBearingId } }),
    ).not.toBeNull();
    expect(
      await app.prisma.mealRecommendationEvent.count({
        where: { recommendationId: eventBearingId },
      }),
    ).toBe(1);
    expect(
      await app.prisma.mealRecommendation.findUnique({ where: { id: oldestUnreactedId } }),
    ).toBeNull();
    expect(
      await app.prisma.mealRecommendation.count({
        where: { userId: 'rec-retention-u', feedbackJson: null, events: { none: {} } },
      }),
    ).toBe(50);
  });

  it('후보별 가장 최신 평가 1건만 학습하고 동일 시각은 id로 결정한다', async () => {
    const recommendationId = 'latest-rating-recommendation';
    await app.prisma.mealRecommendation.create({
      data: {
        id: recommendationId,
        userId: 'rec-signal-u',
        targetDate: TODAY,
        targetSlot: 'lunch',
        status: 'fallback',
      },
    });
    const firstAt = new Date('2026-08-22T01:00:00.000Z');
    const latestAt = new Date('2026-08-22T02:00:00.000Z');
    await app.prisma.mealRecommendationEvent.createMany({
      data: [
        {
          id: 'rating-a-old',
          recommendationId,
          userId: 'rec-signal-u',
          kind: 'candidate_rated',
          candidateName: '후보A',
          candidateRank: 0,
          rating: 1,
          platform: 'web',
          rankingVersion: 1,
          createdAt: firstAt,
        },
        {
          id: 'rating-a-new',
          recommendationId,
          userId: 'rec-signal-u',
          kind: 'candidate_rated',
          candidateName: '후보A',
          candidateRank: 0,
          rating: -1,
          platform: 'web',
          rankingVersion: 1,
          createdAt: latestAt,
        },
        {
          id: 'rating-b-a',
          recommendationId,
          userId: 'rec-signal-u',
          kind: 'candidate_rated',
          candidateName: '후보B',
          candidateRank: 1,
          rating: 1,
          platform: 'web',
          rankingVersion: 1,
          createdAt: latestAt,
        },
        {
          id: 'rating-b-z',
          recommendationId,
          userId: 'rec-signal-u',
          kind: 'candidate_rated',
          candidateName: '후보B',
          candidateRank: 1,
          rating: -1,
          platform: 'web',
          rankingVersion: 1,
          createdAt: latestAt,
        },
      ],
    });

    const signals = await new MealPatternService(app.prisma).loadFeedbackSignals(
      'rec-signal-u',
      TODAY,
    );

    expect(signals).toEqual([
      { targetDate: TODAY, candidateNames: ['후보A'], pickedName: null, rating: -1, logged: false },
      { targetDate: TODAY, candidateNames: ['후보B'], pickedName: null, rating: -1, logged: false },
    ]);
  });

  it('mealType 생략은 저장한 주 식사 유형을 쓰고 명시적 null은 덮어쓰지 않는다', async () => {
    await app.prisma.mealPreference.upsert({
      where: { userId: 'rec-u' },
      create: {
        userId: 'rec-u',
        weightsJson: JSON.stringify(MEAL_DEFAULT_WEIGHTS),
        mealTypesJson: JSON.stringify(['dining_out']),
      },
      update: { mealTypesJson: JSON.stringify(['dining_out']) },
    });
    try {
      const omitted = await build('').create(
        'rec-u',
        { targetDate: '2026-09-01', targetSlot: 'dinner', force: false },
        TODAY,
      );
      const explicitNull = await build('').create(
        'rec-u',
        { targetDate: '2026-09-02', targetSlot: 'dinner', mealType: null, force: false },
        TODAY,
      );
      const rows = await app.prisma.mealRecommendation.findMany({
        where: { id: { in: [omitted.recommendation.id, explicitNull.recommendation.id] } },
        select: { id: true, contextJson: true },
      });
      const contextById = new Map(
        rows.map((row) => [row.id, JSON.parse(row.contextJson) as { mealType: string | null }]),
      );
      expect(contextById.get(omitted.recommendation.id)?.mealType).toBe('dining_out');
      expect(contextById.get(explicitNull.recommendation.id)?.mealType).toBeNull();
    } finally {
      await app.prisma.mealPreference.update({
        where: { userId: 'rec-u' },
        data: { mealTypesJson: '[]' },
      });
    }
  });

  it('cache miss 만 호출 전에 quota 를 소비하고, cache hit 는 0회·초과 force 는 LLM 0회다', async () => {
    const consumeQuota = vi.fn<() => boolean>().mockReturnValueOnce(true).mockReturnValue(false);
    const svc = build('gpt-oss:120b', { consumeQuota });
    provider.responses = [
      JSON.stringify({ items: [{ name: '연어초밥', reason: 'r' }], summary: 's' }),
    ];

    const input = { targetDate: '2026-08-27', targetSlot: 'dinner' as const, force: false };
    await svc.create('rec-u', input, TODAY);
    expect(consumeQuota).toHaveBeenCalledTimes(1);
    expect(provider.calls).toHaveLength(1);

    const cached = await svc.create('rec-u', input, TODAY);
    expect(cached.cached).toBe(true);
    expect(consumeQuota).toHaveBeenCalledTimes(1);
    expect(provider.calls).toHaveLength(1);

    await expect(svc.create('rec-u', { ...input, force: true }, TODAY)).rejects.toMatchObject({
      code: 'quota',
    });
    expect(consumeQuota).toHaveBeenCalledTimes(2);
    expect(provider.calls).toHaveLength(1);
  });

  it('동일한 동시 요청은 한 in-flight Promise 에 합류해 quota·LLM 을 한 번만 쓴다', async () => {
    const consumeQuota = vi.fn(() => true);
    const svc = build('gpt-oss:120b', { consumeQuota });
    provider.responses = [
      JSON.stringify({ items: [{ name: '연어초밥', reason: 'r' }], summary: 's' }),
    ];
    const input = { targetDate: '2026-08-28', targetSlot: 'dinner' as const, force: false };

    const [first, joined] = await Promise.all([
      svc.create('rec-u', input, TODAY),
      svc.create('rec-u', input, TODAY),
    ]);

    expect(first.recommendation.id).toBe(joined.recommendation.id);
    expect(consumeQuota).toHaveBeenCalledTimes(1);
    expect(provider.calls).toHaveLength(1);
  });

  it('HTTP route 는 서비스 quota 초과를 429로 응답한다', async () => {
    if (env.MEAL_RECOMMEND_DAILY_LIMIT <= 0) return;
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    await app.prisma.mealDailyQuota.upsert({
      where: { userId_date_purpose: { userId: 'rec-u', date, purpose: 'recommendation' } },
      create: {
        userId: 'rec-u',
        date,
        purpose: 'recommendation',
        count: env.MEAL_RECOMMEND_DAILY_LIMIT,
      },
      update: { count: env.MEAL_RECOMMEND_DAILY_LIMIT },
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/meals/recommendations',
        headers: {
          authorization: `Bearer ${app.jwt.sign({ userId: 'rec-u', email: 'rec@x.com', role: 'USER' })}`,
        },
        payload: { targetDate: '2099-01-01', targetSlot: 'lunch', force: false },
      });
      expect(res.statusCode).toBe(429);
    } finally {
      await app.prisma.mealDailyQuota.deleteMany({
        where: { userId: 'rec-u', date, purpose: 'recommendation' },
      });
    }
  });

  it('LLM 실패·미설정이면 점수 상위로 폴백한다(추천은 항상 나온다)', async () => {
    provider.fail = true;
    const failed = await build().create(
      'rec-u',
      { targetDate: '2026-08-24', targetSlot: 'dinner', force: false },
      TODAY,
    );
    expect(failed.recommendation.status).toBe('fallback');
    expect(failed.recommendation.items.length).toBeGreaterThanOrEqual(3);
    expect(failed.recommendation.model).toBeNull();

    const noModel = await build('').create(
      'rec-u',
      { targetDate: '2026-08-25', targetSlot: 'dinner', force: false },
      TODAY,
    );
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
    const recommendation = list.find((row) => row.items.length > 0)!;
    const pickedName = recommendation.items[0]!.name;

    const withFeedback = await svc.feedback('rec-u', recommendation.id, { rating: 1, pickedName });
    expect(withFeedback.feedback).toMatchObject({ rating: 1, pickedName });
    await expect(
      svc.feedback('rec-u', recommendation.id, { pickedName: '후보에 없는 음식' }),
    ).rejects.toMatchObject({
      code: 'invalid',
    });

    const linkedEntry = await app.prisma.mealEntry.create({
      data: {
        userId: 'rec-u',
        eatenAt: new Date('2026-08-22T10:00:00Z'),
        eatenDate: TODAY,
        slot: 'dinner',
        source: 'recommendation',
        originRecommendationId: recommendation.id,
        items: {
          create: {
            name: pickedName,
            nameNorm: pickedName.replace(/\s+/g, ''),
            isMain: true,
            source: 'recommendation',
          },
        },
      },
    });
    // 부분 갱신 — 앞서 준 값은 유지되며, 본인·원본 추천·후보가 일치하는 기록만 연결된다.
    const merged = await svc.feedback('rec-u', recommendation.id, { eatenEntryId: linkedEntry.id });
    expect(merged.feedback).toMatchObject({ rating: 1, pickedName, eatenEntryId: linkedEntry.id });
    await expect(
      svc.feedback('rec-u', recommendation.id, { eatenEntryId: 'e1' }),
    ).rejects.toMatchObject({
      code: 'invalid',
    });

    await expect(
      svc.feedback('other-user', recommendation.id, { rating: -1 }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('제외 음식은 후보에서 빠진다', async () => {
    await app.prisma.mealPreference.upsert({
      where: { userId: 'rec-u' },
      create: {
        userId: 'rec-u',
        weightsJson: JSON.stringify(MEAL_DEFAULT_WEIGHTS),
        excludedFoodsJson: JSON.stringify(['초밥']),
        dislikedFoodsJson: JSON.stringify(['김치찌개']),
      },
      update: {
        excludedFoodsJson: JSON.stringify(['초밥']),
        dislikedFoodsJson: JSON.stringify(['김치찌개']),
      },
    });
    provider.responses = [JSON.stringify({ items: [], summary: '' })];
    await build().create(
      'rec-u',
      { targetDate: '2026-08-26', targetSlot: 'lunch', force: false },
      TODAY,
    );
    // 과거 패턴 요약에는 먹은 음식으로 남을 수 있지만, LLM 이 고르는 후보 목록에서는 빠져야 한다.
    const candidateSection = provider.calls[0]!.prompt.split('[후보 목록]')[1] ?? '';
    expect(candidateSection).not.toContain('연어초밥');
    expect(candidateSection).toContain('김치찌개');
    expect(provider.calls[0]!.prompt).toContain('[가능하면 피할 것] 김치찌개');
  });
});

describe('후보 풀 — 외식 어휘 노이즈 제외 (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await upsertFoodSeeds(app.prisma, [
      // 실제 요리 — 후보에 있어야 한다.
      {
        name: '김치찌개',
        dishType: 'stew',
        mainIngredient: 'pork',
        cuisine: 'korean',
        source: 'menu-canonical',
        popularity: 40,
      },
      // 외식 어휘인데 조리형태가 other — 범주어·부재료라 추천에 뜨면 안 된다.
      {
        name: '소스',
        dishType: 'other',
        mainIngredient: 'other',
        cuisine: 'other',
        source: 'menu-canonical',
        popularity: 100,
      },
      {
        name: '사이드',
        dishType: 'other',
        mainIngredient: 'other',
        cuisine: 'other',
        source: 'menu-canonical',
        popularity: 90,
      },
      // 같은 other 라도 다른 출처(레시피·영양성분)는 진짜 음식일 수 있어 남긴다.
      {
        name: '약고추장',
        dishType: 'other',
        mainIngredient: 'other',
        cuisine: 'korean',
        source: 'mfds-recipe',
        popularity: 80,
      },
      // 음료·주류는 기존 규칙대로 제외.
      { name: '콜라', dishType: 'beverage', source: 'menu-canonical', popularity: 95 },
    ]);
  });
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('menu-canonical + other 는 후보에서 빠지고, 다른 출처의 other 와 실제 요리는 남는다', async () => {
    const pattern = new MealPatternService(app.prisma);
    const profile = buildProfile([], 'dinner', TODAY);
    const candidates = await pattern.buildCandidates(profile, prefs());
    const names = candidates.map((c) => c.name);

    expect(names).toContain('김치찌개');
    expect(names).toContain('약고추장');
    expect(names).not.toContain('소스');
    expect(names).not.toContain('사이드');
    expect(names).not.toContain('콜라');
  });

  it('이력 후보가 likedFoods 와 겹치면 좋아요 신호를 합친다', async () => {
    const pattern = new MealPatternService(app.prisma);
    const profile = buildProfile([item('김치찌개', '2026-08-20')], 'dinner', TODAY);
    const candidates = await pattern.buildCandidates(profile, prefs({ likedFoods: ['김치찌개'] }));
    expect(candidates.find((candidate) => candidate.nameNorm === '김치찌개')).toMatchObject({
      fromHistory: true,
      liked: true,
    });
  });

  it('덜 선호 음식은 후보 풀에서 삭제하지 않는다', async () => {
    const pattern = new MealPatternService(app.prisma);
    const profile = buildProfile([], 'dinner', TODAY);
    const candidates = await pattern.buildCandidates(
      profile,
      prefs({ dislikedFoods: ['김치찌개'] }),
    );
    expect(candidates.map((candidate) => candidate.name)).toContain('김치찌개');
  });
});

describe('isExcluded — 재료까지 본다', () => {
  it('이름에 있으면 뺀다', () => {
    expect(isExcluded(candidate('오이냉국'), ['오이'])).toBe(true);
  });

  it('이름에 없어도 재료 목록에 있으면 뺀다 — 오이가 든 김밥', () => {
    expect(isExcluded(candidate('김밥', { ingredients: ['단무지', '오이', '햄'] }), ['오이'])).toBe(
      true,
    );
  });

  it('상관없는 음식은 남긴다', () => {
    expect(isExcluded(candidate('김치찌개', { ingredients: ['김치', '돼지고기'] }), ['오이'])).toBe(
      false,
    );
  });

  it('제외 목록이 비면 아무것도 걸러지지 않는다', () => {
    expect(isExcluded(candidate('오이무침', { ingredients: ['오이'] }), [])).toBe(false);
  });

  describe('buildProfile — 마지막 섭취일', () => {
    const item = (name: string, eatenDate: string, isMain: boolean): HistoryItem => ({
      eatenDate,
      slot: 'lunch',
      name,
      nameNorm: name,
      foodId: null,
      dishType: null,
      mainIngredient: null,
      cuisine: null,
      isMain,
    });

    it('곁들임으로 먹은 것도 "먹은 것"이다 — 안 먹어봄으로 둔갑하면 안 된다', () => {
      const p = buildProfile(
        [item('삼겹살', '2026-08-16', true), item('냉면', '2026-08-16', false)],
        '2026-08-23',
      );
      expect(p.lastEatenByNorm.get('냉면')).toBe('2026-08-16');
    });

    it('빈도 순위(topFoods)는 그대로 주식만 센다 — 반찬이 순위를 오염시키면 안 된다', () => {
      const p = buildProfile(
        [item('삼겹살', '2026-08-16', true), item('김치', '2026-08-16', false)],
        '2026-08-23',
      );
      expect(p.topFoods.map((f) => f.name)).toEqual(['삼겹살']);
    });
  });
});
