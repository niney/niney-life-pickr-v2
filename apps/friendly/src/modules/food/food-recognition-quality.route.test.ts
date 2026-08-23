import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FoodRecognitionQualityResultType } from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { MEAL_RECOGNITION_VERSION } from '../meal-recognition/meal-recognition.prompts.js';

const QUALITY = '/api/v1/admin/food/recognition-quality';

interface SeedDish {
  name: string;
  matchedName?: string | null;
  foodId?: string | null;
}

interface SeedFinalItem {
  name: string;
  nameNorm: string;
  foodId?: string | null;
  source: 'recognized' | 'catalog' | 'manual';
}

describe('food recognition quality admin route (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let adminAuth: { authorization: string };
  let userAuth: { authorization: string };

  const seedEntry = async (
    id: string,
    recognition: unknown,
    items: SeedFinalItem[],
    createdAt = new Date(),
    userId = 'quality-user',
  ): Promise<void> => {
    await app.prisma.mealEntry.create({
      data: {
        id,
        userId,
        eatenAt: createdAt,
        eatenDate: createdAt.toISOString().slice(0, 10),
        slot: 'lunch',
        source: 'photo',
        recognitionJson:
          typeof recognition === 'string' ? recognition : JSON.stringify(recognition),
        createdAt,
        items: {
          create: items.map((item, sortOrder) => ({
            name: item.name,
            nameNorm: item.nameNorm,
            foodId: item.foodId ?? null,
            source: item.source,
            sortOrder,
          })),
        },
      },
    });
  };

  const snapshot = (dishes: SeedDish[]) => ({
    model: 'vision-model',
    version: MEAL_RECOGNITION_VERSION,
    dishes: dishes.map((dish, photoIndex) => ({
      name: dish.name,
      candidates: [{ name: dish.name, confidence: 0.8 }],
      confidence: 0.8,
      isMain: true,
      portion: 'normal',
      isDrink: false,
      photoIndex: Math.min(photoIndex, 4),
      foodId: dish.foodId ?? null,
      matchedName: dish.matchedName ?? dish.name,
      dishType: null,
      mainIngredient: null,
      cuisine: null,
    })),
  });

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'quality-admin', role: 'ADMIN' },
      { id: 'quality-user', role: 'USER' },
      { id: 'quality-user-2', role: 'USER' },
    ]);
    adminAuth = {
      authorization: `Bearer ${app.jwt.sign({ userId: 'quality-admin', email: 'admin@x.com', role: 'ADMIN' })}`,
    };
    userAuth = {
      authorization: `Bearer ${app.jwt.sign({ userId: 'quality-user', email: 'user@x.com', role: 'USER' })}`,
    };

    await seedEntry(
      'quality-valid-1',
      snapshot([
        { name: '김치 찌개', matchedName: '김치찌개', foodId: 'food-kimchi' },
        { name: '계란말이', foodId: 'food-egg' },
        { name: '멸치볶음', foodId: 'food-anchovy' },
      ]),
      [
        {
          name: '김치찌개',
          nameNorm: '김치찌개',
          foodId: 'food-kimchi',
          source: 'recognized',
        },
        {
          name: '달걀말이',
          nameNorm: '달걀말이',
          foodId: 'food-rolled-egg',
          source: 'catalog',
        },
        { name: '오이무침', nameNorm: '오이무침', source: 'manual' },
      ],
    );
    await seedEntry(
      'quality-valid-2',
      snapshot([{ name: '계란말이', foodId: 'food-egg' }]),
      [
        {
          name: '달걀말이',
          nameNorm: '달걀말이',
          foodId: 'food-rolled-egg',
          source: 'catalog',
        },
        { name: '오이무침', nameNorm: '오이무침', source: 'manual' },
      ],
    );
    // 빈 인식 결과 후 직접 입력한 희소 음식은 총계에는 잡히지만 top(k=2)에서는 숨겨야 한다.
    await seedEntry('quality-valid-empty', snapshot([]), [
      { name: '희소한가정식', nameNorm: '희소한가정식', source: 'manual' },
    ]);
    await seedEntry('quality-invalid-json', '{broken', []);
    await seedEntry(
      'quality-old-version',
      { model: 'old-model', version: MEAL_RECOGNITION_VERSION - 1, dishes: [] },
      [],
    );

    // 기본 30일 범위 밖의 기록은 조회에 포함되지 않는다.
    const old = new Date(Date.now() - 60 * 86_400_000);
    await seedEntry('quality-outside-window', snapshot([{ name: '과거음식' }]), [], old);
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('ADMIN 인증과 days 1..365 계약을 강제한다', async () => {
    expect((await app.inject({ method: 'GET', url: QUALITY })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: QUALITY, headers: userAuth })).statusCode,
    ).toBe(403);
    for (const days of ['0', '366', 'abc']) {
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `${QUALITY}?days=${days}`,
            headers: adminAuth,
          })
        ).statusCode,
      ).toBe(400);
    }
  });

  it('현재 버전 인식과 최종 항목을 집계하고 손상/구버전은 invalid 로 세다', async () => {
    const res = await app.inject({ method: 'GET', url: QUALITY, headers: adminAuth });
    expect(res.statusCode).toBe(200);
    const body = res.json<FoodRecognitionQualityResultType>();
    expect(body).toMatchObject({
      days: 30,
      recognitionEntryCount: 5,
      invalidRecognitionCount: 2,
      originalDishCount: 4,
      confirmedCount: 1,
      correctedCount: 2,
      deletedCount: 1,
      manuallyAddedCount: 3,
      correctionRate: 0.75,
      unmatchedFinalItemCount: 3,
    });
    // 같은 사용자가 두 기록에서 반복했어도 음식명을 노출하지 않는다.
    expect(body.topCorrections).toEqual([]);
    expect(body.topUnmatched).toEqual([]);
    expect(body.topUnmatched).not.toContainEqual(expect.objectContaining({ name: '희소한가정식' }));
    expect(body.from).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.to).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const serialized = JSON.stringify(body);
    for (const forbidden of ['userId', 'memo', 'photo', 'quality-valid-1']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('두 번째 사용자가 같은 이벤트를 만들어야 텍스트를 노출하고 count는 전체 발생 횟수를 유지한다', async () => {
    const id = 'quality-second-user';
    await seedEntry(
      id,
      snapshot([{ name: '계란말이', foodId: 'food-egg' }]),
      [
        {
          name: '달걀말이',
          nameNorm: '달걀말이',
          foodId: 'food-rolled-egg',
          source: 'catalog',
        },
        { name: '오이무침', nameNorm: '오이무침', source: 'manual' },
      ],
      new Date(),
      'quality-user-2',
    );

    try {
      const res = await app.inject({ method: 'GET', url: QUALITY, headers: adminAuth });
      expect(res.statusCode).toBe(200);
      const body = res.json<FoodRecognitionQualityResultType>();
      expect(body.topCorrections).toEqual([
        { originalName: '계란말이', finalName: '달걀말이', count: 3 },
      ]);
      expect(body.topUnmatched).toEqual([{ name: '오이무침', count: 3 }]);
      expect(JSON.stringify(body)).not.toContain('quality-user-2');
      expect(JSON.stringify(body)).not.toContain('userId');
    } finally {
      await app.prisma.mealEntry.delete({ where: { id } });
    }
  });

  it('days 를 늘리면 해당 기간의 인식 기록을 포함한다', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${QUALITY}?days=90`,
      headers: adminAuth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<FoodRecognitionQualityResultType>()).toMatchObject({
      days: 90,
      recognitionEntryCount: 6,
      originalDishCount: 5,
      deletedCount: 2,
    });
  });
});
