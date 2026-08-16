import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type {
  CreateVoteInputType,
  MyVotesResultType,
  SharedVoteSessionType,
  SubmitBallotInputType,
  VoteDecidedByType,
  VoteSessionType,
} from '@repo/api-contract';
import { RestaurantService } from '../restaurant/restaurant.service.js';

// 라우트가 HTTP status 로 변환하는 도메인 에러(settlement 모듈과 동일 스타일).
// expired → 410, closed → 409, invalid_option → 400.
export class VoteError extends Error {
  constructor(
    public readonly code: 'not_found' | 'forbidden' | 'expired' | 'closed' | 'invalid_option',
    message: string,
  ) {
    super(message);
    this.name = 'VoteError';
  }
}

// 토큰 TTL — 생성 시 즉시 발급되는 고정 7일. 만료 후 재발급/연장은 v1 스코프
// 밖(방장도 결과를 못 보게 됨을 수용 — 문서 명시).
const VOTE_SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const FULL_INCLUDE = {
  options: { orderBy: { orderIndex: 'asc' as const } },
  ballots: { orderBy: { createdAt: 'asc' as const } },
};

type FullRow = NonNullable<Awaited<ReturnType<PrismaClient['voteSession']['findUnique']>>> & {
  options: Array<{
    id: string;
    orderIndex: number;
    placeId: string;
    name: string;
    category: string | null;
    thumbnailUrl: string | null;
  }>;
  ballots: Array<{ optionId: string; voterKey: string; voterLabel: string }>;
};

// 그룹 투표 픽 — 세션 생성/조회/투표/마감. 공개 표면은 토큰 기반(정산 공유
// 미러), 마감 티브레이크는 기존 smart-pick(분석 가중 랜덤)을 재사용한다.
export class VoteService {
  private readonly restaurants: RestaurantService;

  constructor(private readonly prisma: PrismaClient) {
    // settlement.service 와 동일 패턴 — 동점 티브레이크에 smartPick 재사용.
    this.restaurants = new RestaurantService(prisma);
  }

