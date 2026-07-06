import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { SUBWAY_FAVORITES_MAX } from '@repo/api-contract';
import sensiblePlugin from '../../plugins/sensible.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import subwayFavoriteRoutes from './subway-favorite.route.js';

const buildTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.register(subwayFavoriteRoutes);
  await app.ready();
  return app;
};

const tokenFor = (app: FastifyInstance, userId: string): string =>
  app.jwt.sign({ userId, email: `${userId}@x.com`, role: 'USER' });
const auth = (app: FastifyInstance, userId: string): { Authorization: string } => ({
  Authorization: `Bearer ${tokenFor(app, userId)}`,
});

// 역 스냅샷 body(PUT) — path 의 stationId 를 제외한 나머지 필드. lines 는 배열.
interface StationBody {
  name: string;
  lat: number;
  lng: number;
  lines: string[];
}
const stationBody = (over: Partial<StationBody> = {}): StationBody => ({
  name: '강남역',
  lat: 37.4979,
  lng: 127.0276,
  lines: ['1002', '1077'],
  ...over,
});

// 역×호선 스냅샷 body(PUT) — path 의 stationId/lineId 제외.
interface LineBody {
  stationName: string;
  lat: number;
  lng: number;
}
const lineBody = (over: Partial<LineBody> = {}): LineBody => ({
  stationName: '강남역',
  lat: 37.4979,
  lng: 127.0276,
  ...over,
});

interface FavoritesBody {
  stations: Array<{ stationId: string; name: string; lat: number; lng: number; lines: string[] }>;
  lines: Array<{
    stationId: string;
    lineId: string;
    stationName: string;
    lat: number;
    lng: number;
  }>;
}

const stationUrl = (stationId: string): string =>
  `/api/v1/subway/favorites/stations/${encodeURIComponent(stationId)}`;
const lineUrl = (stationId: string, lineId: string): string =>
  `/api/v1/subway/favorites/lines/${encodeURIComponent(stationId)}/${lineId}`;
const FAVORITES_URL = '/api/v1/subway/favorites';
const SYNC_URL = '/api/v1/subway/favorites/sync';

