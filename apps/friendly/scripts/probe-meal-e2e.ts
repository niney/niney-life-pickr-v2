// 식단 전 구간 실동작 확인 — 업로드 → 실제 비전 인식 → 계보 저장 → 통계 → 추천 이벤트
// → 추천 기반 기록 → 사진 포함 백업/전체 삭제/복원 → 보존 정책까지 app.inject()로 태운다.
//
// 반드시 운영 DB가 아닌 사본을 쓴다.
//   cp apps/friendly/data/prod.db /tmp/lifepickr-meal-e2e.db
//   DATABASE_URL="file:/tmp/lifepickr-meal-e2e.db" \
//     pnpm --filter friendly probe:meal-e2e -- data/open/eval/meal-photos
// prod.db는 무조건 거부하고, dev.db도 --allow-shared-db 없이는 거부한다. 실제 비전/추천 모델을
// 호출하므로 AI 일일 한도를 소비한다. 합성 사용자 데이터와 사진 파일은 finally에서 정리한다.

import { readdir, readFile, rm } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import {
  MEAL_DATA_DELETE_CONFIRMATION,
  MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION,
  type MealDataBackupType,
  type MealEntryType,
  type MealRecommendationType,
  type RecognizeMealResultType,
  type RestoreMealDataResultType,
  type UploadMealPhotoResultType,
} from '@repo/api-contract';
import { buildApp } from '../src/app.js';

const args = process.argv.slice(2);
const DIR = args.find((arg) => !arg.startsWith('--'));
const ALLOW_SHARED_DB = args.includes('--allow-shared-db');
const USER_ID = 'e2e-meal-user';
const USER_EMAIL = 'e2e@meal.local';
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);

const assertSafeDatabase = (): void => {
  const url = process.env.DATABASE_URL?.trim() ?? '';
  if (!url.startsWith('file:')) {
    throw new Error('DATABASE_URL을 SQLite 사본(file:/...)으로 명시해 주세요.');
  }
  const normalized = url.split('?')[0]!.toLowerCase();
  if (normalized.endsWith('/prod.db') || normalized.endsWith(':prod.db')) {
    throw new Error('probe:meal-e2e는 prod.db에서 실행할 수 없습니다. /tmp 사본을 사용하세요.');
  }
  if (!ALLOW_SHARED_DB && (normalized.endsWith('/dev.db') || normalized.endsWith(':dev.db'))) {
    throw new Error('공유 dev.db 대신 /tmp 사본을 사용하세요(--allow-shared-db로 명시 해제 가능).');
  }
};

const expectStatus = (
  response: { statusCode: number; body: string },
  expected: number,
  label: string,
): void => {
  if (response.statusCode !== expected) {
    throw new Error(`${label}: HTTP ${response.statusCode} — ${response.body.slice(0, 500)}`);
  }
};

const contentType = (file: string): string => {
  const ext = extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.heic') return 'image/heic';
  return 'image/jpeg';
};

