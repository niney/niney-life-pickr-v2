import { access, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  MEAL_DATA_DELETE_CONFIRMATION,
  type CreateMealEntryInputType,
  type DeleteMealDataResultType,
  type MealDataExportType,
  type RecognizedDishType,
} from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import type { FoodService } from '../food/food.service.js';
import { MealDataService } from './meal-data.service.js';
import { MealService } from './meal.service.js';

const DATA = '/api/v1/meals/data';
const EXPORT = `${DATA}/export`;
const userDir = (userId: string): string => join(tmpdir(), 'lifepickr-test-meal-photos', userId);
const photoPath = (userId: string, token: string, thumb = false): string =>
  join(userDir(userId), `${token}${thumb ? '_t' : ''}.jpg`);

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const raceEntryInput = (name: string): CreateMealEntryInputType => ({
  eatenAt: '2026-08-23T05:00:00.000Z',
  eatenDate: '2026-08-23',
  slot: 'lunch',
  source: 'manual',
  items: [{ name, isMain: true, source: 'manual' }],
  photoTokens: [],
});

const exportRecognitionDish: RecognizedDishType = {
  name: '비빔밥',
  candidates: [{ name: '돌솟비빔밥', confidence: 0.61 }],
  confidence: 0.72,
  isMain: true,
  portion: 'normal',
  isDrink: false,
  photoIndex: 0,
  foodId: null,
  matchedName: '비빔밥',
  dishType: 'rice',
  mainIngredient: 'vegetable',
  cuisine: 'korean',
};

