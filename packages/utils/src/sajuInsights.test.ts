import { describe, expect, it } from 'vitest';
import { computeSajuChart, branchMeta, SAJU_WUXING_META } from './saju';
import { sajuDayNumber } from './sajuCalendar';
import {
  mainHiddenTenGodOf,
  sajuBestHours,
  sajuFiveGodsOf,
  sajuHealthHintsOf,
  sajuHiddenGodsOf,
  sajuHourLucksOf,
  sajuMonthLucksOf,
  sajuPatternOf,
  sajuSamjaeOf,
  sajuYearOutlooksOf,
} from './sajuInsights';

const ASOF = new Date('2026-09-06T03:00:00Z');
// 1990-05-15 14:30 남 = 경오 신사 경진 계미. 일간 경금, 월지 사(정기 병화) → 편관격.
const A = computeSajuChart({ calendar: 'solar', year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'M' }, { asOf: ASOF });
// 1990-01-01 시 모름 남 = 기사 병자 병인. 일간 병화, 월지 자(정기 계수) → 정관격. 띠는 뱀(사).
const B = computeSajuChart({ calendar: 'solar', year: 1990, month: 1, day: 1, hour: null, minute: null, gender: 'M' }, { asOf: ASOF });

describe('격국·오신', () => {
  it('월지 정기 십신으로 격을 정한다 — 경금·사월 편관격, 병화·자월 정관격', () => {
    expect(mainHiddenTenGodOf(A, A.pillars.month.branch)).toBe('pyeongwan');
    expect(sajuPatternOf(A)).toMatchObject({ id: 'pyeongwan', ko: '편관격', basis: 'pyeongwan' });
    expect(sajuPatternOf(B)).toMatchObject({ id: 'jeonggwan', ko: '정관격' });
    // 비견·겁재는 건록·양인격으로. 갑목 일간에 인월(정기 갑) = 비견 → 건록격.
    const C = computeSajuChart({ calendar: 'solar', year: 1984, month: 2, day: 20, hour: null, minute: null, gender: 'F' }, { asOf: ASOF });
    if (C.pillars.month.branchTenGod === 'bigyeon') expect(sajuPatternOf(C).id).toBe('geonrok');
  });
  it('오신은 서로 다른 오행 5개, 용신 = 보완 오행, 기신 = 용신을 극하는 오행', () => {
    const g = sajuFiveGodsOf(A);
    expect(new Set([g.yong, g.hee, g.gi, g.gu, g.han]).size).toBe(5);
    expect(g.yong).toBe(A.favorable.primary);
    expect(SAJU_WUXING_META[g.gi]).toBeDefined();
    expect(g.reason).toContain('용신');
  });
});

describe('삼재', () => {
  it('오띠(인오술)는 신유술년이 삼재 — 2026 병오는 아님, 다음 2028~2030', () => {
    const s = sajuSamjaeOf(A, 2026);
    expect(s.branches.map((b) => branchMeta(b).ko).join('')).toBe('신유술');
    expect(s.stage).toBeNull();
    expect(s.years).toEqual([2028, 2029, 2030]);
    expect(sajuSamjaeOf(A, 2028).stage).toBe('in');
    expect(sajuSamjaeOf(A, 2029)).toMatchObject({ stage: 'mid', years: [2028, 2029, 2030] });
    expect(sajuSamjaeOf(A, 2030).stage).toBe('out');
  });
  it('뱀띠(사유축)는 해자축년 — 2026 병오 아님, 2031 신해부터', () => {
    const s = sajuSamjaeOf(B, 2026);
    expect(s.branches.map((b) => branchMeta(b).ko).join('')).toBe('해자축');
    expect(s.years[0]).toBe(2031);
  });
});

describe('월운·세운·시진', () => {
  it('월운 12개월 — 인월(입춘)부터 축월(소한)까지 절입일이 오름차순, 점수 5~98', () => {
    const m = sajuMonthLucksOf(A, 2026);
    expect(m).toHaveLength(12);
    expect(m[0]).toMatchObject({ index: 0, from: { year: 2026, month: 2, day: 4 }, termName: '입춘' });
    expect(branchMeta(m[0]!.branch).ko).toBe('인');
    expect(m[11]!.from).toEqual({ year: 2027, month: 1, day: 5 });
    expect(m[11]!.to.month).toBe(2);
    for (let i = 1; i < 12; i++) {
      const a = m[i - 1]!.from;
      const b = m[i]!.from;
      expect(a.year * 10000 + a.month * 100 + a.day).toBeLessThan(b.year * 10000 + b.month * 100 + b.day);
    }
    for (const x of m) {
      expect(x.score).toBeGreaterThanOrEqual(5);
      expect(x.score).toBeLessThanOrEqual(98);
      expect(x.stars).toBeGreaterThanOrEqual(1);
    }
    // 2026 병오년 월간: 병신년 경인월 시작(오호둔) → 인월 천간 경.
    expect(m[0]!.ko).toBe('경인');
  });
  it('향후 5년 세운 — 올해부터, 현재 표시·테마·표식', () => {
    const y = sajuYearOutlooksOf(A);
    expect(y.map((x) => x.year)).toEqual([2026, 2027, 2028, 2029, 2030]);
    expect(y[0]!.isCurrent).toBe(true);
    expect(y[0]!.ko).toBe('병오');
    expect(y.every((x) => x.theme.length > 0)).toBe(true);
    // 경진 일주·오년: 자오충 없음(일지 진). 경오 년주와 같은 글자 → 관계는 있어도 되고 없어도 됨. 표식은 문자열 배열.
    expect(Array.isArray(y[0]!.flags)).toBe(true);
  });
  it('하루 12시진 — 자시부터, 시간(時干)은 그날 일간 오서둔, 좋은 시간 2·주의 1', () => {
    const day = sajuDayNumber(2026, 9, 6); // 2026-09-06
    const h = sajuHourLucksOf(A, day);
    expect(h).toHaveLength(12);
    expect(h[0]!.range).toBe('23~01시');
    expect(h.map((x) => branchMeta(x.branch).ko).join('')).toBe('자축인묘진사오미신유술해');
    const { best, worst } = sajuBestHours(h);
    expect(best).toHaveLength(2);
    expect(worst).not.toBeNull();
    expect(best[0]!.score).toBeGreaterThanOrEqual(worst!.score);
  });
});

describe('건강 힌트·숨은 십신', () => {
  it('부족·과다 오행마다 한 줄, 최대 3', () => {
    const h = sajuHealthHintsOf(A);
    expect(h.length).toBeLessThanOrEqual(3);
    expect(h.length).toBe(Math.min(3, A.lacking.length + A.excess.length));
    for (const x of h) expect(x.text).toContain('편');
  });
  it('지장간마다 일간 기준 십신 — 기둥 수만큼', () => {
    const hg = sajuHiddenGodsOf(A);
    expect(hg).toHaveLength(4);
    expect(hg[2]!.pillar).toBe('day');
    expect(hg.every((p) => p.items.length >= 1 && p.items.every((i) => i.tenGodKo.length === 2))).toBe(true);
    expect(sajuHiddenGodsOf(B)).toHaveLength(3);
  });
});
