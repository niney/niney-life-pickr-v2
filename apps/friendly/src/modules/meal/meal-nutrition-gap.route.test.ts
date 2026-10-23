import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FoodAdminMealNutritionGapsResultType, MealEntryType } from '@repo/api-contract';
import { Routes } from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { normalizeTerm } from '../../lib/text.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { upsertFoodSeeds } from '../food/food-import.service.js';

// 어드민 "열량 빈 식단 이름" — 빈 이름이 위, 기록 수 순, 사용자는 수만. 다시 돌리기는 캐시(테스트는 규칙 엔진)로
// 채울 수 있는 항목을 채운다(테스트 환경은 LLM·웹이 없어 백그라운드로 보내지 않는다).

describe('meal nutrition gap routes (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let admin: { authorization: string };
  let user: { authorization: string };
  let other: { authorization: string };

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'gap-admin', role: 'ADMIN' },
      { id: 'gap-user', role: 'USER' },
      { id: 'gap-other', role: 'USER' },
    ]);
    const sign = (userId: string, role: 'ADMIN' | 'USER') => ({
      authorization: `Bearer ${app.jwt.sign({ userId, email: `${userId}@x.com`, role })}`,
    });
    admin = sign('gap-admin', 'ADMIN');
    user = sign('gap-user', 'USER');
    other = sign('gap-other', 'USER');
    await upsertFoodSeeds(app.prisma, [
      {
        name: '해장국',
        dishType: 'soup',
        mainIngredient: null,
        cuisine: 'korean',
        servingG: 800,
        kcalPer100g: 26,
        nutrition: { kcal: 208, carbG: 10, proteinG: 16, fatG: 6, sodiumMg: 2400, sugarG: null },
        source: 'manual',
      },
    ]);
  });
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  const save = async (headers: { authorization: string }, eatenDate: string, names: string[]) => {
    const res = await app.inject({
      method: 'POST',
      url: Routes.Meal.entries,
      headers,
      payload: {
        eatenAt: `${eatenDate}T03:00:00.000Z`,
        eatenDate,
        slot: 'lunch',
        source: 'manual',
        items: names.map((name) => ({ name, isMain: true, source: 'manual' })),
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json<MealEntryType>();
  };

  it('ADMIN 만 — 빈 이름이 위, 기록 수 순, 추정 이름은 근거와 함께. 다시 돌리면 채울 수 있는 항목을 채운다', async () => {
    await save(user, '2026-10-20', ['정체불명찌개', '모르는볶음']);
    await save(user, '2026-10-21', ['정체불명찌개']);
    await save(other, '2026-10-22', ['정체불명찌개']);
    // 카탈로그 밖 이름을 추정으로 채운 항목(규칙·LLM·웹) — foodId 없이 donor_estimate.
    const estimated = await save(user, '2026-10-22', ['이름추정탕']);
    await app.prisma.mealItem.update({
      where: { id: estimated.items[0]!.id },
      data: { kcal: 190, nutritionBasis: 'donor_estimate', nutritionFrom: '이름추정탕(fatsecret.kr 1건) · 국·탕 통상 1인분 500g' },
    });
    // 지금은 비어 있지만 규칙 엔진으로 채울 수 있는 이름 — 저장 뒤 카탈로그가 보강된 경우를 흉내 낸다.
    const later = await save(user, '2026-10-23', ['얼큰해장국']);
    await app.prisma.mealItem.update({
      where: { id: later.items[0]!.id },
      data: { kcal: null, proteinG: null, sodiumMg: null, nutritionFrom: null, nutritionBasis: 'missing', foodId: null },
    });

    expect((await app.inject({ method: 'GET', url: Routes.Food.adminMealNutritionGaps, headers: user })).statusCode).toBe(403);
    const res = await app.inject({ method: 'GET', url: Routes.Food.adminMealNutritionGaps, headers: admin });
    expect(res.statusCode).toBe(200);
    const body = res.json<FoodAdminMealNutritionGapsResultType>();
    expect(body).toMatchObject({ missingNames: 3, estimatedNames: 1 });
    expect(body.items).toEqual([
      { name: '정체불명찌개', itemCount: 3, userCount: 2, lastEatenDate: '2026-10-22', state: 'missing', nutritionFrom: null },
      expect.objectContaining({ name: '얼큰해장국', itemCount: 1, state: 'missing' }),
      expect.objectContaining({ name: '모르는볶음', itemCount: 1, state: 'missing' }),
      {
        name: '이름추정탕',
        itemCount: 1,
        userCount: 1,
        lastEatenDate: '2026-10-22',
        state: 'estimated',
        nutritionFrom: '이름추정탕(fatsecret.kr 1건) · 국·탕 통상 1인분 500g',
      },
    ]);

    const est = await app.inject({
      method: 'POST',
      url: Routes.Food.adminMealNutritionGapsEstimate,
      headers: admin,
      payload: { names: ['얼큰해장국', '정체불명찌개'] },
    });
    expect(est.statusCode).toBe(200);
    expect(est.json()).toEqual({ filled: 1, scheduled: 0 });
    const filled = await app.prisma.mealItem.findFirstOrThrow({ where: { nameNorm: normalizeTerm('얼큰해장국') } });
    expect(filled).toMatchObject({ kcal: 208, nutritionBasis: 'donor_estimate', nutritionFrom: '해장국' });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: Routes.Food.adminMealNutritionGapsEstimate,
          headers: other,
          payload: { names: ['정체불명찌개'] },
        })
      ).statusCode,
    ).toBe(403);
  });
});
