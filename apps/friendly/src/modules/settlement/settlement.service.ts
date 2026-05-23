import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import {
  Routes,
  type CreateSettlementInputType,
  type ListSettlementsQueryType,
  type ListSettlementsResultType,
  type ReceiptItemCategoryType,
  type SettlementSessionType,
  type SettlementSourceType,
} from '@repo/api-contract';
import { calculateShares } from './settlement.calculator.js';

// receiptImageToken 검증용 정규식 — settlement-extraction 의 IMAGE_TOKEN_PATTERN
// 과 동일. 모듈을 직접 import 하지 않고 패턴만 다시 둔다 (모듈 결합도 축소).
const IMAGE_TOKEN_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export class SettlementError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'forbidden'
      | 'invalid_participant'
      | 'invalid_receipt_token',
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

export class SettlementService {
  private readonly receiptStorageDir: string;

  constructor(
    private readonly prisma: PrismaClient,
    opts: SettlementServiceOptions = {},
  ) {
    this.receiptStorageDir =
      opts.receiptStorageDir ?? join(process.cwd(), 'data', 'receipts');
  }

  // 세션 생성 — 분배 계산은 서버가 계산하고 결과를 그대로 저장한다.
  // 영수증 토큰이 들어오면 디스크 존재 확인 후 보존.
  async create(
    userId: string,
    input: CreateSettlementInputType,
    restaurantName: string,
  ): Promise<SettlementSessionType> {
    // 참여자 검증 — name 또는 nickname 중 하나는 trim 후 비어있지 않아야 한다.
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

    let receiptImageToken: string | null = null;
    if (input.receiptImageToken) {
      if (!IMAGE_TOKEN_PATTERN.test(input.receiptImageToken)) {
        throw new SettlementError('invalid_receipt_token', '영수증 토큰이 올바르지 않습니다.');
      }
      const path = join(this.receiptStorageDir, `${input.receiptImageToken}.jpg`);
      try {
        await stat(path);
        receiptImageToken = input.receiptImageToken;
      } catch {
        throw new SettlementError(
          'invalid_receipt_token',
          '영수증 이미지를 찾을 수 없습니다.',
        );
      }
    }

    const calc = calculateShares({
      items: input.items.map((it) => ({ amount: it.amount, category: it.category })),
      participants: input.participants.map((p) => ({
        excludeAlcohol: p.excludeAlcohol,
        excludeNonAlcohol: p.excludeNonAlcohol,
        excludeSide: p.excludeSide,
      })),
    });

    // SettlementSession + 자식 행을 한 transaction 으로 생성.
    const created = await this.prisma.$transaction(async (tx) => {
      const session = await tx.settlementSession.create({
        data: {
          userId,
          restaurantPlaceId: input.restaurantPlaceId,
          restaurantName,
          source: input.source,
          totalAmount: input.totalAmount,
          warning: input.warning,
          receiptImageToken,
          itemsSubtotal: calc.itemsSubtotal,
        },
      });

      await tx.settlementItem.createMany({
        data: input.items.map((it, idx) => ({
          sessionId: session.id,
          name: it.name,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
          amount: it.amount,
          category: it.category,
          matchedMenuName: it.matchedMenuName,
          orderIndex: idx,
        })),
      });

      await tx.settlementParticipant.createMany({
        data: input.participants.map((p, idx) => ({
          sessionId: session.id,
          name: p.name?.trim() || null,
          nickname: p.nickname?.trim() || null,
          excludeAlcohol: p.excludeAlcohol,
          excludeNonAlcohol: p.excludeNonAlcohol,
          excludeSide: p.excludeSide,
          shareAmount: calc.shareAmounts[idx] ?? 0,
          orderIndex: idx,
        })),
      });

      return session.id;
    });

    const detail = await this.getById(userId, created);
    if (!detail) {
      // 방금 만든 행이 사라지는 일은 없지만 타입 안전.
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
          _count: { select: { items: true, participants: true } },
        },
      }),
    ]);

    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        restaurantPlaceId: r.restaurantPlaceId,
        restaurantName: r.restaurantName,
        source: r.source as SettlementSourceType,
        totalAmount: r.totalAmount,
        itemsSubtotal: r.itemsSubtotal,
        itemCount: r._count.items,
        participantCount: r._count.participants,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async getById(userId: string, id: string): Promise<SettlementSessionType | null> {
    const row = await this.prisma.settlementSession.findUnique({
      where: { id },
      include: {
        items: { orderBy: { orderIndex: 'asc' } },
        participants: { orderBy: { orderIndex: 'asc' } },
      },
    });
    if (!row) return null;
    if (row.userId !== userId) {
      // 외부에서 본인 외의 세션 id 를 추측해 호출해도 not_found 와 구분되는
      // forbidden 으로 응답해 적어도 존재 여부 누설은 피한다 — 라우트가
      // forbidden 도 404 와 같이 다루게 할 수도 있지만, 디버그 가독성 위해 분리.
      throw new SettlementError('forbidden', '권한이 없습니다.');
    }

    return this.rowToSession(row);
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

  private rowToSession(row: {
    id: string;
    userId: string;
    restaurantPlaceId: string;
    restaurantName: string;
    source: string;
    totalAmount: number | null;
    warning: string | null;
    receiptImageToken: string | null;
    itemsSubtotal: number;
    createdAt: Date;
    updatedAt: Date;
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
    participants: Array<{
      id: string;
      name: string | null;
      nickname: string | null;
      excludeAlcohol: boolean;
      excludeNonAlcohol: boolean;
      excludeSide: boolean;
      shareAmount: number;
      orderIndex: number;
    }>;
  }): SettlementSessionType {
    return {
      id: row.id,
      userId: row.userId,
      restaurantPlaceId: row.restaurantPlaceId,
      restaurantName: row.restaurantName,
      source: row.source as SettlementSourceType,
      totalAmount: row.totalAmount,
      warning: row.warning,
      receiptPreviewUrl: row.receiptImageToken
        ? Routes.SettlementExtraction.preview(row.receiptImageToken)
        : null,
      itemsSubtotal: row.itemsSubtotal,
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
      participants: row.participants.map((p) => ({
        id: p.id,
        name: p.name,
        nickname: p.nickname,
        excludeAlcohol: p.excludeAlcohol,
        excludeNonAlcohol: p.excludeNonAlcohol,
        excludeSide: p.excludeSide,
        shareAmount: p.shareAmount,
        orderIndex: p.orderIndex,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
