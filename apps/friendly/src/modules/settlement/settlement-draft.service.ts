import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  ListSettlementDraftsResultType,
  SettlementDraftType,
  UpsertSettlementDraftInputType,
} from '@repo/api-contract';

// 정산 입력의 서버 임시저장. 자동 저장(클라이언트 debounce)으로 들어와
// (userId, placeIdKey) 키로 upsert 된다. 식당 미지정 슬롯('/me/settlements/new')
// 은 placeIdKey='' sentinel 로 분리 — SQLite NULL unique 가 다중 NULL 을
// 허용하기 때문.
//
// payload 는 그대로 보관(검증/파싱 없음) — 클라이언트 store 진화에 유연하게.

export class SettlementDraftError extends Error {
  constructor(
    public readonly code: 'not_found' | 'forbidden',
    message: string,
  ) {
    super(message);
    this.name = 'SettlementDraftError';
  }
}

// 클라의 placeId(null|string) ↔ DB placeIdKey('' | string) 변환 helper.
export const placeIdToKey = (placeId: string | null): string => placeId ?? '';
const keyToPlaceId = (key: string): string | null => (key === '' ? null : key);

interface DraftRow {
  id: string;
  placeIdKey: string;
  placeNameHint: string | null;
  payload: string;
  createdAt: Date;
  updatedAt: Date;
}

const rowToDraft = (row: DraftRow): SettlementDraftType => ({
  id: row.id,
  placeId: keyToPlaceId(row.placeIdKey),
  placeNameHint: row.placeNameHint,
  // 저장은 문자열(JSON), 응답은 파싱된 객체. 파싱 실패는 드물지만(클라가
  // 깨진 JSON 을 보낼 일은 zod refine 으로 컷) 안전을 위해 null fallback.
  payload: safeParse(row.payload),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const safeParse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export class SettlementDraftService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string): Promise<ListSettlementDraftsResultType> {
    const rows = await this.prisma.settlementDraft.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return { items: rows.map(rowToDraft) };
  }

  async upsert(
    userId: string,
    input: UpsertSettlementDraftInputType,
  ): Promise<SettlementDraftType> {
    const placeIdKey = placeIdToKey(input.placeId);
    const payload = JSON.stringify(input.payload ?? null);
    const placeNameHint = input.placeNameHint?.trim() || null;
    const row = await this.prisma.settlementDraft.upsert({
      where: { userId_placeIdKey: { userId, placeIdKey } },
      create: { userId, placeIdKey, payload, placeNameHint },
      update: { payload, placeNameHint },
    });
    return rowToDraft(row);
  }

  async deleteById(userId: string, id: string): Promise<void> {
    const row = await this.prisma.settlementDraft.findUnique({ where: { id } });
    if (!row) throw new SettlementDraftError('not_found', '임시저장을 찾을 수 없습니다.');
    if (row.userId !== userId) {
      throw new SettlementDraftError('forbidden', '권한이 없습니다.');
    }
    await this.prisma.settlementDraft.delete({ where: { id } });
  }

  // 완성된 정산 저장 성공 시 호출 — id 가 본인 소유면 트랜잭션 안에서 삭제.
  // id 가 없거나 잘못돼도 throw 하지 않는다 (저장 자체는 성공해야 하므로).
  static async deleteByIdInTxIfOwner(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ): Promise<void> {
    const res = await tx.settlementDraft.deleteMany({
      where: { id, userId },
    });
    void res;
  }
}
