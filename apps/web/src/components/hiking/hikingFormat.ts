import type { HikingMountainSummaryType } from '@repo/api-contract';
import { decodePolyline, haversineM, hikingInRegionGroup, type HikingRegionGroup, type LatLng } from '@repo/utils';

// 등산 화면 순수 도우미 — 산 목록 거르기·정렬, 코스 선 복원, 고도 그래프 위치 ↔ 지도 좌표.

export type HikingSort = 'name' | 'height' | 'near';
export const isHikingSort = (v: unknown): v is HikingSort => v === 'name' || v === 'height' || v === 'near';

const norm = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

export interface RankedMountain {
  mountain: HikingMountainSummaryType;
  distM: number | null;
}

// 검색어는 이름·부제·소재지에서 찾는다(공백 무시). 가까운순인데 내 위치가 없으면 이름순.
export const rankMountains = (
  items: readonly HikingMountainSummaryType[],
  opts: { q: string; group: HikingRegionGroup | null; sort: HikingSort; me: LatLng | null },
): RankedMountain[] => {
  const q = norm(opts.q);
  const out = items
    .filter((m) => !opts.group || hikingInRegionGroup(m.regions, opts.group))
    .filter((m) => !q || norm(`${m.name}${m.subtitle ?? ''}${m.area ?? ''}`).includes(q))
    .map((m) => ({ mountain: m, distM: opts.me ? haversineM(opts.me, m) : null }));
  const byName = (a: RankedMountain, b: RankedMountain) => a.mountain.name.localeCompare(b.mountain.name, 'ko');
  if (opts.sort === 'height') out.sort((a, b) => (b.mountain.heightM ?? 0) - (a.mountain.heightM ?? 0) || byName(a, b));
  else if (opts.sort === 'near' && opts.me) out.sort((a, b) => a.distM! - b.distM! || byName(a, b));
  else out.sort(byName);
  return out;
};

export const decodePieces = (pieces: readonly string[]): LatLng[][] => pieces.map((p) => decodePolyline(p)).filter((l) => l.length >= 2);

// 코스 시작에서 atM 거리의 좌표 — 저장된 선은 4m 단순화라 실제 길이(lengthM)보다 조금 짧다. 비율로 맞춘다.
// 조각 사이 끊김은 거리에 넣지 않는다(서버 규약과 같음).
export const pointAtDistance = (lines: readonly LatLng[][], lengthM: number, atM: number): LatLng | null => {
  const flat: { p: LatLng; s: number }[] = [];
  let s = 0;
  for (const line of lines) {
    line.forEach((p, i) => {
      if (i > 0) s += haversineM(line[i - 1]!, p);
      flat.push({ p, s });
    });
  }
  if (flat.length === 0) return null;
  const total = flat.at(-1)!.s;
  const target = total > 0 && lengthM > 0 ? (Math.min(Math.max(atM, 0), lengthM) / lengthM) * total : 0;
  for (let i = 1; i < flat.length; i++) {
    const a = flat[i - 1]!;
    const b = flat[i]!;
    if (b.s < target) continue;
    const t = b.s > a.s ? (target - a.s) / (b.s - a.s) : 0;
    return { lat: a.p.lat + (b.p.lat - a.p.lat) * t, lng: a.p.lng + (b.p.lng - a.p.lng) * t };
  }
  return flat.at(-1)!.p;
};

export const formatAtM = (m: number): string => (m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`);

export const formatHikingDistance = (m: number): string => (m < 1000 ? `${Math.round(m)}m` : `${Math.round(m / 1000).toLocaleString('ko-KR')}km`);

// 공식 코스 문구 — 줄마다 한 코스(①②… 번호가 붙기도 한다).
export const officialCourseLines = (text: string | null): string[] =>
  (text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
