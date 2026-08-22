import { describe, expect, it } from 'vitest';
import { mealNutritionLabel, summarizeMealNutrition } from './mealNutrition.js';

describe('summarizeMealNutrition', () => {
  it('값이 있는 항목만 더하고 몇 개가 반영됐는지 남긴다', () => {
    const s = summarizeMealNutrition([
      { kcal: 528, proteinG: 12, sodiumMg: 1800 },
      { kcal: null },
      { kcal: 2, proteinG: 0.1, sodiumMg: 300 },
    ]);
    expect(s.kcal).toBe(530);
    expect(s.proteinG).toBe(12.1);
    expect(s.counted).toBe(2);
    expect(s.total).toBe(3);
  });

  it('값이 하나도 없으면 null — 0 은 "안 먹었다"는 뜻이 된다', () => {
    const s = summarizeMealNutrition([{ kcal: null }, {}]);
    expect(s.kcal).toBeNull();
    expect(mealNutritionLabel(s)).toBeNull();
  });

  it('일부만 반영됐으면 문구에 그 사실을 붙인다', () => {
    const s = summarizeMealNutrition([{ kcal: 530 }, { kcal: null }]);
    expect(mealNutritionLabel(s)).toBe('약 530kcal · 2개 중 1개 반영');
  });

  it('빌려온 값이 섞이면 추정이라고 밝힌다', () => {
    const s = summarizeMealNutrition([{ kcal: 324, nutritionFrom: '버섯콩불고기 외 8종 중앙값' }]);
    expect(s.hasEstimate).toBe(true);
    expect(mealNutritionLabel(s)).toBe('약 324kcal (추정)');
  });
});
