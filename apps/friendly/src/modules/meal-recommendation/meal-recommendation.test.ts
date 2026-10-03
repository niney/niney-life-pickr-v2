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
import { allergensInFoodName } from '../food/food-allergen.js';
import { upsertFoodSeeds } from '../food/food-import.service.js';
import {
  MealPatternService,
  allergenData,
  buildProfile,
  filterForSlot,
  filterForFocus,
  hitsUserAllergen,
  isExcluded,
  isSideLikeCatalogRow,
  recommendationFocus,
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
import { buildMealRecommendationUserPrompt } from './meal-recommendation.prompts.js';

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
  it('음식명은 추정에서 제외하고 재료·구조화 메타를 합쳐 best-effort 경고를 만든다', () => {
    const result = allergenData(
      '이름에만 게가 들어간 음식',
      JSON.stringify(['밀가루 면', '우유', '토마토', '새우']),
      JSON.stringify(['egg']),
      JSON.stringify(['알류: 제품 표시']),
    );
    expect(result.allergenWarnings).toEqual(
      expect.arrayContaining(['egg', 'milk', 'wheat', 'shrimp', 'tomato']),
    );
    expect(result.allergenEvidence.some((value) => value.includes('새우'))).toBe(true);
    expect(result.allergenWarnings).not.toContain('crab');
    expect(result.allergenMetadataKnown).toBe(true);
  });

  it('음식명은 경고·메타가 아니라 사용자 알레르기 제외용 단서(allergenNameHints)로만 쓴다 — 검수 행은 비운다', () => {
    const fried = allergenData('깐풍새우', null, null, null, 'unknown');
    expect(fried.allergenWarnings).toEqual([]);
    expect(fried.allergenMetadataKnown).toBe(false);
    expect(fried.allergenNameHints).toEqual(['shrimp']);
    expect(hitsUserAllergen(fried, ['shrimp'])).toBe(true);
    expect(hitsUserAllergen(fried, ['crab'])).toBe(false);
    // 운영자가 검수한 행은 이름 단서로 덮지 않는다(게맛살에 게가 없다고 확인한 경우).
    expect(allergenData('게맛살', null, '[]', null, 'verified').allergenNameHints).toEqual([]);
  });

  it('음식명 단어 — 보수적으로 잡되 굴비는 조개류가 아니다', () => {
    expect(allergensInFoodName('꽃게찜')).toContain('crab');
    expect(allergensInFoodName('새우전')).toContain('shrimp');
    expect(allergensInFoodName('굴전')).toContain('shellfish');
    expect(allergensInFoodName('굴비구이')).not.toContain('shellfish');
    expect(allergensInFoodName('닭볶음탕')).toContain('chicken');
    expect(allergensInFoodName('우유식빵')).toEqual(expect.arrayContaining(['milk', 'wheat']));
    expect(allergensInFoodName('비빔밥')).toEqual([]);
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

  it('어제 먹은 음식은 variety 가 낮고, 안 먹어본 음식은 novelty 만점·variety 중립', () => {
    const recent = scoreCandidate(
      candidate('김치찌개', { dishType: 'stew', fromHistory: true }),
      ctx,
    );
    const fresh = scoreCandidate(
      candidate('연어초밥', { dishType: 'raw_fish', mainIngredient: 'fish' }),
      ctx,
    );
    expect(recent.features.variety).toBeLessThan(0.2);
    // 새로움은 novelty 한 곳에서만 센다 — variety 까지 만점이면 미경험이 취향을 늘 이긴다.
    expect(fresh.features.variety).toBe(0.5);
    expect(fresh.features.novelty).toBe(1);
    expect(fresh.score).toBeGreaterThan(recent.score);
    expect(fresh.tags).toContain('새로운 음식');
  });

  it('열흘 전에 자주 먹은 음식이 처음 보는 음식보다 앞선다(기본 가중치)', () => {
    const p = buildProfile(
      [
        item('비빔밥', '2026-08-12', {
          dishType: 'rice',
          mainIngredient: 'vegetable',
          cuisine: 'korean',
        }),
        item('비빔밥', '2026-08-02', {
          dishType: 'rice',
          mainIngredient: 'vegetable',
          cuisine: 'korean',
        }),
        item('김치찌개', '2026-08-21', {
          dishType: 'stew',
          mainIngredient: 'pork',
          cuisine: 'korean',
        }),
      ],
      'lunch',
      TODAY,
    );
    const familiar = scoreCandidate(
      candidate('비빔밥', {
        dishType: 'rice',
        mainIngredient: 'vegetable',
        cuisine: 'korean',
        fromHistory: true,
      }),
      { ...ctx, profile: p },
    );
    const unknown = scoreCandidate(
      candidate('가자미찜', { dishType: 'steam', mainIngredient: 'fish', cuisine: 'korean' }),
      { ...ctx, profile: p },
    );
    expect(familiar.score).toBeGreaterThan(unknown.score);
  });

  it('오늘 먹은 음식은 취향이 가장 높아도 다음 끼니로 다시 올라오지 않는다', () => {
    const p = buildProfile(
      [
        item('비빔밥', TODAY, { dishType: 'rice', mainIngredient: 'vegetable', cuisine: 'korean' }),
        item('비빔밥', '2026-08-15', {
          dishType: 'rice',
          mainIngredient: 'vegetable',
          cuisine: 'korean',
        }),
        item('칼국수', '2026-08-12', {
          dishType: 'noodle',
          mainIngredient: 'grain',
          cuisine: 'korean',
        }),
      ],
      'dinner',
      TODAY,
    );
    const dinnerCtx = { ...ctx, profile: p, targetSlot: 'dinner' as const };
    const justEaten = scoreCandidate(
      candidate('비빔밥', {
        dishType: 'rice',
        mainIngredient: 'vegetable',
        cuisine: 'korean',
        fromHistory: true,
      }),
      dinnerCtx,
    );
    const weekAgo = scoreCandidate(
      candidate('칼국수', {
        dishType: 'noodle',
        mainIngredient: 'grain',
        cuisine: 'korean',
        fromHistory: true,
      }),
      dinnerCtx,
    );
    const unknown = scoreCandidate(
      candidate('가자미찜', { dishType: 'steam', mainIngredient: 'fish' }),
      dinnerCtx,
    );
    expect(justEaten.features.taste).toBe(1);
    expect(justEaten.features.recent).toBe(0.2);
    expect(justEaten.score).toBeLessThan(weekAgo.score);
    expect(justEaten.score).toBeLessThan(unknown.score);
  });

  it('아침엔 무거운 요리를 후보에서 빼되 아침에 먹던 음식은 남기고, 너무 적으면 가벼운 것을 앞에 둔다', () => {
    const p = buildProfile(
      [
        item('삼겹살구이', '2026-08-20', {
          slot: 'breakfast',
          dishType: 'grill',
          mainIngredient: 'pork',
        }),
      ],
      'breakfast',
      TODAY,
    );
    const pool = [
      candidate('스테이크', { dishType: 'grill' }),
      candidate('삼겹살구이', { dishType: 'grill', fromHistory: true }),
      candidate('토스트', { dishType: 'bakery' }),
      candidate('달걀찜', { dishType: 'steam' }),
      candidate('김치찌개', { dishType: 'stew' }),
      candidate('콩나물국', { dishType: 'soup' }),
    ];
    const names = (list: typeof pool) => list.map((c) => c.name);
    expect(names(filterForSlot(pool, p, 'breakfast'))).toEqual([
      '삼겹살구이',
      '토스트',
      '달걀찜',
      '콩나물국',
    ]);
    // 아침이 아니면 그대로.
    expect(filterForSlot(pool, p, 'lunch')).toHaveLength(pool.length);
    // 가벼운 것이 모자라면 앞에 두고 무거운 것을 뒤에 붙인다(추천이 비지 않게).
    const few = [
      candidate('스테이크', { dishType: 'grill' }),
      candidate('토스트', { dishType: 'bakery' }),
    ];
    expect(names(filterForSlot(few, buildProfile([], 'breakfast', TODAY), 'breakfast'))).toEqual([
      '토스트',
      '스테이크',
    ]);
    // 아침에 먹던 무거운 요리는 감점도 하지 않는다.
    const habit = scoreCandidate(
      candidate('삼겹살구이', { dishType: 'grill', fromHistory: true }),
      {
        ...ctx,
        profile: p,
        targetSlot: 'breakfast',
      },
    );
    expect(habit.features.slot).toBeCloseTo(1.1);
  });

  it('👎·덜 선호는 안 먹어 본 음식에도 최종 점수를 깎는다', () => {
    const base = scoreCandidate(candidate('시금치무침', { dishType: 'salad' }), ctx);
    const ratedDown = scoreCandidate(candidate('시금치무침', { dishType: 'salad' }), {
      ...ctx,
      profile: buildProfile([], 'lunch', TODAY, [
        {
          targetDate: TODAY,
          candidateNames: ['시금치무침'],
          pickedName: null,
          rating: -1,
          logged: false,
        },
      ]),
    });
    const disliked = scoreCandidate(candidate('고수샐러드', { dishType: 'salad' }), {
      ...ctx,
      preference: prefs({ dislikedFoods: ['고수'] }),
    });
    // 취향은 이미 0 이라 더 내려가지 않는다 — 그래서 최종 점수에서 직접 깎는다.
    expect(base.features.taste).toBe(0);
    expect(ratedDown.features.taste).toBe(0);
    expect(ratedDown.features.aversion).toBeCloseTo(0.4);
    expect(ratedDown.score).toBeLessThan(base.score * 0.7);
    expect(disliked.features.aversion).toBeCloseTo(0.5);
    expect(disliked.score).toBeLessThan(base.score * 0.6);
  });

  it('아침엔 구이·튀김·찌개류를 덜고, 그 끼니에 자주 먹던 음식은 올린다', () => {
    const grill = candidate('삼겹살구이', { dishType: 'grill', mainIngredient: 'pork' });
    const atLunch = scoreCandidate(grill, ctx);
    const atBreakfast = scoreCandidate(grill, { ...ctx, targetSlot: 'breakfast' });
    expect(atBreakfast.features.slot).toBe(0.75);
    expect(atBreakfast.score).toBeLessThan(atLunch.score);
    expect(
      scoreCandidate(candidate('토스트', { dishType: 'bakery' }), {
        ...ctx,
        targetSlot: 'breakfast',
      }).tags,
    ).toContain('아침에 가볍게');
    // 이 프로필의 점심 습관은 김치찌개 — 점심에는 1.1 배.
    const habit = scoreCandidate(
      candidate('김치찌개', { dishType: 'stew', fromHistory: true }),
      ctx,
    );
    expect(habit.features.slot).toBeCloseTo(1.1);
    expect(habit.tags).toContain('점심에 자주');
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

  it('차게 먹는 국물(냉국·물회)은 국 분류여도 추운 날 국물로 치지 않는다', () => {
    const cold = { ...ctx, tempC: 4 };
    const warmSoup = scoreCandidate(candidate('된장국', { dishType: 'soup' }), cold);
    const chilledSoup = scoreCandidate(candidate('오이냉국', { dishType: 'soup' }), cold);
    expect(warmSoup.features.weather).toBe(1);
    expect(chilledSoup.features.weather).toBeLessThan(0.5);
    expect(chilledSoup.tags).not.toContain('추운 날 국물');
    const hot = scoreCandidate(candidate('오이냉국', { dishType: 'soup' }), { ...ctx, tempC: 30 });
    expect(hot.tags).toContain('더운 날 시원하게');
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
      // other 는 출처와 상관없이 탐색 후보에서 뺀다 — dev 식약처 other 13행이 전부 양념·소스·견과·과일이었고
      // 소스/드레싱이 저녁 후보에 올랐다(2026-10-04 설정 점검).
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
      // 반찬(김치·나물)과 원재료 카탈로그는 끼니 후보가 아니다(2026-10-04 프로빙).
      {
        name: '가자미식해',
        dishType: 'kimchi',
        mainIngredient: 'fish',
        source: 'mfds-nutrition',
        popularity: 90,
      },
      {
        name: '가지나물',
        dishType: 'namul',
        mainIngredient: 'vegetable',
        source: 'mfds-nutrition',
        popularity: 90,
      },
      {
        name: '감자',
        dishType: 'steam',
        mainIngredient: 'vegetable',
        source: 'mfds-raw',
        popularity: 90,
      },
      // 반찬급 — 저칼로리 무침·냉국과 생채·무침류 반찬은 탐색 후보에서 빠지고, 샐러드·한 끼 무침은 남는다.
      ...(
        [
          ['해파리냉채', 'salad', '생채·무침류', 26],
          ['도라지생채', 'salad', '생채·무침류', 123],
          ['오이냉국', 'soup', '국 및 탕류', 19],
          ['닭가슴살 샐러드', 'salad', '생채·무침류', 111],
          ['물회', 'salad', '생채·무침류', 532],
          ['육개장', 'soup', '국 및 탕류', 450],
        ] as const
      ).map(([name, dishType, sourceCategory, kcal]) => ({
        name,
        dishType,
        sourceCategory,
        servingG: 100,
        nutrition: { kcal, carbG: null, proteinG: null, fatG: null, sodiumMg: null, sugarG: null },
        source: 'mfds-nutrition' as const,
        popularity: 85,
      })),
      // 식약처 식품중량 100g 짜리 주식 — 건강 판정은 한 끼(볶음 통상 250g) 기준이어야 한다.
      {
        name: '제육볶음',
        dishType: 'stir_fry',
        mainIngredient: 'pork',
        sourceCategory: '볶음류',
        servingG: 100,
        nutrition: { kcal: 151, carbG: null, proteinG: 12, fatG: null, sodiumMg: 220, sugarG: null },
        source: 'mfds-nutrition',
        popularity: 99,
      },
      // 알레르기 — 이름에만 새우가 보이는 음식(재료 정보 없음).
      {
        name: '깐풍새우',
        dishType: 'fried',
        mainIngredient: 'seafood',
        source: 'mfds-nutrition',
        popularity: 0,
      },
      // 인기가 같은(0) 요리 여럿 — 가나다순 앞쪽만 뽑히면 안 된다.
      ...Array.from({ length: 60 }, (_, i) => ({
        name: `${String.fromCharCode(0xac00 + i * 180)}테스트요리${i}`,
        dishType: 'rice' as const,
        mainIngredient: 'grain' as const,
        cuisine: 'korean' as const,
        source: 'mfds-nutrition' as const,
        popularity: 0,
      })),
    ]);
  });
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('조리형태 other 는 출처와 상관없이 탐색 후보에서 빠지고 실제 요리는 남는다', async () => {
    const pattern = new MealPatternService(app.prisma);
    const profile = buildProfile([], 'dinner', TODAY);
    const candidates = await pattern.buildCandidates(profile, prefs());
    const names = candidates.map((c) => c.name);

    expect(names).toContain('김치찌개');
    expect(names).not.toContain('약고추장');
    expect(names).not.toContain('소스');
    expect(names).not.toContain('사이드');
    expect(names).not.toContain('콜라');
  });

  it('김치·나물 반찬과 원재료 카탈로그는 인기가 높아도 후보에서 빠진다', async () => {
    const pattern = new MealPatternService(app.prisma);
    const names = (
      await pattern.buildCandidates(buildProfile([], 'dinner', TODAY), prefs(), TODAY)
    ).map((c) => c.name);
    expect(names).not.toContain('가자미식해');
    expect(names).not.toContain('가지나물');
    expect(names).not.toContain('감자');
  });

  it('인기가 같은 카탈로그 후보는 가나다순이 아니라 날짜마다 바뀌는 고정 순서로 섞인다', async () => {
    const pattern = new MealPatternService(app.prisma);
    const pick = async (seed: string) =>
      (await pattern.buildCandidates(buildProfile([], 'dinner', TODAY), prefs(), seed))
        .map((c) => c.name)
        .filter((n) => n.includes('테스트요리'));
    const day1 = await pick('2026-10-04');
    // 같은 날엔 같은 후보(추천 캐시 키와 맞물린다).
    expect(await pick('2026-10-04')).toEqual(day1);
    expect(day1.length).toBeGreaterThan(5);
    // 첫 글자가 가나다순 앞쪽(가~나 구간)에만 몰리지 않는다.
    const firstChars = new Set(day1.map((n) => n.charCodeAt(0)));
    expect([...firstChars].some((code) => code > 0xac00 + 30 * 180)).toBe(true);
    expect(await pick('2026-10-05')).not.toEqual(day1);
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

  it('반찬급(저칼로리 무침·냉국, 생채·무침류 반찬)은 탐색 후보에서 빠지고 샐러드·한 끼 무침·국밥류는 남는다', async () => {
    const pattern = new MealPatternService(app.prisma);
    const names = (
      await pattern.buildCandidates(buildProfile([], 'dinner', TODAY), prefs(), TODAY)
    ).map((c) => c.name);
    expect(names).not.toContain('해파리냉채');
    expect(names).not.toContain('도라지생채');
    expect(names).not.toContain('오이냉국');
    expect(names).toEqual(expect.arrayContaining(['닭가슴살 샐러드', '물회', '육개장']));
  });

  it('후보 영양(건강 판정)은 식단 저장과 같은 한 끼 1인분 기준이다', async () => {
    const pattern = new MealPatternService(app.prisma);
    const jeyuk = (await pattern.buildCandidates(buildProfile([], 'dinner', TODAY), prefs(), TODAY)).find(
      (c) => c.name === '제육볶음',
    );
    // 100g 151kcal → 볶음 통상 250g.
    expect(jeyuk?.kcal).toBeCloseTo(377.5);
    expect(jeyuk?.sodiumMg).toBeCloseTo(550);
  });

  it('내가 먹던 반찬급 음식은 후보에 남는다(탐색 후보에만 적용)', async () => {
    const pattern = new MealPatternService(app.prisma);
    const profile = buildProfile([item('해파리냉채', '2026-08-10')], 'dinner', TODAY);
    const names = (await pattern.buildCandidates(profile, prefs(), TODAY)).map((c) => c.name);
    expect(names).toContain('해파리냉채');
  });

  it('알레르기는 재료 정보가 없어도 음식명으로 거른다 — 좋아함·내 기록이어도', async () => {
    const pattern = new MealPatternService(app.prisma);
    const profile = buildProfile([item('새우튀김', '2026-08-10')], 'dinner', TODAY);
    const liked = prefs({ likedFoods: ['깐풍새우'] });
    const without = (await pattern.buildCandidates(profile, liked, TODAY)).map((c) => c.name);
    expect(without).toEqual(expect.arrayContaining(['깐풍새우', '새우튀김']));

    const allergic = (
      await pattern.buildCandidates(profile, { ...liked, allergens: ['shrimp'] }, TODAY)
    ).map((c) => c.name);
    expect(allergic).not.toContain('깐풍새우');
    expect(allergic).not.toContain('새우튀김');
    expect(allergic).toContain('김치찌개');
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

describe('isSideLikeCatalogRow · 프롬프트 알레르기', () => {
  const row = (
    name: string,
    dishType: string | null,
    sourceCategory: string | null,
    kcal: number | null,
  ) => ({
    name,
    dishType,
    sourceCategory,
    kcal,
  });
  it('기타·저칼로리 무침/국·생채무침류 반찬은 반찬급, 샐러드·고칼로리 한 끼·다른 분류는 아니다', () => {
    expect(isSideLikeCatalogRow(row('소스/드레싱', 'other', '장류, 양념류', 890))).toBe(true);
    expect(isSideLikeCatalogRow(row('해파리냉채', 'salad', '생채·무침류', 26))).toBe(true);
    expect(isSideLikeCatalogRow(row('토란국', 'soup', '국 및 탕류', 64))).toBe(true);
    expect(isSideLikeCatalogRow(row('도라지생채', 'salad', '생채·무침류', 123))).toBe(true);
    expect(isSideLikeCatalogRow(row('닭가슴살 샐러드', 'salad', '생채·무침류', 111))).toBe(false);
    expect(isSideLikeCatalogRow(row('물회', 'salad', '생채·무침류', 532))).toBe(false);
    expect(isSideLikeCatalogRow(row('갈비탕', 'soup', '국 및 탕류', 500))).toBe(false);
    // kcal 을 모르는 국·찌개는 판단하지 않는다.
    expect(isSideLikeCatalogRow(row('된장찌개', 'stew', null, null))).toBe(false);
  });

  it('알레르기는 프롬프트에 절대 제외로 들어간다', () => {
    const prompt = buildMealRecommendationUserPrompt({
      profileText: '요약',
      candidates: [],
      targetSlot: 'dinner',
      targetDate: TODAY,
      mealType: null,
      weights: MEAL_DEFAULT_WEIGHTS,
      excludedFoods: [],
      dislikedFoods: [],
      allergens: ['shrimp', 'crab'],
      note: null,
      entryCount: 10,
    });
    expect(prompt).toMatch(/\[알레르기[^\]]*\] 새우, 게/);
  });

  it('가장 높은 중요도(4 이상)를 이번 추천의 중심으로 적는다', () => {
    const promptFor = (weights: typeof MEAL_DEFAULT_WEIGHTS) =>
      buildMealRecommendationUserPrompt({
        profileText: '요약',
        candidates: [],
        targetSlot: 'dinner',
        targetDate: TODAY,
        mealType: null,
        weights,
        excludedFoods: [],
        dislikedFoods: [],
        allergens: [],
        note: null,
        entryCount: 10,
      });
    expect(promptFor({ ...MEAL_DEFAULT_WEIGHTS, health: 5 })).toMatch(
      /\[이번 추천의 중심\] 건강 — 튀김/,
    );
    // 기본값은 겹침 피하기·내 취향(4) 둘 다.
    expect(promptFor(MEAL_DEFAULT_WEIGHTS)).toMatch(
      /\[이번 추천의 중심\] 겹침 피하기 — .* \/ 내 취향 — /,
    );
    // 모두 3 이하면 중심 없음.
    const flat = Object.fromEntries(
      Object.keys(MEAL_DEFAULT_WEIGHTS).map((k) => [k, 3]),
    ) as typeof MEAL_DEFAULT_WEIGHTS;
    expect(promptFor(flat)).not.toContain('[이번 추천의 중심]');
  });
});

describe('이번 추천의 중심 — recommendationFocus · filterForFocus', () => {
  const scored = (name: string, health: number, balance = 0.6, liked = false) => ({
    ...candidate(name, { liked }),
    score: 0.5,
    tags: [],
    lastEatenDate: null,
    features: { health, balance },
  });
  const pool = [
    scored('양념치킨', 0.35, 0.8),
    scored('야채빵', 0.35, 0.7),
    scored('닭가슴살 샐러드', 0.9, 0.9),
    scored('비빔밥', 0.6, 0.4),
    scored('된장찌개', 0.5, 0.3),
  ];
  const names = (xs: { name: string }[]) => xs.map((c) => c.name);

  it('가장 높은 중요도(4 이상)가 중심이고, 메모에 가볍게 먹고 싶다는 말이 있으면 건강을 더한다', () => {
    expect([...recommendationFocus(MEAL_DEFAULT_WEIGHTS, null)]).toEqual(['variety', 'taste']);
    expect([...recommendationFocus({ ...MEAL_DEFAULT_WEIGHTS, health: 5 }, null)]).toEqual([
      'health',
    ]);
    expect(recommendationFocus(MEAL_DEFAULT_WEIGHTS, '가볍게').has('health')).toBe(true);
    expect(recommendationFocus(MEAL_DEFAULT_WEIGHTS, '담백한 걸로').has('health')).toBe(true);
    expect(recommendationFocus(MEAL_DEFAULT_WEIGHTS, '국물 있는 걸로').has('health')).toBe(false);
  });

  it('건강 중심이면 건강 점수가 중립 아래인 후보(튀김·빵)를 뺀다 — 좋아함은 남긴다', () => {
    const health = new Set(['health'] as const);
    expect(names(filterForFocus(pool, health))).toEqual(['닭가슴살 샐러드', '비빔밥', '된장찌개']);
    const liked = [scored('양념치킨', 0.35, 0.8, true), ...pool.slice(1)];
    expect(names(filterForFocus(liked, health))).toContain('양념치킨');
  });

  it('균형 중심이면 균형 점수가 후보 중앙값 아래인 후보(최근 많이 먹은 쪽)를 뺀다', () => {
    expect(names(filterForFocus(pool, new Set(['balance'] as const)))).toEqual([
      '양념치킨',
      '야채빵',
      '닭가슴살 샐러드',
    ]);
  });

  it('필터가 없는 중심이면 그대로, 빼고 너무 적으면 뺀 것을 뒤에 붙인다', () => {
    expect(filterForFocus(pool, new Set(['variety', 'taste'] as const))).toEqual(pool);
    const few = [scored('양념치킨', 0.35), scored('비빔밥', 0.6)];
    expect(names(filterForFocus(few, new Set(['health'] as const), 3))).toEqual([
      '비빔밥',
      '양념치킨',
    ]);
  });

  it('분류를 모르는 축은 균형에서 빼고, 셋 다 모르면 중립', () => {
    const profile = buildProfile(
      [
        item('김치찌개', '2026-08-21', {
          dishType: 'stew',
          mainIngredient: 'pork',
          cuisine: 'korean',
        }),
        item('된장찌개', '2026-08-20', {
          dishType: 'stew',
          mainIngredient: 'tofu_bean',
          cuisine: 'korean',
        }),
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
    // 계통만 아는 한식 — 모르는 조리형태·주재료를 '안 먹은 축'으로 세지 않는다.
    const onlyCuisine = scoreCandidate(candidate('한식 무언가', { cuisine: 'korean' }), ctx);
    expect(onlyCuisine.features.balance).toBe(0);
    expect(scoreCandidate(candidate('정체불명'), ctx).features.balance).toBe(0.5);
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
