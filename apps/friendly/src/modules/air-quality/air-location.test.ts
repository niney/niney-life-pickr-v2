import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { AirLocationResultType } from '@repo/api-contract';
import sensiblePlugin from '../../plugins/sensible.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import airLocationRoutes from './air-location.route.js';

// 버스 즐겨찾기 테스트와 같은 최소 앱(sensible/error-handler/jwt/prisma + 이 라우트만).
// 공유 dev.db — 전용 userId prefix 로 만들고 afterAll 에서 정리한다.
const buildTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.register(airLocationRoutes);
  await app.ready();
  return app;
};

const tokenFor = (app: FastifyInstance, userId: string): string =>
  app.jwt.sign({ userId, email: `${userId}@x.com`, role: 'USER' });
const auth = (app: FastifyInstance, userId: string): { Authorization: string } => ({
  Authorization: `Bearer ${tokenFor(app, userId)}`,
});

const URL = '/api/v1/air/location';
const body = (over: Record<string, unknown> = {}) => ({
  lat: 37.572025,
  lng: 127.005028,
  label: '종로구',
  source: 'geolocation',
  ...over,
});

describe('air location routes — 내 대기 위치(서버 저장분)', () => {
  let app: FastifyInstance;
  const ownerId = 'airloc-test-owner';
  const otherId = 'airloc-test-other';

  const clear = async (): Promise<void> => {
    await app.prisma.airUserLocation.deleteMany({ where: { userId: { in: [ownerId, otherId] } } });
  };

  beforeAll(async () => {
    app = await buildTestApp();
    for (const id of [ownerId, otherId]) {
      await app.prisma.user.upsert({
        where: { email: `${id}@x.com` },
        update: {},
        create: { id, email: `${id}@x.com`, passwordHash: 'x' },
      });
    }
    await clear();
  });
  beforeEach(clear);
  afterAll(async () => {
    await clear();
    await app.prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await app.close();
  });

  it('인증 없이는 401', async () => {
    const res = await app.inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(401);
  });

  it('없으면 null → PUT 저장 → GET 동일 → PUT 덮어쓰기(manual) → DELETE 멱등', async () => {
    const empty = await app.inject({ method: 'GET', url: URL, headers: auth(app, ownerId) });
    expect(empty.statusCode).toBe(200);
    expect((empty.json() as AirLocationResultType).location).toBeNull();

    const put = await app.inject({ method: 'PUT', url: URL, headers: auth(app, ownerId), payload: body({ label: '  종로구  ' }) });
    expect(put.statusCode).toBe(200);
    const saved = (put.json() as AirLocationResultType).location;
    expect(saved).toMatchObject({ lat: 37.572025, lng: 127.005028, label: '종로구', source: 'geolocation' });
    expect(saved?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const got = await app.inject({ method: 'GET', url: URL, headers: auth(app, ownerId) });
    expect((got.json() as AirLocationResultType).location).toEqual(saved);

    const over = await app.inject({
      method: 'PUT',
      url: URL,
      headers: auth(app, ownerId),
      payload: body({ lat: 35.1, lng: 129.0, label: null, source: 'manual' }),
    });
    expect((over.json() as AirLocationResultType).location).toMatchObject({ lat: 35.1, lng: 129.0, label: null, source: 'manual' });
    // 한 사용자 1행 — 덮어쓰기라 행 수는 그대로.
    expect(await app.prisma.airUserLocation.count({ where: { userId: ownerId } })).toBe(1);

    const del = await app.inject({ method: 'DELETE', url: URL, headers: auth(app, ownerId) });
    expect(del.statusCode).toBe(200);
    expect((del.json() as AirLocationResultType).location).toBeNull();
    const delAgain = await app.inject({ method: 'DELETE', url: URL, headers: auth(app, ownerId) });
    expect(delAgain.statusCode).toBe(200);
  });

  it('다른 사용자의 저장분은 보이지 않는다(소유자 스코프)', async () => {
    await app.inject({ method: 'PUT', url: URL, headers: auth(app, ownerId), payload: body() });
    const other = await app.inject({ method: 'GET', url: URL, headers: auth(app, otherId) });
    expect((other.json() as AirLocationResultType).location).toBeNull();
  });

  it('좌표 범위 밖·미지 source 는 400', async () => {
    const badLat = await app.inject({ method: 'PUT', url: URL, headers: auth(app, ownerId), payload: body({ lat: 45 }) });
    expect(badLat.statusCode).toBe(400);
    const badSource = await app.inject({ method: 'PUT', url: URL, headers: auth(app, ownerId), payload: body({ source: 'gps' }) });
    expect(badSource.statusCode).toBe(400);
  });
});
