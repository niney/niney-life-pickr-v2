import type { MealStatsNutrientsResultType } from '@repo/api-contract';
import { useAuthStore, useMealStatsNutrients } from '@repo/shared';
import { MEAL_NUTRIENT_STATUS_LABEL, mealNutrientDisplayStatus, toLocalDateKey } from '@repo/utils';
import type { MotionMine } from './motion/types';

// 스토리의 '내 최근 2주 하루 평균' — 글 장면(MealStoryFigure)과 영상(MealStoryMotion)이 같은 요청을 나눠 쓴다.

export const daysAgoKey = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toLocalDateKey(d);
};

/** 로그인했을 때만 최근 2주(오늘 포함 14일) 통계 영양소를 부른다. */
export const useStoryMyStats = () => {
  const token = useAuthStore((s) => s.token);
  const stats = useMealStatsNutrients(daysAgoKey(13), daysAgoKey(0), !!token);
  return { token, stats };
};

/** 영상에 넣을 내 값 — 영양소 키별(하루 평균이 없는 줄은 뺀다). 판정 글자는 영양 탭과 같은 라벨, 기록이 모자라면 빈 객체. */
export const toMotionMine = (data: MealStatsNutrientsResultType): MotionMine => {
  if (data.status !== 'ok') return {};
  const mine: MotionMine = {};
  for (const row of data.rows) {
    if (row.intakePerDay === null) continue;
    const shown = row.status ? mealNutrientDisplayStatus({ status: row.status, recordGap: row.recordGap }) : null;
    mine[row.key] = {
      value: row.intakePerDay,
      unit: row.unit,
      percent: row.percent,
      statusLabel: shown ? MEAL_NUTRIENT_STATUS_LABEL[shown] : null,
      over: row.status === 'high',
    };
  }
  return mine;
};
