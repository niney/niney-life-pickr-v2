import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { AsyncGate } from '../../lib/async-gate.js';
import { normalizeTerm } from '../../lib/text.js';
import { DEFAULT_LEXICON, MenuNutritionEngine, buildCatalogIndex, catalogRow } from '../food/engine/index.js';
import type { ServingCatalogRow } from '../food/food-serving.js';
import type { WebEstimateHit } from '../food/food-web-estimate.service.js';
import type { MenuLlmMatchLookup } from '../food/menu-llm-match.service.js';
import { MealNutritionEstimator } from './meal-nutrition-estimate.js';

// 식단 이름 추정 — 카탈로그로 못 채운 이름을 규칙 → LLM 매칭 → 웹 실측 캐시 순으로 "○○ 기준 추정"으로 채운다.
// DB·LLM·웹 없이 인메모리 카탈로그와 가짜 캐시로 단계별 규칙과 백그라운드 채우기를 고정한다.

const rows = [
  catalogRow('해장국', { dishType: 'soup', servingG: 800, kcal: 208, kcalPer100g: 26 }),
  catalogRow('뼈다귀해장국', { dishType: 'soup', servingG: 650, kcal: 136.5, kcalPer100g: 21 }),
];
const engine = new MenuNutritionEngine(buildCatalogIndex(rows));
const servingRows = new Map<string, ServingCatalogRow>(
  rows.map((r) => [
    r.id,
    { ...r, proteinG: r.name === '해장국' ? 16 : null, sodiumMg: r.name === '해장국' ? 2400 : null },
  ]),
);

const makeLlm = (verdicts: Record<string, MenuLlmMatchLookup>) => {
  const store = new Map<string, MenuLlmMatchLookup>();
  const asked: string[][] = [];
  return {
    asked,
    lookupCached: vi.fn(async (names: string[]) => {
      const out = new Map<string, MenuLlmMatchLookup>();
      for (const n of names) if (store.has(n)) out.set(n, store.get(n)!);
      return out;
    }),
    matchMany: vi.fn(async (names: string[]) => {
      const fresh = names.filter((n) => !store.has(n));
      asked.push(fresh);
      for (const n of fresh) store.set(n, verdicts[n] ?? { hit: null, canonical: null });
      return new Map();
    }),
  };
};

const makeWeb = (results: Record<string, WebEstimateHit | null>) => {
  const store = new Map<string, WebEstimateHit | null>();
  const asked: string[][] = [];
  return {
    asked,
    lookupCached: vi.fn(async (names: string[]) => {
      const out = new Map<string, WebEstimateHit | null>();
      for (const n of names) if (store.has(n)) out.set(n, store.get(n)!);
      return out;
    }),
    estimateMany: vi.fn(async (names: string[]) => {
      asked.push(names);
      for (const n of names) store.set(n, results[n] ?? null);
      return new Map();
    }),
  };
};

const makeEstimator = (opts: {
  llm?: ReturnType<typeof makeLlm>;
  web?: ReturnType<typeof makeWeb>;
  prisma?: unknown;
  gate?: AsyncGate;
}) =>
  new MealNutritionEstimator({
    prisma: (opts.prisma ?? {}) as PrismaClient,
    food: {
      getServingRow: async (id: string) => servingRows.get(id) ?? null,
      servingLexicon: async () => DEFAULT_LEXICON,
    },
    resolver: { resolve: async (name: string) => engine.resolve(name) },
    ...(opts.llm ? { llm: opts.llm } : {}),
    ...(opts.web ? { web: opts.web } : {}),
    ...(opts.gate ? { gate: opts.gate } : {}),
  });

