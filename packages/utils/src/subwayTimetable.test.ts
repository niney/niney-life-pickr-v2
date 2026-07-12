import { describe, expect, it } from 'vitest';
import {
  arrivalUpdnToTimetable,
  dayTypeForToday,
  formatHHMM,
  isSubwayExpressTag,
  lastTrainRemainMin,
  parseTimeMin,
  updnLabel,
} from './subwayTimetable.js';

describe('dayTypeForToday', () => {
  it('토=2, 일=3, 평일=1', () => {
    expect(dayTypeForToday(new Date('2026-07-11T10:00:00'))).toBe('2'); // 토
    expect(dayTypeForToday(new Date('2026-07-12T10:00:00'))).toBe('3'); // 일
    expect(dayTypeForToday(new Date('2026-07-13T10:00:00'))).toBe('1'); // 월
  });
});

describe('parseTimeMin / formatHHMM — 자정 넘김(24+) 보존', () => {
  it('24+ 시각을 그대로 해석해 단조성 유지', () => {
    expect(parseTimeMin('24:46:00')).toBe(24 * 60 + 46);
    expect(parseTimeMin('05:30:00')).toBe(330);
    expect(parseTimeMin('24:46:00')).toBeGreaterThan(parseTimeMin('23:59:00'));
  });

  it('HH:MM 표기 — 24+ 를 00 으로 접지 않음', () => {
    expect(formatHHMM('24:46:00')).toBe('24:46');
    expect(formatHHMM('09:05:30')).toBe('09:05');
    expect(formatHHMM('00:00:00')).toBe('00:00');
  });
});

describe('lastTrainRemainMin', () => {
  it('같은 날 막차 — 단순 차', () => {
    // 23:00 현재, 막차 23:30 → 30분
    expect(lastTrainRemainMin('23:30:00', new Date('2026-07-13T23:00:00'))).toBe(30);
  });

  it('익일(24+) 막차 + 자정 직후 — 현재도 24+ 축으로 올려 계산', () => {
    // 00:10 현재(=24:10), 막차 24:46 → 36분
    expect(lastTrainRemainMin('24:46:00', new Date('2026-07-13T00:10:00'))).toBe(36);
  });

  it('막차 없음 → null, 이미 지남 → 음수', () => {
    expect(lastTrainRemainMin(null)).toBeNull();
    expect(lastTrainRemainMin('23:00:00', new Date('2026-07-13T23:30:00'))).toBe(-30);
  });
});

describe('arrivalUpdnToTimetable / updnLabel / isSubwayExpressTag', () => {
  it('상행·내선=1, 하행·외선=2, 그 외 null', () => {
    expect(arrivalUpdnToTimetable('상행')).toBe('1');
    expect(arrivalUpdnToTimetable('내선')).toBe('1');
    expect(arrivalUpdnToTimetable('하행')).toBe('2');
    expect(arrivalUpdnToTimetable('외선')).toBe('2');
    expect(arrivalUpdnToTimetable('급행')).toBeNull();
  });

  it('updn 라벨', () => {
    expect(updnLabel('1')).toBe('상행');
    expect(updnLabel('2')).toBe('하행');
  });

  it("급행 판정 — 'G'/null 일반, 그 외('D' 포함) 급행", () => {
    expect(isSubwayExpressTag('G')).toBe(false);
    expect(isSubwayExpressTag(null)).toBe(false);
    expect(isSubwayExpressTag('D')).toBe(true);
  });
});
