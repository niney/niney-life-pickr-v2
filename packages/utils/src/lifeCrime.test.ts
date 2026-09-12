import { describe, expect, it } from 'vitest';
import {
  LIFE_CRIME_GRADE_COLOR,
  LIFE_CRIME_GRADES,
  formatLifeCrimeRate,
  isLifeCrimeMetric,
  lifeCrimeGrade,
  lifeCrimePer100k,
  lifeCrimeQuantileBreaks,
} from './lifeCrime.js';

describe('lifeCrime', () => {
  it('인구 10만 명당 — 소수 1자리, 인구 0 은 null', () => {
    expect(lifeCrimePer100k(31705, 561000)).toBe(5651.5);
    expect(lifeCrimePer100k(0, 1000)).toBe(0);
    expect(lifeCrimePer100k(10, 0)).toBeNull();
  });

  it('분위 경계 — 5등급이면 20/40/60/80 분위 4개(선형 보간)', () => {
    // 1..10 → 위치 (9*0.2=1.8 → 2.8), (3.6 → 4.6), (5.4 → 6.4), (7.2 → 8.2)
    expect(lifeCrimeQuantileBreaks([10, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([2.8, 4.6, 6.4, 8.2]);
    expect(lifeCrimeQuantileBreaks([])).toEqual([0, 0, 0, 0]);
    expect(lifeCrimeQuantileBreaks([5])).toEqual([5, 5, 5, 5]);
  });

  it('등급 — 경계값은 아래 등급, 마지막 경계 초과가 5', () => {
    const breaks = [10, 20, 30, 40];
    expect(lifeCrimeGrade(0, breaks)).toBe(1);
    expect(lifeCrimeGrade(10, breaks)).toBe(1);
    expect(lifeCrimeGrade(10.1, breaks)).toBe(2);
    expect(lifeCrimeGrade(30, breaks)).toBe(3);
    expect(lifeCrimeGrade(40, breaks)).toBe(4);
    expect(lifeCrimeGrade(999, breaks)).toBe(5);
    // 경계가 전부 같으면(표본 1개) 초과 여부만으로 1 또는 5.
    expect(lifeCrimeGrade(5, [5, 5, 5, 5])).toBe(1);
    expect(lifeCrimeGrade(6, [5, 5, 5, 5])).toBe(5);
  });

  it('등급 색은 5개 전부 정의되고 밝→어둡 단일 램프', () => {
    const lum = (hex: string): number => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
    };
    const lums = LIFE_CRIME_GRADES.map((g) => lum(LIFE_CRIME_GRADE_COLOR[g]));
    for (let i = 1; i < lums.length; i++) expect(lums[i]!).toBeLessThan(lums[i - 1]!);
  });

  it('메트릭 판정·표기', () => {
    expect(isLifeCrimeMetric('total')).toBe(true);
    expect(isLifeCrimeMetric('theft')).toBe(true);
    expect(isLifeCrimeMetric('fraud')).toBe(false);
    expect(formatLifeCrimeRate(1234.56)).toBe('1,234.6');
    expect(formatLifeCrimeRate(null)).toBe('-');
  });
});
