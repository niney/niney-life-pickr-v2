import type { MealStatsNutrientRowType, MealStatsNutrientsResultType } from '@repo/api-contract';
import { useAuthStore, useMealStatsNutrients } from '@repo/shared';
import { MEAL_NUTRIENT_STATUS_LABEL, mealNutrientDisplayStatus, toLocalDateKey, type MealNutrientDisplayKey } from '@repo/utils';
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

/** 영상에 넣을 내 값 — 영양소 키별(하루 평균이 없는 줄은 뺀다). 판정 글자는 storyStatus, 기록이 모자라면 빈 객체. */
export const toMotionMine = (data: MealStatsNutrientsResultType): MotionMine => {
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
    };
  }
  return mine;
};
