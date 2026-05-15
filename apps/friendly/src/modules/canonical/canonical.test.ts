import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import sensiblePlugin from '../../plugins/sensible.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import canonicalRoutes from './canonical.route.js';
import { Routes } from '@repo/api-contract';

const buildTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.register(canonicalRoutes);
  await app.ready();
  return app;
};

const adminToken = (app: FastifyInstance) =>
  app.jwt.sign({ userId: 'admin-test', email: 'a@x.com', role: 'ADMIN' });
const userToken = (app: FastifyInstance) =>
  app.jwt.sign({ userId: 'user-test', email: 'u@x.com', role: 'USER' });

// 파일 로컬 prefix — 다른 vitest 파일과 동시 실행 시 충돌 회피.
const SOURCE_PREFIX = 'tc-';
const stamp = () =>
  `${SOURCE_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface SeedOpts {
  source: 'naver' | 'diningcode';
  name: string;
  category?: string;
  lat?: number | null;
  lng?: number | null;
}

// 테스트용 Restaurant + Canonical 1:1 시작 행 만들기. 좌표는 source 별 키 분기.
async function seed(app: FastifyInstance, opts: SeedOpts): Promise<{
  restaurantId: string;
  canonicalId: string;
}> {
  const lat = opts.lat ?? null;
  const lng = opts.lng ?? null;
  const sourceId = stamp();
  const snapshotJson = JSON.stringify(
    opts.source === 'naver'
      ? { placeId: sourceId, name: opts.name, latitude: lat, longitude: lng }
      : { vRid: sourceId, fullName: opts.name, lat, lng },
  );
  const canonical = await app.prisma.canonicalRestaurant.create({
    data: {
      name: opts.name,
      primaryCategory: opts.category ?? null,
      latitude: lat,
      longitude: lng,
    },
  });
  const restaurant = await app.prisma.restaurant.create({
    data: {
      source: opts.source,
      sourceId,
      placeId: opts.source === 'naver' ? sourceId : null,
      canonicalId: canonical.id,
      name: opts.name,
      category: opts.category ?? null,
      address: null,
      phone: null,
      rating: null,
      reviewCount: null,
      rawSourceUrl: 'https://example/x',
      snapshotJson,
    },
  });
  return { restaurantId: restaurant.id, canonicalId: canonical.id };
}

describe('canonical routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // 테스트가 만든 행 정리. Restaurant → Canonical 순 (FK 때문에).
    await app.prisma.restaurant.deleteMany({
      where: { sourceId: { startsWith: SOURCE_PREFIX } },
    });
    await app.prisma.canonicalRestaurant.deleteMany({
      where: { name: { startsWith: '__tc' } },
    });
  });

  it('candidates: cross-source 가게가 좌표/이름 임계 통과 시 후보로 잡힘', async () => {
    const target = await seed(app, {
      source: 'naver',
      name: '__tc 성심당',
      lat: 36.327,
      lng: 127.427,
    });
    // 같은 가게, 다른 source, 매우 가까운 좌표.
    await seed(app, {
      source: 'diningcode',
      name: '__tc 성심당 본점',
      lat: 36.327,
      lng: 127.4271,
    });
    // 완전 다른 가게 (이름/위치 다름) — 후보 안 잡혀야.
    await seed(app, {
      source: 'diningcode',
      name: '__tc 맥도날드',
      lat: 37.5,
      lng: 127.0,
    });

    const res = await app.inject({
      method: 'GET',
      url: Routes.Canonical.candidates(target.canonicalId),
      headers: { authorization: `Bearer ${adminToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { candidates: Array<{ canonical: { name: string }; score: number }> };
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].canonical.name).toBe('__tc 성심당 본점');
    expect(body.candidates[0].score).toBeGreaterThan(0.45);
  });

  it('candidates: 같은 source 끼리는 후보로 제안 안 함', async () => {
    const target = await seed(app, {
      source: 'naver',
      name: '__tc 성심당',
      lat: 36.327,
      lng: 127.427,
    });
    // Naver–Naver 면 후보 X.
    await seed(app, {
      source: 'naver',
      name: '__tc 성심당 본점',
      lat: 36.327,
      lng: 127.4271,
    });

    const res = await app.inject({
      method: 'GET',
      url: Routes.Canonical.candidates(target.canonicalId),
      headers: { authorization: `Bearer ${adminToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { candidates: unknown[] }).candidates).toHaveLength(0);
  });

  it('merge: source 의 Restaurant 들이 target.canonicalId 로 이동하고 source 삭제', async () => {
    const a = await seed(app, { source: 'naver', name: '__tc A', lat: 36.327, lng: 127.427 });
    const b = await seed(app, { source: 'diningcode', name: '__tc A', lat: 36.327, lng: 127.427 });

    const res = await app.inject({
      method: 'POST',
      url: Routes.Canonical.merge,
      headers: { authorization: `Bearer ${adminToken(app)}` },
      payload: { sourceCanonicalId: b.canonicalId, targetCanonicalId: a.canonicalId },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      target: { id: string; sources: Array<{ source: string }> };
      movedRestaurantIds: string[];
    };
    expect(body.target.id).toBe(a.canonicalId);
    expect(body.target.sources.map((s) => s.source).sort()).toEqual(['diningcode', 'naver']);
    expect(body.movedRestaurantIds).toEqual([b.restaurantId]);

    // source canonical 삭제 확인.
    const stale = await app.prisma.canonicalRestaurant.findUnique({
      where: { id: b.canonicalId },
    });
    expect(stale).toBeNull();
  });

  it('merge: source==target 이면 400', async () => {
    const a = await seed(app, { source: 'naver', name: '__tc same', lat: null, lng: null });
    const res = await app.inject({
      method: 'POST',
      url: Routes.Canonical.merge,
      headers: { authorization: `Bearer ${adminToken(app)}` },
      payload: { sourceCanonicalId: a.canonicalId, targetCanonicalId: a.canonicalId },
    });
    expect(res.statusCode).toBe(400);
  });

  it('split: Restaurant 한 줄을 새 canonical 로 떼고, 원본이 비면 삭제', async () => {
    // merge 한 상태(canonical 1개에 Restaurant 2개) 를 먼저 만들고 split.
    const a = await seed(app, { source: 'naver', name: '__tc A', lat: 36.327, lng: 127.427 });
    const b = await seed(app, { source: 'diningcode', name: '__tc A', lat: 36.327, lng: 127.427 });
    await app.prisma.restaurant.update({
      where: { id: b.restaurantId },
      data: { canonicalId: a.canonicalId },
    });
    await app.prisma.canonicalRestaurant.delete({ where: { id: b.canonicalId } });

    // split: DC 행을 다시 떼어냄.
    const res = await app.inject({
      method: 'POST',
      url: Routes.Canonical.split(a.canonicalId),
      headers: { authorization: `Bearer ${adminToken(app)}` },
      payload: { restaurantId: b.restaurantId },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      newCanonical: { id: string; sources: Array<{ restaurantId: string }> };
      sourceCanonicalDeleted: boolean;
    };
    expect(body.newCanonical.sources.map((s) => s.restaurantId)).toEqual([b.restaurantId]);
    // a 에는 아직 Naver 행이 남아 있으므로 source 미삭제.
    expect(body.sourceCanonicalDeleted).toBe(false);

    // 떼어낸 행이 새 canonical 을 가리키는지.
    const moved = await app.prisma.restaurant.findUnique({
      where: { id: b.restaurantId },
      select: { canonicalId: true },
    });
    expect(moved?.canonicalId).toBe(body.newCanonical.id);
  });

  it('split: restaurant 가 다른 canonical 소속이면 400', async () => {
    const a = await seed(app, { source: 'naver', name: '__tc A', lat: null, lng: null });
    const b = await seed(app, { source: 'diningcode', name: '__tc B', lat: null, lng: null });
    const res = await app.inject({
      method: 'POST',
      url: Routes.Canonical.split(a.canonicalId),
      headers: { authorization: `Bearer ${adminToken(app)}` },
      payload: { restaurantId: b.restaurantId },
    });
    expect(res.statusCode).toBe(400);
  });

  it('candidates: 비-어드민 접근은 403', async () => {
    const a = await seed(app, { source: 'naver', name: '__tc A', lat: null, lng: null });
    const res = await app.inject({
      method: 'GET',
      url: Routes.Canonical.candidates(a.canonicalId),
      headers: { authorization: `Bearer ${userToken(app)}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('candidates: 미존재 canonical → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: Routes.Canonical.candidates('non-existent'),
      headers: { authorization: `Bearer ${adminToken(app)}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
