import { randomBytes } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import {
  Routes,
  calculateMultiRoundShares,
  effectiveExcludes,
  type CreateSettlementInputType,
  type ListSettlementsQueryType,
  type ListSettlementsResultType,
  type ReceiptItemCategoryType,
  type SettlementRoundInputType,
  type SettlementRoundType,
  type SettlementSessionType,
  type SettlementSourceType,
  type SharedSettlementSessionType,
  type UpdateSettlementInputType,
} from '@repo/api-contract';
import { RestaurantService } from '../restaurant/restaurant.service.js';
import { SettlementDraftService } from './settlement-draft.service.js';

// receiptImageToken 검증용 정규식 — settlement-extraction 의 IMAGE_TOKEN_PATTERN
// 과 동일. 모듈을 직접 import 하지 않고 패턴만 다시 둔다 (모듈 결합도 축소).
const IMAGE_TOKEN_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

// 단골(SettlementContact) 매칭 키. 같은 사용자 안에서만 유일성 의미가 있다.
// trim+lowercase 한 name 과 nickname 을 "|" 로 결합. 두 값 모두 빈 문자열인
// 케이스는 service 의 참여자 검증에서 거부되므로 "|" 단독 키는 만들어지지 않는다.
// backfill 스크립트도 동일한 정의를 사용해야 해서 export.
export const normalizeContactKey = (
  name: string | null,
  nickname: string | null,
): string => {
  const n = (name ?? '').trim().toLowerCase();
  const k = (nickname ?? '').trim().toLowerCase();
  return `${n}|${k}`;
};

export class SettlementError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'forbidden'
      | 'invalid_participant'
      | 'invalid_round'
      | 'invalid_receipt_token'
      | 'restaurant_not_found',
    message: string,
  ) {
    super(message);
    this.name = 'SettlementError';
  }
}

export interface SettlementServiceOptions {
  // 영수증 이미지가 실제로 디스크에 있는지 확인할 디렉터리. 테스트는 임시
  // 디렉터리를 주입.
  receiptStorageDir?: string;
}

interface RowSession {
  id: string;
  userId: string;
  restaurantPlaceId: string;
  restaurantName: string;
  grandTotal: number;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  rounds: Array<RowRound>;
  participants: Array<RowParticipant>;
}

interface RowRound {
  id: string;
  orderIndex: number;
  restaurantPlaceId: string;
  restaurantName: string;
  source: string;
  totalAmount: number | null;
  warning: string | null;
  receiptImageToken: string | null;
  itemsSubtotal: number;
  discountAmount: number | null;
  discountCategory: string | null;
  categoryAdjustments: string | null;
  items: Array<{
    id: string;
    name: string;
    unitPrice: number | null;
    quantity: number | null;
    amount: number;
    category: string;
    matchedMenuName: string | null;
    orderIndex: number;
  }>;
  attendees: Array<{
    id: string;
    participantId: string;
    attended: boolean;
    excludeAlcoholOverride: boolean | null;
    excludeNonAlcoholOverride: boolean | null;
    excludeSideOverride: boolean | null;
    shareAmount: number;
  }>;
}

interface RowParticipant {
  id: string;
  name: string | null;
  nickname: string | null;
  excludeAlcohol: boolean;
  excludeNonAlcohol: boolean;
  excludeSide: boolean;
  shareAmount: number;
  orderIndex: number;
  contactId: string | null;
}

export class SettlementService {
  private readonly receiptStorageDir: string;
  private readonly restaurants: RestaurantService;

  constructor(
    private readonly prisma: PrismaClient,
    opts: SettlementServiceOptions = {},
  ) {
    this.receiptStorageDir =
      opts.receiptStorageDir ?? join(process.cwd(), 'data', 'receipts');
    this.restaurants = new RestaurantService(prisma);
  }