describe('subway favorite routes', () => {
  let app: FastifyInstance;
  const ownerId = 'subfav-test-owner';
  const otherId = 'subfav-test-other';

  const clearFavorites = async (): Promise<void> => {
    await app.prisma.subwayFavoriteStation.deleteMany({
      where: { userId: { in: [ownerId, otherId] } },
    });
    await app.prisma.subwayFavoriteLine.deleteMany({
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
        url: stationUrl('1002:강남역'),
        payload: stationBody(),
      });
      expect(res.statusCode).toBe(401);
    });
    it('DELETE 미인증 → 401', async () => {
      expect(
        (await app.inject({ method: 'DELETE', url: stationUrl('1002:강남역') })).statusCode,
      ).toBe(401);
    });
    it('sync 미인증 → 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: SYNC_URL,
        payload: { stations: [], lines: [] },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  it('빈 목록 GET → { stations: [], lines: [] }', async () => {
    const res = await app.inject({ method: 'GET', url: FAVORITES_URL, headers: auth(app, ownerId) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ stations: [], lines: [] });
  });

  it('PUT 멱등 — 같은 stationId 두 번 → 1개, 스냅샷은 두 번째 값 + lines 배열 왕복', async () => {
    const stationId = '1002:강남역';
    const first = await app.inject({
      method: 'PUT',
      url: stationUrl(stationId),
      headers: auth(app, ownerId),
      payload: stationBody({ name: '강남역-A', lines: ['1002'] }),
    });
    expect(first.statusCode).toBe(200);
    expect((first.json() as FavoritesBody).stations).toHaveLength(1);

    const second = await app.inject({
      method: 'PUT',
      url: stationUrl(stationId),
      headers: auth(app, ownerId),
      payload: stationBody({ name: '강남역-B', lines: ['1002', '1077'] }),
    });
    expect(second.statusCode).toBe(200);
    const body = second.json() as FavoritesBody;
    expect(body.stations).toHaveLength(1);
    // lines 는 콤마 컬럼으로 저장됐다가 배열로 복원된다.
    expect(body.stations[0]).toEqual({
      stationId,
      name: '강남역-B',
      lat: 37.4979,
      lng: 127.0276,
      lines: ['1002', '1077'],
    });
  });

  it('소유자 스코프 — A 가 넣은 항목은 B GET 에 안 보인다', async () => {
    await app.inject({
      method: 'PUT',
      url: stationUrl('1003:교대역'),
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

  it('DELETE 멱등 — 없는 stationId 삭제도 200', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: stationUrl('1009:없는역'),
      headers: auth(app, ownerId),
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as FavoritesBody).stations).toHaveLength(0);
  });

  it('DELETE — 있는 항목 삭제 후 목록에서 빠진다', async () => {
    await app.inject({
      method: 'PUT',
      url: stationUrl('1004:사당역'),
      headers: auth(app, ownerId),
      payload: stationBody(),
    });
    const del = await app.inject({
      method: 'DELETE',
      url: stationUrl('1004:사당역'),
      headers: auth(app, ownerId),
    });
    expect(del.statusCode).toBe(200);
    expect((del.json() as FavoritesBody).stations).toHaveLength(0);
  });

  it('역×호선 — PUT/DELETE + (stationId, lineId) 유니크', async () => {
    const stationId = '1002:왕십리';
    // 같은 역의 서로 다른 두 호선 → 2건.
    await app.inject({
      method: 'PUT',
      url: lineUrl(stationId, '1002'),
      headers: auth(app, ownerId),
      payload: lineBody({ stationName: '왕십리' }),
    });
    const two = await app.inject({
      method: 'PUT',
      url: lineUrl(stationId, '1005'),
      headers: auth(app, ownerId),
      payload: lineBody({ stationName: '왕십리' }),
    });
    expect((two.json() as FavoritesBody).lines).toHaveLength(2);

    // 같은 조합 재 PUT → 멱등(2건 유지), 스냅샷만 갱신.
    const again = await app.inject({
      method: 'PUT',
      url: lineUrl(stationId, '1002'),
      headers: auth(app, ownerId),
      payload: lineBody({ stationName: '왕십리-갱신' }),
    });
    const againBody = again.json() as FavoritesBody;
    expect(againBody.lines).toHaveLength(2);
    expect(againBody.lines.find((l) => l.lineId === '1002')?.stationName).toBe('왕십리-갱신');

    // 한 조합 삭제 → 1건.
    const del = await app.inject({
      method: 'DELETE',
      url: lineUrl(stationId, '1002'),
      headers: auth(app, ownerId),
    });
    const delBody = del.json() as FavoritesBody;
    expect(delBody.lines).toHaveLength(1);
    expect(delBody.lines[0]!.lineId).toBe('1005');
  });

  it('역·호선은 같은 stationId 라도 독립적으로 공존한다', async () => {
    const stationId = '1002:선릉';
    await app.inject({
      method: 'PUT',
      url: stationUrl(stationId),
      headers: auth(app, ownerId),
      payload: stationBody(),
    });
    const res = await app.inject({
      method: 'PUT',
      url: lineUrl(stationId, '1002'),
      headers: auth(app, ownerId),
      payload: lineBody(),
    });
    const body = res.json() as FavoritesBody;
    expect(body.stations).toHaveLength(1);
    expect(body.lines).toHaveLength(1);
  });

  it('sync — 겹치는 항목은 서버 값 유지 + 새 항목만 추가, 재호출 멱등', async () => {
    // 서버 선점: 역 X(서버명) + 호선 (X,1002).
    await app.inject({
      method: 'PUT',
      url: stationUrl('1002:서버역'),
      headers: auth(app, ownerId),
      payload: stationBody({ name: '서버-X', lines: ['1002'] }),
    });
    await app.inject({
      method: 'PUT',
      url: lineUrl('1002:서버역', '1002'),
      headers: auth(app, ownerId),
      payload: lineBody({ stationName: '서버-L1' }),
    });

    const syncPayload: FavoritesBody = {
      stations: [
        // 겹침: 클라이언트 스냅샷으로 덮어쓰지 않아야 한다.
        { stationId: '1002:서버역', name: '클라-X', lat: 37.5, lng: 127.03, lines: ['1002', '1077'] },
        // 신규.
        { stationId: '1003:신규역', name: '신규-Y', lat: 37.5, lng: 127.03, lines: ['1003'] },
      ],
      lines: [
        // 겹침: 서버 값 유지.
        { stationId: '1002:서버역', lineId: '1002', stationName: '클라-L1', lat: 37.5, lng: 127.03 },
        // 신규 조합.
        { stationId: '1002:서버역', lineId: '1005', stationName: '신규-L2', lat: 37.5, lng: 127.03 },
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
    expect(body.stations.find((s) => s.stationId === '1002:서버역')?.name).toBe('서버-X');
    expect(body.stations.find((s) => s.stationId === '1003:신규역')?.name).toBe('신규-Y');
    expect(body.lines).toHaveLength(2);
    expect(body.lines.find((l) => l.lineId === '1002')?.stationName).toBe('서버-L1');
    expect(body.lines.find((l) => l.lineId === '1005')?.stationName).toBe('신규-L2');

    // 재호출 멱등 — 결과 동일, 중복 생성 없음.
    const again = await app.inject({
      method: 'POST',
      url: SYNC_URL,
      headers: auth(app, ownerId),
      payload: syncPayload,
    });
    expect(again.json() as FavoritesBody).toEqual(body);
  });

  it('정렬 — createdAt asc(등록순), 삽입 순서와 무관', async () => {
    const base = new Date('2026-01-01T00:00:00Z').getTime();
    // 삽입 순서 A(+2s)→B(+0s)→C(+1s), 출력은 createdAt asc(B,C,A).
    await app.prisma.subwayFavoriteStation.create({
      data: { userId: ownerId, stationId: '1002:A', name: 'A', lines: '1002', lat: 37.5, lng: 127, createdAt: new Date(base + 2000) },
    });
    await app.prisma.subwayFavoriteStation.create({
      data: { userId: ownerId, stationId: '1002:B', name: 'B', lines: '1002', lat: 37.5, lng: 127, createdAt: new Date(base) },
    });
    await app.prisma.subwayFavoriteStation.create({
      data: { userId: ownerId, stationId: '1002:C', name: 'C', lines: '1002', lat: 37.5, lng: 127, createdAt: new Date(base + 1000) },
    });
    const res = await app.inject({ method: 'GET', url: FAVORITES_URL, headers: auth(app, ownerId) });
    expect((res.json() as FavoritesBody).stations.map((s) => s.name)).toEqual(['B', 'C', 'A']);
  });

  it('상한 — 역 100개 채운 뒤 새 stationId PUT 은 400, 기존 갱신은 200', async () => {
    await app.prisma.subwayFavoriteStation.createMany({
      data: Array.from({ length: SUBWAY_FAVORITES_MAX }, (_, i) => ({
        userId: ownerId,
        stationId: `1002:역${i}`,
        name: `역${i}`,
        lines: '1002',
        lat: 37.5,
        lng: 127,
      })),
    });

    const over = await app.inject({
      method: 'PUT',
      url: stationUrl('1002:초과역'),
      headers: auth(app, ownerId),
      payload: stationBody(),
    });
    expect(over.statusCode).toBe(400);
    expect((over.json() as { message: string }).message).toContain('최대');

    const update = await app.inject({
      method: 'PUT',
      url: stationUrl('1002:역0'),
      headers: auth(app, ownerId),
      payload: stationBody({ name: '갱신됨' }),
    });
    expect(update.statusCode).toBe(200);
    const body = update.json() as FavoritesBody;
    expect(body.stations).toHaveLength(SUBWAY_FAVORITES_MAX);
    expect(body.stations.find((s) => s.stationId === '1002:역0')?.name).toBe('갱신됨');
  });

  it('상한 — 호선 100개 채운 뒤 새 조합 PUT 은 400', async () => {
    await app.prisma.subwayFavoriteLine.createMany({
      data: Array.from({ length: SUBWAY_FAVORITES_MAX }, (_, i) => ({
        userId: ownerId,
        stationId: '1002:왕십리',
        lineId: String(2000 + i),
        stationName: '왕십리',
        lat: 37.5,
        lng: 127,
      })),
    });

    const over = await app.inject({
      method: 'PUT',
      url: lineUrl('1002:왕십리', '2999'),
      headers: auth(app, ownerId),
      payload: lineBody(),
    });
    expect(over.statusCode).toBe(400);
  });

  it('sync — 상한 초과분은 조용히 skip(에러 아님)', async () => {
    // 서버에 99개 선점.
    await app.prisma.subwayFavoriteStation.createMany({
      data: Array.from({ length: SUBWAY_FAVORITES_MAX - 1 }, (_, i) => ({
        userId: ownerId,
        stationId: `1002:s${i}`,
        name: `s${i}`,
        lines: '1002',
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
          { stationId: '1002:n1', name: 'n1', lat: 37.5, lng: 127, lines: ['1002'] },
          { stationId: '1002:n2', name: 'n2', lat: 37.5, lng: 127, lines: ['1002'] },
          { stationId: '1002:n3', name: 'n3', lat: 37.5, lng: 127, lines: ['1002'] },
        ],
        lines: [],
      } as FavoritesBody,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as FavoritesBody).stations).toHaveLength(SUBWAY_FAVORITES_MAX);
  });
});
