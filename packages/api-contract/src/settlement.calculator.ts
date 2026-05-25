import type { ReceiptItemCategoryType } from './schemas/settlement-extraction.js';
import type {
  SettlementItemInputType,
  SettlementParticipantInputType,
} from './schemas/settlement.js';

// 분배 계산기 — 순수 함수. items 의 amount 합을 카테고리별 풀로 분리한 뒤
// 참여자의 excludeXxx 플래그에 따라 풀별 인원수를 줄여 분담액을 산출한다.
//
// 규칙:
// - ALCOHOL / NON_ALCOHOL / SIDE 풀 각각: 해당 카테고리를 제외하지 않은 인원
//   끼리 풀 금액을 나눈다. 모두 제외했다면 풀은 비활성 (분담 = 0, 풀 금액은
//   '미분류' 풀로 합쳐 모두에게 균등 분담).
// - UNCATEGORIZED 풀: 모든 참여자가 균등 분담 (제외 플래그 무관).
// - 1원 단위 나머지는 첫 참여자에게 가산해 합이 풀 금액과 일치하게 한다.

const CATEGORIES = ['ALCOHOL', 'NON_ALCOHOL', 'SIDE', 'UNCATEGORIZED'] as const;

const EXCLUDE_KEY: Record<
  ReceiptItemCategoryType,
  'excludeAlcohol' | 'excludeNonAlcohol' | 'excludeSide' | null
> = {
  ALCOHOL: 'excludeAlcohol',
  NON_ALCOHOL: 'excludeNonAlcohol',
  SIDE: 'excludeSide',
  UNCATEGORIZED: null,
};

export interface CalculateInput {
  items: Pick<SettlementItemInputType, 'amount' | 'category'>[];
  participants: Pick<
    SettlementParticipantInputType,
    'excludeAlcohol' | 'excludeNonAlcohol' | 'excludeSide'
  >[];
}

export interface CalculateOutput {
  // 입력 participants 와 같은 순서로 분담액. 각 값은 0 이상의 정수.
  shareAmounts: number[];
  // 항목 amount 합. 클라이언트 검증·표시용.
  itemsSubtotal: number;
  // 카테고리별 풀 디버깅 정보 — UI 결과 카드에서 "주류: 24,000원 / 2명 참여"
  // 같은 라인을 만들 때 쓴다.
  poolBreakdown: Record<
    ReceiptItemCategoryType,
    {
      poolAmount: number;
      participantCount: number;
      perParticipant: number;
    }
  >;
}

export const calculateShares = (input: CalculateInput): CalculateOutput => {
  const itemsSubtotal = input.items.reduce((sum, it) => sum + it.amount, 0);
  const participantCount = input.participants.length;

  const shareAmounts = new Array<number>(participantCount).fill(0);
  const poolBreakdown = {} as CalculateOutput['poolBreakdown'];

  for (const category of CATEGORIES) {
    const poolAmount = input.items
      .filter((it) => it.category === category)
      .reduce((sum, it) => sum + it.amount, 0);

    // 어떤 참여자가 이 풀에 참여하는가. UNCATEGORIZED 는 전원 참여.
    const excludeKey = EXCLUDE_KEY[category];
    const participates: boolean[] =
      excludeKey === null
        ? input.participants.map(() => true)
        : input.participants.map((p) => !p[excludeKey]);

    let activeCount = participates.filter(Boolean).length;
    let effectivePool = poolAmount;

    // 풀에서 모두 빠졌다면(=주류가 있는데 전원 안 마심) 그 금액을 미분류 풀
    // 처럼 모두에게 균등 분담. 빈 풀은 그대로 0.
    if (activeCount === 0 && poolAmount > 0) {
      effectivePool = 0; // 이 카테고리 풀 자체는 비워두고
      // 다른 풀에 영향 주지 않게 별도 처리: 균등 분담을 직접 적용
      const fallback = distribute(poolAmount, participantCount);
      for (let i = 0; i < participantCount; i += 1) {
        shareAmounts[i] = (shareAmounts[i] ?? 0) + (fallback[i] ?? 0);
      }
      activeCount = participantCount;
    }

    if (effectivePool > 0 && activeCount > 0) {
      const distributed = distributeWith(effectivePool, participates);
      for (let i = 0; i < participantCount; i += 1) {
        shareAmounts[i] = (shareAmounts[i] ?? 0) + (distributed[i] ?? 0);
      }
    }

    poolBreakdown[category] = {
      poolAmount,
      participantCount: activeCount,
      perParticipant:
        activeCount > 0 && effectivePool > 0 ? Math.floor(effectivePool / activeCount) : 0,
    };
  }

  return { shareAmounts, itemsSubtotal, poolBreakdown };
};

