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
  type ShareOgImageType,
  type ShareTtlType,
  type SharedSettlementSessionType,
  type UpdateSettlementInputType,
} from '@repo/api-contract';
import { RestaurantService } from '../restaurant/restaurant.service.js';
import { ALLOWED_HOSTS } from '../media/media.route.js';
import { SettlementDraftService } from './settlement-draft.service.js';

// thumbnail 프록시로 띄울 수 있는 이미지인가(허용 호스트인가). 공유 OG 이미지를
// 식당 사진으로 쓸 때, 프록시가 거부할 호스트는 애초에 후보에서 뺀다.
const isThumbnailProxyable = (url: string): boolean => {
  try {
    return ALLOWED_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

// 토큰 문자열 → 결정적 정수 시드. 같은 공유 링크는 항상 같은 식당 사진을 고르게
// 해 카카오 OG 캐시와 일관되게 한다(매 크롤마다 바뀌지 않음).
const seedFromToken = (token: string): number => {
  let h = 0;
  for (let i = 0; i < token.length; i += 1) {
    h = (h * 31 + token.charCodeAt(i)) >>> 0;
  }
  return h;
};

// 공유 OG 미리보기 메타 캐시 — 카카오/슬랙 OG 크롤러가 같은 링크를 짧은 시간에
// 여러 번 펼치므로 (token, origin) 단위로 결과를 짧게 캐시한다. owner 가 share 를
// 갱신/회수하면 해당 token 엔트리를 무효화. 단일 인스턴스 전제(CLAUDE.md)라
// in-memory Map 으로 충분 — Redis 불필요. 성공(non-null) 결과만 캐시한다.
interface SharePreviewMeta {
  restaurantName: string;
  grandTotal: number;
  participantCount: number;
  ogImageUrl: string | null;
}
const SHARE_PREVIEW_CACHE_TTL_MS = 5 * 60_000;
const sharePreviewCache = new Map<string, { value: SharePreviewMeta; expiresAt: number }>();
const sharePreviewCacheKey = (token: string, origin: string): string =>
  `${token} ${origin}`;
// owner 의 share 갱신/회수 시 해당 토큰의 모든 origin 변형 엔트리를 제거.
const invalidateSharePreview = (token: string): void => {
  const prefix = `${token} `;
  for (const key of sharePreviewCache.keys()) {
    if (key.startsWith(prefix)) sharePreviewCache.delete(key);
  }
};

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
      | 'restaurant_not_found'
      | 'expired',
    message: string,
  ) {
    super(message);
    this.name = 'SettlementError';
  }
}

