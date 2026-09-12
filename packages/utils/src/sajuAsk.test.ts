import { describe, expect, it } from 'vitest';
import { computeSajuChart, type SajuBirthInput } from './saju.js';
import { SAJU_ASK_TOPIC_META, SAJU_ASK_TOPICS, sajuAskBlockedReason, sajuAskFactLines, sajuAskOf } from './sajuAsk.js';

// 사주에 묻기 — 주제 9개 메타, 시점 4종 채점·판정·대안, 차단 키워드, LLM 사실 블록.
const ASOF = new Date('2026-09-06T03:00:00Z');
const M: SajuBirthInput = { calendar: 'solar', year: 1990, month: 5, day: 15, leapMonth: false, hour: 14, minute: 30, gender: 'M' };
const chart = computeSajuChart(M, { asOf: ASOF });

describe('sajuAskOf', () => {
  it('주제 9개 메타가 전부 있고 타로 주제로 매핑된다', () => {
    expect(SAJU_ASK_TOPICS).toHaveLength(9);
    for (const t of SAJU_ASK_TOPICS) {
      const m = SAJU_ASK_TOPIC_META[t];
      expect(m.ko.length).toBeGreaterThan(0);
      expect(['general', 'love', 'work', 'money', 'relationship', 'choice']).toContain(m.tarotTopic);
    }
  });
  it('시점 4종 — 점수 5~99·판정·대안 ≤2·근거 줄', () => {
    const cases = [
      { kind: 'this-month' } as const,
      { kind: 'this-year' } as const,
      { kind: 'year', year: 2028 } as const,
      { kind: 'date', date: '2026-10-03' } as const,
    ];
    for (const when of cases) {
      const f = sajuAskOf(chart, { topic: 'job-change', when });
      expect(f.window.score).toBeGreaterThanOrEqual(5);
      expect(f.window.score).toBeLessThanOrEqual(99);
      expect(['good', 'ok', 'careful']).toContain(f.verdict);
      expect(f.alternatives.length).toBeLessThanOrEqual(2);
      for (const a of f.alternatives) expect(a.score).toBeGreaterThan(f.window.score);
      expect(f.basis.length).toBeGreaterThan(0);
      expect(f.luckNote).toContain('대운');
      expect(f.window.reasons.length).toBeGreaterThan(0);
    }
    expect(sajuAskOf(chart, { topic: 'job-change', when: { kind: 'this-year' } }).whenKo).toBe('올해(2026년)');
    expect(sajuAskOf(chart, { topic: 'job-change', when: { kind: 'date', date: '2026-10-03' } }).window.label).toContain('2026-10-03');
    // 올해 창 라벨은 세운 간지.
    expect(sajuAskOf(chart, { topic: 'invest', when: { kind: 'this-year' } }).window.label).toBe('2026년 병오');
  });
  it('주제별 근거 — 결혼은 성별 배우자성, 창업은 직업+재물 테마 요약', () => {
    const marriage = sajuAskOf(chart, { topic: 'marriage', when: { kind: 'this-year' } });
    expect(marriage.basis[0]).toContain('배우자성(재성)');
    expect(marriage.themeSummary[0]).toContain('인연:');
    const startup = sajuAskOf(chart, { topic: 'startup', when: { kind: 'this-year' } });
    expect(startup.themeSummary.some((s) => s.startsWith('직업:'))).toBe(true);
    expect(startup.themeSummary.some((s) => s.startsWith('재물:'))).toBe(true);
    const trip = sajuAskOf(chart, { topic: 'trip', when: { kind: 'this-month' } });
    expect(trip.themeSummary).toHaveLength(0);
  });
  it('답하지 않는 주제는 키워드로 막는다', () => {
    expect(sajuAskBlockedReason('수술을 받아도 될까요')).toBe('건강·생명');
    expect(sajuAskBlockedReason('소송을 걸면 이길까')).toBe('법률');
    expect(sajuAskBlockedReason('로또 사면 될까')).toBe('사행성·금액 예측');
    expect(sajuAskBlockedReason('지금 회사 그만두고 카페 차리면?')).toBeNull();
    expect(sajuAskBlockedReason('')).toBeNull();
  });
  it('LLM 사실 블록은 주제·시점 점수·대안·근거·대운을 담는다', () => {
    const lines = sajuAskFactLines(sajuAskOf(chart, { topic: 'contract', when: { kind: 'this-year' } }));
    expect(lines[0]).toContain('주제: 계약');
    expect(lines[1]).toContain('판정');
    expect(lines.some((l) => l.startsWith('원국 근거'))).toBe(true);
    expect(lines.at(-1)).toContain('대운');
  });
});
