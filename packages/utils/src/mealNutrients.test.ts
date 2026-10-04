import { describe, expect, it } from 'vitest';
import {
  formatNutrientAmount,
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
