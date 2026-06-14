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

// 카테고리별 잔여 처리 보정 — '분담 다듬기'. 풀이 인원수로 정확히 나눠
// 떨어지지 않을 때 사용자가 정한 규칙. 응답 형은 leftoverParticipantIds (db),
// 입력 형은 leftoverParticipantClientIds.
//
// leftoverParticipantIds: 잔여를 받을 사람(들). 1명이면 그 사람이 전부
// 흡수(레거시 '몰아주기'), 여러 명이면 잔여를 그들끼리 균등 분배('나눠 받기').
//
// roundUnit:
// - null  : 풀 그대로, 잔여 1~(n-1)원을 leftover 수령자(들) 가 흡수.
// - 100/1000: 풀을 그 단위로 round 후 균등 분배. 단 round 한 풀이 인원수로
//   나누어 떨어져야 한다 — 안 떨어지면 calculator 가 안전망으로 roundUnit 을
//   무시 + 잔여 가산. (UI 가 활성 조건 검사 + 서비스 검증.)
export const SettlementCategoryAdjustment = z.object({
  leftoverParticipantIds: z.array(z.string()).min(1),
  roundUnit: z.number().int().positive().nullable(),
});
export type SettlementCategoryAdjustmentType = z.infer<typeof SettlementCategoryAdjustment>;

export const SettlementCategoryAdjustments = z
  .object({
    ALCOHOL: SettlementCategoryAdjustment.nullable().optional(),
    NON_ALCOHOL: SettlementCategoryAdjustment.nullable().optional(),
    SIDE: SettlementCategoryAdjustment.nullable().optional(),
    UNCATEGORIZED: SettlementCategoryAdjustment.nullable().optional(),
  })
  .nullable();
export type SettlementCategoryAdjustmentsType = z.infer<typeof SettlementCategoryAdjustments>;

// 입력 시엔 마스터 db id 가 아직 없어 clientId 로 참조.
export const SettlementCategoryAdjustmentInput = z.object({
  leftoverParticipantClientIds: z.array(z.string().min(1)).min(1),
  roundUnit: z.number().int().positive().nullable(),
});
export type SettlementCategoryAdjustmentInputType = z.infer<
  typeof SettlementCategoryAdjustmentInput
>;

export const SettlementCategoryAdjustmentsInput = z
  .object({
    ALCOHOL: SettlementCategoryAdjustmentInput.nullable().optional(),
    NON_ALCOHOL: SettlementCategoryAdjustmentInput.nullable().optional(),
    SIDE: SettlementCategoryAdjustmentInput.nullable().optional(),
    UNCATEGORIZED: SettlementCategoryAdjustmentInput.nullable().optional(),
  })
  .nullable()
  .optional()
  .default(null);
export type SettlementCategoryAdjustmentsInputType = z.infer<
  typeof SettlementCategoryAdjustmentsInput
>;

// ── 세부 분배 그룹 ────────────────────────────────────────────────────
// 한 차수의 카테고리 풀에서 특정 항목들(예: 소주, 맥주)을 떼어내 그룹
// 멤버끼리만 나누는 규칙. EQUAL = 그룹 내 균등, GLASSES = 잔수(정수 가중치)
// 비례. 그룹에 안 묶인 항목은 기존 카테고리 균등 분배('나머지 풀')를 따른다.
// 스키마·계산기는 카테고리 범용이지만 UI 는 주류/음료에만 노출한다.
export const SettlementGroupSplitMode = z.enum(['EQUAL', 'GLASSES']);
export type SettlementGroupSplitModeType = z.infer<typeof SettlementGroupSplitMode>;

// 응답형 멤버 — participantId 는 마스터 참여자의 db id.
export const SettlementGroupMember = z.object({
  participantId: z.string(),
  // 정수 잔수(가중치). EQUAL 모드에선 무시된다. 0잔 = 멤버로 두되 분담 0.
  glasses: z.number().int().nonnegative().max(999),
});
export type SettlementGroupMemberType = z.infer<typeof SettlementGroupMember>;

