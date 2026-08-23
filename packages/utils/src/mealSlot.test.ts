import { describe, expect, it } from 'vitest';
import { formatTimeOfDay, mealPortionFactor, parseTimeOfDay } from './mealSlot.js';

// 시각 직접 입력 파서 — 사용자가 치는 값이라 관대하되, 말이 안 되는 값은 거절한다.
describe('parseTimeOfDay', () => {
  it('콜론이 있어도 없어도 받는다', () => {
    expect(parseTimeOfDay('12:40')).toBe(760);
    expect(parseTimeOfDay('1240')).toBe(760);
  });

  it('한 자리 시각도 받는다 — 840 은 8:40', () => {
    expect(parseTimeOfDay('840')).toBe(520);
    expect(parseTimeOfDay('8:40')).toBe(520);
  });

  it('말이 안 되는 값은 null — 화면이 조용히 되돌린다', () => {
    expect(parseTimeOfDay('25:00')).toBeNull();
    expect(parseTimeOfDay('12:60')).toBeNull();
    expect(parseTimeOfDay('')).toBeNull();
    expect(parseTimeOfDay('점심')).toBeNull();
  });
});

describe('formatTimeOfDay', () => {
  it('두 자리로 채운다', () => {
    expect(formatTimeOfDay(520)).toBe('08:40');
  });

  it('24시를 넘으면 되감는다 — 야식 중앙값이 25:10 으로 나오는 경우', () => {
    expect(formatTimeOfDay(1510)).toBe('01:10');
  });
});

describe('mealPortionFactor', () => {
  it('양이 없으면 1인분으로 본다', () => {
    expect(mealPortionFactor(null)).toBe(1);
    expect(mealPortionFactor('small')).toBe(0.6);
    expect(mealPortionFactor('large')).toBe(1.5);
  });
});
