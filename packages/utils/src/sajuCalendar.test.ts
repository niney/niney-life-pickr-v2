import { describe, expect, it } from 'vitest';
import {
  civilFromMinutes,
  daysInMonth,
  findMonthTermAt,
  formatCivilDate,
  ipchunUtcMinutes,
  lunarMonthLength,
  lunarToSolar,
  lunarYearInfo,
  monthBranchOfTerm,
  resolveKoreaWallClock,
  sajuDateFromDayNumber,
  sajuDayNumber,
  sajuJdn,
  solarTermUtcMinutes,
  solarToLunar,
  weekdayOfDayNumber,
} from './sajuCalendar';

const kst = (utcMin: number | null): string => {
  if (utcMin === null) return 'null';
  const c = civilFromMinutes(utcMin, 540);
  return `${formatCivilDate(c)} ${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
};
const minutesOf = (s: string): number => {
  const [d, t] = s.split(' ');
  const [y, m, dd] = (d as string).split('-').map(Number);
  const [h, mi] = (t as string).split(':').map(Number);
  return Math.round((Date.UTC(y as number, (m as number) - 1, dd, h, mi) - Date.UTC(1900, 0, 1)) / 60_000) - 540;
};

describe('율리우스일·일수', () => {
  it('앵커: 1900-01-01 = JDN 2415021 = 일수 0, 2000-01-01 = 2451545', () => {
    expect(sajuJdn(1900, 1, 1)).toBe(2415021);
    expect(sajuDayNumber(1900, 1, 1)).toBe(0);
    expect(sajuJdn(2000, 1, 1)).toBe(2451545);
  });
  it('왕복 변환·요일', () => {
    for (const [y, m, d] of [[1900, 1, 1], [1987, 5, 10], [2000, 2, 29], [2026, 9, 6], [2050, 12, 31]] as const) {
      const n = sajuDayNumber(y, m, d);
      expect(sajuDateFromDayNumber(n)).toEqual({ year: y, month: m, day: d });
    }
    expect(weekdayOfDayNumber(sajuDayNumber(1900, 1, 1))).toBe(1); // 월
    expect(weekdayOfDayNumber(sajuDayNumber(1987, 5, 10))).toBe(0); // 일
    expect(weekdayOfDayNumber(sajuDayNumber(2026, 9, 6))).toBe(0); // 일
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
  });
});

describe('24절기 (KASI 공개값 대조, ±1분)', () => {
  const cases: Array<[number, number, string]> = [
    [2024, 2, '2024-02-04 17:27'], [2024, 10, '2024-06-05 13:09'], [2024, 22, '2024-12-07 00:17'], [2024, 23, '2024-12-21 18:20'],
    [2025, 0, '2025-01-05 11:32'], [2025, 2, '2025-02-03 23:10'], [2025, 12, '2025-07-07 05:04'], [2025, 20, '2025-11-07 13:04'],
    [2026, 2, '2026-02-04 05:02'], [2026, 4, '2026-03-05 22:58'], [2026, 10, '2026-06-06 00:48'], [2026, 16, '2026-09-07 23:41'], [2026, 23, '2026-12-22 05:50'],
  ];
  it.each(cases)('%d년 절기 %d = %s', (year, index, expected) => {
    const got = solarTermUtcMinutes(year, index);
    expect(got).not.toBeNull();
    expect(Math.abs((got as number) - minutesOf(expected))).toBeLessThanOrEqual(1);
  });
  it('범위 밖은 null', () => {
    expect(solarTermUtcMinutes(1898, 0)).toBeNull();
    expect(solarTermUtcMinutes(2052, 0)).toBeNull();
    expect(ipchunUtcMinutes(2026)).not.toBeNull();
  });
  it('findMonthTermAt: 입춘 직전은 소한(축월), 직후는 입춘(인월)', () => {
    const ip = ipchunUtcMinutes(2026) as number;
    const before = findMonthTermAt(ip - 1);
    const after = findMonthTermAt(ip);
    expect(before?.index).toBe(0);
    expect(monthBranchOfTerm(before?.index as number)).toBe(1);
    expect(after?.index).toBe(2);
    expect(after?.year).toBe(2026);
    expect(monthBranchOfTerm(2)).toBe(2);
    expect(monthBranchOfTerm(22)).toBe(0);
    expect(Math.abs((after?.nextMonthTermUtcMinutes as number) - minutesOf('2026-03-05 22:58'))).toBeLessThanOrEqual(1);
  });
});

describe('한국 표준시·서머타임', () => {
  it('현행 KST', () => {
    const r = resolveKoreaWallClock({ year: 2026, month: 9, day: 6, hour: 12, minute: 0 });
    expect(r.offsetMinutes).toBe(540);
    expect(r.dst).toBe(false);
    expect(kst(r.utcMinutes)).toBe('2026-09-06 12:00');
  });
  it('1987·1988 서머타임 안팎', () => {
    expect(resolveKoreaWallClock({ year: 1987, month: 5, day: 10, hour: 1, minute: 59 }).dst).toBe(false);
    expect(resolveKoreaWallClock({ year: 1987, month: 5, day: 10, hour: 3, minute: 0 }).offsetMinutes).toBe(600);
    expect(resolveKoreaWallClock({ year: 1987, month: 10, day: 11, hour: 2, minute: 59 }).dst).toBe(true);
    expect(resolveKoreaWallClock({ year: 1987, month: 10, day: 11, hour: 3, minute: 0 }).dst).toBe(false);
    expect(resolveKoreaWallClock({ year: 1988, month: 7, day: 1, hour: 12, minute: 0 }).offsetMinutes).toBe(600);
    expect(resolveKoreaWallClock({ year: 1989, month: 7, day: 1, hour: 12, minute: 0 }).offsetMinutes).toBe(540);
  });
  it('1954~1961 UTC+8:30 + 1955~1960 서머타임', () => {
    expect(resolveKoreaWallClock({ year: 1955, month: 1, day: 1, hour: 12, minute: 0 }).offsetMinutes).toBe(510);
    expect(resolveKoreaWallClock({ year: 1955, month: 6, day: 1, hour: 12, minute: 0 }).offsetMinutes).toBe(570);
    expect(resolveKoreaWallClock({ year: 1960, month: 9, day: 17, hour: 23, minute: 59 }).dst).toBe(true);
    expect(resolveKoreaWallClock({ year: 1960, month: 9, day: 18, hour: 0, minute: 0 }).dst).toBe(false);
    expect(resolveKoreaWallClock({ year: 1961, month: 8, day: 9, hour: 12, minute: 0 }).offsetMinutes).toBe(510);
    expect(resolveKoreaWallClock({ year: 1961, month: 8, day: 10, hour: 12, minute: 0 }).offsetMinutes).toBe(540);
  });
  it('1908~1911 UTC+8:30, 1912~ UTC+9, 1948~1951 서머타임', () => {
    expect(resolveKoreaWallClock({ year: 1910, month: 1, day: 1, hour: 12, minute: 0 }).offsetMinutes).toBe(510);
    expect(resolveKoreaWallClock({ year: 1930, month: 1, day: 1, hour: 12, minute: 0 }).offsetMinutes).toBe(540);
    expect(resolveKoreaWallClock({ year: 1949, month: 6, day: 1, hour: 12, minute: 0 }).offsetMinutes).toBe(600);
    expect(resolveKoreaWallClock({ year: 1949, month: 9, day: 11, hour: 0, minute: 0 }).dst).toBe(false);
  });
});

describe('음력', () => {
  const seollal: Array<[number, string]> = [
    [1985, '1985-02-20'], [1990, '1990-01-27'], [1996, '1996-02-19'], [2000, '2000-02-05'], [2003, '2003-02-01'],
    [2020, '2020-01-25'], [2024, '2024-02-10'], [2025, '2025-01-29'], [2026, '2026-02-17'], [2027, '2027-02-07'], [2050, '2050-01-23'],
  ];
  it.each(seollal)('%d년 설날 = %s', (year, expected) => {
    expect(formatCivilDate(lunarToSolar(year, 1, 1) as never)).toBe(expected);
  });
  it('윤달: 2025 윤6월 1일 = 2025-07-25, 2023 윤2월 1일 = 2023-03-22, 2033 윤11월', () => {
    expect(formatCivilDate(lunarToSolar(2025, 6, 1, true) as never)).toBe('2025-07-25');
    expect(lunarYearInfo(2025)?.leapMonth).toBe(6);
    expect(formatCivilDate(lunarToSolar(2023, 2, 1, true) as never)).toBe('2023-03-22');
    expect(lunarYearInfo(2033)?.leapMonth).toBe(11);
    expect(lunarYearInfo(2024)?.leapMonth).toBe(0);
    expect(lunarToSolar(2024, 3, 1, true)).toBeNull();
  });
  it('추석·양→음 변환', () => {
    expect(solarToLunar(2026, 9, 25)).toEqual({ year: 2026, month: 8, day: 15, leap: false });
    expect(solarToLunar(2026, 9, 6)).toEqual({ year: 2026, month: 7, day: 25, leap: false });
    expect(solarToLunar(2025, 7, 25)).toEqual({ year: 2025, month: 6, day: 1, leap: true });
    expect(solarToLunar(2025, 7, 24)).toEqual({ year: 2025, month: 6, day: 30, leap: false }); // 2025 음력 6월은 큰달(30일)
    expect(solarToLunar(2026, 1, 1)?.year).toBe(2025);
  });
  it('왕복 변환 1900-01-31 ~ 2050-12 임의 표본', () => {
    for (let n = sajuDayNumber(1900, 1, 31); n < sajuDayNumber(2050, 12, 1); n += 977) {
      const s = sajuDateFromDayNumber(n);
      const l = solarToLunar(s.year, s.month, s.day);
      expect(l).not.toBeNull();
      const back = lunarToSolar((l as { year: number }).year, (l as { month: number }).month, (l as { day: number }).day, (l as { leap: boolean }).leap);
      expect(back).toEqual(s);
    }
  });
  it('달 길이·범위 밖', () => {
    expect([29, 30]).toContain(lunarMonthLength(2026, 8));
    expect(lunarMonthLength(2026, 8, true)).toBeNull();
    expect(solarToLunar(1900, 1, 15)).toBeNull();
    expect(lunarToSolar(1899, 1, 1)).toBeNull();
    expect(lunarToSolar(2026, 13, 1)).toBeNull();
  });
});