  // 세션 생성 — 모든 round 의 분배를 서버가 계산해 결과를 저장. 영수증 토큰이
  // 들어오면 디스크 존재 확인 후 보존.
  async create(
    userId: string,
    input: CreateSettlementInputType,
  ): Promise<SettlementSessionType> {
    await this.validateInput(input);

    // 1차 식당 이름을 session 본체 snapshot 으로 박는다. round 마다도 별도로
    // 자기 식당 이름을 resolve 한다.
    const firstRound = input.rounds[0]!;
    const sessionRestaurantName = await this.resolveRestaurantName(
      firstRound.restaurantPlaceId,
    );
    const roundRestaurantNames: string[] = [];
    for (const r of input.rounds) {
      roundRestaurantNames.push(await this.resolveRestaurantName(r.restaurantPlaceId));
    }

    // 영수증 토큰 모두 검증.
    const validatedTokens: Array<string | null> = [];
    for (const r of input.rounds) {
      validatedTokens.push(await this.validateReceiptToken(r.receiptImageToken));
    }

    const calc = this.computeShares(input);

    const now = new Date();
    const createdId = await this.prisma.$transaction(async (tx) => {
      const session = await tx.settlementSession.create({
        data: {
          userId,
          restaurantPlaceId: firstRound.restaurantPlaceId,
          restaurantName: sessionRestaurantName,
          grandTotal: calc.grandTotal,
        },
      });

      // 마스터 participants 먼저 — round attendees 가 db id 로 참조 필요.
      // clientId → db id 매핑을 만들어 둔다.
      const clientIdToDbId = new Map<string, string>();
      for (let idx = 0; idx < input.participants.length; idx += 1) {
        const p = input.participants[idx]!;
        const name = p.name?.trim() || null;
        const nickname = p.nickname?.trim() || null;
        const normalizedKey = normalizeContactKey(name, nickname);

        // (userId, normalizedKey) 로 upsert — 같은 이름 직접 타이핑이든
        // 자동완성 선택이든 같은 row 로 합쳐진다. 클라이언트가 보낸
        // contactId 힌트는 신뢰하지 않는다(서버 정책 단일화).
        const contact = await tx.settlementContact.upsert({
          where: { userId_normalizedKey: { userId, normalizedKey } },
          create: {
            userId,
            name,
            nickname,
            normalizedKey,
            lastExcludeAlcohol: p.excludeAlcohol,
            lastExcludeNonAlcohol: p.excludeNonAlcohol,
            lastExcludeSide: p.excludeSide,
            useCount: 1,
            lastUsedAt: now,
          },
          update: {
            name,
            nickname,
            lastExcludeAlcohol: p.excludeAlcohol,
            lastExcludeNonAlcohol: p.excludeNonAlcohol,
            lastExcludeSide: p.excludeSide,
            useCount: { increment: 1 },
            lastUsedAt: now,
          },
        });

        const created = await tx.settlementParticipant.create({
          data: {
            sessionId: session.id,
            name,
            nickname,
            excludeAlcohol: p.excludeAlcohol,
            excludeNonAlcohol: p.excludeNonAlcohol,
            excludeSide: p.excludeSide,
            shareAmount: calc.perParticipant[idx] ?? 0,
            orderIndex: idx,
            contactId: contact.id,
          },
        });
        clientIdToDbId.set(p.clientId, created.id);
      }

      // round + items + attendees.
      for (let rIdx = 0; rIdx < input.rounds.length; rIdx += 1) {
        const r = input.rounds[rIdx]!;
        const round = await tx.settlementRound.create({
          data: {
            sessionId: session.id,
            orderIndex: rIdx,
            restaurantPlaceId: r.restaurantPlaceId,
            restaurantName: roundRestaurantNames[rIdx]!,
            source: r.source,
            totalAmount: r.totalAmount,
            warning: r.warning,
            receiptImageToken: validatedTokens[rIdx]!,
            itemsSubtotal: calc.perRound[rIdx]!.itemsSubtotal,
            discountAmount: r.discountAmount,
            discountCategory: r.discountCategory,
            categoryAdjustments: serializeCategoryAdjustments(
              r.categoryAdjustments ?? null,
              clientIdToDbId,
            ),
          },
        });

        await tx.settlementItem.createMany({
          data: r.items.map((it, idx) => ({
            roundId: round.id,
            name: it.name,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            amount: it.amount,
            category: it.category,
            matchedMenuName: it.matchedMenuName,
            orderIndex: idx,
          })),
        });

        // attendees: 모든 마스터 participant 에 대해 row 생성. 입력에 빠진
        // 참여자는 attended=false 로 채운다 — 차수별 참석은 round 의 attendees
        // 입력에 명시된 사람들만 attended=true.
        const attendeeMap = new Map(
          r.attendees.map((a) => [a.participantClientId, a]),
        );
        for (const p of input.participants) {
          const dbId = clientIdToDbId.get(p.clientId)!;
          const a = attendeeMap.get(p.clientId);
          const attended = a?.attended ?? false;
          const shareIdx = input.participants.findIndex(
            (pp) => pp.clientId === p.clientId,
          );
          await tx.settlementRoundParticipant.create({
            data: {
              roundId: round.id,
              participantId: dbId,
              attended,
              excludeAlcoholOverride: a?.excludeAlcoholOverride ?? null,
              excludeNonAlcoholOverride: a?.excludeNonAlcoholOverride ?? null,
              excludeSideOverride: a?.excludeSideOverride ?? null,
              shareAmount: attended ? (calc.perRound[rIdx]!.shareAmounts[shareIdx] ?? 0) : 0,
            },
          });
        }
      }

      // 자동 저장 draft 정리 — 클라이언트가 fromDraftId 를 넘기면 같은
      // 트랜잭션에서 함께 삭제한다. 본인 소유가 아니면 조용히 무시.
      if (input.fromDraftId) {
        await SettlementDraftService.deleteByIdInTxIfOwner(
          tx,
          userId,
          input.fromDraftId,
        );
      }

      return session.id;
    });

    const detail = await this.getById(userId, createdId);
    if (!detail) {
      throw new SettlementError('not_found', '생성 직후 세션을 다시 찾지 못했습니다.');
    }
    return detail;
  }

