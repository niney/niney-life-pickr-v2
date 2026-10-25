// 등산 "오늘 어느 산" 추천(4차) — 코스 점수와 추천 이유 문장. 서버(GET /v1/hiking/recommend)가 607코스를 이 점수로 줄 세우고
// 상위 산만 오늘의 조건(날씨·산불·대기)을 받아 다시 매긴다. 사용자 결정(2026-10-25): 입력은 출발 위치·날짜·출발 시각·산행 시간·
// 난이도·이동 수단, 거리는 직선 + 대략 차로 시간. docs/PLAN-hiking.md §4차
import { HIKING_DIFFICULTY_LABEL, HIKING_SHAPE_LABEL, formatHikingDuration, type HikingCourseShape, type HikingDifficulty } from './hiking.js';
import type { HikingCaution, HikingDaylightStatus } from './hikingConditions.js';

// ── 입력 ────────────────────────────────────────────────────────────────────────
export const HIKING_DURATIONS = ['short', 'half', 'day'] as const;
export type HikingDuration = (typeof HIKING_DURATIONS)[number];
export const isHikingDuration = (v: unknown): v is HikingDuration => (HIKING_DURATIONS as readonly unknown[]).includes(v);
export const HIKING_DURATION_LABEL: Record<HikingDuration, string> = { short: '3시간 안', half: '반나절', day: '하루' };
// 예상 시간(왕복 또는 코스 방향, 분) 범위와 가장 알맞은 길이.
export const HIKING_DURATION_RANGE: Record<HikingDuration, { min: number; max: number; target: number }> = {
  short: { min: 0, max: 180, target: 150 },
  half: { min: 180, max: 330, target: 270 },
  day: { min: 330, max: 600, target: 420 },
};

export const HIKING_LEVELS = ['any', 'easy', 'moderate', 'hard'] as const;
export type HikingLevel = (typeof HIKING_LEVELS)[number];
export const isHikingLevel = (v: unknown): v is HikingLevel => (HIKING_LEVELS as readonly unknown[]).includes(v);
export const HIKING_LEVEL_LABEL: Record<HikingLevel, string> = { any: '상관없음', ...HIKING_DIFFICULTY_LABEL };

export const HIKING_TRAVEL_MODES = ['car', 'transit'] as const;
export type HikingTravelMode = (typeof HIKING_TRAVEL_MODES)[number];
export const isHikingTravelMode = (v: unknown): v is HikingTravelMode => (HIKING_TRAVEL_MODES as readonly unknown[]).includes(v);
export const HIKING_TRAVEL_MODE_LABEL: Record<HikingTravelMode, string> = { car: '차', transit: '대중교통' };

// 내 위치를 못 쓸 때 고르는 출발 도시(시도 대표 도시 중심).
export const HIKING_ORIGIN_CITIES = [
  { key: 'seoul', name: '서울', lat: 37.5665, lng: 126.978 },
  { key: 'incheon', name: '인천', lat: 37.4563, lng: 126.7052 },
  { key: 'suwon', name: '수원', lat: 37.2636, lng: 127.0286 },
  { key: 'chuncheon', name: '춘천', lat: 37.8813, lng: 127.7298 },
  { key: 'gangneung', name: '강릉', lat: 37.7519, lng: 128.8761 },
  { key: 'cheongju', name: '청주', lat: 36.6424, lng: 127.489 },
  { key: 'daejeon', name: '대전', lat: 36.3504, lng: 127.3845 },
  { key: 'cheonan', name: '천안', lat: 36.8151, lng: 127.1139 },
  { key: 'jeonju', name: '전주', lat: 35.8242, lng: 127.148 },
  { key: 'gwangju', name: '광주', lat: 35.1595, lng: 126.8526 },
  { key: 'daegu', name: '대구', lat: 35.8714, lng: 128.6014 },
  { key: 'andong', name: '안동', lat: 36.5684, lng: 128.7294 },
  { key: 'busan', name: '부산', lat: 35.1796, lng: 129.0756 },
  { key: 'ulsan', name: '울산', lat: 35.5384, lng: 129.3114 },
  { key: 'changwon', name: '창원', lat: 35.2281, lng: 128.6811 },
  { key: 'jeju', name: '제주', lat: 33.4996, lng: 126.5312 },
] as const;
export type HikingOriginCityKey = (typeof HIKING_ORIGIN_CITIES)[number]['key'];
export const hikingOriginCity = (key: string | null | undefined) => HIKING_ORIGIN_CITIES.find((c) => c.key === key) ?? null;

