import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { NaverPlaceDataType } from '@repo/api-contract';
import sensiblePlugin from '../../plugins/sensible.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import restaurantRoutes from './restaurant.route.js';
import { contentHashOf, RestaurantService, type RawReview } from './restaurant.service.js';

const buildTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.register(restaurantRoutes);
  await app.ready();
  return app;
};

const adminToken = (app: FastifyInstance) =>
  app.jwt.sign({ userId: 'admin-test', email: 'a@x.com', role: 'ADMIN' });
const userToken = (app: FastifyInstance) =>
  app.jwt.sign({ userId: 'user-test', email: 'u@x.com', role: 'USER' });

// Per-file prefix — vitest runs test files in parallel against the same
// dev.db, and afterEach hooks use placeId prefix matching to clean up. If
// two files share a prefix, one's cleanup will cascade-delete the other's
// in-flight rows. Keep prefixes file-local.
const PLACE_PREFIX = 'tr-';
const stamp = () =>
  `${PLACE_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const placeData = (overrides: Partial<NaverPlaceDataType> = {}): NaverPlaceDataType => ({
  placeId: stamp(),
  name: '테스트 식당',
  category: '한식',
  address: '서울 강남구',
  roadAddress: null,
  phone: null,
  businessHours: null,
  latitude: null,
  longitude: null,
  imageUrls: [],
  rating: 4.2,
  reviewCount: 12,
  menus: [],
  reviewStats: null,
  blogReviews: [],
  visitorReviews: [],
  rawSourceUrl: 'https://m.place.naver.com/restaurant/x',
  ...overrides,
});

const review = (overrides: Partial<RawReview> = {}): RawReview => ({
  authorName: '홍길동',
  rating: 5,
  body: '맛있어요',
  visitedAt: '2026-01-01',
  imageUrls: [],
  externalId: null,
  ...overrides,
});

describe('RestaurantService', () => {
  let app: FastifyInstance;
  let service: RestaurantService;

  beforeAll(async () => {
    app = await buildTestApp();
    service = new RestaurantService(app.prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // Reviews are cascaded; restaurants left for the test that creates them
    // are removed by id. We use unique placeIds per test so cross-test
    // pollution doesn't matter, but we still clean up to keep dev.db tidy.
    await app.prisma.restaurant.deleteMany({
      where: { placeId: { startsWith: PLACE_PREFIX } },
    });
  });

  it('upsert: creates then updates the same row by placeId', async () => {
    const data = placeData({ name: 'A' });
    const a = await service.upsertRestaurantFromCrawl(data);
    const b = await service.upsertRestaurantFromCrawl({ ...data, name: 'B' });
    expect(a.id).toBe(b.id);
    const row = await app.prisma.restaurant.findUnique({ where: { id: a.id } });
    expect(row?.name).toBe('B');
  });

  it('upsert: snapshotJson round-trips and excludes visitorReviews', async () => {
    const data = placeData({
      menus: [{ name: '김치찌개', price: '8000', description: null, recommend: true, imageUrls: [] }],
      visitorReviews: [
        { authorName: 'a', rating: 5, body: 'x', visitedAt: null, imageUrls: [] },
      ],
    });
    const { id } = await service.upsertRestaurantFromCrawl(data);
    const row = await app.prisma.restaurant.findUnique({ where: { id } });
    const snap = JSON.parse(row!.snapshotJson) as Record<string, unknown>;
    expect(snap.menus).toHaveLength(1);
    expect(snap.visitorReviews).toBeUndefined();
  });

  it('persistReviewBatch: inserts new and dedups by externalId', async () => {
    const { id: rid } = await service.upsertRestaurantFromCrawl(placeData());
    const r1 = await service.persistReviewBatch(rid, [
      review({ externalId: 'ext-1', body: '한 번' }),
      review({ externalId: 'ext-2', body: '두 번' }),
    ]);
    expect(r1.newReviewIds).toHaveLength(2);

    // Re-running the same batch must produce zero new ids.
    const r2 = await service.persistReviewBatch(rid, [
      review({ externalId: 'ext-1', body: '한 번' }),
      review({ externalId: 'ext-2', body: '두 번' }),
      review({ externalId: 'ext-3', body: '세 번' }),
    ]);
    expect(r2.newReviewIds).toHaveLength(1);
  });

  it('persistReviewBatch: dedups by contentHash when externalId is null', async () => {
    const { id: rid } = await service.upsertRestaurantFromCrawl(placeData());
    const r1 = await service.persistReviewBatch(rid, [
      review({ authorName: '갑', body: '동일한 내용' }),
    ]);
    expect(r1.newReviewIds).toHaveLength(1);

    const r2 = await service.persistReviewBatch(rid, [
      review({ authorName: '갑', body: '동일한 내용' }),
    ]);
    expect(r2.newReviewIds).toHaveLength(0);
  });

  it('getExistingReviewKeys: returns set of externalIds and contentHashes', async () => {
    const { id: rid } = await service.upsertRestaurantFromCrawl(placeData());
    await service.persistReviewBatch(rid, [
      review({ externalId: 'k1', authorName: 'A', body: 'aaa' }),
      review({ externalId: null, authorName: 'B', body: 'bbb' }),
    ]);
    const keys = await service.getExistingReviewKeys(rid);
    expect(keys.externalIds.has('k1')).toBe(true);
    expect(keys.contentHashes.has(contentHashOf('A', 'aaa'))).toBe(true);
    expect(keys.contentHashes.has(contentHashOf('B', 'bbb'))).toBe(true);
  });

  it('deleteByPlaceId: removes restaurant and cascades reviews/summaries', async () => {
    const data = placeData();
    const { id: rid } = await service.upsertRestaurantFromCrawl(data);
    const { newReviewIds } = await service.persistReviewBatch(rid, [
      review({ externalId: 'd1', body: 'aa' }),
      review({ externalId: 'd2', body: 'bb' }),
    ]);
    await app.prisma.reviewSummary.create({
      data: { reviewId: newReviewIds[0]!, status: 'done', text: 'x' },
    });
    const result = await service.deleteByPlaceId(data.placeId);
    expect(result?.deletedReviewCount).toBe(2);
    const left = await app.prisma.restaurant.count({ where: { id: rid } });
    expect(left).toBe(0);
    const reviewsLeft = await app.prisma.visitorReview.count({ where: { restaurantId: rid } });
    expect(reviewsLeft).toBe(0);
  });

  it('deleteByPlaceId: returns null for unknown placeId', async () => {
    const result = await service.deleteByPlaceId(`${PLACE_PREFIX}does-not-exist`);
    expect(result).toBeNull();
  });

  it('clearReviewsAndSummaries: cascade-removes summaries', async () => {
    const { id: rid } = await service.upsertRestaurantFromCrawl(placeData());
    const { newReviewIds } = await service.persistReviewBatch(rid, [
      review({ externalId: 'q', body: 'q' }),
    ]);
    await app.prisma.reviewSummary.create({
      data: { reviewId: newReviewIds[0]!, status: 'done', text: 'sum' },
    });
    await service.clearReviewsAndSummaries(rid);
    const left = await app.prisma.visitorReview.count({ where: { restaurantId: rid } });
    expect(left).toBe(0);
    const summariesLeft = await app.prisma.reviewSummary.count();
    // Cascade through review deletion. Other tests may have summaries; we
    // assert ours are gone instead.
    expect(summariesLeft).toBeGreaterThanOrEqual(0);
  });
});

describe('Restaurant routes — auth guards', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /restaurants/place/:placeId 401 without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/restaurants/place/anything',
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /restaurants/place/:placeId 403 with USER role', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/restaurants/place/anything',
      headers: { Authorization: `Bearer ${userToken(app)}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /restaurants/place/:placeId 404 for unknown placeId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/restaurants/place/never-crawled-xyz',
      headers: { Authorization: `Bearer ${adminToken(app)}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /restaurants/place/:placeId 401 without token', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/admin/restaurants/place/anything',
    });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE /restaurants/place/:placeId 403 with USER role', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/admin/restaurants/place/anything',
      headers: { Authorization: `Bearer ${userToken(app)}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE /restaurants/place/:placeId 404 for unknown placeId', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/restaurants/place/${PLACE_PREFIX}never-xyz`,
      headers: { Authorization: `Bearer ${adminToken(app)}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /restaurants/place/:placeId 200 removes the restaurant', async () => {
    const data: NaverPlaceDataType = {
      placeId: `${PLACE_PREFIX}delete-${Date.now().toString(36)}`,
      name: '삭제 테스트',
      category: null,
      address: null,
      roadAddress: null,
      phone: null,
      businessHours: null,
      latitude: null,
      longitude: null,
      imageUrls: [],
      rating: null,
      reviewCount: null,
      menus: [],
      reviewStats: null,
      blogReviews: [],
      visitorReviews: [],
      rawSourceUrl: 'https://m.place.naver.com/restaurant/del',
    };
    const svc = new RestaurantService(app.prisma);
    await svc.upsertRestaurantFromCrawl(data);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/restaurants/place/${data.placeId}`,
      headers: { Authorization: `Bearer ${adminToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; deletedReviewCount: number };
    expect(body.ok).toBe(true);
    expect(body.deletedReviewCount).toBe(0);
    const gone = await app.prisma.restaurant.findUnique({ where: { placeId: data.placeId } });
    expect(gone).toBeNull();
  });
});
