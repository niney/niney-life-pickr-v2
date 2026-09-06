import { describe, expect, it } from 'vitest';
import { computeSajuChart } from './saju';
import { sajuDayNumber } from './sajuCalendar';
import { dailyFortune, kstDayKey, scoreDayForChart } from './sajuDaily';
import { pickDates, SAJU_DATE_PICK_MAX_DAYS } from './sajuDatePick';
import { createSajuFlowState, sajuFlowReducer, sajuStampTotal } from './sajuFlow';
import { selectSajuFood } from './sajuFood';
import { matchCharts } from './sajuMatch';
import { sajuFactLines, SAJU_DAY_MASTER_TEXT } from './sajuText';

const ASOF = new Date('2026-09-06T03:00:00Z');
const A = computeSajuChart({ calendar: 'solar', year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'M' }, { asOf: ASOF });
const B = computeSajuChart({ calendar: 'solar', year: 1992, month: 11, day: 3, hour: 9, minute: 0, gender: 'F' }, { asOf: ASOF });

describe('sajuText', () => {
  it('일간 10종 텍스트가 전부 있고 사실 목록이 핵심 항목을 담는다', () => {
    expect(SAJU_DAY_MASTER_TEXT).toHaveLength(10);
    const lines = sajuFactLines(A);
    expect(lines.join('\n')).toContain('경오(庚午)');
    expect(lines.join('\n')).toContain('일간(나): 경(庚)');
    expect(lines.join('\n')).toContain('대운: 순행');
    expect(lines.join('\n')).toContain('올해 세운 2026년 병오');
    expect(lines.some((l) => l.startsWith('오행 분포'))).toBe(true);
  });
});

describe('sajuDaily', () => {
  it('점수는 5~98, 별점 1~5, 결정적', () => {
    const n = sajuDayNumber(2026, 9, 6);
    const s1 = scoreDayForChart(A, n);
    const s2 = scoreDayForChart(A, n);
    expect(s1).toEqual(s2);
    expect(s1.ko).toBe('계미');
    expect(s1.score).toBeGreaterThanOrEqual(5);
    expect(s1.score).toBeLessThanOrEqual(98);
    expect([1, 2, 3, 4, 5]).toContain(s1.stars);
    expect(s1.lunar).toEqual({ year: 2026, month: 7, day: 25, leap: false });
  });
  it('천을귀인 날은 태그·가점, 충 날은 감점', () => {
    // 경 일간 천을귀인 = 축·미. 2026-09-06 계미.
    const good = scoreDayForChart(A, sajuDayNumber(2026, 9, 6));
    expect(good.tags).toContain('cheoneul');
    // 일지 진 ↔ 술 충. 2026-09-09 병술.
    const bad = scoreDayForChart(A, sajuDayNumber(2026, 9, 9));
    expect(bad.ko).toBe('병술');
    expect(bad.tags).toContain('clash');
    expect(bad.score).toBeLessThan(good.score);
  });
  it('dailyFortune·kstDayKey', () => {
    const f = dailyFortune(A, new Date('2026-09-06T03:00:00Z'));
    expect(f.day.date).toEqual({ year: 2026, month: 9, day: 6 });
    expect(f.lucky.element).toBe(A.favorable.primary);
    expect(f.headline.length).toBeGreaterThan(0);
    expect(kstDayKey(new Date('2026-09-06T16:30:00Z'))).toBe('2026-09-07');
  });
});

describe('sajuMatch', () => {
  it('점수 0~100, 항목 5개, 대칭', () => {
    const ab = matchCharts(A, B);
    const ba = matchCharts(B, A);
    expect(ab.breakdown).toHaveLength(5);
    expect(ab.score).toBeGreaterThanOrEqual(0);
    expect(ab.score).toBeLessThanOrEqual(100);
    expect(ab.score).toBe(ba.score);
    expect(ab.breakdown.reduce((s, b) => s + b.max, 0)).toBe(100);
    expect(ab.gradeKo.length).toBeGreaterThan(0);
  });
  it('자기 자신과는 같은 오행·같은 글자 점수', () => {
    const aa = matchCharts(A, A);
    expect(aa.breakdown.find((b) => b.key === 'dayMaster')?.score).toBe(14);
    expect(aa.breakdown.find((b) => b.key === 'dayBranch')?.note).toContain('같은 글자');
  });
});

describe('sajuDatePick', () => {
  it('기간 상한·상위 3·용도 가중', () => {
    const from = sajuDayNumber(2026, 9, 6);
    const r = pickDates(A, from, 90, 'move');
    expect(r.days).toHaveLength(SAJU_DATE_PICK_MAX_DAYS);
    expect(r.top).toHaveLength(3);
    expect(r.top[0]?.purposeScore).toBeGreaterThanOrEqual(r.top[2]?.purposeScore as number);
    const sonEomneun = r.days.find((d) => d.tags.includes('son-eomneun'));
    expect(sonEomneun).toBeDefined();
    expect((sonEomneun as { purposeScore: number }).purposeScore).toBe(Math.min(99, (sonEomneun as { score: number }).score + 10 + (sonEomneun?.tags.includes('clash') ? -5 : 0) + (sonEomneun?.tags.includes('yeokma') ? 3 : 0)));
    const general = pickDates(A, from, 10, 'general');
    expect(general.days.every((d) => d.purposeScore === d.score)).toBe(true);
  });
});

