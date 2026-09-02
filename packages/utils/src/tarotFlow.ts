// 타로 뽑기·리빌 흐름 상태 머신 — 순수 리듀서. 3D 무대(R3F)와 DOM 오버레이는 이 상태를
// 그리기만 하고 전이 규칙은 여기서만 바뀐다. 3D 레이어는 단위 테스트가 어려워 흐름 로직을
// 분리해 검증한다(docs/PLAN-tarot.md 결정 14).
//
//   setup → shuffling → picking → placing → revealing → reading
//
// - placing 진입 시 뽑힌 카드(역방향 포함)가 확정된다. UI 는 이때 해석 요청을 보내고
//   (request_sent) 카드가 자리로 날아가는 애니메이션을 돌린 뒤 placed 를 보낸다.
// - resultStatus 는 phase 와 독립이다. 리빌이 끝났는데 결과가 pending 이면 "읽는 중" 을 보인다.
// - 난수가 필요한 이벤트(shuffle·pick·auto_pick)는 `seed` 를 받는다. 리듀서 안에서 시드 난수를
//   새로 만들어 쓰므로 같은 (state, event) 는 항상 같은 결과 — React StrictMode 의 리듀서 이중
//   호출이나 "dispatch 전에 next 를 미리 계산해 API 를 쏘는" 호출자 패턴에서도 어긋나지 않는다.
//   seed 를 생략하면 Math.random(재현 불필요한 곳).

import {
  buildDrawnCards,
  createSeededRng,
  getTarotSpread,
  isTarotCardId,
  pickRandomCards,
  shuffleTarotDeck,
  TAROT_CHOICE_MAX_LENGTH,
  TAROT_QUESTION_MAX_LENGTH,
  type TarotDrawnCard,
  type TarotRng,
  type TarotSpreadId,
  type TarotTopic,
} from './tarot.js';

export type TarotPhase = 'setup' | 'shuffling' | 'picking' | 'placing' | 'revealing' | 'reading';
export type TarotResultStatus = 'idle' | 'pending' | 'ready' | 'failed';

export interface TarotFlowState<R = unknown> {
  phase: TarotPhase;
  spreadId: TarotSpreadId;
  topic: TarotTopic;
  question: string;
  // 선택 타로(choice) 의 두 선택지.
  choiceA: string;
  choiceB: string;
  reversedEnabled: boolean;
  // 부채꼴 순서(셔플 결과). setup 에서는 빈 배열.
  deckOrder: readonly string[];
  // 고른 순서 = 자리 순서.
  picked: readonly string[];
  // placing 진입 시 확정(역방향 포함).
  drawn: readonly TarotDrawnCard[];
  // 뒤집힌 장수.
  revealed: number;
  result: R | null;
  resultStatus: TarotResultStatus;
}

export type TarotFlowEvent<R = unknown> =
  | { type: 'set_spread'; spreadId: TarotSpreadId }
  | { type: 'set_topic'; topic: TarotTopic }
  | { type: 'set_question'; question: string }
  | { type: 'set_choices'; a: string; b: string }
  | { type: 'set_reversed'; enabled: boolean }
  | { type: 'shuffle'; seed?: number }
  | { type: 'shuffle_done' }
  | { type: 'pick'; cardId: string; seed?: number }
  | { type: 'unpick'; cardId: string }
  | { type: 'auto_pick'; seed?: number }
  | { type: 'placed' }
  | { type: 'request_sent' }
  | { type: 'reveal_next' }
  | { type: 'reveal_all' }
  | { type: 'result_ready'; result: R }
  | { type: 'result_failed' }
  | { type: 'retry_result' }
  | { type: 'reset' };

export type TarotSetupError = 'spread_unavailable' | 'choice_required';

export const createTarotFlowState = <R = unknown>(
  init: Partial<Pick<TarotFlowState<R>, 'spreadId' | 'topic' | 'question' | 'choiceA' | 'choiceB' | 'reversedEnabled'>> = {},
): TarotFlowState<R> => ({
  phase: 'setup',
  spreadId: init.spreadId ?? 'three-sar',
  topic: init.topic ?? 'general',
  question: init.question ?? '',
  choiceA: init.choiceA ?? '',
  choiceB: init.choiceB ?? '',
  reversedEnabled: init.reversedEnabled ?? true,
  deckOrder: [],
  picked: [],
  drawn: [],
  revealed: 0,
  result: null,
  resultStatus: 'idle',
});

// setup 에서 셔플로 넘어갈 수 있는지. null 이면 가능.
export const getTarotSetupError = (state: TarotFlowState): TarotSetupError | null => {
  const spread = getTarotSpread(state.spreadId);
  if (!spread || !spread.available) return 'spread_unavailable';
  if (state.spreadId === 'choice' && (!state.choiceA.trim() || !state.choiceB.trim())) return 'choice_required';
  return null;
};

export const tarotRequiredPicks = (state: TarotFlowState): number =>
  getTarotSpread(state.spreadId)?.positions.length ?? 0;
export const tarotRemainingPicks = (state: TarotFlowState): number =>
  Math.max(0, tarotRequiredPicks(state) - state.picked.length);
