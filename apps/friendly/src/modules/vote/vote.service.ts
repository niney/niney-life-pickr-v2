import { randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  VOTE_OPTIONS_MAX,
  type CreateVoteInputType,
  type MyVotesResultType,
  type SharedVoteSessionType,
  type SubmitBallotInputType,
  type VoteDecidedByType,
  type VoteSessionType,
} from '@repo/api-contract';
import { RestaurantService } from '../restaurant/restaurant.service.js';

// 라우트가 HTTP status 로 변환하는 도메인 에러(settlement 모듈과 동일 스타일).
// expired → 410, closed·full → 409, invalid_option → 400.
export class VoteError extends Error {
  constructor(
    public readonly code: 'not_found' | 'forbidden' | 'expired' | 'closed' | 'full' | 'invalid_option',
    message: string,
  ) {
    super(message);
    this.name = 'VoteError';
  }
}

// 토큰 TTL — 생성 시 즉시 발급되는 고정 7일. 만료 후 재발급/연장은 v1 스코프
// 밖(방장도 결과를 못 보게 됨을 수용 — 문서 명시).
const VOTE_SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 세션당 투표자 상한 — voterKey(클라 임의값)를 바꿔 가며 무인증으로 표를 무한히 쌓으면 조회·15초 폴링이 전량을
// 읽어 1만 명이면 GET 0.8초였다(perf-2 F-5). 새 voterKey 만 막고 기존 투표자의 수정·철회는 그대로 받는다.
// 동시 요청이면 몇 명 넘을 수 있는 소프트 상한이다(검사와 쓰기가 한 트랜잭션이 아니다).
export const VOTE_VOTERS_MAX = 100;
// 응답에 싣는 후보별 투표자 이름 수 — 상한과 같아 정상 세션은 전원이 그대로 보인다.
const VOTER_NAMES_PER_OPTION = VOTE_VOTERS_MAX;
// 집계용으로 읽는 표 행 상한 — 상한 안 세션의 최대치(100명 × 후보 8). 넘치면 상한 이전에 쌓인 세션이다.
const TALLY_ROWS_MAX = VOTE_VOTERS_MAX * VOTE_OPTIONS_MAX;

// 세션 메타 + 후보만 — 표(ballots)는 만료·마감 판정 뒤에 상한까지만 따로 읽는다.
const SESSION_SELECT = {
  id: true,
  userId: true,
  title: true,
  shareToken: true,
  shareExpiresAt: true,
  closedAt: true,
  winnerOptionId: true,
  decidedBy: true,
  createdAt: true,
  options: {
    orderBy: { orderIndex: 'asc' },
    select: { id: true, orderIndex: true, placeId: true, name: true, category: true, thumbnailUrl: true },
  },
} satisfies Prisma.VoteSessionSelect;

type SessionRow = Prisma.VoteSessionGetPayload<{ select: typeof SESSION_SELECT }>;

// 후보별 찬성 수·표시 이름(찬성 시각순, 앞쪽 VOTER_NAMES_PER_OPTION 명)과 참여자 수(distinct voterKey).
interface Tally {
  counts: Map<string, number>;
  voters: Map<string, string[]>;
  totalVoters: number;
}