describe('meal data export/delete routes (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let auth: { authorization: string };
  let attachedToken = '';
  let orphanToken = '';
  let jpeg: Buffer;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    // useIsolatedDatabase 는 dev.db 복사본을 쓰므로 아직 개발 DB에 적용하지 않은 신규 migration도
    // 실제 SQL 그대로 임시 DB에 적용해 FK 동작까지 검증한다.
    const migrationSql = await readFile(
      new URL('../../../prisma/migrations/20260823170000_add_meal_photo_user_fk/migration.sql', import.meta.url),
      'utf8',
    );
    const migrationClient = new PrismaClient();
    try {
      for (const statement of migrationSql.split(';').map((part) => part.trim()).filter(Boolean)) {
        await migrationClient.$executeRawUnsafe(statement);
      }
    } finally {
      await migrationClient.$disconnect();
    }
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'meal-data-user', role: 'USER' },
      { id: 'meal-data-other', role: 'USER' },
      { id: 'meal-data-cascade', role: 'USER' },
      { id: 'meal-data-race-before', role: 'USER' },
      { id: 'meal-data-race-during', role: 'USER' },
      { id: 'meal-data-delete-retry', role: 'USER' },
    ]);
    auth = {
      authorization: `Bearer ${app.jwt.sign({ userId: 'meal-data-user', email: 'data@x.com', role: 'USER' })}`,
    };
    jpeg = await sharp({
      create: { width: 24, height: 18, channels: 3, background: { r: 90, g: 150, b: 210 } },
    })
      .jpeg()
      .toBuffer();

    const attached = await app.mealPhotos.store('meal-data-user', jpeg);
    const orphan = await app.mealPhotos.store('meal-data-user', jpeg);
    attachedToken = attached.token;
    orphanToken = orphan.token;
    const entry = await app.inject({
      method: 'POST',
      url: '/api/v1/meals',
      headers: auth,
      payload: {
        eatenAt: '2026-08-23T03:00:00.000Z',
        eatenDate: '2026-08-23',
        slot: 'lunch',
        source: 'photo',
        items: [{ name: '내보내기 비빔밥', isMain: true, source: 'recognized', confidence: 0.72 }],
        photoTokens: [attachedToken],
        recognition: {
          model: 'vision-test',
          version: 7,
          dishes: [exportRecognitionDish],
        },
      },
    });
    expect(entry.statusCode).toBe(201);

    await app.prisma.mealPreference.create({
      data: {
        userId: 'meal-data-user',
        weightsJson: JSON.stringify({
          variety: 4,
          taste: 5,
          balance: 3,
          health: 2,
          novelty: 1,
          weather: 1,
          convenience: 3,
        }),
        dislikedFoodsJson: JSON.stringify(['고수']),
        likedFoodsJson: JSON.stringify(['비빔밥']),
        onboarded: true,
      },
    });
    await app.prisma.mealRecommendation.create({
      data: {
        userId: 'meal-data-user',
        targetDate: '2026-08-24',
        targetSlot: 'dinner',
        contextJson: JSON.stringify({ mealType: 'home', note: '따뜻하게' }),
        profileJson: JSON.stringify({ entryCount: 1, recentFoods: ['비빔밥'] }),
        profileHash: 'profile-user',
        itemsJson: JSON.stringify([
          {
            name: '된장찌개',
            foodId: null,
            dishType: 'stew',
            mainIngredient: 'soy',
            cuisine: 'korean',
            reason: '따뜻한 저녁',
            tags: ['집밥'],
            score: 0.8,
            lastEatenDate: null,
            ingredients: [],
          },
        ]),
        summary: '따뜻한 메뉴',
        status: 'done',
      },
    });

    // 다른 사용자의 모든 데이터 종류도 만들어 삭제/내보내기 소유권 격리를 검증한다.
    const otherPhoto = await app.mealPhotos.store('meal-data-other', jpeg);
    await app.prisma.mealEntry.create({
      data: {
        userId: 'meal-data-other',
        eatenAt: new Date('2026-08-23T04:00:00.000Z'),
        eatenDate: '2026-08-23',
        slot: 'lunch',
        items: {
          create: { name: '남의 식단', nameNorm: '남의식단', isMain: true, source: 'manual' },
        },
      },
    });
    await app.prisma.mealPreference.create({
      data: { userId: 'meal-data-other', weightsJson: '{}' },
    });
    await app.prisma.mealRecommendation.create({
      data: {
        userId: 'meal-data-other',
        targetDate: '2026-08-24',
        targetSlot: 'dinner',
        itemsJson: '[]',
        summary: '남의 추천',
        status: 'fallback',
      },
    });
    expect(otherPhoto.token).toBeTruthy();
  });

  afterAll(async () => {
    await app.close();
    for (const userId of [
      'meal-data-user',
      'meal-data-other',
      'meal-data-cascade',
      'meal-data-race-before',
      'meal-data-race-during',
      'meal-data-delete-retry',
    ]) {
      await rm(userDir(userId), { recursive: true, force: true });
    }
    isolated.restore();
  });

  it('인증 없이는 내보내기와 전체 삭제 모두 401', async () => {
    expect((await app.inject({ method: 'GET', url: EXPORT })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: DATA,
          payload: { confirmation: MEAL_DATA_DELETE_CONFIRMATION },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('본인 항목·사진 메타·인식·선호·추천만 버전 있는 JSON으로 내보낸다', async () => {
    const res = await app.inject({ method: 'GET', url: EXPORT, headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json<MealDataExportType>();
    expect(body).toMatchObject({
      format: 'niney-life-pickr.meal-data',
      version: 1,
      notice: { photoBinariesIncluded: false },
    });
    expect(Date.parse(body.exportedAt)).not.toBeNaN();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]?.items[0]?.name).toBe('내보내기 비빔밥');
    expect(body.entries[0]?.photos[0]).toMatchObject({ token: attachedToken });
    expect(Date.parse(body.entries[0]!.photos[0]!.createdAt)).not.toBeNaN();
    expect(body.entries[0]?.recognition).toEqual({
      model: 'vision-test',
      version: 7,
      dishes: [exportRecognitionDish],
    });
    expect(body.orphanPhotos.map((photo) => photo.token)).toEqual([orphanToken]);
    expect(body.preference).toMatchObject({
      dislikedFoods: ['고수'],
      likedFoods: ['비빔밥'],
      onboarded: true,
    });
    expect(body.recommendations).toHaveLength(1);
    expect(body.recommendations[0]).toMatchObject({
      summary: '따뜻한 메뉴',
      context: { mealType: 'home', note: '따뜻하게' },
      profile: { entryCount: 1, recentFoods: ['비빔밥'] },
      profileHash: 'profile-user',
    });
    expect(JSON.stringify(body)).not.toContain('남의 식단');
    expect(JSON.stringify(body)).not.toContain('남의 추천');
  });

  it('잘못된 확인 문자열은 400이고 어떤 데이터도 지우지 않는다', async () => {
    const before = await app.prisma.mealEntry.count({ where: { userId: 'meal-data-user' } });
    const res = await app.inject({
      method: 'DELETE',
      url: DATA,
      headers: auth,
      payload: { confirmation: 'DELETE' },
    });
    expect(res.statusCode).toBe(400);
    expect(await app.prisma.mealEntry.count({ where: { userId: 'meal-data-user' } })).toBe(before);
  });

  it('본인 DB 데이터와 붙지 않은 사진 파일까지 지우고 재호출은 멱등이다', async () => {
    for (const token of [attachedToken, orphanToken]) {
      await expect(access(photoPath('meal-data-user', token))).resolves.toBeUndefined();
      await expect(access(photoPath('meal-data-user', token, true))).resolves.toBeUndefined();
    }

    const res = await app.inject({
      method: 'DELETE',
      url: DATA,
      headers: auth,
      payload: { confirmation: MEAL_DATA_DELETE_CONFIRMATION },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<DeleteMealDataResultType>().deleted).toEqual({
      entries: 1,
      items: 1,
      photos: 2,
      recommendations: 1,
      preference: 1,
      photoFileSets: 2,
    });
    expect(await app.prisma.mealEntry.count({ where: { userId: 'meal-data-user' } })).toBe(0);
    expect(await app.prisma.mealPhoto.count({ where: { userId: 'meal-data-user' } })).toBe(0);
    expect(await app.prisma.mealRecommendation.count({ where: { userId: 'meal-data-user' } })).toBe(0);
    expect(await app.prisma.mealPreference.count({ where: { userId: 'meal-data-user' } })).toBe(0);
    expect(await app.prisma.mealEntry.count({ where: { userId: 'meal-data-other' } })).toBe(1);
    expect(await app.prisma.mealPhoto.count({ where: { userId: 'meal-data-other' } })).toBe(1);
    expect(await app.prisma.mealRecommendation.count({ where: { userId: 'meal-data-other' } })).toBe(1);
    expect(await app.prisma.mealPreference.count({ where: { userId: 'meal-data-other' } })).toBe(1);

    for (const token of [attachedToken, orphanToken]) {
      await expect(access(photoPath('meal-data-user', token))).rejects.toThrow();
      await expect(access(photoPath('meal-data-user', token, true))).rejects.toThrow();
    }

    const again = await app.inject({
      method: 'DELETE',
      url: DATA,
      headers: auth,
      payload: { confirmation: MEAL_DATA_DELETE_CONFIRMATION },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json<DeleteMealDataResultType>().deleted).toEqual({
      entries: 0,
      items: 0,
      photos: 0,
      recommendations: 0,
      preference: 0,
      photoFileSets: 0,
    });
  });

  it('MealPhoto.userId FK가 계정 삭제 시 고아 DB 행을 남기지 않는다', async () => {
    const photo = await app.mealPhotos.store('meal-data-cascade', jpeg);
    expect(await app.prisma.mealPhoto.findUnique({ where: { token: photo.token } })).not.toBeNull();
    await app.prisma.user.delete({ where: { id: 'meal-data-cascade' } });
    expect(await app.prisma.mealPhoto.findUnique({ where: { token: photo.token } })).toBeNull();
    // DB cascade 는 외부 파일을 지울 수 없으므로 테스트 파일은 보조 메서드로 정리한다.
    await app.mealPhotos.removeFiles([{ userId: 'meal-data-cascade', token: photo.token }]);
  });

  it('전체 삭제는 먼저 시작된 식단 쓰기가 끝난 뒤 실행되어 늦은 재생성을 남기지 않는다', async () => {
    const userId = 'meal-data-race-before';
    const createEntered = deferred();
    const releaseCreate = deferred();
    const food = {
      getNutrition: vi.fn().mockResolvedValue(null),
      matchFood: vi.fn(async () => {
        createEntered.resolve();
        await releaseCreate.promise;
        return null;
      }),
    } as unknown as FoodService;
    const meals = new MealService(app.prisma, { photos: app.mealPhotos, food });
    const data = new MealDataService(app.prisma, { photos: app.mealPhotos });

    const creating = meals.create(userId, raceEntryInput('삭제 전 진행 중인 식단'));
    await createEntered.promise;

    let deletionSettled = false;
    const deleting = data
      .deleteAll(userId, { confirmation: MEAL_DATA_DELETE_CONFIRMATION })
      .finally(() => {
        deletionSettled = true;
      });
    await Promise.resolve();
    expect(deletionSettled).toBe(false);

    releaseCreate.resolve();
    await creating;
    const result = await deleting;

    expect(result.deleted).toMatchObject({ entries: 1, items: 1 });
    expect(await app.prisma.mealEntry.count({ where: { userId } })).toBe(0);
    expect(await app.prisma.mealItem.count({ where: { entry: { userId } } })).toBe(0);
  });

  it('전체 삭제 진행 중 들어온 새 쓰기는 삭제가 끝난 뒤에만 시작한다', async () => {
    const userId = 'meal-data-race-during';
    const photo = await app.mealPhotos.store(userId, jpeg);
    const removeFilesEntered = deferred();
    const releaseRemoveFiles = deferred();
    const originalRemoveAllFilesForUser = app.mealPhotos.removeAllFilesForUser.bind(app.mealPhotos);
    const removeFiles = vi.spyOn(app.mealPhotos, 'removeAllFilesForUser').mockImplementationOnce(async (targetUserId) => {
      removeFilesEntered.resolve();
      await releaseRemoveFiles.promise;
      await originalRemoveAllFilesForUser(targetUserId);
    });
    const data = new MealDataService(app.prisma, { photos: app.mealPhotos });
    const meals = new MealService(app.prisma, { photos: app.mealPhotos });

    try {
      const deleting = data.deleteAll(userId, { confirmation: MEAL_DATA_DELETE_CONFIRMATION });
      await removeFilesEntered.promise;

      let creationSettled = false;
      const creating = meals.create(userId, raceEntryInput('삭제 후 새 식단')).finally(() => {
        creationSettled = true;
      });
      await Promise.resolve();
      expect(creationSettled).toBe(false);
      expect(await app.prisma.mealEntry.count({ where: { userId } })).toBe(0);

      releaseRemoveFiles.resolve();
      await deleting;
      await creating;
      expect(await app.prisma.mealEntry.count({ where: { userId } })).toBe(1);
      await expect(access(photoPath(userId, photo.token))).rejects.toThrow();
    } finally {
      releaseRemoveFiles.resolve();
      removeFiles.mockRestore();
    }
  });

  it('사용자 폴더 삭제 실패는 오류로 전파하고 DB가 빈 재호출에서도 폴더 삭제를 복구한다', async () => {
    const userId = 'meal-data-delete-retry';
    const photo = await app.mealPhotos.store(userId, jpeg);
    const data = new MealDataService(app.prisma, { photos: app.mealPhotos });
    const removeAll = vi
      .spyOn(app.mealPhotos, 'removeAllFilesForUser')
      .mockRejectedValueOnce(new Error('forced directory removal failure'));

    try {
      await expect(
        data.deleteAll(userId, { confirmation: MEAL_DATA_DELETE_CONFIRMATION }),
      ).rejects.toThrow('forced directory removal failure');
      expect(await app.prisma.mealPhoto.count({ where: { userId } })).toBe(0);
      await expect(access(photoPath(userId, photo.token))).resolves.toBeUndefined();

      const retry = await data.deleteAll(userId, { confirmation: MEAL_DATA_DELETE_CONFIRMATION });
      expect(retry.deleted).toEqual({
        entries: 0,
        items: 0,
        photos: 0,
        recommendations: 0,
        preference: 0,
        photoFileSets: 0,
      });
      expect(removeAll).toHaveBeenCalledTimes(2);
      await expect(access(userDir(userId))).rejects.toThrow();
    } finally {
      removeAll.mockRestore();
    }
  });
});
