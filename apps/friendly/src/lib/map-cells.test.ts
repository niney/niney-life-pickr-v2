import { describe, expect, it } from 'vitest';
import { LIFE_CELL_ORIGIN, lifeCellSizeDeg } from '@repo/utils';
import {
  CELL_CACHE_MAX_UNITS,
  KOREA_BOUNDS,
  MAP_CELLS_MAX,
  POINTS_MAX_TILES,
  bboxTiles,
  cellGrid,
  cellKeyOf,
  cellResultSize,
  clampToKorea,
  pointsSpanOk,
  type CellBbox,
} from './map-cells.js';

// 지도 셀 격자·점 모드 범위(D-1·E-V1·D-7) — 정상 화면(1080p~5K, CSS px)은 예전 계산과 똑같고, 넓은 bbox + 높은 줌만
// 셀을 키워 접는지 고정한다. 화면 bbox 는 웹 MapCanvas(OpenLayers EPSG:3857, 256px 타일)와 같은 투영으로 만든다.

const screenBbox = (c: { lat: number; lng: number }, zoom: number, w: number, h: number): CellBbox => {
  const scale = 256 * 2 ** zoom;
  const x = ((c.lng + 180) / 360) * scale;
  const s = Math.sin((c.lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
  const lngOf = (px: number) => (px / scale) * 360 - 180;
  const latOf = (py: number) => {
    const n = Math.PI - (2 * Math.PI * py) / scale;
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  };
  return { minLng: lngOf(x - w / 2), maxLng: lngOf(x + w / 2), minLat: latOf(y + h / 2), maxLat: latOf(y - h / 2) };
};

// 예전(수정 전) 서비스들의 셀 정렬 — 요청 줌 그대로, bbox 자르기 없음.
const legacyQ = (zoom: number, b: CellBbox, offset = 0): CellBbox => {
  const { dLng, dLat } = lifeCellSizeDeg(Math.max(0, zoom + offset));
  const o = LIFE_CELL_ORIGIN;
  return {
    minLng: o.lng + Math.floor((b.minLng - o.lng) / dLng) * dLng,
    maxLng: o.lng + Math.ceil((b.maxLng - o.lng) / dLng) * dLng,
    minLat: o.lat + Math.floor((b.minLat - o.lat) / dLat) * dLat,
    maxLat: o.lat + Math.ceil((b.maxLat - o.lat) / dLat) * dLat,
  };
};
const inside = (b: CellBbox): boolean =>
  b.minLng >= KOREA_BOUNDS.minLng && b.maxLng <= KOREA_BOUNDS.maxLng && b.minLat >= KOREA_BOUNDS.minLat && b.maxLat <= KOREA_BOUNDS.maxLat;
const cellCount = (g: { dLng: number; dLat: number; q: CellBbox }): number =>
  Math.round((g.q.maxLng - g.q.minLng) / g.dLng) * Math.round((g.q.maxLat - g.q.minLat) / g.dLat);

const SCREENS: [string, number, number][] = [
  ['1080p', 1920, 1080],
  ['1440p', 2560, 1440],
  ['4K', 3840, 2160],
  ['5K', 5120, 2880],
  ['5K 세로', 2880, 5120],
  ['폰', 412, 915],
];
const CENTERS = [
  { name: '서울', lat: 37.5665, lng: 126.978 },
  { name: '부산', lat: 35.1796, lng: 129.0756 },
  { name: '제주', lat: 33.4996, lng: 126.5312 },
  { name: '속초', lat: 38.207, lng: 128.5918 },
];

describe('map-cells cellGrid', () => {
  it('정상 화면(1080p~5K·폰, 4개 도시, 줌 0~22, 일상지도·집값 오프셋)은 줌을 낮추지 않고 국내 화면은 예전 정렬과 같다', () => {
    let compared = 0;
    for (const [, w, h] of SCREENS) {
      for (const c of CENTERS) {
        for (let z = 0; z <= 22; z += 1) {
          const b = screenBbox(c, z, w, h);
          for (const offset of [0, -1]) {
            const g = cellGrid(z, b, { zoomOffset: offset });
            expect(g.zoom).toBe(z);
            expect(cellCount(g)).toBeLessThanOrEqual(MAP_CELLS_MAX);
            if (inside(b)) {
              expect(g.q).toEqual(legacyQ(z, b, offset));
              compared += 1;
            }
          }
        }
      }
    }
    // 대부분의 줌에서 화면이 국내 안이라 예전 정렬과 직접 비교된다.
    expect(compared).toBeGreaterThan(300);
  });

  it('z22 전국처럼 셀 수가 상한을 넘으면 셀을 키워 접고(유효 줌 9), 집값(-1)은 한 단계 위 줌을 돌려준다', () => {
    const korea = { minLng: 124, minLat: 33, maxLng: 132, maxLat: 39 };
    const g = cellGrid(22, korea);
    expect(g.zoom).toBe(9);
    expect(cellCount(g)).toBeLessThanOrEqual(MAP_CELLS_MAX);
    expect(g).toEqual(cellGrid(9, korea));
    expect(cellGrid(22, korea, { zoomOffset: -1 }).zoom).toBe(10);
    // 바로 위 줌은 상한을 넘는다(필요한 만큼만 접는다).
    expect(cellCount(cellGrid(10, korea, { maxCells: Number.MAX_SAFE_INTEGER }))).toBeGreaterThan(MAP_CELLS_MAX);
    // bbox 를 조금씩 바꿔도 같은 캐시 키로 모인다.
    expect(cellKeyOf(cellGrid(22, { ...korea, maxLng: 131.9997 }))).toBe(cellKeyOf(g));
  });

  it('국내 밖 bbox 는 국내로 잘라 집계한다(적재기가 이 밖 좌표를 버리므로 결과는 같다)', () => {
    expect(clampToKorea({ minLng: -180, minLat: -90, maxLng: 180, maxLat: 90 })).toEqual(KOREA_BOUNDS);
    expect(clampToKorea({ minLng: 140, minLat: 40, maxLng: 150, maxLat: 50 })).toEqual({ minLng: 132, minLat: 39, maxLng: 132, maxLat: 39 });
    const world = cellGrid(22, { minLng: -180, minLat: -85, maxLng: 180, maxLat: 85 });
    expect(world).toEqual(cellGrid(22, KOREA_BOUNDS));
    expect(cellGrid(7, { minLng: 100, minLat: 20, maxLng: 150, maxLat: 50 }).q).toEqual(legacyQ(7, KOREA_BOUNDS));
  });

  it('셀 캐시 크기는 셀 수(빈 결과도 1)', () => {
    expect(cellResultSize({ cells: [] })).toBe(1);
    expect(cellResultSize({ cells: [1, 2, 3] })).toBe(3);
    expect(CELL_CACHE_MAX_UNITS).toBeGreaterThanOrEqual(MAP_CELLS_MAX * 10);
  });
});

describe('map-cells pointsSpanOk', () => {
  it('화면 크기를 그 줌의 타일 수로 잰다', () => {
    const t = bboxTiles(15, screenBbox(CENTERS[0]!, 15, 1920, 1080));
    expect(t.w).toBeCloseTo(7.5, 6);
    expect(t.h).toBeCloseTo(1080 / 256, 6);
    expect(bboxTiles(15.9, screenBbox(CENTERS[0]!, 15, 1920, 1080))).toEqual(t); // 소수 줌은 내림
  });

  it('정상 화면은 5K 를 45° 돌려도 점 모드, 줌과 무관한 넓은 bbox 는 셀', () => {
    for (const [, w, h] of SCREENS) {
      for (const c of CENTERS) {
        for (const z of [13, 14, 15, 16, 18, 22]) {
          expect(pointsSpanOk(z, screenBbox(c, z, w, h))).toBe(true);
          const d = (w + h) / Math.SQRT2; // 45° 회전한 화면의 바깥 상자
          expect(pointsSpanOk(z, screenBbox(c, z, d, d))).toBe(true);
        }
      }
    }
    // 예전 고정 상한(1.5°) 안이지만 z14 화면의 7배 — 셀로 강등.
    expect(pointsSpanOk(14, { minLng: 126.3, minLat: 36.9, maxLng: 127.8, maxLat: 38.0 })).toBe(false);
    const edge = POINTS_MAX_TILES * 256;
    expect(pointsSpanOk(16, screenBbox(CENTERS[0]!, 16, edge - 2, 100))).toBe(true);
    expect(pointsSpanOk(16, screenBbox(CENTERS[0]!, 16, edge + 2, 100))).toBe(false);
    expect(pointsSpanOk(16, screenBbox(CENTERS[0]!, 16, 100, edge + 2))).toBe(false);
  });
});
