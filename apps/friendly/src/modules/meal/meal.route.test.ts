import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type {
  ListMealEntriesResultType,
  MealCalendarResultType,
  MealEntryType,
  MealPreferenceType,
  MealStatsResultType,
  UploadMealPhotoResultType,
} from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { upsertFoodSeeds } from '../food/food-import.service.js';

// 식단 기록 라우트 — 격리 DB. ① 인증 ② 생성 시 카탈로그 매칭으로 분류 자동 채움 ③ 목록/커서
// ④ 달력 ⑤ 통계 ⑥ 사진 업로드·조회·소유 검증 ⑦ 수정(항목 전량 교체)·삭제 ⑧ 선호 설정.

const ENTRIES = '/api/v1/meals';
const PHOTOS = '/api/v1/meals/photos';

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
        recognition: { model: 'gemma4:31b', version: 1, dishes: [{ name: '김치찌개' }] },
      },
    });
    expect(res.statusCode).toBe(201);
    const entry = res.json<MealEntryType>();
    expect(entry.items[0]).toMatchObject({ dishType: 'soup', mainIngredient: 'beef', cuisine: 'other', confidence: 0.7 });
    expect(entry.recognition).toMatchObject({ model: 'gemma4:31b', version: 1 });
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
    expect((await app.inject({ method: 'GET', url: `${ENTRIES}/stats?from=2026-08-22&to=2026-08-15`, headers: auth })).statusCode).toBe(400);
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

  it('선호 설정 — 행이 없어도 기본값, PUT 은 부분 병합', async () => {
    const initial = await app.inject({ method: 'GET', url: `${ENTRIES}/preference`, headers: auth });
    expect(initial.statusCode).toBe(200);
    const pref = initial.json<MealPreferenceType>();
    expect(pref.onboarded).toBe(false);
    expect(pref.weights).toMatchObject({ variety: 4, taste: 4, balance: 3 });
    expect(pref.slots).toEqual(['breakfast', 'lunch', 'dinner']);

    const saved = await app.inject({
      method: 'PUT',
      url: `${ENTRIES}/preference`,
      headers: auth,
      payload: { weights: { variety: 5, taste: 2, balance: 5, health: 4, novelty: 1, weather: 0, convenience: 3 }, excludedFoods: ['오이'], onboarded: true },
    });
    expect(saved.json<MealPreferenceType>()).toMatchObject({ excludedFoods: ['오이'], onboarded: true });

    const merged = await app.inject({ method: 'PUT', url: `${ENTRIES}/preference`, headers: auth, payload: { slots: ['lunch', 'dinner'] } });
    const body = merged.json<MealPreferenceType>();
    expect(body.slots).toEqual(['lunch', 'dinner']);
    // 앞서 저장한 값은 유지된다.
    expect(body.excludedFoods).toEqual(['오이']);
    expect(body.weights.variety).toBe(5);
  });
});
