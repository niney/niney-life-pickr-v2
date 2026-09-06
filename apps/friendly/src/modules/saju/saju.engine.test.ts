import { describe, expect, it } from 'vitest';
import { CreateSajuReadingInput, SajuChart } from '@repo/api-contract';
import { calculateSaju, sajuMonthBoundaries } from './saju.engine.js';

const now = new Date('2026-09-06T03:00:00Z');
const calc = (birth: Record<string, unknown>, kind = 'natal') =>
  calculateSaju(CreateSajuReadingInput.parse({ birth, kind }), now);
const pillars = (v: ReturnType<typeof calc>) => v.pillars.map((p) => p.ganZhi);
describe('한국 역법과 시간 기준', () => {
  it('KASI 2026-08-18 일진 갑자와 월주·시주', () => {
    // https://astro.kasi.re.kr/kor/life/pageView/5 (2026-08 표)
    const v = calc({ date: '2026-08-18', timeAccuracy: 'exact', time: '14:30' });
    expect(pillars(v)).toEqual(['丙午', '丙申', '甲子', '辛未']);
    expect(v.elements.reduce((n, e) => n + e.count, 0)).toBe(8);
    expect(SajuChart.safeParse(v).success).toBe(true);
  });
  it('한국 음력 윤2월 초하루와 양력 2023-03-22가 같다', () => {
    expect(calc({ date: '2023-02-01', calendar: 'lunar', leapMonth: true })).toEqual(
      calc({ date: '2023-03-22' }),
    );
  });
  it('지원 시작 연도의 음력 날짜는 1899년 말일 수도 있다', () => {
    expect(calc({ date: '1899-12-01', calendar: 'lunar' }).solarDate).toBe('1900-01-01');
    expect(() => calc({ date: '1899-12-01' })).toThrow();
  });
  it.each([
    { date: '2025-02-29' },
    { date: '2024-04-31' },
    { date: '2023-03-01', calendar: 'lunar', leapMonth: true },
    { date: '2027-01-01' },
  ])('존재하지 않는 날짜·윤달·미래를 거절: %j', (birth) => {
    expect(() => calc(birth)).toThrow();
  });
  it('윤년 생일은 허용한다', () =>
    expect(calc({ date: '2000-02-29' }).solarDate).toBe('2000-02-29'));
  it('KASI 월력요항 2026 입춘 05:02 KST 전후에만 연월이 바뀐다', () => {
    // https://astro.kasi.re.kr/life/post/calendardata : 분 단위 2026-02-04 05:02
    expect(sajuMonthBoundaries(2026)[1]!.instant.toString()).toMatch(/^2026-02-03T20:02:/);
    expect(
      pillars(calc({ date: '2026-02-04', timeAccuracy: 'exact', time: '05:00' })).slice(0, 2),
    ).toEqual(['乙巳', '己丑']);
    expect(
      pillars(calc({ date: '2026-02-04', timeAccuracy: 'exact', time: '05:04' })).slice(0, 2),
    ).toEqual(['丙午', '庚寅']);
    const boundaryMinute = calc({ date: '2026-02-04', timeAccuracy: 'exact', time: '05:02' });
    expect(pillars(boundaryMinute).slice(0, 2)).toEqual([null, null]);
  });
  it('시간 미상으로 절기를 가로지르면 년월도 미확정', () => {
    const v = calc({ date: '2026-02-04' });
    expect(pillars(v)).toEqual([null, null, '己酉', null]);
    expect(v.unknownCharacters).toBe(6);
  });
  it('평범한 날 시간 미상은 시주만 비운다', () => {
    const v = calc({ date: '1990-05-21' });
    expect(pillars(v)).toEqual(['庚午', '辛巳', '丙戌', null]);
    expect(v.unknownCharacters).toBe(2);
  });
  it('23시와 자정 규칙을 시주의 일간에도 일관되게 적용한다', () => {
    expect(
      pillars(calc({ date: '1990-05-21', timeAccuracy: 'exact', time: '23:30' })).slice(2),
    ).toEqual(['丙戌', '戊子']);
    expect(
      pillars(
        calc({ date: '1990-05-21', timeAccuracy: 'exact', time: '23:30', dayBoundary: 'zi' }),
      ).slice(2),
    ).toEqual(['丁亥', '庚子']);
    expect(
      pillars(calc({ date: '1990-05-22', timeAccuracy: 'exact', time: '00:00' })).slice(2),
    ).toEqual(['丁亥', '庚子']);
  });
  it('1988년 여름에는 법정시에서 서머타임을 뺀 시주를 쓴다', () => {
    const v = calc({ date: '1988-06-15', timeAccuracy: 'exact', time: '09:00' });
    expect(v.standardTime).toContain('T08:00');
    expect(v.pillars[3]!.ganZhi?.[1]).toBe('辰');
  });
  it('1954~1961년의 8:30 표준시를 UTC+9로 바꾸지 않는다', () => {
    expect(
      calc({ date: '1960-02-01', timeAccuracy: 'exact', time: '09:00' }).standardTime,
    ).toContain('T09:00');
  });
  it('서머타임의 없는 시각은 보정해서 만들지 않는다', () => {
    for (const disambiguation of ['reject', 'earlier', 'later'])
      expect(() =>
        calc({ date: '1988-05-08', timeAccuracy: 'exact', time: '02:30', disambiguation }),
      ).toThrow();
  });
  it('겹치는 시각은 사용자가 구분하고, 모르면 열린 범위로 남긴다', () => {
    expect(() => calc({ date: '1988-10-09', timeAccuracy: 'exact', time: '02:30' })).toThrow();
    expect(
      calc({ date: '1988-10-09', timeAccuracy: 'exact', time: '02:30', disambiguation: 'earlier' })
        .standardTime,
    ).toContain('T01:30');
    expect(
      calc({ date: '1988-10-09', timeAccuracy: 'exact', time: '02:30', disambiguation: 'later' })
        .standardTime,
    ).toContain('T02:30');
  });
  it('올해는 열두 절입 구간, 오늘은 열람 시각과 무관한 일진', () => {
    const v = calc({ date: '1990-05-21' }, 'annual');
    expect(v.period.months).toHaveLength(12);
    expect(v.period.months[11]!.end).toMatch(/^2027-01-/);
    const input = CreateSajuReadingInput.parse({ birth: { date: '1990-05-21' }, kind: 'daily' });
    expect(calculateSaju(input, new Date('2026-09-06T00:00:00+09:00')).period).toEqual(
      calculateSaju(input, new Date('2026-09-06T23:59:00+09:00')).period,
    );
  });
});
