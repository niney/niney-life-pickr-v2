import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { BUS_FAVORITES_MAX } from '@repo/api-contract';
import sensiblePlugin from '../../plugins/sensible.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import busFavoriteRoutes from './bus-favorite.route.js';

const buildTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.register(busFavoriteRoutes);
  await app.ready();
  return app;
};

const tokenFor = (app: FastifyInstance, userId: string): string =>
  app.jwt.sign({ userId, email: `${userId}@x.com`, role: 'USER' });
const auth = (app: FastifyInstance, userId: string): { Authorization: string } => ({
  Authorization: `Bearer ${tokenFor(app, userId)}`,
});

// 정류장 스냅샷 body(PUT) — path 의 stId 를 제외한 나머지 필드.
const stationBody = (over: Partial<StationBody> = {}): StationBody => ({
  arsId: '23290',
  name: '강남역',
  lat: 37.4979,
  lng: 127.0276,
  ...over,
});
interface StationBody {
  arsId: string;
  name: string;
  lat: number;
  lng: number;
}

// 노선 조합 스냅샷 body(PUT) — path 의 stId/busRouteId 제외.
const routeBody = (over: Partial<RouteBody> = {}): RouteBody => ({
  routeName: '141',
  stationName: '강남역',
  arsId: '23290',
  lat: 37.4979,
  lng: 127.0276,
  ...over,
});
interface RouteBody {
  routeName: string;
  stationName: string;
  arsId: string;
  lat: number;
  lng: number;
}

interface FavoritesBody {
  stations: Array<{ stId: string; arsId: string; name: string; lat: number; lng: number }>;
  routes: Array<{
    stId: string;
    busRouteId: string;
    routeName: string;
    stationName: string;
    arsId: string;
    lat: number;
    lng: number;
  }>;
}

const stationUrl = (stId: string): string => `/api/v1/bus/favorites/stations/${stId}`;
const routeUrl = (stId: string, busRouteId: string): string =>
  `/api/v1/bus/favorites/routes/${stId}/${busRouteId}`;
const FAVORITES_URL = '/api/v1/bus/favorites';
const SYNC_URL = '/api/v1/bus/favorites/sync';

