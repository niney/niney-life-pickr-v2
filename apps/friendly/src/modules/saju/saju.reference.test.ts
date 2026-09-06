import { describe, expect, it } from 'vitest';
import { Temporal } from '@js-temporal/polyfill';
import { CreateSajuReadingInput } from '@repo/api-contract';
import { calculateSaju, sajuMonthBoundaries, standardOffsetSeconds } from './saju.engine.js';
import reference from './__fixtures__/kasi-calendar.json';

// 서버 엔진의 출력을 기대값으로 복사하지 않는다. KASI 공개 표의 날짜·일진·절입을 사용한다.
const now = new Date('2030-01-01T00:00:00Z');
describe('한국천문연구원 외부 기준 대조', () => {
  it.each(reference.lunarDates)('$lunarDate 윤달=$leapMonth → $solarDate / $dayGanZhiKo', (row) => {
    const chart = calculateSaju(
      CreateSajuReadingInput.parse({
        birth: {
          date: row.lunarDate,
          calendar: 'lunar',
          leapMonth: row.leapMonth,
          timeAccuracy: 'exact',
          time: '12:00',
        },
      }),
      now,
    );
    expect(chart.solarDate).toBe(row.solarDate);
    expect(chart.pillars[2]!.pronunciation).toBe(row.dayGanZhiKo);
  });
  it.each(reference.terms)('$year $term 절입은 KASI 분 단위 표에서 60초 이내', (row) => {
    const actual = sajuMonthBoundaries(row.year).find((t) => t.term === row.term)!;
    expect(Math.abs(actual.instant.epochMilliseconds - Date.parse(row.kst))).toBeLessThanOrEqual(
      60_000,
    );
  });
});

describe('IANA Asia/Seoul 표준시 변경 경계', () => {
  // https://data.iana.org/time-zones/tzdb/asia : Zone Asia/Seoul
  it.each([
    ['1908-03-31T15:32:08Z', 30472, 30600],
    ['1911-12-31T15:30:00Z', 30600, 32400],
    ['1954-03-20T15:00:00Z', 32400, 30600],
    ['1961-08-09T15:30:00Z', 30600, 32400],
  ] as const)('%s 전후 표준 오프셋', (date, before, after) => {
    const instant = Temporal.Instant.from(date);
    expect(standardOffsetSeconds(instant.subtract({ seconds: 1 }))).toBe(before);
    expect(standardOffsetSeconds(instant)).toBe(after);
  });
});
