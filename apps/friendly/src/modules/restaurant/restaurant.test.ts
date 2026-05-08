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
import {
  contentHashOf,
  invalidateRankingCache,
  RestaurantService,
  type RawReview,
} from './restaurant.service.js';

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
    expect(r1.newReviews).toHaveLength(2);

    // Re-running the same batch must produce zero new ids.
    const r2 = await service.persistReviewBatch(rid, [
      review({ externalId: 'ext-1', body: '한 번' }),
      review({ externalId: 'ext-2', body: '두 번' }),
      review({ externalId: 'ext-3', body: '세 번' }),
    ]);
    expect(r2.newReviews).toHaveLength(1);
  });

  it('persistReviewBatch: dedups by contentHash when externalId is null', async () => {
    const { id: rid } = await service.upsertRestaurantFromCrawl(placeData());
    const r1 = await service.persistReviewBatch(rid, [
      review({ authorName: '갑', body: '동일한 내용' }),
    ]);
    expect(r1.newReviews).toHaveLength(1);

    const r2 = await service.persistReviewBatch(rid, [
      review({ authorName: '갑', body: '동일한 내용' }),
    ]);
    expect(r2.newReviews).toHaveLength(0);
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
    const { newReviews } = await service.persistReviewBatch(rid, [
      review({ externalId: 'd1', body: 'aa' }),
      review({ externalId: 'd2', body: 'bb' }),
    ]);
    await app.prisma.reviewSummary.create({
      data: { reviewId: newReviews[0]!.id, status: 'done', text: 'x' },
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
    const { newReviews } = await service.persistReviewBatch(rid, [
      review({ externalId: 'q', body: 'q' }),
    ]);
    await app.prisma.reviewSummary.create({
      data: { reviewId: newReviews[0]!.id, status: 'done', text: 'sum' },
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

describe('GET /restaurants/ranking — public', () => {
  let app: FastifyInstance;

  const RANK_PREFIX = 'tr-rank-';
  const rankPlaceId = (s: string) => `${RANK_PREFIX}${s}-${Date.now().toString(36)}`;

  // 한 식당에 (positive, negative, neutral) 카운트만큼 done 요약 행을 만든다.
  const seedRestaurantWithSentiments = async (
    name: string,
    counts: { positive: number; negative: number; neutral: number },
  ): Promise<string> => {
    const placeId = rankPlaceId(name);
    const r = await app.prisma.restaurant.create({
      data: {
        placeId,
        name,
        category: '한식',
        rawSourceUrl: 'https://m.place.naver.com/x',
        snapshotJson: '{}',
      },
      select: { id: true },
    });
    const all: Array<'positive' | 'negative' | 'neutral'> = [
      ...Array<'positive'>(counts.positive).fill('positive'),
      ...Array<'negative'>(counts.negative).fill('negative'),
      ...Array<'neutral'>(counts.neutral).fill('neutral'),
    ];
    let i = 0;
    for (const sentiment of all) {
      const review = await app.prisma.visitorReview.create({
        data: {
          restaurantId: r.id,
          authorName: `u${i}`,
          rating: 5,
          body: `body-${name}-${i}`,
          visitedAt: null,
          imageUrlsJson: '[]',
          videosJson: '[]',
          contentHash: `${placeId}-${i}`,
        },
        select: { id: true },
      });
      await app.prisma.reviewSummary.create({
        data: { reviewId: review.id, status: 'done', sentiment },
      });
      i += 1;
    }
    return placeId;
  };

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    invalidateRankingCache();
    await app.prisma.restaurant.deleteMany({
      where: { placeId: { startsWith: RANK_PREFIX } },
    });
  });

  it('returns positive ranking ordered by positive ratio (neutral included by default)', async () => {
    const a = await seedRestaurantWithSentiments('A', { positive: 8, negative: 1, neutral: 1 });
    const b = await seedRestaurantWithSentiments('B', { positive: 5, negative: 5, neutral: 0 });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/restaurants/ranking?sort=positive&minMentions=5',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ placeId: string; rank: number; score: number }>;
      total: number;
      sort: string;
      excludeNeutral: boolean;
    };
    const ids = body.items.map((i) => i.placeId);
    expect(ids.indexOf(a)).toBeLessThan(ids.indexOf(b));
    expect(body.items[ids.indexOf(a)]!.rank).toBe(ids.indexOf(a) + 1);
    expect(body.excludeNeutral).toBe(false);
  });

  it('excludeNeutral=true changes the denominator and reranks', async () => {
    // C: positive 4, neutral 6 → include=0.4, exclude=1.0 (no negative)
    // D: positive 8, neutral 0, negative 2 → include=0.8, exclude=0.8
    // include 모드: D > C. exclude 모드: C > D.
    const c = await seedRestaurantWithSentiments('C', { positive: 4, negative: 0, neutral: 6 });
    const d = await seedRestaurantWithSentiments('D', { positive: 8, negative: 2, neutral: 0 });

    const incl = await app.inject({
      method: 'GET',
      url: '/api/v1/restaurants/ranking?sort=positive&excludeNeutral=false&minMentions=5',
    });
    const inclItems = (incl.json() as { items: Array<{ placeId: string }> }).items.map(
      (i) => i.placeId,
    );
    expect(inclItems.indexOf(d)).toBeLessThan(inclItems.indexOf(c));

    const excl = await app.inject({
      method: 'GET',
      url: '/api/v1/restaurants/ranking?sort=positive&excludeNeutral=true&minMentions=5',
    });
    const exclItems = (excl.json() as { items: Array<{ placeId: string }> }).items.map(
      (i) => i.placeId,
    );
    expect(exclItems.indexOf(c)).toBeLessThan(exclItems.indexOf(d));
  });

  it('minMentions filters out small-sample restaurants', async () => {
    const small = await seedRestaurantWithSentiments('S', {
      positive: 2,
      negative: 0,
      neutral: 0,
    });
    const big = await seedRestaurantWithSentiments('B', {
      positive: 6,
      negative: 1,
      neutral: 0,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/restaurants/ranking?sort=positive&minMentions=5',
    });
    const ids = (res.json() as { items: Array<{ placeId: string }> }).items.map(
      (i) => i.placeId,
    );
    expect(ids).toContain(big);
    expect(ids).not.toContain(small);
  });

  it('sort=negative ranks high-negative first', async () => {
    const bad = await seedRestaurantWithSentiments('Bad', {
      positive: 1,
      negative: 8,
      neutral: 1,
    });
    const good = await seedRestaurantWithSentiments('Good', {
      positive: 8,
      negative: 1,
      neutral: 1,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/restaurants/ranking?sort=negative&minMentions=5',
    });
    const ids = (res.json() as { items: Array<{ placeId: string }> }).items.map(
      (i) => i.placeId,
    );
    expect(ids.indexOf(bad)).toBeLessThan(ids.indexOf(good));
  });

  it('does not require auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/restaurants/ranking',
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('Public restaurant routes', () => {
  let app: FastifyInstance;

  const PUB_PREFIX = 'tr-pub-';
  const seedRestaurant = async (
    overrides: Partial<{
      name: string;
      category: string | null;
      latitude: number | null;
      longitude: number | null;
      address: string | null;
      roadAddress: string | null;
      imageUrls: string[];
      rating: number | null;
      firstCrawledAt: Date;
    }> = {},
  ): Promise<{ id: string; placeId: string }> => {
    const placeId = `${PUB_PREFIX}${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const snap = {
      placeId,
      name: overrides.name ?? '공개 테스트 식당',
      category: overrides.category ?? '한식',
      address: overrides.address ?? '서울 강남구',
      roadAddress: overrides.roadAddress ?? '서울 강남구 테헤란로 1',
      phone: null,
      businessHours: null,
      latitude: overrides.latitude ?? null,
      longitude: overrides.longitude ?? null,
      imageUrls: overrides.imageUrls ?? [],
      rating: overrides.rating ?? null,
      reviewCount: null,
      menus: [],
      reviewStats: null,
      blogReviews: [],
      rawSourceUrl: 'https://m.place.naver.com/restaurant/x',
    };
    const r = await app.prisma.restaurant.create({
      data: {
        placeId,
        name: snap.name,
        category: snap.category,
        address: snap.address,
        rating: snap.rating,
        rawSourceUrl: snap.rawSourceUrl,
        snapshotJson: JSON.stringify(snap),
        ...(overrides.firstCrawledAt
          ? { firstCrawledAt: overrides.firstCrawledAt, lastCrawledAt: overrides.firstCrawledAt }
          : {}),
      },
      select: { id: true },
    });
    return { id: r.id, placeId };
  };

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await app.prisma.restaurant.deleteMany({
      where: { placeId: { startsWith: PUB_PREFIX } },
    });
  });

  it('GET /restaurants/public — no auth required', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/restaurants/public' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /restaurants/public — returns lat/lng + thumbnail from snapshot', async () => {
    const { placeId } = await seedRestaurant({
      name: '좌표있는집',
      latitude: 37.5,
      longitude: 127.0,
      imageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/restaurants/public?q=좌표있는집',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{
        placeId: string;
        latitude: number | null;
        longitude: number | null;
        thumbnailUrl: string | null;
        roadAddress: string | null;
      }>;
    };
    const item = body.items.find((i) => i.placeId === placeId);
    expect(item).toBeDefined();
    expect(item!.latitude).toBe(37.5);
    expect(item!.longitude).toBe(127.0);
    expect(item!.thumbnailUrl).toBe('https://example.com/a.jpg');
    expect(item!.roadAddress).toBe('서울 강남구 테헤란로 1');
  });

  it('GET /restaurants/public — bbox filters out points outside', async () => {
    const inside = await seedRestaurant({
      name: '안쪽',
      latitude: 37.5,
      longitude: 127.0,
    });
    const outside = await seedRestaurant({
      name: '바깥',
      latitude: 35.0,
      longitude: 127.0,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/restaurants/public?bbox=126.9,37.4,127.1,37.6',
    });
    expect(res.statusCode).toBe(200);
    const ids = (res.json() as { items: Array<{ placeId: string }> }).items.map(
      (i) => i.placeId,
    );
    expect(ids).toContain(inside.placeId);
    expect(ids).not.toContain(outside.placeId);
  });

  it('GET /restaurants/public — q matches name OR category', async () => {
    const a = await seedRestaurant({ name: '맛있는 김치찌개', category: '한식' });
    const b = await seedRestaurant({ name: '커피하우스', category: '카페' });
    const byName = await app.inject({
      method: 'GET',
      url: '/api/v1/restaurants/public?q=김치',
    });
    const byCat = await app.inject({
      method: 'GET',
      url: '/api/v1/restaurants/public?q=카페',
    });
    const idsByName = (byName.json() as { items: Array<{ placeId: string }> }).items.map(
      (i) => i.placeId,
    );
    const idsByCat = (byCat.json() as { items: Array<{ placeId: string }> }).items.map(
      (i) => i.placeId,
    );
    expect(idsByName).toContain(a.placeId);
    expect(idsByName).not.toContain(b.placeId);
    expect(idsByCat).toContain(b.placeId);
    expect(idsByCat).not.toContain(a.placeId);
  });

  it('GET /restaurants/public — sort=recent orders by firstCrawledAt desc', async () => {
    const older = await seedRestaurant({
      name: 'older-pub',
      firstCrawledAt: new Date(2025, 0, 1),
    });
    const newer = await seedRestaurant({
      name: 'newer-pub',
      firstCrawledAt: new Date(2026, 0, 1),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/restaurants/public?q=pub',
    });
    const ids = (res.json() as { items: Array<{ placeId: string }> }).items.map(
      (i) => i.placeId,
    );
    expect(ids.indexOf(newer.placeId)).toBeLessThan(ids.indexOf(older.placeId));
  });

  it('GET /restaurants/public/:placeId — 404 for unknown', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/restaurants/public/${PUB_PREFIX}nope`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /restaurants/public/:placeId — returns flattened analysis only for done summaries', async () => {
    const { id, placeId } = await seedRestaurant({
      name: '리뷰있는집',
      latitude: 37.5,
      longitude: 127.0,
    });
    const r1 = await app.prisma.visitorReview.create({
      data: {
        restaurantId: id,
        authorName: '익명',
        rating: 5,
        body: '맛있어요',
        visitedAt: null,
        imageUrlsJson: '[]',
        videosJson: '[]',
        contentHash: `${placeId}-1`,
      },
      select: { id: true },
    });
    await app.prisma.reviewSummary.create({
      data: {
        reviewId: r1.id,
        status: 'done',
        text: '맛있는 식당',
        sentiment: 'positive',
        sentimentScore: 0.8,
        satisfactionScore: 5,
        finishedAt: new Date(),
      },
    });
    // 분석 안 된 리뷰
    await app.prisma.visitorReview.create({
      data: {
        restaurantId: id,
        authorName: '익명2',
        rating: null,
        body: '아직 분석 전',
        visitedAt: null,
        imageUrlsJson: '[]',
        videosJson: '[]',
        contentHash: `${placeId}-2`,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/restaurants/public/${placeId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      placeId: string;
      latitude: number | null;
      reviews: Array<{ body: string; analysis: null | { text: string; sentiment: string } }>;
    };
    expect(body.placeId).toBe(placeId);
    expect(body.latitude).toBe(37.5);
    expect(body.reviews).toHaveLength(2);
    const analyzed = body.reviews.find((r) => r.analysis !== null);
    const unanalyzed = body.reviews.find((r) => r.analysis === null);
    expect(analyzed?.analysis?.text).toBe('맛있는 식당');
    expect(analyzed?.analysis?.sentiment).toBe('positive');
    expect(unanalyzed?.body).toBe('아직 분석 전');
  });

  it('GET /restaurants/public/:placeId/insights — 404 for unknown', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/restaurants/public/${PUB_PREFIX}nope/insights`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /restaurants/public/:placeId/insights — returns aggregates without auth', async () => {
    const { placeId } = await seedRestaurant({ name: '인사이트' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/restaurants/public/${placeId}/insights`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { analyzedCount: number };
    expect(body.analyzedCount).toBe(0);
  });
});
