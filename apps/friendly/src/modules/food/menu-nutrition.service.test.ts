import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { MENU_NUTRITION_NOTICE } from '@repo/api-contract';
import type { FoodMatch } from './food.service.js';
import { MenuNutritionService } from './menu-nutrition.service.js';

const match = (name: string, over: Partial<FoodMatch> = {}): FoodMatch => ({
  foodId: `id-${name}`,
  name,
  nameNorm: name,
  dishType: null,
  mainIngredient: null,
  cuisine: null,
  score: 1,
  matchedBy: 'exact',
  kcal: 244,
  proteinG: null,
  sodiumMg: null,
  servingG: 300,
  kcalPer100g: 81,
  nutritionFrom: null,
  ...over,
});

// DB 없이 — 접미 조회($queryRaw)는 빈 결과, 카탈로그는 매핑으로 흉내.
const fakePrisma = { $queryRaw: async () => [] } as unknown as PrismaClient;
const catalog = new Map([
  ['김치찌개', match('김치찌개')],
  ['삼겹살구이', match('삼겹살구이', { kcalPer100g: 467 })],
]);

describe('MenuNutritionService', () => {
  it('판정된 항목만 담고, 같은 placeId 는 캐시에서 준다', async () => {
    let loads = 0;
    let matches = 0;
    const svc = new MenuNutritionService({
      prisma: fakePrisma,
      foodService: {
        matchFood: async (name) => {
          matches += 1;
          return catalog.get(name.replace(/\s+/g, '')) ?? null;
        },
      },
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
    let cachedNames = new Map<string, { foodId: string; foodName: string; kcalPer100g: number | null; nutritionFrom: string | null } | null>([
      ['소주', null],
    ]);
    const svc = new MenuNutritionService({
      prisma: fakePrisma,
      foodService: { matchFood: async (name) => catalog.get(name.replace(/\s+/g, '')) ?? null },
      loadMenuNames: async () => ['김치찌개', '부타동', '소주'],
      llm: {
        lookupCached: async (names) => new Map(names.filter((n) => cachedNames.has(n)).map((n) => [n, cachedNames.get(n)!])),
        matchMany: async (names) => {
          asked.push(names);
          cachedNames = new Map([...cachedNames, ['부타동', { foodId: 'f2', foodName: '돼지고기덮밥', kcalPer100g: 130, nutritionFrom: null }]]);
          return new Map();
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

  it('식당이 없으면 null', async () => {
    const svc = new MenuNutritionService({
      prisma: fakePrisma,
      foodService: { matchFood: async () => null },
      loadMenuNames: async () => null,
    });
    expect(await svc.forPlace('missing')).toBeNull();
  });
});
