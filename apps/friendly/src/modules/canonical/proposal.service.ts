import type { PrismaClient } from '@prisma/client';
import type {
  CanonicalProposalAcceptResultType,
  CanonicalProposalItemType,
  CanonicalProposalListResultType,
  CanonicalProposalRejectResultType,
  CanonicalProposalRunResultType,
  CanonicalSummaryType,
} from '@repo/api-contract';
import { isCandidate, scoreMatch } from '../../lib/matching.js';
import { CanonicalError, CanonicalService } from './canonical.service.js';

// 좌표 prefilter 마진 — CanonicalService 와 동일 정책. 위도 1° ≈ 111km 기준
// 500m 매칭 임계의 1.5배 박스.
const COORD_BOX_DELTA = 0.007;

// 양방향 쌍을 정규화 — 항상 작은 id 가 A, 큰 id 가 B. cuid 사전순.
const normalizePair = (x: string, y: string): [string, string] =>
  x < y ? [x, y] : [y, x];

// 자동 매칭 큐. 임계 통과한 cross-source 쌍을 큐에 적재하고 어드민이 검토/수락/
// 거절. 거절된 쌍은 같은 두 canonical 이 살아있는 동안 다시 큐에 들어오지 않는다.
export class ProposalService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly canonical: CanonicalService,
  ) {}

  // 단일 canonical 에 대한 후보 계산 → 큐 적재. 등록 후크가 호출. idempotent.
  // 동일 쌍이 이미 open/rejected 면 skip — 어드민 결정 보존.
  // accepted/superseded 인 과거 쌍이 있으면 새 open 으로 재활성화 (드물지만 머지
  // 후 split 으로 두 가게가 다시 분리됐을 때 등).
  async generateForCanonical(canonicalId: string): Promise<number> {
    const target = await this.prisma.canonicalRestaurant.findUnique({
      where: { id: canonicalId },
      include: { restaurants: { select: { source: true } } },
    });
    if (!target) return 0;
    const targetSources = new Set(target.restaurants.map((r) => r.source));

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
      include: { restaurants: { select: { source: true } } },
      take: 500,
    });

    let created = 0;
    for (const row of rows) {
      const hasNewSource = row.restaurants.some((r) => !targetSources.has(r.source));
      if (!hasNewSource) continue;
      const s = scoreMatch(
        { name: target.name, latitude: target.latitude, longitude: target.longitude },
        { name: row.name, latitude: row.latitude, longitude: row.longitude },
      );
      if (!isCandidate(s)) continue;

      const [a, b] = normalizePair(canonicalId, row.id);
      const existing = await this.prisma.canonicalMergeProposal.findUnique({
        where: { canonicalAId_canonicalBId: { canonicalAId: a, canonicalBId: b } },
      });
      if (existing && (existing.status === 'open' || existing.status === 'rejected')) {
        continue;
      }
      if (existing) {
        await this.prisma.canonicalMergeProposal.update({
          where: { id: existing.id },
          data: {
            score: s.score,
            nameScore: s.nameScore,
            distanceM: s.distanceM,
            status: 'open',
            createdAt: new Date(),
            resolvedAt: null,
          },
        });
        created += 1;
      } else {
        await this.prisma.canonicalMergeProposal.create({
          data: {
            canonicalAId: a,
            canonicalBId: b,
            score: s.score,
            nameScore: s.nameScore,
            distanceM: s.distanceM,
          },
        });
        created += 1;
      }
    }
    return created;
  }

  // 전수 재계산. 어드민 "전체 다시 돌리기" 버튼이 호출. 모든 canonical 을 한 번에
  // 로드 후 O(N²) 페어 매칭 (어드민 식당 < 1k 기준 50만 쌍 ≈ 수십 ms).
  // 이미 open/rejected 인 쌍은 skip — 어드민 결정 보존.
  async generateAll(): Promise<CanonicalProposalRunResultType> {
    const rows = await this.prisma.canonicalRestaurant.findMany({
      include: { restaurants: { select: { source: true } } },
    });
    if (rows.length < 2) return { created: 0 };

    const existing = await this.prisma.canonicalMergeProposal.findMany({
      where: { status: { in: ['open', 'rejected'] } },
      select: { canonicalAId: true, canonicalBId: true },
    });
    const existingKeys = new Set(existing.map((e) => `${e.canonicalAId}|${e.canonicalBId}`));

    interface Shape {
      id: string;
      name: string;
      latitude: number | null;
      longitude: number | null;
      sourceSet: Set<string>;
    }
    const shapes: Shape[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      sourceSet: new Set(r.restaurants.map((rr) => rr.source)),
    }));

    let created = 0;
    for (let i = 0; i < shapes.length; i += 1) {
      const a = shapes[i]!;
      for (let j = i + 1; j < shapes.length; j += 1) {
        const b = shapes[j]!;
        let cross = false;
        for (const s of b.sourceSet) {
          if (!a.sourceSet.has(s)) {
            cross = true;
            break;
          }
        }
        if (!cross) {
          for (const s of a.sourceSet) {
            if (!b.sourceSet.has(s)) {
              cross = true;
              break;
            }
          }
        }
        if (!cross) continue;
        if (
          a.latitude !== null &&
          a.longitude !== null &&
          b.latitude !== null &&
          b.longitude !== null
        ) {
          if (
            Math.abs(a.latitude - b.latitude) > COORD_BOX_DELTA ||
            Math.abs(a.longitude - b.longitude) > COORD_BOX_DELTA
          ) {
            continue;
          }
        }
        const score = scoreMatch(
          { name: a.name, latitude: a.latitude, longitude: a.longitude },
          { name: b.name, latitude: b.latitude, longitude: b.longitude },
        );
        if (!isCandidate(score)) continue;

        const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
        const key = `${low}|${high}`;
        if (existingKeys.has(key)) continue;

        await this.prisma.canonicalMergeProposal.upsert({
          where: { canonicalAId_canonicalBId: { canonicalAId: low, canonicalBId: high } },
          create: {
            canonicalAId: low,
            canonicalBId: high,
            score: score.score,
            nameScore: score.nameScore,
            distanceM: score.distanceM,
          },
          update: {
            score: score.score,
            nameScore: score.nameScore,
            distanceM: score.distanceM,
            status: 'open',
            createdAt: new Date(),
            resolvedAt: null,
          },
        });
        existingKeys.add(key);
        created += 1;
      }
    }
    return { created };
  }

  async list(): Promise<CanonicalProposalListResultType> {
    const rows = await this.prisma.canonicalMergeProposal.findMany({
      where: { status: 'open' },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      include: {
        canonicalA: { include: { restaurants: this.restaurantSelect() } },
        canonicalB: { include: { restaurants: this.restaurantSelect() } },
      },
    });
    return {
      items: rows.map((r): CanonicalProposalItemType => ({
        id: r.id,
        canonicalA: this.toSummary(r.canonicalA),
        canonicalB: this.toSummary(r.canonicalB),
        score: r.score,
        nameScore: r.nameScore,
        distanceM: r.distanceM,
        status: r.status as CanonicalProposalItemType['status'],
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  // 수락 — 두 canonical 을 통합. keepSide 가 살아남는 쪽.
  async accept(
    proposalId: string,
    keepSide: 'A' | 'B',
  ): Promise<CanonicalProposalAcceptResultType> {
    const p = await this.prisma.canonicalMergeProposal.findUnique({
      where: { id: proposalId },
    });
    if (!p) throw new CanonicalError('proposal not found', 'NOT_FOUND');
    if (p.status !== 'open') throw new CanonicalError('proposal is not open', 'CONFLICT');

    const targetId = keepSide === 'A' ? p.canonicalAId : p.canonicalBId;
    const sourceId = keepSide === 'A' ? p.canonicalBId : p.canonicalAId;
    const merge = await this.canonical.merge(sourceId, targetId);

    // FK onDelete: Cascade 로 source 가 사라지면 그 source 가 끼인 다른 open
    // proposal 들도 자동 삭제됨. 단, 우리가 방금 처리한 proposal 행도 같이
    // 사라지므로 status 갱신은 이미 의미 없음 — 그냥 skip.
    return { ok: true as const, merge };
  }

  async reject(proposalId: string): Promise<CanonicalProposalRejectResultType> {
    const p = await this.prisma.canonicalMergeProposal.findUnique({
      where: { id: proposalId },
    });
    if (!p) throw new CanonicalError('proposal not found', 'NOT_FOUND');
    if (p.status !== 'open') throw new CanonicalError('proposal is not open', 'CONFLICT');
    await this.prisma.canonicalMergeProposal.update({
      where: { id: proposalId },
      data: { status: 'rejected', resolvedAt: new Date() },
    });
    return { ok: true as const };
  }

  private restaurantSelect() {
    return {
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
    } as const;
  }

  private toSummary(c: {
    id: string;
    name: string;
    primaryCategory: string | null;
    latitude: number | null;
    longitude: number | null;
    restaurants: Array<{
      id: string;
      source: string;
      sourceId: string;
      placeId: string | null;
      name: string;
      category: string | null;
      rating: number | null;
      reviewCount: number | null;
    }>;
  }): CanonicalSummaryType {
    return {
      id: c.id,
      name: c.name,
      primaryCategory: c.primaryCategory,
      latitude: c.latitude,
      longitude: c.longitude,
      sources: c.restaurants.map((r) => ({
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
}
