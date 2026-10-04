import { LIFE_CELL_ORIGIN, lifeCellSizeDeg } from '@repo/utils';

// 지도 집계 셀 격자·점 모드 범위 — 일상지도·집값·주차/충전소가 공유한다.
//
// 셀 크기는 줌으로만 정해져(타일의 1/4 = 64px) 넓은 bbox 에 높은 줌을 주면 셀이 점 개수만큼 생긴다
// (z22 전국 = 셀 25만 개·응답 14MB·RSS +300MB, docs/PLAN-perf-2.md D-1·E-V1). 바깥 정렬한 열×행이
// 상한을 넘으면 셀을 키워(유효 줌을 낮춰) 접는다 — 400 으로 거부하지 않는 건 정상 대형 화면을 깨지 않기
// 위해서다. 1080p 화면은 약 600셀, 5K(5120×2880 CSS px)도 4,000셀 안팎이라 정상 화면은 그대로이고, 남용
// 요청은 낮은 줌의 같은 캐시 키로 모인다. bbox 는 국내 범위로 자른다(적재기가 이 밖 좌표는 버리므로 결과 동일).

export interface CellBbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface CellGrid {
  // 실제 집계에 쓴 줌(요청 줌보다 낮을 수 있다) — 캐시 키에 넣는다.
  zoom: number;
  dLng: number;
  dLat: number;
  // 셀 경계로 바깥 정렬한 bbox.
  q: CellBbox;
}

export const MAP_CELLS_MAX = 6_000;

// 국내(제주 남단~휴전선 북쪽 여유, 서해~독도) — 계약·적재기의 좌표 범위(lat 33~39, lng 124~132)와 같다.
export const KOREA_BOUNDS: Readonly<CellBbox> = { minLng: 124, minLat: 33, maxLng: 132, maxLat: 39 };

const clampTo = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
export const clampToKorea = (b: CellBbox): CellBbox => {
  const minLng = clampTo(b.minLng, KOREA_BOUNDS.minLng, KOREA_BOUNDS.maxLng);
  const maxLng = clampTo(b.maxLng, KOREA_BOUNDS.minLng, KOREA_BOUNDS.maxLng);
  const minLat = clampTo(b.minLat, KOREA_BOUNDS.minLat, KOREA_BOUNDS.maxLat);
  const maxLat = clampTo(b.maxLat, KOREA_BOUNDS.minLat, KOREA_BOUNDS.maxLat);
  return {
    minLng: Math.min(minLng, maxLng),
    maxLng: Math.max(minLng, maxLng),
    minLat: Math.min(minLat, maxLat),
    maxLat: Math.max(minLat, maxLat),
  };
};

// zoomOffset: 셀 크기를 줌보다 한 단계 크게 쓰는 레이어(집값 = -1)용. 반환 zoom 은 오프셋 전 값.
export function cellGrid(
  zoom: number,
  bbox: CellBbox,
  opts: { zoomOffset?: number; maxCells?: number } = {},
): CellGrid {
  const offset = opts.zoomOffset ?? 0;
  const maxCells = opts.maxCells ?? MAP_CELLS_MAX;
  const b = clampToKorea(bbox);
  const o = LIFE_CELL_ORIGIN;
  let z = Math.max(0, Math.min(22, Math.floor(zoom)));
  for (;;) {
    const { dLng, dLat } = lifeCellSizeDeg(Math.max(0, z + offset));
    const q: CellBbox = {
      minLng: o.lng + Math.floor((b.minLng - o.lng) / dLng) * dLng,
      maxLng: o.lng + Math.ceil((b.maxLng - o.lng) / dLng) * dLng,
      minLat: o.lat + Math.floor((b.minLat - o.lat) / dLat) * dLat,
      maxLat: o.lat + Math.ceil((b.maxLat - o.lat) / dLat) * dLat,
    };
    const cols = Math.max(1, Math.round((q.maxLng - q.minLng) / dLng));
    const rows = Math.max(1, Math.round((q.maxLat - q.minLat) / dLat));
    if (cols * rows <= maxCells || z + offset <= 0) return { zoom: z, dLng, dLat, q };
    z -= 1;
  }
}

// 셀 캐시 키의 bbox 부분 — 바깥 정렬값이라 소수 6자리면 충분하다.
export const cellKeyOf = (g: CellGrid): string =>
  `${g.zoom}|${g.q.minLng.toFixed(6)},${g.q.minLat.toFixed(6)},${g.q.maxLng.toFixed(6)},${g.q.maxLat.toFixed(6)}`;

// ── 점 모드 범위 ──────────────────────────────────────────────────────────────
// 점 모드 bbox 크기 상한 — 요청 줌의 타일(256 CSS px) 수로 잰다. 고정 도(°) 상한(1.5°)은 줌과 무관해
// z14 에 1.5° 상자(실화면의 7배)를 주면 박스 안 행을 전부 읽고 정렬했다(D-7). 5K 화면(가로 20타일)을 45°
// 돌려도(약 23타일) 들어가게 32타일 — 이보다 크면 셀로 강등한다.
export const POINTS_MAX_TILES = 32;

const mercY = (lat: number): number => Math.log(Math.tan(Math.PI / 4 + (clampTo(lat, -85, 85) * Math.PI) / 360));

// bbox 가 요청 줌에서 가로·세로 몇 타일인가(웹 메르카토르).
export const bboxTiles = (zoom: number, b: CellBbox): { w: number; h: number } => {
  const n = 2 ** Math.max(0, Math.min(22, Math.floor(zoom)));
  return {
    w: ((b.maxLng - b.minLng) / 360) * n,
    h: ((mercY(b.maxLat) - mercY(b.minLat)) / (2 * Math.PI)) * n,
  };
};

export const pointsSpanOk = (zoom: number, b: CellBbox, maxTiles: number = POINTS_MAX_TILES): boolean => {
  const t = bboxTiles(zoom, b);
  return t.w <= maxTiles && t.h <= maxTiles;
};

// 점 모드 강등 기준(박스 안 행 수) — 넘으면 점(ORDER BY id 로 상한까지 표본)이 박스 전체를 훑어 비싸므로 셀로
// 접는다. 정상 화면은 넘지 않게(5K 화면 z14 서울 도심 생활편의 5.8만 행) 잡아, 32타일 상자를 꽉 채운 남용
// (같은 곳 11만 행)만 접는다.
export const POINTS_DEMOTE_COUNT = 64_000;

// ── 셀 결과 캐시 ─────────────────────────────────────────────────────────────
// 개수 상한만 두면 큰 결과 몇 개가 수백 MB 를 잡는다(z22 전국 10키 = 힙 +221MB). 셀 하나를 1단위로 센다.
export const cellResultSize = (v: { cells: readonly unknown[] }): number => Math.max(1, v.cells.length);
// 캐시 하나의 셀 단위 상한(셀 객체 ~100B 기준 약 10MB) — 정상 화면 결과(수백~수천 셀)는 수십~수백 개 들어간다.
export const CELL_CACHE_MAX_UNITS = 100_000;
