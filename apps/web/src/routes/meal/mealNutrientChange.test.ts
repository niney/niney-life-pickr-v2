import { describe, expect, it } from 'vitest';
import {
  comparableRecording,
  nutrientChange,
  nutrientChangeShort,
  nutrientChangeText,
  periodAndPrevious,
  comparableNutrientChange,
  type NutrientPeriodValue,
} from './mealNutrientChange';

// 직전 같은 길이 기간과 견주기 — 통계 탭·건강식단 이야기의 내 값·홈의 건강식단 줄이 같은 문턱과 같은 문구를 쓴다.

const value = (over: Partial<NutrientPeriodValue> = {}): NutrientPeriodValue => ({
  intakePerDay: 2800,
  coverage: 1,
  unit: 'mg',
  status: 'high',
  recordGap: false,
  ...over,
});

describe('nutrientChange', () => {
  it('하루 평균이 10% 넘게 달라졌을 때만 — 그 안쪽은 잡음이라 말하지 않는다', () => {
    expect(nutrientChange(value({ intakePerDay: 3080 }), value())).toMatchObject({ diff: 280, unit: 'mg' });
    expect(nutrientChange(value({ intakePerDay: 3079 }), value())).toBeNull();
    expect(nutrientChange(value({ intakePerDay: 2521 }), value())).toBeNull();
    expect(nutrientChange(value({ intakePerDay: 2520 }), value())?.rel).toBeCloseTo(-0.1);
  });

  it('견줄 수 없으면 null — 직전 값이 없거나 0, 어느 쪽이든 정보가 모자라면(양이 실제보다 적게 잡힌다)', () => {
    expect(nutrientChange(value({ intakePerDay: 3500 }), null)).toBeNull();
    expect(nutrientChange(value({ intakePerDay: 3500 }), undefined)).toBeNull();
    expect(nutrientChange(value({ intakePerDay: null }), value())).toBeNull();
    expect(nutrientChange(value({ intakePerDay: 3500 }), value({ intakePerDay: null }))).toBeNull();
    expect(nutrientChange(value({ intakePerDay: 3500 }), value({ intakePerDay: 0 }))).toBeNull();
    expect(nutrientChange(value({ intakePerDay: 3500, coverage: 0.2 }), value())).toBeNull();
    expect(nutrientChange(value({ intakePerDay: 3500 }), value({ coverage: 0.2 }))).toBeNull();
  });
});

describe('혼자 서는 변화 한 줄(이야기의 내 값·홈 줄) — 기록량이 비슷할 때만', () => {
  it('두 기간의 하루 평균 열량이 15% 넘게 다르면 견줄 수 없다 — 모르는 값도 마찬가지', () => {
    expect(comparableRecording(1900, 2000)).toBe(true);
    expect(comparableRecording(2300, 2000)).toBe(true);
    expect(comparableRecording(2301, 2000)).toBe(false);
    // 실제 계정에서 본 경우 — 최근 2주 1,047kcal, 직전 2주 1,495kcal.
    expect(comparableRecording(1047, 1495)).toBe(false);
    expect(comparableRecording(null, 2000)).toBe(false);
    expect(comparableRecording(1900, undefined)).toBe(false);
    expect(comparableRecording(1900, 0)).toBe(false);
  });

  it('덜 적어서 함께 줄어든 영양소를 줄었어요라고 하지 않는다 — 기록량이 비슷하면 통계 탭과 같은 문턱', () => {
    const now = value({ intakePerDay: 2019, status: 'ok' });
    const before = value({ intakePerDay: 4451 });
    expect(nutrientChange(now, before)).not.toBeNull();
    expect(comparableNutrientChange(now, before, { now: 1047, before: 1495 })).toBeNull();
    expect(comparableNutrientChange(now, before, { now: 1450, before: 1495 })).toMatchObject({ diff: -2432 });
    expect(comparableNutrientChange(value({ intakePerDay: 2850 }), value(), { now: 1450, before: 1495 })).toBeNull();
  });

  it('어느 쪽이든 기록 더 필요면 말하지 않는다(양이 실제보다 적게 잡혔을 수 있다)', () => {
    const gap = value({ intakePerDay: 24.5, unit: 'g', status: 'borderline', recordGap: true });
    const now = value({ intakePerDay: 10.3, unit: 'g', status: 'low' });
    expect(comparableNutrientChange(now, gap, { now: 1500, before: 1495 })).toBeNull();
    expect(comparableNutrientChange(gap, now, { now: 1500, before: 1495 })).toBeNull();
  });
});

describe('변화 한 줄', () => {
  it('늘었는지 줄었는지와 양·비율 — 판정이 바뀌었을 때만 직전 판정을 덧붙인다', () => {
    const up = nutrientChange(value({ intakePerDay: 3600 }), value())!;
    expect(nutrientChangeText(up, '직전 1달')).toBe('직전 1달보다 하루 800mg(29%) 늘었어요');
    expect(nutrientChangeShort(up, '직전 2주')).toBe('직전 2주보다 29% 늘었어요');
    const down = nutrientChange(value({ intakePerDay: 2200, status: 'ok' }), value({ intakePerDay: 3000 }))!;
    expect(nutrientChangeText(down, '직전 2주')).toBe('직전 2주보다 하루 800mg(27%) 줄었어요 · 직전엔 많음');
    expect(nutrientChangeShort(down, '직전 2주')).toBe('직전 2주보다 27% 줄었어요');
  });

  it('판정 글자는 바꿔 쓸 수 있다 — 이야기는 지킨 나트륨 기준을 충분이 아니라 기준 안이라고 한다', () => {
    const worse = nutrientChange(value({ intakePerDay: 3000 }), value({ intakePerDay: 2200, status: 'ok' }))!;
    expect(nutrientChangeText(worse, '직전 2주')).toBe('직전 2주보다 하루 800mg(36%) 늘었어요 · 직전엔 충분');
    expect(nutrientChangeText(worse, '직전 2주', (key) => (key === 'ok' ? '기준 안' : key))).toBe(
      '직전 2주보다 하루 800mg(36%) 늘었어요 · 직전엔 기준 안',
    );
  });

  it('작은 양은 소수로 — 식이섬유 g', () => {
    const fiber = nutrientChange(
      value({ intakePerDay: 12.7, unit: 'g', status: 'low' }),
      value({ intakePerDay: 10.6, unit: 'g', status: 'low' }),
    )!;
    expect(nutrientChangeText(fiber, '직전 2주')).toBe('직전 2주보다 하루 2.1g(20%) 늘었어요');
  });
});

describe('periodAndPrevious', () => {
  it('오늘까지 N일(오늘 포함)과 그 바로 앞 N일 — 겹치지 않고 이어진다', () => {
    expect(periodAndPrevious(14, new Date(2026, 10, 11))).toEqual({
      now: { from: '2026-10-29', to: '2026-11-11' },
      previous: { from: '2026-10-15', to: '2026-10-28' },
    });
    expect(periodAndPrevious(7, new Date(2026, 0, 3))).toEqual({
      now: { from: '2025-12-28', to: '2026-01-03' },
      previous: { from: '2025-12-21', to: '2025-12-27' },
    });
  });
});
