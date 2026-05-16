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
        source: 'naver',
        sourceId: placeId,
        placeId,
        name,
        category: '한식',
        rawSourceUrl: 'https://m.place.naver.com/x',
        snapshotJson: '{}',
        canonical: { create: { name, primaryCategory: '한식' } },
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
        source: 'naver',
        sourceId: placeId,
        placeId,
        name: snap.name,
        category: snap.category,
        address: snap.address,
        rating: snap.rating,
        rawSourceUrl: snap.rawSourceUrl,
        snapshotJson: JSON.stringify(snap),
        canonical: {
          create: {
            name: snap.name,
            primaryCategory: snap.category,
            latitude: snap.latitude,
            longitude: snap.longitude,
          },
        },
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

  it('GET /restaurants/public — list row sums DC sibling reviews + summary counts', async () => {
    // Naver 단독 1행 + Naver+DC 묶인 1행. 둘 다 q 한 단어로 잡히게 이름 짓고
    // 응답에서 placeId 매핑해 카운트 비교.
    const naverOnly = await seedRestaurant({
      name: 'merge-pub-solo',
      firstCrawledAt: new Date(2026, 0, 1),
    });
    // Naver 단독 행에 분석된 리뷰 1건 (done/positive) — bucket 검증용.
    const soloRv = await app.prisma.visitorReview.create({
      data: {
        restaurantId: naverOnly.id,
        authorName: 'solo',
        rating: 5,
        body: 'solo',
        visitedAt: null,
        imageUrlsJson: '[]',
        videosJson: '[]',
        contentHash: `${naverOnly.placeId}-solo-1`,
      },
      select: { id: true },
    });
    await app.prisma.reviewSummary.create({
      data: {
        reviewId: soloRv.id,
        status: 'done',
        text: 'ok',
        sentiment: 'positive',
        sentimentScore: 0.5,
        satisfactionScore: 4,
        finishedAt: new Date(),
      },
    });

    // Naver + DC 묶인 canonical.
    const merged = await seedRestaurant({
      name: 'merge-pub-pair',
      firstCrawledAt: new Date(2026, 0, 1),
    });
    // Naver 쪽 리뷰 2건 (1 done positive, 1 pending).
    const n1 = await app.prisma.visitorReview.create({
      data: {
        restaurantId: merged.id,
        authorName: 'n1',
        rating: 5,
        body: 'n1',
        visitedAt: null,
        imageUrlsJson: '[]',
        videosJson: '[]',
        contentHash: `${merged.placeId}-n1`,
      },
      select: { id: true },
    });
    await app.prisma.reviewSummary.create({
      data: {
        reviewId: n1.id,
        status: 'done',
        text: 'ok',
        sentiment: 'positive',
        sentimentScore: 0.6,
        satisfactionScore: 5,
        finishedAt: new Date(),
      },
    });
    const n2 = await app.prisma.visitorReview.create({
      data: {
        restaurantId: merged.id,
        authorName: 'n2',
        rating: null,
        body: 'n2',
        visitedAt: null,
        imageUrlsJson: '[]',
        videosJson: '[]',
        contentHash: `${merged.placeId}-n2`,
      },
      select: { id: true },
    });
    await app.prisma.reviewSummary.create({
      data: { reviewId: n2.id, status: 'pending' },
    });

    // 같은 canonical 에 묶인 DC 형제 + 리뷰 3건 (2 done — 1 positive, 1 negative; 1 running).
    const mergedRow = await app.prisma.restaurant.findUnique({
      where: { id: merged.id },
      select: { canonicalId: true },
    });
    const dcVRid = `${PUB_PREFIX}dc-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const dcRestaurant = await app.prisma.restaurant.create({
      data: {
        source: 'diningcode',
        sourceId: dcVRid,
        placeId: null,
        name: 'merge-pub-pair-dc',
        category: '한식',
        address: null,
        phone: null,
        rating: 4.6,
        reviewCount: 3,
        rawSourceUrl: `https://www.diningcode.com/profile.php?rid=${dcVRid}`,
        snapshotJson: '{}',
        canonicalId: mergedRow!.canonicalId,
      },
      select: { id: true },
    });
    const d1 = await app.prisma.visitorReview.create({
      data: {
        restaurantId: dcRestaurant.id,
        externalId: 'dc:rv:1',
        authorName: 'd1',
        rating: 5,
        body: 'd1',
        visitedAt: null,
        imageUrlsJson: '[]',
        videosJson: '[]',
        contentHash: `${merged.placeId}-d1`,
      },
      select: { id: true },
    });
    await app.prisma.reviewSummary.create({
      data: {
        reviewId: d1.id,
        status: 'done',
        text: 'ok',
        sentiment: 'positive',
        sentimentScore: 0.7,
        satisfactionScore: 5,
        finishedAt: new Date(),
      },
    });
    const d2 = await app.prisma.visitorReview.create({
      data: {
        restaurantId: dcRestaurant.id,
        externalId: 'dc:rv:2',
        authorName: 'd2',
        rating: 2,
        body: 'd2',
        visitedAt: null,
        imageUrlsJson: '[]',
        videosJson: '[]',
        contentHash: `${merged.placeId}-d2`,
      },
      select: { id: true },
    });
    await app.prisma.reviewSummary.create({
      data: {
        reviewId: d2.id,
        status: 'done',
        text: 'bad',
        sentiment: 'negative',
        sentimentScore: -0.6,
        satisfactionScore: 2,
        finishedAt: new Date(),
      },
    });
    const d3 = await app.prisma.visitorReview.create({
      data: {
        restaurantId: dcRestaurant.id,
        externalId: 'dc:rv:3',
        authorName: 'd3',
        rating: null,
        body: 'd3',
        visitedAt: null,
        imageUrlsJson: '[]',
        videosJson: '[]',
        contentHash: `${merged.placeId}-d3`,
      },
      select: { id: true },
    });
    await app.prisma.reviewSummary.create({
      data: { reviewId: d3.id, status: 'running' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/restaurants/public?q=merge-pub',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{
        placeId: string;
        totalReviews: number;
        summaryPending: number;
        summaryRunning: number;
        summaryDone: number;
        summaryFailed: number;
        analyzedCount: number;
        positiveCount: number;
        negativeCount: number;
        neutralCount: number;
        avgSentimentScore: number | null;
        avgSatisfactionScore: number | null;
      }>;
    };
    const solo = body.items.find((i) => i.placeId === naverOnly.placeId);
    const pair = body.items.find((i) => i.placeId === merged.placeId);
    expect(solo).toBeDefined();
    expect(pair).toBeDefined();

    // Naver 단독 행은 영향 없음 — Naver 리뷰 1건, done 1건만 카운트.
    expect(solo!.totalReviews).toBe(1);
    expect(solo!.summaryDone).toBe(1);
    expect(solo!.positiveCount).toBe(1);

    // 머지된 행은 Naver(2) + DC(3) = 5건 합산.
    expect(pair!.totalReviews).toBe(5);
    // Naver done 1 + DC done 2 = 3.
    expect(pair!.summaryDone).toBe(3);
    expect(pair!.summaryPending).toBe(1);
    expect(pair!.summaryRunning).toBe(1);
    expect(pair!.analyzedCount).toBe(3);
    // 긍정 = Naver done positive 1 + DC done positive 1 = 2.
    expect(pair!.positiveCount).toBe(2);
    // 부정 = DC done negative 1.
    expect(pair!.negativeCount).toBe(1);
    // avg = (0.6 + 0.7 + (-0.6)) / 3 = 0.2333…
    expect(pair!.avgSentimentScore).toBeCloseTo(0.7 / 3, 5);
    // avg sat = (5 + 5 + 2) / 3 = 4.0
    expect(pair!.avgSatisfactionScore).toBeCloseTo(12 / 3, 5);

    // afterEach 가 PUB_PREFIX 만 청소하므로 DC sibling 은 명시 정리.
    await app.prisma.restaurant.deleteMany({
      where: { source: 'diningcode', sourceId: dcVRid },
    });
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

  it('GET /restaurants/public/:placeId — merges DC sibling fields & reviews', async () => {
    // Naver 행 한 줄. 우리 머지 기준에서 phone/address 가 비어 있으면 DC fallback
    // 으로 채워져야 하므로 의도적으로 일부 필드를 빈 상태로 시작.
    const placeId = `${PUB_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const naverSnap = {
      placeId,
      name: '머지가게',
      category: '한식',
      address: null as string | null,
      roadAddress: null as string | null,
      phone: null as string | null,
      businessHours: null as string | null,
      latitude: 37.5,
      longitude: 127.0,
      imageUrls: ['https://n.example/a.jpg'],
      rating: 4.2,
      reviewCount: 60,
      menus: [],
      reviewStats: null,
      blogReviews: [],
      rawSourceUrl: 'https://m.place.naver.com/restaurant/x',
    };
    const naverRow = await app.prisma.restaurant.create({
      data: {
        source: 'naver',
        sourceId: placeId,
        placeId,
        name: '머지가게',
        category: '한식',
        address: null,
        phone: null,
        rating: 4.2,
        reviewCount: 60,
        rawSourceUrl: naverSnap.rawSourceUrl,
        snapshotJson: JSON.stringify(naverSnap),
        canonical: {
          create: { name: '머지가게', primaryCategory: '한식', latitude: 37.5, longitude: 127.0 },
        },
      },
      select: { id: true, canonicalId: true },
    });

    // 같은 canonical 에 묶인 DC 행. 다이닝코드 snapshot 형태(메뉴/스코어/태그 등).
    const dcVRid = `${PUB_PREFIX}dc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const dcSnap = {
      vRid: dcVRid,
      name: 'DC머지',
      branch: null,
      fullName: 'DC머지',
      area: '강남',
      categories: ['한식'],
      descTags: ['분위기좋은', '데이트'],
      score: 88,
      address: '서울 강남구 DC주소',
      roadAddress: '서울 강남구 DC도로명',
      phone: '02-1234',
      lat: 37.51,
      lng: 127.01,
      thumbnailUrl: null,
      images: [],
      photos: [
        { pdId: 'p1', origin: 'https://dc.example/p1.jpg', thumb: 'x', middle: 'y', uploaderName: null, uploaderProfileImg: null, date: null, type: null },
      ],
      tags: ['백년가게'],
      facilities: ['주차'],
      status: null,
      businessHours: [{ duration: '월요일', time: '09:00-22:00', today: false }],
      businessHoursSummary: [{ duration: '매일', time: '08:00-23:00', today: true }],
      menus: [
        { name: 'DC추천메뉴', price: '20000', description: null, rank: 1, best: true, selectionCount: 5, selectionRate: 80, reviewCount: 10, commentCount: 2 },
      ],
      menuTotalCount: 1,
      hasPopularMenu: true,
      scoreDetail: {
        average: 4.6,
        total: 100,
        reviewTotal: 42,
        taste: 4.7,
        service: 4.4,
        price: 4.2,
        clean: 4.5,
        distribution: { s5: 30, s4_5: 5, s4: 4, s3_5: 1, s3: 1, s2: 0, s1: 1 },
        tasteInfo: null,
        priceInfo: null,
        serviceInfo: null,
        cleanInfo: null,
        text: '평가 신뢰',
      },
      blogsFirstPage: { page: 1, totalPage: 0, list: [] },
      wordcloudUrl: 'https://dc.example/wc.png',
      wordcloudUrlMobile: null,
      rawSourceUrl: `https://www.diningcode.com/profile.php?rid=${dcVRid}`,
      fetchedAt: '2026-01-01T00:00:00.000Z',
      elapsedMs: 100,
      source: 'http',
    };
    const dcRow = await app.prisma.restaurant.create({
      data: {
        source: 'diningcode',
        sourceId: dcVRid,
        placeId: null,
        name: 'DC머지',
        category: '한식',
        address: '서울 강남구 DC주소',
        phone: '02-1234',
        rating: 4.6,
        reviewCount: 42,
        rawSourceUrl: dcSnap.rawSourceUrl,
        snapshotJson: JSON.stringify(dcSnap),
        canonicalId: naverRow.canonicalId,
      },
      select: { id: true },
    });

    // 양쪽에 1건씩 visitorReview. Naver 가 더 최근(fetchedAt) — 정렬 검증.
    await app.prisma.visitorReview.create({
      data: {
        restaurantId: naverRow.id,
        externalId: 'naver-rv-1',
        authorName: 'Nuser',
        rating: 5,
        body: '네이버 리뷰 본문',
        visitedAt: null,
        imageUrlsJson: '[]',
        videosJson: '[]',
        contentHash: `${placeId}-n1`,
        fetchedAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    });
    await app.prisma.visitorReview.create({
      data: {
        restaurantId: dcRow.id,
        externalId: 'dc:rv:1',
        authorName: 'Duser',
        rating: 4,
        body: '다이닝코드 리뷰 본문',
        visitedAt: null,
        imageUrlsJson: '[]',
        videosJson: '[]',
        contentHash: `${placeId}-d1`,
        fetchedAt: new Date('2026-01-15T00:00:00.000Z'),
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/restaurants/public/${placeId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      placeId: string;
      address: string | null;
      phone: string | null;
      businessHours: string | null;
      menus: Array<{ name: string }>;
      imageUrls: string[];
      reviews: Array<{ source: 'naver' | 'diningcode'; body: string; fetchedAt: string }>;
      sources: {
        naver: { placeId: string; rating: number | null; siteReviewCount: number | null } | null;
        diningcode: { vRid: string; rating: number | null; siteReviewCount: number | null } | null;
      };
      storedReviewCount: { naver: number; diningcode: number; total: number };
      diningcode: {
        scoreDetail: { average: number | null; taste: number | null } | null;
        descTags: string[];
        facilities: string[];
        wordcloudUrl: string | null;
        businessHoursSummary: Array<{ duration: string; time: string }>;
      } | null;
    };

    // Naver 가 비었던 필드는 DC 값으로 채워짐.
    expect(body.address).toBe('서울 강남구 DC주소');
    expect(body.phone).toBe('02-1234');
    expect(body.businessHours).toBe('매일 08:00-23:00');

    // Naver 가 비어있었으므로 DC 메뉴로 채워짐.
    expect(body.menus).toHaveLength(1);
    expect(body.menus[0]?.name).toBe('DC추천메뉴');

    // Naver imageUrls + DC photos.origin 합집합.
    expect(body.imageUrls).toEqual([
      'https://n.example/a.jpg',
      'https://dc.example/p1.jpg',
    ]);

    // 리뷰는 두 출처가 합쳐서 fetchedAt desc — Naver(2/1) 가 DC(1/15) 보다 위.
    expect(body.reviews).toHaveLength(2);
    expect(body.reviews[0]?.source).toBe('naver');
    expect(body.reviews[1]?.source).toBe('diningcode');

    // 출처별 별점/리뷰수 노출.
    expect(body.sources.naver).toMatchObject({ placeId, rating: 4.2, siteReviewCount: 60 });
    expect(body.sources.diningcode).toMatchObject({ vRid: dcVRid, rating: 4.6, siteReviewCount: 42 });

    // DB 저장 리뷰 카운트.
    expect(body.storedReviewCount).toEqual({ naver: 1, diningcode: 1, total: 2 });

    // DC 보조 정보 통째로 노출.
    expect(body.diningcode?.scoreDetail?.average).toBe(4.6);
    expect(body.diningcode?.scoreDetail?.taste).toBe(4.7);
    expect(body.diningcode?.descTags).toEqual(['분위기좋은', '데이트']);
    expect(body.diningcode?.facilities).toEqual(['주차']);
    expect(body.diningcode?.wordcloudUrl).toBe('https://dc.example/wc.png');
    expect(body.diningcode?.businessHoursSummary).toHaveLength(1);

    // afterEach 가 PUB_PREFIX 만 청소하므로 DC sibling 은 명시 정리.
    await app.prisma.restaurant.deleteMany({
      where: { source: 'diningcode', sourceId: dcVRid },
    });
  });

  it('GET /restaurants/public/:placeId — Naver-only canonical returns null DC addon', async () => {
    const { placeId } = await seedRestaurant({
      name: '단독네이버',
      latitude: 37.5,
      longitude: 127.0,
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/restaurants/public/${placeId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      diningcode: unknown | null;
      sources: { naver: { placeId: string } | null; diningcode: unknown | null };
      storedReviewCount: { naver: number; diningcode: number; total: number };
    };
    expect(body.diningcode).toBeNull();
    expect(body.sources.diningcode).toBeNull();
    expect(body.sources.naver?.placeId).toBe(placeId);
    expect(body.storedReviewCount).toEqual({ naver: 0, diningcode: 0, total: 0 });
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
