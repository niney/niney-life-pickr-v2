import { describe, expect, it } from 'vitest';
import { TAROT_SPREADS } from './tarot';
import {
  canPickTarotCard,
  createTarotFlowState,
  getTarotSetupError,
  tarotFlowReducer,
  tarotRemainingPicks,
  type TarotFlowEvent,
  type TarotFlowState,
} from './tarotFlow';

const run = <R>(state: TarotFlowState<R>, events: TarotFlowEvent<R>[]): TarotFlowState<R> =>
  events.reduce((s, e) => tarotFlowReducer(s, e), state);

describe('tarotFlowReducer — 결정성', () => {
  it('같은 (state, event) 는 시드가 있으면 항상 같은 결과 (StrictMode 이중 호출·미리 계산 안전)', () => {
    const s = createTarotFlowState({ spreadId: 'three-ppf' });
    const a = tarotFlowReducer(s, { type: 'shuffle', seed: 42 });
    const b = tarotFlowReducer(s, { type: 'shuffle', seed: 42 });
    expect(a.deckOrder).toEqual(b.deckOrder);
    const p = tarotFlowReducer(a, { type: 'shuffle_done' });
    const x = tarotFlowReducer(p, { type: 'auto_pick', seed: 7 });
    const y = tarotFlowReducer(p, { type: 'auto_pick', seed: 7 });
    expect(x.drawn).toEqual(y.drawn);
    expect(tarotFlowReducer(p, { type: 'auto_pick', seed: 8 }).drawn).not.toEqual(x.drawn);
  });
});

describe('tarotFlowReducer — setup', () => {
  it('초기 상태', () => {
    const s = createTarotFlowState();
    expect(s.phase).toBe('setup');
    expect(s.spreadId).toBe('three-sar');
    expect(s.reversedEnabled).toBe(true);
    expect(s.deckOrder).toEqual([]);
    expect(getTarotSetupError(s)).toBeNull();
  });

  it('질문은 200자, 선택지는 40자로 자르고 공백을 정리한다', () => {
    const s = run(createTarotFlowState(), [
      { type: 'set_question', question: '  a  '.repeat(100) },
      { type: 'set_choices', a: 'x'.repeat(50), b: ' b ' },
    ]);
    expect(s.question.length).toBe(200);
    expect(s.question.startsWith('a a')).toBe(true);
    expect(s.choiceA.length).toBe(40);
    expect(s.choiceB).toBe('b ');
  });

  it('선택 타로는 A·B 가 있어야 셔플할 수 있다', () => {
    const s = run(createTarotFlowState(), [{ type: 'set_spread', spreadId: 'choice' }]);
    expect(getTarotSetupError(s)).toBe('choice_required');
    expect(tarotFlowReducer(s, { type: 'shuffle', seed: 11 }).phase).toBe('setup');
    const ready = tarotFlowReducer(s, { type: 'set_choices', a: '치킨', b: '피자' });
    expect(getTarotSetupError(ready)).toBeNull();
    expect(tarotFlowReducer(ready, { type: 'shuffle', seed: 11 }).phase).toBe('shuffling');
  });

  it('미제공 스프레드(켈틱)는 셔플 불가', () => {
    const s = run(createTarotFlowState(), [{ type: 'set_spread', spreadId: 'celtic' }]);
    expect(getTarotSetupError(s)).toBe('spread_unavailable');
  });

  it('setup 밖에서는 설정 이벤트를 무시한다', () => {
    const s = run(createTarotFlowState(), [{ type: 'shuffle', seed: 11 }, { type: 'set_topic', topic: 'love' }]);
    expect(s.topic).toBe('general');
  });
});

