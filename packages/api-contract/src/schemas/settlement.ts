import { z } from 'zod';
import { ReceiptItemCategory } from './settlement-extraction.js';

// 세션 한 차수가 어떻게 만들어졌는지. RECEIPT = 영수증 사진 추출, MANUAL = 직접
// 입력. source 는 round 단위 — 1차는 영수증·2차는 직접 입력도 가능.
export const SettlementSource = z.enum(['MANUAL', 'RECEIPT']);
export type SettlementSourceType = z.infer<typeof SettlementSource>;

// 한 항목(메뉴). round 에 종속이며 sessionId 는 응답에 노출하지 않는다 — 부모
// round.id 만으로 충분.
export const SettlementItem = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  unitPrice: z.number().int().nonnegative().nullable(),
  quantity: z.number().int().positive().nullable(),
  amount: z.number().int().nonnegative(),
  category: ReceiptItemCategory,
  matchedMenuName: z.string().nullable(),
  orderIndex: z.number().int().nonnegative(),
});
export type SettlementItemType = z.infer<typeof SettlementItem>;

export const SettlementItemInput = SettlementItem.omit({ id: true, orderIndex: true });
export type SettlementItemInputType = z.infer<typeof SettlementItemInput>;

// 차수 내 한 참여자의 attendance. 마스터 참여자(SettlementParticipant) 의 id
// 로 매핑돼서 응답된다. excludeXxxOverride === null 이면 마스터 default 사용,
// true/false 면 round 단위로 override.
export const SettlementRoundAttendee = z.object({
  participantId: z.string(),
  attended: z.boolean(),
  excludeAlcoholOverride: z.boolean().nullable(),
  excludeNonAlcoholOverride: z.boolean().nullable(),
  excludeSideOverride: z.boolean().nullable(),
  // 이 round 안에서의 분담액. 비참석이면 0.
  shareAmount: z.number().int().nonnegative(),
});
export type SettlementRoundAttendeeType = z.infer<typeof SettlementRoundAttendee>;

// 입력 시점에는 마스터 참여자가 아직 server cuid 가 없다 — 클라이언트가
// 임의의 안정적인 participantClientId 를 부여하고, round.attendees 는 그 키로
// 마스터 참여자를 참조한다. 서버는 매핑 후 폐기.
export const SettlementRoundAttendeeInput = z.object({
  participantClientId: z.string().min(1),
  attended: z.boolean().default(true),
  excludeAlcoholOverride: z.boolean().nullable(),
  excludeNonAlcoholOverride: z.boolean().nullable(),
  excludeSideOverride: z.boolean().nullable(),
});
export type SettlementRoundAttendeeInputType = z.infer<typeof SettlementRoundAttendeeInput>;

export const SettlementRound = z.object({
  id: z.string(),
  orderIndex: z.number().int().nonnegative(),
  // 차수마다 다른 식당일 수 있으므로 round 단위에 식당 snapshot.
  restaurantPlaceId: z.string(),
  restaurantName: z.string(),
  source: SettlementSource,
  totalAmount: z.number().int().nonnegative().nullable(),
  warning: z.string().nullable(),
  // 원본 사진은 별도 인증 라우트로만 — 공유 응답에선 빠진다.
  receiptPreviewUrl: z.string().nullable(),
  itemsSubtotal: z.number().int().nonnegative(),
  // 차수 할인 — 영수증의 쿠폰/멤버십 등. 1차에 1건만 (여러 건은 합산해서
  // 한 줄로 넣는다). discountAmount=null 이면 할인 없음, 양수면
  // discountCategory 가 가리키는 카테고리 풀에서 차감 (계산기에서 자연
  // 반영). UI 상 정산표는 풀 컬럼 합이 줄어들고, 항목 카드는 '할인 -X' 줄.
  discountAmount: z.number().int().positive().nullable(),
  discountCategory: ReceiptItemCategory.nullable(),
  items: z.array(SettlementItem),
  attendees: z.array(SettlementRoundAttendee),
});
export type SettlementRoundType = z.infer<typeof SettlementRound>;

export const SettlementRoundInput = z
  .object({
    restaurantPlaceId: z.string().min(1),
    source: SettlementSource,
    totalAmount: z.number().int().nonnegative().nullable(),
    warning: z.string().nullable(),
    // 영수증 분기에서 업로드한 이미지 토큰. MANUAL 은 null.
    receiptImageToken: z.string().nullable(),
    // 할인 — null/null 또는 (양수, 카테고리) 페어. 풀 음수 차단은 아래 refine.
    // 키 자체가 빠진 페이로드(기존 클라이언트)는 둘 다 null 로 본다.
    discountAmount: z.number().int().positive().nullable().optional().default(null),
    discountCategory: ReceiptItemCategory.nullable().optional().default(null),
    items: z.array(SettlementItemInput).min(1).max(200),
    // round 마다 최소 1명은 참석해야 분배가 의미 있음. 비참석은 attended:false 로.
    // 100 은 큰 동호회·회사 회식까지 안전하게 커버. DB/계산기 모두 선형 비용.
    attendees: z.array(SettlementRoundAttendeeInput).min(1).max(100),
  })
  .refine((r) => (r.discountAmount == null) === (r.discountCategory == null), {
    message: '할인 금액과 카테고리는 함께 설정해야 합니다.',
    path: ['discountAmount'],
  })
  .refine(
    (r) => {
      if (r.discountAmount == null || r.discountCategory == null) return true;
      const pool = r.items
        .filter((it) => it.category === r.discountCategory)
        .reduce((s, it) => s + it.amount, 0);
      return pool >= r.discountAmount;
    },
    {
      message: '할인 금액이 해당 카테고리 풀을 초과합니다.',
      path: ['discountAmount'],
    },
  );
