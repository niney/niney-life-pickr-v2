import type { HikingDifficulty } from '@repo/utils';

// 등산 화면 순수 도우미 — 산 목록·코스 문구·날짜/출발 시각 도우미는 앱과 함께 쓰려고 @repo/shared(hiking/hikingFormat)로
// 옮겼다. 여기는 다시 내보내기 + 웹 전용(난이도 칩 색).
export {
  HIKING_DEFAULT_SORT,
  HIKING_DEFAULT_START_MIN,
  HIKING_LIST_PAGE,
  HIKING_START_MINUTES,
  SEOUL_CITY_HALL,
  courseDifficultyReasons,
  courseOutingLabel,
  courseTimeBreakdown,
  decodePieces,
  formatAtM,
  formatHikingDistance,
  hikingDayLabel,
  hikingDefaultPick,
  hikingStartsFor,
  hmToMin,
  isHikingSort,
  isoHm,
  kstHm,
  minToHm,
  officialCourseLines,
  pointAtDistance,
  rankMountains,
  startMs,
  type HikingSort,
  type RankedMountain,
} from '@repo/shared';

export const DIFFICULTY_CHIP_CLASS: Record<HikingDifficulty, string> = {
  easy: 'bg-green-500/10 text-green-700 dark:text-green-300',
  moderate: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  hard: 'bg-red-500/10 text-red-700 dark:text-red-300',
};
