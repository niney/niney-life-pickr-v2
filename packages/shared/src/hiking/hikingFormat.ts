import type { HikingCourseSummaryType, HikingMountainSummaryType } from '@repo/api-contract';
import {
  decodePolyline,
  formatHikingDuration,
  haversineM,
  hikingDifficultyReasons,
  hikingInRegionGroup,
  type HikingRegionGroup,
  type LatLng,
} from '@repo/utils';

// 등산 화면 순수 도우미(웹·앱 공용) — 산 목록 거르기·정렬, 코스 선 복원, 고도 그래프 위치 ↔ 지도 좌표, 예상 시간·난이도 문구.

// 5차 — 기본은 가까운순(사용자 결정 2026-10-25: 내 위치, 안 되면 서울 시청 기준).
export type HikingSort = 'name' | 'height' | 'near';
export const HIKING_DEFAULT_SORT: HikingSort = 'near';
export const isHikingSort = (v: unknown): v is HikingSort => v === 'name' || v === 'height' || v === 'near';
export const SEOUL_CITY_HALL: LatLng = { lat: 37.5663, lng: 126.9779 };

const norm = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

export interface RankedMountain {
  mountain: HikingMountainSummaryType;
  distM: number | null;
}

// 검색어는 이름·부제·소재지·합친 봉우리 이름에서 찾는다(공백 무시). origin 은 거리 기준(내 위치, 없으면 서울 시청).
export const rankMountains = (
  items: readonly HikingMountainSummaryType[],
  opts: { q: string; group: HikingRegionGroup | null; sort: HikingSort; origin: LatLng | null },
): RankedMountain[] => {
  const q = norm(opts.q);
  const out = items
    .filter((m) => !opts.group || hikingInRegionGroup(m.regions, opts.group))
    .filter((m) => !q || norm(`${m.name}${m.subtitle ?? ''}${m.area ?? ''}${m.peaks.join('')}${m.park ?? ''}`).includes(q))
    .map((m) => ({ mountain: m, distM: opts.origin ? haversineM(opts.origin, m) : null }));
  const byName = (a: RankedMountain, b: RankedMountain) => a.mountain.name.localeCompare(b.mountain.name, 'ko');
  if (opts.sort === 'height') out.sort((a, b) => (b.mountain.heightM ?? 0) - (a.mountain.heightM ?? 0) || byName(a, b));
  else if (opts.sort === 'near' && opts.origin) out.sort((a, b) => a.distM! - b.distM! || byName(a, b));
  else out.sort(byName);
  return out;
};

// 목록은 이만큼씩 그린다(2천 곳 남짓을 한 번에 그리지 않게) — '더 보기'로 늘린다.
export const HIKING_LIST_PAGE = 60;

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

// ── 예상 시간·난이도 ─────────────────────────────────────────────────────────────

type CourseTimes = Pick<HikingCourseSummaryType, 'shape' | 'timeMin' | 'timeRevMin' | 'roundTripMin'>;

// 카드·상세 첫 줄 — 정상 왕복은 왕복, 나머지는 코스 방향 편도. 고도 없는 코스는 null.
export const courseOutingLabel = (c: CourseTimes): string | null => {
  const min = c.roundTripMin ?? c.timeMin;
  return min === null ? null : `${c.roundTripMin !== null ? '왕복 ' : ''}${formatHikingDuration(min)}`;
};

// 방향별 — 오르기·내려오기 / 한 바퀴·반대로 / 이 방향·반대 방향.
export const courseTimeBreakdown = (c: CourseTimes): string | null => {
  if (c.timeMin === null || c.timeRevMin === null) return null;
  const f = formatHikingDuration;
  if (c.shape === 'summit') return `오르기 ${f(c.timeMin)} · 내려오기 ${f(c.timeRevMin)}`;
  if (c.shape === 'loop') return `한 바퀴 ${f(c.timeMin)} · 반대로 돌면 ${f(c.timeRevMin)}`;
  return `이 방향 ${f(c.timeMin)} · 반대 방향 ${f(c.timeRevMin)}`;
};

export const courseDifficultyReasons = (
  c: CourseTimes & Pick<HikingCourseSummaryType, 'difficulty' | 'gainM' | 'steepPct' | 'roughSurfaces'>,
): string[] => {
  const outingMin = c.roundTripMin ?? c.timeMin;
  if (outingMin === null || c.gainM === null || c.difficulty === null) return [];
  return hikingDifficultyReasons({ outingMin, roundTrip: c.roundTripMin !== null, gainM: c.gainM, steepPct: c.steepPct, roughSurfaces: c.roughSurfaces });
};