  // 추측 불가능한 7바이트(56bit) base64url 토큰 = 10자(정산 공유와 동일 근거 —
  // 만료가 항상 걸려 노출 창이 닫힌다). unique 충돌 시 재생성.
  private async generateUniqueShareToken(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = randomBytes(7).toString('base64url');
      const clash = await this.prisma.voteSession.findUnique({
        where: { shareToken: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    throw new VoteError('not_found', '공유 토큰 생성에 실패했습니다. 다시 시도해 주세요.');
  }

  // 투표방 생성 — 토큰 즉시 발급(링크가 곧 투표방). 옵션은 nested create 라
  // 세션과 원자적으로 만들어진다.
  async create(userId: string, input: CreateVoteInputType): Promise<VoteSessionType> {
    const token = await this.generateUniqueShareToken();
    const row = await this.prisma.voteSession.create({
      data: {
        userId,
        title: input.title,
        shareToken: token,
        shareExpiresAt: new Date(Date.now() + VOTE_SHARE_TTL_MS),
        options: {
          create: input.options.map((o, i) => ({
            orderIndex: i,
            placeId: o.placeId,
            name: o.name,
            category: o.category,
            thumbnailUrl: o.thumbnailUrl,
          })),
        },
      },
      include: FULL_INCLUDE,
    });
    return this.toOwnerView(row as FullRow);
  }

  // 내가 만든 투표 — 링크(토큰) 복구 용도. 최근 20개.
  async listMine(userId: string): Promise<MyVotesResultType> {
    const rows = await this.prisma.voteSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { _count: { select: { options: true } } },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        token: r.shareToken,
        optionCount: r._count.options,
        closedAt: r.closedAt?.toISOString() ?? null,
        expiresAt: r.shareExpiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  // 공개 조회 — 토큰을 안다 = 접근 허용. viewerUserId 는 옵셔널 인증에서 온
  // 표시 플래그 입력(마감 버튼 노출용)이며 접근 제어가 아니다.
  async getSharedByToken(
    token: string,
    viewerUserId: string | null,
  ): Promise<SharedVoteSessionType> {
    const row = await this.findFullRowByToken(token);
    return this.toSharedView(row, viewerUserId);
  }

  // 투표 제출 — voterKey 의 찬성 집합 풀 리플레이스(재투표=수정, 빈 배열=철회).
  // 트랜잭션 delete+createMany 라 동시 재투표는 나중 것이 이긴다.
  async submitBallot(
    token: string,
    input: SubmitBallotInputType,
    viewerUserId: string | null,
  ): Promise<SharedVoteSessionType> {
    const row = await this.findFullRowByToken(token);
    if (row.closedAt) throw new VoteError('closed', '이미 마감된 투표입니다.');

    const optionIds = [...new Set(input.optionIds)];
    const valid = new Set(row.options.map((o) => o.id));
    for (const id of optionIds) {
      if (!valid.has(id)) {
        throw new VoteError('invalid_option', '이 투표의 후보가 아닙니다.');
      }
    }

    await this.prisma.$transaction([
      this.prisma.voteBallot.deleteMany({
        where: { sessionId: row.id, voterKey: input.voterKey },
      }),
      ...(optionIds.length > 0
        ? [
            this.prisma.voteBallot.createMany({
              data: optionIds.map((optionId) => ({
                sessionId: row.id,
                optionId,
                voterKey: input.voterKey,
                voterLabel: input.voterLabel,
              })),
            }),
          ]
        : []),
    ]);

    return this.getSharedByToken(token, viewerUserId);
  }

  // 마감 — 2단계 원자 클레임.
  //  ① closedAt 을 조건부 updateMany 로 선점 → 이후 도착하는 ballot 은 전부 409.
  //  ② 표가 더 못 들어오는 상태에서 집계·티브레이크(smartPick 이 내부에서
  //     this.prisma 를 직접 쓰므로 interactive $transaction 안에서 부르지 않는다).
  // winner 확정도 조건부 updateMany(winnerOptionId: null)라 이중 호출/크래시
  // 복구가 모두 멱등 — 이미 확정된 winner 는 절대 덮어쓰지 않는다.
  async close(userId: string, id: string): Promise<VoteSessionType> {
    const row = await this.prisma.voteSession.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!row) throw new VoteError('not_found', '투표를 찾을 수 없습니다.');
    if (row.userId !== userId) throw new VoteError('forbidden', '권한이 없습니다.');

    await this.prisma.voteSession.updateMany({
      where: { id, closedAt: null },
      data: { closedAt: new Date() },
    });

    const fresh = (await this.prisma.voteSession.findUnique({
      where: { id },
      include: FULL_INCLUDE,
    })) as FullRow | null;
    if (!fresh) throw new VoteError('not_found', '투표를 찾을 수 없습니다.');

    if (!fresh.winnerOptionId) {
      const decided = await this.decideWinner(fresh);
      await this.prisma.voteSession.updateMany({
        where: { id, winnerOptionId: null },
        data: { winnerOptionId: decided.winnerOptionId, decidedBy: decided.decidedBy },
      });
    }

    const final = (await this.prisma.voteSession.findUnique({
      where: { id },
      include: FULL_INCLUDE,
    })) as FullRow;
    return this.toOwnerView(final);
  }

  // OG 미리보기용 경량 메타 — 만료/없음이면 null(핸들러가 기본 OG 폴백).
  async getPreviewMeta(token: string): Promise<{ title: string; optionCount: number } | null> {
    const row = await this.prisma.voteSession.findUnique({
      where: { shareToken: token },
      select: { title: true, shareExpiresAt: true, _count: { select: { options: true } } },
    });
    if (!row) return null;
    if (row.shareExpiresAt.getTime() < Date.now()) return null;
    return { title: row.title, optionCount: row._count.options };
  }

  // ── 내부 헬퍼 ───────────────────────────────────────────────────────

  private async findFullRowByToken(token: string): Promise<FullRow> {
    const row = (await this.prisma.voteSession.findUnique({
      where: { shareToken: token },
      include: FULL_INCLUDE,
    })) as FullRow | null;
    if (!row) throw new VoteError('not_found', '투표를 찾을 수 없습니다.');
    if (row.shareExpiresAt.getTime() < Date.now()) {
      throw new VoteError('expired', '투표 링크가 만료되었습니다.');
    }
    return row;
  }

  // 단독 최다 → votes. 동점(0표 전원 포함) → 동점 후보만 대상으로 smartPick
  // (분석 가중 랜덤), 전부 분석 없음(picked null)이면 균등 랜덤.
  private async decideWinner(
    row: FullRow,
  ): Promise<{ winnerOptionId: string; decidedBy: VoteDecidedByType }> {
    const counts = new Map<string, number>(row.options.map((o) => [o.id, 0]));
    for (const b of row.ballots) {
      counts.set(b.optionId, (counts.get(b.optionId) ?? 0) + 1);
    }
    const max = Math.max(...counts.values());
    const tied = row.options.filter((o) => counts.get(o.id) === max);

    if (tied.length === 1) {
      return { winnerOptionId: tied[0]!.id, decidedBy: 'votes' };
    }

    const picked = await this.restaurants.smartPick({
      candidatePlaceIds: tied.map((t) => t.placeId),
      strategy: 'balanced',
    });
    if (picked.picked) {
      const match = tied.find((t) => t.placeId === picked.picked!.placeId);
      if (match) return { winnerOptionId: match.id, decidedBy: 'smart-pick' };
    }
    return {
      winnerOptionId: tied[Math.floor(Math.random() * tied.length)]!.id,
      decidedBy: 'random',
    };
  }

  private toSharedView(row: FullRow, viewerUserId: string | null): SharedVoteSessionType {
    const byOption = new Map<string, Array<{ voterLabel: string }>>();
    for (const b of row.ballots) {
      const arr = byOption.get(b.optionId);
      if (arr) arr.push(b);
      else byOption.set(b.optionId, [b]);
    }
    const totalVoters = new Set(row.ballots.map((b) => b.voterKey)).size;
    return {
      id: row.id,
      title: row.title,
      options: row.options.map((o) => {
        const ballots = byOption.get(o.id) ?? [];
        return {
          id: o.id,
          orderIndex: o.orderIndex,
          placeId: o.placeId,
          name: o.name,
          category: o.category,
          thumbnailUrl: o.thumbnailUrl,
          count: ballots.length,
          voters: ballots.map((b) => b.voterLabel),
        };
      }),
      totalVoters,
      closedAt: row.closedAt?.toISOString() ?? null,
      winnerOptionId: row.winnerOptionId,
      decidedBy: (row.decidedBy as VoteDecidedByType | null) ?? null,
      expiresAt: row.shareExpiresAt.toISOString(),
      isOwner: viewerUserId !== null && viewerUserId === row.userId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toOwnerView(row: FullRow): VoteSessionType {
    return {
      ...this.toSharedView(row, row.userId),
      token: row.shareToken,
    };
  }
}
