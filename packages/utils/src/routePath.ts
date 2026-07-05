// 버스 노선 형상(폴리라인) 위 위치 계산 순수 유틸 — '노선 형상 따라가기'
// 이동 보간의 기하 코어. 서울시 getRoutePath 형상은 상행+하행 왕복 전체가
// 한 줄(첫점≈끝점)이라 좌표만으로는 상/하행 두 후보가 생긴다 — 호길이(s)
// 윈도우를 입력받는 투영으로 호출자(sectOrd·정류소 seq)가 모호성을 푼다.
//
// 좌표는 기준점(첫 점) 등거리 사각 근사로 평면(m) 변환 — 노선 규모(수십 km)
// 에서 투영·거리 비교엔 충분하고 Haversine 급 정밀도는 불필요하다.
import type { LatLng } from './geo.js';

const M_PER_LAT_DEG = 111_320;

export interface RoutePathIndex {
  // 원본 위경도 점 — 슬라이스 결과가 이 점들을 그대로 재사용한다.
  points: LatLng[];
  // 평면 근사 좌표(m). 기준점 = points[0], cos 보정은 기준 위도 고정.
  xs: Float64Array;
  ys: Float64Array;
  // 누적 호길이(m). cum[i] = 시작~i번째 점까지. cum[n-1] = totalM.
  cum: Float64Array;
  totalM: number;
}

// 점 2개 미만이면 null — 호출자가 형상 없음으로 처리(직선 폴백).
export function createRoutePathIndex(points: LatLng[]): RoutePathIndex | null {
  if (points.length < 2) return null;
  const n = points.length;
  const ref = points[0]!;
  const mPerLngDeg = M_PER_LAT_DEG * Math.cos((ref.lat * Math.PI) / 180);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const cum = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    xs[i] = (p.lng - ref.lng) * mPerLngDeg;
    ys[i] = (p.lat - ref.lat) * M_PER_LAT_DEG;
    if (i > 0) cum[i] = cum[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!);
  }
  return { points, xs, ys, cum, totalM: cum[n - 1]! };
}

export interface RoutePathProjection {
  // 최근접 지점의 호길이(m).
  s: number;
  // 입력점 ↔ 최근접 지점 거리(m) — 임계 초과 시 호출자가 '형상 밖'으로 판정.
  distM: number;
}

// p 를 형상 위로 투영 — [sMinM, sMaxM] 호길이 윈도우와 겹치는 세그먼트만 후보.
// 윈도우 미지정이면 전체(왕복 한 줄 형상에선 모호하므로 호출자가 좁혀줄 것).
export function projectOnRoutePath(
  index: RoutePathIndex,
  p: LatLng,
  sMinM = 0,
  sMaxM = Infinity,
): RoutePathProjection {
  const { points, xs, ys, cum } = index;
  const ref = points[0]!;
  const mPerLngDeg = M_PER_LAT_DEG * Math.cos((ref.lat * Math.PI) / 180);
  const px = (p.lng - ref.lng) * mPerLngDeg;
  const py = (p.lat - ref.lat) * M_PER_LAT_DEG;
  let bestS = Math.min(Math.max(sMinM, 0), index.totalM);
  let bestD = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    // 윈도우와 안 겹치는 세그먼트 스킵 (겹치면 통째로 후보 — 끝단 살짝
    // 벗어난 s 는 무해, 윈도우 자체가 마진 포함으로 들어온다).
    if (cum[i + 1]! < sMinM || cum[i]! > sMaxM) continue;
    const ax = xs[i]!;
    const ay = ys[i]!;
    const dx = xs[i + 1]! - ax;
    const dy = ys[i + 1]! - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const qx = ax + dx * t;
    const qy = ay + dy * t;
    const d = Math.hypot(px - qx, py - qy);
    if (d < bestD) {
      bestD = d;
      bestS = cum[i]! + Math.sqrt(len2) * t;
    }
  }
  return { s: bestS, distM: bestD };
}

// cum 에서 s 가 속한 세그먼트 시작 인덱스(i: cum[i] <= s <= cum[i+1]) 이진탐색.
const segIndexAt = (cum: Float64Array, s: number): number => {
  let lo = 0;
  let hi = cum.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid]! <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

// 호길이 s 지점의 위경도 — 세그먼트 내 선형 보간(세그먼트가 짧아 충분).
export function pointAtRoutePathS(index: RoutePathIndex, sM: number): LatLng {
  const { points, cum, totalM } = index;
  const s = Math.min(Math.max(sM, 0), totalM);
  const i = segIndexAt(cum, s);
  const a = points[i]!;
  const b = points[i + 1]!;
  const segLen = cum[i + 1]! - cum[i]!;
  const t = segLen > 0 ? (s - cum[i]!) / segLen : 0;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

// 호길이 s 지점의 진행 방위각(도, 북=0 시계방향) — 전진(s 증가) 방향의 형상
// 접선. 차량 방향 화살표용: 정차 중이어도 '앞으로 갈 방향'이 나온다. 세그먼트
// 길이가 0(중복점)이면 앞쪽으로 넘어가며 탐색, 전부 0이면 null.
export function bearingAtRoutePathS(index: RoutePathIndex, sM: number): number | null {
  const { xs, ys, cum, totalM } = index;
  const s = Math.min(Math.max(sM, 0), totalM);
  for (let i = segIndexAt(cum, s); i < xs.length - 1; i++) {
    const dx = xs[i + 1]! - xs[i]!;
    const dy = ys[i + 1]! - ys[i]!;
    if (dx !== 0 || dy !== 0) {
      const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
      return (deg + 360) % 360;
    }
  }
  return null;
}

// [s0, s1] 구간의 경유 웨이포인트 — 보간된 양 끝점 + 사이의 원본 점들.
// s0 > s1 (후진/왕복 시임 랩)은 호출자가 걸러 직선 폴백할 것.
export function sliceRoutePath(index: RoutePathIndex, s0M: number, s1M: number): LatLng[] {
  const { points, cum, totalM } = index;
  const a = Math.min(Math.max(s0M, 0), totalM);
  const b = Math.min(Math.max(s1M, 0), totalM);
  const out: LatLng[] = [pointAtRoutePathS(index, a)];
  if (b > a) {
    // a 가 속한 세그먼트의 끝점부터 b 직전 점까지 원본 그대로.
    for (let i = segIndexAt(cum, a) + 1; i < points.length && cum[i]! < b; i++) {
      if (cum[i]! > a) out.push(points[i]!);
    }
  }
  out.push(pointAtRoutePathS(index, b));
  return out;
}