// 공유 ttl 프리셋 → 밀리초. 무제한은 없다 — 모든 링크가 최대 30일 내 만료된다.
const SHARE_TTL_MS: Record<ShareTtlType, number> = {
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

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
  // 만료 검사용 — findFullRowByToken 의 include 결과에 함께 실려 온다.
  shareExpiresAt: Date | null;
  // 공유 미리보기 이미지 선택('restaurant'|'table'|null). include 로 함께 온다.
  shareOgImage: string | null;
  // owner 가 갤러리에서 고른 식당 사진 원본 URL(null=랜덤). include 로 함께 온다.
  shareOgImageUrl: string | null;
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
    // 자기 식당 이름을 resolve 한다. placeId 단위로 메모이즈 + 병렬화 — firstRound
    // 는 rounds[0] 와 같은 placeId 라 캐시 히트로 중복 조회를 없애고, 같은 식당이
    // 여러 차수에 있어도 1회만 조회한다. 모두 트랜잭션 진입 전이라 write-lock 무관.
    const nameCache = new Map<string, Promise<string>>();
    const resolveName = (placeId: string): Promise<string> => {
      let p = nameCache.get(placeId);
      if (!p) {
        p = this.resolveRestaurantName(placeId);
        nameCache.set(placeId, p);
      }
      return p;
    };

    const firstRound = input.rounds[0]!;
    // 이름 해석을 토큰 검증보다 먼저 — 기존 에러 우선순위(restaurant_not_found
    // 404 가 invalid_receipt_token 400 보다 먼저 throw)를 보존한다.
    const [sessionRestaurantName, roundRestaurantNames] = await Promise.all([
      resolveName(firstRound.restaurantPlaceId),
      Promise.all(input.rounds.map((r) => resolveName(r.restaurantPlaceId))),
    ]);

    // 영수증 토큰 모두 검증.
    const validatedTokens = await Promise.all(
      input.rounds.map((r) => this.validateReceiptToken(r.receiptImageToken)),
    );

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
        // R×P 개 attendee 를 1회 createMany 로 묶어 트랜잭션 write 왕복을 줄인다.
        // clientId 는 validateInput 이 유일성을 보장하므로 루프 인덱스(pIdx)가 곧
        // shareAmounts 인덱스(=과거 findIndex 결과)와 동일.
        await tx.settlementRoundParticipant.createMany({
          data: input.participants.map((p, pIdx) => {
            const a = attendeeMap.get(p.clientId);
            const attended = a?.attended ?? false;
            return {
              roundId: round.id,
              participantId: clientIdToDbId.get(p.clientId)!,
              attended,
              excludeAlcoholOverride: a?.excludeAlcoholOverride ?? null,
              excludeNonAlcoholOverride: a?.excludeNonAlcoholOverride ?? null,
              excludeSideOverride: a?.excludeSideOverride ?? null,
              shareAmount: attended ? (calc.perRound[rIdx]!.shareAmounts[pIdx] ?? 0) : 0,
            };
          }),
        });
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
        // R×P 개 attendee 를 1회 createMany 로 묶어 트랜잭션 write 왕복을 줄인다.
        // clientId 는 validateInput 이 유일성을 보장하므로 루프 인덱스(pIdx)가 곧
        // shareAmounts 인덱스(=과거 findIndex 결과)와 동일.
        await tx.settlementRoundParticipant.createMany({
          data: input.participants.map((p, pIdx) => {
            const a = attendeeMap.get(p.clientId);
            const attended = a?.attended ?? false;
            return {
              roundId: round.id,
              participantId: clientIdToDbId.get(p.clientId)!,
              attended,
              excludeAlcoholOverride: a?.excludeAlcoholOverride ?? null,
              excludeNonAlcoholOverride: a?.excludeNonAlcoholOverride ?? null,
              excludeSideOverride: a?.excludeSideOverride ?? null,
              shareAmount: attended ? (calc.perRound[rIdx]!.shareAmounts[pIdx] ?? 0) : 0,
            };
          }),
        });
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

  // 공유 토큰 생성/갱신 — 토큰은 한 번 발급되면 유지(멱등)하되, 호출할 때마다
  // ttl 기준으로 만료를 갱신(연장)한다. owner 가 다이얼로그를 다시 열어 기간을
  // 고르면 같은 링크의 수명만 늘어난다. 회수(revoke) 후 재생성하면 새 토큰.
  async createShare(
    userId: string,
    id: string,
    ttl: ShareTtlType,
    ogImage?: ShareOgImageType,
    // 트라이스테이트: undefined=기존 유지 / null=선택 해제(랜덤) / URL=그 사진 고정.
    ogImageUrl?: string | null,
  ): Promise<{
    token: string | null;
    shareUrl: string | null;
    expiresAt: string | null;
    ogImage: ShareOgImageType;
    ogImageUrl: string | null;
    ogImageCandidates: string[];
  }> {
    const row = await this.prisma.settlementSession.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        shareToken: true,
        shareOgImage: true,
        shareOgImageUrl: true,
        rounds: { select: { restaurantPlaceId: true } },
      },
    });
    if (!row) throw new SettlementError('not_found', '세션을 찾을 수 없습니다.');
    if (row.userId !== userId) throw new SettlementError('forbidden', '권한이 없습니다.');

    const token = row.shareToken ?? (await this.generateUniqueShareToken());
    const expiresAt = new Date(Date.now() + SHARE_TTL_MS[ttl]);
    // ogImage 생략 시 기존 선택 유지(첫 공유면 기본 restaurant) — 다이얼로그가
    // 열릴 때마다 본문 없이 POST 해도 사용자가 고른 'table' 이 덮이지 않게 한다.
    const mode: ShareOgImageType =
      ogImage ?? (row.shareOgImage as ShareOgImageType | null) ?? 'restaurant';

    // 고를 수 있는 식당 사진 후보 — 다이얼로그 갤러리 + ogImageUrl 검증에 쓴다.
    const candidates = await this.collectCandidateImageUrls(
      row.rounds.map((r) => r.restaurantPlaceId),
    );

    // 특정 사진 고정값 결정. 생략이면 기존값 유지하되, 후보에서 사라졌으면 정리.
    let chosenUrl: string | null;
    if (ogImageUrl === undefined) {
      chosenUrl = row.shareOgImageUrl ?? null;
    } else if (ogImageUrl === null) {
      chosenUrl = null;
    } else {
      chosenUrl = candidates.includes(ogImageUrl) ? ogImageUrl : null;
    }
    if (chosenUrl && !candidates.includes(chosenUrl)) chosenUrl = null;

    await this.prisma.settlementSession.update({
      where: { id },
      data: {
        shareToken: token,
        shareExpiresAt: expiresAt,
        shareOgImage: mode,
        shareOgImageUrl: chosenUrl,
      },
    });
    // OG 선택/만료가 바뀌었을 수 있으니 미리보기 캐시 무효화.
    invalidateSharePreview(token);
    return {
      token,
      shareUrl: Routes.Settlement.shared(token),
      expiresAt: expiresAt.toISOString(),
      ogImage: mode,
      ogImageUrl: chosenUrl,
      ogImageCandidates: candidates,
    };
  }

  // 정산에 묶인 식당들의 사진(네이버 호스트만, thumbnail 프록시 가능)을 모은다.
  // 원본 URL 그대로 반환 — 갤러리 렌더는 호출부가 thumbnail 프록시로 감싼다.
  // 갤러리/시드 안정성을 위해 dedup + 상한(12장)을 둔다.
  private async collectCandidateImageUrls(placeIds: string[]): Promise<string[]> {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const pid of [...new Set(placeIds)]) {
      // 사진 URL 만 필요하므로 getPublicDetail(전체 리뷰 코퍼스 로드) 대신 snapshot
      // 기반 경량 조회. imageUrls 산출은 동일(mergePhotos). 깨진 snapshotJson 같은
      // 예외는 해당 식당만 건너뛴다(기존 getPublicDetail.catch 동작 보존).
      const urls = await this.restaurants.getPhotoUrls(pid).catch(() => []);
      for (const u of urls) {
        if (seen.has(u) || !isThumbnailProxyable(u)) continue;
        seen.add(u);
        out.push(u);
        if (out.length >= 12) return out;
      }
    }
    return out;
  }

  // 공유 OG 미리보기에 필요한 메타만 경량 select 로 모은다. OG 크롤러가 같은
  // 링크를 반복 펼치므로 (token, origin) 단위 짧은 캐시로 흡수한다. 풀 로우
  // (rounds→items/attendees, participants) 대신 메타 컬럼 + _count + rounds[].placeId
  // 만 읽는다. 만료/없는 토큰이면 null → 호출부가 기본 OG 로 폴백.
  async getSharePreviewMeta(
    token: string,
    origin: string,
  ): Promise<SharePreviewMeta | null> {
    const now = Date.now();
    const cacheKey = sharePreviewCacheKey(token, origin);
    const cached = sharePreviewCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.value;

    const row = await this.prisma.settlementSession.findUnique({
      where: { shareToken: token },
      select: {
        restaurantName: true,
        grandTotal: true,
        shareExpiresAt: true,
        shareOgImage: true,
        shareOgImageUrl: true,
        _count: { select: { participants: true } },
        rounds: { select: { restaurantPlaceId: true } },
      },
    });
    if (!row) return null;
    if (row.shareExpiresAt && row.shareExpiresAt.getTime() < now) return null;

    const meta: SharePreviewMeta = {
      restaurantName: row.restaurantName,
      grandTotal: row.grandTotal,
      participantCount: row._count.participants,
      ogImageUrl: await this.pickRestaurantOgImageUrl(row, token, origin),
    };
    // 메모리 상한 — 과도하면 통째 비움(rateHits 패턴과 동일).
    if (sharePreviewCache.size > 5_000) sharePreviewCache.clear();
    sharePreviewCache.set(cacheKey, {
      value: meta,
      expiresAt: now + SHARE_PREVIEW_CACHE_TTL_MS,
    });
    return meta;
  }

  // mode='restaurant'(기본) 이면 그 정산 식당들의 사진(네이버 호스트만, thumbnail
  // 프록시 가능)에서 하나 골라 프록시 URL 을 돌려준다. owner 가 갤러리에서 고른
  // 사진(shareOgImageUrl)이 후보에 살아 있으면 그것, 아니면 '토큰 시드'로 결정적
  // 랜덤. 'table' 이거나 사진이 없으면 null → 정산표 PNG 로 폴백. 시드라 같은
  // 링크는 항상 같은 사진(카카오 OG 캐시와 일관, 매 크롤마다 바뀌지 않음).
  private async pickRestaurantOgImageUrl(
    row: {
      shareOgImage: string | null;
      shareOgImageUrl: string | null;
      rounds: Array<{ restaurantPlaceId: string }>;
    },
    token: string,
    origin: string,
  ): Promise<string | null> {
    const mode = (row.shareOgImage as ShareOgImageType | null) ?? 'restaurant';
    if (mode === 'table') return null;

    const images = await this.collectCandidateImageUrls(
      row.rounds.map((r) => r.restaurantPlaceId),
    );
    if (images.length === 0) return null;

    const pick =
      row.shareOgImageUrl && images.includes(row.shareOgImageUrl)
        ? row.shareOgImageUrl
        : images[seedFromToken(token) % images.length]!;
    return `${origin}${Routes.Media.thumbnail}?url=${encodeURIComponent(pick)}&w=1200&q=80`;
  }

  // 추측 불가능한 7바이트(56bit) base64url 토큰 = 10자. 만료가 항상 걸려 노출
  // 창이 닫히므로 짧아도 안전. unique 제약 충돌 시 재생성 — 56bit 공간에서
  // 현실적으로 한 번이면 끝나지만 방어적으로 몇 번 더 시도.
  private async generateUniqueShareToken(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = randomBytes(7).toString('base64url');
      const clash = await this.prisma.settlementSession.findUnique({
        where: { shareToken: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    throw new SettlementError('not_found', '공유 토큰 생성에 실패했습니다. 다시 시도해 주세요.');
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
      data: { shareToken: null, shareExpiresAt: null },
    });
    invalidateSharePreview(row.shareToken);
  }

  // 공유 토큰으로 read-only 세션 조회. 토큰을 안다 = 접근 허용이므로 인증
  // 검사는 하지 않는다. 만료된 링크는 'expired'(410). 응답에서
  // userId/round.receiptPreviewUrl 은 제거.
  async getBySharedToken(token: string): Promise<SharedSettlementSessionType> {
    const row = await this.findFullRowByToken(token);
    if (!row) throw new SettlementError('not_found', '공유된 정산을 찾을 수 없습니다.');
    if (row.shareExpiresAt && row.shareExpiresAt.getTime() < Date.now()) {
      throw new SettlementError('expired', '공유 링크가 만료되었습니다.');
    }
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
    // 이름 한 컬럼만 필요하므로 getPublicDetail(양쪽 출처 전체 리뷰 코퍼스 +
    // summary join + snapshotJson 파싱 + merge)을 거치지 않고 스칼라 직조회한다.
    // placeId 는 naver 행에만 채워지고(@unique), getPublicDetail 의 mergeName 도
    // naver 존재 시 naver.name 을 그대로 반환하므로 결과 값은 동일하다.
    const row = await this.prisma.restaurant.findUnique({
      where: { placeId },
      select: { name: true },
    });
    if (!row) {
      throw new SettlementError('restaurant_not_found', '식당을 찾을 수 없습니다.');
    }
    return row.name;
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