describe('bus favorite routes', () => {
  let app: FastifyInstance;
  const ownerId = 'busfav-test-owner';
  const otherId = 'busfav-test-other';

  const clearFavorites = async (): Promise<void> => {
    await app.prisma.busFavoriteStation.deleteMany({
      where: { userId: { in: [ownerId, otherId] } },
    });
    await app.prisma.busFavoriteRoute.deleteMany({
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
        url: stationUrl('100000001'),
        payload: stationBody(),
      });
      expect(res.statusCode).toBe(401);
    });
    it('DELETE 미인증 → 401', async () => {
      expect(
        (await app.inject({ method: 'DELETE', url: stationUrl('100000001') })).statusCode,
      ).toBe(401);
    });
    it('sync 미인증 → 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: SYNC_URL,
        payload: { stations: [], routes: [] },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  it('빈 목록 GET → { stations: [], routes: [] }', async () => {
    const res = await app.inject({ method: 'GET', url: FAVORITES_URL, headers: auth(app, ownerId) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ stations: [], routes: [] });
  });

  it('PUT 멱등 — 같은 stId 두 번 → 1개, 스냅샷은 두 번째 값', async () => {
    const stId = '100000001';
    const first = await app.inject({
      method: 'PUT',
      url: stationUrl(stId),
      headers: auth(app, ownerId),
      payload: stationBody({ name: '강남역-A' }),
    });
    expect(first.statusCode).toBe(200);
    expect((first.json() as FavoritesBody).stations).toHaveLength(1);

    const second = await app.inject({
      method: 'PUT',
      url: stationUrl(stId),
      headers: auth(app, ownerId),
      payload: stationBody({ name: '강남역-B', arsId: '99999' }),
    });
    expect(second.statusCode).toBe(200);
    const body = second.json() as FavoritesBody;
    expect(body.stations).toHaveLength(1);
    expect(body.stations[0]).toEqual({
      stId,
      arsId: '99999',
      name: '강남역-B',
      lat: 37.4979,
      lng: 127.0276,
    });
  });

  it('소유자 스코프 — A 가 넣은 항목은 B GET 에 안 보인다', async () => {
    await app.inject({
      method: 'PUT',
      url: stationUrl('100000002'),
      headers: auth(app, ownerId),
      payload: stationBody(),
    });

    const ownerRes = await app.inject({
      method: 'GET',
      url: FAVORITES_URL,
      headers: auth(app, ownerId),
    });
    expect((ownerRes.json() as FavoritesBody).stations).toHaveLength(1);

    const otherRes = await app.inject({
      method: 'GET',
      url: FAVORITES_URL,
      headers: auth(app, otherId),
    });
    expect((otherRes.json() as FavoritesBody).stations).toHaveLength(0);
  });

  it('DELETE 멱등 — 없는 stId 삭제도 200', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: stationUrl('100000009'),
      headers: auth(app, ownerId),
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as FavoritesBody).stations).toHaveLength(0);
  });

  it('DELETE — 있는 항목 삭제 후 목록에서 빠진다', async () => {
    await app.inject({
      method: 'PUT',
      url: stationUrl('100000003'),
      headers: auth(app, ownerId),
      payload: stationBody(),
    });
    const del = await app.inject({
      method: 'DELETE',
      url: stationUrl('100000003'),
      headers: auth(app, ownerId),
    });
    expect(del.statusCode).toBe(200);
    expect((del.json() as FavoritesBody).stations).toHaveLength(0);
  });

  it('노선 조합 — PUT/DELETE + (stId, busRouteId) 유니크', async () => {
    const stId = '100000004';
    // 같은 정류장의 서로 다른 두 노선 → 2건.
    await app.inject({
      method: 'PUT',
      url: routeUrl(stId, '100100020'),
      headers: auth(app, ownerId),
      payload: routeBody({ routeName: '141' }),
    });
    const two = await app.inject({
      method: 'PUT',
      url: routeUrl(stId, '100100021'),
      headers: auth(app, ownerId),
      payload: routeBody({ routeName: '242' }),
    });
    expect((two.json() as FavoritesBody).routes).toHaveLength(2);

    // 같은 조합 재 PUT → 멱등(여전히 2건), 스냅샷만 갱신.
    const again = await app.inject({
      method: 'PUT',
      url: routeUrl(stId, '100100020'),
      headers: auth(app, ownerId),
      payload: routeBody({ routeName: '141-갱신' }),
    });
    const againBody = again.json() as FavoritesBody;
    expect(againBody.routes).toHaveLength(2);
    expect(againBody.routes.find((r) => r.busRouteId === '100100020')?.routeName).toBe('141-갱신');

    // 한 조합 삭제 → 1건.
    const del = await app.inject({
      method: 'DELETE',
      url: routeUrl(stId, '100100020'),
      headers: auth(app, ownerId),
    });
    const delBody = del.json() as FavoritesBody;
    expect(delBody.routes).toHaveLength(1);
    expect(delBody.routes[0]!.busRouteId).toBe('100100021');
  });

  it('정류장·노선은 같은 stId 라도 독립적으로 공존한다', async () => {
    const stId = '100000005';
    await app.inject({
      method: 'PUT',
      url: stationUrl(stId),
      headers: auth(app, ownerId),
      payload: stationBody(),
    });
    const res = await app.inject({
      method: 'PUT',
      url: routeUrl(stId, '100100020'),
      headers: auth(app, ownerId),
      payload: routeBody(),
    });
    const body = res.json() as FavoritesBody;
    expect(body.stations).toHaveLength(1);
    expect(body.routes).toHaveLength(1);
  });

  it('sync — 겹치는 항목은 서버 값 유지 + 새 항목만 추가, 재호출 멱등', async () => {
    // 서버 선점: 정류장 X(서버명) + 노선 (X,R1).
    await app.inject({
      method: 'PUT',
      url: stationUrl('100000010'),
      headers: auth(app, ownerId),
      payload: stationBody({ name: '서버-X' }),
    });
    await app.inject({
      method: 'PUT',
      url: routeUrl('100000010', '100100020'),
      headers: auth(app, ownerId),
      payload: routeBody({ routeName: '서버-R1' }),
    });

    const syncPayload: FavoritesBody = {
      stations: [
        // 겹침: 클라이언트 스냅샷으로 덮어쓰지 않아야 한다.
        { stId: '100000010', arsId: '23290', name: '클라-X', lat: 37.4979, lng: 127.0276 },
        // 신규.
        { stId: '100000011', arsId: '23291', name: '신규-Y', lat: 37.5, lng: 127.03 },
      ],
      routes: [
        // 겹침: 서버 값 유지.
        {
          stId: '100000010',
          busRouteId: '100100020',
          routeName: '클라-R1',
          stationName: '강남역',
          arsId: '23290',
          lat: 37.4979,
          lng: 127.0276,
        },
        // 신규 조합.
        {
          stId: '100000010',
          busRouteId: '100100099',
          routeName: '신규-R2',
          stationName: '강남역',
          arsId: '23290',
          lat: 37.4979,
          lng: 127.0276,
        },
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
    expect(body.stations).toHaveLength(2);
    // 겹친 X 는 서버명 유지.
    expect(body.stations.find((s) => s.stId === '100000010')?.name).toBe('서버-X');
    expect(body.stations.find((s) => s.stId === '100000011')?.name).toBe('신규-Y');
    expect(body.routes).toHaveLength(2);
    expect(body.routes.find((r) => r.busRouteId === '100100020')?.routeName).toBe('서버-R1');
    expect(body.routes.find((r) => r.busRouteId === '100100099')?.routeName).toBe('신규-R2');

    // 재호출 멱등 — 결과 동일, 중복 생성 없음.
    const again = await app.inject({
      method: 'POST',
      url: SYNC_URL,
      headers: auth(app, ownerId),
      payload: syncPayload,
    });
    const againBody = again.json() as FavoritesBody;
    expect(againBody).toEqual(body);
  });

  it('정렬 — 둘 다 createdAt asc(등록순), 삽입 순서와 무관', async () => {
    const base = new Date('2026-01-01T00:00:00Z').getTime();
    // 물리적 삽입 순서는 A(+2s) → B(+0s) → C(+1s) 지만, 출력은 createdAt asc(B,C,A).
    await app.prisma.busFavoriteStation.create({
      data: {
        userId: ownerId,
        stId: '100000021',
        arsId: '1',
        name: 'A',
        lat: 37.5,
        lng: 127,
        createdAt: new Date(base + 2000),
      },
    });
    await app.prisma.busFavoriteStation.create({
      data: {
        userId: ownerId,
        stId: '100000022',
        arsId: '1',
        name: 'B',
        lat: 37.5,
        lng: 127,
        createdAt: new Date(base),
      },
    });
    await app.prisma.busFavoriteStation.create({
      data: {
        userId: ownerId,
        stId: '100000023',
        arsId: '1',
        name: 'C',
        lat: 37.5,
        lng: 127,
        createdAt: new Date(base + 1000),
      },
    });

    const res = await app.inject({ method: 'GET', url: FAVORITES_URL, headers: auth(app, ownerId) });
    const body = res.json() as FavoritesBody;
    expect(body.stations.map((s) => s.name)).toEqual(['B', 'C', 'A']);
  });

  it('상한 — 정류장 100개 채운 뒤 새 stId PUT 은 400, 기존 갱신은 200', async () => {
    await app.prisma.busFavoriteStation.createMany({
      data: Array.from({ length: BUS_FAVORITES_MAX }, (_, i) => ({
        userId: ownerId,
        stId: String(200000000 + i),
        arsId: '1',
        name: `정류장${i}`,
        lat: 37.5,
        lng: 127,
      })),
    });

    // 새 항목 → 상한 초과 400 + 한국어 메시지.
    const over = await app.inject({
      method: 'PUT',
      url: stationUrl('299999999'),
      headers: auth(app, ownerId),
      payload: stationBody(),
    });
    expect(over.statusCode).toBe(400);
    expect((over.json() as { message: string }).message).toContain('최대');

    // 기존 항목 갱신 → 상한 무관 200.
    const update = await app.inject({
      method: 'PUT',
      url: stationUrl(String(200000000)),
      headers: auth(app, ownerId),
      payload: stationBody({ name: '갱신됨' }),
    });
    expect(update.statusCode).toBe(200);
    const body = update.json() as FavoritesBody;
    expect(body.stations).toHaveLength(BUS_FAVORITES_MAX);
    expect(body.stations.find((s) => s.stId === '200000000')?.name).toBe('갱신됨');
  });

  it('상한 — 노선 100개 채운 뒤 새 조합 PUT 은 400', async () => {
    await app.prisma.busFavoriteRoute.createMany({
      data: Array.from({ length: BUS_FAVORITES_MAX }, (_, i) => ({
        userId: ownerId,
        stId: '100000030',
        busRouteId: String(300000000 + i),
        routeName: `노선${i}`,
        stationName: '강남역',
        arsId: '23290',
        lat: 37.5,
        lng: 127,
      })),
    });

    const over = await app.inject({
      method: 'PUT',
      url: routeUrl('100000030', '399999999'),
      headers: auth(app, ownerId),
      payload: routeBody(),
    });
    expect(over.statusCode).toBe(400);
  });

  it('sync — 상한 초과분은 조용히 skip(에러 아님)', async () => {
    // 서버에 99개 선점.
    await app.prisma.busFavoriteStation.createMany({
      data: Array.from({ length: BUS_FAVORITES_MAX - 1 }, (_, i) => ({
        userId: ownerId,
        stId: String(400000000 + i),
        arsId: '1',
        name: `s${i}`,
        lat: 37.5,
        lng: 127,
      })),
    });

    // 새 3개 병합 시도 → 1개만 들어가고 나머지는 조용히 버려진다(200, 상한 도달).
    const res = await app.inject({
      method: 'POST',
      url: SYNC_URL,
      headers: auth(app, ownerId),
      payload: {
        stations: [
          { stId: '499999997', arsId: '1', name: 'n1', lat: 37.5, lng: 127 },
          { stId: '499999998', arsId: '1', name: 'n2', lat: 37.5, lng: 127 },
          { stId: '499999999', arsId: '1', name: 'n3', lat: 37.5, lng: 127 },
        ],
        routes: [],
      } as FavoritesBody,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as FavoritesBody).stations).toHaveLength(BUS_FAVORITES_MAX);
  });
});
