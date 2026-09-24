// 바다(/sea) — 국립해양조사원 생활해양예보지수(해수욕·서핑·바다낚시·갯벌체험·바다갈라짐·바다여행, 7일 오전/오후
// 5단계) + 조석예보(고·저조) + 이안류 지수의 공용 규칙. 서버 정규화·웹 표시·마커가 같은 라벨·색·순서를 쓴다.
import { haversineM, type LatLng } from './geo.js';
import { buildCircleMarkerSvg, buildPinMarkerSvg } from './markerFrame.js';
import { SEA_RIP_BEACHES, SEA_TIDE_STATIONS, type SeaRipBeach, type SeaTideStation } from './seaStations.js';

export * from './seaStations.js';

// ── 활동 ──────────────────────────────────────────────────────────────────────
// 탭 순서 = 배열 순서(여름 대표 → 연중 레저 → 체험 → 여행 권역).
export const SEA_ACTIVITIES = ['beach', 'surf', 'fishing', 'mudflat', 'seaSplit', 'seaTrip'] as const;
export type SeaActivity = (typeof SEA_ACTIVITIES)[number];
export const SEA_ACTIVITY_LABEL: Record<SeaActivity, string> = {
  beach: '해수욕',
  surf: '서핑',
  fishing: '바다낚시',
  mudflat: '갯벌체험',
  seaSplit: '바닷길',
  seaTrip: '바다여행',
};
// 활동별 한 줄 설명(탭 아래 안내).
export const SEA_ACTIVITY_HINT: Record<SeaActivity, string> = {
  beach: '해수욕장 파고·수온·기온·풍속과 개장 여부',
  surf: '서핑 해변 파고·파주기 — 초급·중급·상급별 지수',
  fishing: '갯바위·선상 포인트 어종별 낚시 지수와 물때',
  mudflat: '갯벌체험 마을의 체험 가능 시간과 날씨',
  seaSplit: '바다갈라짐(모세의 기적) 명소의 길이 열리는 시간',
  seaTrip: '해안 권역별 바다여행 지수와 물때',
};
export const isSeaActivity = (v: unknown): v is SeaActivity => typeof v === 'string' && (SEA_ACTIVITIES as readonly string[]).includes(v);
// 오전/오후 구분이 있는 활동(갯벌·바다갈라짐은 하루 한 번 체험 시각).
export const seaActivityHasPeriod = (a: SeaActivity): boolean => a !== 'mudflat' && a !== 'seaSplit';

// ── 지수 단계 ─────────────────────────────────────────────────────────────────
// 1 매우나쁨 ~ 5 매우좋음, 0 = 체험불가(갯벌). 원문 라벨이 이 밖이면 null(회색).
export type SeaIndexLevel = 0 | 1 | 2 | 3 | 4 | 5;
export const SEA_INDEX_LABEL: Record<SeaIndexLevel, string> = {
  0: '체험불가',
  1: '매우나쁨',
  2: '나쁨',
  3: '보통',
  4: '좋음',
  5: '매우좋음',
};
export const seaIndexLevelOf = (label: string | null | undefined): SeaIndexLevel | null => {
  const t = (label ?? '').replace(/\s+/g, '');
  const hit = (Object.entries(SEA_INDEX_LABEL) as [string, string][]).find(([, v]) => v === t);
  return hit ? (Number(hit[0]) as SeaIndexLevel) : null;
};
// 지도·칩 색 — 매우좋음 파랑 → 좋음 초록 → 보통 노랑 → 나쁨 주황 → 매우나쁨 빨강, 체험불가·없음 회색.
export const SEA_INDEX_COLOR: Record<SeaIndexLevel | 'none', string> = {
  5: '#0284c7',
  4: '#16a34a',
  3: '#ca8a04',
  2: '#ea580c',
  1: '#dc2626',
  0: '#6b7280',
  none: '#9ca3af',
};
// 계약 값은 number — 0~5 정수가 아니면(결측·이상값) 회색.
export const seaIndexColor = (level: number | null | undefined): string =>
  level === null || level === undefined || !Number.isInteger(level) || level < 0 || level > 5
    ? SEA_INDEX_COLOR.none
    : SEA_INDEX_COLOR[level as SeaIndexLevel];

// ── 이안류 ────────────────────────────────────────────────────────────────────
// 4단계(관심 → 주의 → 경계 → 위험). 매년 6~9월에만 제공.
export type SeaRipLevel = 1 | 2 | 3 | 4;
export const SEA_RIP_LABEL: Record<SeaRipLevel, string> = { 1: '관심', 2: '주의', 3: '경계', 4: '위험' };
export const SEA_RIP_COLOR: Record<SeaRipLevel, string> = { 1: '#0284c7', 2: '#ca8a04', 3: '#ea580c', 4: '#dc2626' };
export const seaRipLevelOf = (label: string | null | undefined): SeaRipLevel | null => {
  const t = (label ?? '').trim();
  const hit = (Object.entries(SEA_RIP_LABEL) as [string, string][]).find(([, v]) => v === t);
  return hit ? (Number(hit[0]) as SeaRipLevel) : null;
};
// KST 월(1~12)이 이안류 제공 기간인지.
export const isSeaRipSeason = (month: number): boolean => month >= 6 && month <= 9;

// ── 가까운 지점 ───────────────────────────────────────────────────────────────
export const nearestSeaTideStation = (p: LatLng): SeaTideStation & { distM: number } => {
  let best: SeaTideStation = SEA_TIDE_STATIONS[0]!;
  let bestD = Number.POSITIVE_INFINITY;
  for (const s of SEA_TIDE_STATIONS) {
    const d = haversineM(p, s);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return { ...best, distM: Math.round(bestD) };
};
// 이안류 해수욕장 — 이름(공백 무시) 일치 우선, 아니면 maxM 안 가장 가까운 곳.
export const matchSeaRipBeach = (name: string, p: LatLng, maxM = 2000): SeaRipBeach | null => {
  const norm = (s: string): string => s.replace(/\s+/g, '');
  const byName = SEA_RIP_BEACHES.find((b) => norm(b.name) === norm(name));
  if (byName) return byName;
  let best: SeaRipBeach | null = null;
  let bestD = maxM;
  for (const b of SEA_RIP_BEACHES) {
    const d = haversineM(p, b);
    if (d <= bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
};

// 조석 극치구분(extrSe) — 1 오전 고조 · 2 오전 저조 · 3 오후 고조 · 4 오후 저조(홀수 = 만조).
export const seaTideKindOf = (extrSe: string | number | null | undefined): 'high' | 'low' | null => {
  const n = Number(extrSe);
  return n >= 1 && n <= 4 ? (n % 2 === 1 ? 'high' : 'low') : null;
};

// ── 지도 마커 ─────────────────────────────────────────────────────────────────
// 26×26 원(비선택) / 32×48 핀(선택) — 대기·버스 마커와 같은 프레임. 채움색 = 지수 단계, 안쪽은 파도 아이콘.
const WAVE_ICON_PATH =
  '<path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0 2 2 2 2"/>' + '<path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0 2 2 2 2"/>' + '<path d="M2 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0 2 2 2 2"/>';

export const buildSeaSpotMarkerDataUrl = (level: SeaIndexLevel | null, selected: boolean): string => {
  const fill = seaIndexColor(level);
  const svg = selected ? buildPinMarkerSvg({ fill, innerSvg: WAVE_ICON_PATH }) : buildCircleMarkerSvg({ fill, innerSvg: WAVE_ICON_PATH });
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
};
