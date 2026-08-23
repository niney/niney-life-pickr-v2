import type { MealBehaviorInsightType } from '@repo/api-contract';
import {
  FOOD_DISH_TYPE_LABEL,
  FOOD_MAIN_INGREDIENT_LABEL,
  dateKeyRange,
  daysBetween,
} from '@repo/utils';
import { parseMealRecommendationFeedback } from '../meal-recommendation/meal-recommendation.feedback.js';

export interface InsightEntryRow {
  eatenDate: string;
  items: {
    name: string;
    nameNorm: string;
    dishType: string | null;
    mainIngredient: string | null;
    isMain: boolean;
  }[];
}

export interface InsightRecommendationRow {
  feedbackJson: string | null;
  // 이전 호출부와 저장 데이터를 위해 optional. 서비스 조회 결과에는 항상 들어온다.
  targetDate?: string;
}

const MIN_WEEKLY_SAMPLE = 3;
const MIN_PATTERN_SAMPLE = 4;
const HIGH_REPEAT_RATE = 0.35;
const HIGH_AXIS_SHARE = 0.65;

const shiftDate = (key: string, days: number): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return '';
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const between = (date: string, from: string, to: string): boolean => date >= from && date <= to;

const availableDays = (from: string, to: string): number =>
  from && to && from <= to ? dateKeyRange(from, to).length : 0;

const activityInsight = (
  recentRows: InsightEntryRow[],
  previousRows: InsightEntryRow[],
  recentAvailableDays: number,
  previousAvailableDays: number,
): MealBehaviorInsightType => {
  const recentRecordedDays = new Set(recentRows.map((row) => row.eatenDate)).size;
  const previousRecordedDays = new Set(previousRows.map((row) => row.eatenDate)).size;

  if (previousAvailableDays === 0) {
    return {
      key: 'weekly-activity',
      tone: recentRecordedDays >= 3 ? 'positive' : 'info',
      title: '최근 기록 흐름을 만들고 있어요',
      detail: `최근 ${recentAvailableDays}일 범위에서 ${recentRecordedDays}일·${recentRows.length}끼를 기록했어요. 직전 기록이 쌓이면 주간 변화를 함께 보여 드릴게요.`,
    };
  }

  const recentMealRate = recentRows.length / Math.max(1, recentAvailableDays);
  const previousMealRate = previousRows.length / previousAvailableDays;
  const recentDayRate = recentRecordedDays / Math.max(1, recentAvailableDays);
  const previousDayRate = previousRecordedDays / previousAvailableDays;
  const increased =
    recentMealRate > previousMealRate + 0.15 || recentDayRate > previousDayRate + 0.1;
  const decreased =
    recentMealRate + 0.15 < previousMealRate || recentDayRate + 0.1 < previousDayRate;

  return {
    key: 'weekly-activity',
    tone: increased ? 'positive' : decreased ? 'attention' : 'info',
    title: increased
      ? '최근 기록 빈도가 늘었어요'
      : decreased
        ? '최근 기록 빈도가 줄었어요'
        : '기록 흐름이 비슷하게 이어졌어요',
    detail: `최근 ${recentAvailableDays}일은 ${recentRecordedDays}일·${recentRows.length}끼, 직전 ${previousAvailableDays}일은 ${previousRecordedDays}일·${previousRows.length}끼를 기록했어요.`,
  };
};

const repeatInsight = (rows: InsightEntryRow[]): MealBehaviorInsightType | null => {
  const foodDates = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const item of row.items) {
      if (!item.isMain) continue;
      const key = item.nameNorm || item.name;
      const dates = foodDates.get(key) ?? new Set<string>();
      dates.add(row.eatenDate);
      foodDates.set(key, dates);
    }
  }

  let occurrences = 0;
  let repeats = 0;
  for (const dates of foodDates.values()) {
    const sorted = [...dates].sort();
    occurrences += sorted.length;
    for (let index = 1; index < sorted.length; index += 1) {
      const gap = daysBetween(sorted[index - 1]!, sorted[index]!);
      if (gap !== null && gap <= 7) repeats += 1;
    }
  }
  if (occurrences < MIN_PATTERN_SAMPLE) return null;

  const rate = repeats / occurrences;
  const percent = Math.round(rate * 100);
  if (rate >= HIGH_REPEAT_RATE) {
    return {
      key: 'weekly-repeat',
      tone: 'attention',
      title: '최근 메뉴가 자주 겹쳤어요',
      detail: `최근 7일 주식 기록 ${occurrences}번 중 ${percent}%가 7일 안에 다시 등장했어요. 다음 끼니에는 다른 메뉴도 한 번 골라보세요.`,
    };
  }
  return {
    key: 'weekly-repeat',
    tone: 'positive',
    title: '최근 메뉴가 비교적 다양했어요',
    detail: `최근 7일 주식 기록 ${occurrences}번 중 7일 안에 다시 등장한 비율은 ${percent}%였어요. 지금의 선택 폭을 이어가 보세요.`,
  };
};

