import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type {
  ListMealEntriesResultType,
  MealCalendarResultType,
  MealEntryType,
  MealPreferenceType,
  RecognizedDishType,
  MealStatsResultType,
  UploadMealPhotoResultType,
} from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { upsertFoodSeeds } from '../food/food-import.service.js';
import { MealPhotoService } from './meal-photo.service.js';

// 식단 기록 라우트 — 격리 DB. ① 인증 ② 생성 시 카탈로그 매칭으로 분류 자동 채움 ③ 목록/커서
// ④ 달력 ⑤ 통계 ⑥ 사진 업로드·조회·소유 검증 ⑦ 수정(항목 전량 교체)·삭제 ⑧ 선호 설정.

const ENTRIES = '/api/v1/meals';
const PHOTOS = '/api/v1/meals/photos';

const recognizedDish = (
  overrides: Partial<RecognizedDishType> = {},
): RecognizedDishType => ({
  name: '김치찌개',
  candidates: [{ name: '김치찌개', confidence: 0.7 }],
  confidence: 0.7,
  isMain: true,
  portion: 'normal',
  isDrink: false,
  photoIndex: 0,
  foodId: null,
  matchedName: '김치찌개',
  dishType: 'stew',
  mainIngredient: 'pork',
  cuisine: 'korean',
  ...overrides,
});

const multipart = (buf: Buffer, filename = 'meal.jpg'): { payload: Buffer; headers: Record<string, string> } => {
  const boundary = '----lifepickrtest';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, buf, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
};

