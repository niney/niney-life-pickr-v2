import { describe, expect, it } from 'vitest';
import { calculateShares } from '@repo/api-contract';

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
});