// amount 를 n 명에게 균등 분배. 나머지는 첫 참여자에게 더한다.
const distribute = (amount: number, n: number): number[] => {
  if (n <= 0) return [];
  const per = Math.floor(amount / n);
  const remainder = amount - per * n;
  const out = new Array<number>(n).fill(per);
  if (remainder > 0) out[0] = (out[0] ?? 0) + remainder;
  return out;
};

// participates[i]=true 인 사람에게만 분배. false 는 0.
const distributeWith = (amount: number, participates: boolean[]): number[] => {
  const activeIdx: number[] = [];
  participates.forEach((p, i) => {
    if (p) activeIdx.push(i);
  });
  const distributed = distribute(amount, activeIdx.length);
  const out = new Array<number>(participates.length).fill(0);
  activeIdx.forEach((i, k) => {
    out[i] = distributed[k] ?? 0;
  });
  return out;
};

// ── 차수(N차) 계산 ─────────────────────────────────────────────────────
// 차수별로 (items × 참석자 부분집합) 을 독립 풀로 계산하고, 마스터 인덱스
// 단위로 합산해 인당 grand total 을 만든다. 차수별 분담도 같이 노출해
// UI 에서 "1차 12,000 + 2차 8,000 = 20,000" 같이 보일 수 있게 한다.

export interface RoundAttendeeCalcInput {
  // 마스터 participants 배열에서의 index. 비참석자는 입력에 포함시키지 않는다.
  participantIndex: number;
  excludeAlcohol: boolean;
  excludeNonAlcohol: boolean;
  excludeSide: boolean;
}

export interface RoundCalcInput {
  items: Pick<SettlementItemInputType, 'amount' | 'category'>[];
  attendees: RoundAttendeeCalcInput[];
}

export interface MultiRoundCalcInput {
  participantCount: number;
  rounds: RoundCalcInput[];
}

export interface PerRoundCalcOutput {
  // 길이 = participantCount. 비참석자 인덱스는 0.
  shareAmounts: number[];
  itemsSubtotal: number;
  poolBreakdown: CalculateOutput['poolBreakdown'];
}

export interface MultiRoundCalcOutput {
  // 마스터 인덱스 단위 grand total.
  perParticipant: number[];
  perRound: PerRoundCalcOutput[];
  grandTotal: number;
}

// 마스터 default 와 round override 를 합쳐 effective exclude 플래그를 만든다.
// override 값이 null 이면 마스터 그대로, 아니면 round 값으로 덮어씌운다.
export const effectiveExcludes = (
  master: {
    excludeAlcohol: boolean;
    excludeNonAlcohol: boolean;
    excludeSide: boolean;
  },
  override: {
    excludeAlcoholOverride: boolean | null;
    excludeNonAlcoholOverride: boolean | null;
    excludeSideOverride: boolean | null;
  },
): { excludeAlcohol: boolean; excludeNonAlcohol: boolean; excludeSide: boolean } => ({
  excludeAlcohol: override.excludeAlcoholOverride ?? master.excludeAlcohol,
  excludeNonAlcohol: override.excludeNonAlcoholOverride ?? master.excludeNonAlcohol,
  excludeSide: override.excludeSideOverride ?? master.excludeSide,
});

export const calculateMultiRoundShares = (
  input: MultiRoundCalcInput,
): MultiRoundCalcOutput => {
  const perParticipant = new Array<number>(input.participantCount).fill(0);
  const perRound: PerRoundCalcOutput[] = [];
  let grandTotal = 0;

  for (const round of input.rounds) {
    // 비참석자는 입력에 빠져 있으므로, 참석자만으로 calculateShares 호출.
    const inner = calculateShares({
      items: round.items,
      participants: round.attendees.map((a) => ({
        excludeAlcohol: a.excludeAlcohol,
        excludeNonAlcohol: a.excludeNonAlcohol,
        excludeSide: a.excludeSide,
      })),
    });

    // 참석자 인덱스 → 마스터 인덱스로 되돌려 share 배열을 부풀린다.
    const shareAmounts = new Array<number>(input.participantCount).fill(0);
    round.attendees.forEach((a, i) => {
      const amt = inner.shareAmounts[i] ?? 0;
      shareAmounts[a.participantIndex] = amt;
      perParticipant[a.participantIndex] =
        (perParticipant[a.participantIndex] ?? 0) + amt;
    });
    grandTotal += inner.itemsSubtotal;
    perRound.push({
      shareAmounts,
      itemsSubtotal: inner.itemsSubtotal,
      poolBreakdown: inner.poolBreakdown,
    });
  }

  return { perParticipant, perRound, grandTotal };
};