describe('sajuFood', () => {
  it('후보 3개, 조리형태·계통 비중복, 결정적', () => {
    const s1 = selectSajuFood(A);
    const s2 = selectSajuFood(A);
    expect(s1.picks.map((p) => p.item.id)).toEqual(s2.picks.map((p) => p.item.id));
    expect(s1.picks).toHaveLength(3);
    expect(new Set(s1.picks.map((p) => p.item.dishType)).size).toBe(3);
    expect(new Set(s1.picks.map((p) => p.item.cuisine)).size).toBe(3);
    expect(s1.primary).toBe(A.favorable.primary);
    expect(s1.profile).toContain('기운');
    // 첫 후보는 보완 오행 친화도가 있다.
    expect(s1.picks[0]?.elements).toContain(A.favorable.primary);
    const salted = selectSajuFood(A, { seedSalt: '2026-09-07', dayElement: 'fire' });
    expect(salted.dayElement).toBe('fire');
  });
});

describe('sajuFlow', () => {
  it('setup → casting → stamping → reading, 인장 8개', () => {
    let s = createSajuFlowState();
    s = sajuFlowReducer(s, { type: 'set_input', patch: { year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'M' } });
    s = sajuFlowReducer(s, { type: 'submit', asOf: ASOF });
    expect(s.phase).toBe('casting');
    expect(s.chart?.dayMaster.ko).toBe('경');
    expect(sajuStampTotal(s.chart)).toBe(8);
    s = sajuFlowReducer(s, { type: 'casting_done' });
    expect(s.phase).toBe('stamping');
    for (let i = 0; i < 7; i++) s = sajuFlowReducer(s, { type: 'stamp' });
    expect(s.phase).toBe('stamping');
    s = sajuFlowReducer(s, { type: 'stamp' });
    expect(s.phase).toBe('reading');
    expect(s.stamped).toBe(8);
  });
  it('결과 상태는 phase 와 독립 — 섹션 부분 도착·실패', () => {
    let s = createSajuFlowState<{ n: number }>({ year: 1990, month: 5, day: 15, hour: null, gender: 'M' });
    s = sajuFlowReducer(s, { type: 'submit', asOf: ASOF });
    expect(sajuStampTotal(s.chart)).toBe(6);
    s = sajuFlowReducer(s, { type: 'request_sent' });
    expect(s.resultStatus).toBe('pending');
    s = sajuFlowReducer(s, { type: 'section_ready', section: 'personality', result: { n: 1 } });
    expect(s.resultStatus).toBe('partial');
    s = sajuFlowReducer(s, { type: 'result_failed' });
    expect(s.resultStatus).toBe('partial');
    s = sajuFlowReducer(s, { type: 'result_ready', result: { n: 2 } });
    expect(s.resultStatus).toBe('ready');
    s = sajuFlowReducer(s, { type: 'skip_animation' });
    expect(s.phase).toBe('reading');
    s = sajuFlowReducer(s, { type: 'edit' });
    expect(s.phase).toBe('setup');
    expect(s.input.year).toBe(1990);
    expect(s.chart).toBeNull();
  });
  it('잘못된 입력은 setup 에 error', () => {
    let s = createSajuFlowState({ year: 2026, month: 2, day: 30, hour: null, gender: 'F' });
    s = sajuFlowReducer(s, { type: 'submit', asOf: ASOF });
    expect(s.phase).toBe('setup');
    expect(s.error).toMatch(/날짜/);
    s = sajuFlowReducer(s, { type: 'set_input', patch: { day: 28 } });
    expect(s.error).toBeNull();
  });
});

describe('화면 요약(5차)', () => {
  it('출생 요약 — 양력·음력·태양시 보정·계절', async () => {
    const { sajuBirthSummary } = await import('./sajuText');
    const s = sajuBirthSummary(A);
    expect(s.solar).toBe('1990년 5월 15일 14:30');
    expect(s.lunar).toBe('1990년 4월 21일');
    // 1990-05-15 는 서머타임 아님 → 표준시 −30분.
    expect(s.corrected).toBe('14:00 (표준시 −30분)');
    expect(s.season).toBe('여름(사월) 태생');
    expect(s.age).toBe(36);
    const noHour = computeSajuChart({ calendar: 'solar', year: 1990, month: 5, day: 15, hour: null, minute: null, gender: 'M' }, { asOf: ASOF });
    expect(sajuBirthSummary(noHour).corrected).toBeNull();
    expect(sajuBirthSummary(noHour).solar).toBe('1990년 5월 15일');
  });
  it('십신 요약 — 칩은 개수 내림차순, 그룹 5개, 없는 그룹은 노트로', async () => {
    const { sajuTenGodSummary, zodiacTraitLine } = await import('./sajuText');
    const s = sajuTenGodSummary(A);
    expect(s.groups.map((g) => g.ko)).toEqual(['비겁', '식상', '재성', '관성', '인성']);
    expect(s.chips.every((c, i, arr) => i === 0 || arr[i - 1]!.count >= c.count)).toBe(true);
    expect(s.chips.reduce((n, c) => n + c.count, 0)).toBe(s.groups.reduce((n, g) => n + g.count, 0));
    for (const g of s.groups) if (g.count === 0) expect(s.notes.some((n) => n.startsWith(`${g.ko}이 없어요`))).toBe(true);
    expect(s.notes.length).toBeLessThanOrEqual(3);
    expect(zodiacTraitLine(A)).toMatch(/띠$/);
  });
});
