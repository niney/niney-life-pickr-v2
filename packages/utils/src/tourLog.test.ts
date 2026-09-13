import { describe, expect, it } from 'vitest';
import {
  TOUR_DENSITY_CELL_DEG,
  isNearJeju,
  parseTourDensityCellKey,
  tourDensityCellBbox,
  tourDensityCellKey,
  tourDensityGrade,
  tourDensityQuantileBreaks,
} from './tourLog.js';

describe('tourLog — 밀도 격자', () => {
  it('분위 경계 4개(오름차순) + 등급 1~5', () => {
    const breaks = tourDensityQuantileBreaks([5, 10, 20, 40, 80]);
    expect(breaks).toEqual([9, 16, 28, 48]);
    expect(tourDensityGrade(5, breaks)).toBe(1);
    expect(tourDensityGrade(16, breaks)).toBe(2);
    expect(tourDensityGrade(17, breaks)).toBe(3);
    expect(tourDensityGrade(80, breaks)).toBe(5);
    expect(tourDensityQuantileBreaks([])).toEqual([0, 0, 0, 0]);
  });

  it('칸 인덱스 ↔ bbox ↔ 키', () => {
    const x = Math.floor(126.5 / TOUR_DENSITY_CELL_DEG);
    const y = Math.floor(33.5 / TOUR_DENSITY_CELL_DEG);
    const b = tourDensityCellBbox(x, y);
    expect(b.minLng).toBeCloseTo(126.5, 5);
    expect(b.maxLat).toBeCloseTo(33.52, 5);
    expect(parseTourDensityCellKey(tourDensityCellKey(x, y))).toEqual({ x, y });
    expect(parseTourDensityCellKey('a:b')).toBeNull();
  });

  it('제주 근방 판정', () => {
    expect(isNearJeju(33.5, 126.5)).toBe(true);
    expect(isNearJeju(37.5665, 126.978)).toBe(false);
  });
});
