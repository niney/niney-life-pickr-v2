import type { PrismaClient } from '@prisma/client';
import type {
  CanonicalCandidatesResultType,
  CanonicalMatchCandidateType,
  CanonicalMergeResultType,
  CanonicalSplitResultType,
  CanonicalSummaryType,
} from '@repo/api-contract';
import { isCandidate, scoreMatch } from '../../lib/matching.js';

// 호출자 오류 (404/409 등). route 가 catch 해서 적절한 status 로 변환.
export class CanonicalError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST',
  ) {
    super(message);
    this.name = 'CanonicalError';
  }
}

// 후보 검색 시 bbox prefilter — Haversine 을 전수 호출하지 않게 위경도 박스로
// 먼저 좁힌다. 위도 1° ≈ 111km → 500m = 약 0.0045°. 마진 1.5x 둠.
const COORD_BOX_DELTA = 0.007;

export class CanonicalService {
  constructor(private readonly prisma: PrismaClient) {}

  // 한 canonical 의 요약(자기 가게 정보 + 묶인 Restaurant 들). 후보 카드의
  // target / candidate 양쪽에 동일 shape 으로 사용.
  async loadSummary(id: string): Promise<CanonicalSummaryType | null> {
    const row = await this.prisma.canonicalRestaurant.findUnique({
      where: { id },
      include: {
        restaurants: {
          select: {
            id: true,
            source: true,
            sourceId: true,
            placeId: true,
            name: true,
            category: true,
            rating: true,
            reviewCount: true,
          },
        },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      primaryCategory: row.primaryCategory,
      latitude: row.latitude,
      longitude: row.longitude,
      sources: row.restaurants.map((r) => ({
        restaurantId: r.id,
        source: r.source,
        sourceId: r.sourceId,
        placeId: r.placeId,
        name: r.name,
        category: r.category,
        rating: r.rating,
        reviewCount: r.reviewCount,
      })),
    };
  }

  // 후보 검색: 같은 가게로 묶을 만한 다른 canonical 들.
  // 룰:
  //   1. 자기 자신 제외
  //   2. target 의 source 집합과 겹치지 않는 source 가 후보 측에 있어야 함
  //      (예: target 이 Naver 면 후보는 Naver 가 아닌 source 행을 최소 1개 가져야)
  //      — 같은 source 끼리는 (source, sourceId) 가 이미 unique 라 절대 같은
  //      가게가 두 행으로 들어올 수 없음. 묶을 가치가 있는 건 cross-source.
  //   3. 좌표 둘 다 있으면 bbox prefilter → 거리 + 이름 점수 → 임계 통과
  //   4. 좌표 한쪽이라도 없으면 이름만으로 더 엄격한 임계
  async getCandidates(canonicalId: string): Promise<CanonicalCandidatesResultType | null> {
    const target = await this.loadSummary(canonicalId);
    if (!target) return null;

    const targetSources = new Set(target.sources.map((s) => s.source));

    // 좌표 prefilter (있을 때) — 없으면 전체 스캔(데이터 작을 때만 OK).
    const rows = await this.prisma.canonicalRestaurant.findMany({
      where: {
        id: { not: canonicalId },
        ...(target.latitude !== null && target.longitude !== null
          ? {
              latitude: {
                gte: target.latitude - COORD_BOX_DELTA,
                lte: target.latitude + COORD_BOX_DELTA,
              },
              longitude: {
                gte: target.longitude - COORD_BOX_DELTA,
                lte: target.longitude + COORD_BOX_DELTA,
              },
            }
          : {}),
      },
      include: {
        restaurants: {
          select: {
            id: true,
            source: true,
            sourceId: true,
            placeId: true,
            name: true,
            category: true,
            rating: true,
            reviewCount: true,
          },
        },
      },
      take: 200,
    });

    const candidates: CanonicalMatchCandidateType[] = [];
    for (const row of rows) {
      // cross-source 조건
      const hasNewSource = row.restaurants.some((r) => !targetSources.has(r.source));
      if (!hasNewSource) continue;

      const s = scoreMatch(
        { name: target.name, latitude: target.latitude, longitude: target.longitude },
        { name: row.name, latitude: row.latitude, longitude: row.longitude },
      );
      if (!isCandidate(s)) continue;

      candidates.push({
        canonical: {
          id: row.id,
          name: row.name,
          primaryCategory: row.primaryCategory,
          latitude: row.latitude,
          longitude: row.longitude,
          sources: row.restaurants.map((r) => ({
            restaurantId: r.id,
            source: r.source,
            sourceId: r.sourceId,
            placeId: r.placeId,
            name: r.name,
            category: r.category,
            rating: r.rating,
            reviewCount: r.reviewCount,
          })),
        },
        score: s.score,
        nameScore: s.nameScore,
        distanceM: s.distanceM,
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    return { target, candidates };
  }

  // 두 canonical 통합. source 의 모든 Restaurant 가 target.canonicalId 로 옮겨가고
  // source 행은 삭제. 트랜잭션으로 묶어 부분 실패 시 롤백.
  async merge(
    sourceCanonicalId: string,
    targetCanonicalId: string,
  ): Promise<CanonicalMergeResultType> {
    if (sourceCanonicalId === targetCanonicalId) {
      throw new CanonicalError('source and target must differ', 'BAD_REQUEST');
    }

    const [source, target] = await Promise.all([
      this.prisma.canonicalRestaurant.findUnique({
        where: { id: sourceCanonicalId },
        include: { restaurants: { select: { id: true } } },
      }),
      this.prisma.canonicalRestaurant.findUnique({
        where: { id: targetCanonicalId },
        select: { id: true },
      }),
    ]);
    if (!source) throw new CanonicalError('source canonical not found', 'NOT_FOUND');
    if (!target) throw new CanonicalError('target canonical not found', 'NOT_FOUND');

    const movedRestaurantIds = source.restaurants.map((r) => r.id);

    await this.prisma.$transaction(async (tx) => {
      if (movedRestaurantIds.length > 0) {
        await tx.restaurant.updateMany({
          where: { canonicalId: sourceCanonicalId },
          data: { canonicalId: targetCanonicalId },
        });
      }
      await tx.canonicalRestaurant.delete({ where: { id: sourceCanonicalId } });
    });

    const targetSummary = await this.loadSummary(targetCanonicalId);
    if (!targetSummary) {
      // 트랜잭션 직후 사라졌다면 동시성 이슈 — 어드민 도구의 단일 작업에서는
      // 사실상 일어나지 않지만, 발생 시 보수적으로 conflict 로 보고.
      throw new CanonicalError('target canonical missing after merge', 'CONFLICT');
    }
    return { ok: true as const, target: targetSummary, movedRestaurantIds };
  }

  // canonical 분리 — 한 Restaurant 만 새 canonical 로 떼어냄. restaurant 의 현재
  // 좌표/이름/카테고리를 새 canonical 의 초기값으로 사용.
  async split(
    sourceCanonicalId: string,
    restaurantId: string,
  ): Promise<CanonicalSplitResultType> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        canonicalId: true,
        name: true,
        category: true,
        snapshotJson: true,
      },
    });
    if (!restaurant) throw new CanonicalError('restaurant not found', 'NOT_FOUND');
    if (restaurant.canonicalId !== sourceCanonicalId) {
      throw new CanonicalError(
        'restaurant does not belong to this canonical',
        'BAD_REQUEST',
      );
    }

    // 좌표는 snapshot json 에서 추출. source 별 키가 다름 (Naver: latitude/longitude,
    // DC: lat/lng). 둘 다 시도해 채워질 만한 쪽으로.
    let latitude: number | null = null;
    let longitude: number | null = null;
    try {
      const snap = JSON.parse(restaurant.snapshotJson) as {
        latitude?: number | null;
        longitude?: number | null;
        lat?: number | null;
        lng?: number | null;
      };
      latitude = snap.latitude ?? snap.lat ?? null;
      longitude = snap.longitude ?? snap.lng ?? null;
    } catch {
      // 스냅샷 파싱 실패는 무시 — 좌표 없는 canonical 도 유효.
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const newCanonical = await tx.canonicalRestaurant.create({
        data: {
          name: restaurant.name,
          primaryCategory: restaurant.category,
          latitude,
          longitude,
        },
        select: { id: true },
      });
      await tx.restaurant.update({
        where: { id: restaurantId },
        data: { canonicalId: newCanonical.id },
      });
      // 원본 canonical 에 남은 행 수. 0 이면 삭제.
      const remaining = await tx.restaurant.count({
        where: { canonicalId: sourceCanonicalId },
      });
      let deleted = false;
      if (remaining === 0) {
        await tx.canonicalRestaurant.delete({ where: { id: sourceCanonicalId } });
        deleted = true;
      }
      return { newCanonicalId: newCanonical.id, deleted };
    });

    const newSummary = await this.loadSummary(result.newCanonicalId);
    if (!newSummary) throw new CanonicalError('new canonical missing after split', 'CONFLICT');
    return {
      ok: true as const,
      newCanonical: newSummary,
      sourceCanonicalDeleted: result.deleted,
    };
  }

