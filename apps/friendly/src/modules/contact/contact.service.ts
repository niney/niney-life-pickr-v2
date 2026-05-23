import type { PrismaClient } from '@prisma/client';
import type {
  ListContactsQueryType,
  ListContactsResultType,
  SettlementContactType,
  UpdateContactInputType,
} from '@repo/api-contract';
import { normalizeContactKey } from '../settlement/settlement.service.js';

export class ContactError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'forbidden'
      | 'conflict'
      | 'invalid_input',
    message: string,
  ) {
    super(message);
    this.name = 'ContactError';
  }
}

// 사용자별 단골 참여자 관리. /me/contacts 페이지(어드민 아님 — 일반 사용자)와
// SettlementNewPage 의 자동완성이 호출. 모든 메서드가 userId 를 받아 본인
// 데이터만 다루도록 강제한다.
export class ContactService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(
    userId: string,
    query: ListContactsQueryType,
  ): Promise<ListContactsResultType> {
    const q = query.q?.trim();
    // q 가 있으면 name 또는 nickname 에 부분일치. SQLite 의 LIKE 는 ASCII
    // 한정 case-insensitive 라 영문은 자연스럽고 한글은 case 자체가 없어
    // 의미 있는 차이가 없다 — Prisma 'contains' 그대로 사용.
    const where = q
      ? {
          userId,
          OR: [{ name: { contains: q } }, { nickname: { contains: q } }],
        }
      : { userId };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.settlementContact.count({ where }),
      this.prisma.settlementContact.findMany({
        where,
        orderBy: { lastUsedAt: 'desc' },
        take: query.take,
      }),
    ]);

    return { total, items: rows.map(rowToContact) };
  }

  // 이름/닉네임 수정. normalizedKey 가 다른 row 와 같아지면 409 (서비스 레벨
  // conflict) — UI 가 "이미 같은 단골이 있어요" 메시지 출력.
  async update(
    userId: string,
    id: string,
    input: UpdateContactInputType,
  ): Promise<SettlementContactType> {
    const name = (input.name ?? '').trim() || null;
    const nickname = (input.nickname ?? '').trim() || null;
    if (!name && !nickname) {
      throw new ContactError(
        'invalid_input',
        '이름 또는 닉네임 중 하나는 입력해야 합니다.',
      );
    }

    const row = await this.prisma.settlementContact.findUnique({
      where: { id },
      select: { id: true, userId: true, normalizedKey: true },
    });
    if (!row) throw new ContactError('not_found', '단골을 찾을 수 없습니다.');
    if (row.userId !== userId) {
      throw new ContactError('forbidden', '권한이 없습니다.');
    }

    const normalizedKey = normalizeContactKey(name, nickname);

    if (normalizedKey !== row.normalizedKey) {
      const dup = await this.prisma.settlementContact.findUnique({
        where: { userId_normalizedKey: { userId, normalizedKey } },
        select: { id: true },
      });
      if (dup && dup.id !== id) {
        throw new ContactError('conflict', '같은 이름·닉네임의 단골이 이미 있습니다.');
      }
    }

    const updated = await this.prisma.settlementContact.update({
      where: { id },
      data: { name, nickname, normalizedKey },
    });
    return rowToContact(updated);
  }

  async delete(userId: string, id: string): Promise<void> {
    const row = await this.prisma.settlementContact.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!row) throw new ContactError('not_found', '단골을 찾을 수 없습니다.');
    if (row.userId !== userId) {
      throw new ContactError('forbidden', '권한이 없습니다.');
    }
    // 과거 정산의 participant.contactId 는 SetNull 로 자연 해제(스키마).
    await this.prisma.settlementContact.delete({ where: { id } });
  }
}

const rowToContact = (row: {
  id: string;
  name: string | null;
  nickname: string | null;
  lastExcludeAlcohol: boolean;
  lastExcludeNonAlcohol: boolean;
  lastExcludeSide: boolean;
  useCount: number;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): SettlementContactType => ({
  id: row.id,
  name: row.name,
  nickname: row.nickname,
  lastExcludeAlcohol: row.lastExcludeAlcohol,
  lastExcludeNonAlcohol: row.lastExcludeNonAlcohol,
  lastExcludeSide: row.lastExcludeSide,
  useCount: row.useCount,
  lastUsedAt: row.lastUsedAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