  async list(
    userId: string,
    query: ListSettlementsQueryType,
  ): Promise<ListSettlementsResultType> {
    const where: { userId: string; restaurantPlaceId?: string } = { userId };
    if (query.placeId) where.restaurantPlaceId = query.placeId;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.settlementSession.count({ where }),
      this.prisma.settlementSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.offset,
        take: query.limit,
        include: {
          _count: { select: { participants: true, rounds: true } },
          rounds: {
            orderBy: { orderIndex: 'asc' },
            select: {
              source: true,
              _count: { select: { items: true } },
            },
          },
        },
      }),
    ]);

    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        restaurantPlaceId: r.restaurantPlaceId,
        restaurantName: r.restaurantName,
        // 1차 source 가 summary 대표값.
        source: (r.rounds[0]?.source ?? 'MANUAL') as SettlementSourceType,
        grandTotal: r.grandTotal,
        roundCount: r._count.rounds,
        itemCount: r.rounds.reduce((sum, x) => sum + x._count.items, 0),
        participantCount: r._count.participants,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async getById(userId: string, id: string): Promise<SettlementSessionType | null> {
    const row = await this.findFullRow(id);
    if (!row) return null;
    if (row.userId !== userId) {
      // 외부에서 본인 외의 세션 id 를 추측해 호출해도 not_found 와 구분되는
      // forbidden 으로 응답해 적어도 존재 여부 누설은 피한다 — 라우트가
      // forbidden 도 404 와 같이 다루게 할 수도 있지만, 디버그 가독성 위해 분리.
      throw new SettlementError('forbidden', '권한이 없습니다.');
    }
    return this.rowToSession(row);
  }

  // 저장된 정산 전체 replace — 참여자 명단·차수 구성·각 차수의 items/attendees
  // 모두 교체. 부분 수정이 아니라 전체 입력 받고 트랜잭션으로 wipe + rebuild.
  async update(
    userId: string,
    id: string,
    input: UpdateSettlementInputType,
  ): Promise<SettlementSessionType> {
    const existing = await this.prisma.settlementSession.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        restaurantPlaceId: true,
        restaurantName: true,
        rounds: { select: { restaurantPlaceId: true, restaurantName: true } },
      },
    });
    if (!existing) throw new SettlementError('not_found', '세션을 찾을 수 없습니다.');
    if (existing.userId !== userId) throw new SettlementError('forbidden', '권한이 없습니다.');

    await this.validateInput(input);

    // 업데이트에서는 기존에 이미 가지고 있던 placeId 의 이름은 재사용 — 새
    // 추가된 placeId 만 RestaurantService 에서 fresh 조회. 식당이 나중에
    // 삭제되어도 기존 차수는 편집할 수 있어야 하고, 테스트에서 매번 식당을
    // 시드하지 않아도 update 가 통과한다.
    const knownNames = new Map<string, string>();
    knownNames.set(existing.restaurantPlaceId, existing.restaurantName);
    for (const r of existing.rounds) {
      knownNames.set(r.restaurantPlaceId, r.restaurantName);
    }
    const resolveCached = async (placeId: string): Promise<string> => {
      const cached = knownNames.get(placeId);
      if (cached) return cached;
      const fresh = await this.resolveRestaurantName(placeId);
      knownNames.set(placeId, fresh);
      return fresh;
    };

    const firstRound = input.rounds[0]!;
    const sessionRestaurantName = await resolveCached(firstRound.restaurantPlaceId);
    const roundRestaurantNames: string[] = [];
    for (const r of input.rounds) {
      roundRestaurantNames.push(await resolveCached(r.restaurantPlaceId));
    }
    const validatedTokens: Array<string | null> = [];
    for (const r of input.rounds) {
      validatedTokens.push(await this.validateReceiptToken(r.receiptImageToken));
    }

    const calc = this.computeShares(input);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // 자식 모두 wipe — cascade 이지만 명시적으로 한다. participant 까지 같이
      // 삭제하면 SettlementContact.useCount 가 다시 늘어나는 부작용은 있지만,
      // 이는 create 와 동일한 정책(매 수정 = 사용).
      await tx.settlementRound.deleteMany({ where: { sessionId: id } });
      await tx.settlementParticipant.deleteMany({ where: { sessionId: id } });

      // 마스터 participants 다시 만들기.
      const clientIdToDbId = new Map<string, string>();
      for (let idx = 0; idx < input.participants.length; idx += 1) {
        const p = input.participants[idx]!;
        const name = p.name?.trim() || null;
        const nickname = p.nickname?.trim() || null;
        const normalizedKey = normalizeContactKey(name, nickname);

        const contact = await tx.settlementContact.upsert({
          where: { userId_normalizedKey: { userId, normalizedKey } },
          create: {
            userId,
            name,
            nickname,
            normalizedKey,
            lastExcludeAlcohol: p.excludeAlcohol,
            lastExcludeNonAlcohol: p.excludeNonAlcohol,
            lastExcludeSide: p.excludeSide,
            useCount: 1,
            lastUsedAt: now,
          },
          update: {
            name,
            nickname,
            lastExcludeAlcohol: p.excludeAlcohol,
            lastExcludeNonAlcohol: p.excludeNonAlcohol,
            lastExcludeSide: p.excludeSide,
            useCount: { increment: 1 },
            lastUsedAt: now,
          },
        });

        const created = await tx.settlementParticipant.create({
          data: {
            sessionId: id,
            name,
            nickname,
            excludeAlcohol: p.excludeAlcohol,
            excludeNonAlcohol: p.excludeNonAlcohol,
            excludeSide: p.excludeSide,
            shareAmount: calc.perParticipant[idx] ?? 0,
            orderIndex: idx,
            contactId: contact.id,
          },
        });
        clientIdToDbId.set(p.clientId, created.id);
      }

      for (let rIdx = 0; rIdx < input.rounds.length; rIdx += 1) {
        const r = input.rounds[rIdx]!;
        const round = await tx.settlementRound.create({
          data: {
            sessionId: id,
            orderIndex: rIdx,
            restaurantPlaceId: r.restaurantPlaceId,
            restaurantName: roundRestaurantNames[rIdx]!,
            source: r.source,
            totalAmount: r.totalAmount,
            warning: r.warning,
            receiptImageToken: validatedTokens[rIdx]!,
            itemsSubtotal: calc.perRound[rIdx]!.itemsSubtotal,
            discountAmount: r.discountAmount,
            discountCategory: r.discountCategory,
            categoryAdjustments: serializeCategoryAdjustments(
              r.categoryAdjustments ?? null,
              clientIdToDbId,
            ),
          },
        });

        await tx.settlementItem.createMany({
          data: r.items.map((it, idx) => ({
            roundId: round.id,
            name: it.name,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            amount: it.amount,
            category: it.category,
            matchedMenuName: it.matchedMenuName,
            orderIndex: idx,
          })),
        });

        const attendeeMap = new Map(
          r.attendees.map((a) => [a.participantClientId, a]),
        );
        for (const p of input.participants) {
          const dbId = clientIdToDbId.get(p.clientId)!;
          const a = attendeeMap.get(p.clientId);
          const attended = a?.attended ?? false;
          const shareIdx = input.participants.findIndex(
            (pp) => pp.clientId === p.clientId,
          );
          await tx.settlementRoundParticipant.create({
            data: {
              roundId: round.id,
              participantId: dbId,
              attended,
              excludeAlcoholOverride: a?.excludeAlcoholOverride ?? null,
              excludeNonAlcoholOverride: a?.excludeNonAlcoholOverride ?? null,
              excludeSideOverride: a?.excludeSideOverride ?? null,
              shareAmount: attended ? (calc.perRound[rIdx]!.shareAmounts[shareIdx] ?? 0) : 0,
            },
          });
        }
      }

      await tx.settlementSession.update({
        where: { id },
        data: {
          restaurantPlaceId: firstRound.restaurantPlaceId,
          restaurantName: sessionRestaurantName,
          grandTotal: calc.grandTotal,
          editedAt: now,
        },
      });
    });

    const detail = await this.getById(userId, id);
    if (!detail) throw new SettlementError('not_found', '수정 직후 세션을 다시 찾지 못했습니다.');
    return detail;
  }

  async deleteById(userId: string, id: string): Promise<void> {
    const row = await this.prisma.settlementSession.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!row) throw new SettlementError('not_found', '세션을 찾을 수 없습니다.');
    if (row.userId !== userId) throw new SettlementError('forbidden', '권한이 없습니다.');
    await this.prisma.settlementSession.delete({ where: { id } });
  }

  // 공유 토큰 생성 — 이미 있으면 동일 토큰을 그대로 돌려준다(멱등). 회수 후
  // 재생성하면 새 토큰이 발급되므로 이전 링크는 자연 무효화.
  async createShare(userId: string, id: string): Promise<{
    token: string | null;
    shareUrl: string | null;
  }> {
    const row = await this.prisma.settlementSession.findUnique({
      where: { id },
      select: { id: true, userId: true, shareToken: true },
    });
    if (!row) throw new SettlementError('not_found', '세션을 찾을 수 없습니다.');
    if (row.userId !== userId) throw new SettlementError('forbidden', '권한이 없습니다.');

    let token = row.shareToken;
    if (!token) {
      // base64url 32바이트 = 43자. URL safe, padding 없음.
      token = randomBytes(32).toString('base64url');
      await this.prisma.settlementSession.update({
        where: { id },
        data: { shareToken: token },
      });
    }
    return { token, shareUrl: Routes.Settlement.shared(token) };
  }

  async revokeShare(userId: string, id: string): Promise<void> {
    const row = await this.prisma.settlementSession.findUnique({
      where: { id },
      select: { id: true, userId: true, shareToken: true },
    });
    if (!row) throw new SettlementError('not_found', '세션을 찾을 수 없습니다.');
    if (row.userId !== userId) throw new SettlementError('forbidden', '권한이 없습니다.');
    if (!row.shareToken) return; // 이미 비공개. 멱등 처리.
    await this.prisma.settlementSession.update({
      where: { id },
      data: { shareToken: null },
    });
  }

  // 공유 토큰으로 read-only 세션 조회. 토큰을 안다 = 접근 허용이므로 인증
  // 검사는 하지 않는다. 응답에서 userId/round.receiptPreviewUrl 은 제거.
  async getBySharedToken(token: string): Promise<SharedSettlementSessionType | null> {
    const row = await this.findFullRowByToken(token);
    if (!row) return null;
    const session = this.rowToSession(row);
    const { userId: _userId, rounds, ...rest } = session;
    return {
      ...rest,
      rounds: rounds.map(
        ({ receiptPreviewUrl: _r, receiptImageToken: _t, ...rr }) => rr,
      ),
    };
  }

  // ── 내부 헬퍼 ───────────────────────────────────────────────────────

  private async validateInput(input: CreateSettlementInputType): Promise<void> {
    // 참여자 검증.
    for (const p of input.participants) {
      const hasName = (p.name ?? '').trim().length > 0;
      const hasNickname = (p.nickname ?? '').trim().length > 0;
      if (!hasName && !hasNickname) {
        throw new SettlementError(
          'invalid_participant',
          '참여자는 이름 또는 닉네임 중 하나가 필요합니다.',
        );
      }
    }
    // clientId 중복 금지.
    const clientIds = new Set<string>();
    for (const p of input.participants) {
      if (clientIds.has(p.clientId)) {
        throw new SettlementError(
          'invalid_participant',
          '참여자 clientId 가 중복됩니다.',
        );
      }
      clientIds.add(p.clientId);
    }
    // round 별 attendees 가 참조하는 clientId 가 마스터에 있어야 한다.
    for (const r of input.rounds) {
      const attendedSet = new Set<string>();
      for (const a of r.attendees) {
        if (!clientIds.has(a.participantClientId)) {
          throw new SettlementError(
            'invalid_round',
            '참석자 참조가 마스터 참여자에 없습니다.',
          );
        }
        if (attendedSet.has(a.participantClientId)) {
          throw new SettlementError(
            'invalid_round',
            '같은 참여자가 한 차수에 여러 번 들어 있습니다.',
          );
        }
        attendedSet.add(a.participantClientId);
      }
      // 최소 1명은 attended:true 여야 분배가 의미 있다.
      if (!r.attendees.some((a) => a.attended)) {
        throw new SettlementError(
          'invalid_round',
          '차수에 참석한 사람이 한 명도 없습니다.',
        );
      }
    }
  }

  private async resolveRestaurantName(placeId: string): Promise<string> {
    const detail = await this.restaurants.getPublicDetail(placeId);
    if (!detail) {
      throw new SettlementError('restaurant_not_found', '식당을 찾을 수 없습니다.');
    }
    return detail.name;
  }

  private async validateReceiptToken(token: string | null): Promise<string | null> {
    if (!token) return null;
    if (!IMAGE_TOKEN_PATTERN.test(token)) {
      throw new SettlementError('invalid_receipt_token', '영수증 토큰이 올바르지 않습니다.');
    }
    const path = join(this.receiptStorageDir, `${token}.jpg`);
    try {
      await stat(path);
    } catch {
      throw new SettlementError(
        'invalid_receipt_token',
        '영수증 이미지를 찾을 수 없습니다.',
      );
    }
    return token;
  }

  // create/update 둘 다에서 share 계산을 같은 방식으로.
  private computeShares(input: CreateSettlementInputType) {
    return calculateMultiRoundShares({
      participantCount: input.participants.length,
      rounds: input.rounds.map((r) => this.buildRoundCalcInput(r, input)),
    });
  }

  private buildRoundCalcInput(
    round: SettlementRoundInputType,
    input: CreateSettlementInputType,
  ) {
    const masterByClientId = new Map(input.participants.map((p) => [p.clientId, p]));
    const clientIdToIndex = new Map(
      input.participants.map((p, i) => [p.clientId, i]),
    );
    // 입력 categoryAdjustments 의 leftoverParticipantClientId 를 마스터 인덱스로
    // 변환해 calculator 가 바로 쓸 수 있게.
    const adj = round.categoryAdjustments ?? null;
    const categoryAdjustments = adj
      ? Object.fromEntries(
          (Object.entries(adj) as [
            ReceiptItemCategoryType,
            { leftoverParticipantClientId: string; roundUnit: number | null } | null | undefined,
          ][])
            .filter(([, v]) => v != null)
            .map(([cat, v]) => [
              cat,
              {
                leftoverParticipantIndex:
                  clientIdToIndex.get(v!.leftoverParticipantClientId) ?? 0,
                roundUnit: v!.roundUnit,
              },
            ]),
        )
      : null;
    return {
      items: round.items.map((it) => ({ amount: it.amount, category: it.category })),
      attendees: round.attendees
        .filter((a) => a.attended)
        .map((a) => {
          const master = masterByClientId.get(a.participantClientId)!;
          const eff = effectiveExcludes(master, a);
          return {
            participantIndex: input.participants.findIndex(
              (p) => p.clientId === a.participantClientId,
            ),
            ...eff,
          };
        }),
      discount:
        round.discountAmount != null && round.discountCategory != null
          ? { amount: round.discountAmount, category: round.discountCategory }
          : null,
      categoryAdjustments,
    };
  }

  private async findFullRow(id: string): Promise<RowSession | null> {
    const row = await this.prisma.settlementSession.findUnique({
      where: { id },
      include: {
        rounds: {
          orderBy: { orderIndex: 'asc' },
          include: {
            items: { orderBy: { orderIndex: 'asc' } },
            attendees: true,
          },
        },
        participants: { orderBy: { orderIndex: 'asc' } },
      },
    });
    return row;
  }

  private async findFullRowByToken(token: string): Promise<RowSession | null> {
    const row = await this.prisma.settlementSession.findUnique({
      where: { shareToken: token },
      include: {
        rounds: {
          orderBy: { orderIndex: 'asc' },
          include: {
            items: { orderBy: { orderIndex: 'asc' } },
            attendees: true,
          },
        },
        participants: { orderBy: { orderIndex: 'asc' } },
      },
    });
    return row;
  }

  private rowToSession(row: RowSession): SettlementSessionType {
    return {
      id: row.id,
      userId: row.userId,
      restaurantPlaceId: row.restaurantPlaceId,
      restaurantName: row.restaurantName,
      grandTotal: row.grandTotal,
      rounds: row.rounds.map((r) => this.rowToRound(r)),
      participants: row.participants.map((p) => ({
        id: p.id,
        name: p.name,
        nickname: p.nickname,
        excludeAlcohol: p.excludeAlcohol,
        excludeNonAlcohol: p.excludeNonAlcohol,
        excludeSide: p.excludeSide,
        shareAmount: p.shareAmount,
        orderIndex: p.orderIndex,
        contactId: p.contactId,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    };
  }

  private rowToRound(row: RowRound): SettlementRoundType {
    return {
      id: row.id,
      orderIndex: row.orderIndex,
      restaurantPlaceId: row.restaurantPlaceId,
      restaurantName: row.restaurantName,
      source: row.source as SettlementSourceType,
      totalAmount: row.totalAmount,
      warning: row.warning,
      receiptPreviewUrl: row.receiptImageToken
        ? Routes.SettlementExtraction.preview(row.receiptImageToken)
        : null,
      receiptImageToken: row.receiptImageToken,
      itemsSubtotal: row.itemsSubtotal,
      discountAmount: row.discountAmount,
      discountCategory: row.discountCategory
        ? (row.discountCategory as ReceiptItemCategoryType)
        : null,
      categoryAdjustments: parseCategoryAdjustments(row.categoryAdjustments),
      items: row.items.map((it) => ({
        id: it.id,
        name: it.name,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        amount: it.amount,
        category: it.category as ReceiptItemCategoryType,
        matchedMenuName: it.matchedMenuName,
        orderIndex: it.orderIndex,
      })),
      attendees: row.attendees.map((a) => ({
        participantId: a.participantId,
        attended: a.attended,
        excludeAlcoholOverride: a.excludeAlcoholOverride,
        excludeNonAlcoholOverride: a.excludeNonAlcoholOverride,
        excludeSideOverride: a.excludeSideOverride,
        shareAmount: a.shareAmount,
      })),
    };
  }
}

// categoryAdjustments — 입력 clientId 를 db id 로 치환해 JSON 저장. 매칭 안
// 되는 leftoverParticipantClientId 의 카테고리는 그냥 빼버린다(= default 동작).
const serializeCategoryAdjustments = (
  adj: SettlementRoundInputType['categoryAdjustments'] | null,
  clientIdToDbId: Map<string, string>,
): string | null => {
  if (!adj) return null;
  const out: Record<string, { leftoverParticipantId: string; roundUnit: number | null }> = {};
  for (const [cat, v] of Object.entries(adj)) {
    if (!v) continue;
    const dbId = clientIdToDbId.get(v.leftoverParticipantClientId);
    if (!dbId) continue;
    out[cat] = { leftoverParticipantId: dbId, roundUnit: v.roundUnit };
  }
  return Object.keys(out).length === 0 ? null : JSON.stringify(out);
};

const parseCategoryAdjustments = (
  raw: string | null,
): SettlementRoundType['categoryAdjustments'] => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SettlementRoundType['categoryAdjustments'];
    return parsed;
  } catch {
    return null;
  }
};
