import { describe, expect, it } from 'vitest';
import {
  chartSignature,
  computeSajuChart,
  dayGanzhiOfDayNumber,
  ganzhiIndex,
  ganzhiKo,
  hourStemOf,
  monthStemOf,
  SajuInputError,
  tenGodOf,
  twelveStageOf,
  voidBranchesOf,
  yearGanzhiOf,
  yearMonthGanzhiAt,
} from './saju';
import { sajuDayNumber } from './sajuCalendar';

const ASOF = new Date('2026-09-06T03:00:00Z');

describe('60갑자 기본', () => {
  it('년주: 1984 갑자, 2026 병오, 1990 경오', () => {
    expect(ganzhiKo(yearGanzhiOf(1984))).toBe('갑자');
    expect(ganzhiKo(yearGanzhiOf(2026))).toBe('병오');
    expect(ganzhiKo(yearGanzhiOf(1990))).toBe('경오');
  });
  it('일주: 1900-01-01 갑술, 2000-01-01 무오, 2026-09-06 계미(만세력)', () => {
    expect(ganzhiKo(dayGanzhiOfDayNumber(sajuDayNumber(1900, 1, 1)))).toBe('갑술');
    expect(ganzhiKo(dayGanzhiOfDayNumber(sajuDayNumber(2000, 1, 1)))).toBe('무오');
    expect(ganzhiKo(dayGanzhiOfDayNumber(sajuDayNumber(2026, 9, 6)))).toBe('계미');
    expect(ganzhiKo(dayGanzhiOfDayNumber(sajuDayNumber(2026, 9, 25)))).toBe('임인');
  });
  it('월간(오호둔)·시간(오서둔)', () => {
    expect(ganzhiKo(ganzhiIndex(monthStemOf(0, 2), 2))).toBe('병인'); // 갑년 인월
    expect(ganzhiKo(ganzhiIndex(monthStemOf(6, 5), 5))).toBe('신사'); // 경년 사월
    expect(ganzhiKo(ganzhiIndex(monthStemOf(5, 0), 0))).toBe('병자'); // 기년 자월
    expect(ganzhiKo(ganzhiIndex(hourStemOf(0, 0), 0))).toBe('갑자'); // 갑일 자시
    expect(ganzhiKo(ganzhiIndex(hourStemOf(6, 7), 7))).toBe('계미'); // 경일 미시
    expect(ganzhiIndex(0, 1)).toBe(-1); // 갑축 없음
  });
  it('입춘 기준 년·월 60갑자', () => {
    // 2026-02-04 05:02 KST 입춘 = UTC 2026-02-03 20:02
    const ip = Math.round((Date.UTC(2026, 1, 3, 20, 2) - Date.UTC(1900, 0, 1)) / 60_000);
    expect(ganzhiKo(yearMonthGanzhiAt(ip - 1)?.yearGanzhi as number)).toBe('을사');
    expect(ganzhiKo(yearMonthGanzhiAt(ip - 1)?.monthGanzhi as number)).toBe('기축');
    expect(ganzhiKo(yearMonthGanzhiAt(ip)?.yearGanzhi as number)).toBe('병오');
    expect(ganzhiKo(yearMonthGanzhiAt(ip)?.monthGanzhi as number)).toBe('경인');
  });
});

describe('십신·십이운성·공망', () => {
  it('갑 일간 기준 십신', () => {
    expect(tenGodOf(0, 0)).toBe('bigyeon');
    expect(tenGodOf(0, 1)).toBe('geopjae');
    expect(tenGodOf(0, 2)).toBe('siksin');
    expect(tenGodOf(0, 3)).toBe('sanggwan');
    expect(tenGodOf(0, 4)).toBe('pyeonjae');
    expect(tenGodOf(0, 5)).toBe('jeongjae');
    expect(tenGodOf(0, 6)).toBe('pyeongwan');
    expect(tenGodOf(0, 7)).toBe('jeonggwan');
    expect(tenGodOf(0, 8)).toBe('pyeonin');
    expect(tenGodOf(0, 9)).toBe('jeongin');
  });
  it('십이운성: 갑은 해에서 장생, 을은 오에서 장생·역행', () => {
    expect(twelveStageOf(0, 11)).toBe('장생');
    expect(twelveStageOf(0, 2)).toBe('건록');
    expect(twelveStageOf(0, 3)).toBe('제왕');
    expect(twelveStageOf(1, 6)).toBe('장생');
    expect(twelveStageOf(1, 3)).toBe('건록');
    expect(twelveStageOf(6, 9)).toBe('제왕'); // 경금 유
  });
  it('공망: 갑자순 술해, 갑술순 신유, 갑인순 자축', () => {
    expect(voidBranchesOf(0)).toEqual([10, 11]);
    expect(voidBranchesOf(16)).toEqual([8, 9]);
    expect(voidBranchesOf(55)).toEqual([0, 1]);
  });
});

