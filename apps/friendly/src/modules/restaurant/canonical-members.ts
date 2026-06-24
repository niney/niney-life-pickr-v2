import type { PrismaClient } from '@prisma/client';

// 한 가게(canonical)의 "공개 멤버 행"을 푸는 헬퍼. 공개 상세의 리뷰 융합
// (restaurant.service.assemblePublicReviews)과 **동일한 소스 규칙**으로 멤버를
// 모은다 — naver + diningcode + tabling(partner; 'place:' prefix 제외). 그래야
// "리뷰 탭엔 보이는데 enrich/QA/군집엔 빠지는" 불일치가 안 생긴다.
//
// review-search(enrich/QA)·review-clustering 이 단일 restaurantId 대신 이 멤버
// 집합으로 코퍼스를 로드한다. primaryId 는 placeId 를 가진 네이버 행 — 공개
// 조회(placeId 키)·코퍼스 캐시·군집 영속(ReviewCluster.restaurantId)의 대표 키다.

export interface CanonicalMembers {
  // 대표 키 — 그 가게의 placeId 보유(네이버) 행. 없으면 입력 행으로 폴백.
  primaryId: string;
  canonicalId: string;
  // 공개 융합과 동일 소스 셋의 restaurantIds (입력 행 포함 보장).
  memberIds: string[];
}

async function membersOfCanonical(
  prisma: PrismaClient,
  canonicalId: string,
  fallbackId: string,
): Promise<CanonicalMembers> {
  const rows = await prisma.restaurant.findMany({
    where: {
      canonicalId,
      OR: [
        { source: 'naver' },
        { source: 'diningcode' },
        // 테이블링은 partner 행만 — place 행('place:' prefix)은 얕은 스냅샷(리뷰 없음).
        { source: 'tabling', NOT: { sourceId: { startsWith: 'place:' } } },
      ],
    },
    select: { id: true, source: true, placeId: true },
  });
  const primaryId =
    rows.find((r) => r.source === 'naver' && r.placeId)?.id ??
    rows.find((r) => r.placeId)?.id ??
    fallbackId;
  const memberIds = rows.map((r) => r.id);
  if (!memberIds.includes(fallbackId)) memberIds.push(fallbackId);
  return { primaryId, canonicalId, memberIds };
}

// placeId(네이버 공개 키) → 그 가게의 공개 멤버. 없으면 null.
export async function resolveCanonicalMembersByPlaceId(
  prisma: PrismaClient,
  placeId: string,
): Promise<CanonicalMembers | null> {
  const r = await prisma.restaurant.findUnique({
    where: { placeId },
    select: { id: true, canonicalId: true },
  });
  if (!r) return null;
  return membersOfCanonical(prisma, r.canonicalId, r.id);
}

// 임의의 restaurantId(부수 행 포함) → 그 가게의 공개 멤버. 없으면 null.
export async function resolveCanonicalMembersByRestaurantId(
  prisma: PrismaClient,
  restaurantId: string,
): Promise<CanonicalMembers | null> {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { canonicalId: true },
  });
  if (!r) return null;
  return membersOfCanonical(prisma, r.canonicalId, restaurantId);
}

export interface PublicPlaceAgg {
  // 대표(placeId 보유) 행 — 어드민 액션·캐시·군집 영속 키.
  primaryId: string;
  placeId: string | null;
  name: string;
  // 공개 멤버 행 전체(리뷰 합산 대상).
  memberIds: string[];
  totalReviews: number;
}

// 공개 가게(placeId 보유) 단위 집계 — 어드민 상태 목록(enrich/군집)이 가게 1개당
// 한 줄을 보이게 한다. 부수 행(다이닝코드/테이블링) 리뷰는 그 가게로 합산하고,
// 리뷰 0 가게는 제외. review-search·review-clustering 의 상태/일괄 작업 공용.
export async function listPublicPlaces(prisma: PrismaClient): Promise<PublicPlaceAgg[]> {
  const primaries = await prisma.restaurant.findMany({
    where: { placeId: { not: null } },
    select: { id: true, placeId: true, name: true, canonicalId: true },
  });
  const members = await prisma.restaurant.findMany({
    where: {
      canonicalId: { in: primaries.map((p) => p.canonicalId) },
      OR: [
        { source: 'naver' },
        { source: 'diningcode' },
        { source: 'tabling', NOT: { sourceId: { startsWith: 'place:' } } },
      ],
    },
    select: { id: true, canonicalId: true, _count: { select: { visitorReviews: true } } },
  });
  const byCanon = new Map<string, { ids: string[]; reviews: number }>();
  for (const m of members) {
    const e = byCanon.get(m.canonicalId) ?? { ids: [], reviews: 0 };
    e.ids.push(m.id);
    e.reviews += m._count.visitorReviews;
    byCanon.set(m.canonicalId, e);
  }
  return primaries
    .map((p) => {
      const agg = byCanon.get(p.canonicalId) ?? { ids: [p.id], reviews: 0 };
      return {
        primaryId: p.id,
        placeId: p.placeId,
        name: p.name,
        memberIds: agg.ids,
        totalReviews: agg.reviews,
      };
    })
    .filter((p) => p.totalReviews > 0);
}
