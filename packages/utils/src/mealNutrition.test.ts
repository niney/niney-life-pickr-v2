import { describe, expect, it } from 'vitest';
import { mealMacroGapNote, mealNutritionLabel, summarizeMealNutrition } from './mealNutrition.js';

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

  it('주식이 있는데 곁들임만 반영됐으면 합계를 감춘다 — "약 2kcal"은 오해를 부른다', () => {
    const s = summarizeMealNutrition([
      { kcal: null, isMain: true },   // 양념치킨 — 공개된 영양이 없다
      { kcal: 2, isMain: false },     // 단무지
      { kcal: null, isMain: false },  // 맥주
    ]);
    expect(s.counted).toBe(1);
    expect(s.countedMain).toBe(0);
    expect(mealNutritionLabel(s)).toBeNull();
  });

  it('주식이 하나라도 반영되면 보여 준다', () => {
    const s = summarizeMealNutrition([
      { kcal: 451, isMain: true },
      { kcal: null, isMain: false },
    ]);
    expect(mealNutritionLabel(s)).toBe('약 451kcal · 2개 중 1개 반영');
  });

  it('isMain 을 안 넘기면 전부 주식으로 본다 — 기존 호출부 호환', () => {
    expect(mealNutritionLabel(summarizeMealNutrition([{ kcal: 300 }]))).toBe('약 300kcal');
  });
});

describe('단백질·나트륨 — 열량만 아는 음식이 섞이면 합계를 내지 않는다', () => {
  it('이름 추정(열량만)이 섞이면 단백질·나트륨은 null — 닭가슴살(추정)+쌀밥이 "단백질 3.4g" 이 되던 것', () => {
    const s = summarizeMealNutrition([
      { kcal: 159, proteinG: null, sodiumMg: null, nutritionFrom: '닭가슴 · 고기 통상 1인분 150g' },
      { kcal: 166, proteinG: 3.4, sodiumMg: 0, isMain: false },
    ]);
    expect(s.kcal).toBe(325);
    expect(s.proteinG).toBeNull();
    expect(s.sodiumMg).toBeNull();
    expect(s.proteinMissing).toBe(1);
    expect(s.sodiumMissing).toBe(1);
    // 열량 문구는 그대로 — 추정이 섞였다고만 밝힌다.
    expect(mealNutritionLabel(s)).toBe('약 325kcal (추정)');
    expect(mealMacroGapNote(s)).toBe('열량만 아는 음식이 섞여 단백질·나트륨 합계는 내지 않았어요.');
  });

  it('한쪽만 비면 그쪽만 감추고 문구도 그것만 말한다', () => {
    const s = summarizeMealNutrition([
      { kcal: 244, proteinG: 15.2, sodiumMg: 1450 },
      { kcal: 80, proteinG: 6.1, sodiumMg: null },
    ]);
    expect(s.proteinG).toBe(21.3);
    expect(s.sodiumMg).toBeNull();
    expect(mealMacroGapNote(s)).toBe('열량만 아는 음식이 섞여 나트륨 합계는 내지 않았어요.');
  });

  it('열량이 없는 음식은 빠질 뿐 단백질·나트륨을 막지 않는다 — 그건 "N개 중 M개 반영" 이 밝힌다', () => {
    const s = summarizeMealNutrition([{ kcal: 451, proteinG: 9, sodiumMg: 1800 }, { kcal: null }]);
    expect(s.proteinG).toBe(9);
    expect(s.sodiumMg).toBe(1800);
    expect(s.proteinMissing).toBe(0);
    expect(mealMacroGapNote(s)).toBeNull();
  });

  it('값이 0 인 음식(음료 등)은 빈 값이 아니다', () => {
    const s = summarizeMealNutrition([
      { kcal: 451, proteinG: 9, sodiumMg: 1800 },
      { kcal: 140, proteinG: 0, sodiumMg: 0 },
    ]);
    expect(s.proteinG).toBe(9);
    expect(s.sodiumMg).toBe(1800);
    expect(mealMacroGapNote(s)).toBeNull();
  });

  it('열량이 하나도 없으면 안내도 없다', () => {
    expect(mealMacroGapNote(summarizeMealNutrition([{ kcal: null }]))).toBeNull();
  });
});
