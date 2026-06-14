import type { ReceiptItemCategoryType } from './schemas/settlement-extraction.js';
import type {
  SettlementGroupSplitModeType,
  SettlementItemGroupType,
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
// - 세부 분배 그룹(groups): 한 카테고리 풀에서 특정 항목들(예: 소주, 맥주)을
//   떼어내 그룹 멤버끼리만 나눈다. EQUAL = 균등, GLASSES = 잔수 비례.
//   그룹에 안 묶인 항목은 '나머지 풀' 로 남아 기존 카테고리 균등 규칙을 따른다.

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

// 세부 분배 그룹 — participantIndex 는 calculateShares 의 participants 배열
// 인덱스. glasses 는 0 이상의 정수 잔수(가중치) 로 EQUAL 모드에선 무시된다.
export interface GroupMemberCalcInput {
  participantIndex: number;
  glasses: number;
}

export interface GroupCalcInput {
  category: ReceiptItemCategoryType;
  // 이 그룹에 묶인 항목의 items 배열 인덱스. 카테고리 불일치/범위 밖/중복
  // 인덱스는 스키마가 막지만 계산기도 방어적으로 무시한다.
  itemIndexes: number[];
  mode: SettlementGroupSplitModeType;
  members: GroupMemberCalcInput[];
}

// 그룹별 분배 결과 — 입력 groups 와 같은 순서.
export interface GroupShareBreakdown {
  // 할인 비례 차감 후 그룹 풀. applied=false(나머지 풀로 환원)면 0.
  poolAmount: number;
  // 분배에 실제 쓰인 잔수 합. EQUAL 이거나 잔수 합 0 으로 균등 fallback 이면 0.
  totalGlasses: number;
  // 참여자 단위 분담 (calculateShares 에선 입력 participants 인덱스,
  // calculateMultiRoundShares 에선 마스터 인덱스).
  shares: number[];
  // false = 유효 멤버가 한 명도 없어 그룹 풀이 나머지(균등) 풀로 환원됨.
  applied: boolean;
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
      // 카테고리 전체 effective 풀 (그룹 + 나머지, 할인 차감 후). 정산표
      // 매트릭스의 열 합 invariant 가 이 값에 의존한다.
      poolAmount: number;
      // 나머지(균등) 풀의 활성 인원수.
      participantCount: number;
      // 나머지(균등) 풀 기준 인당 floor — 그룹 분담은 포함하지 않는다.
      perParticipant: number;
      // 나머지(균등) 풀 금액. 그룹이 없으면 poolAmount 와 같다. '분담 다듬기'
      // 의 잔여 판단은 이 값을 기준으로 한다.
      equalPoolAmount: number;
    }
  >;
  // 카테고리 × 참여자 분담 매트릭스 — '정산표' (이름 × 카테고리) UI 가 사용.
  // 합산하면 shareAmounts[i] 와 같다 (그룹 분담 포함). fallback(전원 제외)
  // 케이스에도 의미상의 분담을 그대로 카테고리 키에 기록한다 (예: ALCOHOL
  // 풀이 전원 제외라 UNCATEGORIZED 처럼 균등 분담된 경우,
  // perCategoryShares.ALCOHOL[i] 에 그 값이 들어간다 — '주류' 컬럼에 음식값이
  // 박혀 이상해 보일 수 있지만 합산은 정확. UI 측에선 poolBreakdown 으로
  // '실제 풀' 인지 fallback 인지 구분 가능).
  perCategoryShares: Record<ReceiptItemCategoryType, number[]>;
  // 입력 groups 와 같은 순서의 그룹별 분배 결과. groups 미사용이면 빈 배열.
  groupBreakdown: GroupShareBreakdown[];
}

// 카테고리별 잔여 처리 보정. participantIndex 는 calculateShares 의
// participants 배열 인덱스. roundUnit 이 있으면 풀을 그 단위로 round 후
// 균등 분배 — 단, round 한 풀이 인원수로 떨어져야 한다. 안 떨어지면 안전망
// 으로 무시하고 잔여 가산 모드로 fallback (UI 가 활성 조건 검사 + 서비스
// 검증으로 실제로 도달하지 않게 한다).
export type CategoryAdjustmentsInput = Partial<
  Record<
    ReceiptItemCategoryType,
    { leftoverParticipantIndexes: number[]; roundUnit: number | null }
  >
>;

