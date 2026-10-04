import type {
  SettlementContactType,
  SettlementDraftType,
  SettlementSessionSummaryType,
  SettlementSessionType,
} from '@repo/api-contract';
import type { DraftParticipant, DraftRound } from '@repo/shared';

// 정산 화면 테스트들이 보는 계약의 fixture. 각 테스트는 관심 있는 필드만 덮어쓴다.
// (테스트 전용 — 앱 코드는 import 하지 않는다.)

export const TEST_PLACE_ID = '9900000001';

// 저장된 정산 한 건 — 1차·직접 입력·두 명(철수·영희)이 3만원을 반씩.
export const settlementSession = (
  over: Partial<SettlementSessionType> = {},
): SettlementSessionType => ({
  id: 'sess-1',
  userId: 'user-1',
  restaurantPlaceId: TEST_PLACE_ID,
  restaurantName: '초밥천국',
  grandTotal: 30_000,
  rounds: [
    {
      id: 'round-1',
      orderIndex: 0,
      restaurantPlaceId: TEST_PLACE_ID,
      restaurantName: '초밥천국',
      source: 'MANUAL',
      totalAmount: null,
      warning: null,
      receiptPreviewUrl: null,
      receiptImageToken: null,
      itemsSubtotal: 30_000,
      discountAmount: null,
      discountCategory: null,
      categoryAdjustments: null,
      groupSplits: null,
      items: [
        {
          id: 'item-1',
          name: '모둠초밥',
          unitPrice: 30_000,
          quantity: 1,
          amount: 30_000,
          category: 'UNCATEGORIZED',
          matchedMenuName: null,
          orderIndex: 0,
        },
      ],
      attendees: [
        {
          participantId: 'part-1',
          attended: true,
          excludeAlcoholOverride: null,
          excludeNonAlcoholOverride: null,
          excludeSideOverride: null,
          shareAmount: 15_000,
        },
        {
          participantId: 'part-2',
          attended: true,
          excludeAlcoholOverride: null,
          excludeNonAlcoholOverride: null,
          excludeSideOverride: null,
          shareAmount: 15_000,
        },
      ],
    },
  ],
  participants: [
    {
      id: 'part-1',
      name: '철수',
      nickname: null,
      excludeAlcohol: false,
      excludeNonAlcohol: false,
      excludeSide: false,
      shareAmount: 15_000,
      orderIndex: 0,
      contactId: null,
    },
    {
      id: 'part-2',
      name: '영희',
      nickname: null,
      excludeAlcohol: false,
      excludeNonAlcohol: false,
      excludeSide: false,
      shareAmount: 15_000,
      orderIndex: 1,
      contactId: null,
    },
  ],
  createdAt: '2026-08-16T02:00:00.000Z',
  updatedAt: '2026-08-16T02:00:00.000Z',
  editedAt: null,
  ...over,
});

export const settlementSummary = (
  over: Partial<SettlementSessionSummaryType> & { id: string },
): SettlementSessionSummaryType => ({
  restaurantPlaceId: TEST_PLACE_ID,
  restaurantName: '초밥천국',
  source: 'MANUAL',
  grandTotal: 30_000,
  roundCount: 1,
  itemCount: 1,
  participantCount: 2,
  createdAt: '2026-08-16T02:00:00.000Z',
  ...over,
});

export const draftParticipant = (
  over: Partial<DraftParticipant> & { clientId: string },
): DraftParticipant => ({
  name: '',
  nickname: '',
  excludeAlcohol: false,
  excludeNonAlcohol: false,
  excludeSide: false,
  ...over,
});

// 입력 중인 차수 — 기본은 식당만 고르고 입력 방식은 아직 안 정한 상태.
export const draftRound = (over: Partial<DraftRound> & { clientId: string }): DraftRound => ({
  placeId: TEST_PLACE_ID,
  placeName: '초밥천국',
  source: null,
  items: [],
  receiptImageToken: null,
  receiptPreviewUrl: null,
  totalAmount: null,
  warning: null,
  attendances: [],
  discountAmount: null,
  discountCategory: null,
  categoryAdjustments: null,
  groupSplits: null,
  ...over,
});

// 서버 임시저장 한 건. placeId: null = 식당 미지정 슬롯(/me/settlements/new).
export const settlementDraft = (
  over: Partial<SettlementDraftType> & { id: string },
): SettlementDraftType => ({
  placeId: null,
  placeNameHint: null,
  payload: { participants: [], rounds: [] },
  createdAt: '2026-08-16T02:00:00.000Z',
  updatedAt: '2026-08-16T02:00:00.000Z',
  ...over,
});

export const settlementContact = (
  over: Partial<SettlementContactType> & { id: string },
): SettlementContactType => ({
  name: '홍길동',
  nickname: null,
  lastExcludeAlcohol: false,
  lastExcludeNonAlcohol: false,
  lastExcludeSide: false,
  useCount: 1,
  lastUsedAt: '2026-08-16T02:00:00.000Z',
  createdAt: '2026-08-16T02:00:00.000Z',
  updatedAt: '2026-08-16T02:00:00.000Z',
  ...over,
});
