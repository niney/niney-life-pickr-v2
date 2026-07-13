import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { RESTAURANT_FAVORITES_MAX } from '@repo/api-contract';
import sensiblePlugin from '../../plugins/sensible.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import restaurantFavoriteRoutes from './restaurant-favorite.route.js';

const buildTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.register(restaurantFavoriteRoutes);
  await app.ready();
  return app;
};

const tokenFor = (app: FastifyInstance, userId: string): string =>
  app.jwt.sign({ userId, email: `${userId}@x.com`, role: 'USER' });
const auth = (app: FastifyInstance, userId: string): { Authorization: string } => ({
  Authorization: `Bearer ${tokenFor(app, userId)}`,
});

// PUT body — path 의 placeId 를 제외한 스냅샷 필드.
interface FavoriteBody {
  name: string;
  category: string | null;
  address: string | null;
  thumbnailUrl: string | null;
  latitude: number | null;
  longitude: number | null;
}
const favoriteBody = (over: Partial<FavoriteBody> = {}): FavoriteBody => ({
  name: '김밥천국',
  category: '분식',
  address: '서울 강남구 테헤란로 1',
  thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
  latitude: 37.4979,
  longitude: 127.0276,
  ...over,
});

interface FavoritesBody {
  items: Array<{ placeId: string } & FavoriteBody>;
}

const favoriteUrl = (placeId: string): string => `/api/v1/restaurants/favorites/${placeId}`;
const FAVORITES_URL = '/api/v1/restaurants/favorites';
const SYNC_URL = '/api/v1/restaurants/favorites/sync';