export const calculateShares = (
  input: CalculateInput & {
    // 옵션 — 한 카테고리 풀에서만 차감되는 단일 할인. 풀 음수 방어로 클램프
    // (입력 검증은 스키마 refine 으로 막혀 있다).
    discount?: { amount: number; category: ReceiptItemCategoryType } | null;
    categoryAdjustments?: CategoryAdjustmentsInput | null;
    groups?: GroupCalcInput[] | null;
  },
): CalculateOutput => {
  const discount = input.discount ?? null;
  const adjustments = input.categoryAdjustments ?? null;
  const groups = input.groups ?? [];
  const participantCount = input.participants.length;

  const shareAmounts = new Array<number>(participantCount).fill(0);
  const poolBreakdown = {} as CalculateOutput['poolBreakdown'];
  const perCategoryShares = {} as CalculateOutput['perCategoryShares'];
  const groupBreakdown: GroupShareBreakdown[] = groups.map(() => ({
    poolAmount: 0,
    totalGlasses: 0,
    shares: new Array<number>(participantCount).fill(0),
    applied: false,
  }));

  // 항목 인덱스 → 그룹 인덱스. 중복·카테고리 불일치·범위 밖은 스키마가 막지만
  // 방어적으로: 불일치/범위 밖은 무시, 중복은 첫 그룹만 인정.
  const itemToGroup = new Map<number, number>();
  groups.forEach((g, gi) => {
    for (const idx of g.itemIndexes) {
      const it = input.items[idx];
      if (!it || it.category !== g.category) continue;
      if (!itemToGroup.has(idx)) itemToGroup.set(idx, gi);
    }
  });

  let itemsSubtotal = 0;

  for (const category of CATEGORIES) {
    // 카테고리 raw 풀을 그룹별 풀 + 나머지 풀로 분해.
    let rawPool = 0;
    const groupRaw = new Map<number, number>();
    input.items.forEach((it, idx) => {
      if (it.category !== category) return;
      rawPool += it.amount;
      const gi = itemToGroup.get(idx);
      if (gi != null) groupRaw.set(gi, (groupRaw.get(gi) ?? 0) + it.amount);
    });
    const activeGroupIdxs = [...groupRaw.keys()].sort((a, b) => a - b);
    const groupedRaw = activeGroupIdxs.reduce(
      (sum, gi) => sum + (groupRaw.get(gi) ?? 0),
      0,
    );
    const ungroupedRaw = rawPool - groupedRaw;

    // 할인 — 카테고리 한정. 나머지/그룹 풀에 금액 비례로 차감해 합이 정확히
    // min(할인, 풀) 만큼 줄어들게 한다.
    const discountTotal =
      discount && discount.category === category
        ? Math.min(discount.amount, rawPool)
        : 0;
    const discountAlloc = distributeByWeight(discountTotal, [
      ungroupedRaw,
      ...activeGroupIdxs.map((gi) => groupRaw.get(gi) ?? 0),
    ]);

    // 이 카테고리에서 각 참여자가 진 분담만 따로 누적 (UI 매트릭스용).
    const categoryShares = new Array<number>(participantCount).fill(0);
    let appliedGroupPool = 0;
    let equalPool = ungroupedRaw - (discountAlloc[0] ?? 0);

    // 그룹 풀 분배 — 유효 멤버가 한 명도 없으면 나머지(균등) 풀로 환원.
    activeGroupIdxs.forEach((gi, k) => {
      const g = groups[gi]!;
      const bd = groupBreakdown[gi]!;
      const pool = (groupRaw.get(gi) ?? 0) - (discountAlloc[k + 1] ?? 0);
      // 같은 참여자 중복은 스키마가 막지만 방어적으로 첫 항목만 인정.
      const seen = new Set<number>();
      const members = g.members.filter((m) => {
        if (m.participantIndex < 0 || m.participantIndex >= participantCount) {
          return false;
        }
        if (seen.has(m.participantIndex)) return false;
        seen.add(m.participantIndex);
        return true;
      });
      if (members.length === 0) {
        equalPool += pool;
        return;
      }
      bd.applied = true;
      bd.poolAmount = pool;
      if (pool <= 0) return;
      // GLASSES 인데 잔수 합이 0 이면 균등으로 fallback (전원 0잔 입력 방어).
      const glassSum = members.reduce((sum, m) => sum + Math.max(0, m.glasses), 0);
      const useGlasses = g.mode === 'GLASSES' && glassSum > 0;
      bd.totalGlasses = useGlasses ? glassSum : 0;
      const weights = members.map((m) => (useGlasses ? Math.max(0, m.glasses) : 1));
      const dist = distributeByWeight(pool, weights);
      members.forEach((m, mi) => {
        const v = dist[mi] ?? 0;
        bd.shares[m.participantIndex] = (bd.shares[m.participantIndex] ?? 0) + v;
        shareAmounts[m.participantIndex] = (shareAmounts[m.participantIndex] ?? 0) + v;
        categoryShares[m.participantIndex] =
          (categoryShares[m.participantIndex] ?? 0) + v;
      });
      appliedGroupPool += pool;
    });

    // ── 나머지(균등) 풀 — 기존 카테고리 균등 분배 규칙 그대로 ──
    // 어떤 참여자가 이 풀에 참여하는가. UNCATEGORIZED 는 전원 참여.
    const excludeKey = EXCLUDE_KEY[category];
    const participates: boolean[] =
      excludeKey === null
        ? input.participants.map(() => true)
        : input.participants.map((p) => !p[excludeKey]);

    let activeCount = participates.filter(Boolean).length;
    // 사용자 보정(roundUnit) — 나머지 풀을 round 후 인원수로 나눠떨어질 때만
    // 적용. 안 떨어지면 무시하고 잔여 가산 모드 (그룹 풀에는 적용하지 않는다 —
    // 그룹 잔여는 distributeByWeight 가 1원씩 자동 분산).
    const adj = adjustments?.[category] ?? null;
    if (adj && adj.roundUnit != null && activeCount > 0 && equalPool > 0) {
      const rounded = Math.round(equalPool / adj.roundUnit) * adj.roundUnit;
      if (rounded % activeCount === 0) equalPool = rounded;
    }

    // 풀에서 모두 빠졌다면(=주류가 있는데 전원 안 마심) 그 금액을 미분류 풀
    // 처럼 모두에게 균등 분담. 빈 풀은 그대로 0.
    let displayEqualPool = equalPool;
    if (activeCount === 0 && equalPool > 0) {
      const fallback = distribute(equalPool, participantCount);
      for (let i = 0; i < participantCount; i += 1) {
        const v = fallback[i] ?? 0;
        shareAmounts[i] = (shareAmounts[i] ?? 0) + v;
        categoryShares[i] = (categoryShares[i] ?? 0) + v;
      }
      activeCount = participantCount;
      // 풀 표시는 0 (이 카테고리는 비움) — 매트릭스 컬럼 합 invariant 는
      // categoryShares 가 채우니까 사용자에겐 잔여 카테고리 컬럼에 음식값이
      // 박혀 보일 수 있다(기존 동작과 동일). 분배된 금액 자체는 아래에서
      // itemsSubtotal 에 합산된다.
      displayEqualPool = 0;
    } else if (equalPool > 0 && activeCount > 0) {
      const distributed = distributeWith(
        equalPool,
        participates,
        adj?.leftoverParticipantIndexes,
      );
      for (let i = 0; i < participantCount; i += 1) {
        const v = distributed[i] ?? 0;
        shareAmounts[i] = (shareAmounts[i] ?? 0) + v;
        categoryShares[i] = (categoryShares[i] ?? 0) + v;
      }
    }

    poolBreakdown[category] = {
      poolAmount: appliedGroupPool + displayEqualPool,
      participantCount: activeCount,
      perParticipant:
        activeCount > 0 && displayEqualPool > 0
          ? Math.floor(displayEqualPool / activeCount)
          : 0,
      equalPoolAmount: displayEqualPool,
    };
    perCategoryShares[category] = categoryShares;
    // 실제 분배된 금액 합 — 전원 제외 fallback 으로 분담된 몫도 포함한다
    // (과거엔 fallback 금액이 빠져 grandTotal 이 분담 합과 어긋났다).
    itemsSubtotal += appliedGroupPool + equalPool;
  }

  return { shareAmounts, itemsSubtotal, poolBreakdown, perCategoryShares, groupBreakdown };
};

