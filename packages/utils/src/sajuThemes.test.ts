import { describe, expect, it } from 'vitest';
import { computeSajuChart, SAJU_TEN_GOD_META, type SajuBirthInput } from './saju.js';
import { sajuDayPillarReadingOf } from './sajuDayPillar.js';
import {
  sajuCareerThemeOf,
  sajuGodPositions,
  sajuLoveThemeOf,
  sajuThemeFactLines,
  sajuWealthThemeOf,
  SAJU_THEME_IDS,
} from './sajuThemes.js';

// 테마 3종(인연·재물·직업) — 배우자성 성별 규칙, 재물 스타일 분류, 직업 적성·직업군, 시기 계산, LLM 사실 블록.
const ASOF = new Date('2026-09-06T03:00:00Z');
const M: SajuBirthInput = { calendar: 'solar', year: 1990, month: 5, day: 15, leapMonth: false, hour: 14, minute: 30, gender: 'M' };
const F: SajuBirthInput = { calendar: 'solar', year: 1985, month: 12, day: 25, leapMonth: false, hour: 3, minute: 0, gender: 'F' };
const chartM = computeSajuChart(M, { asOf: ASOF });
const chartF = computeSajuChart(F, { asOf: ASOF });

describe('sajuThemes — 인연', () => {
  it('배우자성은 남=재성·여=관성, 개수·위치가 원국 십신과 일치한다', () => {
    const lm = sajuLoveThemeOf(chartM);
    expect(lm.spouseGod).toMatchObject({ main: 'jeongjae', sub: 'pyeonjae', group: 'wealth' });
    expect(lm.spouseCount).toBe((chartM.tenGodCounts.jeongjae ?? 0) + (chartM.tenGodCounts.pyeonjae ?? 0));
    expect(lm.spousePositions.every((p) => SAJU_TEN_GOD_META[p.tenGod].group === 'wealth')).toBe(true);
    const lf = sajuLoveThemeOf(chartF);
    expect(lf.spouseGod).toMatchObject({ main: 'jeonggwan', sub: 'pyeongwan', group: 'power' });
    expect(lf.spouseGod.note).toContain('전통 해석으로는');
    expect(lf.spouseCount).toBe((chartF.tenGodCounts.jeonggwan ?? 0) + (chartF.tenGodCounts.pyeongwan ?? 0));
  });
  it('배우자궁은 일지 십신·운성·공망을 그대로 옮기고 인연의 해는 향후 8년 안·점수순', () => {
    const l = sajuLoveThemeOf(chartM);
    expect(l.palace.tenGod).toBe(chartM.pillars.day.branchTenGod);
    expect(l.palace.stage).toBe(chartM.pillars.day.twelveStage);
    expect(l.palace.isVoid).toBe(chartM.pillars.day.isVoid);
    expect(l.palace.text).toContain('배우자 자리');
    expect(l.chanceYears.length).toBeLessThanOrEqual(3);
    for (const y of l.chanceYears) {
      expect(y.year).toBeGreaterThanOrEqual(2026);
      expect(y.year).toBeLessThan(2034);
      expect(y.score).toBeGreaterThanOrEqual(3);
      expect(y.reasons.length).toBeGreaterThan(0);
    }
    expect(l.chanceNote).toMatch(/인연|잔잔/);
    // 결혼 단정 금지 — 문구에 '결혼을 정하는 건' 또는 잔잔 안내만.
    expect(l.chanceNote).not.toMatch(/결혼합니다|결혼해요/);
    expect(l.style.length).toBeGreaterThan(10);
    expect(l.luckPeriods.every((p) => p.toAge >= chartM.asOf.age)).toBe(true);
  });
});

describe('sajuThemes — 재물', () => {
  it('재성 개수·오행이 원국과 맞고 스타일 분류가 규칙대로다', () => {
    for (const chart of [chartM, chartF]) {
      const w = sajuWealthThemeOf(chart);
      expect(w.counts.jeongjae).toBe(chart.tenGodCounts.jeongjae ?? 0);
      expect(w.counts.pyeonjae).toBe(chart.tenGodCounts.pyeonjae ?? 0);
      expect(w.positions.every((p) => SAJU_TEN_GOD_META[p.tenGod].group === 'wealth')).toBe(true);
      if (w.counts.total === 0) expect(w.style.id).toBe('none');
      else if (w.counts.output >= 1 && chart.strength.level !== 'weak') expect(w.style.id).toBe('siksang');
      expect(w.style.detail.length).toBeGreaterThan(20);
      expect(w.years).toHaveLength(5);
      expect(w.years[0]?.isCurrent).toBe(true);
      expect(w.keyword.length).toBeGreaterThan(0);
    }
    // 경금 일간의 재성 오행은 목.
    expect(sajuWealthThemeOf(chartM).element).toBe('wood');
    // 무토 일간의 재성 오행은 수.
    expect(sajuWealthThemeOf(chartF).element).toBe('water');
  });
});

describe('sajuThemes — 직업', () => {
  it('격국·적성·직업군·업종·신살 힌트가 채워진다', () => {
    const c = sajuCareerThemeOf(chartM);
    expect(c.pattern.id).toBeDefined();
    expect(c.groups).toHaveLength(5);
    expect(c.groups.reduce((s, g) => s + g.count, 0)).toBe(Object.values(chartM.tenGodCounts).reduce((s, n) => s + n, 0));
    expect(c.jobs.length).toBeGreaterThanOrEqual(3);
    expect(c.industries.length).toBeGreaterThanOrEqual(3);
    expect(c.aptitude.ko).toMatch(/형$/);
    expect(c.years).toHaveLength(5);
    expect(c.stars.every((s) => chartM.stars.some((x) => x.id === s.id))).toBe(true);
    expect(c.workStyle.length).toBeGreaterThan(5);
  });
  it('가장 많은 그룹이 적성, 동률이면 격국 그룹', () => {
    const c = sajuCareerThemeOf(chartF);
    const max = Math.max(...c.groups.map((g) => g.count));
    expect(c.groups.find((g) => g.group === c.aptitude.group)?.count).toBe(max);
  });
});

describe('sajuThemes — 공통', () => {
  it('십신 위치 헬퍼는 천간·지지 정기만 센다', () => {
    const all = sajuGodPositions(chartM, ['bigyeon', 'geopjae', 'siksin', 'sanggwan', 'pyeonjae', 'jeongjae', 'pyeongwan', 'jeonggwan', 'pyeonin', 'jeongin']);
    // 천간 3(일간 제외) + 지지 4.
    expect(all).toHaveLength(7);
    expect(all.filter((p) => p.pillar === 'day' && p.where === 'stem')).toHaveLength(0);
  });
  it('LLM 사실 블록은 테마마다 7줄이고 핵심 라벨을 담는다', () => {
    for (const id of SAJU_THEME_IDS) {
      const lines = sajuThemeFactLines(chartM, id);
      expect(lines).toHaveLength(7);
    }
    expect(sajuThemeFactLines(chartM, 'love')[0]).toContain('배우자성');
    expect(sajuThemeFactLines(chartM, 'wealth')[2]).toContain('재물 스타일');
    expect(sajuThemeFactLines(chartM, 'career')[0]).toContain('격국');
  });
  it('일주론은 성향과 배우자 자리를 나눠 준다', () => {
    const r = sajuDayPillarReadingOf(chartM);
    expect(r.traitBody).toContain(r.title);
    expect(r.spouseBody).toContain('배우자');
    expect(r.body).toBe(`${r.traitBody} ${r.spouseBody}`);
  });
});
