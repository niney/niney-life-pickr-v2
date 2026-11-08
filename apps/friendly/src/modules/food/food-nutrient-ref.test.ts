import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { AdapterCache } from '../ai/adapter-cache.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import {
  FOOD_NUTRIENT_REF_VERSION,
  buildNutrientRefIndex,
  isNutrientProfileRow,
  resolveNutrientRefByRules,
  type NutrientRefCandidate,
  type NutrientRefTarget,
} from './food-nutrient-ref.js';
import { FoodNutrientRefService, decideNutrientRef } from './food-nutrient-ref.service.js';

const cand = (id: string, name: string, over: Partial<NutrientRefCandidate> = {}): NutrientRefCandidate => ({
  id,
  name,
  nameNorm: name.replace(/\s+/g, ''),
  aliasNormsJson: '[]',
  dishType: null,
  mainIngredient: null,
  kcal: 300,
  servingG: 200,
  kcalPer100g: 150,
  ...over,
});
const target = (name: string, over: Partial<NutrientRefTarget> = {}): NutrientRefTarget => ({
  name,
  nameNorm: name.replace(/\s+/g, ''),
  dishType: null,
  nutritionFrom: null,
  ...over,
});

const CANDS = [
  cand('rice', '쌀밥', { dishType: 'rice', kcalPer100g: 166 }),
  cand('fried', '닭튀김', { dishType: 'fried' }),
  cand('soup', '해장국', { dishType: 'soup' }),
  cand('eggroll', '달걀말이', { dishType: 'pancake' }),
  cand('pickle', '무초절임(치킨무)', { dishType: 'kimchi', aliasNormsJson: '["치킨무","무초절임"]' }),
  cand('stew', '감자탕', { dishType: 'stew' }),
  cand('bul1', '소불고기', { dishType: 'grill', kcal: 300 }),
  cand('bul2', '돼지불고기', { dishType: 'grill', kcal: 420 }),
  cand('bul3', '오징어불고기', { dishType: 'grill', kcal: 200 }),
  cand('galbi', '갈비', { dishType: 'grill', mainIngredient: 'beef' }),
  cand('gimbap', '김밥', { dishType: 'rice', mainIngredient: 'grain' }),
];
const INDEX = buildNutrientRefIndex(CANDS);

describe('isNutrientProfileRow', () => {
  it('비타민·무기질 + 100g당 열량이 있어야 기준 음식', () => {
    const base = { kcalPer100g: 150, kcal: null, servingG: null };
    expect(isNutrientProfileRow({ ...base, nutrientsPer100gJson: '{"calciumMg":3}' })).toBe(true);
    // 단백질·나트륨만 있으면 기준이 못 된다(점검은 스냅샷이 먼저).
    expect(isNutrientProfileRow({ ...base, nutrientsPer100gJson: '{"proteinG":3,"sodiumMg":1}' })).toBe(false);
    // 100g당 탄수화물·지방·당류만 있어도 비타민 기준은 못 된다(탄단지는 비타민·무기질이 아니다).
    expect(isNutrientProfileRow({ ...base, nutrientsPer100gJson: '{"carbG":20,"fatG":3,"sugarG":1}' })).toBe(false);
    // 100g당 열량을 모르면(빌려온 영양만 있는 외식 어휘 — 운영 '치킨') 기준이 못 된다.
    expect(isNutrientProfileRow({ kcalPer100g: null, kcal: 342, servingG: null, nutrientsPer100gJson: '{"calciumMg":3}' })).toBe(false);
    // 1인분 열량·중량으로 역산되면 된다.
    expect(isNutrientProfileRow({ kcalPer100g: null, kcal: 300, servingG: 200, nutrientsPer100gJson: '{"ironMg":1}' })).toBe(true);
    expect(isNutrientProfileRow({ ...base, nutrientsPer100gJson: null })).toBe(false);
  });
});