describe('restaurant favorite routes', () => {
  let app: FastifyInstance;
  const ownerId = 'restfav-test-owner';
  const otherId = 'restfav-test-other';

  const clearFavorites = async (): Promise<void> => {
    await app.prisma.restaurantFavorite.deleteMany({
      where: { userId: { in: [ownerId, otherId] } },
    });
  };

  beforeAll(async () => {
    app = await buildTestApp();
    await app.prisma.user.upsert({
      where: { email: `${ownerId}@x.com` },
      update: {},
      create: { id: ownerId, email: `${ownerId}@x.com`, passwordHash: 'x' },
    });
    await app.prisma.user.upsert({
      where: { email: `${otherId}@x.com` },
      update: {},
      create: { id: otherId, email: `${otherId}@x.com`, passwordHash: 'x' },
    });
  });

  beforeEach(clearFavorites);

  afterAll(async () => {
    await clearFavorites();
    await app.prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await app.close();
  });

  describe('인증', () => {
    it('GET 미인증 → 401', async () => {
      expect((await app.inject({ method: 'GET', url: FAVORITES_URL })).statusCode).toBe(401);
    });
    it('PUT 미인증 → 401', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: favoriteUrl('100000001'),
        payload: favoriteBody(),
      });
      expect(res.statusCode).toBe(401);
    });
    it('DELETE 미인증 → 401', async () => {
      expect(
        (await app.inject({ method: 'DELETE', url: favoriteUrl('100000001') })).statusCode,
      ).toBe(401);
    });
    it('sync 미인증 → 401', async () => {
      const res = await app.inject({ method: 'POST', url: SYNC_URL, payload: { items: [] } });
      expect(res.statusCode).toBe(401);
    });
  });

  it('빈 목록 GET → { items: [] }', async () => {
    const res = await app.inject({
      method: 'GET',
      url: FAVORITES_URL,
      headers: auth(app, ownerId),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [] });
  });

  it('PUT 멱등 — 같은 placeId 두 번 → 1개, 스냅샷은 두 번째 값', async () => {
    const placeId = '100000001';
    const first = await app.inject({
      method: 'PUT',
      url: favoriteUrl(placeId),
      headers: auth(app, ownerId),
      payload: favoriteBody({ name: '김밥천국-A' }),
    });
    expect(first.statusCode).toBe(200);
    expect((first.json() as FavoritesBody).items).toHaveLength(1);

    const second = await app.inject({
      method: 'PUT',
      url: favoriteUrl(placeId),
      headers: auth(app, ownerId),
      payload: favoriteBody({ name: '김밥천국-B', category: '한식' }),
    });
    expect(second.statusCode).toBe(200);
    const body = second.json() as FavoritesBody;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toEqual({
      placeId,
      ...favoriteBody({ name: '김밥천국-B', category: '한식' }),
    });
  });

  it('nullable 스냅샷 — 좌표/카테고리/썸네일 없는 식당도 저장된다', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: favoriteUrl('100000002'),
      headers: auth(app, ownerId),
      payload: favoriteBody({
        category: null,
        address: null,
        thumbnailUrl: null,
        latitude: null,
        longitude: null,
      }),
    });
    expect(res.statusCode).toBe(200);
    const item = (res.json() as FavoritesBody).items[0]!;
    expect(item.latitude).toBeNull();
    expect(item.thumbnailUrl).toBeNull();
  });

  it('소유자 스코프 — A 가 넣은 항목은 B GET 에 안 보인다', async () => {
    await app.inject({
      method: 'PUT',
      url: favoriteUrl('100000003'),
      headers: auth(app, ownerId),
      payload: favoriteBody(),
    });

    const ownerRes = await app.inject({
      method: 'GET',
      url: FAVORITES_URL,
      headers: auth(app, ownerId),
    });
    expect((ownerRes.json() as FavoritesBody).items).toHaveLength(1);

    const otherRes = await app.inject({
      method: 'GET',
      url: FAVORITES_URL,
      headers: auth(app, otherId),
    });
    expect((otherRes.json() as FavoritesBody).items).toHaveLength(0);
  });

  it('DELETE 멱등 — 없는 placeId 삭제도 200', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: favoriteUrl('100000009'),
      headers: auth(app, ownerId),
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as FavoritesBody).items).toHaveLength(0);
  });

  it('DELETE — 있는 항목 삭제 후 목록에서 빠진다', async () => {
    await app.inject({
      method: 'PUT',
      url: favoriteUrl('100000004'),
      headers: auth(app, ownerId),
      payload: favoriteBody(),
    });
    const del = await app.inject({
      method: 'DELETE',
      url: favoriteUrl('100000004'),
      headers: auth(app, ownerId),
    });
    expect(del.statusCode).toBe(200);
    expect((del.json() as FavoritesBody).items).toHaveLength(0);
  });

  it('sync — 겹치는 항목은 서버 값 유지 + 새 항목만 추가, 재호출 멱등', async () => {
    await app.inject({
      method: 'PUT',
      url: favoriteUrl('100000010'),
      headers: auth(app, ownerId),
      payload: favoriteBody({ name: '서버-X' }),
    });

    const syncPayload = {
      items: [
        // 겹침: 클라이언트 스냅샷으로 덮어쓰지 않아야 한다.
        { placeId: '100000010', ...favoriteBody({ name: '클라-X' }) },
        // 신규.
        { placeId: '100000011', ...favoriteBody({ name: '신규-Y' }) },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: SYNC_URL,
      headers: auth(app, ownerId),
      payload: syncPayload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as FavoritesBody;
    expect(body.items).toHaveLength(2);
    expect(body.items.find((i) => i.placeId === '100000010')?.name).toBe('서버-X');
    expect(body.items.find((i) => i.placeId === '100000011')?.name).toBe('신규-Y');

    // 재호출 멱등 — 결과 동일, 중복 생성 없음.
    const again = await app.inject({
      method: 'POST',
      url: SYNC_URL,
      headers: auth(app, ownerId),
      payload: syncPayload,
    });
    expect(again.json() as FavoritesBody).toEqual(body);
  });

  it('sync — body 내 중복 placeId 는 한 번만 들어간다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: SYNC_URL,
      headers: auth(app, ownerId),
      payload: {
        items: [
          { placeId: '100000012', ...favoriteBody({ name: '먼저' }) },
          { placeId: '100000012', ...favoriteBody({ name: '나중' }) },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as FavoritesBody;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.name).toBe('먼저');
  });

  it('정렬 — createdAt asc(등록순), 삽입 순서와 무관', async () => {
    const base = new Date('2026-01-01T00:00:00Z').getTime();
    const mk = (placeId: string, name: string, offsetMs: number) =>
      app.prisma.restaurantFavorite.create({
        data: {
          userId: ownerId,
          placeId,
          name,
          category: null,
          address: null,
          thumbnailUrl: null,
          latitude: null,
          longitude: null,
          createdAt: new Date(base + offsetMs),
        },
      });
    // 물리적 삽입 순서는 A(+2s) → B(+0s) → C(+1s) 지만, 출력은 createdAt asc(B,C,A).
    await mk('100000021', 'A', 2000);
    await mk('100000022', 'B', 0);
    await mk('100000023', 'C', 1000);

    const res = await app.inject({
      method: 'GET',
      url: FAVORITES_URL,
      headers: auth(app, ownerId),
    });
    expect((res.json() as FavoritesBody).items.map((i) => i.name)).toEqual(['B', 'C', 'A']);
  });

  it('상한 — 100개 채운 뒤 새 placeId PUT 은 400, 기존 갱신은 200', async () => {
    await app.prisma.restaurantFavorite.createMany({
      data: Array.from({ length: RESTAURANT_FAVORITES_MAX }, (_, i) => ({
        userId: ownerId,
        placeId: String(200000000 + i),
        name: `식당${i}`,
        category: null,
        address: null,
        thumbnailUrl: null,
        latitude: null,
        longitude: null,
      })),
    });

    // 새 항목 → 상한 초과 400 + 한국어 메시지.
    const over = await app.inject({
      method: 'PUT',
      url: favoriteUrl('299999999'),
      headers: auth(app, ownerId),
      payload: favoriteBody(),
    });
    expect(over.statusCode).toBe(400);
    expect((over.json() as { message: string }).message).toContain('최대');

    // 기존 항목 갱신 → 상한 무관 200.
    const update = await app.inject({
      method: 'PUT',
      url: favoriteUrl(String(200000000)),
      headers: auth(app, ownerId),
      payload: favoriteBody({ name: '갱신됨' }),
    });
    expect(update.statusCode).toBe(200);
    const body = update.json() as FavoritesBody;
    expect(body.items).toHaveLength(RESTAURANT_FAVORITES_MAX);
    expect(body.items.find((i) => i.placeId === '200000000')?.name).toBe('갱신됨');
  });

  it('sync — 상한 초과분은 조용히 skip(에러 아님)', async () => {
    await app.prisma.restaurantFavorite.createMany({
      data: Array.from({ length: RESTAURANT_FAVORITES_MAX - 1 }, (_, i) => ({
        userId: ownerId,
        placeId: String(400000000 + i),
        name: `s${i}`,
        category: null,
        address: null,
        thumbnailUrl: null,
        latitude: null,
        longitude: null,
      })),
    });

    // 새 3개 병합 시도 → 1개만 들어가고 나머지는 조용히 버려진다(200, 상한 도달).
    const res = await app.inject({
      method: 'POST',
      url: SYNC_URL,
      headers: auth(app, ownerId),
      payload: {
        items: [
          { placeId: '499999997', ...favoriteBody({ name: 'n1' }) },
          { placeId: '499999998', ...favoriteBody({ name: 'n2' }) },
          { placeId: '499999999', ...favoriteBody({ name: 'n3' }) },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as FavoritesBody).items).toHaveLength(RESTAURANT_FAVORITES_MAX);
  });
});
