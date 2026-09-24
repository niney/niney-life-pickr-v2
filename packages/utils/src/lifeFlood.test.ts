import { describe, expect, it } from 'vitest';
import { formatFloodDepth, formatFloodEventLabel, housingFloodLevel } from './lifeFlood.js';

describe('housingFloodLevel', () => {
  it('0·null 은 none, 1~4 some, 5 이상 many', () => {
    expect(housingFloodLevel(null)).toBe('none');
    expect(housingFloodLevel(undefined)).toBe('none');
    expect(housingFloodLevel(0)).toBe('none');
    expect(housingFloodLevel(1)).toBe('some');
    expect(housingFloodLevel(4)).toBe('some');
    expect(housingFloodLevel(5)).toBe('many');
    expect(housingFloodLevel(164)).toBe('many');
  });
});

describe('formatFloodDepth', () => {
  it('1m 미만은 cm, 이상은 m 소수 한 자리', () => {
    expect(formatFloodDepth(0.02)).toBe('2cm');
    expect(formatFloodDepth(0.45)).toBe('45cm');
    expect(formatFloodDepth(0.5)).toBe('50cm');
    expect(formatFloodDepth(1)).toBe('1.0m');
    expect(formatFloodDepth(1.8)).toBe('1.8m');
  });
});

describe('formatFloodEventLabel', () => {
  it('월이 있으면 연월, 없으면 연도만', () => {
    expect(formatFloodEventLabel(2022, 8)).toBe('2022년 8월');
    expect(formatFloodEventLabel(2025, null)).toBe('2025년');
  });
});