describe('resolveNutrientRefByRules', () => {
  it('고정 동의 표 — 글자가 안 겹치는 흔한 짝', () => {
    expect(resolveNutrientRefByRules(target('공기밥'), INDEX)).toMatchObject({ method: 'synonym', candidate: { id: 'rice' } });
    expect(resolveNutrientRefByRules(target('치킨'), INDEX)).toMatchObject({ method: 'synonym', candidate: { id: 'fried' } });
  });

  it('같은 이름 → 빌려온 원래 행 → 동의어 변형·별칭', () => {
    expect(resolveNutrientRefByRules(target('해장국'), INDEX)?.method).toBe('same');
    expect(
      resolveNutrientRefByRules(target('불고기정식', { nutritionFrom: '소불고기 외 8종 중앙값' }), INDEX),
    ).toMatchObject({ method: 'borrowed', candidate: { id: 'bul1' } });
    // 어휘 동의어(계란↔달걀).
    expect(resolveNutrientRefByRules(target('계란말이'), INDEX)).toMatchObject({ method: 'synonym', candidate: { id: 'eggroll' } });
    // 후보 별칭.
    expect(resolveNutrientRefByRules(target('치킨무'), INDEX)).toMatchObject({ method: 'synonym', candidate: { id: 'pickle' } });
  });

  it('핵심어(뒤 낱말) — 조리형태가 다르면 안 잇고, 범주어·한 글자는 핵심어가 아니다', () => {
    expect(resolveNutrientRefByRules(target('소고기 해장국', { dishType: 'soup' }), INDEX)).toMatchObject({
      method: 'rule',
      candidate: { id: 'soup' },
    });
    expect(resolveNutrientRefByRules(target('소고기 해장국', { dishType: 'stir_fry' }), INDEX)).toBeNull();
    // '우거지탕' 은 '탕'(범주어)으로 감자탕에 잇지 않는다 — LLM 몫.
    expect(resolveNutrientRefByRules(target('우거지탕'), INDEX)).toBeNull();
  });

  it('주재료가 다른 고기·생선이면 핵심어로 잇지 않는다 — 바탕 음식(곡류)은 막지 않는다', () => {
    // 닭갈비(닭) → 갈비(소) ✗ — 이름으로 짐작한 주재료로도 막는다.
    expect(resolveNutrientRefByRules(target('닭갈비', { dishType: 'grill' }), INDEX)).toBeNull();
    expect(resolveNutrientRefByRules(target('닭갈비', { dishType: 'grill', mainIngredient: 'chicken' }), INDEX)).toBeNull();
    expect(resolveNutrientRefByRules(target('돼지갈비', { dishType: 'grill', mainIngredient: 'pork' }), INDEX)).toBeNull();
    // 참치김밥(생선) → 김밥(곡류) 은 잇는다.
    expect(resolveNutrientRefByRules(target('참치김밥', { mainIngredient: 'fish' }), INDEX)).toMatchObject({ method: 'rule', candidate: { id: 'gimbap' } });
  });

  it('계열 — 대상으로 끝나는 후보들의 열량 중앙값 행', () => {
    expect(resolveNutrientRefByRules(target('불고기', { dishType: 'grill' }), INDEX)).toMatchObject({
      method: 'rule',
      candidate: { id: 'bul1' },
    });
  });
});

describe('decideNutrientRef', () => {
  const cs = [{ name: '닭튀김' }, { name: '감자탕' }];
  it('후보 문자열 + high 만 채택', () => {
    expect(decideNutrientRef({ choice: '감자탕', canonical: null, confidence: 'high', reason: null }, cs)?.name).toBe('감자탕');
    expect(decideNutrientRef({ choice: '감자탕', canonical: null, confidence: 'medium', reason: null }, cs)).toBeNull();
    expect(decideNutrientRef({ choice: '만든이름', canonical: null, confidence: 'high', reason: null }, cs)).toBeNull();
    expect(decideNutrientRef({ choice: null, canonical: null, confidence: 'high', reason: null }, cs)).toBeNull();
  });
});