// ── 대략 차로 시간 ──────────────────────────────────────────────────────────────
// 길찾기 API 없이 — 도로 거리 ≈ 직선 × 1.3, 평균 속력은 가까우면 40km/h 에서 150km 넘으면 80km/h 로, 주차·출발 10분을 더한다.
// 화면에는 "약"과 함께 추정이라고 적는다(제주 — 육지처럼 바다를 건너는 길은 따지지 않는다).
export const HIKING_ROAD_DETOUR = 1.3;
export const estimateDriveMinutes = (straightM: number): number => {
  const roadKm = (straightM / 1000) * HIKING_ROAD_DETOUR;
  const speed = 40 + (Math.min(roadKm, 150) / 150) * 40;
  return Math.round((roadKm / speed) * 60 + 10);
};

// ── 계절 키워드 ──────────────────────────────────────────────────────────────────
// 산 소개(부제·선정 이유·개관)에 나오면 가산. 달마다 볼거리.
export const HIKING_SEASON_KEYWORDS: Record<number, readonly string[]> = {
  1: ['설경', '눈꽃', '상고대'],
  2: ['설경', '눈꽃', '상고대'],
  3: ['진달래', '벚꽃', '산수유'],
  4: ['진달래', '벚꽃', '철쭉'],
  5: ['철쭉', '진달래'],
  6: ['계곡', '폭포'],
  7: ['계곡', '폭포'],
  8: ['계곡', '폭포'],
  9: ['억새', '계곡'],
  10: ['단풍', '억새'],
  11: ['단풍', '억새'],
  12: ['설경', '눈꽃', '상고대'],
};
export const hikingSeasonKeywords = (text: string, month: number): string[] =>
  (HIKING_SEASON_KEYWORDS[month] ?? []).filter((k) => text.includes(k));

