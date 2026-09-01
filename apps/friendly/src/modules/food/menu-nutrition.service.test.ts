import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { MENU_NUTRITION_NOTICE } from '@repo/api-contract';
import { MenuNutritionEngine, buildCatalogIndex, catalogRow } from './engine/index.js';
import { MenuNutritionService } from './menu-nutrition.service.js';

// DB 없이 — 인메모리 카탈로그 인덱스로 엔진을 만든다.
const fakePrisma = {} as unknown as PrismaClient;
const engine = new MenuNutritionEngine(
  buildCatalogIndex([
    catalogRow('김치찌개', { kcal: 244, servingG: 300, kcalPer100g: 81 }),
    catalogRow('삼겹살구이', { kcal: 244, servingG: 300, kcalPer100g: 467 }),
  ]),
);

describe('MenuNutritionService', () => {
  it('판정된 항목만 담고, 같은 placeId 는 캐시에서 준다', async () => {
    let loads = 0;
    let matches = 0;
    const svc = new MenuNutritionService({
      prisma: fakePrisma,
      engine: {
        resolveMany: (names: string[]) => {
          matches += names.length;
          return engine.resolveMany(names);
        },
      } as unknown as MenuNutritionEngine,
      loadMenuNames: async (placeId) => {
        loads += 1;
        return placeId === 'p1' ? ['김치찌개', '생삼겹살 150g', '와규 세트', '음료수', '김치찌개'] : null;
      },
    });

    const first = await svc.forPlace('p1');
    expect(first).not.toBeNull();
    expect(first!.notice).toBe(MENU_NUTRITION_NOTICE);
    expect(first!.items).toEqual([
      {
        name: '김치찌개',
        basis: 'per_serving',
        kcal: 244,
        foodName: '김치찌개',
        matchedBy: 'exact',
        nutritionFrom: null,
      },
      {
        name: '생삼겹살 150g',
        basis: 'per_100g',
        kcal: 467,
        foodName: '삼겹살구이',
        matchedBy: 'variant',
        nutritionFrom: null,
      },
    ]);

    const matchesAfterFirst = matches;
    const second = await svc.forPlace('p1');
    expect(second).toBe(first);
    expect(loads).toBe(1);
    expect(matches).toBe(matchesAfterFirst);

    svc.invalidate('p1');
    await svc.forPlace('p1');
    expect(loads).toBe(2);
  });

  it('규칙 밖 이름은 LLM 캐시에서 읽고, 없는 이름은 백그라운드로 묻는 동안 llmPending', async () => {
    const asked: string[][] = [];
    type Lookup = { hit: { foodId: string; foodName: string; kcalPer100g: number | null; nutritionFrom: string | null } | null; canonical: string | null };
    let cachedNames = new Map<string, Lookup>([['소주', { hit: null, canonical: null }]]);
    const svc = new MenuNutritionService({
      prisma: fakePrisma,
      engine,
      loadMenuNames: async () => ['김치찌개', '부타동', '소주'],
      llm: {
        lookupCached: async (names) => new Map(names.filter((n) => cachedNames.has(n)).map((n) => [n, cachedNames.get(n)!])),
        matchMany: async (names) => {
          asked.push(names);
          cachedNames = new Map([...cachedNames, ['부타동', { hit: { foodId: 'f2', foodName: '돼지고기덮밥', kcalPer100g: 130, nutritionFrom: null }, canonical: '돼지고기덮밥' }]]);
          return new Map([['부타동', cachedNames.get('부타동')!]]);
        },
      },
    });

    const first = await svc.forPlace('p2');
    expect(first!.llmPending).toBe(true);
    expect(first!.items.map((i) => i.name)).toEqual(['김치찌개']);
    expect(asked).toEqual([['부타동']]);
    await svc.waitForLlm('p2');

    const second = await svc.forPlace('p2');
    expect(second!.llmPending).toBe(false);
    expect(second!.items.map((i) => [i.name, i.matchedBy, i.basis, i.kcal])).toEqual([
      ['김치찌개', 'exact', 'per_serving', 244],
      ['부타동', 'llm', 'per_100g', 130],
    ]);
    // 완료된 결과는 캐시된다 — 세 번째 조회는 LLM 캐시를 다시 읽지 않는다.
    expect(await svc.forPlace('p2')).toBe(second);
    expect(asked).toHaveLength(1);
  });

  it('LLM 이 카탈로그에서 못 찾은 이름은 표준명으로 웹 추정을 조회하고, 캐시에 없으면 백그라운드 뒤 채운다', async () => {
    const webAsked: string[][] = [];
    let webCache = new Map<string, { kcalPer100g: number; agreeing: number; basis: 'multi' | 'single'; source: string } | null>();
    const svc = new MenuNutritionService({
      prisma: fakePrisma,
      engine,
      loadMenuNames: async () => ['김치찌개', '화덕치즈불족', '소주 세트'],
      llm: {
        // 이미 물어본 이름: 카탈로그 매칭은 없지만 표준명은 있다.
        lookupCached: async (names) =>
          new Map(names.filter((n) => n === '화덕치즈불족').map((n) => [n, { hit: null, canonical: '불족발' }])),
        matchMany: async () => new Map(),
      },
      web: {
        lookupCached: async (qs) => new Map(qs.filter((q) => webCache.has(q)).map((q) => [q, webCache.get(q)!])),
        estimateMany: async (qs) => {
          webAsked.push(qs);
          webCache = new Map([['불족발', { kcalPer100g: 219, agreeing: 5, basis: 'multi', source: 'fatsecret.kr' }]]);
          return new Map();
        },
      },
    });

    const first = await svc.forPlace('p3');
    expect(first!.llmPending).toBe(true);
    expect(first!.items.map((i) => i.name)).toEqual(['김치찌개']);
    await svc.waitForLlm('p3');
    expect(webAsked).toEqual([['불족발']]);

    const second = await svc.forPlace('p3');
    expect(second!.llmPending).toBe(false);
    expect(second!.items[1]).toEqual({
      name: '화덕치즈불족',
      basis: 'per_100g',
      kcal: 219,
      foodName: '불족발',
      matchedBy: 'web',
      nutritionFrom: 'fatsecret.kr 5건 중앙값',
    });
  });

  it('결합 기호 세트는 구성요소별 판정을 parts 로 내려주고, 전부 1인분일 때만 합계를 낸다', async () => {
    const svc = new MenuNutritionService({
      prisma: fakePrisma,
      engine,
      loadMenuNames: async () => ['김치찌개+삼겹살구이', '김치찌개 + 삼겹살 150g', '소라+문어'],
    });
    const r = await svc.forPlace('p4');
    expect(r!.items.map((i) => [i.name, i.basis, i.kcal, i.partsTotal, i.parts?.map((p) => [p.name, p.basis, p.kcal])])).toEqual([
      ['김치찌개+삼겹살구이', 'components', 488, 2, [['김치찌개', 'per_serving', 244], ['삼겹살구이', 'per_serving', 244]]],
      ['김치찌개 + 삼겹살 150g', 'components', null, 2, [['김치찌개', 'per_serving', 244], ['삼겹살', 'per_100g', 467]]],
    ]);
  });

  it('식당이 없으면 null', async () => {
    const svc = new MenuNutritionService({
      prisma: fakePrisma,
      engine,
      loadMenuNames: async () => null,
    });
    expect(await svc.forPlace('missing')).toBeNull();
  });
});
