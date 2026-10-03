import type { MealRecommendationType } from '@repo/api-contract';
import { MEAL_SLOT_LABEL, mealDateLabel } from '@repo/utils';

// 식단 추천 "최근 추천" 목록·카드 머리의 문구 — 웹(MealRecommendTab)·앱(MealRecommendView)이 같이 쓴다.
// 같은 날 같은 끼니로 여러 번 받은 추천이 "2026-10-04 저녁"으로만 보여 구분되지 않았다(2026-10-04) —
// 받은 시각을 붙인다.

/** 받은 시각 'HH:MM'(기기 시간대). 잘못된 값이면 null. */
export const recommendationReceivedTime = (createdAt: string): string | null => {
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return null;
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
};

/** '오늘 저녁 · 19:12' — 대상 날짜·끼니와 받은 시각. */
export const recommendationWhenLabel = (
  rec: Pick<MealRecommendationType, 'targetDate' | 'targetSlot' | 'createdAt'>,
  today: string,
): string => {
  const time = recommendationReceivedTime(rec.createdAt);
  return `${mealDateLabel(rec.targetDate, today)} ${MEAL_SLOT_LABEL[rec.targetSlot]}${time ? ` · ${time}` : ''}`;
};

/** 목록 한 줄의 음식 — 고른 음식이 있으면 그것, 없으면 후보 전부. */
export const recommendationHistoryFoods = (
  rec: Pick<MealRecommendationType, 'items' | 'feedback'>,
): string => rec.feedback?.pickedName ?? rec.items.map((item) => item.name).join(', ');

/** 그 추천이 어디까지 이어졌는지 — 기록으로 이어짐 > 후보를 고름 > 없음. */
export const recommendationProgressLabel = (
  rec: Pick<MealRecommendationType, 'feedback'>,
): '기록 완료' | '선택됨' | null =>
  rec.feedback?.eatenEntryId ? '기록 완료' : rec.feedback?.pickedName ? '선택됨' : null;
