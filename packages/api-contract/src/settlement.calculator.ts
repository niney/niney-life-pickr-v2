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
  // 카테고리 × 참여자 분담 매트릭스 — '정산표' (이름 × 카테고리) UI 가 사용.
  // 합산하면 shareAmounts[i] 와 같다. fallback(전원 제외) 케이스에도 의미상의
  // 분담을 그대로 카테고리 키에 기록한다 (예: ALCOHOL 풀이 전원 제외라
  // UNCATEGORIZED 처럼 균등 분담된 경우, perCategoryShares.ALCOHOL[i] 에 그
  // 값이 들어간다 — '주류' 컬럼에 음식값이 박혀 이상해 보일 수 있지만 합산은
  // 정확. UI 측에선 poolBreakdown 으로 '실제 풀' 인지 fallback 인지 구분 가능).
  perCategoryShares: Record<ReceiptItemCategoryType, number[]>;
}

// 카테고리별 잔여 처리 보정. participantIndex 는 calculateShares 의
// participants 배열 인덱스. roundUnit 이 있으면 풀을 그 단위로 round 후
// 균등 분배 — 단, round 한 풀이 인원수로 떨어져야 한다. 안 떨어지면 안전망
// 으로 무시하고 잔여 가산 모드로 fallback (UI 가 활성 조건 검사 + 서비스
// 검증으로 실제로 도달하지 않게 한다).
export type CategoryAdjustmentsInput = Partial<
  Record<
    ReceiptItemCategoryType,
    { leftoverParticipantIndex: number; roundUnit: number | null }
  >
>;

export const calculateShares = (
  input: CalculateInput & {
    // 옵션 — 한 카테고리 풀에서만 차감되는 단일 할인. 풀 음수 방어로 max(0, …)
    // 클램프 (입력 검증은 스키마 refine 으로 막혀 있다).
    discount?: { amount: number; category: ReceiptItemCategoryType } | null;
    categoryAdjustments?: CategoryAdjustmentsInput | null;
  },
): CalculateOutput => {
  const discount = input.discount ?? null;
  const adjustments = input.categoryAdjustments ?? null;
  const participantCount = input.participants.length;

  const shareAmounts = new Array<number>(participantCount).fill(0);
  const poolBreakdown = {} as CalculateOutput['poolBreakdown'];
  const perCategoryShares = {} as CalculateOutput['perCategoryShares'];

  let itemsSubtotal = 0;

  for (const category of CATEGORIES) {
    const rawPool = input.items
      .filter((it) => it.category === category)
      .reduce((sum, it) => sum + it.amount, 0);
    const afterDiscount =
      discount && discount.category === category
        ? Math.max(0, rawPool - discount.amount)
        : rawPool;

    // 어떤 참여자가 이 풀에 참여하는가. UNCATEGORIZED 는 전원 참여.
    const excludeKey = EXCLUDE_KEY[category];
    const participates: boolean[] =
      excludeKey === null
        ? input.participants.map(() => true)
        : input.participants.map((p) => !p[excludeKey]);

    let activeCount = participates.filter(Boolean).length;
    // 사용자 보정(roundUnit) — round 후 인원수로 나눠떨어질 때만 적용.
    const adj = adjustments?.[category] ?? null;
    let effectivePool = afterDiscount;
    if (adj && adj.roundUnit != null && activeCount > 0) {
      const rounded = Math.round(afterDiscount / adj.roundUnit) * adj.roundUnit;
      if (rounded % activeCount === 0) effectivePool = rounded;
      // 안 떨어지면 roundUnit 무시 → 그대로 effectivePool=afterDiscount 로 잔여 가산.
    }
    // 이 카테고리에서 각 참여자가 진 분담만 따로 누적 (UI 매트릭스용).
    const categoryShares = new Array<number>(participantCount).fill(0);

    // 풀에서 모두 빠졌다면(=주류가 있는데 전원 안 마심) 그 금액을 미분류 풀
    // 처럼 모두에게 균등 분담. 빈 풀은 그대로 0.
    if (activeCount === 0 && effectivePool > 0) {
      const fallback = distribute(effectivePool, participantCount);
      for (let i = 0; i < participantCount; i += 1) {
        const v = fallback[i] ?? 0;
        shareAmounts[i] = (shareAmounts[i] ?? 0) + v;
        categoryShares[i] = (categoryShares[i] ?? 0) + v;
      }
      activeCount = participantCount;
      // 풀 표시는 0 (이 카테고리는 비움) — 매트릭스 컬럼 합 invariant 는
      // categoryShares 가 채우니까 사용자에겐 잔여 카테고리 컬럼에 음식값이
      // 박혀 보일 수 있다(기존 동작과 동일).
      effectivePool = 0;
    } else if (effectivePool > 0 && activeCount > 0) {
      const distributed = distributeWith(
        effectivePool,
        participates,
        adj?.leftoverParticipantIndex,
      );
      for (let i = 0; i < participantCount; i += 1) {
        const v = distributed[i] ?? 0;
        shareAmounts[i] = (shareAmounts[i] ?? 0) + v;
        categoryShares[i] = (categoryShares[i] ?? 0) + v;
      }
    }

    poolBreakdown[category] = {
      poolAmount: effectivePool,
      participantCount: activeCount,
      perParticipant:
        activeCount > 0 && effectivePool > 0 ? Math.floor(effectivePool / activeCount) : 0,
    };
    perCategoryShares[category] = categoryShares;
    itemsSubtotal += effectivePool;
  }

  return { shareAmounts, itemsSubtotal, poolBreakdown, perCategoryShares };
};