// DB·provider 없이 — 서비스가 쓰는 Prisma 메서드만 흉내낸다.
// gongiVitamins: 운영처럼 공기밥이 쌀밥의 비타민만 빌려 온 상태(비타민 기준 후보지만 탄단지는 비어 있다).
// fishPer100Macros: 원재료 넙치(1인분 없음)에 100g당 탄수화물·지방이 있는 상태.
const makeFakes = ({ gongiVitamins = false, fishPer100Macros = false }: { gongiVitamins?: boolean; fishPer100Macros?: boolean } = {}) => {
  const rows = [
    {
      id: 'fish',
      name: '넙치',
      nameNorm: '넙치',
      aliasNormsJson: '[]',
      dishType: null,
      kcal: null,
      servingG: null,
      kcalPer100g: 137,
      nutritionFrom: null,
      nutrientsPer100gJson: fishPer100Macros ? '{"calciumMg":61,"carbG":0,"fatG":6}' : '{"calciumMg":61}',
      carbG: null,
      fatG: null,
      active: true,
    },
    { id: 'rice', name: '쌀밥', nameNorm: '쌀밥', aliasNormsJson: '[]', dishType: 'rice', kcal: 166, servingG: 100, kcalPer100g: 166, nutritionFrom: null, nutrientsPer100gJson: '{"calciumMg":3,"proteinG":3.4}', carbG: 37.3, fatG: 0.3, active: true },
    { id: 'stew', name: '돼지갈비찜', nameNorm: '돼지갈비찜', aliasNormsJson: '[]', dishType: 'steam', kcal: 582, servingG: 300, kcalPer100g: 194, nutritionFrom: null, nutrientsPer100gJson: '{"calciumMg":40}', carbG: null, fatG: null, active: true },
    { id: 'haejang', name: '해장국', nameNorm: '해장국', aliasNormsJson: '["해장국우거지","해장국선지"]', dishType: 'soup', kcal: 208, servingG: 800, kcalPer100g: 26, nutritionFrom: null, nutrientsPer100gJson: '{"calciumMg":20}', carbG: 12, fatG: 8, active: true },
    { id: 'gongi', name: '공기밥', nameNorm: '공기밥', aliasNormsJson: '[]', dishType: 'rice', kcal: 349, servingG: 210, kcalPer100g: 166, nutritionFrom: null, nutrientsPer100gJson: gongiVitamins ? '{"calciumMg":3}' : null, carbG: null, fatG: null, active: true },
    { id: 'deung', name: '돼지등뼈찜', nameNorm: '돼지등뼈찜', aliasNormsJson: '[]', dishType: 'steam', kcal: null, servingG: null, kcalPer100g: null, nutritionFrom: null, nutrientsPer100gJson: null, carbG: null, fatG: null, active: true },
  ];
  const store = new Map<string, { nameNorm: string; name: string; refFoodId: string | null; method: string; version: number; reason: string | null }>();
  const calls: string[] = [];
  const prisma = {
    foodItem: {
      findMany: async ({ where }: { where: { id?: { in: string[] }; nutrientsPer100gJson?: unknown } }) =>
        where.id ? rows.filter((r) => where.id!.in.includes(r.id)) : rows.filter((r) => r.nutrientsPer100gJson !== null),
      findUnique: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
    },
    menuLexicon: { findMany: async () => [] },
    foodNutrientRef: {
      findMany: async ({ where }: { where: { nameNorm: { in: string[] } } }) =>
        [...store.values()].filter((s) => where.nameNorm.in.includes(s.nameNorm)),
      upsert: async ({ where, create }: { where: { nameNorm: string }; create: { name: string; refFoodId: string | null; method: string; version: number; reason: string | null } }) => {
        store.set(where.nameNorm, { nameNorm: where.nameNorm, ...create });
        return {};
      },
      delete: async ({ where }: { where: { nameNorm: string } }) => {
        store.delete(where.nameNorm);
        return {};
      },
      deleteMany: async ({ where }: { where: { nameNorm: string } }) => {
        store.delete(where.nameNorm);
        return { count: 1 };
      },
    },
  } as unknown as PrismaClient;
  const provider: LLMProvider = {
    complete: async ({ prompt }) => {
      calls.push(prompt);
      if (prompt.includes('음식 이름: 돼지등뼈찜')) {
        return { text: '{"choice":"돼지갈비찜","confidence":"high","reason":"돼지 뼈 찜"}', model: 'm', promptTokens: null, completionTokens: null };
      }
      // 별칭('해장국 우거지')으로 후보에 오른 해장국을 고른다.
      if (prompt.includes('음식 이름: 우거지탕') && prompt.includes('해장국')) {
        return { text: '{"choice":"해장국","confidence":"high","reason":"우거지 국물"}', model: 'm', promptTokens: null, completionTokens: null };
      }
      // 고르긴 했지만 확신이 medium — 채택하지 않고 후보로만 남는다.
      if (prompt.includes('음식 이름: 갈비찜정식') && prompt.includes('돼지갈비찜')) {
        return { text: '{"choice":"돼지갈비찜","confidence":"medium","reason":"갈비찜 계열"}', model: 'm', promptTokens: null, completionTokens: null };
      }
      return { text: '{"choice":null,"confidence":"low","reason":"모름"}', model: 'm', promptTokens: null, completionTokens: null };
    },
  };
  const aiConfig = {
    getResolved: async () => ({ apiKey: 'k', baseUrl: 'u', timeoutMs: 1000, maxConcurrent: 2, defaultModel: 'gemma4:31b' }),
  } as unknown as AiConfigService;
  const cache = { get: () => provider } as unknown as AdapterCache;
  return { prisma, aiConfig, cache, calls, store };
};