export const canPickTarotCard = (state: TarotFlowState, cardId: string): boolean =>
  state.phase === 'picking' &&
  tarotRemainingPicks(state) > 0 &&
  state.deckOrder.includes(cardId) &&
  !state.picked.includes(cardId);

// 이벤트 시드 → 난수원. 시드가 없으면 비결정적(Math.random).
export const tarotEventRng = (seed: number | undefined): TarotRng =>
  seed === undefined ? Math.random : createSeededRng(seed);

// 호출자가 이벤트 시드를 만들 때 — 32비트 양의 정수.
export const newTarotSeed = (): number => Math.floor(Math.random() * 0x7fffffff);

const clip = (s: string, max: number): string => s.replace(/\s+/g, ' ').trimStart().slice(0, max);

// 뽑기가 다 찼으면 placing 으로 넘기며 drawn 을 확정한다.
const settlePicks = <R>(state: TarotFlowState<R>, picked: readonly string[], rng: TarotRng): TarotFlowState<R> => {
  const spread = getTarotSpread(state.spreadId);
  if (!spread || picked.length < spread.positions.length) return { ...state, picked };
  const drawn = buildDrawnCards(spread, picked, { reversedEnabled: state.reversedEnabled, rng });
  return { ...state, phase: 'placing', picked, drawn, revealed: 0, result: null, resultStatus: 'idle' };
};

export const tarotFlowReducer = <R = unknown>(
  state: TarotFlowState<R>,
  event: TarotFlowEvent<R>,
): TarotFlowState<R> => {
  switch (event.type) {
    case 'set_spread':
      if (state.phase !== 'setup' || !getTarotSpread(event.spreadId)) return state;
      return { ...state, spreadId: event.spreadId };
    case 'set_topic':
      return state.phase === 'setup' ? { ...state, topic: event.topic } : state;
    case 'set_question':
      return state.phase === 'setup' ? { ...state, question: clip(event.question, TAROT_QUESTION_MAX_LENGTH) } : state;
    case 'set_choices':
      return state.phase === 'setup'
        ? { ...state, choiceA: clip(event.a, TAROT_CHOICE_MAX_LENGTH), choiceB: clip(event.b, TAROT_CHOICE_MAX_LENGTH) }
        : state;
    case 'set_reversed':
      return state.phase === 'setup' ? { ...state, reversedEnabled: event.enabled } : state;

    case 'shuffle': {
      if (state.phase !== 'setup' || getTarotSetupError(state)) return state;
      return {
        ...state,
        phase: 'shuffling',
        question: state.question.trim(),
        deckOrder: shuffleTarotDeck(tarotEventRng(event.seed)),
        picked: [],
        drawn: [],
        revealed: 0,
        result: null,
        resultStatus: 'idle',
      };
    }
    case 'shuffle_done':
      return state.phase === 'shuffling' ? { ...state, phase: 'picking' } : state;

    case 'pick': {
      if (!isTarotCardId(event.cardId) || !canPickTarotCard(state, event.cardId)) return state;
      return settlePicks(state, [...state.picked, event.cardId], tarotEventRng(event.seed));
    }
    case 'unpick':
      if (state.phase !== 'picking' || !state.picked.includes(event.cardId)) return state;
      return { ...state, picked: state.picked.filter((id) => id !== event.cardId) };
    case 'auto_pick': {
      if (state.phase !== 'picking') return state;
      const remaining = tarotRemainingPicks(state);
      if (remaining === 0) return state;
      const rng = tarotEventRng(event.seed);
      const extra = pickRandomCards(state.deckOrder, state.picked, remaining, rng);
      return settlePicks(state, [...state.picked, ...extra], rng);
    }

    case 'placed':
      return state.phase === 'placing' ? { ...state, phase: 'revealing' } : state;
    case 'request_sent':
      return state.phase === 'placing' || state.phase === 'revealing' || state.phase === 'reading'
        ? { ...state, resultStatus: 'pending' }
        : state;

    case 'reveal_next': {
      if (state.phase !== 'revealing') return state;
      const revealed = Math.min(state.drawn.length, state.revealed + 1);
      return { ...state, revealed, phase: revealed >= state.drawn.length ? 'reading' : 'revealing' };
    }
    case 'reveal_all':
      return state.phase === 'revealing' ? { ...state, revealed: state.drawn.length, phase: 'reading' } : state;

    case 'result_ready':
      return state.drawn.length > 0 ? { ...state, result: event.result, resultStatus: 'ready' } : state;
    case 'result_failed':
      return state.drawn.length > 0 ? { ...state, resultStatus: 'failed' } : state;
    case 'retry_result':
      return state.resultStatus === 'failed' ? { ...state, resultStatus: 'pending' } : state;

    case 'reset':
      return createTarotFlowState<R>({
        spreadId: state.spreadId,
        topic: state.topic,
        question: state.question,
        choiceA: state.choiceA,
        choiceB: state.choiceB,
        reversedEnabled: state.reversedEnabled,
      });
    default:
      return state;
  }
};
