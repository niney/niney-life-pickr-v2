import { randomBytes } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import {
  Routes,
  type CreateSettlementInputType,
  type ListSettlementsQueryType,
  type ListSettlementsResultType,
  type ReceiptItemCategoryType,
  type SettlementShareType,
  type SettlementSessionType,
  type SettlementSourceType,
  type SharedSettlementSessionType,
  type UpdateSettlementParticipantsInputType,
  calculateShares,
} from '@repo/api-contract';

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

    // SettlementSession + 자식 행을 한 transaction 으로 생성. 참여자는 단골
    // upsert 와 함께 contactId 를 채워야 해서 createMany 가 아니라 루프.
    const now = new Date();
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

      for (let idx = 0; idx < input.participants.length; idx++) {
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
          // 표시 이름은 마지막 입력으로 덮어쓴다 — /me/contacts 에서 수정해도
          // 다음 정산에서 다시 사용자가 입력한 표기로 돌아간다. 의도된 동작.
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

        await tx.settlementParticipant.create({
          data: {
            sessionId: session.id,
            name,
            nickname,
            excludeAlcohol: p.excludeAlcohol,
            excludeNonAlcohol: p.excludeNonAlcohol,
            excludeSide: p.excludeSide,
            shareAmount: calc.shareAmounts[idx] ?? 0,
            orderIndex: idx,
            contactId: contact.id,
          },
        });
      }

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

  // 저장 후 참여자/옵션 수정. items 는 불변 — 서버가 보존된 items 를 다시
  // 사용해 calculateShares 로 재계산. participants 는 전부 교체(삭제 후 재삽입)
  // 방식 — orderIndex 정합성을 단순히 보장. 단골(contact) 은 normalizedKey
  // 기준 upsert + useCount/lastUsedAt 갱신은 create 와 동일.
  async updateParticipants(
    userId: string,
    id: string,
    input: UpdateSettlementParticipantsInputType,
  ): Promise<SettlementSessionType> {
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

    const existing = await this.prisma.settlementSession.findUnique({
      where: { id },
      include: { items: { select: { amount: true, category: true } } },
    });
    if (!existing) throw new SettlementError('not_found', '세션을 찾을 수 없습니다.');
    if (existing.userId !== userId) throw new SettlementError('forbidden', '권한이 없습니다.');

    const calc = calculateShares({
      items: existing.items.map((it) => ({
        amount: it.amount,
        category: it.category as ReceiptItemCategoryType,
      })),
      participants: input.participants.map((p) => ({
        excludeAlcohol: p.excludeAlcohol,
        excludeNonAlcohol: p.excludeNonAlcohol,
        excludeSide: p.excludeSide,
      })),
    });

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.settlementParticipant.deleteMany({ where: { sessionId: id } });
      for (let idx = 0; idx < input.participants.length; idx++) {
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

        await tx.settlementParticipant.create({
          data: {
            sessionId: id,
            name,
            nickname,
            excludeAlcohol: p.excludeAlcohol,
            excludeNonAlcohol: p.excludeNonAlcohol,
            excludeSide: p.excludeSide,
            shareAmount: calc.shareAmounts[idx] ?? 0,
            orderIndex: idx,
            contactId: contact.id,
          },
        });
      }

      await tx.settlementSession.update({
        where: { id },
        data: { editedAt: now },
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
  async createShare(userId: string, id: string): Promise<SettlementShareType> {
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
  // 검사는 하지 않는다. 응답에서 userId/receiptPreviewUrl 은 제거.
  async getBySharedToken(token: string): Promise<SharedSettlementSessionType | null> {
    const row = await this.prisma.settlementSession.findUnique({
      where: { shareToken: token },
      include: {
        items: { orderBy: { orderIndex: 'asc' } },
        participants: { orderBy: { orderIndex: 'asc' } },
      },
    });
    if (!row) return null;
    const session = this.rowToSession(row);
    // userId, receiptPreviewUrl 둘 다 제거. 영수증 사진은 토큰 받은 사람에게도
    // 공개하지 않는다(개인정보 우려).
    const { userId: _userId, receiptPreviewUrl: _preview, ...shared } = session;
    return shared;
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
    editedAt: Date | null;
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
      contactId: string | null;
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
        contactId: p.contactId,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    };
  }
}