describe('FoodNutrientRefService', () => {
  it('규칙으로 잇고 저장, 규칙이 못 잡은 것만 LLM — high 만 채택, 아니면 없음으로 저장해 다시 묻지 않는다', async () => {
    const f = makeFakes();
    const svc = new FoodNutrientRefService(f.prisma, { aiConfig: f.aiConfig, cache: f.cache, model: 'gemma4:31b' });
    const targets = await svc.targetsForItems([
      { name: '공기밥', foodId: 'gongi' },
      { name: '돼지등뼈찜', foodId: 'deung' },
      { name: '쌀밥', foodId: 'rice' }, // 자신이 기준 음식 — 대상 아님
      { name: '수상한메뉴', foodId: null },
      { name: '우거지탕', foodId: null },
      { name: '콜라', foodId: null, dishType: 'beverage' }, // 음료는 묻지 않는다
    ]);
    expect(targets.map((t) => t.nameNorm)).toEqual(['공기밥', '돼지등뼈찜', '수상한메뉴', '우거지탕']);

    const stats = await svc.link(targets, { llm: true });
    expect(stats).toMatchObject({ targets: 4, rules: 1, llm: 2, none: 1, failed: 0 });
    expect(f.store.get('공기밥')).toMatchObject({ refFoodId: 'rice', method: 'synonym', version: FOOD_NUTRIENT_REF_VERSION });
    expect(f.store.get('돼지등뼈찜')).toMatchObject({ refFoodId: 'stew', method: 'llm' });
    expect(f.store.get('우거지탕')).toMatchObject({ refFoodId: 'haejang', method: 'llm' });
    // 글자가 전혀 안 겹쳐 후보가 없으면 묻지 않고 '없음'.
    expect(f.store.get('수상한메뉴')).toMatchObject({ refFoodId: null, method: 'none', reason: '후보 없음' });
    expect(f.calls).toHaveLength(2);

    // 다시 돌려도 같은 버전의 LLM·없음 판정은 묻지 않는다.
    const again = await svc.link(targets, { llm: true });
    expect(again).toMatchObject({ rules: 1, kept: 3 });
    expect(f.calls).toHaveLength(2);

    // 점검용 조회 — 저장 판정 + 저장 안 된 이름은 규칙을 그 자리에서.
    const ids = await svc.resolveIds([...targets, { name: '흰밥', nameNorm: '흰밥', dishType: null, nutritionFrom: null }]);
    expect(Object.fromEntries(ids)).toEqual({ 공기밥: 'rice', 돼지등뼈찜: 'stew', 우거지탕: 'haejang', 흰밥: 'rice' });
  });

  it('AI 가 고른 후보가 high 가 아니면 채택하지 않고 후보로만 남긴다(어드민 "이걸로"), 어드민 지정은 후보를 비운다', async () => {
    const f = makeFakes();
    const svc = new FoodNutrientRefService(f.prisma, { aiConfig: f.aiConfig, cache: f.cache, model: 'gemma4:31b' });
    const stats = await svc.link([{ name: '갈비찜정식', nameNorm: '갈비찜정식', dishType: null, nutritionFrom: null }], { llm: true });
    expect(stats).toMatchObject({ llm: 0, none: 1 });
    expect(f.store.get('갈비찜정식')).toMatchObject({
      refFoodId: null,
      method: 'none',
      confidence: 'medium',
      candidateFoodId: 'stew',
    });
    // 후보 없이 '없음'이면 후보도 없다.
    await svc.link([{ name: '수상한메뉴', nameNorm: '수상한메뉴', dishType: null, nutritionFrom: null }], { llm: true });
    expect(f.store.get('수상한메뉴')).toMatchObject({ method: 'none', candidateFoodId: null });
    await svc.setAdmin('갈비찜정식', 'stew');
    expect(f.store.get('갈비찜정식')).toMatchObject({ refFoodId: 'stew', method: 'admin', candidateFoodId: null });
  });

  it('어드민 지정이 규칙·LLM 보다 먼저이고, 일괄 연결이 덮지 않는다', async () => {
    const f = makeFakes();
    const svc = new FoodNutrientRefService(f.prisma, { aiConfig: f.aiConfig, cache: f.cache });
    await svc.setAdmin('공기밥', null); // "기준 음식 없음"으로 고정
    const ids = await svc.resolveIds([{ name: '공기밥', nameNorm: '공기밥', dishType: 'rice', nutritionFrom: null }]);
    expect(ids.has('공기밥')).toBe(false);
    const stats = await svc.link([{ name: '공기밥', nameNorm: '공기밥', dishType: 'rice', nutritionFrom: null }], { llm: true });
    expect(stats.kept).toBe(1);
    expect(f.store.get('공기밥')?.method).toBe('admin');
    await svc.clear('공기밥');
    expect((await svc.resolveIds([{ name: '공기밥', nameNorm: '공기밥', dishType: 'rice', nutritionFrom: null }])).get('공기밥')).toBe('rice');
  });

  it('탄수화물·지방 기준(macros) — 탄단지를 아는 후보 안에서만: 비타민만 빌린 공기밥은 자신이 아니라 쌀밥, 저장된 기준이 탄단지를 모르면 규칙으로', async () => {
    const f = makeFakes({ gongiVitamins: true });
    const svc = new FoodNutrientRefService(f.prisma);
    const gongi = { name: '공기밥', nameNorm: '공기밥', dishType: 'rice', nutritionFrom: null };
    // 비타민 기준으로는 같은 이름의 행(자신)이 후보라 그대로 — 점검은 이 행 자신의 비타민을 쓴다.
    expect((await svc.resolveIds([gongi])).get('공기밥')).toBe('gongi');
    // 탄단지 기준으로는 공기밥이 후보에서 빠져 동의 표(공기밥 = 쌀밥)로 간다.
    expect((await svc.resolveIds([gongi], { macros: true })).get('공기밥')).toBe('rice');
    // 돼지등뼈찜의 저장된 기준(돼지갈비찜)은 탄단지를 몰라 탄단지 기준으로는 쓰지 않는다(규칙으로도 못 찾으면 없음).
    f.store.set('돼지등뼈찜', { nameNorm: '돼지등뼈찜', name: '돼지등뼈찜', refFoodId: 'stew', method: 'llm', version: FOOD_NUTRIENT_REF_VERSION, reason: null });
    const deung = { name: '돼지등뼈찜', nameNorm: '돼지등뼈찜', dishType: 'steam', nutritionFrom: null };
    expect((await svc.resolveIds([deung])).get('돼지등뼈찜')).toBe('stew');
    expect((await svc.resolveIds([deung], { macros: true })).has('돼지등뼈찜')).toBe(false);
    // 저장된 기준이 탄단지를 알면 그대로 쓴다.
    f.store.set('우거지탕', { nameNorm: '우거지탕', name: '우거지탕', refFoodId: 'haejang', method: 'llm', version: FOOD_NUTRIENT_REF_VERSION, reason: null });
    const ugeoji = { name: '우거지탕', nameNorm: '우거지탕', dishType: 'soup', nutritionFrom: null };
    expect((await svc.resolveIds([ugeoji], { macros: true })).get('우거지탕')).toBe('haejang');
  });

  it('1인분이 없어도 100g당 탄수화물·지방이 있는 원재료는 탄단지 후보다(2026-11-08)', async () => {
    // 넙치는 원재료라 1인분이 없다 — '자연산 넙치'는 핵심어 규칙으로 넙치에 이어진다.
    const target = { name: '자연산 넙치', nameNorm: '자연산넙치', dishType: null, nutritionFrom: null };
    const without = new FoodNutrientRefService(makeFakes().prisma);
    expect((await without.resolveIds([target])).get('자연산넙치')).toBe('fish');
    expect((await without.resolveIds([target], { macros: true })).has('자연산넙치')).toBe(false);
    const withPer100 = new FoodNutrientRefService(makeFakes({ fishPer100Macros: true }).prisma);
    expect((await withPer100.resolveIds([target], { macros: true })).get('자연산넙치')).toBe('fish');
  });

  it('LLM 이 없으면 규칙만 저장하고 나머지는 그대로 둔다(없음으로 저장하지 않음)', async () => {
    const f = makeFakes();
    const svc = new FoodNutrientRefService(f.prisma);
    const stats = await svc.link(
      [
        { name: '공기밥', nameNorm: '공기밥', dishType: 'rice', nutritionFrom: null },
        { name: '돼지등뼈찜', nameNorm: '돼지등뼈찜', dishType: 'steam', nutritionFrom: null },
      ],
      { llm: true },
    );
    expect(stats).toMatchObject({ rules: 1, llm: 0, none: 0 });
    expect(f.store.has('돼지등뼈찜')).toBe(false);
    expect(svc.schedule([{ name: '돼지등뼈찜', foodId: 'deung' }])).toBe(0);
  });
});