export const SettlementItemGroup = z.object({
  label: z.string().min(1).max(40),
  category: ReceiptItemCategory,
  // round.items 의 orderIndex(=배열 인덱스) 참조. 한 항목은 최대 1개 그룹.
  itemIndexes: z.array(z.number().int().nonnegative()).min(1),
  mode: SettlementGroupSplitMode,
  members: z.array(SettlementGroupMember).min(1),
});
export type SettlementItemGroupType = z.infer<typeof SettlementItemGroup>;

// 입력형 — 마스터 참여자를 clientId 로 참조 (attendees 와 동일한 방식).
export const SettlementGroupMemberInput = z.object({
  participantClientId: z.string().min(1),
  glasses: z.number().int().nonnegative().max(999),
});
export type SettlementGroupMemberInputType = z.infer<typeof SettlementGroupMemberInput>;

export const SettlementItemGroupInput = z.object({
  label: z.string().trim().min(1).max(40),
  category: ReceiptItemCategory,
  itemIndexes: z.array(z.number().int().nonnegative()).min(1).max(200),
  mode: SettlementGroupSplitMode,
  members: z.array(SettlementGroupMemberInput).min(1).max(100),
});
export type SettlementItemGroupInputType = z.infer<typeof SettlementItemGroupInput>;

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
  // 업로드한 이미지 토큰. 편집 재진입 시 토큰을 그대로 돌려줘 재저장에도
  // 영수증이 보존되게 한다 (소유자 응답에만 — 공유 응답에선 omit).
  receiptImageToken: z.string().nullable(),
  itemsSubtotal: z.number().int().nonnegative(),
  // 차수 할인 — 영수증의 쿠폰/멤버십 등. 1차에 1건만 (여러 건은 합산해서
  // 한 줄로 넣는다). discountAmount=null 이면 할인 없음, 양수면
  // discountCategory 가 가리키는 카테고리 풀에서 차감 (계산기에서 자연
  // 반영). UI 상 정산표는 풀 컬럼 합이 줄어들고, 항목 카드는 '할인 -X' 줄.
  discountAmount: z.number().int().positive().nullable(),
  discountCategory: ReceiptItemCategory.nullable(),
  // 분담 다듬기 — null 이면 default (잔여를 첫 참여자가 흡수).
  categoryAdjustments: SettlementCategoryAdjustments,
  // 세부 분배 그룹 — null 이면 없음 (카테고리 균등 분배만).
  groupSplits: z.array(SettlementItemGroup).nullable(),
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
    // 분담 다듬기 — 카테고리별 잔여 처리 규칙. 키 자체가 빠지면 null.
    categoryAdjustments: SettlementCategoryAdjustmentsInput,
    // 세부 분배 그룹. 키 자체가 빠진 페이로드(기존 클라이언트)는 null 로 본다.
    groupSplits: z.array(SettlementItemGroupInput).max(30).nullable().optional().default(null),
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
  )
  // 그룹의 항목 참조 검증 — 범위 안 + 그룹 카테고리와 일치 + 그룹 간 중복 없음.
  .refine(
    (r) => {
      if (!r.groupSplits) return true;
      const used = new Set<number>();
      for (const g of r.groupSplits) {
        for (const idx of g.itemIndexes) {
          if (idx >= r.items.length) return false;
          if (r.items[idx]!.category !== g.category) return false;
          if (used.has(idx)) return false;
          used.add(idx);
        }
      }
      return true;
    },
    {
      message: '세부 분배 그룹의 항목 참조가 올바르지 않습니다.',
      path: ['groupSplits'],
    },
  )
  // 그룹 안에서 같은 참여자 중복 금지.
  .refine(
    (r) => {
      if (!r.groupSplits) return true;
      for (const g of r.groupSplits) {
        const ids = new Set<string>();
        for (const m of g.members) {
          if (ids.has(m.participantClientId)) return false;
          ids.add(m.participantClientId);
        }
      }
      return true;
    },
    {
      message: '세부 분배 그룹에 같은 참여자가 중복됩니다.',
      path: ['groupSplits'],
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
  // 임시저장(SettlementDraft) id — 자동저장으로 만들어진 draft 에서 출발한
  // 저장이면 서버가 트랜잭션 안에서 그 draft 를 함께 삭제한다. 본인 소유가
  // 아니거나 없는 id 면 조용히 무시(저장 자체는 성공).
  fromDraftId: z.string().min(1).optional(),
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

// 공유 링크 유효 기간 프리셋. 무제한은 없다 — 모든 링크가 최대 30일 내 만료되어
// 짧은 토큰(10자)으로도 brute-force 노출 창이 닫힌다.
export const ShareTtl = z.enum(['1d', '7d', '30d']);
export type ShareTtlType = z.infer<typeof ShareTtl>;

// 공유 링크 미리보기(OG) 이미지 소스.
// - restaurant: 그 정산 식당들의 사진(네이버 호스트만). owner 가 갤러리에서 특정
//   1장을 고르면 그 사진, 안 고르면 토큰 시드로 결정적 랜덤. 사진이 없으면 정산표.
// - table: 정산표 매트릭스 PNG.
// 기본은 restaurant — 참가자 이름이 미리보기/크롤러 캐시에 안 박혀 프라이버시상 유리.
export const ShareOgImage = z.enum(['restaurant', 'table']);
export type ShareOgImageType = z.infer<typeof ShareOgImage>;

// POST /settlements/:id/share 본문. 본문 전체가 옵셔널 — 본문 없이 POST 하면
// Fastify 가 body 를 null 로 넘기므로(=undefined 아님) preprocess 로 {} 로
// 메꾼 뒤 ttl 기본 7일을 적용한다. (다이얼로그 자동 호출이 본문 없이 POST 함.)
// ogImage 는 옵셔널 — 생략하면 서버가 기존 선택을 유지(첫 공유면 restaurant).
// 토글을 바꿀 때만 명시해서 보낸다(다이얼로그 자동 호출이 덮어쓰지 않도록).
// ogImageUrl 트라이스테이트(식당 사진 갤러리에서 특정 1장 고정):
//   생략 → 기존 선택 유지 / null → 선택 해제(랜덤으로 복귀) / URL 문자열 → 그 사진
//   고정(후보 목록에 있는 URL 만 저장, 아니면 서버가 무시하고 null 처리).
export const CreateSettlementShareInput = z.preprocess(
  (v) => (v == null ? {} : v),
  z.object({
    ttl: ShareTtl.default('7d'),
    ogImage: ShareOgImage.optional(),
    ogImageUrl: z.string().url().nullable().optional(),
  }),
);
export type CreateSettlementShareInputType = z.infer<typeof CreateSettlementShareInput>;

export const SettlementShare = z.object({
  token: z.string().nullable(),
  shareUrl: z.string().nullable(),
  // 만료 시각 ISO 문자열. 토큰이 없으면(=공유 불가) null.
  expiresAt: z.string().nullable(),
  // 현재 저장된 미리보기 이미지 선택 — 다이얼로그가 토글 상태를 복원하는 데 쓴다.
  ogImage: ShareOgImage,
  // 'restaurant' 모드에서 owner 가 갤러리에서 고른 식당 사진 원본 URL. 미선택이면
  // null(=랜덤). 다이얼로그가 갤러리에서 어느 사진이 선택됐는지 표시하는 데 쓴다.
  ogImageUrl: z.string().nullable(),
  // 고를 수 있는 식당 사진 후보(원본 URL, 네이버 호스트). 다이얼로그가 썸네일
  // 갤러리로 렌더. 식당 사진이 없으면 빈 배열 → 갤러리 숨김(자동 정산표 폴백).
  ogImageCandidates: z.array(z.string()),
});
export type SettlementShareType = z.infer<typeof SettlementShare>;

// 공유 응답: userId 와 round 별 receiptPreviewUrl/receiptImageToken 제거 —
// 토큰 받은 사람도 원본 사진은 보지 못한다.
const SharedSettlementRound = SettlementRound.omit({
  receiptPreviewUrl: true,
  receiptImageToken: true,
});
export const SharedSettlementSession = SettlementSession
  .omit({ userId: true, rounds: true })
  .extend({ rounds: z.array(SharedSettlementRound) });
export type SharedSettlementSessionType = z.infer<typeof SharedSettlementSession>;
