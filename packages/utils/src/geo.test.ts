import { describe, expect, it } from 'vitest';
import { approxDistanceM, haversineM, roundCoord } from './geo.js';

// 서울 시청 ↔ 강남역 — 실측 약 8.2km. 도시 스케일 판정용 근사가 이 범위에서
// 하버사인과 1% 내로 일치하는지까지 함께 본다.
const CITY_HALL = { lat: 37.5663, lng: 126.9779 };
const GANGNAM = { lat: 37.4979, lng: 127.0276 };

describe('approxDistanceM', () => {
  it('같은 점은 0', () => {
    expect(approxDistanceM(CITY_HALL, CITY_HALL)).toBe(0);
  });

  it('위도 1도 ≈ 111,320m', () => {
    const d = approxDistanceM({ lat: 37, lng: 127 }, { lat: 38, lng: 127 });
    expect(d).toBeCloseTo(111_320, 0);
  });

  it('도시 스케일에서 하버사인과 1% 내 일치', () => {
    const approx = approxDistanceM(CITY_HALL, GANGNAM);
    const precise = haversineM(CITY_HALL, GANGNAM);
    expect(Math.abs(approx - precise) / precise).toBeLessThan(0.01);
  });
});

describe('haversineM', () => {
  it('같은 점은 0', () => {
    expect(haversineM(GANGNAM, GANGNAM)).toBe(0);
  });

  it('시청↔강남 ≈ 8.2km', () => {
    const d = haversineM(CITY_HALL, GANGNAM);
    expect(d).toBeGreaterThan(8_000);
    expect(d).toBeLessThan(9_000);
  });

  it('인자 순서 무관(대칭)', () => {
    expect(haversineM(CITY_HALL, GANGNAM)).toBeCloseTo(haversineM(GANGNAM, CITY_HALL), 6);
  });
});

describe('roundCoord', () => {
  it('소수 5자리 반올림', () => {
    expect(roundCoord(37.123456789)).toBe(37.12346);
    expect(roundCoord(127.000004)).toBe(127);
    expect(roundCoord(-37.123455)).toBe(-37.12345);
  });
});