export type SettlementRoundInputType = z.infer<typeof SettlementRoundInput>;

// 마스터 참여자. excludeXxx 는 default — round 가 override 하지 않은 차수에서
// 그대로 쓰인다. shareAmount 는 모든 round 분담의 합 (grand total per person).
export const SettlementParticipant = z.object({
  id: z.string(),
  name: z.string().nullable(),
  nickname: z.string().nullable(),
  excludeAlcohol: z.boolean(),
  excludeNonAlcohol: z.boolean(),
  excludeSide: z.boolean(),
  shareAmount: z.number().int().nonnegative(),
  orderIndex: z.number().int().nonnegative(),
  contactId: z.string().nullable(),
});
export type SettlementParticipantType = z.infer<typeof SettlementParticipant>;

// 입력 시 clientId 는 round.attendees.participantClientId 와 매칭하기 위한
// 클라이언트 측 임시 키. 서버는 cuid 부여 후 폐기.
export const SettlementParticipantInput = z.object({
  clientId: z.string().min(1),
  name: z.string().trim().max(40).nullable(),
  nickname: z.string().trim().max(40).nullable(),
  excludeAlcohol: z.boolean().default(false),
  excludeNonAlcohol: z.boolean().default(false),
  excludeSide: z.boolean().default(false),
  contactId: z.string().optional(),
});
export type SettlementParticipantInputType = z.infer<typeof SettlementParticipantInput>;

export const SettlementSession = z.object({
  id: z.string(),
  userId: z.string(),
  // 1차 식당의 snapshot — 목록 검색·이력 호환을 위해 세션 직속에도 둔다.
  // rounds[0].restaurantPlaceId / restaurantName 과 항상 동기화.
  restaurantPlaceId: z.string(),
  restaurantName: z.string(),
  // 모든 round 의 itemsSubtotal 합.
  grandTotal: z.number().int().nonnegative(),
  rounds: z.array(SettlementRound).min(1),
  participants: z.array(SettlementParticipant),
  createdAt: z.string(),
  updatedAt: z.string(),
  // 저장 후 본문(참여자/차수/항목)이 마지막으로 수정된 시각. 한 번도 수정 안
  // 됐으면 null. 공유 페이지의 '수정됨' 배지 기준.
  editedAt: z.string().nullable(),
});
export type SettlementSessionType = z.infer<typeof SettlementSession>;

export const CreateSettlementInput = z.object({
  rounds: z.array(SettlementRoundInput).min(1).max(10),
  participants: z.array(SettlementParticipantInput).min(1).max(100),
});
export type CreateSettlementInputType = z.infer<typeof CreateSettlementInput>;

// 통합 update — 참여자 명단·차수 구성·각 차수의 items/attendees 까지 한 번에
// 교체. 부분 수정이 아니라 전체 replace 의미. 서버는 트랜잭션으로 삭제→재삽입
// + shareAmount 재계산.
export const UpdateSettlementInput = CreateSettlementInput;
export type UpdateSettlementInputType = z.infer<typeof UpdateSettlementInput>;

export const ListSettlementsQuery = z.object({
  // 특정 식당의 이력만 — 1차 식당(session.restaurantPlaceId) 기준.
  placeId: z.string().optional(),
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListSettlementsQueryType = z.infer<typeof ListSettlementsQuery>;

export const SettlementSessionSummary = z.object({
  id: z.string(),
  restaurantPlaceId: z.string(),
  restaurantName: z.string(),
  // 1차 source 가 대표값.
  source: SettlementSource,
  grandTotal: z.number().int().nonnegative(),
  roundCount: z.number().int().positive(),
  // 모든 round 의 item 수 합.
  itemCount: z.number().int().nonnegative(),
  participantCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type SettlementSessionSummaryType = z.infer<typeof SettlementSessionSummary>;

export const ListSettlementsResult = z.object({
  items: z.array(SettlementSessionSummary),
  total: z.number().int().nonnegative(),
});
export type ListSettlementsResultType = z.infer<typeof ListSettlementsResult>;

export const SettlementShare = z.object({
  token: z.string().nullable(),
  shareUrl: z.string().nullable(),
});
export type SettlementShareType = z.infer<typeof SettlementShare>;

// 공유 응답: userId 와 round 별 receiptPreviewUrl 제거 — 토큰 받은 사람도
// 원본 사진은 보지 못한다.
const SharedSettlementRound = SettlementRound.omit({ receiptPreviewUrl: true });
export const SharedSettlementSession = SettlementSession
  .omit({ userId: true, rounds: true })
  .extend({ rounds: z.array(SharedSettlementRound) });
export type SharedSettlementSessionType = z.infer<typeof SharedSettlementSession>;
