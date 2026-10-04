import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  aggregateSummaryBuckets,
  emptySummaryBucket,
  foldAscii,
  getPublicRestaurantBase,
  invalidatePublicRestaurantCache,
} from './restaurant-public-base.js';

// 공유 dev.db 위에서 파일 전용 접두사로 시딩·정리한다(restaurant.test.ts 의 규칙).
const PREFIX = 'rpb-';
const stamp = () => `${PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

describe('restaurant-public-base', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  // 테스트용 클라이언트는 foreign_keys PRAGMA 가 연결마다 걸려 있지 않을 수 있어 cascade 에 기대지 않고
  // 요약 → 리뷰 → 가게 → canonical 순으로 직접 지운다.
  const created = { restaurants: [] as string[], canonicals: new Set<string>() };
  afterEach(async () => {
    invalidatePublicRestaurantCache();
    const restaurantId = { in: created.restaurants };
    await prisma.reviewSummary.deleteMany({ where: { review: { restaurantId } } });
    await prisma.visitorReview.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.deleteMany({ where: { id: restaurantId } });
    await prisma.canonicalRestaurant.deleteMany({ where: { id: { in: [...created.canonicals] } } });
    created.restaurants = [];
    created.canonicals.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const seed = async (opts: {
    source?: 'naver' | 'diningcode' | 'tabling';
    canonicalId?: string;
    snapshotJson?: string;
    name?: string;
    category?: string | null;
  }): Promise<{ id: string; canonicalId: string; placeId: string | null }> => {
    const key = stamp();
    const source = opts.source ?? 'naver';
    const placeId = source === 'naver' ? key : null;
    const r = await prisma.restaurant.create({
      data: {
        source,
        sourceId: key,
        placeId,
        name: opts.name ?? '베이스 테스트',
        category: opts.category === undefined ? '한식' : opts.category,
        rawSourceUrl: 'https://example.com',
        snapshotJson: opts.snapshotJson ?? '{}',
        ...(opts.canonicalId
          ? { canonical: { connect: { id: opts.canonicalId } } }
          : { canonical: { create: { name: opts.name ?? '베이스 테스트' } } }),
      },
      select: { id: true, canonicalId: true, placeId: true },
    });
    created.restaurants.push(r.id);
    created.canonicals.add(r.canonicalId);
    return r;
  };

  const addReview = async (
    restaurantId: string,
    summary: {
      status: string;
      sentiment?: string | null;
      sentimentScore?: number | null;
      satisfactionScore?: number | null;
    } | null,
  ) => {
    const rv = await prisma.visitorReview.create({
      data: {
        restaurantId,
        body: 'b',
        imageUrlsJson: '[]',
        videosJson: '[]',
        contentHash: `${restaurantId}-${Math.random().toString(36).slice(2)}`,
      },
      select: { id: true },
    });
    if (summary) {
      await prisma.reviewSummary.create({
        data: {
          reviewId: rv.id,
          status: summary.status,
          sentiment: summary.sentiment ?? null,
          sentimentScore: summary.sentimentScore ?? null,
          satisfactionScore: summary.satisfactionScore ?? null,
          embeddingJson: summary.status === 'done' ? '[0.1,0.2]' : null,
        },
      });
    }
  };

  it('foldAscii 는 ASCII 만 소문자로 접는다(SQLite LIKE 의미)', () => {
    expect(foldAscii('Cafe 카페 ÀB')).toBe('cafe 카페 Àb');
  });

  it('SQL 집계는 상태·감정 분포를 기존 의미대로 센다 — 전체 모드와 IN 모드가 같다', async () => {
    const a = await seed({});
    await addReview(a.id, { status: 'done', sentiment: 'positive', sentimentScore: 0.8, satisfactionScore: 5 });
    await addReview(a.id, { status: 'done', sentiment: 'negative', sentimentScore: -0.4, satisfactionScore: null });
    await addReview(a.id, { status: 'done', sentiment: 'mixed', sentimentScore: null, satisfactionScore: 3 });
    await addReview(a.id, { status: 'queued' });
    await addReview(a.id, { status: 'pending' });
    await addReview(a.id, { status: 'running' });
    await addReview(a.id, { status: 'failed' });
    await addReview(a.id, { status: 'cancelled' });
    await addReview(a.id, null);

    const byIn = await aggregateSummaryBuckets(prisma, [a.id]);
    const all = await aggregateSummaryBuckets(prisma, null);
    const b = byIn.get(a.id)!;
    expect(all.get(a.id)).toEqual(b);
    expect(b).toEqual({
      ...emptySummaryBucket(),
      pending: 2,
      running: 1,
      done: 3,
      failed: 1,
      positive: 1,
      negative: 1,
      mixed: 1,
      sentSum: 0.8 + -0.4,
      sentN: 2,
      satSum: 5 + 3,
      satN: 2,
    });
  });

  it('snapshot 값은 기존 JS 판정과 같은 규칙으로 뽑고, 파손된 JSON 은 행을 살린 채 null', async () => {
    const good = await seed({
      snapshotJson: JSON.stringify({
        latitude: 37.5,
        longitude: 127,
        roadAddress: '서울 테헤란로 1',
        imageUrls: ['https://a/1.jpg', 'https://a/2.jpg'],
      }),
    });
    const wrongTypes = await seed({
      snapshotJson: JSON.stringify({ latitude: '37.5', longitude: null, roadAddress: 3, imageUrls: [{ url: 'x' }] }),
    });
    const broken = await seed({ snapshotJson: '{not json' });

    const base = await getPublicRestaurantBase(prisma);
    const item = (id: string) => base.rows.find((r) => r.id === id)!.item;
    expect(item(good.id)).toMatchObject({
      latitude: 37.5,
      longitude: 127,
      roadAddress: '서울 테헤란로 1',
      thumbnailUrl: 'https://a/1.jpg',
    });
    expect(item(wrongTypes.id)).toMatchObject({ latitude: null, longitude: null, roadAddress: null, thumbnailUrl: null });
    expect(item(broken.id)).toMatchObject({ latitude: null, longitude: null, roadAddress: null, thumbnailUrl: null });
  });

  it('정수 좌표(JSON 127) 행이 실수 좌표 행보다 앞에 와도 읽힌다 — Prisma 열 타입 추론 회귀', async () => {
    const floaty = await seed({ snapshotJson: JSON.stringify({ latitude: 37.5, longitude: 126.9 }) });
    // 베이스는 최근 수집순이라 나중에 만든 정수 좌표 행이 먼저 온다.
    const inty = await seed({ snapshotJson: JSON.stringify({ latitude: 37, longitude: 127 }) });
    await prisma.restaurant.update({ where: { id: inty.id }, data: { firstCrawledAt: new Date(Date.now() + 60_000) } });
    const base = await getPublicRestaurantBase(prisma);
    expect(base.rows[0]!.id).toBe(inty.id);
    expect(base.rows.find((r) => r.id === inty.id)!.item).toMatchObject({ latitude: 37, longitude: 127 });
    expect(base.rows.find((r) => r.id === floaty.id)!.item).toMatchObject({ latitude: 37.5, longitude: 126.9 });
  });

  it('형제(다이닝코드·테이블링 partner) 리뷰·요약을 합산하고, 네이버 자신의 버킷은 따로 둔다', async () => {
    const naver = await seed({});
    await addReview(naver.id, { status: 'done', sentiment: 'positive', sentimentScore: 1, satisfactionScore: 5 });
    const dc = await seed({ source: 'diningcode', canonicalId: naver.canonicalId });
    await addReview(dc.id, { status: 'done', sentiment: 'negative', sentimentScore: -1, satisfactionScore: 1 });
    await addReview(dc.id, null);

    const base = await getPublicRestaurantBase(prisma);
    const row = base.rows.find((r) => r.id === naver.id)!;
    expect(row.item.totalReviews).toBe(3);
    expect(row.item.summaryDone).toBe(2);
    expect(row.item.positiveCount).toBe(1);
    expect(row.item.negativeCount).toBe(1);
    expect(row.item.avgSentimentScore).toBe(0);
    expect(row.own.done).toBe(1);
    expect(row.own.positive).toBe(1);
    expect(base.rows.some((r) => r.id === dc.id)).toBe(false);
  });

  it('TTL 안에서는 같은 베이스를 재사용하고, 무효화 뒤에는 새로 만든다', async () => {
    const first = await getPublicRestaurantBase(prisma);
    expect(await getPublicRestaurantBase(prisma)).toBe(first);

    const added = await seed({ name: '무효화 확인' });
    // 무효화 전에는 캐시 그대로라 새 가게가 안 보인다.
    expect((await getPublicRestaurantBase(prisma)).rows.some((r) => r.id === added.id)).toBe(false);
    invalidatePublicRestaurantCache();
    const fresh = await getPublicRestaurantBase(prisma);
    expect(fresh).not.toBe(first);
    expect(fresh.rows.some((r) => r.id === added.id)).toBe(true);
  });

  it('동시 요청은 계산 하나를 공유한다(in-flight 합류)', async () => {
    const [a, b, c] = await Promise.all([
      getPublicRestaurantBase(prisma),
      getPublicRestaurantBase(prisma),
      getPublicRestaurantBase(prisma),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
