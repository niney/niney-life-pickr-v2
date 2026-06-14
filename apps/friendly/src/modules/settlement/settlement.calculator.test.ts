import { describe, expect, it } from 'vitest';
import {
  calculateMultiRoundShares,
  calculateShares,
  effectiveExcludes,
} from '@repo/api-contract';

const noExclude = (n: number) =>
  Array.from({ length: n }, () => ({
    excludeAlcohol: false,
    excludeNonAlcohol: false,
    excludeSide: false,
  }));

describe('calculateShares', () => {
  it('splits evenly when no exclusions and uncategorized items', () => {
    const r = calculateShares({
      items: [
        { amount: 30000, category: 'UNCATEGORIZED' },
        { amount: 10000, category: 'UNCATEGORIZED' },
      ],
      participants: noExclude(4),
    });
    expect(r.itemsSubtotal).toBe(40000);
    expect(r.shareAmounts).toEqual([10000, 10000, 10000, 10000]);
    expect(r.shareAmounts.reduce((a, b) => a + b, 0)).toBe(40000);
  });

  it('puts 1원 단위 remainder on the first participant', () => {
    const r = calculateShares({
      items: [{ amount: 10000, category: 'UNCATEGORIZED' }],
      participants: noExclude(3),
    });
    // 10000 / 3 = 3333 ... 1원 부족 → 첫 사람에게 +1
    expect(r.shareAmounts).toEqual([3334, 3333, 3333]);
    expect(r.shareAmounts.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('excludes alcohol from the alcohol pool only', () => {
    const r = calculateShares({
      items: [
        { amount: 20000, category: 'ALCOHOL' }, // 술 — A만 안 마심
        { amount: 60000, category: 'SIDE' }, // 안주 — 다 같이
      ],
      participants: [
        { excludeAlcohol: true, excludeNonAlcohol: false, excludeSide: false }, // A
        { excludeAlcohol: false, excludeNonAlcohol: false, excludeSide: false },
        { excludeAlcohol: false, excludeNonAlcohol: false, excludeSide: false },
      ],
    });
    // ALCOHOL 20000 ÷ 2 = 10000 (B, C)
    // SIDE 60000 ÷ 3 = 20000 (전원)
    expect(r.shareAmounts).toEqual([20000, 30000, 30000]);
    expect(r.shareAmounts.reduce((a, b) => a + b, 0)).toBe(80000);
    expect(r.poolBreakdown.ALCOHOL).toMatchObject({
      poolAmount: 20000,
      participantCount: 2,
      perParticipant: 10000,
    });
    expect(r.poolBreakdown.SIDE).toMatchObject({
      poolAmount: 60000,
      participantCount: 3,
      perParticipant: 20000,
    });
  });

  it('falls back to even split when everyone excludes the category', () => {
    // 모두 술 안 마시는데 영수증에 주류가 있으면 그 금액은 전원 균등 부담
    // (사용자 입력 모순이지만 안전하게 처리)
    const r = calculateShares({
      items: [{ amount: 9000, category: 'ALCOHOL' }],
      participants: [
        { excludeAlcohol: true, excludeNonAlcohol: false, excludeSide: false },
        { excludeAlcohol: true, excludeNonAlcohol: false, excludeSide: false },
        { excludeAlcohol: true, excludeNonAlcohol: false, excludeSide: false },
      ],
    });
    expect(r.shareAmounts).toEqual([3000, 3000, 3000]);
    expect(r.poolBreakdown.ALCOHOL.participantCount).toBe(3);
    // 전원 제외 fallback 으로 분배된 금액도 itemsSubtotal 에 포함되어야
    // grandTotal 이 분담 합과 일치한다 (과거엔 빠져서 0 으로 보고됐다).
    expect(r.itemsSubtotal).toBe(9000);
  });

  it('combines multiple categories with different exclusion sets', () => {
    const r = calculateShares({
      items: [
        { amount: 30000, category: 'ALCOHOL' },
        { amount: 12000, category: 'NON_ALCOHOL' },
        { amount: 48000, category: 'SIDE' },
        { amount: 6000, category: 'UNCATEGORIZED' },
      ],
      participants: [
        { excludeAlcohol: true, excludeNonAlcohol: false, excludeSide: false }, // A
        { excludeAlcohol: false, excludeNonAlcohol: true, excludeSide: false }, // B
        { excludeAlcohol: false, excludeNonAlcohol: false, excludeSide: true }, // C
        { excludeAlcohol: false, excludeNonAlcohol: false, excludeSide: false }, // D
      ],
    });
    // ALCOHOL 30000 ÷ 3 (B,C,D) = 10000
    // NON_ALCOHOL 12000 ÷ 3 (A,C,D) = 4000
    // SIDE 48000 ÷ 3 (A,B,D) = 16000
    // UNCAT 6000 ÷ 4 = 1500
    expect(r.shareAmounts).toEqual([
      0 + 4000 + 16000 + 1500, // A: 21500
      10000 + 0 + 16000 + 1500, // B: 27500
      10000 + 4000 + 0 + 1500, // C: 15500
      10000 + 4000 + 16000 + 1500, // D: 31500
    ]);
    expect(r.shareAmounts.reduce((a, b) => a + b, 0)).toBe(96000);
  });

  it('handles empty pools without producing NaN', () => {
    const r = calculateShares({
      items: [{ amount: 9000, category: 'UNCATEGORIZED' }],
      participants: noExclude(3),
    });
    expect(r.poolBreakdown.ALCOHOL.poolAmount).toBe(0);
    expect(r.poolBreakdown.ALCOHOL.perParticipant).toBe(0);
    expect(r.shareAmounts).toEqual([3000, 3000, 3000]);
  });

  it('perCategoryShares sums per row to shareAmounts and per col to poolAmount', () => {
    // 정산표 매트릭스 행/열 검산 — UI 가 이 불변식에 의존.
    const r = calculateShares({
      items: [
        { amount: 30000, category: 'ALCOHOL' },
        { amount: 12000, category: 'NON_ALCOHOL' },
        { amount: 48000, category: 'SIDE' },
        { amount: 6000, category: 'UNCATEGORIZED' },
      ],
      participants: [
        { excludeAlcohol: true, excludeNonAlcohol: false, excludeSide: false },
        { excludeAlcohol: false, excludeNonAlcohol: true, excludeSide: false },
        { excludeAlcohol: false, excludeNonAlcohol: false, excludeSide: true },
        { excludeAlcohol: false, excludeNonAlcohol: false, excludeSide: false },
      ],
    });
    // 행 합 = shareAmounts[i]
    for (let i = 0; i < 4; i += 1) {
      const rowSum =
        (r.perCategoryShares.ALCOHOL[i] ?? 0) +
        (r.perCategoryShares.NON_ALCOHOL[i] ?? 0) +
        (r.perCategoryShares.SIDE[i] ?? 0) +
        (r.perCategoryShares.UNCATEGORIZED[i] ?? 0);
      expect(rowSum).toBe(r.shareAmounts[i]);
    }
    // 열 합 = 풀 amount
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    expect(sum(r.perCategoryShares.ALCOHOL)).toBe(30000);
    expect(sum(r.perCategoryShares.NON_ALCOHOL)).toBe(12000);
    expect(sum(r.perCategoryShares.SIDE)).toBe(48000);
    expect(sum(r.perCategoryShares.UNCATEGORIZED)).toBe(6000);
  });
});

describe('calculateShares — 세부 분배 그룹', () => {
  it('splits a GLASSES group proportionally by glasses', () => {
    // 소주 24,000 을 3잔:1잔 → 18,000 / 6,000.
    const r = calculateShares({
      items: [{ amount: 24000, category: 'ALCOHOL' }],
      participants: noExclude(2),
      groups: [
        {
          category: 'ALCOHOL',
          itemIndexes: [0],
          mode: 'GLASSES',
          members: [
            { participantIndex: 0, glasses: 3 },
            { participantIndex: 1, glasses: 1 },
          ],
        },
      ],
    });
    expect(r.shareAmounts).toEqual([18000, 6000]);
    expect(r.itemsSubtotal).toBe(24000);
    expect(r.groupBreakdown[0]).toMatchObject({
      applied: true,
      poolAmount: 24000,
      totalGlasses: 4,
    });
    expect(r.groupBreakdown[0]?.shares).toEqual([18000, 6000]);
    // 그룹이 카테고리 전부를 가져가면 나머지(균등) 풀은 0.
    expect(r.poolBreakdown.ALCOHOL).toMatchObject({
      poolAmount: 24000,
      equalPoolAmount: 0,
      perParticipant: 0,
    });
  });

  it('EQUAL group charges members only; ungrouped items follow category rules', () => {
    // 참이슬(그룹, A·B 균등) + 기타 주류(나머지 풀, 전원) + 안주(전원).
    const r = calculateShares({
      items: [
        { amount: 12000, category: 'ALCOHOL' }, // 그룹
        { amount: 9000, category: 'ALCOHOL' }, // 나머지 풀
        { amount: 30000, category: 'SIDE' },
      ],
      participants: noExclude(3),
      groups: [
        {
          category: 'ALCOHOL',
          itemIndexes: [0],
          mode: 'EQUAL',
          members: [
            { participantIndex: 0, glasses: 1 },
            { participantIndex: 1, glasses: 1 },
          ],
        },
      ],
    });
    // 그룹 12000÷2 = 6000 (A,B). 나머지 9000÷3 = 3000. 안주 30000÷3 = 10000.
    expect(r.shareAmounts).toEqual([19000, 19000, 13000]);
    expect(r.poolBreakdown.ALCOHOL).toMatchObject({
      poolAmount: 21000,
      equalPoolAmount: 9000,
      participantCount: 3,
      perParticipant: 3000,
    });
    // 매트릭스 열 합 invariant — 그룹 분담도 카테고리 컬럼에 포함.
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    expect(sum(r.perCategoryShares.ALCOHOL)).toBe(21000);
  });

  it('distributes GLASSES remainder by largest fractional part', () => {
    // 1000 을 2잔:1잔 → 666.67/333.33 → 잔여 1원은 소수부 큰 쪽(앞)으로.
    const r = calculateShares({
      items: [{ amount: 1000, category: 'ALCOHOL' }],
      participants: noExclude(2),
      groups: [
        {
          category: 'ALCOHOL',
          itemIndexes: [0],
          mode: 'GLASSES',
          members: [
            { participantIndex: 0, glasses: 2 },
            { participantIndex: 1, glasses: 1 },
          ],
        },
      ],
    });
    expect(r.shareAmounts).toEqual([667, 333]);
  });

  it('falls back to EQUAL inside the group when all glasses are zero', () => {
    const r = calculateShares({
      items: [{ amount: 9000, category: 'ALCOHOL' }],
      participants: noExclude(3),
      groups: [
        {
          category: 'ALCOHOL',
          itemIndexes: [0],
          mode: 'GLASSES',
          members: [
            { participantIndex: 0, glasses: 0 },
            { participantIndex: 1, glasses: 0 },
            { participantIndex: 2, glasses: 0 },
          ],
        },
      ],
    });
    expect(r.shareAmounts).toEqual([3000, 3000, 3000]);
    expect(r.groupBreakdown[0]).toMatchObject({ applied: true, totalGlasses: 0 });
  });

  it('reverts the group pool to the equal pool when no valid members remain', () => {
    // 멤버 인덱스가 전부 범위 밖 → 그룹 비활성, 카테고리 균등으로 환원.
    const r = calculateShares({
      items: [{ amount: 8000, category: 'ALCOHOL' }],
      participants: noExclude(2),
      groups: [
        {
          category: 'ALCOHOL',
          itemIndexes: [0],
          mode: 'GLASSES',
          members: [{ participantIndex: 9, glasses: 2 }],
        },
      ],
    });
    expect(r.shareAmounts).toEqual([4000, 4000]);
    expect(r.groupBreakdown[0]).toMatchObject({ applied: false, poolAmount: 0 });
    expect(r.poolBreakdown.ALCOHOL.equalPoolAmount).toBe(8000);
  });

  it('allocates a category discount proportionally across group and equal pools', () => {
    // ALCOHOL 30,000 = 그룹 20,000 + 나머지 10,000. 할인 3,000 → 2,000/1,000 비례.
    const r = calculateShares({
      items: [
        { amount: 20000, category: 'ALCOHOL' },
        { amount: 10000, category: 'ALCOHOL' },
      ],
      participants: noExclude(2),
      discount: { amount: 3000, category: 'ALCOHOL' },
      groups: [
        {
          category: 'ALCOHOL',
          itemIndexes: [0],
          mode: 'GLASSES',
          members: [
            { participantIndex: 0, glasses: 3 },
            { participantIndex: 1, glasses: 1 },
          ],
        },
      ],
    });
    // 그룹 18,000 → 13,500/4,500. 나머지 9,000 → 4,500/4,500.
    expect(r.shareAmounts).toEqual([18000, 9000]);
    expect(r.itemsSubtotal).toBe(27000);
    expect(r.groupBreakdown[0]?.poolAmount).toBe(18000);
    expect(r.poolBreakdown.ALCOHOL).toMatchObject({
      poolAmount: 27000,
      equalPoolAmount: 9000,
    });
  });

  it('applies roundUnit adjustment to the equal pool only', () => {
    // 그룹 7,000(A 단독) + 나머지 1,003. 100원 반올림 → 나머지 1,000 → 500/500.
    const r = calculateShares({
      items: [
        { amount: 7000, category: 'ALCOHOL' },
        { amount: 1003, category: 'ALCOHOL' },
      ],
      participants: noExclude(2),
      categoryAdjustments: {
        ALCOHOL: { leftoverParticipantIndexes: [0], roundUnit: 100 },
      },
      groups: [
        {
          category: 'ALCOHOL',
          itemIndexes: [0],
          mode: 'EQUAL',
          members: [{ participantIndex: 0, glasses: 1 }],
        },
      ],
    });
    expect(r.shareAmounts).toEqual([7500, 500]);
    expect(r.itemsSubtotal).toBe(8000);
    expect(r.poolBreakdown.ALCOHOL).toMatchObject({
      poolAmount: 8000,
      equalPoolAmount: 1000,
    });
  });

  it('splits the 1-won remainder across multiple leftover receivers', () => {
    // 3,002 / 3명 → 인당 1,000 + 잔여 2. 수령자 [1,2] 가 1원씩 나눠 받는다.
    const r = calculateShares({
      items: [{ amount: 3002, category: 'UNCATEGORIZED' }],
      participants: noExclude(3),
      categoryAdjustments: {
        UNCATEGORIZED: { leftoverParticipantIndexes: [1, 2], roundUnit: null },
      },
    });
    expect(r.shareAmounts).toEqual([1000, 1001, 1001]);
  });

  it('dumps the whole remainder on a single leftover receiver (legacy)', () => {
    // 3,002 / 3명 → 잔여 2 를 한 명(인덱스 2) 이 전부 흡수 = 몰아주기.
    const r = calculateShares({
      items: [{ amount: 3002, category: 'UNCATEGORIZED' }],
      participants: noExclude(3),
      categoryAdjustments: {
        UNCATEGORIZED: { leftoverParticipantIndexes: [2], roundUnit: null },
      },
    });
    expect(r.shareAmounts).toEqual([1000, 1000, 1002]);
  });
});

describe('effectiveExcludes', () => {
  it('uses master defaults when overrides are null', () => {
    const r = effectiveExcludes(
      { excludeAlcohol: true, excludeNonAlcohol: false, excludeSide: false },
      {
        excludeAlcoholOverride: null,
        excludeNonAlcoholOverride: null,
        excludeSideOverride: null,
      },
    );
    expect(r).toEqual({
      excludeAlcohol: true,
      excludeNonAlcohol: false,
      excludeSide: false,
    });
  });

  it('lets round overrides flip the master value either way', () => {
    const r = effectiveExcludes(
      { excludeAlcohol: true, excludeNonAlcohol: false, excludeSide: false },
      {
        // master 가 true 인데도 이 차수만 마심 — false 로 덮어쓰기.
        excludeAlcoholOverride: false,
        excludeNonAlcoholOverride: null,
        // master 가 false 인데 이 차수는 안 먹음 — true 로 덮어쓰기.
        excludeSideOverride: true,
      },
    );
    expect(r).toEqual({
      excludeAlcohol: false,
      excludeNonAlcohol: false,
      excludeSide: true,
    });
  });
});

describe('calculateMultiRoundShares', () => {
  it('splits each round independently and sums grand total per master', () => {
    // A,B,C 3명. 1차 전원 — UNCAT 30,000. 2차 A,B 만 — UNCAT 10,000.
    const r = calculateMultiRoundShares({
      participantCount: 3,
      rounds: [
        {
          items: [{ amount: 30000, category: 'UNCATEGORIZED' }],
          attendees: [
            {
              participantIndex: 0,
              excludeAlcohol: false,
              excludeNonAlcohol: false,
              excludeSide: false,
            },
            {
              participantIndex: 1,
              excludeAlcohol: false,
              excludeNonAlcohol: false,
              excludeSide: false,
            },
            {
              participantIndex: 2,
              excludeAlcohol: false,
              excludeNonAlcohol: false,
              excludeSide: false,
            },
          ],
        },
        {
          items: [{ amount: 10000, category: 'UNCATEGORIZED' }],
          attendees: [
            {
              participantIndex: 0,
              excludeAlcohol: false,
              excludeNonAlcohol: false,
              excludeSide: false,
            },
            {
              participantIndex: 1,
              excludeAlcohol: false,
              excludeNonAlcohol: false,
              excludeSide: false,
            },
          ],
        },
      ],
    });
    // 1차: 10000/10000/10000. 2차: 5000/5000/0.
    expect(r.perRound[0]?.shareAmounts).toEqual([10000, 10000, 10000]);
    expect(r.perRound[1]?.shareAmounts).toEqual([5000, 5000, 0]);
    expect(r.perParticipant).toEqual([15000, 15000, 10000]);
    expect(r.grandTotal).toBe(40000);
  });

  it('honors per-round exclude overrides (master 술X 가 2차엔 마심)', () => {
    // A 는 master 에서 술 X. 1차 ALCOHOL 만 → A 빠지고 B 부담.
    // 2차 ALCOHOL 만 + A 의 excludeAlcoholOverride=false → A,B 같이 부담.
    const r = calculateMultiRoundShares({
      participantCount: 2,
      rounds: [
        {
          items: [{ amount: 10000, category: 'ALCOHOL' }],
          attendees: [
            {
              participantIndex: 0,
              excludeAlcohol: true,
              excludeNonAlcohol: false,
              excludeSide: false,
            },
            {
              participantIndex: 1,
              excludeAlcohol: false,
              excludeNonAlcohol: false,
              excludeSide: false,
            },
          ],
        },
        {
          items: [{ amount: 8000, category: 'ALCOHOL' }],
          attendees: [
            {
              participantIndex: 0,
              // override 가 적용된 effective 값을 입력으로 넘긴다고 가정.
              excludeAlcohol: false,
              excludeNonAlcohol: false,
              excludeSide: false,
            },
            {
              participantIndex: 1,
              excludeAlcohol: false,
              excludeNonAlcohol: false,
              excludeSide: false,
            },
          ],
        },
      ],
    });
    // 1차: A=0, B=10000. 2차: A=4000, B=4000.
    expect(r.perRound[0]?.shareAmounts).toEqual([0, 10000]);
    expect(r.perRound[1]?.shareAmounts).toEqual([4000, 4000]);
    expect(r.perParticipant).toEqual([4000, 14000]);
    expect(r.grandTotal).toBe(18000);
  });

  it('returns zero shares for absentees in each round', () => {
    // 1차 A만, 2차 B만.
    const r = calculateMultiRoundShares({
      participantCount: 2,
      rounds: [
        {
          items: [{ amount: 5000, category: 'UNCATEGORIZED' }],
          attendees: [
            {
              participantIndex: 0,
              excludeAlcohol: false,
              excludeNonAlcohol: false,
              excludeSide: false,
            },
          ],
        },
        {
          items: [{ amount: 7000, category: 'UNCATEGORIZED' }],
          attendees: [
            {
              participantIndex: 1,
              excludeAlcohol: false,
              excludeNonAlcohol: false,
              excludeSide: false,
            },
          ],
        },
      ],
    });
    expect(r.perRound[0]?.shareAmounts).toEqual([5000, 0]);
    expect(r.perRound[1]?.shareAmounts).toEqual([0, 7000]);
    expect(r.perParticipant).toEqual([5000, 7000]);
    expect(r.grandTotal).toBe(12000);
  });

  it('produces empty output for zero rounds', () => {
    const r = calculateMultiRoundShares({ participantCount: 3, rounds: [] });
    expect(r.perParticipant).toEqual([0, 0, 0]);
    expect(r.perRound).toEqual([]);
    expect(r.grandTotal).toBe(0);
  });

  it('per-round discount subtracts from the targeted category pool', () => {
    // 2명 모두 참석. SIDE 풀 12000, 할인 -3000 → 차감 후 9000 을 2명이 균등 분담.
    // ALCOHOL 풀 4000 은 할인 영향 없음.
    const r = calculateMultiRoundShares({
      participantCount: 2,
      rounds: [
        {
          items: [
            { amount: 12000, category: 'SIDE' },
            { amount: 4000, category: 'ALCOHOL' },
          ],
          attendees: [
            { participantIndex: 0, excludeAlcohol: false, excludeNonAlcohol: false, excludeSide: false },
            { participantIndex: 1, excludeAlcohol: false, excludeNonAlcohol: false, excludeSide: false },
          ],
          discount: { amount: 3000, category: 'SIDE' },
        },
      ],
    });
    const round = r.perRound[0]!;
    // 풀 9000 / 2 = 4500, ALCOHOL 4000 / 2 = 2000 → 인당 6500.
    expect(round.shareAmounts).toEqual([6500, 6500]);
    expect(round.poolBreakdown.SIDE.poolAmount).toBe(9000);
    expect(round.poolBreakdown.ALCOHOL.poolAmount).toBe(4000);
    expect(round.itemsSubtotal).toBe(13000); // 16000 - 3000
    expect(r.grandTotal).toBe(13000);
    // 매트릭스 invariant — 행 합 = shareAmounts.
    for (let i = 0; i < 2; i += 1) {
      const rowSum =
        (round.perCategoryShares.ALCOHOL[i] ?? 0) +
        (round.perCategoryShares.NON_ALCOHOL[i] ?? 0) +
        (round.perCategoryShares.SIDE[i] ?? 0) +
        (round.perCategoryShares.UNCATEGORIZED[i] ?? 0);
      expect(rowSum).toBe(round.shareAmounts[i]);
    }
  });

  it('categoryAdjustments leftover sends remainder to the chosen participant', () => {
    // 3명, SIDE 풀 10001 → floor 3333 인당, 잔여 2원. leftover = index 2.
    const r = calculateMultiRoundShares({
      participantCount: 3,
      rounds: [
        {
          items: [{ amount: 10001, category: 'SIDE' }],
          attendees: [
            { participantIndex: 0, excludeAlcohol: false, excludeNonAlcohol: false, excludeSide: false },
            { participantIndex: 1, excludeAlcohol: false, excludeNonAlcohol: false, excludeSide: false },
            { participantIndex: 2, excludeAlcohol: false, excludeNonAlcohol: false, excludeSide: false },
          ],
          categoryAdjustments: {
            SIDE: { leftoverParticipantIndexes: [2], roundUnit: null },
          },
        },
      ],
    });
    expect(r.perRound[0]?.shareAmounts).toEqual([3333, 3333, 3335]);
  });

  it('categoryAdjustments roundUnit applies when rounded pool divides cleanly', () => {
    // 4명, SIDE 풀 1003 → 100원 round = 1000, 1000 % 4 === 0 → 인당 250. itemsSubtotal=1000.
    const r = calculateMultiRoundShares({
      participantCount: 4,
      rounds: [
        {
          items: [{ amount: 1003, category: 'SIDE' }],
          attendees: [0, 1, 2, 3].map((i) => ({
            participantIndex: i,
            excludeAlcohol: false,
            excludeNonAlcohol: false,
            excludeSide: false,
          })),
          categoryAdjustments: {
            SIDE: { leftoverParticipantIndexes: [0], roundUnit: 100 },
          },
        },
      ],
    });
    expect(r.perRound[0]?.shareAmounts).toEqual([250, 250, 250, 250]);
    expect(r.perRound[0]?.itemsSubtotal).toBe(1000);
    expect(r.perRound[0]?.poolBreakdown.SIDE.poolAmount).toBe(1000);
    expect(r.grandTotal).toBe(1000);
  });

  it('categoryAdjustments roundUnit falls back when not divisible', () => {
    // 3명, SIDE 풀 1003 → 100 round = 1000, 1000 % 3 !== 0 → fallback (그대로 1003 분배).
    const r = calculateMultiRoundShares({
      participantCount: 3,
      rounds: [
        {
          items: [{ amount: 1003, category: 'SIDE' }],
          attendees: [0, 1, 2].map((i) => ({
            participantIndex: i,
            excludeAlcohol: false,
            excludeNonAlcohol: false,
            excludeSide: false,
          })),
          categoryAdjustments: {
            SIDE: { leftoverParticipantIndexes: [1], roundUnit: 100 },
          },
        },
      ],
    });
    // 1003 / 3 = floor 334, 잔여 1 → leftover(=index 1) 에 1 추가.
    expect(r.perRound[0]?.shareAmounts).toEqual([334, 335, 334]);
    expect(r.perRound[0]?.itemsSubtotal).toBe(1003);
  });

  it('discount equal to the pool zeroes that category share', () => {
    // SIDE 풀 8000 에 8000 할인 → SIDE 컬럼 모두 0. ALCOHOL 2000 만 분담.
    const r = calculateMultiRoundShares({
      participantCount: 2,
      rounds: [
        {
          items: [
            { amount: 8000, category: 'SIDE' },
            { amount: 2000, category: 'ALCOHOL' },
          ],
          attendees: [
            { participantIndex: 0, excludeAlcohol: false, excludeNonAlcohol: false, excludeSide: false },
            { participantIndex: 1, excludeAlcohol: false, excludeNonAlcohol: false, excludeSide: false },
          ],
          discount: { amount: 8000, category: 'SIDE' },
        },
      ],
    });
    const round = r.perRound[0]!;
    expect(round.poolBreakdown.SIDE.poolAmount).toBe(0);
    expect(round.perCategoryShares.SIDE).toEqual([0, 0]);
    // ALCOHOL 1000 씩.
    expect(round.shareAmounts).toEqual([1000, 1000]);
    expect(round.itemsSubtotal).toBe(2000);
  });

  it('maps group members from master indexes and back (groupBreakdown)', () => {
    // 3명 중 1번 불참. 그룹 멤버는 마스터 0(1잔)·2(3잔) — 8,000 을 1:3 으로.
    const r = calculateMultiRoundShares({
      participantCount: 3,
      rounds: [
        {
          items: [{ amount: 8000, category: 'ALCOHOL' }],
          attendees: [0, 2].map((i) => ({
            participantIndex: i,
            excludeAlcohol: false,
            excludeNonAlcohol: false,
            excludeSide: false,
          })),
          groups: [
            {
              category: 'ALCOHOL',
              itemIndexes: [0],
              mode: 'GLASSES',
              members: [
                { participantIndex: 0, glasses: 1 },
                { participantIndex: 2, glasses: 3 },
              ],
            },
          ],
        },
      ],
    });
    expect(r.perRound[0]?.shareAmounts).toEqual([2000, 0, 6000]);
    expect(r.perRound[0]?.groupBreakdown[0]?.shares).toEqual([2000, 0, 6000]);
    expect(r.perParticipant).toEqual([2000, 0, 6000]);
  });

  it('reverts the group when every member is absent from the round', () => {
    // 그룹 멤버(마스터 0)가 불참 → 그룹 비활성, 참석자(마스터 1)가 균등 부담.
    const r = calculateMultiRoundShares({
      participantCount: 2,
      rounds: [
        {
          items: [{ amount: 8000, category: 'ALCOHOL' }],
          attendees: [
            {
              participantIndex: 1,
              excludeAlcohol: false,
              excludeNonAlcohol: false,
              excludeSide: false,
            },
          ],
          groups: [
            {
              category: 'ALCOHOL',
              itemIndexes: [0],
              mode: 'GLASSES',
              members: [{ participantIndex: 0, glasses: 2 }],
            },
          ],
        },
      ],
    });
    expect(r.perRound[0]?.shareAmounts).toEqual([0, 8000]);
    expect(r.perRound[0]?.groupBreakdown[0]?.applied).toBe(false);
  });

  it('round perCategoryShares is master-indexed and zero for absentees', () => {
    // 2명. 1차에 A만 참석, B 불참. 1차 ALCOHOL 5000.
    const r = calculateMultiRoundShares({
      participantCount: 2,
      rounds: [
        {
          items: [{ amount: 5000, category: 'ALCOHOL' }],
          attendees: [
            {
              participantIndex: 0,
              excludeAlcohol: false,
              excludeNonAlcohol: false,
              excludeSide: false,
            },
          ],
        },
      ],
    });
    expect(r.perRound[0]?.perCategoryShares.ALCOHOL).toEqual([5000, 0]);
    // 사용 안 한 카테고리도 0 배열로 깔린다 (UI 매트릭스가 안전하게 인덱싱).
    expect(r.perRound[0]?.perCategoryShares.SIDE).toEqual([0, 0]);
  });
});