// ── 점수 ────────────────────────────────────────────────────────────────────────
// 100점 남짓: 산행 시간 25 · 난이도 15 · 거리 25 · 해 지기 전 하산 15(해 진 뒤면 −20) · 이동 수단 접근 10 · 오늘의 조건 10
// (경고 −6·안내 −2, 바닥 −20) · 계절 +5. 모르는 값(위치 없음·조건 못 받음)은 그 항목 절반.
export interface HikingRecommendFacts {
  outingMin: number | null;
  difficulty: HikingDifficulty | null;
  shape: HikingCourseShape;
  driveMin: number | null;
  // 들머리 근처 주차·정류장, 날머리 근처 정류장(편도만 의미).
  parking: boolean;
  transitStart: boolean;
  transitEnd: boolean;
  daylight: HikingDaylightStatus | null;
  // 오늘의 조건을 받았으면 해 지기 전 하산을 뺀 주의할 점, 못 받았으면 null.
  cautions: readonly HikingCaution[] | null;
  season: readonly string[];
}
export interface HikingRecommendWants {
  duration: HikingDuration;
  level: HikingLevel;
  mode: HikingTravelMode;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const LEVEL_INDEX: Record<HikingDifficulty, number> = { easy: 0, moderate: 1, hard: 2 };

export const hikingTimeFit = (outingMin: number | null, duration: HikingDuration): number => {
  if (outingMin === null) return 5;
  const r = HIKING_DURATION_RANGE[duration];
  if (outingMin >= r.min && outingMin <= r.max) return 25 - (10 * Math.abs(outingMin - r.target)) / (r.max - r.min);
  const over = outingMin < r.min ? r.min - outingMin : outingMin - r.max;
  return 15 * clamp01(1 - over / 60);
};

export const hikingLevelFit = (difficulty: HikingDifficulty | null, level: HikingLevel): number => {
  if (level === 'any') return 15;
  if (difficulty === null) return 5;
  const gap = Math.abs(LEVEL_INDEX[difficulty] - LEVEL_INDEX[level]);
  return gap === 0 ? 15 : gap === 1 ? 6 : 0;
};

// 30분 안이면 만점, 4시간이면 0.
export const hikingDistanceFit = (driveMin: number | null): number => (driveMin === null ? 12.5 : 25 * clamp01(1 - (driveMin - 30) / 210));

export const hikingAccessFit = (f: Pick<HikingRecommendFacts, 'shape' | 'parking' | 'transitStart' | 'transitEnd'>, mode: HikingTravelMode): number => {
  const roundTrip = f.shape !== 'traverse';
  if (mode === 'car') return (f.parking ? 6 : 0) + (roundTrip ? 4 : 0);
  return (f.transitStart ? 6 : 0) + (roundTrip || f.transitEnd ? 4 : 0);
};

export const hikingConditionFit = (cautions: readonly HikingCaution[] | null): number => {
  if (cautions === null) return 5;
  const penalty = cautions.reduce((s, c) => s + (c.level === 'warn' ? 6 : 2), 0);
  return Math.max(-20, 10 - penalty);
};

export const hikingRecommendScore = (f: HikingRecommendFacts, w: HikingRecommendWants): number => {
  const daylight = f.daylight === 'ok' ? 15 : f.daylight === 'tight' ? 6 : f.daylight === 'dark' ? -20 : 7;
  const total =
    hikingTimeFit(f.outingMin, w.duration) +
    hikingLevelFit(f.difficulty, w.level) +
    hikingDistanceFit(f.driveMin) +
    daylight +
    hikingAccessFit(f, w.mode) +
    hikingConditionFit(f.cautions) +
    (f.season.length > 0 ? 5 : 0);
  return Math.round(total * 10) / 10;
};

// 이동 수단에 따른 안내(주의할 점 목록에 info 로 붙인다) — 차로 편도면 차로 돌아가야 하고, 근처 주차·정류장 정보가 없을 수 있다.
export const hikingAccessCautions = (
  mode: HikingTravelMode,
  f: Pick<HikingRecommendFacts, 'shape' | 'parking' | 'transitStart' | 'transitEnd'>,
): HikingCaution[] => {
  const out: HikingCaution[] = [];
  if (mode === 'car') {
    if (f.shape === 'traverse') out.push({ level: 'info', text: '편도 코스 — 내려온 곳에서 차를 둔 들머리로 돌아가야 합니다' });
    if (!f.parking) out.push({ level: 'info', text: '들머리 1km 안에 주차장 정보가 없습니다' });
  } else {
    if (!f.transitStart) out.push({ level: 'info', text: '들머리 근처 정류장 정보가 없습니다' });
    if (f.shape === 'traverse' && !f.transitEnd) out.push({ level: 'info', text: '날머리 근처 정류장 정보가 없습니다' });
  }
  return out;
};

// ── 이유 문장 ──────────────────────────────────────────────────────────────────
export interface HikingReasonInput {
  mode: HikingTravelMode;
  straightM: number | null;
  driveMin: number | null;
  shape: HikingCourseShape;
  outingMin: number | null;
  difficulty: HikingDifficulty | null;
  // "09:00" · "13:10" · "17:34" (KST).
  startHm: string;
  endHm: string | null;
  sunsetHm: string | null;
  daylight: HikingDaylightStatus | null;
  // "구름많음 · 가장 높은 곳 9°C(추정)" 처럼 이미 만든 날씨 한 토막.
  weather: string | null;
  parkingName: string | null;
  transitName: string | null;
  season: readonly string[];
}

const formatKm = (m: number): string => `${Math.round(m / 1000).toLocaleString('ko-KR')}km`;
// 끝 글자 받침으로 이/가.
const iGa = (word: string): string => {
  const code = word.charCodeAt(word.length - 1);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0 ? '이' : '가';
};

// 한두 문장: [거리] [코스] [하산] / [날씨] [접근] [계절].
export const hikingRecommendReason = (r: HikingReasonInput): string => {
  const where =
    r.straightM === null
      ? ''
      : r.mode === 'car' && r.driveMin !== null
        ? `차로 약 ${formatHikingDuration(r.driveMin)}(직선 ${formatKm(r.straightM)}) 거리의 `
        : `직선 ${formatKm(r.straightM)} 거리의 `;
  const course = `${HIKING_SHAPE_LABEL[r.shape]}${r.outingMin !== null ? ` ${formatHikingDuration(r.outingMin)}` : ''}${r.difficulty ? `·${HIKING_DIFFICULTY_LABEL[r.difficulty]}` : ''} 코스`;
  const down =
    r.endHm === null
      ? ''
      : r.daylight === 'dark'
        ? `로, ${r.startHm}에 출발하면 ${r.endHm}쯤 내려와 해가 진 뒤입니다${r.sunsetHm ? `(일몰 ${r.sunsetHm})` : ''}.`
        : `로, ${r.startHm}에 출발하면 ${r.endHm}쯤 내려옵니다${r.sunsetHm ? `(일몰 ${r.sunsetHm})` : ''}.`;
  const first = `${where}${course}${down || '입니다.'}`;
  const extras: string[] = [];
  if (r.weather) extras.push(r.weather);
  if (r.mode === 'car' && r.parkingName) extras.push(`들머리 근처 ${r.parkingName}`);
  if (r.mode === 'transit' && r.transitName) {
    // "정류장"·"…역"·"…정류소"처럼 이름이 스스로 정류장임을 말하면 그대로.
    extras.push(/(정류[장소]|역|종점|터미널)$/.test(r.transitName) ? `들머리 근처 ${r.transitName}` : `들머리 근처 정류장 ${r.transitName}`);
  }
  if (r.season.length > 0) extras.push(`산 소개에 ${r.season.join('·')}${iGa(r.season.at(-1)!)} 나옵니다`);
  return extras.length > 0 ? `${first} ${extras.join(', ')}.` : first;
};
