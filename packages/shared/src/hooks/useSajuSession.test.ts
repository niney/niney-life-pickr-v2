import { describe, expect, it } from 'vitest';
import type { SajuJobPollResultType, SajuReadingResultType } from '@repo/api-contract';
import { SAJU_DEFAULT_OPTIONS } from '@repo/utils';
import { sajuInitialMode, sajuInitialTab } from '../saju/sajuPanelTabs.js';
import { defaultSajuPartner, mergeSajuJobResult, toSajuBirthInput } from './useSajuSession.js';

// 사주 세션의 순수 조각 — 딥링크 → 첫 탭·모드, 흐름 입력 → 계약 입력, 궁합 상대 기본값, job 병합.
// 훅 자체(요청·병합·궁합 흐름)는 웹 SajuPage 테스트가 화면을 통해 검증한다.

describe('sajuInitialTab / sajuInitialMode', () => {
  it('tab 이 우선, 없으면 tool, 둘 다 없으면 명식', () => {
    expect(sajuInitialTab('year', 'daily')).toBe('year');
    expect(sajuInitialTab(null, 'daily')).toBe('daily');
    expect(sajuInitialTab(undefined, 'ask')).toBe('ask');
    expect(sajuInitialTab('nope', 'career')).toBe('career');
    expect(sajuInitialTab(null, 'match')).toBe('chart');
    expect(sajuInitialTab(null, null)).toBe('chart');
  });

  it('tool=match 만 궁합 모드', () => {
    expect(sajuInitialMode('match')).toBe('pair');
    expect(sajuInitialMode('daily')).toBe('self');
    expect(sajuInitialMode(null)).toBe('self');
  });
});

describe('toSajuBirthInput', () => {
  it('시가 없으면 분도 null, 옵션은 기본값으로 채운다', () => {
    const out = toSajuBirthInput({ calendar: 'solar', year: 1990, month: 5, day: 3, hour: null, minute: 30, gender: 'F' });
    expect(out).toEqual({ calendar: 'solar', year: 1990, month: 5, day: 3, leapMonth: false, hour: null, minute: null, gender: 'F', options: SAJU_DEFAULT_OPTIONS });
  });

  it('시가 있으면 분 기본 0, 옵션은 덮어쓴다', () => {
    const out = toSajuBirthInput({ calendar: 'lunar', year: 1988, month: 2, day: 9, leapMonth: true, hour: 7, gender: 'M', options: { lateRatHour: true } });
    expect(out.minute).toBe(0);
    expect(out.leapMonth).toBe(true);
    expect(out.options).toEqual({ ...SAJU_DEFAULT_OPTIONS, lateRatHour: true });
  });
});

describe('defaultSajuPartner', () => {
  it('같은 해 1월 1일, 반대 성별, 시 모름', () => {
    const me = toSajuBirthInput({ calendar: 'solar', year: 1992, month: 8, day: 21, hour: 14, minute: 20, gender: 'M' });
    expect(defaultSajuPartner(me)).toMatchObject({ year: 1992, month: 1, day: 1, leapMonth: false, gender: 'F', hour: null, minute: null });
  });
});

describe('mergeSajuJobResult', () => {
  const initial = { readingId: null, jobId: 'j1', sections: { personality: null }, source: 'static' } as unknown as SajuReadingResultType;

  it('즉시 응답이 없으면 null, job 이 없으면 즉시 응답 그대로', () => {
    expect(mergeSajuJobResult(undefined, null)).toBeNull();
    expect(mergeSajuJobResult(initial, null)).toBe(initial);
  });

  it('job 스냅샷의 섹션·readingId·source 로 덮는다', () => {
    const job = { version: 2, done: false, sections: { personality: { body: 'x' } }, readingId: 'r1', source: 'mixed' } as unknown as SajuJobPollResultType;
    const merged = mergeSajuJobResult(initial, job);
    expect(merged).toMatchObject({ jobId: 'j1', readingId: 'r1', source: 'mixed', sections: job.sections });
  });
});