const main = async (): Promise<void> => {
  if (!DIR)
    throw new Error('사진 폴더를 인자로 주세요. 예: probe:meal-e2e -- data/open/eval/meal-photos');
  assertSafeDatabase();

  const photoDir = resolve(DIR);
  const files = (await readdir(photoDir))
    .filter((file) => IMAGE_EXT.has(extname(file).toLowerCase()))
    .sort();
  const targets = files.slice(0, 2);
  if (targets.length === 0) throw new Error(`사진이 없습니다: ${photoDir}`);

  const app = await buildApp({ logger: false });
  await app.ready();
  const auth = {
    authorization: `Bearer ${app.jwt.sign({ userId: USER_ID, email: USER_EMAIL, role: 'USER' })}`,
  };

  try {
    await app.prisma.user.upsert({
      where: { id: USER_ID },
      update: {},
      create: { id: USER_ID, email: USER_EMAIL, passwordHash: 'e2e-only', role: 'USER' },
    });
    // 사본에 이전 중단 실행이 있더라도 같은 합성 사용자만 먼저 비운다.
    await app.inject({
      method: 'DELETE',
      url: '/api/v1/meals/data',
      headers: auth,
      payload: { confirmation: MEAL_DATA_DELETE_CONFIRMATION },
    });

    console.log(`사진 ${targets.length}장: ${targets.join(', ')}\n`);

    const tokens: string[] = [];
    for (const file of targets) {
      const bytes = await readFile(join(photoDir, file));
      const boundary = `----meal-e2e-${Date.now()}`;
      const head = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file}"\r\nContent-Type: ${contentType(file)}\r\n\r\n`,
      );
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/meals/photos',
        headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload: Buffer.concat([head, bytes, tail]),
      });
      expectStatus(response, 200, `업로드 ${file}`);
      const uploaded = response.json<UploadMealPhotoResultType>();
      tokens.push(uploaded.token);
      console.log(
        `① 업로드 ${file} → ${Math.round(uploaded.byteSize / 1024)}KB · ${uploaded.width ?? '?'}×${uploaded.height ?? '?'}`,
      );
    }

    const recognitionStarted = Date.now();
    const recognitionResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/meals/recognize',
      headers: auth,
      payload: { photoTokens: tokens, slot: 'dinner' },
    });
    expectStatus(recognitionResponse, 200, '사진 인식');
    const recognized = recognitionResponse.json<RecognizeMealResultType>();
    console.log(
      `\n② 인식 → ${Date.now() - recognitionStarted}ms · ${recognized.model} / prompt v${recognized.promptVersion} · ${recognized.dishes.length}개`,
    );
    for (const dish of recognized.dishes) {
      console.log(
        `   - ${dish.name}${dish.isMain ? '' : '(반찬)'} conf ${dish.confidence} · ${dish.matchedName ?? '미매칭'} · ${dish.catalogMatchedBy ?? 'none'} ${dish.catalogMatchScore ?? '-'}`,
      );
    }

    const now = new Date();
    const oldMealAt = new Date(now);
    oldMealAt.setUTCDate(oldMealAt.getUTCDate() - 45);
    const oldMealDate = oldMealAt.toISOString().slice(0, 10);
    const saveResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/meals',
      headers: auth,
      payload: {
        eatenAt: oldMealAt.toISOString(),
        eatenDate: oldMealDate,
        slot: 'dinner',
        mealType: 'home',
        source: 'photo',
        items: recognized.dishes.map((dish) => ({
          name: dish.matchedName ?? dish.name,
          foodId: dish.foodId,
          dishType: dish.dishType,
          mainIngredient: dish.mainIngredient,
          cuisine: dish.cuisine,
          portion: dish.portion,
          servings: null,
          portionSource: dish.portion ? 'vision_ordinal' : null,
          isMain: dish.isMain,
          confidence: dish.confidence,
          recognitionDishId: dish.recognitionDishId ?? null,
          selectedCandidateRank: dish.selectedCandidateRank ?? null,
          catalogMatchedBy: dish.catalogMatchedBy ?? (dish.foodId ? 'food_id' : 'none'),
          catalogMatchScore: dish.catalogMatchScore ?? null,
          source: 'recognized',
        })),
        photoTokens: tokens,
        recognition: {
          model: recognized.model,
          version: recognized.promptVersion,
          dishes: recognized.dishes,
        },
      },
    });
    expectStatus(saveResponse, 201, '인식 식단 저장');
    const entry = saveResponse.json<MealEntryType>();
    console.log(
      `\n③ 계보 저장 → ${entry.id.slice(0, 8)}… · 항목 ${entry.items.length} · 사진 ${entry.photos.length} · ${entry.items.map((item) => item.catalogMatchedBy ?? 'none').join('/')}`,
    );

    const statsResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/meals/stats?from=${oldMealDate}&to=${oldMealDate}`,
      headers: auth,
    });
    expectStatus(statsResponse, 200, '식단 통계');
    const stats = statsResponse.json<{ entryCount: number; itemCount: number }>();
    console.log(`④ 통계 → ${stats.entryCount}끼 / ${stats.itemCount}항목`);

    const recommendationResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/meals/recommendations',
      headers: auth,
      payload: {
        targetDate: now.toISOString().slice(0, 10),
        targetSlot: 'lunch',
        mealType: 'dining_out',
        force: true,
      },
    });
    expectStatus(recommendationResponse, 200, '식단 추천');
    const recommendation = recommendationResponse.json<MealRecommendationType>();
    const candidate = recommendation.items[0];
    if (!candidate) throw new Error('추천 후보가 비었습니다.');
    console.log(
      `\n⑤ 추천 → ${recommendation.status} · ${recommendation.model ?? 'fallback'} · ${candidate.name}`,
    );

    const events = [
      { kind: 'shown', platform: 'server' },
      {
        kind: 'candidate_picked',
        candidateName: candidate.name,
        candidateFoodId: candidate.foodId,
        candidateRank: 0,
        platform: 'server',
      },
      {
        kind: 'candidate_rated',
        candidateName: candidate.name,
        candidateFoodId: candidate.foodId,
        candidateRank: 0,
        rating: 1,
        platform: 'server',
      },
    ] as const;
    for (const event of events) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/meals/recommendations/${recommendation.id}/events`,
        headers: auth,
        payload: event,
      });
      expectStatus(response, 200, `추천 이벤트 ${event.kind}`);
    }

    const recommendationMealResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/meals',
      headers: auth,
      payload: {
        eatenAt: now.toISOString(),
        eatenDate: now.toISOString().slice(0, 10),
        slot: 'lunch',
        mealType: 'dining_out',
        source: 'recommendation',
        originRecommendationId: recommendation.id,
        items: [
          {
            name: candidate.name,
            foodId: candidate.foodId,
            dishType: candidate.dishType,
            mainIngredient: candidate.mainIngredient,
            cuisine: candidate.cuisine,
            source: 'recommendation',
            isMain: true,
          },
        ],
        photoTokens: [],
      },
    });
    expectStatus(recommendationMealResponse, 201, '추천 기반 식단 저장');
    const ledgerKinds = (
      await app.prisma.mealRecommendationEvent.findMany({
        where: { recommendationId: recommendation.id },
        orderBy: { createdAt: 'asc' },
        select: { kind: true },
      })
    ).map((event) => event.kind);
    for (const expected of ['shown', 'candidate_picked', 'candidate_rated', 'logged']) {
      if (!ledgerKinds.includes(expected))
        throw new Error(`추천 원장에 ${expected} 이벤트가 없습니다.`);
    }
    console.log(`⑥ 추천 원장 → ${ledgerKinds.join(' → ')}`);

    const backupResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/meals/data/backup',
      headers: auth,
    });
    expectStatus(backupResponse, 200, '식단 백업');
    const backup = backupResponse.json<MealDataBackupType>();
    console.log(
      `\n⑦ 백업 → 식단 ${backup.entries.length} · 사진 ${backup.photos.length} · 추천 ${backup.recommendations.length}`,
    );

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/api/v1/meals/data',
      headers: auth,
      payload: { confirmation: MEAL_DATA_DELETE_CONFIRMATION },
    });
    expectStatus(deleteResponse, 200, '백업 전량 삭제');
    const restoreResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/meals/data/backup/restore',
      headers: auth,
      payload: backup,
    });
    expectStatus(restoreResponse, 200, '백업 복원');
    const restored = restoreResponse.json<RestoreMealDataResultType>();
    if (restored.duplicate) throw new Error('첫 복원이 중복으로 판정됐습니다.');
    const duplicateRestore = await app.inject({
      method: 'POST',
      url: '/api/v1/meals/data/backup/restore',
      headers: auth,
      payload: backup,
    });
    expectStatus(duplicateRestore, 200, '백업 중복 복원');
    if (!duplicateRestore.json<RestoreMealDataResultType>().duplicate) {
      throw new Error('같은 archiveId의 두 번째 복원이 중복으로 판정되지 않았습니다.');
    }
    console.log(
      `⑧ 복원 → 식단 ${restored.restored.entries} · 사진 ${restored.restored.photos} · 이벤트 ${restored.restored.recommendationEvents} · 재복원 멱등`,
    );

    const before = now.toISOString().slice(0, 10);
    const retentionPreview = await app.inject({
      method: 'GET',
      url: `/api/v1/meals/data/photos/retention?before=${before}`,
      headers: auth,
    });
    expectStatus(retentionPreview, 200, '사진 보존 미리보기');
    const preview = retentionPreview.json<{ entries: number; totalPhotos: number }>();
    if (preview.totalPhotos !== tokens.length) {
      throw new Error(`사진 보존 대상 ${preview.totalPhotos}개, 예상 ${tokens.length}개`);
    }
    const retentionDelete = await app.inject({
      method: 'DELETE',
      url: '/api/v1/meals/data/photos/retention',
      headers: auth,
      payload: { before, confirmation: MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION },
    });
    expectStatus(retentionDelete, 200, '오래된 사진 정리');
    const retention = retentionDelete.json<{
      deleted: { totalPhotos: number; pendingFileSets: number };
    }>();
    const retainedEntry = await app.prisma.mealEntry.findFirst({
      where: { userId: USER_ID, eatenDate: oldMealDate },
      include: { photos: true },
    });
    if (
      !retainedEntry ||
      retainedEntry.photos.length !== 0 ||
      retainedEntry.photoPurgedAt === null
    ) {
      throw new Error('사진 보존 정책이 텍스트 기록을 남기고 사진만 정리하지 못했습니다.');
    }
    console.log(
      `⑨ 사진 보존 → ${retention.deleted.totalPhotos}개 정리 · pending ${retention.deleted.pendingFileSets} · 텍스트 기록 유지`,
    );

    console.log('\nE2E 검증 완료');
  } finally {
    try {
      await app.inject({
        method: 'DELETE',
        url: '/api/v1/meals/data',
        headers: auth,
        payload: { confirmation: MEAL_DATA_DELETE_CONFIRMATION },
      });
      await app.prisma.user.deleteMany({ where: { id: USER_ID, email: USER_EMAIL } });
    } finally {
      await app.close();
      // DB 트랜잭션/삭제 outbox가 실패해도 이 스크립트가 만든 합성 사용자 경로만 정리한다.
      await rm(join(process.cwd(), 'data', 'meal-photos', USER_ID), {
        recursive: true,
        force: true,
      });
    }
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