describe('tarotFlowReducer — shuffle → pick → place → reveal → read', () => {
  const toPicking = () =>
    run(createTarotFlowState({ spreadId: 'three-ppf', question: ' 이직할까요? ' }), [
      { type: 'shuffle', seed: 11 },
      { type: 'shuffle_done' },
    ]);

  it('셔플하면 78장 덱 순서가 생기고 질문이 trim 된다', () => {
    const s = tarotFlowReducer(createTarotFlowState({ question: ' q ' }), { type: 'shuffle', seed: 11 });
    expect(s.phase).toBe('shuffling');
    expect(s.deckOrder).toHaveLength(78);
    expect(s.question).toBe('q');
    expect(tarotFlowReducer(s, { type: 'shuffle_done' }).phase).toBe('picking');
  });

  it('고른 순서대로 쌓이고, 중복·모르는 카드·다른 phase 는 무시', () => {
    const s = toPicking();
    const [a, b] = s.deckOrder;
    expect(canPickTarotCard(s, a!)).toBe(true);
    const s1 = tarotFlowReducer(s, { type: 'pick', cardId: a! });
    expect(s1.picked).toEqual([a]);
    expect(tarotRemainingPicks(s1)).toBe(2);
    expect(tarotFlowReducer(s1, { type: 'pick', cardId: a! }).picked).toEqual([a]);
    expect(tarotFlowReducer(s1, { type: 'pick', cardId: 'major-99' }).picked).toEqual([a]);
    expect(canPickTarotCard(s1, a!)).toBe(false);
    expect(canPickTarotCard(s1, b!)).toBe(true);
    expect(tarotFlowReducer(createTarotFlowState(), { type: 'pick', cardId: a! }).picked).toEqual([]);
  });

  it('unpick 으로 되돌릴 수 있다', () => {
    const s = toPicking();
    const [a, b] = s.deckOrder;
    const s2 = run(s, [{ type: 'pick', cardId: a! }, { type: 'pick', cardId: b! }, { type: 'unpick', cardId: a! }]);
    expect(s2.picked).toEqual([b]);
    expect(s2.phase).toBe('picking');
  });

  it('마지막 장을 고르면 placing 으로 넘어가며 drawn 이 자리 순서로 확정된다', () => {
    const s = toPicking();
    const [a, b, c] = s.deckOrder;
    const s3 = run(s, [
      { type: 'pick', cardId: a! },
      { type: 'pick', cardId: b! },
      { type: 'pick', cardId: c!, seed: 5 },
    ]);
    expect(s3.phase).toBe('placing');
    expect(s3.drawn.map((d) => d.cardId)).toEqual([a, b, c]);
    expect(s3.drawn.map((d) => d.position)).toEqual(TAROT_SPREADS['three-ppf'].positions.map((p) => p.id));
    expect(s3.revealed).toBe(0);
    expect(s3.resultStatus).toBe('idle');
  });

  it('역방향 끄면 전부 정방향', () => {
    const s = run(createTarotFlowState({ spreadId: 'three-ppf', reversedEnabled: false }), [
      { type: 'shuffle', seed: 11 },
      { type: 'shuffle_done' },
      { type: 'auto_pick', seed: 2 },
    ]);
    expect(s.phase).toBe('placing');
    expect(s.drawn.every((d) => !d.reversed)).toBe(true);
  });

  it('auto_pick 은 남은 장수만 채운다', () => {
    const s = toPicking();
    const [a] = s.deckOrder;
    const s2 = run(s, [{ type: 'pick', cardId: a! }, { type: 'auto_pick', seed: 9 }]);
    expect(s2.phase).toBe('placing');
    expect(s2.picked[0]).toBe(a);
    expect(new Set(s2.picked).size).toBe(3);
  });

  it('placed → revealing, reveal_next 로 한 장씩, 다 뒤집으면 reading', () => {
    const s = run(toPicking(), [{ type: 'auto_pick', seed: 1 }, { type: 'request_sent' }, { type: 'placed' }]);
    expect(s.phase).toBe('revealing');
    expect(s.resultStatus).toBe('pending');
    const r1 = tarotFlowReducer(s, { type: 'reveal_next' });
    expect(r1.revealed).toBe(1);
    expect(r1.phase).toBe('revealing');
    const r3 = run(r1, [{ type: 'reveal_next' }, { type: 'reveal_next' }]);
    expect(r3.revealed).toBe(3);
    expect(r3.phase).toBe('reading');
    expect(tarotFlowReducer(r3, { type: 'reveal_next' }).revealed).toBe(3);
    expect(tarotFlowReducer(s, { type: 'reveal_all' })).toMatchObject({ revealed: 3, phase: 'reading' });
  });

  it('결과는 phase 와 독립: ready / failed → retry → pending', () => {
    const s = run(toPicking(), [{ type: 'auto_pick', seed: 1 }, { type: 'request_sent' }]);
    const ready = tarotFlowReducer<{ summary: string }>(s as TarotFlowState<{ summary: string }>, {
      type: 'result_ready',
      result: { summary: '좋아요' },
    });
    expect(ready.resultStatus).toBe('ready');
    expect(ready.result).toEqual({ summary: '좋아요' });
    expect(ready.phase).toBe('placing');
    const failed = tarotFlowReducer(s, { type: 'result_failed' });
    expect(failed.resultStatus).toBe('failed');
    expect(tarotFlowReducer(failed, { type: 'retry_result' }).resultStatus).toBe('pending');
    expect(tarotFlowReducer(s, { type: 'retry_result' }).resultStatus).toBe('pending');
  });

  it('뽑기 전에는 결과 이벤트를 무시한다', () => {
    const s = createTarotFlowState();
    expect(tarotFlowReducer(s, { type: 'result_ready', result: {} })).toBe(s);
  });

  it('reset 은 설정(스프레드·주제·질문·선택지·역방향)만 남기고 setup 으로', () => {
    const s = run(createTarotFlowState({ spreadId: 'three-sar', topic: 'work', question: 'q', reversedEnabled: false }), [
      { type: 'shuffle', seed: 11 },
      { type: 'shuffle_done' },
      { type: 'auto_pick', seed: 1 },
      { type: 'placed' },
      { type: 'reveal_all' },
      { type: 'reset' },
    ]);
    expect(s).toMatchObject({
      phase: 'setup',
      spreadId: 'three-sar',
      topic: 'work',
      question: 'q',
      reversedEnabled: false,
      deckOrder: [],
      picked: [],
      drawn: [],
      revealed: 0,
      result: null,
      resultStatus: 'idle',
    });
  });
});