const EMPTY_TALLY: Tally = { counts: new Map(), voters: new Map(), totalVoters: 0 };

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
    // 56bit 랜덤이 5연속 충돌하는 건 사실상 서버 이상 — 도메인 에러(4xx)가
    // 아니라 일반 Error 로 던져 에러 핸들러가 500 으로 처리하게 한다.
    throw new Error('공유 토큰 생성에 실패했습니다. 다시 시도해 주세요.');
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
      select: SESSION_SELECT,
    });
    // 갓 만든 방이라 표가 없다.
    return this.toOwnerView(row, EMPTY_TALLY);
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
    const row = await this.findSessionByToken(token);
    return this.toSharedView(row, await this.loadTally(row.id), viewerUserId);
  }

  // 투표 제출 — voterKey 의 찬성 집합 풀 리플레이스(재투표=수정, 빈 배열=철회).
  // 트랜잭션 delete+createMany 라 동시 재투표는 나중 것이 이긴다. 검증(만료·마감·후보)은
  // 세션 메타·후보만으로 — 표는 읽지 않는다.
  async submitBallot(
    token: string,
    input: SubmitBallotInputType,
    viewerUserId: string | null,
  ): Promise<SharedVoteSessionType> {
    const row = await this.findSessionByToken(token);
    if (row.closedAt) throw new VoteError('closed', '이미 마감된 투표입니다.');

    const optionIds = [...new Set(input.optionIds)];
    const valid = new Set(row.options.map((o) => o.id));
    for (const id of optionIds) {
      if (!valid.has(id)) {
        throw new VoteError('invalid_option', '이 투표의 후보가 아닙니다.');
      }
    }
    // 표를 새로 넣는 경우만 인원 상한을 본다(철회·빈 투표는 사람을 늘리지 않는다).
    if (optionIds.length > 0) await this.assertVoterRoom(row.id, input.voterKey);

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

    const fresh = await this.prisma.voteSession.findUnique({
      where: { id },
      select: SESSION_SELECT,
    });
    if (!fresh) throw new VoteError('not_found', '투표를 찾을 수 없습니다.');

    if (!fresh.winnerOptionId) {
      const decided = await this.decideWinner(fresh, await this.loadTally(id));
      await this.prisma.voteSession.updateMany({
        where: { id, winnerOptionId: null },
        data: { winnerOptionId: decided.winnerOptionId, decidedBy: decided.decidedBy },
      });
    }

    const final = await this.prisma.voteSession.findUnique({
      where: { id },
      select: SESSION_SELECT,
    });
    if (!final) throw new VoteError('not_found', '투표를 찾을 수 없습니다.');
    return this.toOwnerView(final, await this.loadTally(id));
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

  // 세션 메타 + 후보만 읽고 없음·만료를 판정한다 — 만료 세션은 표를 읽기 전에 410.
  private async findSessionByToken(token: string): Promise<SessionRow> {
    const row = await this.prisma.voteSession.findUnique({
      where: { shareToken: token },
      select: SESSION_SELECT,
    });
    if (!row) throw new VoteError('not_found', '투표를 찾을 수 없습니다.');
    if (row.shareExpiresAt.getTime() < Date.now()) {
      throw new VoteError('expired', '투표 링크가 만료되었습니다.');
    }
    return row;
  }

  // 새 투표자면 인원 상한 검사 — 둘 다 (sessionId, voterKey) 인덱스만 탄다.
  private async assertVoterRoom(sessionId: string, voterKey: string): Promise<void> {
    const mine = await this.prisma.voteBallot.findFirst({
      where: { sessionId, voterKey },
      select: { id: true },
    });
    if (mine) return;
    const [row] = await this.prisma.$queryRaw<Array<{ n: bigint | number }>>`
      SELECT COUNT(DISTINCT "voterKey") AS n FROM "vote_ballots" WHERE "sessionId" = ${sessionId}
    `;
    if (Number(row?.n ?? 0) >= VOTE_VOTERS_MAX) {
      throw new VoteError(
        'full',
        `참여 인원이 가득 찼어요(최대 ${VOTE_VOTERS_MAX}명). 이미 투표한 사람만 수정할 수 있어요.`,
      );
    }
  }

  // 집계 — 상한 안 세션은 표를 찬성 시각순으로 한 번에 읽어 센다(예전과 같은 결과). 상한 행을 넘으면
  // 상한 도입 전에 쌓인 세션이라, 수는 SQL 로 세고 이름은 앞쪽 행에서만 고른다(메모리·전송 상한).
  private async loadTally(sessionId: string): Promise<Tally> {
    const rows = await this.prisma.voteBallot.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: { optionId: true, voterKey: true, voterLabel: true },
      take: TALLY_ROWS_MAX + 1,
    });
    const voters = new Map<string, string[]>();
    for (const b of rows.slice(0, TALLY_ROWS_MAX)) {
      const names = voters.get(b.optionId);
      if (!names) voters.set(b.optionId, [b.voterLabel]);
      else if (names.length < VOTER_NAMES_PER_OPTION) names.push(b.voterLabel);
    }
    if (rows.length <= TALLY_ROWS_MAX) {
      const counts = new Map<string, number>();
      for (const b of rows) counts.set(b.optionId, (counts.get(b.optionId) ?? 0) + 1);
      return { counts, voters, totalVoters: new Set(rows.map((b) => b.voterKey)).size };
    }
    const [byOption, [distinct]] = await Promise.all([
      this.prisma.voteBallot.groupBy({ by: ['optionId'], where: { sessionId }, _count: { _all: true } }),
      this.prisma.$queryRaw<Array<{ n: bigint | number }>>`
        SELECT COUNT(DISTINCT "voterKey") AS n FROM "vote_ballots" WHERE "sessionId" = ${sessionId}
      `,
    ]);
    return {
      counts: new Map(byOption.map((g) => [g.optionId, g._count._all])),
      voters,
      totalVoters: Number(distinct?.n ?? 0),
    };
  }

  // 단독 최다 → votes. 동점(0표 전원 포함) → 동점 후보만 대상으로 smartPick
  // (분석 가중 랜덤), 전부 분석 없음(picked null)이면 균등 랜덤.
  private async decideWinner(
    row: SessionRow,
    tally: Tally,
  ): Promise<{ winnerOptionId: string; decidedBy: VoteDecidedByType }> {
    const counts = new Map<string, number>(row.options.map((o) => [o.id, tally.counts.get(o.id) ?? 0]));
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

  private toSharedView(row: SessionRow, tally: Tally, viewerUserId: string | null): SharedVoteSessionType {
    return {
      id: row.id,
      title: row.title,
      options: row.options.map((o) => ({
        id: o.id,
        orderIndex: o.orderIndex,
        placeId: o.placeId,
        name: o.name,
        category: o.category,
        thumbnailUrl: o.thumbnailUrl,
        count: tally.counts.get(o.id) ?? 0,
        voters: tally.voters.get(o.id) ?? [],
      })),
      totalVoters: tally.totalVoters,
      closedAt: row.closedAt?.toISOString() ?? null,
      winnerOptionId: row.winnerOptionId,
      decidedBy: (row.decidedBy as VoteDecidedByType | null) ?? null,
      expiresAt: row.shareExpiresAt.toISOString(),
      isOwner: viewerUserId !== null && viewerUserId === row.userId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toOwnerView(row: SessionRow, tally: Tally): VoteSessionType {
    return {
      ...this.toSharedView(row, tally, row.userId),
      token: row.shareToken,
    };
  }
}
