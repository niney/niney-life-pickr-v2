// 사주 입력·연출 흐름 상태 머신 — 순수 리듀서. 3D 무대(천문도 원판·인장)와 DOM 패널은 이 상태를 그리기만 한다.
//
//   setup → casting(원판 회전·정렬) → stamping(인장 8개 순차) → reading
//
// - submit 에서 입력을 검증해 원국을 계산한다(클라이언트 계산). 실패하면 setup 에 error 를 둔다.
// - 결과(LLM 풀이)는 phase 와 독립이다. 섹션이 하나씩 도착하므로 resultStatus 에 partial 이 있다.
// - 인장 수는 시주가 있으면 8, 없으면 6. stamp 이벤트마다 하나씩 찍히고 다 찍히면 reading.

import { computeSajuChart, SajuInputError, type SajuBirthInput, type SajuChart } from './saju.js';

export type SajuPhase = 'setup' | 'casting' | 'stamping' | 'reading';
export type SajuResultStatus = 'idle' | 'pending' | 'partial' | 'ready' | 'failed';

export interface SajuFlowState<R = unknown> {
  phase: SajuPhase;
  input: SajuBirthInput;
  chart: SajuChart | null;
  error: string | null;
  /** 찍힌 인장 수. */
  stamped: number;
  result: R | null;
  resultStatus: SajuResultStatus;
  readySections: readonly string[];
}

export type SajuFlowEvent<R = unknown> =
  | { type: 'set_input'; patch: Partial<SajuBirthInput> }
  | { type: 'submit'; asOf?: Date }
  | { type: 'casting_done' }
  | { type: 'stamp' }
  | { type: 'skip_animation' }
  | { type: 'request_sent' }
  | { type: 'section_ready'; section: string; result: R }
  | { type: 'result_ready'; result: R }
  | { type: 'result_failed' }
  | { type: 'edit' }
  | { type: 'reset' };

export const SAJU_DEFAULT_INPUT: SajuBirthInput = {
  calendar: 'solar',
  year: 1990,
  month: 1,
  day: 1,
  leapMonth: false,
  hour: null,
  minute: 0,
  gender: 'M',
};

export const createSajuFlowState = <R = unknown>(input: Partial<SajuBirthInput> = {}): SajuFlowState<R> => ({
  phase: 'setup',
  input: { ...SAJU_DEFAULT_INPUT, ...input },
  chart: null,
  error: null,
  stamped: 0,
  result: null,
  resultStatus: 'idle',
  readySections: [],
});

export const sajuStampTotal = (chart: SajuChart | null): number => (chart ? (chart.pillars.hour ? 8 : 6) : 0);

export const sajuFlowReducer = <R = unknown>(state: SajuFlowState<R>, event: SajuFlowEvent<R>): SajuFlowState<R> => {
  switch (event.type) {
    case 'set_input': {
      if (state.phase !== 'setup') return state;
      return { ...state, input: { ...state.input, ...event.patch }, error: null };
    }
    case 'submit': {
      if (state.phase !== 'setup') return state;
      try {
        const chart = computeSajuChart(state.input, { asOf: event.asOf });
        return { ...state, phase: 'casting', chart, error: null, stamped: 0, result: null, resultStatus: 'idle', readySections: [] };
      } catch (e) {
        const message = e instanceof SajuInputError ? e.message : '사주를 세울 수 없는 입력이에요.';
        return { ...state, error: message };
      }
    }
    case 'casting_done': {
      if (state.phase !== 'casting') return state;
      return { ...state, phase: 'stamping' };
    }
    case 'stamp': {
      if (state.phase !== 'stamping') return state;
      const total = sajuStampTotal(state.chart);
      const stamped = Math.min(total, state.stamped + 1);
      return { ...state, stamped, phase: stamped >= total ? 'reading' : 'stamping' };
    }
    case 'skip_animation': {
      if (state.phase === 'setup' || state.phase === 'reading') return state;
      return { ...state, phase: 'reading', stamped: sajuStampTotal(state.chart) };
    }
    case 'request_sent': {
      if (!state.chart) return state;
      return { ...state, resultStatus: state.resultStatus === 'idle' ? 'pending' : state.resultStatus };
    }
    case 'section_ready': {
      if (!state.chart) return state;
      const readySections = state.readySections.includes(event.section) ? state.readySections : [...state.readySections, event.section];
      return { ...state, result: event.result, resultStatus: 'partial', readySections };
    }
    case 'result_ready': {
      if (!state.chart) return state;
      return { ...state, result: event.result, resultStatus: 'ready' };
    }
    case 'result_failed': {
      if (!state.chart) return state;
      return { ...state, resultStatus: state.readySections.length ? 'partial' : 'failed' };
    }
    case 'edit': {
      return { ...createSajuFlowState<R>(state.input) };
    }
    case 'reset':
      return createSajuFlowState<R>();
  }
};