  // canonical 행 통째로 삭제. Restaurant.canonical FK 가 onDelete: Cascade 가
  // 아니라 부모를 먼저 지울 수 없으니, 트랜잭션 안에서 자식 Restaurant 들을 먼저
  // 지운 뒤 Canonical 을 지운다. Restaurant→VisitorReview/MenuCanonical 은 자체
  // Cascade 로 매달린 review/summary 가 함께 삭제되고, CanonicalMergeProposal 의
  // FK 도 Cascade 라 부모 삭제 시 자동 정리.
  async deleteCanonical(canonicalId: string): Promise<{
    deletedRestaurantCount: number;
    deletedReviewCount: number;
  }> {
    const row = await this.prisma.canonicalRestaurant.findUnique({
      where: { id: canonicalId },
      select: {
        id: true,
        restaurants: {
          select: {
            id: true,
            _count: { select: { visitorReviews: true } },
          },
        },
      },
    });
    if (!row) throw new CanonicalError('canonical not found', 'NOT_FOUND');
    const deletedRestaurantCount = row.restaurants.length;
    const deletedReviewCount = row.restaurants.reduce(
      (acc, r) => acc + r._count.visitorReviews,
      0,
    );
    await this.prisma.$transaction(async (tx) => {
      if (deletedRestaurantCount > 0) {
        await tx.restaurant.deleteMany({ where: { canonicalId } });
      }
      await tx.canonicalRestaurant.delete({ where: { id: canonicalId } });
    });
    return { deletedRestaurantCount, deletedReviewCount };
  }

  // list 응답 위쪽 알림 줄 (suggestion) 영구 닫기. 풀 후보 패널은 별개 — 어드민이
  // 직접 "병합" 버튼을 누르면 candidates API 가 다시 후보를 계산한다.
  async dismissSuggestion(canonicalId: string): Promise<void> {
    const row = await this.prisma.canonicalRestaurant.findUnique({
      where: { id: canonicalId },
      select: { id: true },
    });
    if (!row) throw new CanonicalError('canonical not found', 'NOT_FOUND');
    await this.prisma.canonicalRestaurant.update({
      where: { id: canonicalId },
      data: { suggestionDismissedAt: new Date() },
    });
  }
}
