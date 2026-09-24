import { describe, expect, it } from 'vitest';
import { approxDistanceM, formatBbox, haversineM, roundCoord, utmkToWgs84, wgs84ToUtmk } from './geo.js';

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

describe('formatBbox', () => {
  it('minLng,minLat,maxLng,maxLat 순서 + 소수 5자리 고정', () => {
    // 서버 bbox 파라미터 계약 — 순서가 바뀌면 검색 영역이 뒤집힌다.
    expect(
      formatBbox({ minLng: 126.9, minLat: 37.4, maxLng: 127.1, maxLat: 37.6 }),
    ).toBe('126.90000,37.40000,127.10000,37.60000');
    // toFixed 라 5자리 미만 절삭이 아니라 0 패딩, 초과분은 반올림.
    expect(
      formatBbox({ minLng: 126.123456, minLat: 37, maxLng: 127.999999, maxLat: 38 }),
    ).toBe('126.12346,37.00000,128.00000,38.00000');
  });
});

describe('UTM-K(EPSG:5179) 변환', () => {
  it('원점(38°N, 127.5°E) ↔ (1,000,000, 2,000,000)', () => {
    const o = utmkToWgs84({ x: 1_000_000, y: 2_000_000 });
    expect(o.lat).toBeCloseTo(38, 9);
    expect(o.lng).toBeCloseTo(127.5, 9);
    const xy = wgs84ToUtmk({ lat: 38, lng: 127.5 });
    expect(xy.x).toBeCloseTo(1_000_000, 3);
    expect(xy.y).toBeCloseTo(2_000_000, 3);
  });

  it('서울 범위 순·역변환 왕복 오차 1mm 미만', () => {
    for (const p of [CITY_HALL, GANGNAM, { lat: 37.69, lng: 126.77 }, { lat: 37.43, lng: 127.18 }]) {
      const back = utmkToWgs84(wgs84ToUtmk(p));
      expect(haversineM(p, back)).toBeLessThan(0.001);
    }
  });

  it('서울 시청은 원점 남서쪽(x<1e6, y<2e6) 수십 km — 침수흔적도 bbox(93.5만~97.2만, 193.7만~196.6만) 안', () => {
    const xy = wgs84ToUtmk(CITY_HALL);
    expect(xy.x).toBeGreaterThan(935_000);
    expect(xy.x).toBeLessThan(972_000);
    expect(xy.y).toBeGreaterThan(1_937_000);
    expect(xy.y).toBeLessThan(1_966_000);
  });
});