describe('computeSajuChart', () => {
  it('1990-05-15 14:30 남 → 경오 신사 경진 계미, 순행 7세 3개월', () => {
    const c = computeSajuChart({ calendar: 'solar', year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'M' }, { asOf: ASOF });
    expect(chartSignature(c)).toBe('경오 신사 경진 계미');
    expect(c.dayMaster.ko).toBe('경');
    expect(c.zodiac.animal).toBe('말');
    expect(c.lunar).toEqual({ year: 1990, month: 4, day: 21, leap: false });
    expect(c.luck.forward).toBe(true);
    expect(c.luck.startAgeYears).toBe(7);
    expect(c.luck.startAgeMonths).toBe(3);
    expect(c.luck.pillars.slice(0, 3).map((p) => p.ko)).toEqual(['임오', '계미', '갑신']);
    expect(c.luck.currentIndex).toBe(2);
    expect(c.asOf.age).toBe(36);
    expect(c.yearLuck.ko).toBe('병오');
    expect(c.voidBranches).toEqual([8, 9]);
    expect(c.stars.map((s) => s.id)).toEqual(expect.arrayContaining(['cheoneul', 'goegang', 'hwagae']));
    expect(c.relations.map((r) => r.type)).toEqual(expect.arrayContaining(['six-combine', 'directional']));
    expect(c.pillars.day.branchTenGod).toBe('pyeonin');
    expect(c.pillars.hour?.stemTenGod).toBe('sanggwan');
    expect(c.elements.reduce((a, e) => a + e.percent, 0)).toBeGreaterThan(99);
    expect(c.warnings).toEqual([]);
  });
  it('입춘 전후로 년주·월주가 바뀌고 경계 경고가 붙는다', () => {
    const before = computeSajuChart({ calendar: 'solar', year: 2026, month: 2, day: 4, hour: 4, minute: 0, gender: 'F' }, { asOf: ASOF });
    const after = computeSajuChart({ calendar: 'solar', year: 2026, month: 2, day: 4, hour: 6, minute: 0, gender: 'F' }, { asOf: ASOF });
    expect(chartSignature(before)).toBe('을사 기축 기유 병인');
    expect(chartSignature(after)).toBe('병오 경인 기유 정묘');
    expect(before.warnings.length).toBeGreaterThanOrEqual(2);
    expect(before.zodiac.animal).toBe('뱀');
    expect(after.zodiac.animal).toBe('말');
    // 여성 + 병(양) → 역행, 을(음) → 순행
    expect(after.luck.forward).toBe(false);
    expect(before.luck.forward).toBe(true);
  });
  it('서머타임(1987) — 벽시계 23:40 은 보정 후 22:10, 해시', () => {
    const c = computeSajuChart({ calendar: 'solar', year: 1987, month: 7, day: 1, hour: 23, minute: 40, gender: 'F' }, { asOf: ASOF });
    expect(c.instant.dst).toBe(true);
    expect(c.instant.correctionMinutes).toBe(-90);
    expect(c.instant.corrected.hour).toBe(22);
    expect(chartSignature(c)).toBe('정묘 병오 신해 기해');
    expect(c.warnings.some((w) => w.includes('서머타임'))).toBe(true);
  });
  it('보정 후 23시 이후는 다음날 일주(자시), 야자시 옵션이면 당일 유지', () => {
    const base = { calendar: 'solar' as const, year: 2000, month: 1, day: 1, hour: 0, minute: 10, gender: 'M' as const };
    const c = computeSajuChart(base, { asOf: ASOF });
    expect(c.instant.corrected).toMatchObject({ year: 1999, month: 12, day: 31, hour: 23, minute: 40 });
    expect(chartSignature(c)).toBe('기묘 병자 무오 임자');
    const late = computeSajuChart({ ...base, options: { lateRatHour: true } }, { asOf: ASOF });
    expect(late.pillars.day.ko).toBe('정사');
    expect(late.pillars.hour?.ko).toBe('임자'); // 시간 천간은 다음날(무) 기준
    const noCorr = computeSajuChart({ ...base, options: { solarTimeCorrection: false } }, { asOf: ASOF });
    expect(noCorr.instant.corrected).toMatchObject({ year: 2000, month: 1, day: 1, hour: 0, minute: 10 });
    expect(noCorr.pillars.day.ko).toBe('무오');
  });
  it('음력 입력·시간 모름 → 3기둥, 시주 null', () => {
    const c = computeSajuChart({ calendar: 'lunar', year: 1985, month: 1, day: 1, hour: null, gender: 'M' }, { asOf: ASOF });
    expect(c.solar).toEqual({ year: 1985, month: 2, day: 20 });
    expect(chartSignature(c)).toBe('을축 무인 경인 --');
    expect(c.pillars.hour).toBeNull();
    expect(c.instant.hourKnown).toBe(false);
    expect(c.warnings.some((w) => w.includes('시간'))).toBe(true);
    expect(c.elements.reduce((a, e) => a + e.score, 0)).toBeGreaterThan(0);
  });
  it('입력 오류 코드', () => {
    expect(() => computeSajuChart({ calendar: 'solar', year: 2026, month: 2, day: 30, hour: null, gender: 'M' })).toThrowError(SajuInputError);
    expect(() => computeSajuChart({ calendar: 'solar', year: 1899, month: 5, day: 1, hour: null, gender: 'M' })).toThrow(/1900~2050/);
    expect(() => computeSajuChart({ calendar: 'lunar', year: 2024, month: 3, day: 1, leapMonth: true, hour: null, gender: 'F' })).toThrow(/음력/);
    expect(() => computeSajuChart({ calendar: 'solar', year: 2000, month: 1, day: 1, hour: 24, gender: 'F' })).toThrow(/시간/);
  });
  it('보완 오행은 신강약·계절 근거를 갖고 오행 목록 안에 있다', () => {
    const c = computeSajuChart({ calendar: 'solar', year: 1975, month: 12, day: 25, hour: 3, minute: 0, gender: 'F' }, { asOf: ASOF });
    expect(['wood', 'fire', 'earth', 'metal', 'water']).toContain(c.favorable.primary);
    expect(['weak', 'strong', 'balanced', 'season']).toContain(c.favorable.reason);
    expect(c.season).toBe('winter');
  });
});
