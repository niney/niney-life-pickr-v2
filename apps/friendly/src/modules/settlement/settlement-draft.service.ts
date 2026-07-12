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
    public readonly code: 'not_found' | 'forbidden' | 'too_many',
    message: string,
  ) {
    super(message);
    this.name = 'SettlementDraftError';
  }
}

// 사용자당 임시저장 행수 상한 — payload 는 이미 200KB 로 캡되지만, 임의 placeId
// 마다 새 행을 무한 생성하는 저장 남용을 막는다. 진행 중 정산이 50개를 넘는 일은
// 정상 사용에 없다.
const MAX_DRAFTS_PER_USER = 50;

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
    // 신규 슬롯(기존 행 없음)이면 사용자당 행수 상한을 확인한다. debounce 자동저장
    // 특성상 동일 사용자의 동시 생성 경합은 사실상 없어 pre-check 로 충분(소프트 캡).
    const existing = await this.prisma.settlementDraft.findUnique({
      where: { userId_placeIdKey: { userId, placeIdKey } },
      select: { id: true },
    });
    if (!existing) {
      const count = await this.prisma.settlementDraft.count({ where: { userId } });
      if (count >= MAX_DRAFTS_PER_USER) {
        throw new SettlementDraftError(
          'too_many',
          `임시저장은 최대 ${MAX_DRAFTS_PER_USER}개까지입니다. 기존 임시저장을 정리해 주세요.`,
        );
      }
    }
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
