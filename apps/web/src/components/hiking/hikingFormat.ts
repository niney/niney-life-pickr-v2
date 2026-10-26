import type { HikingDifficulty } from '@repo/utils';

// 등산 화면 순수 도우미 — 산 목록·코스 문구 도우미는 앱과 함께 쓰려고 @repo/shared(hiking/hikingFormat)로 옮겼다. 여기는 다시
// 내보내기 + 웹 전용(날짜·출발 시각 고르기, 난이도 칩 색).
export {
  HIKING_DEFAULT_SORT,
  HIKING_LIST_PAGE,
  SEOUL_CITY_HALL,
  courseDifficultyReasons,
  courseOutingLabel,
  courseTimeBreakdown,
  decodePieces,
  formatAtM,
  formatHikingDistance,
  isHikingSort,
  officialCourseLines,
  pointAtDistance,
  rankMountains,
  type HikingSort,
  type RankedMountain,
} from '@repo/shared';

// ── 날짜·출발 시각(산행 조건 카드·추천 입력) ─────────────────────────────────────────

const HOUR_MS = 3_600_000;
// 고를 수 있는 출발 시각 — 04:00~18:00, 30분 간격(분).
export const HIKING_START_MINUTES = Array.from({ length: 29 }, (_, i) => 4 * 60 + i * 30);
export const HIKING_DEFAULT_START_MIN = 8 * 60;
const DAY_WORDS = ['오늘', '내일', '모레'];
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');

export const minToHm = (m: number): string => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const hmToMin = (hm: string | null | undefined): number | null => {
  const m = /^(\d{2}):?(\d{2})$/.exec(hm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const startMs = (date: string, min: number): number => Date.parse(`${date}T${minToHm(min)}:00+09:00`);
export const kstHm = (ms: number): string => {
  const d = new Date(ms + 9 * HOUR_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
export const isoHm = (iso: string | null): string => (iso ? kstHm(Date.parse(iso)) : '—');
// "오늘 10.25(일)".
export const hikingDayLabel = (date: string, i: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAY_WORDS[i] ?? date} ${d.getUTCMonth() + 1}.${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]})`;
};
// 오늘은 지금 이후 시각만.
export const hikingStartsFor = (date: string, dayIndex: number, nowMs: number): number[] =>
  dayIndex === 0 ? HIKING_START_MINUTES.filter((m) => startMs(date, m) >= nowMs) : HIKING_START_MINUTES;
// 기본 고르기 — 오늘 남은 시각이 있으면 오늘 가장 이른 것, 없으면 내일 08:00.
export const hikingDefaultPick = (dates: readonly string[], nowMs: number): { day: number; startMin: number } => {
  const today = dates[0] ? hikingStartsFor(dates[0], 0, nowMs) : [];
  return today.length > 0 ? { day: 0, startMin: today[0]! } : { day: Math.min(1, dates.length - 1), startMin: HIKING_DEFAULT_START_MIN };
};

export const DIFFICULTY_CHIP_CLASS: Record<HikingDifficulty, string> = {
  easy: 'bg-green-500/10 text-green-700 dark:text-green-300',
  moderate: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  hard: 'bg-red-500/10 text-red-700 dark:text-red-300',
};
