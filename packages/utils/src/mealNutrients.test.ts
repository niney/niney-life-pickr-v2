import { describe, expect, it } from 'vitest';
import {
  MEAL_NUTRIENT_STATUS_LABEL,
  MEAL_NUTRIENT_STATUS_ORDER,
  formatNutrientAmount,
  mealNutrientDisplayStatus,
  mealNutrientProfileLabel,
  nutrientBarWidth,
  parseMealBirthYear,
} from './mealNutrients.js';

describe('formatNutrientAmount', () => {
  it('크기에 따라 자릿수를 줄인다', () => {
    expect(formatNutrientAmount(3610.4)).toBe('3,610');
    expect(formatNutrientAmount(12.34)).toBe('12.3');
    expect(formatNutrientAmount(0.456)).toBe('0.46');
    expect(formatNutrientAmount(0)).toBe('0');
  });
});

describe('nutrientBarWidth', () => {
  it('기준 150% 에서 자르고, 모르면 0', () => {
    expect(nutrientBarWidth(null)).toBe(0);
    expect(nutrientBarWidth(75)).toBe(50);
    expect(nutrientBarWidth(300)).toBe(100);
  });
});

describe('parseMealBirthYear', () => {
  const now = new Date('2026-10-04T00:00:00Z');
  it('빈칸은 null, 1900~올해 네 자리는 숫자, 그 외는 형식 오류(undefined)', () => {
    expect(parseMealBirthYear('', now)).toBeNull();
    expect(parseMealBirthYear(' 1990 ', now)).toBe(1990);
    expect(parseMealBirthYear('19', now)).toBeUndefined();
    expect(parseMealBirthYear('1899', now)).toBeUndefined();
    expect(parseMealBirthYear('2027', now)).toBeUndefined();
  });
});

describe('mealNutrientProfileLabel', () => {
  it('사용자 기준이면 성별, 아니면 성인 기준', () => {
    expect(mealNutrientProfileLabel({ sex: 'female', ageGroup: '30-49', basis: 'user' })).toBe(
      '30-49세 여성 기준',
    );
    expect(mealNutrientProfileLabel({ sex: null, ageGroup: '30-49', basis: 'default' })).toBe(
      '30-49세 성인 기준',
    );
  });
});

describe('mealNutrientDisplayStatus', () => {
  it('부족·조금 부족이어도 기록을 채우면 닿는 영양소(recordGap)는 기록 더 필요 — 정렬은 진짜 부족·많음 다음', () => {
    expect(mealNutrientDisplayStatus({ status: 'low', recordGap: true })).toBe('recordGap');
    expect(mealNutrientDisplayStatus({ status: 'borderline', recordGap: true })).toBe('recordGap');
    expect(mealNutrientDisplayStatus({ status: 'low', recordGap: false })).toBe('low');
    // 옛 응답(필드 없음)·판정이 부족이 아니면 그대로.
    expect(mealNutrientDisplayStatus({ status: 'low' })).toBe('low');
    expect(mealNutrientDisplayStatus({ status: 'ok', recordGap: true })).toBe('ok');
    expect(MEAL_NUTRIENT_STATUS_LABEL.recordGap).toBe('기록 더 필요');
    expect(MEAL_NUTRIENT_STATUS_ORDER.high).toBeLessThan(MEAL_NUTRIENT_STATUS_ORDER.recordGap);
    expect(MEAL_NUTRIENT_STATUS_ORDER.recordGap).toBeLessThan(MEAL_NUTRIENT_STATUS_ORDER.ok);
  });
});
