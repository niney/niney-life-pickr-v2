import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MealEntryType, MealSkipsResultType, MealStatsNutrientsResultType, MealStatsResultType } from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { upsertFoodSeeds } from '../food/food-import.service.js';
import { skippedByDate } from './meal-skip.service.js';

// 끼니 '안 먹음' 표시 — 본인 것만, 앞으로 올 날·기록한 끼니는 받지 않고, 기록이 생기면 지워지며, 통계·점검의 하루 평균은
// 한 끼 기록 + '안 먹음' 인 날도 넣는다.

const SKIPS = '/api/v1/meals/skips';
const ENTRIES = '/api/v1/meals';
const kstToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
const shift = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
};

describe('skippedByDate', () => {
  it('기록이 없는 끼니의 표시만 날짜마다 센다 — 같은 끼니에 기록이 있으면 기록이 이긴다, 간식은 세지 않는다', () => {
    const skips = [
      { date: '2026-11-01', slot: 'breakfast' },
      { date: '2026-11-01', slot: 'dinner' },
      { date: '2026-11-02', slot: 'lunch' },
      { date: '2026-11-02', slot: 'snack' },
    ];
    const entries = [
      { eatenDate: '2026-11-01', slot: 'lunch' },
      { eatenDate: '2026-11-02', slot: 'lunch' },
    ];
    expect(Object.fromEntries(skippedByDate(skips, entries))).toEqual({ '2026-11-01': 2 });
  });
});

