import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FoodMergeConflictListResultType } from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { upsertFoodSeeds, type FoodSeed } from './food-import.service.js';
import { FoodMergeConflictService } from './food-merge-conflict.service.js';

const CONFLICTS = '/api/v1/admin/food/merge-conflicts';

describe('food source observations + merge conflict review queue', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let adminAuth: { authorization: string };
  let userAuth: { authorization: string };
  let foodItemId: string;

  const primarySeed: FoodSeed = {
    name: '감자전',
    repName: '감자전',
    aliases: ['감자 전'],
    dishType: 'pancake',
    mainIngredient: 'vegetable',
    cuisine: 'korean',
    ingredients: ['감자', '소금'],
    servingG: 180,
    nutrition: {
      kcal: 220,
      carbG: 32,
      proteinG: 4,
      fatG: 8,
      sodiumMg: 410,
      sugarG: 1,
    },
    source: 'mfds-nutrition',
    sourceId: 'N-1',
    sourceCategory: '전적및부침류',
    popularity: 3,
  };

  const conflictingSeed: FoodSeed = {
    name: '감자전',
    repName: '감자부침',
    dishType: 'fried',
    mainIngredient: 'grain',
    cuisine: 'korean',
    ingredients: ['감자', '밀가루', '소금'],
    servingG: 200,
    nutrition: {
      kcal: 280,
      carbG: 41,
      proteinG: 5,
      fatG: 10,
      sodiumMg: 520,
      sugarG: 2,
    },
    source: 'mfds-recipe',
    sourceId: 'R-7',
    sourceCategory: '반찬/튀기기',
    popularity: 0,
  };

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'food-conflict-admin', role: 'ADMIN' },
      { id: 'food-conflict-user', role: 'USER' },
    ]);
    adminAuth = {
      authorization: `Bearer ${app.jwt.sign({ userId: 'food-conflict-admin', email: 'admin@x.com', role: 'ADMIN' })}`,
    };
    userAuth = {
      authorization: `Bearer ${app.jwt.sign({ userId: 'food-conflict-user', email: 'user@x.com', role: 'USER' })}`,
    };
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('모든 non-empty 소스 필드를 관측하고 동일 재적재는 증식하지 않는다', async () => {
    await upsertFoodSeeds(app.prisma, [primarySeed]);
    const row = await app.prisma.foodItem.findUniqueOrThrow({ where: { nameNorm: '감자전' } });
    foodItemId = row.id;

    const first = await app.prisma.foodSourceObservation.findMany({
      where: { foodItemId, source: 'mfds-nutrition', sourceId: 'N-1' },
    });
    expect(first.map((item) => item.field)).toEqual(
      expect.arrayContaining([
        'name',
        'repName',
        'aliases',
        'dishType',
        'ingredients',
        'servingG',
        'kcal',
        'sodiumMg',
        'sourceCategory',
        'popularity',
      ]),
    );

    await upsertFoodSeeds(app.prisma, [primarySeed]);
    expect(
      await app.prisma.foodSourceObservation.count({
        where: { foodItemId, source: 'mfds-nutrition', sourceId: 'N-1' },
      }),
    ).toBe(first.length);
    expect(await app.prisma.foodMergeConflict.count()).toBe(0);
  });

  it('빈 필드만 채우는 기존 정책을 유지하되 다른 non-empty 값은 open 충돌로 단 한 번 남긴다', async () => {
    await upsertFoodSeeds(app.prisma, [conflictingSeed]);
    const row = await app.prisma.foodItem.findUniqueOrThrow({ where: { id: foodItemId } });
    expect(row).toMatchObject({
      repName: '감자전',
      dishType: 'pancake',
      mainIngredient: 'vegetable',
      servingG: 180,
      kcal: 220,
    });
    expect(JSON.parse(row.ingredientsJson!)).toEqual(['감자', '소금']);

    const conflicts = await app.prisma.foodMergeConflict.findMany({
      where: { foodItemId, status: 'open' },
    });
    expect(conflicts.map((item) => item.field)).toEqual(
      expect.arrayContaining([
        'repName',
        'dishType',
        'mainIngredient',
        'ingredients',
        'servingG',
        'kcal',
        'sourceCategory',
      ]),
    );
    const observationCount = await app.prisma.foodSourceObservation.count({
      where: { foodItemId },
    });

    await upsertFoodSeeds(app.prisma, [conflictingSeed]);
    expect(await app.prisma.foodSourceObservation.count({ where: { foodItemId } })).toBe(
      observationCount,
    );
    expect(await app.prisma.foodMergeConflict.count({ where: { foodItemId } })).toBe(
      conflicts.length,
    );
  });

  it('어드민만 큐를 보고 allowlist 필드를 해결하며 새 값 반영 뒤에도 출처 관측을 보존한다', async () => {
    expect(
      (await app.inject({ method: 'GET', url: CONFLICTS, headers: userAuth })).statusCode,
    ).toBe(403);
    const listed = await app.inject({
      method: 'GET',
      url: `${CONFLICTS}?limit=100`,
      headers: adminAuth,
    });
    expect(listed.statusCode).toBe(200);
    const body = listed.json<FoodMergeConflictListResultType>();
    expect(body.total).toBeGreaterThan(0);
    const dishType = body.items.find((item) => item.field === 'dishType')!;
    expect(dishType).toMatchObject({
      existingValue: 'pancake',
      incomingValue: 'fried',
      source: 'mfds-recipe',
    });
    expect(dishType.observations.map((item) => item.source)).toEqual(
      expect.arrayContaining(['mfds-nutrition', 'mfds-recipe']),
    );

    const duplicate = await app.prisma.foodMergeConflict.create({
      data: {
        foodItemId,
        field: 'dishType',
        existingValueJson: JSON.stringify('pancake'),
        incomingValueJson: JSON.stringify('fried'),
        source: 'mafra-recipe',
        sourceId: 'same-value',
      },
    });
    const alternative = await app.prisma.foodMergeConflict.create({
      data: {
        foodItemId,
        field: 'dishType',
        existingValueJson: JSON.stringify('pancake'),
        incomingValueJson: JSON.stringify('soup'),
        source: 'menu-canonical',
        sourceId: 'other-value',
      },
    });

    const accepted = await app.inject({
      method: 'PATCH',
      url: `${CONFLICTS}/${dishType.id}`,
      headers: adminAuth,
      payload: { action: 'accept_incoming' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ status: 'accepted_incoming' });
    expect(
      (await app.prisma.foodItem.findUniqueOrThrow({ where: { id: foodItemId } })).dishType,
    ).toBe('fried');
    expect(
      await app.prisma.foodSourceObservation.count({
        where: { foodItemId, field: 'dishType', source: 'mfds-recipe' },
      }),
    ).toBe(1);
    expect(
      await app.prisma.foodMergeConflict.findUniqueOrThrow({ where: { id: duplicate.id } }),
    ).toMatchObject({ status: 'dismissed' });
    expect(
      await app.prisma.foodMergeConflict.findUniqueOrThrow({ where: { id: alternative.id } }),
    ).toMatchObject({
      status: 'open',
      existingValueJson: JSON.stringify('fried'),
      incomingValueJson: JSON.stringify('soup'),
      resolutionJson: null,
      resolvedAt: null,
    });

    const ingredients = body.items.find((item) => item.field === 'ingredients')!;
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `${CONFLICTS}/${ingredients.id}`,
          headers: userAuth,
          payload: { action: 'keep_existing' },
        })
      ).statusCode,
    ).toBe(403);
    const kept = await app.inject({
      method: 'PATCH',
      url: `${CONFLICTS}/${ingredients.id}`,
      headers: adminAuth,
      payload: { action: 'keep_existing' },
    });
    expect(kept.statusCode).toBe(200);
    expect(kept.json()).toMatchObject({ status: 'kept_existing' });
    expect(
      JSON.parse(
        (await app.prisma.foodItem.findUniqueOrThrow({ where: { id: foodItemId } }))
          .ingredientsJson!,
      ),
    ).toEqual(['감자', '소금']);
  });

  it('큐 생성 뒤 대표값이 변하면 accept/keep의 stale 쓰기를 409로 차단한다', async () => {
    const conflict = await app.prisma.foodMergeConflict.findFirstOrThrow({
      where: { foodItemId, field: 'kcal', status: 'open' },
    });
    await app.prisma.foodItem.update({ where: { id: foodItemId }, data: { kcal: 230 } });

    const stale = await app.inject({
      method: 'PATCH',
      url: `${CONFLICTS}/${conflict.id}`,
      headers: adminAuth,
      payload: { action: 'accept_incoming' },
    });
    expect(stale.statusCode).toBe(409);
    expect(
      (await app.prisma.foodMergeConflict.findUniqueOrThrow({ where: { id: conflict.id } })).status,
    ).toBe('open');
    expect((await app.prisma.foodItem.findUniqueOrThrow({ where: { id: foodItemId } })).kcal).toBe(
      230,
    );

    // dismiss는 대표값을 쓰지 않으므로 stale 항목도 안전하게 닫을 수 있다.
    const service = new FoodMergeConflictService(app.prisma);
    const dismissed = await service.resolve(conflict.id, 'dismiss', 'food-conflict-admin');
    expect(dismissed.status).toBe('dismissed');
  });
});