describe('MealNutritionEstimator.lookup', () => {
  it('규칙 엔진이 잡는 이름은 그 카탈로그 1인분을 빌려 추정으로 밝힌다', async () => {
    const est = makeEstimator({});
    const { estimate, askable } = await est.lookup('얼큰해장국', true);
    expect(askable).toBe(false);
    expect(estimate).toMatchObject({ kcal: 208, proteinG: 16, sodiumMg: 2400, basis: 'donor_estimate', nutritionFrom: '해장국' });
  });

  it('LLM 에 안 물어본 이름은 askable, 물어본 뒤엔 LLM 이 고른 카탈로그 음식으로 채운다(웹은 안 간다)', async () => {
    const llm = makeLlm({ 뼈다귀우거지탕: { hit: null, canonical: '뼈다귀해장국' } });
    const web = makeWeb({});
    const est = makeEstimator({ llm, web });
    expect(await est.lookup('뼈다귀우거지탕', true)).toEqual({ estimate: null, askable: true });

    await est.ask(['뼈다귀우거지탕']);
    const { estimate } = await est.lookup('뼈다귀우거지탕', true);
    expect(estimate).toMatchObject({ kcal: 136.5, basis: 'donor_estimate', nutritionFrom: '뼈다귀해장국' });
    expect(web.estimateMany).not.toHaveBeenCalled();
  });

  it('LLM 도 카탈로그로 못 이으면 웹 실측 100g당 × 이름으로 짐작한 종류의 통상 1인분', async () => {
    const llm = makeLlm({ 우거지탕: { hit: null, canonical: null } });
    const web = makeWeb({ 우거지탕: { kcalPer100g: 38, agreeing: 1, basis: 'single', source: 'fatsecret.kr' } });
    const est = makeEstimator({ llm, web });
    await est.ask(['우거지탕']);
    expect(web.asked).toEqual([['우거지탕']]);
    const { estimate, askable } = await est.lookup('우거지탕', true);
    expect(askable).toBe(false);
    // 탕 → 국·탕 통상 1인분 500g. 웹은 단백질·나트륨을 주지 않는다.
    expect(estimate).toMatchObject({
      kcal: 190,
      proteinG: null,
      sodiumMg: null,
      basis: 'donor_estimate',
      nutritionFrom: '우거지탕(fatsecret.kr 1건) · 국·탕 통상 1인분 500g',
    });
  });

  it('웹에도 없거나 종류를 몰라 양을 정할 수 없으면 비운다', async () => {
    const llm = makeLlm({});
    const web = makeWeb({ 이상한음식: { kcalPer100g: 100, agreeing: 3, basis: 'multi', source: 'fatsecret.kr' } });
    const est = makeEstimator({ llm, web });
    await est.ask(['없는음식', '이상한음식']);
    expect(await est.lookup('없는음식', true)).toEqual({ estimate: null, askable: false });
    expect(await est.lookup('이상한음식', true)).toEqual({ estimate: null, askable: false });
  });

  it('너무 짧거나 긴 이름은 외부로 보내지 않는다', async () => {
    const llm = makeLlm({});
    const est = makeEstimator({ llm });
    expect(await est.lookup('국', true)).toEqual({ estimate: null, askable: false });
    await est.ask(['국', '가'.repeat(31)]);
    expect(llm.matchMany).not.toHaveBeenCalled();
  });
});

describe('MealNutritionEstimator 채우기', () => {
  const makePrisma = (items: Array<{ id: string; name: string; isMain: boolean; portion: string | null; servings: number | null }>) => {
    const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
    return {
      updates,
      mealItem: {
        findMany: vi.fn(async ({ where }: { where: { nameNorm: { in: string[] } } }) =>
          items.filter((i) => where.nameNorm.in.includes(normalizeTerm(i.name))),
        ),
        updateMany: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push({ id: where.id, data });
          return { count: 1 };
        }),
      },
    };
  };

  it('빈 항목을 양(서수·인분 수)까지 곱해 채우고, 못 찾은 이름은 건드리지 않는다', async () => {
    const prisma = makePrisma([
      { id: 'i1', name: '얼큰해장국', isMain: true, portion: 'large', servings: null },
      { id: 'i2', name: '얼큰해장국', isMain: true, portion: null, servings: 0.5 },
      { id: 'i3', name: '모르는음식', isMain: true, portion: null, servings: null },
    ]);
    const est = makeEstimator({ prisma });
    expect(await est.fillMissingItems(['얼큰해장국', '모르는음식'])).toBe(2);
    expect(prisma.updates).toEqual([
      { id: 'i1', data: { kcal: 312, proteinG: 24, sodiumMg: 3600, nutritionFrom: '해장국', nutritionBasis: 'donor_estimate' } },
      { id: 'i2', data: { kcal: 104, proteinG: 8, sodiumMg: 1200, nutritionFrom: '해장국', nutritionBasis: 'donor_estimate' } },
    ]);
  });

  it('schedule — 저장 뒤 물어보고 채우며, 묻는 중인 이름은 겹쳐 띄우지 않는다. LLM 이 없으면 띄우지 않는다', async () => {
    const prisma = makePrisma([{ id: 'i1', name: '뼈다귀우거지탕', isMain: true, portion: null, servings: null }]);
    const llm = makeLlm({ 뼈다귀우거지탕: { hit: null, canonical: '뼈다귀해장국' } });
    const est = makeEstimator({ llm, web: makeWeb({}), prisma, gate: new AsyncGate(1, { maxQueue: 8 }) });
    expect(est.schedule(['뼈다귀우거지탕', '뼈다귀우거지탕'])).toBe(1);
    expect(est.schedule(['뼈다귀우거지탕'])).toBe(0);
    await vi.waitFor(() => expect(prisma.updates).toHaveLength(1));
    expect(prisma.updates[0]!.data).toMatchObject({ kcal: 137, nutritionFrom: '뼈다귀해장국' });
    // 끝나면 다시 띄울 수 있다(이미 물어봤으니 LLM 은 다시 안 묻는다).
    await vi.waitFor(() => expect(est.schedule(['뼈다귀우거지탕'])).toBe(1));
    await vi.waitFor(() => expect(llm.matchMany).toHaveBeenCalledTimes(2));
    expect(llm.asked[1]).toEqual([]);

    expect(makeEstimator({ prisma }).schedule(['뼈다귀우거지탕'])).toBe(0);
  });
});
