import type { MealStatsNutrientRowType, MealStatsNutrientsResultType } from '@repo/api-contract';
import { useAuthStore, useMealStatsNutrients } from '@repo/shared';
import { MEAL_NUTRIENT_STATUS_LABEL, mealNutrientDisplayStatus, type MealNutrientDisplayKey } from '@repo/utils';
import { nutrientChangeShort, nutrientChangeText, periodAndPrevious, comparableNutrientChange } from '../meal/mealNutrientChange';
import type { MotionMine } from './motion/types';

// 스토리의 '내 최근 2주 하루 평균' — 글 장면(MealStoryFigure)과 영상(MealStoryMotion)이 같은 요청을 나눠 쓴다.

const STORY_DAYS = 14;
/** 변화 한 줄의 '직전 …' — 이야기의 내 값은 최근 2주라 견주는 것도 그 앞 2주다. */
const STORY_PREV_LABEL = '직전 2주';

/**
 * 로그인했을 때만 최근 2주(오늘 포함 14일) 통계 영양소를 부른다. previous 는 그 직전 2주 — 내 값이 얼마나 달라졌는지 견준다
 * ([이 레시피로 기록]한 뒤 다시 오면 변화가 보인다). 직전 기간은 내 값보다 늦게 와도 된다(변화 한 줄만 나중에 붙는다).
 */
export const useStoryMyStats = () => {
  const token = useAuthStore((s) => s.token);
  const range = periodAndPrevious(STORY_DAYS);
  const stats = useMealStatsNutrients(range.now.from, range.now.to, !!token);
  const previous = useMealStatsNutrients(range.previous.from, range.previous.to, !!token);
  return { token, stats, previous };
};

/**
 * 스토리의 판정 글자 — 영양 탭 라벨을 쓰되, '이보다 적게'인 기준(나트륨 — 만성질환위험감소섭취량)을 지킨 경우는 '충분'이
 * 아니라 '기준 안'(사용자 결정 2026-11-10: '나트륨이 충분하다'로 읽힌다). 글로 보기 칩과 영상 도장이 같이 쓴다.
 * 영양 탭·통계의 글자는 그대로다.
 */
export const storyStatus = (
  row: Pick<MealStatsNutrientRowType, 'status' | 'recordGap' | 'reference'>,
): { key: MealNutrientDisplayKey; label: string } | null => {
  if (!row.status) return null;
  const key = mealNutrientDisplayStatus({ status: row.status, recordGap: row.recordGap });
  return { key, label: key === 'ok' && row.reference?.kind === 'cdrr' ? '기준 안' : MEAL_NUTRIENT_STATUS_LABEL[key] };
};

/**
 * 직전 2주보다 달라진 정도 — 두 기간 모두 판정이 나왔고(평균에 든 날 4일 이상) 하루 평균이 10% 넘게 달라졌을 때만
 * (통계 탭과 같은 문턱), 그리고 두 기간의 기록량(하루 평균 열량)이 비슷할 때만(혼자 서는 한 줄의 더 엄한 규칙 —
 * mealNutrientChange 의 comparableNutrientChange). full 은 글로 보기('직전 2주보다 하루 2.1g(20%) 늘었어요 · 직전엔 부족'),
 * short 는 영상 쪽지('직전 2주보다 20% 늘었어요').
 */
export const storyChange = (
  row: MealStatsNutrientRowType,
  now: MealStatsNutrientsResultType | null | undefined,
  previous: MealStatsNutrientsResultType | null | undefined,
): { full: string; short: string } | null => {
  if (!now || now.status !== 'ok' || !previous || previous.status !== 'ok') return null;
  const before = previous.rows.find((r) => r.key === row.key);
  const kcal = (data: MealStatsNutrientsResultType) => data.rows.find((r) => r.key === 'kcal')?.intakePerDay;
  const change = comparableNutrientChange(row, before, { now: kcal(now), before: kcal(previous) });
  if (!change) return null;
  // 직전 판정도 이야기의 글자로 — 지킨 나트륨 기준은 '기준 안'.
  const label = (key: MealNutrientDisplayKey) => (key === 'ok' && before?.reference?.kind === 'cdrr' ? '기준 안' : MEAL_NUTRIENT_STATUS_LABEL[key]);
  return { full: nutrientChangeText(change, STORY_PREV_LABEL, label), short: nutrientChangeShort(change, STORY_PREV_LABEL) };
};

/**
 * 영상에 넣을 내 값 — 영양소 키별(하루 평균이 없는 줄은 뺀다). 판정 글자는 storyStatus, 기록이 모자라면 빈 객체.
 * previous(직전 2주)를 받았으면 변화 한 줄(change)도 싣는다.
 */
export const toMotionMine = (data: MealStatsNutrientsResultType, previous?: MealStatsNutrientsResultType | null): MotionMine => {
  if (data.status !== 'ok') return {};
  const mine: MotionMine = {};
  for (const row of data.rows) {
    if (row.intakePerDay === null) continue;
    mine[row.key] = {
      value: row.intakePerDay,
      unit: row.unit,
      percent: row.percent,
      standard: row.reference?.amount ?? null,
      statusLabel: storyStatus(row)?.label ?? null,
      over: row.status === 'high',
      change: storyChange(row, data, previous)?.short ?? null,
    };
  }
  return mine;
};
