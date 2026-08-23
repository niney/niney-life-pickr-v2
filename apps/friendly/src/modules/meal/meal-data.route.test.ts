import { access, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION,
  MEAL_DATA_DELETE_CONFIRMATION,
  type CreateMealEntryInputType,
  type DeleteMealPhotosResultType,
  type DeleteMealDataResultType,
  type MealDataBackupType,
  type MealDataExportType,
  type MealPhotoRetentionPreviewType,
  type RestoreMealDataResultType,
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
    const migrationClient = new PrismaClient();
    try {
      for (const migration of [
        '20260823170000_add_meal_photo_user_fk',
        '20260823210000_meal_backup_restore',
        '20260823220000_meal_photo_deletion_outbox',
      ]) {
        const existingTable =
          migration === '20260823210000_meal_backup_restore'
            ? 'meal_data_imports'
            : migration === '20260823220000_meal_photo_deletion_outbox'
              ? 'meal_photo_deletions'
              : null;
        if (existingTable !== null) {
          const table = await migrationClient.$queryRawUnsafe<Array<{ name: string }>>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='${existingTable}'`,
          );
          if (table.length > 0) continue;
        }
        const migrationSql = await readFile(
          new URL(`../../../prisma/migrations/${migration}/migration.sql`, import.meta.url),
          'utf8',
        );
        for (const statement of migrationSql.split(';').map((part) => part.trim()).filter(Boolean)) {
          await migrationClient.$executeRawUnsafe(statement);
        }
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
      { id: 'meal-data-retention', role: 'USER' },
      { id: 'meal-data-retention-other', role: 'USER' },
      { id: 'meal-data-retention-retry', role: 'USER' },
      { id: 'meal-data-restore', role: 'USER' },
      { id: 'meal-data-restore-race', role: 'USER' },
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
    const recommendation = await app.prisma.mealRecommendation.create({
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
    await app.prisma.mealRecommendationEvent.create({
      data: {
        recommendationId: recommendation.id,
        userId: 'meal-data-user',
        kind: 'candidate_picked',
        candidateName: '된장찌개',
        candidateRank: 0,
        platform: 'mobile',
        rankingVersion: 1,
      },
    });
    await app.prisma.mealDailyQuota.create({
      data: { userId: 'meal-data-user', date: '2026-08-23', purpose: 'recognition', count: 1 },
    });
    await app.prisma.mealDataImport.create({
      data: {
        userId: 'meal-data-user',
        archiveId: '00000000-0000-4000-8000-000000000001',
        entries: 0,
        items: 0,
        photos: 0,
        recommendations: 0,
        recommendationEvents: 0,
        preferenceResult: 'none',
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
      'meal-data-retention',
      'meal-data-retention-other',
      'meal-data-retention-retry',
      'meal-data-restore',
      'meal-data-restore-race',
    ]) {
      await rm(userDir(userId), { recursive: true, force: true });
    }
    isolated.restore();
  });

  it('인증 없이는 내보내기와 전체 삭제 모두 401', async () => {
    expect((await app.inject({ method: 'GET', url: EXPORT })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/meals/data/backup' })).statusCode).toBe(401);
    expect((await app.inject({
      method: 'POST',
      url: '/api/v1/meals/data/backup/restore',
      payload: {},
    })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/meals/data/photos/retention' })).statusCode).toBe(401);
    expect((await app.inject({
      method: 'DELETE',
      url: '/api/v1/meals/data/photos/retention',
      payload: { confirmation: MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION },
    })).statusCode).toBe(401);
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
      events: [{ kind: 'candidate_picked', candidateName: '된장찌개' }],
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

  it('사진 포함 백업은 토큰·경로 없이 무결성 payload와 추천 이벤트를 내보내고 다른 사용자에게 멱등 복원한다', async () => {
    const backupRes = await app.inject({
      method: 'GET',
      url: '/api/v1/meals/data/backup',
      headers: auth,
    });
    expect(backupRes.statusCode).toBe(200);
    const backup = backupRes.json<MealDataBackupType>();
    expect(backup).toMatchObject({
      format: 'niney-life-pickr.meal-backup',
      version: 1,
      notice: {
        encoding: 'json-base64',
        orphanPhotosSkipped: 1,
        duplicatePolicy: 'same-archive-id-is-idempotent',
      },
    });
    expect(backup.photos).toHaveLength(1);
    expect(backup.photos[0]).toMatchObject({ contentType: 'image/jpeg', byteSize: expect.any(Number) });
    expect(backup.photos[0]!.dataBase64.length).toBeGreaterThan(10);
    expect(backup.recommendations[0]?.events).toEqual([
      expect.objectContaining({ kind: 'candidate_picked', candidateName: '된장찌개' }),
    ]);
    expect(JSON.stringify(backup)).not.toContain(attachedToken);
    expect(JSON.stringify(backup)).not.toContain('meal-photos/');

    const restoreAuth = {
      authorization: `Bearer ${app.jwt.sign({ userId: 'meal-data-restore', email: 'restore@x.com', role: 'USER' })}`,
    };
    const restoredRes = await app.inject({
      method: 'POST',
      url: '/api/v1/meals/data/backup/restore',
      headers: restoreAuth,
      payload: backup,
    });
    expect(restoredRes.statusCode).toBe(200);
    expect(restoredRes.json<RestoreMealDataResultType>()).toMatchObject({
      archiveId: backup.archiveId,
      duplicate: false,
      restored: {
        entries: 1,
        items: 1,
        photos: 1,
        recommendations: 1,
        recommendationEvents: 1,
        preference: 'restored',
      },
    });
    const restoredEntry = await app.prisma.mealEntry.findFirst({
      where: { userId: 'meal-data-restore' },
      include: { photos: true },
    });
    expect(restoredEntry?.id).not.toBe(backup.entries[0]?.ref);
    expect(restoredEntry?.photos[0]?.token).not.toBe(attachedToken);
    await expect(app.mealPhotos.read('meal-data-restore', restoredEntry!.photos[0]!.token, 'full')).resolves.toBeTruthy();
    expect(await app.prisma.mealRecommendationEvent.count({ where: { userId: 'meal-data-restore' } })).toBe(1);

    const beforeCounts = await Promise.all([
      app.prisma.mealEntry.count({ where: { userId: 'meal-data-restore' } }),
      app.prisma.mealPhoto.count({ where: { userId: 'meal-data-restore' } }),
    ]);
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/meals/data/backup/restore',
      headers: restoreAuth,
      payload: backup,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json<RestoreMealDataResultType>().duplicate).toBe(true);
    expect(await Promise.all([
      app.prisma.mealEntry.count({ where: { userId: 'meal-data-restore' } }),
      app.prisma.mealPhoto.count({ where: { userId: 'meal-data-restore' } }),
    ])).toEqual(beforeCounts);

    const unsafe = structuredClone(backup);
    unsafe.archiveId = '11111111-1111-4111-8111-111111111111';
    unsafe.entries[0]!.photoRefs[0] = '../../other-user/photo.jpg';
    expect((await app.inject({
      method: 'POST',
      url: '/api/v1/meals/data/backup/restore',
      headers: restoreAuth,
      payload: unsafe,
    })).statusCode).toBe(400);

    const tampered = structuredClone(backup);
    tampered.archiveId = '22222222-2222-4222-8222-222222222222';
    tampered.photos[0]!.sha256 = '0'.repeat(64);
    expect((await app.inject({
      method: 'POST',
      url: '/api/v1/meals/data/backup/restore',
      headers: restoreAuth,
      payload: tampered,
    })).statusCode).toBe(400);
  });

  it('90일 이전 사진과 오래된 고아만 소유자 범위에서 DB 커밋 후 지우고 텍스트 기록을 남긴다', async () => {
    const userId = 'meal-data-retention';
    const retentionAuth = {
      authorization: `Bearer ${app.jwt.sign({ userId, email: 'retention@x.com', role: 'USER' })}`,
    };
    const oldPhoto = await app.mealPhotos.store(userId, jpeg);
    const recentPhoto = await app.mealPhotos.store(userId, jpeg);
    const orphanPhoto = await app.mealPhotos.store(userId, jpeg);
    const otherPhoto = await app.mealPhotos.store('meal-data-retention-other', jpeg);
    const oldEntry = await app.prisma.mealEntry.create({
      data: {
        userId,
        eatenAt: new Date('2026-01-02T03:00:00.000Z'),
        eatenDate: '2026-01-02',
        slot: 'lunch',
        memo: '사진을 지워도 남을 메모',
        items: { create: { name: '오래된 식사', nameNorm: '오래된식사', isMain: true } },
      },
    });
    const recentEntry = await app.prisma.mealEntry.create({
      data: {
        userId,
        eatenAt: new Date('2026-08-20T03:00:00.000Z'),
        eatenDate: '2026-08-20',
        slot: 'lunch',
        items: { create: { name: '최근 식사', nameNorm: '최근식사', isMain: true } },
      },
    });
    await Promise.all([
      app.prisma.mealPhoto.update({ where: { token: oldPhoto.token }, data: { entryId: oldEntry.id } }),
      app.prisma.mealPhoto.update({ where: { token: recentPhoto.token }, data: { entryId: recentEntry.id } }),
      app.prisma.mealPhoto.update({ where: { token: orphanPhoto.token }, data: { createdAt: new Date('2026-01-01') } }),
      app.prisma.mealPhoto.update({ where: { token: otherPhoto.token }, data: { createdAt: new Date('2026-01-01') } }),
    ]);

    const preview = await app.inject({
      method: 'GET',
      url: '/api/v1/meals/data/photos/retention?before=2026-06-01',
      headers: retentionAuth,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json<MealPhotoRetentionPreviewType>()).toMatchObject({
      before: '2026-06-01',
      entries: 1,
      attachedPhotos: 1,
      orphanPhotos: 1,
      totalPhotos: 2,
    });

    const targetTokens = [oldPhoto.token, orphanPhoto.token];
    const originalRemoveFilesStrict = app.mealPhotos.removeFilesStrict.bind(app.mealPhotos);
    const removeFilesStrict = vi
      .spyOn(app.mealPhotos, 'removeFilesStrict')
      .mockImplementationOnce(async (rows) => {
        // strict 파일 삭제 callback에 진입했을 때 DB 행·purgedAt과 재시도 outbox가 함께
        // 커밋돼 있어야 한다. unlink 성공 뒤에만 outbox 행이 사라진다.
        expect(await app.prisma.mealPhoto.count({ where: { token: { in: targetTokens } } })).toBe(0);
        expect(
          (await app.prisma.mealEntry.findUnique({ where: { id: oldEntry.id } }))?.photoPurgedAt,
        ).not.toBeNull();
        expect(await app.prisma.mealPhotoDeletion.count({ where: { userId } })).toBe(2);
        await originalRemoveFilesStrict(rows);
      });
    try {
      const deleted = await app.inject({
        method: 'DELETE',
        url: '/api/v1/meals/data/photos/retention',
        headers: retentionAuth,
        payload: {
          before: '2026-06-01',
          confirmation: MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION,
        },
      });
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json<DeleteMealPhotosResultType>().deleted).toMatchObject({
        entriesMarked: 1,
        attachedPhotos: 1,
        orphanPhotos: 1,
        totalPhotos: 2,
        photoFileSets: 2,
        pendingFileSets: 0,
      });
    } finally {
      removeFilesStrict.mockRestore();
    }
    expect(await app.prisma.mealPhotoDeletion.count({ where: { userId } })).toBe(0);
    expect((await app.prisma.mealEntry.findUnique({ where: { id: oldEntry.id } }))?.memo).toBe('사진을 지워도 남을 메모');
    expect(await app.prisma.mealItem.count({ where: { entryId: oldEntry.id } })).toBe(1);
    expect(await app.prisma.mealPhoto.findUnique({ where: { token: recentPhoto.token } })).not.toBeNull();
    expect(await app.prisma.mealPhoto.findUnique({ where: { token: otherPhoto.token } })).not.toBeNull();

    const replacementPhoto = await app.mealPhotos.store(userId, jpeg);
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/meals/${oldEntry.id}`,
      headers: retentionAuth,
      payload: { photoTokens: [replacementPhoto.token] },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<{ photoPurgedAt: string | null }>().photoPurgedAt).toBeNull();
    expect((await app.prisma.mealEntry.findUnique({ where: { id: oldEntry.id } }))?.photoPurgedAt).toBeNull();
  });

  it('사진 unlink 실패를 outbox에 남기고 같은 retention DELETE에서 명시적으로 재시도한다', async () => {
    const userId = 'meal-data-retention-retry';
    const retryAuth = {
      authorization: `Bearer ${app.jwt.sign({ userId, email: 'retention-retry@x.com', role: 'USER' })}`,
    };
    const photo = await app.mealPhotos.store(userId, jpeg);
    const entry = await app.prisma.mealEntry.create({
      data: {
        userId,
        eatenAt: new Date('2026-01-03T03:00:00.000Z'),
        eatenDate: '2026-01-03',
        slot: 'dinner',
        items: { create: { name: '재시도 식사', nameNorm: '재시도식사', isMain: true } },
      },
    });
    await app.prisma.mealPhoto.update({ where: { token: photo.token }, data: { entryId: entry.id } });

    const removeFilesStrict = vi
      .spyOn(app.mealPhotos, 'removeFilesStrict')
      .mockRejectedValueOnce(new Error('forced unlink failure'));
    try {
      const first = await app.inject({
        method: 'DELETE',
        url: '/api/v1/meals/data/photos/retention',
        headers: retryAuth,
        payload: {
          before: '2026-06-01',
          confirmation: MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION,
        },
      });
      expect(first.statusCode).toBe(200);
      expect(first.json<DeleteMealPhotosResultType>().deleted).toMatchObject({
        totalPhotos: 1,
        photoFileSets: 1,
        pendingFileSets: 1,
      });
      expect(await app.prisma.mealPhoto.findUnique({ where: { token: photo.token } })).toBeNull();
      expect(await app.prisma.mealPhotoDeletion.findUnique({
        where: { userId_token: { userId, token: photo.token } },
      })).toMatchObject({ attempts: 1, lastError: 'forced unlink failure' });
      await expect(access(photoPath(userId, photo.token))).resolves.toBeUndefined();
    } finally {
      removeFilesStrict.mockRestore();
    }

    const retry = await app.inject({
      method: 'DELETE',
      url: '/api/v1/meals/data/photos/retention',
      headers: retryAuth,
      payload: {
        before: '2026-06-01',
        confirmation: MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION,
      },
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json<DeleteMealPhotosResultType>().deleted).toMatchObject({
      totalPhotos: 0,
      photoFileSets: 0,
      pendingFileSets: 0,
    });
    expect(await app.prisma.mealPhotoDeletion.count({ where: { userId } })).toBe(0);
    await expect(access(photoPath(userId, photo.token))).rejects.toThrow();
    await expect(access(photoPath(userId, photo.token, true))).rejects.toThrow();
  });

  it('백업 복원 사진 저장 중에는 같은 사용자의 전체 삭제가 끼어들지 않는다', async () => {
    const userId = 'meal-data-restore-race';
    const data = new MealDataService(app.prisma, {
      photos: app.mealPhotos,
      purgeRecognitionDebugForUser: vi.fn().mockResolvedValue(undefined),
    });
    const archive = await data.backup('meal-data-user');
    const storeEntered = deferred();
    const releaseStore = deferred();
    const originalStore = app.mealPhotos.storeWhileMutationLocked.bind(app.mealPhotos);
    const store = vi
      .spyOn(app.mealPhotos, 'storeWhileMutationLocked')
      .mockImplementationOnce(async (targetUserId, buffer) => {
        storeEntered.resolve();
        await releaseStore.promise;
        return originalStore(targetUserId, buffer);
      });

    try {
      const restoring = data.restore(userId, archive);
      await storeEntered.promise;
      let deletionSettled = false;
      const deleting = data
        .deleteAll(userId, { confirmation: MEAL_DATA_DELETE_CONFIRMATION })
        .finally(() => {
          deletionSettled = true;
        });
      await Promise.resolve();
      expect(deletionSettled).toBe(false);

      releaseStore.resolve();
      await restoring;
      await deleting;
      expect(await app.prisma.mealEntry.count({ where: { userId } })).toBe(0);
      expect(await app.prisma.mealPhoto.count({ where: { userId } })).toBe(0);
      expect(await app.prisma.mealDataImport.count({ where: { userId } })).toBe(0);
    } finally {
      releaseStore.resolve();
      store.mockRestore();
    }
  });

  it('본인 DB 데이터와 붙지 않은 사진 파일까지 지우고 재호출은 멱등이다', async () => {
    for (const token of [attachedToken, orphanToken]) {
      await expect(access(photoPath('meal-data-user', token))).resolves.toBeUndefined();
      await expect(access(photoPath('meal-data-user', token, true))).resolves.toBeUndefined();
    }
    await app.prisma.mealPhotoDeletion.create({
      data: {
        userId: 'meal-data-user',
        token: '00000000-0000-4000-8000-000000000099',
        reason: 'retention',
      },
    });

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
      recommendationEvents: 1,
      dailyQuotas: 1,
      importLedgers: 1,
      preference: 1,
      photoFileSets: 2,
    });
    expect(await app.prisma.mealEntry.count({ where: { userId: 'meal-data-user' } })).toBe(0);
    expect(await app.prisma.mealPhoto.count({ where: { userId: 'meal-data-user' } })).toBe(0);
    expect(await app.prisma.mealRecommendation.count({ where: { userId: 'meal-data-user' } })).toBe(0);
    expect(await app.prisma.mealRecommendationEvent.count({ where: { userId: 'meal-data-user' } })).toBe(0);
    expect(await app.prisma.mealDailyQuota.count({ where: { userId: 'meal-data-user' } })).toBe(0);
    expect(await app.prisma.mealDataImport.count({ where: { userId: 'meal-data-user' } })).toBe(0);
    expect(await app.prisma.mealPhotoDeletion.count({ where: { userId: 'meal-data-user' } })).toBe(0);
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
      recommendationEvents: 0,
      dailyQuotas: 0,
      importLedgers: 0,
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
    const purgeRecognitionDebugForUser = vi.fn().mockResolvedValue(undefined);
    const data = new MealDataService(app.prisma, { photos: app.mealPhotos, purgeRecognitionDebugForUser });
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
        recommendationEvents: 0,
        dailyQuotas: 0,
        importLedgers: 0,
        preference: 0,
        photoFileSets: 0,
      });
      expect(removeAll).toHaveBeenCalledTimes(2);
      expect(purgeRecognitionDebugForUser).toHaveBeenCalledTimes(2);
      expect(purgeRecognitionDebugForUser).toHaveBeenNthCalledWith(1, userId, [photo.token]);
      expect(purgeRecognitionDebugForUser).toHaveBeenNthCalledWith(2, userId, []);
      await expect(access(userDir(userId))).rejects.toThrow();
    } finally {
      removeAll.mockRestore();
    }
  });
});
