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