// amount 를 weights 비례로 분배 — floor 후 1원 잔여는 나머지(소수부) 큰 순서,
// 같으면 앞 사람부터 1원씩. weights 합이 0 이면 전부 0. 정수 연산만 사용해
// 합이 정확히 amount 가 되는 것을 보장한다.
const distributeByWeight = (amount: number, weights: number[]): number[] => {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0 || amount <= 0) return weights.map(() => 0);
  const out = new Array<number>(weights.length).fill(0);
  const rems: { rem: number; i: number }[] = [];
  let assigned = 0;
  weights.forEach((w0, i) => {
    const w = Math.max(0, w0);
    const exact = amount * w; // 현실 금액(수백만원)×잔수 범위에서 안전.
    const base = Math.floor(exact / total);
    out[i] = base;
    assigned += base;
    rems.push({ rem: exact % total, i });
  });
  let leftover = amount - assigned;
  rems.sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of rems) {
    if (leftover <= 0) break;
    out[i] = (out[i] ?? 0) + 1;
    leftover -= 1;
  }
  return out;
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

// participates[i]=true 인 사람에게만 분배. false 는 0. leftoverParticipantIdxs
// 는 participates 배열의 인덱스(들) — 균등 분배 후 남는 1원 단위 잔여를 받을
// 사람(들). 1명이면 그 사람이 전부 흡수('몰아주기'), 여러 명이면 잔여를 그들
// 끼리 다시 균등 분배('나눠 받기'). 활성자가 아닌 수령자는 무시하고, 유효
// 수령자가 0명이면 첫 활성자로 fallback.
const distributeWith = (
  amount: number,
  participates: boolean[],
  leftoverParticipantIdxs?: number[],
): number[] => {
  const activeIdx: number[] = [];
  participates.forEach((p, i) => {
    if (p) activeIdx.push(i);
  });
  const out = new Array<number>(participates.length).fill(0);
  const n = activeIdx.length;
  if (n === 0 || amount <= 0) return out;

  const per = Math.floor(amount / n);
  activeIdx.forEach((i) => {
    out[i] = per;
  });
  let remainder = amount - per * n;
  if (remainder <= 0) return out;

  // 잔여 수령자 — 지정된 활성 수령자(중복 제거, 순서 유지), 없으면 첫 활성자.
  let receivers = (leftoverParticipantIdxs ?? []).filter((i) => participates[i]);
  receivers = receivers.filter((i, k) => receivers.indexOf(i) === k);
  if (receivers.length === 0) receivers = [activeIdx[0]!];

  // 잔여를 수령자끼리 균등 분배 (수령자 1명이면 전부 그 사람에게).
  const share = distribute(remainder, receivers.length);
  receivers.forEach((i, k) => {
    out[i] = (out[i] ?? 0) + (share[k] ?? 0);
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
  // 세부 분배 그룹. 멤버의 participantIndex 는 '마스터' 인덱스 단위 —
  // 래퍼가 참석자 인덱스로 변환하고, 이 차수 비참석 멤버는 자동으로 뺀다.
  groups?: GroupCalcInput[] | null;
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
  // 입력 round.groups 와 같은 순서. shares 는 마스터 인덱스 단위.
  groupBreakdown: GroupShareBreakdown[];
}

export interface MultiRoundCalcOutput {
  // 마스터 인덱스 단위 grand total.
  perParticipant: number[];
  perRound: PerRoundCalcOutput[];
  grandTotal: number;
}

// 저장된 세션 응답의 groupSplits(멤버가 participantId 로 참조)를 계산기
// 입력으로 변환한다. 정산표 매트릭스(웹)·공유 OG PNG(서버)가 공용으로 사용.
// 매핑 안 되는 participantId 는 -1 → calculator 가 방어적으로 무시.
export const toGroupCalcInputs = (
  groupSplits: SettlementItemGroupType[] | null,
  participantIndexById: Map<string, number>,
): GroupCalcInput[] | null =>
  groupSplits
    ? groupSplits.map((g) => ({
        category: g.category,
        itemIndexes: g.itemIndexes,
        mode: g.mode,
        members: g.members.map((m) => ({
          participantIndex: participantIndexById.get(m.participantId) ?? -1,
          glasses: m.glasses,
        })),
      }))
    : null;

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
            { leftoverParticipantIndexes: number[]; roundUnit: number | null } | undefined,
          ][])
            .filter(([, v]) => v != null)
            .map(([cat, v]) => [
              cat,
              {
                // 마스터 인덱스 → 참석자 인덱스. 이 차수 비참석 수령자는 빠지고
                // (남은 수령자 0명이면 calculateShares 가 첫 활성자로 fallback).
                leftoverParticipantIndexes: v!.leftoverParticipantIndexes
                  .map((idx) => masterToAttendee.get(idx) ?? -1)
                  .filter((idx) => idx >= 0),
                roundUnit: v!.roundUnit,
              },
            ]),
        )
      : null;

    // 그룹 멤버의 마스터 인덱스 → 참석자 인덱스. 이 차수 비참석 멤버는 뺀다 —
    // 남는 멤버가 0명이 되면 calculateShares 가 그룹 풀을 나머지 풀로 환원.
    const innerGroups: GroupCalcInput[] = (round.groups ?? []).map((g) => ({
      ...g,
      members: g.members
        .map((m) => ({
          participantIndex: masterToAttendee.get(m.participantIndex) ?? -1,
          glasses: m.glasses,
        }))
        .filter((m) => m.participantIndex >= 0),
    }));

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
      groups: innerGroups,
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
    // 그룹별 shares 도 참석자 → 마스터 인덱스로 부풀린다.
    const groupBreakdown = inner.groupBreakdown.map((bd) => {
      const shares = new Array<number>(input.participantCount).fill(0);
      round.attendees.forEach((a, i) => {
        shares[a.participantIndex] = bd.shares[i] ?? 0;
      });
      return { ...bd, shares };
    });
    grandTotal += inner.itemsSubtotal;
    perRound.push({
      shareAmounts,
      itemsSubtotal: inner.itemsSubtotal,
      poolBreakdown: inner.poolBreakdown,
      perCategoryShares,
      groupBreakdown,
    });
  }

  return { perParticipant, perRound, grandTotal };
};
