import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ListMealEntriesResultType,
  MealDataBackupType,
  MealEntryType,
  MealPlaceMenusResultType,
} from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { upsertFoodSeeds } from '../food/food-import.service.js';

// 식당 메뉴에서 넣기 — 등록 식당의 메뉴를 넣을 음식으로 받고, 그 집 메뉴명·가격을 실어 저장하면 스냅샷으로 남는다
// (이름은 표준명 그대로라 통계 묶음은 바뀌지 않는다). 메뉴명으로도 찾아지고, 예전 백업(칸 없음)도 복원된다.

const PLACE_MENUS = '/api/v1/meals/place-menus';
const ENTRIES = '/api/v1/meals';
const BACKUP = '/api/v1/meals/data/backup';
const RESTORE = '/api/v1/meals/data/backup/restore';
const PLACE_ID = 'place-menu-1';

describe('meal place menu routes (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let auth: { authorization: string };

  const createEntry = async (items: Record<string, unknown>[], date = '2026-11-10'): Promise<MealEntryType> => {
    const res = await app.inject({
      method: 'POST',
      url: ENTRIES,
      headers: auth,
      payload: {
        eatenAt: `${date}T03:00:00.000Z`,
        eatenDate: date,
        slot: 'lunch',
        mealType: 'dining_out',
        placeId: PLACE_ID,
        placeName: '숯토리',
        source: 'manual',
        items,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json<MealEntryType>();
  };

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [{ id: 'menu-user', role: 'USER' }]);
    auth = { authorization: `Bearer ${app.jwt.sign({ userId: 'menu-user', email: 'm@x.com', role: 'USER' })}` };
    await upsertFoodSeeds(app.prisma, [
      {
        name: '김치찌개',
        dishType: 'stew',
        mainIngredient: 'pork',
        cuisine: 'korean',
        servingG: 400,
        kcalPer100g: 60,
        nutrition: { kcal: 240, carbG: 12, proteinG: 16, fatG: 14, sodiumMg: 1900, sugarG: 3 },
        source: 'manual',
      },
      {
        name: '곰탕',
        dishType: 'soup',
        mainIngredient: 'beef',
        cuisine: 'korean',
        servingG: 600,
        kcalPer100g: 55,
        nutrition: { kcal: 330, carbG: 10, proteinG: 30, fatG: 18, sodiumMg: 1500, sugarG: 1 },
        source: 'manual',
      },
    ]);
    await app.prisma.restaurant.create({
      data: {
        source: 'naver',
        sourceId: PLACE_ID,
        placeId: PLACE_ID,
        name: '숯토리',
        category: '한식',
        rawSourceUrl: 'https://x',
        snapshotJson: JSON.stringify({
          placeId: PLACE_ID,
          name: '숯토리',
          imageUrls: [],
          menus: [
            { name: '묵은지 김치찌개', price: '9,000원', description: null, recommend: true, imageUrls: [] },
            { name: '특곰탕', price: '15000', description: null, recommend: null, imageUrls: [] },
            { name: '주모의 한상', price: '가격 변동', description: null, recommend: null, imageUrls: [] },
          ],
        }),
        canonical: { create: { name: '숯토리', primaryCategory: '한식' } },
      },
    });
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('로그인 필요, 없는 식당은 404', async () => {
    expect((await app.inject({ method: 'GET', url: `${PLACE_MENUS}?placeId=${PLACE_ID}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: PLACE_MENUS, headers: auth })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `${PLACE_MENUS}?placeId=nope`, headers: auth })).statusCode).toBe(404);
  });

  it('그 집 메뉴를 넣을 음식으로 — 표준명·분류·열량, 못 이은 메뉴는 메뉴명 그대로', async () => {
    const res = await app.inject({ method: 'GET', url: `${PLACE_MENUS}?placeId=${PLACE_ID}`, headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json<MealPlaceMenusResultType>();
    expect(body.placeName).toBe('숯토리');
    expect(body.menus).toMatchObject([
      {
        menuName: '묵은지 김치찌개',
        price: 9000,
        recommend: true,
        foods: [{ name: '김치찌개', dishType: 'stew', mainIngredient: 'pork', cuisine: 'korean', isMain: true, kcal: 240 }],
      },
      { menuName: '특곰탕', price: 15000, recommend: false, foods: [{ name: '곰탕', kcal: 330 }] },
      { menuName: '주모의 한상', price: null, foods: [{ name: '주모의 한상', foodId: null, kcal: null }] },
    ]);
    expect(body.menus[0]!.foods[0]!.foodId).toBeTruthy();
  });

  it('메뉴명·가격을 실어 저장하면 스냅샷으로 남고, 이름·열량은 표준 음식 그대로', async () => {
    const menus = (
      await app.inject({ method: 'GET', url: `${PLACE_MENUS}?placeId=${PLACE_ID}`, headers: auth })
    ).json<MealPlaceMenusResultType>().menus;
    const food = menus[0]!.foods[0]!;
    const entry = await createEntry([
      { name: food.name, foodId: food.foodId, isMain: true, source: 'catalog', menuName: menus[0]!.menuName, menuPrice: menus[0]!.price },
      // 가격만 온 항목 — 메뉴명이 없으면 가격도 남기지 않는다.
      { name: '공기밥', isMain: false, source: 'manual', menuPrice: 1000 },
    ]);
    expect(entry.items).toMatchObject([
      { name: '김치찌개', menuName: '묵은지 김치찌개', menuPrice: 9000, kcal: food.kcal },
      { name: '공기밥', menuName: null, menuPrice: null },
    ]);

    // 그 집 메뉴명으로도 찾는다(이름은 표준명이라 메뉴명만 기억하면 안 잡혔다).
    const found = await app.inject({ method: 'GET', url: `${ENTRIES}?q=${encodeURIComponent('묵은지')}`, headers: auth });
    expect(found.json<ListMealEntriesResultType>().items.map((e) => e.id)).toEqual([entry.id]);

    // 수정은 항목 전량 교체 — 메뉴 연결을 빼고 보내면 풀린다.
    const patched = await app.inject({
      method: 'PATCH',
      url: `${ENTRIES}/${entry.id}`,
      headers: auth,
      payload: { items: [{ name: '김치찌개', foodId: food.foodId, isMain: true, source: 'catalog' }] },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<MealEntryType>().items).toMatchObject([{ name: '김치찌개', menuName: null, menuPrice: null }]);
  });

  it('백업에 메뉴명·가격이 실리고, 그 칸이 없는 예전 백업도 복원된다(없으면 null)', async () => {
    const entry = await createEntry(
      [{ name: '곰탕', isMain: true, source: 'manual', menuName: '특곰탕', menuPrice: 15000 }],
      '2026-11-11',
    );
    const backupRes = await app.inject({ method: 'GET', url: BACKUP, headers: auth });
    expect(backupRes.statusCode).toBe(200);
    const backup = backupRes.json<MealDataBackupType>();
    const backedUp = backup.entries.find((e) => e.eatenDate === '2026-11-11')!;
    expect(backedUp.items).toMatchObject([{ name: '곰탕', menuName: '특곰탕', menuPrice: 15000 }]);

    // 기존 기록을 지우고, 메뉴 칸을 뺀 예전 모양의 백업으로 복원한다.
    for (const e of [entry.id]) {
      expect((await app.inject({ method: 'DELETE', url: `${ENTRIES}/${e}`, headers: auth })).statusCode).toBe(204);
    }
    const legacy: MealDataBackupType = {
      ...backup,
      archiveId: '44444444-4444-4444-8444-444444444444',
      entries: [
        {
          ...backedUp,
          items: backedUp.items.map((item) => {
            const { menuName: _n, menuPrice: _p, ...rest } = item;
            void _n;
            void _p;
            return rest;
          }),
        },
      ],
      photos: [],
      recommendations: [],
    };
    const restored = await app.inject({ method: 'POST', url: RESTORE, headers: auth, payload: legacy });
    expect(restored.statusCode).toBe(200);
    const list = (
      await app.inject({ method: 'GET', url: `${ENTRIES}?from=2026-11-11&to=2026-11-11`, headers: auth })
    ).json<ListMealEntriesResultType>();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.items).toMatchObject([{ name: '곰탕', menuName: null, menuPrice: null }]);

    // 새 모양 백업은 메뉴 칸까지 되살린다.
    expect((await app.inject({ method: 'DELETE', url: `${ENTRIES}/${list.items[0]!.id}`, headers: auth })).statusCode).toBe(204);
    const fresh: MealDataBackupType = {
      ...legacy,
      archiveId: '55555555-5555-4555-8555-555555555555',
      entries: [backedUp],
    };
    expect((await app.inject({ method: 'POST', url: RESTORE, headers: auth, payload: fresh })).statusCode).toBe(200);
    const again = (
      await app.inject({ method: 'GET', url: `${ENTRIES}?from=2026-11-11&to=2026-11-11`, headers: auth })
    ).json<ListMealEntriesResultType>();
    expect(again.items[0]!.items).toMatchObject([{ name: '곰탕', menuName: '특곰탕', menuPrice: 15000 }]);
  });
});