describe('meal routes (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let auth: { authorization: string };
  let otherAuth: { authorization: string };
  let jpeg: Buffer;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'meal-user', role: 'USER' },
      { id: 'meal-other', role: 'USER' },
    ]);
    auth = { authorization: `Bearer ${app.jwt.sign({ userId: 'meal-user', email: 'm@x.com', role: 'USER' })}` };
    otherAuth = { authorization: `Bearer ${app.jwt.sign({ userId: 'meal-other', email: 'o@x.com', role: 'USER' })}` };
    await upsertFoodSeeds(app.prisma, [
      { name: '김치찌개', dishType: 'stew', mainIngredient: 'pork', cuisine: 'korean', source: 'manual' },
    ]);
    jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 120, b: 60 } } })
      .jpeg()
      .toBuffer();
  });
  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  let entryId = '';

  it('인증 없으면 401', async () => {
    expect((await app.inject({ method: 'GET', url: ENTRIES })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: PHOTOS })).statusCode).toBe(401);
  });

  it('기록 생성 — 사용자가 분류를 안 보내면 카탈로그 매칭으로 채운다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: ENTRIES,
      headers: auth,
      payload: {
        eatenAt: '2026-08-20T03:10:00.000Z',
        eatenDate: '2026-08-20',
        slot: 'lunch',
        mealType: 'dining_out',
        placeId: '123',
        placeName: '숯토리',
        memo: '맛있었다',
        source: 'manual',
        items: [
          { name: '김치 찌개', isMain: true, source: 'manual' },
          { name: '공깃밥', isMain: false, source: 'manual', portion: 'normal' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const entry = res.json<MealEntryType>();
    entryId = entry.id;
    expect(entry.items).toHaveLength(2);
    // '김치 찌개' → normalizeTerm 으로 카탈로그 '김치찌개' 와 매칭.
    expect(entry.items[0]).toMatchObject({ name: '김치 찌개', dishType: 'stew', mainIngredient: 'pork', cuisine: 'korean' });
    expect(entry.items[0]?.foodId).not.toBeNull();
    // 매칭 안 되는 항목은 이름 규칙만 반영(분류 null 가능) — 실패가 아니다.
    expect(entry.items[1]?.name).toBe('공깃밥');
    expect(entry.placeName).toBe('숯토리');
  });

  it('사용자가 보낸 분류는 서버가 덮어쓰지 않는다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: ENTRIES,
      headers: auth,
      payload: {
        eatenAt: '2026-08-21T10:00:00.000Z',
        eatenDate: '2026-08-21',
        slot: 'dinner',
        source: 'photo',
        items: [{ name: '김치찌개', dishType: 'soup', mainIngredient: 'beef', cuisine: 'other', isMain: true, source: 'recognized', confidence: 0.7 }],
        recognition: { model: 'gemma4:31b', version: 1, dishes: [recognizedDish()] },
      },
    });
    expect(res.statusCode).toBe(201);
    const entry = res.json<MealEntryType>();
    expect(entry.items[0]).toMatchObject({ dishType: 'soup', mainIngredient: 'beef', cuisine: 'other', confidence: 0.7 });
    expect(entry.recognition).toMatchObject({ model: 'gemma4:31b', version: 1 });
  });

  it('불완전·범위 초과·임의 필드가 있는 인식 snapshot POST를 400으로 거절한다', async () => {
    const basePayload = {
      eatenAt: '2026-08-21T11:00:00.000Z',
      eatenDate: '2026-08-21',
      slot: 'dinner',
      source: 'photo',
      items: [{ name: '김치찌개', isMain: true, source: 'recognized' }],
    };
    const invalidSnapshots: unknown[] = [
      { model: 'vision', version: 2, dishes: [{ name: '김치찌개' }] },
      {
        model: 'vision',
        version: 2,
        dishes: [recognizedDish({ confidence: 1.1 })],
      },
      {
        model: 'vision',
        version: 2,
        dishes: [{ ...recognizedDish(), hiddenPrompt: '저장하지 마세요' }],
      },
      { model: 'vision', version: 2, dishes: Array.from({ length: 21 }, () => recognizedDish()) },
      { model: 'vision', version: 0, dishes: [recognizedDish()] },
    ];

    for (const recognition of invalidSnapshots) {
      const res = await app.inject({
        method: 'POST',
        url: ENTRIES,
        headers: auth,
        payload: { ...basePayload, recognition },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('구버전 recognitionJson 응답은 완전한 dish만 안전하게 남긴다', async () => {
    const id = 'meal-legacy-recognition';
    await app.prisma.mealEntry.create({
      data: {
        id,
        userId: 'meal-user',
        eatenAt: new Date('2026-08-18T03:00:00.000Z'),
        eatenDate: '2026-08-18',
        slot: 'lunch',
        recognitionJson: JSON.stringify({
          model: ' legacy-model ',
          version: 0,
          dishes: [
            recognizedDish({ name: '된장찌개', matchedName: '된장찌개' }),
            { name: '필드가 모자란 구버전' },
            { ...recognizedDish({ name: '비밀 항목' }), secret: true },
          ],
        }),
        items: {
          create: { name: '된장찌개', nameNorm: '된장찌개', isMain: true, source: 'recognized' },
        },
      },
    });

    const res = await app.inject({ method: 'GET', url: `${ENTRIES}/${id}`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json<MealEntryType>().recognition).toEqual({
      model: 'legacy-model',
      version: null,
      dishes: [recognizedDish({ name: '된장찌개', matchedName: '된장찌개' })],
    });
    await app.prisma.mealEntry.delete({ where: { id } });
  });

  it('수정으로 생성 출처를 바꿀 수 없다', async () => {
    const created = await app.inject({
      method: 'POST',
      url: ENTRIES,
      headers: auth,
      payload: {
        eatenAt: '2026-08-19T01:00:00.000Z',
        eatenDate: '2026-08-19',
        slot: 'breakfast',
        source: 'manual',
        items: [{ name: '출처 고정 테스트', isMain: true }],
      },
    });
    expect(created.statusCode).toBe(201);
    const immutableSourceEntryId = created.json<MealEntryType>().id;

    const res = await app.inject({
      method: 'PATCH',
      url: `${ENTRIES}/${immutableSourceEntryId}`,
      headers: auth,
      payload: { source: 'recommendation', memo: '출처는 그대로' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<MealEntryType>()).toMatchObject({ source: 'manual', memo: '출처는 그대로' });
    await app.prisma.mealEntry.delete({ where: { id: immutableSourceEntryId } });
  });

  it('목록은 최신순 + 커서, 남의 기록은 안 보인다', async () => {
    const list = await app.inject({ method: 'GET', url: `${ENTRIES}?limit=1`, headers: auth });
    const body = list.json<ListMealEntriesResultType>();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.eatenDate).toBe('2026-08-21');
    expect(body.nextCursor).not.toBeNull();

    const next = await app.inject({
      method: 'GET',
      url: `${ENTRIES}?limit=5&cursor=${encodeURIComponent(body.nextCursor!)}`,
      headers: auth,
    });
    expect(next.json<ListMealEntriesResultType>().items[0]?.eatenDate).toBe('2026-08-20');

    expect((await app.inject({ method: 'GET', url: ENTRIES, headers: otherAuth })).json<ListMealEntriesResultType>().items).toHaveLength(0);
    expect((await app.inject({ method: 'GET', url: `${ENTRIES}/${entryId}`, headers: otherAuth })).statusCode).toBe(404);
  });

  it('동일한 eatenAt 기록도 opaque 복합 커서로 빠짐없이 페이지네이션한다', async () => {
    const eatenAt = new Date('2026-08-19T03:00:00.000Z');
    for (const id of ['meal-cursor-a', 'meal-cursor-b', 'meal-cursor-c']) {
      await app.prisma.mealEntry.create({
        data: {
          id,
          userId: 'meal-user',
          eatenAt,
          eatenDate: '2026-08-19',
          slot: 'lunch',
          items: { create: { name: id, nameNorm: id, isMain: true, source: 'manual' } },
        },
      });
    }

    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const qs = new URLSearchParams({ from: '2026-08-19', to: '2026-08-19', limit: '1' });
      if (cursor) qs.set('cursor', cursor);
      const res = await app.inject({ method: 'GET', url: `${ENTRIES}?${qs}`, headers: auth });
      expect(res.statusCode).toBe(200);
      const body = res.json<ListMealEntriesResultType>();
      ids.push(...body.items.map((item) => item.id));
      cursor = body.nextCursor;
      if (cursor) expect(cursor).not.toContain(eatenAt.toISOString());
    } while (cursor);

    expect(ids).toEqual(['meal-cursor-c', 'meal-cursor-b', 'meal-cursor-a']);
    await app.prisma.mealEntry.deleteMany({
      where: { id: { in: ['meal-cursor-a', 'meal-cursor-b', 'meal-cursor-c'] } },
    });
  });

  it('날짜·끼니 필터', async () => {
    const filtered = await app.inject({ method: 'GET', url: `${ENTRIES}?from=2026-08-21&to=2026-08-21&slot=dinner`, headers: auth });
    expect(filtered.json<ListMealEntriesResultType>().items).toHaveLength(1);
    const none = await app.inject({ method: 'GET', url: `${ENTRIES}?from=2026-08-21&slot=lunch`, headers: auth });
    expect(none.json<ListMealEntriesResultType>().items).toHaveLength(0);
  });

  it('달력 — 날짜별 끼니 요약, 잘못된 월은 400', async () => {
    const res = await app.inject({ method: 'GET', url: `${ENTRIES}/calendar?month=2026-08`, headers: auth });
    expect(res.statusCode).toBe(200);
    const cal = res.json<MealCalendarResultType>();
    expect(cal.days.map((d) => d.date)).toEqual(['2026-08-20', '2026-08-21']);
    expect(cal.days[0]).toMatchObject({ count: 1, slots: ['lunch'], hasPhoto: false });
    expect((await app.inject({ method: 'GET', url: `${ENTRIES}/calendar?month=202608`, headers: auth })).statusCode).toBe(400);
  });

  it('통계 — 기간 역전은 400', async () => {
    const res = await app.inject({ method: 'GET', url: `${ENTRIES}/stats?from=2026-08-15&to=2026-08-22`, headers: auth });
    expect(res.statusCode).toBe(200);
    const stats = res.json<MealStatsResultType>();
    expect(stats.entryCount).toBe(2);
    expect(stats.byDishType.find((b) => b.key === 'stew')?.count).toBe(1);
    expect(stats.recommendation).toEqual({ chosenCount: 0, loggedCount: 0, ratedCount: 0, acceptanceRate: 0 });
    expect(stats.insights).toEqual([expect.objectContaining({ key: 'getting-started', tone: 'info' })]);
    expect((await app.inject({ method: 'GET', url: `${ENTRIES}/stats?from=2026-08-22&to=2026-08-15`, headers: auth })).statusCode).toBe(400);
  });

  it('추천 출처 기록 — 저장 성공 시에만 소유 추천·후보를 검증해 feedback 을 연결한다', async () => {
    const recommendation = await app.prisma.mealRecommendation.create({
      data: {
        userId: 'meal-user',
        targetDate: '2026-09-01',
        targetSlot: 'dinner',
        itemsJson: JSON.stringify([
          {
            name: '김치찌개',
            foodId: null,
            dishType: 'stew',
            mainIngredient: 'pork',
            cuisine: 'korean',
            reason: '테스트 추천',
            tags: [],
            score: 0.8,
            lastEatenDate: null,
            ingredients: [],
          },
        ]),
        summary: '추천',
        status: 'done',
      },
    });
    const payload = {
      eatenAt: '2026-09-01T10:00:00.000Z',
      eatenDate: '2026-09-01',
      slot: 'dinner',
      source: 'recommendation',
      originRecommendationId: recommendation.id,
      items: [{ name: '김치찌개', isMain: true, source: 'recommendation' }],
    };

    // 카드 선택만으로는 feedback 이 없다. 실제 기록 저장 뒤에만 연결된다.
    expect((await app.prisma.mealRecommendation.findUnique({ where: { id: recommendation.id } }))?.feedbackJson).toBeNull();
    const saved = await app.inject({ method: 'POST', url: ENTRIES, headers: auth, payload });
    expect(saved.statusCode).toBe(201);
    const entry = saved.json<MealEntryType>();
    expect(entry).toMatchObject({ source: 'recommendation', originRecommendationId: recommendation.id });
    expect(
      JSON.parse((await app.prisma.mealRecommendation.findUnique({ where: { id: recommendation.id } }))!.feedbackJson!),
    ).toMatchObject({ pickedName: '김치찌개', eatenEntryId: entry.id });

    expect(
      (await app.inject({ method: 'POST', url: ENTRIES, headers: otherAuth, payload })).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: ENTRIES,
          headers: auth,
          payload: { ...payload, originRecommendationId: undefined, source: 'recommendation' },
        })
      ).statusCode,
    ).toBe(400);

    // 기록을 지우면 추천의 실제 기록 연결만 풀려야 한다. 선택은 남고 같은 추천으로 다시
    // 기록할 수 있어야 JSON 연결이 삭제된 id를 영구히 가리키지 않는다.
    expect(
      (await app.inject({ method: 'DELETE', url: `${ENTRIES}/${entry.id}`, headers: auth })).statusCode,
    ).toBe(204);
    expect(
      JSON.parse((await app.prisma.mealRecommendation.findUnique({ where: { id: recommendation.id } }))!.feedbackJson!),
    ).toMatchObject({ pickedName: '김치찌개', eatenEntryId: null });
    const savedAgain = await app.inject({ method: 'POST', url: ENTRIES, headers: auth, payload });
    expect(savedAgain.statusCode).toBe(201);
    expect(
      (await app.inject({
        method: 'DELETE',
        url: `${ENTRIES}/${savedAgain.json<MealEntryType>().id}`,
        headers: auth,
      })).statusCode,
    ).toBe(204);
  });

  it('사진 업로드 → 원본·썸네일 조회, 남의 사진은 403', async () => {
    const { payload, headers } = multipart(jpeg);
    const up = await app.inject({ method: 'POST', url: PHOTOS, headers: { ...auth, ...headers }, payload });
    expect(up.statusCode).toBe(200);
    const photo = up.json<UploadMealPhotoResultType>();
    expect(photo.token).toMatch(/^[a-f0-9-]{36}$/);
    expect(photo.byteSize).toBeGreaterThan(0);
    expect(photo.width).toBe(40);

    const full = await app.inject({ method: 'GET', url: photo.previewUrl, headers: auth });
    expect(full.statusCode).toBe(200);
    expect(full.headers['content-type']).toBe('image/jpeg');
    expect(full.headers['cache-control']).toContain('private');
    const thumb = await app.inject({ method: 'GET', url: photo.thumbUrl, headers: auth });
    expect(thumb.statusCode).toBe(200);
    expect(thumb.rawPayload.byteLength).toBeLessThanOrEqual(full.rawPayload.byteLength);

    expect((await app.inject({ method: 'GET', url: photo.previewUrl, headers: otherAuth })).statusCode).toBe(403);
    // 이미지가 아니면 400.
    const bad = multipart(Buffer.from('not an image'), 'x.jpg');
    expect(
      (await app.inject({ method: 'POST', url: PHOTOS, headers: { ...auth, ...bad.headers }, payload: bad.payload })).statusCode,
    ).toBe(400);
  });

  it('사진을 기록에 붙이고 수정(항목 전량 교체) → 삭제하면 사진 행도 사라진다', async () => {
    const { payload, headers } = multipart(jpeg);
    const up = await app.inject({ method: 'POST', url: PHOTOS, headers: { ...auth, ...headers }, payload });
    const token = up.json<UploadMealPhotoResultType>().token;

    const patched = await app.inject({
      method: 'PATCH',
      url: `${ENTRIES}/${entryId}`,
      headers: auth,
      payload: {
        memo: '수정함',
        items: [{ name: '순두부찌개', isMain: true, source: 'manual' }],
        photoTokens: [token],
      },
    });
    expect(patched.statusCode).toBe(200);
    const entry = patched.json<MealEntryType>();
    expect(entry.memo).toBe('수정함');
    expect(entry.items).toHaveLength(1);
    expect(entry.photos).toHaveLength(1);
    expect(entry.photos[0]?.token).toBe(token);

    // 남의 기록 수정 404.
    expect(
      (await app.inject({ method: 'PATCH', url: `${ENTRIES}/${entryId}`, headers: otherAuth, payload: { memo: 'x' } })).statusCode,
    ).toBe(404);

    const del = await app.inject({ method: 'DELETE', url: `${ENTRIES}/${entryId}`, headers: auth });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `${ENTRIES}/${entryId}`, headers: auth })).statusCode).toBe(404);
    expect(await app.prisma.mealPhoto.findUnique({ where: { token } })).toBeNull();
  });

  it('사진 토큰을 먼저 검증해 생성/수정 실패가 기록 일부를 남기지 않는다', async () => {
    const missingToken = '00000000-0000-4000-8000-000000000099';
    const beforeCount = await app.prisma.mealEntry.count({ where: { userId: 'meal-user' } });
    const create = await app.inject({
      method: 'POST',
      url: ENTRIES,
      headers: auth,
      payload: {
        eatenAt: '2026-08-18T03:00:00.000Z',
        eatenDate: '2026-08-18',
        slot: 'lunch',
        items: [{ name: '생성되면안됨', isMain: true }],
        photoTokens: [missingToken],
      },
    });
    expect(create.statusCode).toBe(404);
    expect(await app.prisma.mealEntry.count({ where: { userId: 'meal-user' } })).toBe(beforeCount);

    const original = await app.prisma.mealEntry.create({
      data: {
        userId: 'meal-user',
        eatenAt: new Date('2026-08-18T04:00:00.000Z'),
        eatenDate: '2026-08-18',
        slot: 'lunch',
        memo: '원본',
        items: { create: { name: '원본음식', nameNorm: '원본음식', isMain: true, source: 'manual' } },
      },
    });
    const update = await app.inject({
      method: 'PATCH',
      url: `${ENTRIES}/${original.id}`,
      headers: auth,
      payload: {
        memo: '바뀌면안됨',
        items: [{ name: '바뀌면안됨', isMain: true }],
        photoTokens: [missingToken],
      },
    });
    expect(update.statusCode).toBe(404);
    const unchanged = await app.inject({ method: 'GET', url: `${ENTRIES}/${original.id}`, headers: auth });
    expect(unchanged.json<MealEntryType>()).toMatchObject({ memo: '원본', items: [{ name: '원본음식' }] });
  });

  it('사진 연결 단계 실패 시 항목·메모 변경을 함께 롤백한다', async () => {
    const up = await app.inject({
      method: 'POST',
      url: PHOTOS,
      headers: { ...auth, ...multipart(jpeg).headers },
      payload: multipart(jpeg).payload,
    });
    const token = up.json<UploadMealPhotoResultType>().token;
    const original = await app.prisma.mealEntry.create({
      data: {
        userId: 'meal-user',
        eatenAt: new Date('2026-08-18T05:00:00.000Z'),
        eatenDate: '2026-08-18',
        slot: 'lunch',
        memo: '트랜잭션 전',
        items: { create: { name: '원래항목', nameNorm: '원래항목', isMain: true, source: 'manual' } },
      },
    });
    const attach = vi.spyOn(app.mealPhotos, 'attachToEntry').mockRejectedValueOnce(new Error('forced attach failure'));
    const res = await app.inject({
      method: 'PATCH',
      url: `${ENTRIES}/${original.id}`,
      headers: auth,
      payload: {
        memo: '커밋되면안됨',
        items: [{ name: '새항목', isMain: true }],
        photoTokens: [token],
      },
    });
    attach.mockRestore();
    expect(res.statusCode).toBe(500);
    const unchanged = await app.inject({ method: 'GET', url: `${ENTRIES}/${original.id}`, headers: auth });
    expect(unchanged.json<MealEntryType>()).toMatchObject({ memo: '트랜잭션 전', items: [{ name: '원래항목' }] });
    expect(await app.prisma.mealPhoto.findUnique({ where: { token } })).toMatchObject({ entryId: null });
  });

  it('선호 설정 — 행이 없어도 기본값, PUT 은 부분 병합', async () => {
    const initial = await app.inject({ method: 'GET', url: `${ENTRIES}/preference`, headers: auth });
    expect(initial.statusCode).toBe(200);
    const pref = initial.json<MealPreferenceType>();
    expect(pref.onboarded).toBe(false);
    expect(pref.weights).toMatchObject({ variety: 4, taste: 4, balance: 3 });
    expect(pref.dislikedFoods).toEqual([]);
    expect(pref.slots).toEqual(['breakfast', 'lunch', 'dinner']);

    const saved = await app.inject({
      method: 'PUT',
      url: `${ENTRIES}/preference`,
      headers: auth,
      payload: {
        weights: { variety: 5, taste: 2, balance: 5, health: 4, novelty: 1, weather: 0, convenience: 3 },
        excludedFoods: ['오이'],
        dislikedFoods: ['고수', '오 이'],
        likedFoods: ['고 수', '비빔밥'],
        onboarded: true,
      },
    });
    expect(saved.json<MealPreferenceType>()).toMatchObject({
      excludedFoods: ['오이'],
      dislikedFoods: ['고수'],
      likedFoods: ['비빔밥'],
      onboarded: true,
    });

    const merged = await app.inject({ method: 'PUT', url: `${ENTRIES}/preference`, headers: auth, payload: { slots: ['lunch', 'dinner'] } });
    const body = merged.json<MealPreferenceType>();
    expect(body.slots).toEqual(['lunch', 'dinner']);
    // 앞서 저장한 값은 유지된다.
    expect(body.excludedFoods).toEqual(['오이']);
    expect(body.dislikedFoods).toEqual(['고수']);
    expect(body.likedFoods).toEqual(['비빔밥']);
    expect(body.weights.variety).toBe(5);
  });

  it('지난번 기록 조회 — 양·분류·그때 사진을 돌려준다', async () => {
    const up = await app.inject({
      method: 'POST',
      url: PHOTOS,
      headers: { ...auth, ...multipart(jpeg).headers },
      payload: multipart(jpeg).payload,
    });
    const photo = up.json<UploadMealPhotoResultType>();

    await app.inject({
      method: 'POST',
      url: ENTRIES,
      headers: auth,
      payload: {
        eatenAt: '2026-08-10T12:00:00.000Z',
        eatenDate: '2026-08-10',
        slot: 'lunch',
        items: [{ name: '지난번확인찌개', portion: 'large', isMain: true }],
        photoTokens: [photo.token],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/meals/items/recent?name=지난번 확인찌개',
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ found: boolean; portion: string | null; photoToken: string | null }>();
    // 이름은 정규화해서 찾는다('지난번 확인찌개' → '지난번확인찌개').
    expect(body.found).toBe(true);
    expect(body.portion).toBe('large');
    expect(body.photoToken).toBe(photo.token);
  });

  it('먹은 적 없는 음식은 found=false — 화면이 아무것도 안 그린다', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/meals/items/recent?name=한번도안먹은것',
      headers: auth,
    });
    expect(res.json<{ found: boolean; photoToken: string | null }>()).toMatchObject({ found: false, photoToken: null });
  });

  it('남의 기록은 안 보인다', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/meals/items/recent?name=지난번확인찌개',
      headers: otherAuth,
    });
    expect(res.json<{ found: boolean }>().found).toBe(false);
  });

  it('사진 복제 — 새 토큰이 나오고 원본을 지워도 살아 있다', async () => {
    const up = await app.inject({
      method: 'POST',
      url: PHOTOS,
      headers: { ...auth, ...multipart(jpeg).headers },
      payload: multipart(jpeg).payload,
    });
    const src = up.json<UploadMealPhotoResultType>();

    const copied = await app.inject({ method: 'POST', url: `${PHOTOS}/${src.token}/copy`, headers: auth });
    expect(copied.statusCode).toBe(201);
    const dst = copied.json<UploadMealPhotoResultType>();
    expect(dst.token).not.toBe(src.token);

    await app.inject({ method: 'DELETE', url: `${PHOTOS}/${src.token}`, headers: auth });
    const read = await app.inject({ method: 'GET', url: `${PHOTOS}/${dst.token}`, headers: auth });
    expect(read.statusCode).toBe(200);
  });

  it('남의 사진은 복제할 수 없다', async () => {
    const up = await app.inject({
      method: 'POST',
      url: PHOTOS,
      headers: { ...auth, ...multipart(jpeg).headers },
      payload: multipart(jpeg).payload,
    });
    const src = up.json<UploadMealPhotoResultType>();
    const res = await app.inject({ method: 'POST', url: `${PHOTOS}/${src.token}/copy`, headers: otherAuth });
    expect(res.statusCode).toBe(403);
  });

  it('store/copy 가 사용자 사진 상한을 공유하고 동시 저장도 상한을 넘지 않는다', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'lifepickr-meal-photo-quota-'));
    const limited = new MealPhotoService(app.prisma, { storageDir, maxPhotosPerUser: 1 });
    try {
      const writes = await Promise.allSettled([
        limited.store('meal-other', jpeg),
        limited.store('meal-other', jpeg),
      ]);
      const fulfilled = writes.filter(
        (result): result is PromiseFulfilledResult<UploadMealPhotoResultType> => result.status === 'fulfilled',
      );
      const rejected = writes.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({ reason: { code: 'quota' } });
      expect(await app.prisma.mealPhoto.count({ where: { userId: 'meal-other' } })).toBe(1);

      await expect(limited.copy('meal-other', fulfilled[0]!.value.token)).rejects.toMatchObject({ code: 'quota' });
      expect(await app.prisma.mealPhoto.count({ where: { userId: 'meal-other' } })).toBe(1);
      await limited.remove('meal-other', fulfilled[0]!.value.token);
    } finally {
      await rm(storageDir, { recursive: true, force: true });
    }
  });

  it('DB 행 생성 전에 종료돼 남은 오래된 사진 파일을 정리한다', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'lifepickr-meal-photo-untracked-'));
    const service = new MealPhotoService(app.prisma, { storageDir });
    const userDir = join(storageDir, 'meal-user');
    const token = '11111111-2222-4333-8444-555555555555';
    const fullPath = join(userDir, `${token}.jpg`);
    const thumbPath = join(userDir, `${token}_t.jpg`);
    try {
      await mkdir(userDir, { recursive: true });
      await writeFile(fullPath, jpeg);
      await writeFile(thumbPath, jpeg);
      const old = new Date(Date.now() - 25 * 3_600_000);
      await utimes(fullPath, old, old);
      await utimes(thumbPath, old, old);

      expect(await service.sweepUntrackedFiles(24)).toBe(1);
      expect(await readdir(userDir)).toEqual([]);
    } finally {
      await rm(storageDir, { recursive: true, force: true });
    }
  });

  it('시간 프리셋 — 기록이 적은 끼니는 일반 기본값을 준다', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/meals/time-presets', headers: otherAuth });
    expect(res.statusCode).toBe(200);
    const { presets } = res.json<{ presets: { slot: string; time: string; fromRecords: boolean }[] }>();
    const breakfast = presets.find((p) => p.slot === 'breakfast');
    expect(breakfast).toMatchObject({ time: '08:00', fromRecords: false });
  });

  it('시간 프리셋 — 기록이 쌓이면 내 중앙값을 준다', async () => {
    // 조회 창(최근 90일) 안에 들어가도록 **오늘 기준 상대 날짜**로 넣는다. 고정 날짜로 두면
    // 시간이 지나 창 밖으로 밀려나면서 테스트가 저절로 깨진다.
    const kstEntry = async (daysAgo: number, hh: number, mm: number): Promise<void> => {
      const base = new Date(Date.now() - daysAgo * 86_400_000);
      const utc = new Date(
        Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hh, mm) - 9 * 3_600_000,
      );
      await app.inject({
        method: 'POST',
        url: ENTRIES,
        headers: auth,
        payload: {
          eatenAt: utc.toISOString(),
          eatenDate: utc.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }),
          slot: 'breakfast',
          items: [{ name: '토스트', isMain: true }],
        },
      });
    };
    // 아침 3건: 07:40 / 08:20 / 09:00(KST) → 중앙값 08:20.
    await kstEntry(3, 7, 40);
    await kstEntry(2, 8, 20);
    await kstEntry(1, 9, 0);

    const res = await app.inject({ method: 'GET', url: '/api/v1/meals/time-presets', headers: auth });
    const { presets } = res.json<{ presets: { slot: string; time: string; fromRecords: boolean; sampleCount: number }[] }>();
    expect(presets.find((p) => p.slot === 'breakfast')).toMatchObject({
      time: '08:20',
      fromRecords: true,
      sampleCount: 3,
    });
  });
});