describe('meal skip routes (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let auth: { authorization: string };
  let otherAuth: { authorization: string };
  const today = kstToday();
  const day = shift(today, -2);

  const createEntry = async (date: string, slot: string, name = '김치찌개'): Promise<MealEntryType> => {
    const res = await app.inject({
      method: 'POST',
      url: ENTRIES,
      headers: auth,
      payload: {
        eatenAt: `${date}T03:00:00.000Z`,
        eatenDate: date,
        slot,
        source: 'manual',
        items: [{ name, isMain: true, source: 'manual' }],
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json<MealEntryType>();
  };
  const list = async (from = shift(today, -30), to = today) =>
    (await app.inject({ method: 'GET', url: `${SKIPS}?from=${from}&to=${to}`, headers: auth })).json<MealSkipsResultType>()
      .skips;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'skip-user', role: 'USER' },
      { id: 'skip-other', role: 'USER' },
    ]);
    auth = { authorization: `Bearer ${app.jwt.sign({ userId: 'skip-user', email: 's@x.com', role: 'USER' })}` };
    otherAuth = { authorization: `Bearer ${app.jwt.sign({ userId: 'skip-other', email: 'o@x.com', role: 'USER' })}` };
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('로그인 필요, 아침·점심·저녁만, 앞으로 올 날은 400', async () => {
    expect((await app.inject({ method: 'GET', url: `${SKIPS}?from=${day}&to=${today}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'PUT', url: SKIPS, payload: { date: day, slot: 'breakfast' } })).statusCode).toBe(401);
    const snack = await app.inject({ method: 'PUT', url: SKIPS, headers: auth, payload: { date: day, slot: 'snack' } });
    expect(snack.statusCode).toBe(400);
    const future = await app.inject({
      method: 'PUT',
      url: SKIPS,
      headers: auth,
      payload: { date: shift(today, 1), slot: 'breakfast' },
    });
    expect(future.statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `${SKIPS}?from=${today}&to=${day}`, headers: auth })).statusCode).toBe(
      400,
    );
  });

  it('표시는 멱등, 본인 것만 보이고, 지우기는 204', async () => {
    for (let i = 0; i < 2; i++) {
      const res = await app.inject({ method: 'PUT', url: SKIPS, headers: auth, payload: { date: day, slot: 'dinner' } });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ date: day, slot: 'dinner' });
    }
    await app.inject({ method: 'PUT', url: SKIPS, headers: auth, payload: { date: day, slot: 'breakfast' } });
    await app.inject({ method: 'PUT', url: SKIPS, headers: otherAuth, payload: { date: day, slot: 'lunch' } });
    // 날짜·끼니 차례(아침 → 저녁).
    expect(await list()).toEqual([
      { date: day, slot: 'breakfast' },
      { date: day, slot: 'dinner' },
    ]);
    const del = await app.inject({ method: 'DELETE', url: `${SKIPS}?date=${day}&slot=breakfast`, headers: auth });
    expect(del.statusCode).toBe(204);
    expect(await list()).toEqual([{ date: day, slot: 'dinner' }]);
  });

  it('기록한 끼니는 409, 같은 날·끼니를 기록하거나 그 끼니로 옮기면 표시가 지워진다', async () => {
    const lunch = await createEntry(day, 'lunch');
    const res = await app.inject({ method: 'PUT', url: SKIPS, headers: auth, payload: { date: day, slot: 'lunch' } });
    expect(res.statusCode).toBe(409);

    // 저녁 '안 먹음'이 있던 날에 저녁을 기록하면 표시가 지워진다.
    await createEntry(day, 'dinner', '된장찌개');
    expect(await list()).toEqual([]);

    // 다른 날의 아침 '안 먹음' — 점심 기록을 그 날 아침으로 옮기면 지워진다.
    const other = shift(today, -3);
    await app.inject({ method: 'PUT', url: SKIPS, headers: auth, payload: { date: other, slot: 'breakfast' } });
    expect(await list()).toEqual([{ date: other, slot: 'breakfast' }]);
    const moved = await app.inject({
      method: 'PATCH',
      url: `${ENTRIES}/${lunch.id}`,
      headers: auth,
      payload: { eatenDate: other, eatenAt: `${other}T00:00:00.000Z`, slot: 'breakfast' },
    });
    expect(moved.statusCode).toBe(200);
    expect(await list()).toEqual([]);
  });

  it('한 끼만 적고 나머지를 안 먹음으로 표시한 날은 통계·영양 표의 하루 평균에 든다', async () => {
    // 열량이 붙게 카탈로그에 한 끼 음식을 둔다(격리 DB 는 비어 있다).
    await upsertFoodSeeds(app.prisma, [
      {
        name: '비빔밥',
        dishType: 'rice',
        source: 'manual',
        servingG: 400,
        kcalPer100g: 150,
        nutrition: { kcal: 600, carbG: null, proteinG: 20, fatG: null, sodiumMg: 900, sugarG: null },
      },
    ]);
    const date = shift(today, -5);
    const created = await createEntry(date, 'lunch', '비빔밥');
    const kcal = created.items[0]!.kcal;
    expect(kcal).not.toBeNull();
    const statsOf = async () =>
      (await app.inject({ method: 'GET', url: `/api/v1/meals/stats?from=${date}&to=${date}`, headers: auth })).json<
        MealStatsResultType
      >();
    const nutrientsOf = async () =>
      (await app.inject({ method: 'GET', url: `/api/v1/meals/stats/nutrients?from=${date}&to=${date}`, headers: auth })).json<
        MealStatsNutrientsResultType
      >();

    // 한 끼만 적은 날 — 평균에서 빠진다.
    const before = await nutrientsOf();
    expect([before.meals, before.skipped, before.counted, before.analyzedDays]).toEqual([[1], [0], [false], 0]);
    expect((await statsOf()).nutrition.avgKcalPerDay).toBeNull();

    // 저녁을 '안 먹음'으로 표시하면 그날 먹은 전부라 평균에 든다 — 두 화면 모두.
    await app.inject({ method: 'PUT', url: SKIPS, headers: auth, payload: { date, slot: 'dinner' } });
    const after = await nutrientsOf();
    expect([after.meals, after.skipped, after.counted, after.analyzedDays]).toEqual([[1], [1], [true], 1]);
    expect(after.rows.find((r) => r.key === 'kcal')?.intakePerDay).toBe(kcal);
    expect((await statsOf()).nutrition.avgKcalPerDay).toBe(kcal);
  });
});
