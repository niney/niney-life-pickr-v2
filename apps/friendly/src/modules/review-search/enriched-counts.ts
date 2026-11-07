import type { PrismaClient } from '@prisma/client';
import { KeyedCache } from '../../lib/keyed-cache.js';

// 가게(restaurantId)별 "검색 가능(임베딩 있음)" 리뷰 수 — 리뷰 검색·리뷰 군집 어드민 상태 목록이 함께 쓴다.
//
// 요약 행마다 큰 임베딩 열(약 13KB)이 비었는지 보느라 운영 요약 19.8만 건을 다 읽어 한 번에 DB 약 200ms 였다(2026-11
// 운영 DB 실측 — 두 상태 목록이 각각 240~340ms). 상태 목록용 전 가게 집계는 30초 들고 있고(만료 직후 한 번은 지난 값),
// enrich 가 임베딩을 쓰면 비운다. 진행 중 enrich 는 목록 화면이 SSE 로 따로 받는다. 일괄 작업이 "아직 안 된 가게"를 고를
// 때는 countEnrichedByRestaurant 로 늘 새로 센다.
export const ENRICHED_COUNTS_TTL_MS = 30_000;

const cache = new KeyedCache<ReadonlyMap<string, number>>({
  ttlMs: ENRICHED_COUNTS_TTL_MS,
  maxBytes: 4 * 1024 * 1024,
});

export async function countEnrichedByRestaurant(
  prisma: PrismaClient,
  ids?: readonly string[],
): Promise<Map<string, number>> {
  const grouped = await prisma.visitorReview.groupBy({
    by: ['restaurantId'],
    where: {
      summary: { is: { embeddingJson: { not: null } } },
      ...(ids ? { restaurantId: { in: [...ids] } } : {}),
    },
    _count: { _all: true },
  });
  return new Map(grouped.map((g) => [g.restaurantId, g._count._all]));
}

// 상태 목록용 — 전 가게 집계(30초 캐시). 없는 가게는 맵에 없다(0).
export async function cachedEnrichedCounts(prisma: PrismaClient): Promise<ReadonlyMap<string, number>> {
  const counts = await cache.get('all', async () => {
    const value = await countEnrichedByRestaurant(prisma);
    return { value, bytes: 200 + value.size * 120 };
  });
  return counts ?? new Map();
}

export const invalidateEnrichedCounts = (): void => {
  cache.invalidateAll();
};