// amount 를 n 명에게 균등 분배. 나머지는 leftoverAt 위치에 더한다 (기본 0).
const distribute = (amount: number, n: number, leftoverAt = 0): number[] => {
  if (n <= 0) return [];
  const per = Math.floor(amount / n);
  const remainder = amount - per * n;
  const out = new Array<number>(n).fill(per);
  if (remainder > 0) {
    const idx = leftoverAt >= 0 && leftoverAt < n ? leftoverAt : 0;
    out[idx] = (out[idx] ?? 0) + remainder;
  }
  return out;
};

// participates[i]=true 인 사람에게만 분배. false 는 0. leftoverParticipantIdx
// 는 participates 배열의 인덱스 — 그 사람이 활성자이면 그 위치에 잔여,
// 아니면 첫 활성자에 잔여.
const distributeWith = (
  amount: number,
  participates: boolean[],
  leftoverParticipantIdx?: number,
): number[] => {
  const activeIdx: number[] = [];
  participates.forEach((p, i) => {
    if (p) activeIdx.push(i);
  });
  const leftoverAt =
    leftoverParticipantIdx != null
      ? activeIdx.indexOf(leftoverParticipantIdx)
      : 0;
  const distributed = distribute(
    amount,
    activeIdx.length,
    leftoverAt >= 0 ? leftoverAt : 0,
  );
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
  // 한 풀에서만 차감되는 단일 할인. 없으면 null/undefined.
  discount?: { amount: number; category: ReceiptItemCategoryType } | null;
  // 카테고리별 잔여 보정. participantIndex 는 '마스터' 인덱스 단위 —
  // calculateMultiRoundShares 가 참석자 인덱스로 변환해 calculateShares 에 전달.
  categoryAdjustments?: CategoryAdjustmentsInput | null;
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
  // 마스터 인덱스 단위 카테고리별 분담 — 정산표 매트릭스 UI 가 사용.
  // 비참석자/제외자는 0. 차수에 카테고리 자체가 없으면 그 카테고리 배열 전체가 0.
  perCategoryShares: CalculateOutput['perCategoryShares'];
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
    // 마스터 인덱스 → 참석자 배열 인덱스 매핑. categoryAdjustments 를
    // 참석자 인덱스 단위로 변환하기 위해 사용.
    const masterToAttendee = new Map<number, number>();
    round.attendees.forEach((a, i) => masterToAttendee.set(a.participantIndex, i));
    const innerAdj: CategoryAdjustmentsInput | null = round.categoryAdjustments
      ? Object.fromEntries(
          (Object.entries(round.categoryAdjustments) as [
            ReceiptItemCategoryType,
            { leftoverParticipantIndex: number; roundUnit: number | null } | undefined,
          ][])
            .filter(([, v]) => v != null)
            .map(([cat, v]) => [
              cat,
              {
                // 마스터 인덱스의 참여자가 이 차수에 참석 안 했으면 -1 →
                // calculateShares 가 첫 활성자로 fallback.
                leftoverParticipantIndex:
                  masterToAttendee.get(v!.leftoverParticipantIndex) ?? -1,
                roundUnit: v!.roundUnit,
              },
            ]),
        )
      : null;

    // 비참석자는 입력에 빠져 있으므로, 참석자만으로 calculateShares 호출.
    const inner = calculateShares({
      items: round.items,
      participants: round.attendees.map((a) => ({
        excludeAlcohol: a.excludeAlcohol,
        excludeNonAlcohol: a.excludeNonAlcohol,
        excludeSide: a.excludeSide,
      })),
      discount: round.discount ?? null,
      categoryAdjustments: innerAdj,
    });

    // 참석자 인덱스 → 마스터 인덱스로 되돌려 share 배열을 부풀린다.
    const shareAmounts = new Array<number>(input.participantCount).fill(0);
    const perCategoryShares = {} as CalculateOutput['perCategoryShares'];
    for (const category of CATEGORIES) {
      perCategoryShares[category] = new Array<number>(input.participantCount).fill(0);
    }
    round.attendees.forEach((a, i) => {
      const amt = inner.shareAmounts[i] ?? 0;
      shareAmounts[a.participantIndex] = amt;
      perParticipant[a.participantIndex] =
        (perParticipant[a.participantIndex] ?? 0) + amt;
      for (const category of CATEGORIES) {
        perCategoryShares[category]![a.participantIndex] =
          inner.perCategoryShares[category]?.[i] ?? 0;
      }
    });
    grandTotal += inner.itemsSubtotal;
    perRound.push({
      shareAmounts,
      itemsSubtotal: inner.itemsSubtotal,
      poolBreakdown: inner.poolBreakdown,
      perCategoryShares,
    });
  }

  return { perParticipant, perRound, grandTotal };
};
