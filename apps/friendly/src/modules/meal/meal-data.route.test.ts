import { createHash, randomBytes } from 'node:crypto';
import { access, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  MEAL_DATA_BACKUP_FORMAT,
  MEAL_DATA_BACKUP_MAX_PHOTO_BYTES,
  MEAL_DATA_BACKUP_VERSION,
  MEAL_MAX_ENTRIES_PER_DAY,
  MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION,
  MEAL_DATA_DELETE_CONFIRMATION,
  MealDataBackup,
  MealDataExport,
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
import { AsyncGate } from '../../lib/async-gate.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { DEFAULT_LEXICON } from '../food/engine/index.js';
import type { FoodService } from '../food/food.service.js';
import { MealDataService } from './meal-data.service.js';
import { mealMutationBarrier } from './meal-mutation-barrier.js';
import { mealRestoreIntakeGate } from './meal-restore-intake.js';
import { MealService } from './meal.service.js';

// 사진 포함 백업·내보내기 스트림, 복원 청크·상한, 전역 1건(성능 감사 2차) — 아래 '스트림·복원 청크·상한' describe.
const BACKUP = '/api/v1/meals/data/backup';
const RESTORE = '/api/v1/meals/data/backup/restore';
const STREAM_USERS = ['stream-a', 'stream-b', 'stream-c', 'stream-d', 'stream-e', 'stream-f', 'stream-g', 'stream-h', 'stream-i', 'stream-j', 'stream-k'];

const emptyArchive = (archiveId: string): MealDataBackupType => ({
  format: MEAL_DATA_BACKUP_FORMAT,
  version: MEAL_DATA_BACKUP_VERSION,
  archiveId,
  exportedAt: '2026-10-05T00:00:00.000Z',
  notice: {
    encoding: 'json-base64',
    orphanPhotosSkipped: 0,
    duplicatePolicy: 'same-archive-id-is-idempotent',
    mergePolicy: 'append-records-keep-existing-preference',
  },
  entries: [],
  photos: [],
  preference: null,
  recommendations: [],
});

const archiveEntry = (ref: string, date: string, photoRefs: string[] = []): MealDataBackupType['entries'][number] => ({
  ref,
  originRecommendationRef: null,
  eatenAt: `${date}T03:00:00.000Z`,
  eatenDate: date,
  slot: 'lunch',
  mealType: null,
  placeId: null,
  placeName: null,
  memo: null,
  source: 'manual',
  recognition: null,
  photoPurgedAt: null,
  createdAt: `${date}T03:00:00.000Z`,
  updatedAt: `${date}T03:00:00.000Z`,
  photoRefs,
  items: [
    {
      name: '복원 비빔밥',
      foodId: null,
      dishType: null,
      mainIngredient: null,
      cuisine: null,
      portion: null,
      servings: null,
      portionSource: null,
      isMain: true,
      confidence: null,
      recognitionDishId: null,
      selectedCandidateRank: null,
      catalogMatchedBy: 'none',
      catalogMatchScore: null,
      source: 'manual',
      sortOrder: 0,
      kcal: 500,
      proteinG: 10,
      sodiumMg: 800,
      nutritionFrom: null,
      nutritionBasis: 'direct',
    },
  ],
});

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
        sex: 'female',
        birthYear: 1990,
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
    // 영양제 조언은 기록에서 계산한 파생 데이터라 내보내지 않고 전체 삭제에서만 지운다.
    await app.prisma.mealNutritionAdvice.create({
      data: {
        userId: 'meal-data-user',
        targetDate: '2026-08-23',
        analysisJson: '{}',
        summary: '칼슘이 모자라요.',
        status: 'fallback',
      },
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
      sex: 'female',
      birthYear: 1990,
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
    // 영양소 점검 기준(성별·출생연도)도 백업에서 되살린다.
    expect(
      await app.prisma.mealPreference.findUnique({
        where: { userId: 'meal-data-restore' },
        select: { sex: true, birthYear: true },
      }),
    ).toEqual({ sex: 'female', birthYear: 1990 });

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
      .mockImplementationOnce(async (targetUserId, buffer, opts) => {
        storeEntered.resolve();
        await releaseStore.promise;
        return originalStore(targetUserId, buffer, opts);
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
      nutritionAdvices: 1,
      dailyQuotas: 1,
      importLedgers: 1,
      preference: 1,
      photoFileSets: 2,
    });
    expect(await app.prisma.mealEntry.count({ where: { userId: 'meal-data-user' } })).toBe(0);
    expect(await app.prisma.mealNutritionAdvice.count({ where: { userId: 'meal-data-user' } })).toBe(0);
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
      nutritionAdvices: 0,
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
      getServingRow: vi.fn().mockResolvedValue(null),
      servingLexicon: vi.fn().mockResolvedValue(DEFAULT_LEXICON),
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
        nutritionAdvices: 0,
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

  describe('스트림·복원 청크·상한 (성능 감사 2차 C-1·C-2·C-4)', () => {
    const authOf = (userId: string) => ({
      authorization: `Bearer ${app.jwt.sign({ userId, email: `${userId}@x.com`, role: 'USER' })}`,
    });

    beforeAll(async () => {
      await seedAuthUsers(app, STREAM_USERS.map((id) => ({ id, role: 'USER' as const })));
    });

    afterAll(async () => {
      for (const userId of STREAM_USERS) {
        await rm(join(tmpdir(), 'lifepickr-test-meal-photos', userId), { recursive: true, force: true });
      }
    });

    it('백업은 조각으로 흘려도 응답 스키마 직렬화와 바이트가 같고, 큰 사진도 base64 조각이 이어져 무결하게 복원된다', async () => {
      // 노이즈 사진 — 재인코딩 뒤에도 base64 조각(768KB 원본 단위) 여러 개로 나뉘는 크기.
      const noisy = await sharp(randomBytes(1600 * 1200 * 3), { raw: { width: 1600, height: 1200, channels: 3 } })
        .jpeg({ quality: 95 })
        .toBuffer();
      const big = await app.mealPhotos.store('stream-a', noisy);
      expect(big.byteSize).toBeGreaterThan(768 * 1024);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/meals',
        headers: authOf('stream-a'),
        payload: {
          eatenAt: '2026-09-01T03:00:00.000Z',
          eatenDate: '2026-09-01',
          slot: 'lunch',
          memo: '  따옴표 "와" 역슬래시 \\ 와 이모지 🍜  ',
          items: [{ name: ' 국수 ', isMain: true }],
          photoTokens: [big.token],
        },
      });
      expect(created.statusCode).toBe(201);

      const res = await app.inject({ method: 'GET', url: BACKUP, headers: authOf('stream-a') });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      // 조각으로 이어 붙인 본문이 스키마 직렬화(예전 응답 경로)와 한 바이트도 다르지 않다.
      const parsed = MealDataBackup.parse(JSON.parse(res.body));
      expect(JSON.stringify(parsed)).toBe(res.body);
      const photo = parsed.photos[0]!;
      const bytes = Buffer.from(photo.dataBase64, 'base64');
      expect(bytes.byteLength).toBe(photo.byteSize);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(photo.sha256);

      const restored = await app.inject({
        method: 'POST',
        url: RESTORE,
        headers: { ...authOf('stream-b'), 'content-type': 'application/json' },
        payload: res.body,
      });
      expect(restored.statusCode).toBe(200);
      expect(restored.json<RestoreMealDataResultType>().restored).toMatchObject({ entries: 1, photos: 1 });
      // 백업·복원이 끝나면 전역 자리와 사용자 장벽이 모두 풀린다.
      expect(mealMutationBarrier.pendingUserCount()).toBe(0);
    });

    it('내보내기는 500건 단위로 읽어도 같은 시각 기록까지 빠짐·중복 없이 [eatenAt, id] 순서이고 스키마 직렬화와 같다', async () => {
      const same = new Date('2026-05-05T03:00:00.000Z');
      await app.prisma.mealEntry.createMany({
        data: [
          // 페이지 경계에 같은 eatenAt 이 걸리게 600건을 한 시각에 몰아 넣는다.
          ...Array.from({ length: 600 }, () => ({ userId: 'stream-c', eatenAt: same, eatenDate: '2026-05-05', slot: 'lunch' })),
          ...Array.from({ length: 550 }, (_, i) => ({
            userId: 'stream-c',
            eatenAt: new Date(Date.UTC(2026, 0, 1) + i * 3_600_000),
            eatenDate: new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString().slice(0, 10),
            slot: 'dinner',
            memo: `메모 ${i}`,
          })),
        ],
      });
      const res = await app.inject({ method: 'GET', url: EXPORT, headers: authOf('stream-c') });
      expect(res.statusCode).toBe(200);
      const body = res.json<MealDataExportType>();
      expect(JSON.stringify(MealDataExport.parse(body))).toBe(res.body);
      const expected = await app.prisma.mealEntry.findMany({
        where: { userId: 'stream-c' },
        orderBy: [{ eatenAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      expect(body.entries.map((entry) => entry.id)).toEqual(expected.map((row) => row.id));
      expect(new Set(body.entries.map((entry) => entry.id)).size).toBe(1150);
    });

    it('복원은 예전 백업 한도(50MB)까지 받고 넘으면 디코드 전에 413, 정규식 없이도 깨진 base64 는 400', async () => {
      const archiveOf = (id: string, count: number) => {
        const archive = emptyArchive(id);
        archive.photos = Array.from({ length: count }, (_, i) => ({
          ref: `photo-${i}`,
          contentType: 'image/jpeg' as const,
          dataBase64: 'AAAA',
          sha256: '0'.repeat(64),
          byteSize: MEAL_DATA_BACKUP_MAX_PHOTO_BYTES,
          width: null,
          height: null,
        }));
        const refs = archive.photos.map((photo) => photo.ref);
        archive.entries = Array.from({ length: Math.ceil(count / 5) }, (_, i) =>
          archiveEntry(`entry-${i}`, `2026-04-${String(i + 1).padStart(2, '0')}`, refs.slice(i * 5, i * 5 + 5)),
        );
        return archive;
      };
      // 55MB — 복원 한도(50MB) 초과는 크기 선언만 보고 413.
      const tooBig = archiveOf('33333333-3333-4333-8333-333333333333', 11);
      const big = await app.inject({ method: 'POST', url: RESTORE, headers: authOf('stream-d'), payload: tooBig });
      expect(big.statusCode).toBe(413);
      // 30MB — 새 백업 한도(25MB)는 넘지만 예전 백업이라 크기로는 막지 않는다(여기선 가짜 사진이라 무결성 검증에서 400).
      const legacy = archiveOf('55555555-5555-4555-8555-555555555555', 6);
      const legacyRes = await app.inject({ method: 'POST', url: RESTORE, headers: authOf('stream-d'), payload: legacy });
      expect(legacyRes.statusCode).toBe(400);

      const broken = emptyArchive('44444444-4444-4444-8444-444444444444');
      broken.photos = [{ ref: 'p', contentType: 'image/jpeg', dataBase64: '@@@@', sha256: '0'.repeat(64), byteSize: 3, width: null, height: null }];
      broken.entries = [archiveEntry('e', '2026-04-03', ['p'])];
      const bad = await app.inject({ method: 'POST', url: RESTORE, headers: authOf('stream-d'), payload: broken });
      expect(bad.statusCode).toBe(400);
      expect(await app.prisma.mealEntry.count({ where: { userId: 'stream-d' } })).toBe(0);
    });

    it('DB 사진 합계가 한도를 넘으면 백업은 파일을 읽기 전에 413', async () => {
      const entry = await app.prisma.mealEntry.create({
        data: { userId: 'stream-e', eatenAt: new Date('2026-04-01T03:00:00Z'), eatenDate: '2026-04-01', slot: 'lunch' },
      });
      await app.prisma.mealPhoto.createMany({
        data: Array.from({ length: 6 }, (_, i) => ({
          token: `00000000-0000-4000-8000-0000000000${String(10 + i)}`,
          userId: 'stream-e',
          entryId: entry.id,
          byteSize: MEAL_DATA_BACKUP_MAX_PHOTO_BYTES,
          sortOrder: i,
        })),
      });
      const res = await app.inject({ method: 'GET', url: BACKUP, headers: authOf('stream-e') });
      expect(res.statusCode).toBe(413);
      expect(res.json<{ message: string }>().message).toContain('25MB');
    });

    it('복원 뒤 하루 끼니 상한을 넘으면 409 이고 아무것도 쓰지 않는다', async () => {
      await app.prisma.mealEntry.createMany({
        data: Array.from({ length: MEAL_MAX_ENTRIES_PER_DAY }, (_, i) => ({
          userId: 'stream-f',
          eatenAt: new Date(Date.UTC(2026, 3, 10, 0, i)),
          eatenDate: '2026-04-10',
          slot: 'snack',
        })),
      });
      const archive = emptyArchive('55555555-5555-4555-8555-555555555555');
      archive.entries = [archiveEntry('entry-1', '2026-04-10'), archiveEntry('entry-2', '2026-04-11')];
      const res = await app.inject({ method: 'POST', url: RESTORE, headers: authOf('stream-f'), payload: archive });
      expect(res.statusCode).toBe(409);
      expect(await app.prisma.mealEntry.count({ where: { userId: 'stream-f' } })).toBe(MEAL_MAX_ENTRIES_PER_DAY);
      expect(await app.prisma.mealDataImport.count({ where: { userId: 'stream-f' } })).toBe(0);
    });

    it('여러 청크로 나눠 쓰다 중간 청크가 실패하면 앞서 쓴 기록·추천·사진을 모두 정리하고 원장을 남기지 않는다', async () => {
      const archive = emptyArchive('66666666-6666-4666-8666-666666666666');
      const jpeg = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#468' } }).jpeg().toBuffer();
      archive.photos = [
        {
          ref: 'photo-1',
          contentType: 'image/jpeg',
          dataBase64: jpeg.toString('base64'),
          sha256: createHash('sha256').update(jpeg).digest('hex'),
          byteSize: jpeg.byteLength,
          width: 30,
          height: 20,
        },
      ];
      archive.entries = Array.from({ length: 1_200 }, (_, i) =>
        archiveEntry(`entry-${i}`, new Date(Date.UTC(2024, 0, 1) + Math.floor(i / 3) * 86_400_000).toISOString().slice(0, 10), i === 0 ? ['photo-1'] : []),
      );
      archive.recommendations = [
        {
          ref: 'rec-1',
          targetDate: '2024-01-02',
          targetSlot: 'lunch',
          items: [],
          summary: '요약',
          status: 'fallback',
          model: null,
          promptVersion: 1,
          notice: null,
          context: {},
          profile: {},
          profileHash: 'h',
          createdAt: '2024-01-02T00:00:00.000Z',
          feedback: { pickedName: null, rating: 1, eatenEntryRef: 'entry-5' },
          events: [{ kind: 'shown', candidateName: null, candidateFoodId: null, candidateRank: null, rating: null, platform: 'mobile', rankingVersion: 1, createdAt: '2024-01-02T00:00:00.000Z' }],
        },
      ];

      // 세 번째 트랜잭션(두 번째 기록 청크)에서 실패시킨다.
      let transactions = 0;
      const failing = new Proxy(app.prisma, {
        get(target, prop, receiver) {
          if (prop === '$transaction') {
            return (fn: Parameters<PrismaClient['$transaction']>[0]) => {
              transactions += 1;
              if (transactions === 3) return Promise.reject(new Error('forced chunk failure'));
              return (target.$transaction as (f: typeof fn) => Promise<unknown>)(fn);
            };
          }
          return Reflect.get(target, prop, receiver) as unknown;
        },
      }) as PrismaClient;
      const data = new MealDataService(failing, { photos: app.mealPhotos });
      await expect(data.restore('stream-g', archive)).rejects.toThrow('forced chunk failure');
      expect(transactions).toBe(3);
      expect(await app.prisma.mealEntry.count({ where: { userId: 'stream-g' } })).toBe(0);
      expect(await app.prisma.mealRecommendation.count({ where: { userId: 'stream-g' } })).toBe(0);
      expect(await app.prisma.mealRecommendationEvent.count({ where: { userId: 'stream-g' } })).toBe(0);
      expect(await app.prisma.mealPhoto.count({ where: { userId: 'stream-g' } })).toBe(0);
      expect(await app.prisma.mealDataImport.count({ where: { userId: 'stream-g' } })).toBe(0);

      // 같은 아카이브를 다시 보내면 정상 복원된다(실패가 원장을 남기지 않아 멱등 키를 막지 않는다).
      const ok = await new MealDataService(app.prisma, { photos: app.mealPhotos }).restore('stream-g', archive);
      expect(ok.restored).toMatchObject({ entries: 1_200, items: 1_200, photos: 1, recommendations: 1, recommendationEvents: 1 });
      const rec = await app.prisma.mealRecommendation.findFirst({ where: { userId: 'stream-g' } });
      const linked = await app.prisma.mealEntry.findMany({ where: { userId: 'stream-g' }, orderBy: [{ eatenAt: 'asc' }, { id: 'asc' }], take: 6 });
      // 추천 피드백의 기록 연결은 미리 만든 기록 id 로 한 번에 써진다.
      expect(JSON.parse(rec!.feedbackJson!)).toMatchObject({ rating: 1 });
      expect(linked.map((row) => row.id)).toContain(JSON.parse(rec!.feedbackJson!).eatenEntryId);
      expect(await app.prisma.mealPhoto.count({ where: { userId: 'stream-g', entryId: { not: null } } })).toBe(1);
    });

    // 복원 도중 프로세스가 끝난 꼴(배포 reload·메모리 재시작) — n 번째 쓰기 트랜잭션에서 끊기고 실패 정리도 돌지 못한다.
    // 커밋된 청크는 원장 없이 남는다.
    const dyingAt = (n: number): PrismaClient => {
      let transactions = 0;
      let dead = false;
      const died = (): Promise<never> => Promise.reject(new Error('process died'));
      return new Proxy(app.prisma, {
        get(target, prop, receiver) {
          if (prop === '$transaction') {
            return (fn: Parameters<PrismaClient['$transaction']>[0]) => {
              transactions += 1;
              if (dead || transactions === n) {
                dead = true;
                return died();
              }
              return (target.$transaction as (f: typeof fn) => Promise<unknown>)(fn);
            };
          }
          const value = Reflect.get(target, prop, receiver) as unknown;
          if (dead && (prop === 'mealEntry' || prop === 'mealRecommendation' || prop === 'mealPhoto')) {
            return new Proxy(value as object, {
              get: (delegate, method, self) => (method === 'deleteMany' ? died : (Reflect.get(delegate, method, self) as unknown)),
            });
          }
          return value;
        },
      }) as PrismaClient;
    };
    const jpegPhoto = async (ref: string, background: string): Promise<MealDataBackupType['photos'][number]> => {
      const jpeg = await sharp({ create: { width: 30, height: 20, channels: 3, background } }).jpeg().toBuffer();
      return {
        ref,
        contentType: 'image/jpeg',
        dataBase64: jpeg.toString('base64'),
        sha256: createHash('sha256').update(jpeg).digest('hex'),
        byteSize: jpeg.byteLength,
        width: 30,
        height: 20,
      };
    };

    it('복원 도중 프로세스가 끝나 일부 청크만 남아도, 같은 아카이브를 다시 보내면 잔여 행을 지우고 한 벌만 복원한다', async () => {
      const userId = 'stream-h';
      const archive = emptyArchive('99999999-9999-4999-8999-999999999999');
      archive.photos = [await jpegPhoto('photo-1', '#468')];
      archive.entries = Array.from({ length: 1_200 }, (_, i) =>
        archiveEntry(`entry-${i}`, new Date(Date.UTC(2024, 0, 1) + Math.floor(i / 3) * 86_400_000).toISOString().slice(0, 10), i === 0 ? ['photo-1'] : []),
      );
      archive.recommendations = [
        {
          ref: 'rec-1',
          targetDate: '2024-01-02',
          targetSlot: 'lunch',
          items: [],
          summary: '요약',
          status: 'fallback',
          model: null,
          promptVersion: 1,
          notice: null,
          context: {},
          profile: {},
          profileHash: 'h',
          createdAt: '2024-01-02T00:00:00.000Z',
          feedback: { pickedName: null, rating: 1, eatenEntryRef: 'entry-5' },
          events: [{ kind: 'shown', candidateName: null, candidateFoodId: null, candidateRank: null, rating: null, platform: 'mobile', rankingVersion: 1, createdAt: '2024-01-02T00:00:00.000Z' }],
        },
      ];
      const counts = async () => ({
        entries: await app.prisma.mealEntry.count({ where: { userId } }),
        items: await app.prisma.mealItem.count({ where: { entry: { userId } } }),
        recommendations: await app.prisma.mealRecommendation.count({ where: { userId } }),
        events: await app.prisma.mealRecommendationEvent.count({ where: { userId } }),
        photos: await app.prisma.mealPhoto.count({ where: { userId } }),
        ledgers: await app.prisma.mealDataImport.count({ where: { userId } }),
      });

      // 추천 청크 + 첫 기록 청크(500건, 사진 연결)까지 커밋되고 두 번째 기록 청크에서 끊긴다.
      await expect(new MealDataService(dyingAt(3), { photos: app.mealPhotos }).restore(userId, archive)).rejects.toThrow('process died');
      expect(await counts()).toEqual({ entries: 500, items: 500, recommendations: 1, events: 1, photos: 1, ledgers: 0 });
      const leftoverPhoto = await app.prisma.mealPhoto.findFirstOrThrow({ where: { userId } });

      // 다시 켜진 서버에 같은 아카이브를 보낸다 — 예전엔 남은 500건 옆에 1,200건이 더 생겼다(1,700건·추천 2건).
      const data = new MealDataService(app.prisma, { photos: app.mealPhotos });
      const retried = await data.restore(userId, archive);
      expect(retried).toMatchObject({ duplicate: false, restored: { entries: 1_200, items: 1_200, photos: 1, recommendations: 1, recommendationEvents: 1 } });
      expect(await counts()).toEqual({ entries: 1_200, items: 1_200, recommendations: 1, events: 1, photos: 1, ledgers: 1 });
      const photo = await app.prisma.mealPhoto.findFirstOrThrow({ where: { userId }, include: { entry: true } });
      // 사진은 아카이브에서 정해지는 같은 토큰으로 다시 저장돼 첫 기록에 붙고, 파일도 읽힌다.
      expect(photo.token).toBe(leftoverPhoto.token);
      expect(photo.entry?.eatenDate).toBe('2024-01-01');
      await expect(app.mealPhotos.read(userId, photo.token, 'full')).resolves.toBeTruthy();
      const rec = await app.prisma.mealRecommendation.findFirstOrThrow({ where: { userId } });
      const linkedId = (JSON.parse(rec.feedbackJson!) as { eatenEntryId: string }).eatenEntryId;
      expect(await app.prisma.mealEntry.count({ where: { userId, id: linkedId } })).toBe(1);
      // 같은 날짜·시각 기록의 id 동률 정렬은 아카이브 순서 그대로다.
      const firstDay = await app.prisma.mealEntry.findMany({ where: { userId, eatenDate: '2024-01-01' }, orderBy: [{ eatenAt: 'asc' }, { id: 'asc' }], include: { photos: true } });
      expect(firstDay.map((row) => row.photos.length)).toEqual([1, 0, 0]);

      // 끝난 복원은 원장이 막는다(멱등).
      expect(await data.restore(userId, archive)).toMatchObject({ duplicate: true, restored: { entries: 1_200 } });
      expect(await counts()).toEqual({ entries: 1_200, items: 1_200, recommendations: 1, events: 1, photos: 1, ledgers: 1 });
    });

    it('사진만 저장하고 끝난 복원의 잔여 사진도 재시도가 지운다 — 사용자가 올려 둔 다른 미연결 사진은 그대로', async () => {
      const userId = 'stream-i';
      const pendingJpeg = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#a31' } }).jpeg().toBuffer();
      const pending = await app.mealPhotos.store(userId, pendingJpeg);
      const archive = emptyArchive('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      archive.photos = [await jpegPhoto('photo-1', '#135'), await jpegPhoto('photo-2', '#579')];
      archive.entries = [archiveEntry('entry-1', '2026-02-01', ['photo-1']), archiveEntry('entry-2', '2026-02-02', ['photo-2'])];

      // 사진 두 장을 저장한 뒤 첫 쓰기 트랜잭션에서 끊긴다 — 기록 없이 미연결 사진만 남는다.
      await expect(new MealDataService(dyingAt(1), { photos: app.mealPhotos }).restore(userId, archive)).rejects.toThrow('process died');
      expect(await app.prisma.mealEntry.count({ where: { userId } })).toBe(0);
      const leftovers = await app.prisma.mealPhoto.findMany({ where: { userId, entryId: null, token: { not: pending.token } } });
      expect(leftovers).toHaveLength(2);

      const retried = await new MealDataService(app.prisma, { photos: app.mealPhotos }).restore(userId, archive);
      expect(retried).toMatchObject({ duplicate: false, restored: { entries: 2, photos: 2 } });
      const photos = await app.prisma.mealPhoto.findMany({ where: { userId } });
      expect(photos).toHaveLength(3);
      expect(photos.filter((p) => p.entryId !== null).map((p) => p.token).sort()).toEqual(leftovers.map((p) => p.token).sort());
      expect(photos.filter((p) => p.entryId === null).map((p) => p.token)).toEqual([pending.token]);
      await expect(app.mealPhotos.read(userId, pending.token, 'full')).resolves.toBeTruthy();
      for (const p of leftovers) await expect(app.mealPhotos.read(userId, p.token, 'full')).resolves.toBeTruthy();
    });

    it('복원 라우트는 본문을 읽기 전에 전역 자리를 잡는다 — 앞선 복원이 끝날 때까지 다음 요청은 입구에서 기다린다', async () => {
      const first = emptyArchive('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      first.photos = [await jpegPhoto('photo-1', '#246')];
      first.entries = [archiveEntry('entry-1', '2026-02-10', ['photo-1'])];
      const second = emptyArchive('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
      second.entries = [archiveEntry('entry-1', '2026-02-11')];
      const storeEntered = deferred();
      const releaseStore = deferred();
      const originalStore = app.mealPhotos.storeWhileMutationLocked.bind(app.mealPhotos);
      const store = vi
        .spyOn(app.mealPhotos, 'storeWhileMutationLocked')
        .mockImplementationOnce(async (targetUserId, buffer, opts) => {
          storeEntered.resolve();
          await releaseStore.promise;
          return originalStore(targetUserId, buffer, opts);
        });
      try {
        // 첫 복원이 사진 저장에서 멈춰 있는 동안(입구 자리를 쥔 채) 다른 사용자의 복원이 들어온다.
        const a = app.inject({ method: 'POST', url: RESTORE, headers: authOf('stream-j'), payload: first });
        await storeEntered.promise;
        expect(mealRestoreIntakeGate.active).toBe(1);
        const b = app.inject({ method: 'POST', url: RESTORE, headers: authOf('stream-k'), payload: second });
        for (let i = 0; i < 400 && mealRestoreIntakeGate.queued === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
        // 두 번째 요청은 본문 파싱 전 단계(preParsing)에서 기다린다.
        expect(mealRestoreIntakeGate.queued).toBe(1);
        expect(await app.prisma.mealEntry.count({ where: { userId: 'stream-k' } })).toBe(0);

        releaseStore.resolve();
        expect((await a).statusCode).toBe(200);
        expect((await b).statusCode).toBe(200);
        expect(mealRestoreIntakeGate.active).toBe(0);
        expect(mealRestoreIntakeGate.queued).toBe(0);
        expect(await app.prisma.mealEntry.count({ where: { userId: 'stream-k' } })).toBe(1);
      } finally {
        releaseStore.resolve();
        store.mockRestore();
      }
    });

    it('백업·복원은 전역 1건 — 자리가 없으면 busy, 스트림을 버리면 전역 자리와 사용자 장벽을 바로 푼다', async () => {
      const gate = new AsyncGate(1, { maxQueue: 0 });
      const data = new MealDataService(app.prisma, { photos: app.mealPhotos, archiveGate: gate });
      const stream = await data.backupStream('stream-b');
      // 스트림이 열려 있는 동안 전역 자리를 잡고 있다 — 대기열 0 이라 다른 복원은 바로 거절된다.
      expect(gate.active).toBe(1);
      const archive = emptyArchive('88888888-8888-4888-8888-888888888888');
      archive.entries = [archiveEntry('entry-1', '2026-03-01')];
      await expect(data.restore('stream-d', archive)).rejects.toMatchObject({ code: 'busy' });

      stream.destroy();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(gate.active).toBe(0);
      expect(mealMutationBarrier.pendingUserCount()).toBe(0);
      await expect(data.restore('stream-d', archive)).resolves.toMatchObject({ duplicate: false });
    });
  });
});