const dominantAxis = (
  rows: InsightEntryRow[],
): {
  axis: '조리 형태' | '주재료';
  label: string;
  count: number;
  total: number;
  share: number;
} | null => {
  const dish = new Map<string, number>();
  const ingredient = new Map<string, number>();
  for (const row of rows) {
    for (const item of row.items) {
      if (!item.isMain) continue;
      if (item.dishType) dish.set(item.dishType, (dish.get(item.dishType) ?? 0) + 1);
      if (item.mainIngredient)
        ingredient.set(item.mainIngredient, (ingredient.get(item.mainIngredient) ?? 0) + 1);
    }
  }

  const candidate = (
    counts: Map<string, number>,
    axis: '조리 형태' | '주재료',
    labels: Record<string, string>,
  ) => {
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    if (total < MIN_PATTERN_SAMPLE) return null;
    const [key, count] =
      [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];
    if (!key || count === undefined) return null;
    return { axis, label: labels[key] ?? key, count, total, share: count / total };
  };

  const candidates = [
    candidate(dish, '조리 형태', FOOD_DISH_TYPE_LABEL),
    candidate(ingredient, '주재료', FOOD_MAIN_INGREDIENT_LABEL),
  ].filter((value): value is NonNullable<typeof value> => value !== null);
  return candidates.sort((a, b) => b.share - a.share)[0] ?? null;
};

const balanceInsight = (rows: InsightEntryRow[]): MealBehaviorInsightType | null => {
  const dominant = dominantAxis(rows);
  if (!dominant || dominant.share < HIGH_AXIS_SHARE || dominant.count < 3) return null;
  return {
    key: 'weekly-balance',
    tone: 'attention',
    title: `${dominant.axis} 선택이 한쪽에 모였어요`,
    detail: `최근 분류 가능한 주식 ${dominant.total}개 중 ${dominant.label}이 ${dominant.count}개였어요. 다음 끼니에는 다른 ${dominant.axis}도 섞어보세요.`,
  };
};

const recommendationInsight = (
  rows: InsightRecommendationRow[],
  recentFrom: string,
  recentTo: string,
): MealBehaviorInsightType | null => {
  // targetDate 가 없는 이전 형태의 순수 함수 입력은 이미 조회 범위로 제한됐다고 보고 포함한다.
  const recent = rows.filter(
    (row) => !row.targetDate || between(row.targetDate, recentFrom, recentTo),
  );
  let chosen = 0;
  let logged = 0;
  for (const row of recent) {
    const feedback = parseMealRecommendationFeedback(row.feedbackJson);
    if (!feedback) continue;
    if (feedback.pickedName) {
      chosen += 1;
      if (feedback.eatenEntryId) logged += 1;
    }
  }
  if (chosen === 0) return null;

  const rate = logged / chosen;
  const followedThrough = rate >= 0.5;
  return {
    key: 'recommendation-follow-through',
    tone: followedThrough ? 'positive' : chosen >= 2 && logged === 0 ? 'attention' : 'info',
    title: followedThrough
      ? '고른 추천이 기록으로 이어졌어요'
      : '추천 선택을 기록으로 이어가 볼까요',
    detail: `최근 7일에 고른 추천 ${chosen}건 중 ${logged}건을 실제 식단으로 기록했어요.`,
  };
};

/**
 * 최근 7일과 직전 7일을 비교하는 결정적 관찰 생성기.
 * 조회 범위가 14일보다 짧으면 겹치는 날짜만 사용하고 그 일수를 문구에 명시한다.
 */
export const computeWeeklyMealInsights = (
  rows: InsightEntryRow[],
  from: string,
  to: string,
  recommendationRows: InsightRecommendationRow[] = [],
): MealBehaviorInsightType[] => {
  const recentStart = shiftDate(to, -6);
  const previousStart = shiftDate(to, -13);
  const previousEnd = shiftDate(to, -7);
  const recentFrom = from > recentStart ? from : recentStart;
  const previousFrom = from > previousStart ? from : previousStart;
  const previousTo = to < previousEnd ? to : previousEnd;

  const scopedRows = rows.filter((row) => between(row.eatenDate, from, to));
  const recentRows = scopedRows.filter((row) => between(row.eatenDate, recentFrom, to));
  const previousRows = scopedRows.filter((row) => between(row.eatenDate, previousFrom, previousTo));
  const weeklySample = recentRows.length + previousRows.length;

  if (weeklySample < MIN_WEEKLY_SAMPLE) {
    const first = weeklySample === 0;
    return [
      {
        key: 'getting-started',
        tone: 'info',
        title: first ? '첫 식단 기록부터 시작해요' : '주간 흐름을 조금 더 모아볼까요',
        detail: first
          ? '끼니를 기록하면 최근 7일의 기록 흐름과 메뉴 반복을 기록 기반으로 보여 드려요.'
          : `최근 비교 구간에 ${weeklySample}끼가 있어요. 한두 끼만 더 기록하면 주간 변화와 메뉴 패턴을 보여 드릴게요.`,
      },
    ];
  }

  const insights: MealBehaviorInsightType[] = [
    activityInsight(
      recentRows,
      previousRows,
      availableDays(recentFrom, to),
      availableDays(previousFrom, previousTo),
    ),
  ];

  const repeat = repeatInsight(recentRows);
  if (repeat) insights.push(repeat);

  const balance = balanceInsight(recentRows);
  if (balance) insights.push(balance);

  const recommendation = recommendationInsight(recommendationRows, recentFrom, to);
  if (recommendation) insights.push(recommendation);

  if (insights.length === 1) {
    insights.push({
      key: 'weekly-pattern-sample',
      tone: 'info',
      title: '이번 주 메뉴 흐름을 모으고 있어요',
      detail:
        '최근 7일의 주식 기록이 조금 더 쌓이면 메뉴 반복과 조리 형태·주재료의 쏠림을 함께 알려 드릴게요.',
    });
  }

  return insights.slice(0, 4);
};
