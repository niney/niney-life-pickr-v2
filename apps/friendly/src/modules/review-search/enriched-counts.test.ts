import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedEnrichedCounts, countEnrichedByRestaurant, invalidateEnrichedCounts } from './enriched-counts.js';

// 리뷰 검색·리뷰 군집 상태 목록이 함께 쓰는 "검색 가능 리뷰 수" — 상태 목록은 30초 캐시, 일괄 작업은 늘 새로.
const fakePrisma = (counts: Array<[string, number]>) => {
  const groupBy = vi.fn(async (_args: unknown) => counts.map(([restaurantId, n]) => ({ restaurantId, _count: { _all: n } })));
  return { prisma: { visitorReview: { groupBy } } as unknown as PrismaClient, groupBy };
};

describe('enriched-counts', () => {
  beforeEach(() => {
    invalidateEnrichedCounts();
  });

  it('상태 목록용 집계는 들고 있다가 쓰고, enrich 가 비우면(invalidate) 다시 센다', async () => {
    const { prisma, groupBy } = fakePrisma([['r1', 3]]);
    expect((await cachedEnrichedCounts(prisma)).get('r1')).toBe(3);
    expect((await cachedEnrichedCounts(prisma)).get('r1')).toBe(3);
    expect(groupBy).toHaveBeenCalledTimes(1);
    invalidateEnrichedCounts();
    await cachedEnrichedCounts(prisma);
    expect(groupBy).toHaveBeenCalledTimes(2);
  });

  it('일괄 작업용 집계는 캐시 없이 주어진 가게만 센다', async () => {
    const { prisma, groupBy } = fakePrisma([['r1', 1]]);
    await countEnrichedByRestaurant(prisma, ['r1', 'r2']);
    await countEnrichedByRestaurant(prisma, ['r1', 'r2']);
    expect(groupBy).toHaveBeenCalledTimes(2);
    expect(groupBy.mock.calls[0]![0]).toMatchObject({ where: { restaurantId: { in: ['r1', 'r2'] } } });
  });
});
