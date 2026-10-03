import { describe, expect, it } from 'vitest';
import {
  recommendationHistoryFoods,
  recommendationProgressLabel,
  recommendationReceivedTime,
  recommendationWhenLabel,
} from './recommendationHistory.js';

const local = (y: number, m: number, d: number, h: number, min: number): string =>
  new Date(y, m - 1, d, h, min).toISOString();

describe('추천 기록 문구', () => {
  it('받은 시각을 기기 시간대 HH:MM 로, 잘못된 값은 null', () => {
    expect(recommendationReceivedTime(local(2026, 10, 4, 19, 5))).toBe('19:05');
    expect(recommendationReceivedTime('nope')).toBeNull();
  });

  it('대상 날짜는 오늘·어제처럼, 뒤에 끼니와 받은 시각', () => {
    const rec = { targetDate: '2026-10-04', targetSlot: 'dinner' as const, createdAt: local(2026, 10, 4, 19, 12) };
    expect(recommendationWhenLabel(rec, '2026-10-04')).toBe('오늘 저녁 · 19:12');
    expect(recommendationWhenLabel({ ...rec, targetDate: '2026-10-03' }, '2026-10-04')).toBe('어제 저녁 · 19:12');
    expect(recommendationWhenLabel({ ...rec, createdAt: 'nope' }, '2026-10-04')).toBe('오늘 저녁');
  });

  it('고른 음식이 있으면 그것만, 진행은 기록 완료 > 선택됨', () => {
    const items = [{ name: '김치찌개' }, { name: '비빔밥' }] as never;
    expect(recommendationHistoryFoods({ items, feedback: null })).toBe('김치찌개, 비빔밥');
    expect(
      recommendationHistoryFoods({ items, feedback: { pickedName: '비빔밥', rating: null, eatenEntryId: null } }),
    ).toBe('비빔밥');
    expect(recommendationProgressLabel({ feedback: null })).toBeNull();
    expect(
      recommendationProgressLabel({ feedback: { pickedName: '비빔밥', rating: null, eatenEntryId: null } }),
    ).toBe('선택됨');
    expect(
      recommendationProgressLabel({ feedback: { pickedName: '비빔밥', rating: 1, eatenEntryId: 'e1' } }),
    ).toBe('기록 완료');
  });
});
