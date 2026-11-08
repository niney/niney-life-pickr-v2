import type { MealNutritionAnalysisType } from '@repo/api-contract';
import { mealNutrientDisplayStatus, type MealNutrientDisplayKey } from '@repo/utils';

// 영양소 판정의 글자색 — 식단 홈 영양정보 라벨·통계 묶음 카드가 같은 말투(많음 빨강 · 부족 갈색 · 충분 초록 · 판단 못 함 옅게).
export const MEAL_NUTRIENT_TONE: Record<MealNutrientDisplayKey, string> = {
  high: 'meal-over',
  low: 'meal-short',
  borderline: 'meal-short',
  recordGap: 'meal-faint',
  ok: 'meal-ok',
  unknown: 'meal-faint',
};

/** 영양소 점검에서 '많음·부족·조금 부족'으로 나온 영양소 — 키 → 표시 판정. 충분·판단 보류·기록 더 필요는 뺀다. */
export const flaggedNutrients = (
  analysis: MealNutritionAnalysisType | null | undefined,
): Map<string, MealNutrientDisplayKey> => {
  const out = new Map<string, MealNutrientDisplayKey>();
  if (!analysis || analysis.status !== 'ok') return out;
  for (const n of analysis.nutrients) {
    const d = mealNutrientDisplayStatus(n);
    if (d === 'high' || d === 'low' || d === 'borderline') out.set(n.key, d);
  }
  return out;
};
