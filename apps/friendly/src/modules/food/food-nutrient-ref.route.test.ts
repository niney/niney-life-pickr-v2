import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  FoodAdminNutrientRefCandidatesResultType,
  FoodAdminNutrientRefsResultType,
  MealNutritionAnalysisType,
} from '@repo/api-contract';
import { Routes } from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { upsertFoodSeeds } from './food-import.service.js';

// 어드민 "영양 기준 음식" + 영양소 점검 연결 — 테스트 환경은 AI 가 없어 규칙만 쓴다(다시 연결은 보내지 않는다).

describe('food nutrient ref routes (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let admin: { authorization: string };
  let user: { authorization: string };

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'ref-admin', role: 'ADMIN' },
      { id: 'ref-user', role: 'USER' },
    ]);
    const sign = (userId: string, role: 'ADMIN' | 'USER') => ({
      authorization: `Bearer ${app.jwt.sign({ userId, email: `${userId}@x.com`, role })}`,
    });
    admin = sign('ref-admin', 'ADMIN');
    user = sign('ref-user', 'USER');
    await upsertFoodSeeds(app.prisma, [
      {
        name: '쌀밥',
        dishType: 'rice',
        source: 'mfds-nutrition',
        servingG: 100,
        kcalPer100g: 150,
        nutrition: { kcal: 150, carbG: 33, proteinG: 3, fatG: 0.3, sodiumMg: 2, sugarG: 0 },
        nutrientsPer100g: { calciumMg: 5, ironMg: 0.5, thiaminMg: 0.1, magnesiumMg: 20, zincMg: 0.6, folateUg: 5, proteinG: 3, sodiumMg: 2 },
      },
      {
        name: '된장찌개',
        dishType: 'stew',
        source: 'mfds-nutrition',
        servingG: 400,
        kcalPer100g: 37.5,
        nutrition: { kcal: 150, carbG: 10, proteinG: 10, fatG: 5, sodiumMg: 1800, sugarG: 2 },
        nutrientsPer100g: { calciumMg: 30, ironMg: 0.8, thiaminMg: 0.05, magnesiumMg: 15, zincMg: 0.4, folateUg: 20 },
      },
      // 외식 어휘 — 열량만 있고 비타민·무기질·단백질이 없다(운영 '공기밥' 모양).
      { name: '공기밥', dishType: 'rice', source: 'menu-canonical', servingG: 200, kcalPer100g: 150, nutrition: { kcal: 300, carbG: null, proteinG: null, fatG: null, sodiumMg: null, sugarG: null } },
      { name: '양념', dishType: null, source: 'menu-canonical', servingG: 20, kcalPer100g: 100, nutrition: { kcal: 20, carbG: null, proteinG: null, fatG: null, sodiumMg: null, sugarG: null } },
    ]);
  });
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  const idOf = async (name: string): Promise<string> =>
    (await app.prisma.foodItem.findUniqueOrThrow({ where: { nameNorm: name }, select: { id: true } })).id;

  it('어드민 전용', async () => {
    const res = await app.inject({ method: 'GET', url: Routes.Food.adminNutrientRefs, headers: user });
    expect(res.statusCode).toBe(403);
  });

  it('영양소 점검 — 공기밥은 규칙(공기밥 = 쌀밥)으로 그 자리에서 쌀밥의 열량당 영양소로 계산된다', async () => {
    const save = async (date: string, slot: 'lunch' | 'dinner') => {
      const res = await app.inject({
        method: 'POST',
        url: Routes.Meal.entries,
        headers: user,
        payload: {
          eatenAt: `${date}T0${slot === 'lunch' ? 3 : 9}:00:00.000Z`,
          eatenDate: date,
          slot,
          source: 'manual',
          items: [
            { name: '공기밥', foodId: await idOf('공기밥'), isMain: true, source: 'manual' },
            { name: '된장찌개', foodId: await idOf('된장찌개'), isMain: true, source: 'manual' },
          ],
        },
      });
      expect(res.statusCode).toBe(201);
    };
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const day = (n: number) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - n);
      return d.toISOString().slice(0, 10);
    };
    for (const n of [0, 1, 2, 3]) {
      await save(day(n), 'lunch');
      await save(day(n), 'dinner');
    }
    const res = await app.inject({ method: 'GET', url: `${Routes.Meal.nutrition}?days=7`, headers: user });
    expect(res.statusCode).toBe(200);
    const a = res.json<MealNutritionAnalysisType>();
    expect(a.status).toBe('ok');
    const calcium = a.nutrients.find((n) => n.key === 'calcium')!;
    // 공기밥 300kcal ÷ 쌀밥 150kcal/100g = 200g 어치 → 칼슘 10mg + 된장찌개 400g → 120mg = 끼니 130 → 하루 260.
    expect(calcium).toMatchObject({ intakePerDay: 260, coverage: 1 });
    expect(a.nutrients.find((n) => n.key === 'magnesium')).toMatchObject({ coverage: 1 });
    // 공기밥 단백질 스냅샷은 비어 있어 쌀밥 100g당 단백질로 — 끼니 6g + 된장찌개 10g → 하루 32g.
    expect(a.nutrients.find((n) => n.key === 'protein')).toMatchObject({ intakePerDay: 32, coverage: 1 });
    expect(a.notMeasured).not.toContain('마그네슘');
  });

  it('지정·없음 고정·해제 — 영양소 없는 음식은 기준으로 고를 수 없다', async () => {
    const rice = await idOf('쌀밥');
    const put = (name: string, refFoodId: string | null) =>
      app.inject({ method: 'PUT', url: Routes.Food.adminNutrientRefs, headers: admin, payload: { name, refFoodId } });

    expect((await put('공기밥', await idOf('양념'))).statusCode).toBe(400);
    expect((await put('공기밥', 'nope')).statusCode).toBe(404);
    expect((await put('공기밥', rice)).statusCode).toBe(204);
    expect((await put('양념', null)).statusCode).toBe(204);

    const list = (await app.inject({ method: 'GET', url: Routes.Food.adminNutrientRefs, headers: admin })).json<FoodAdminNutrientRefsResultType>();
    expect(list).toMatchObject({ linked: 1, unlinked: 1 });
    // '없음'이 위, 그다음 기록 수 순.
    expect(list.items.map((i) => [i.name, i.method, i.refFoodName])).toEqual([
      ['양념', 'admin', null],
      ['공기밥', 'admin', '쌀밥'],
    ]);
    expect(list.items[1]!.itemCount).toBe(8);

    const del = await app.inject({ method: 'DELETE', url: `${Routes.Food.adminNutrientRefs}?name=${encodeURIComponent('양념')}`, headers: admin });
    expect(del.statusCode).toBe(204);
    const after = (await app.inject({ method: 'GET', url: Routes.Food.adminNutrientRefs, headers: admin })).json<FoodAdminNutrientRefsResultType>();
    expect(after.items.map((i) => i.name)).toEqual(['공기밥']);
  });

  it('목록 — AI 가 채택하지 않은 후보는 이름과 함께, 후보 행이 사라졌으면 비운다', async () => {
    const rice = await idOf('쌀밥');
    await app.prisma.foodNutrientRef.createMany({
      data: [
        { nameNorm: '흰쌀정식', name: '흰쌀정식', method: 'none', confidence: 'medium', reason: '밥 위주', candidateFoodId: rice, version: 1 },
        { nameNorm: '사라진후보', name: '사라진후보', method: 'none', confidence: 'low', reason: null, candidateFoodId: 'gone', version: 1 },
      ],
    });
    try {
      const list = (await app.inject({ method: 'GET', url: Routes.Food.adminNutrientRefs, headers: admin })).json<FoodAdminNutrientRefsResultType>();
      expect(list.items.find((i) => i.name === '흰쌀정식')).toMatchObject({ refFoodId: null, candidateFoodId: rice, candidateFoodName: '쌀밥' });
      expect(list.items.find((i) => i.name === '사라진후보')).toMatchObject({ candidateFoodId: null, candidateFoodName: null });
    } finally {
      await app.prisma.foodNutrientRef.deleteMany({ where: { nameNorm: { in: ['흰쌀정식', '사라진후보'] } } });
    }
  });

  it('기준 후보 검색은 영양소 있는 음식만, 다시 연결은 AI 가 없으면 보내지 않는다', async () => {
    const res = await app.inject({ method: 'GET', url: `${Routes.Food.adminNutrientRefCandidates}?q=${encodeURIComponent('쌀밥')}`, headers: admin });
    const names = res.json<FoodAdminNutrientRefCandidatesResultType>().items.map((i) => i.name);
    expect(names).toContain('쌀밥');
    expect(names).not.toContain('공기밥');
    const link = await app.inject({ method: 'POST', url: Routes.Food.adminNutrientRefsLink, headers: admin, payload: {} });
    expect(link.json()).toEqual({ scheduled: 0 });
  });
});
