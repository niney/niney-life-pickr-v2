import { describe, expect, it } from 'vitest';
import type { TarotReadingResultType } from '@repo/api-contract';
import { createTarotFlowState, TAROT_QUESTION_MAX_LENGTH } from '@repo/utils';
import type { TarotHistoryEntry } from '../stores/tarotHistoryStore.js';
import { tarotHistoryShareBase, tarotInitialState, tarotMenuOf, tarotShareBase, tarotTodayDailyId, type TarotSessionState } from './useTarotSession.js';

// 타로 세션의 순수 조각 — 딥링크 → 첫 상태, 공유 근거, 메뉴 후보, 오늘의 카드 잠금.
// 훅 자체(섞기·고르기·요청·기록 흐름)는 웹 TarotPage 테스트가 화면을 통해 검증한다.

const result = (over: Partial<TarotReadingResultType> = {}): TarotReadingResultType => ({
  readingId: null,
  spreadId: 'three-sar',
  topic: 'general',
  question: '',
  choices: null,
  source: 'llm',
  model: 'm',
  cards: [],
  summary: 's',
  advice: 'a',
  keyword: 'k',
  choice: null,
  menu: null,
  createdAt: '2026-09-26T00:00:00.000Z',
  quota: { remainingToday: 2 },
  ...over,
});

const MENU_CARDS = [
  { cardId: 'wands-03', position: 'mood', reversed: false },
  { cardId: 'cups-07', position: 'avoid', reversed: true },
  { cardId: 'pentacles-queen', position: 'pick', reversed: false },
];

describe('tarotInitialState', () => {
  it('제공 중인 스프레드만 받고, 메뉴 타로는 주제가 food 로 잠긴다', () => {
    expect(tarotInitialState({ spread: 'menu', q: null, topic: 'love' })).toMatchObject({ spreadId: 'menu', topic: 'food' });
    expect(tarotInitialState({ spread: 'daily', q: null, topic: null })).toMatchObject({ spreadId: 'daily', topic: 'general' });
    // 회원 전용·미제공(켈틱)·모르는 값은 기본 스프레드.
    expect(tarotInitialState({ spread: 'celtic', q: null, topic: null }).spreadId).toBe('three-sar');
    expect(tarotInitialState({ spread: 'nope', q: null, topic: null }).spreadId).toBe('three-sar');
  });

  it('질문은 다듬어 한도까지, 주제는 목록 안의 값만(사주 "타로로도 보기")', () => {
    const s = tarotInitialState({ spread: null, q: `  ${'가'.repeat(TAROT_QUESTION_MAX_LENGTH + 5)} `, topic: 'money' });
    expect(s.question).toHaveLength(TAROT_QUESTION_MAX_LENGTH);
    expect(s.topic).toBe('money');
    expect(tarotInitialState({ spread: null, q: '   ', topic: 'zzz' })).toMatchObject({ question: '', topic: 'general' });
  });
});

describe('tarotShareBase / tarotHistoryShareBase', () => {
  const drawn = [{ cardId: 'major-01', position: 'situation', reversed: false }];
  const base = (over: Partial<TarotSessionState>): TarotSessionState => ({ ...createTarotFlowState<TarotReadingResultType>(), drawn, ...over });

  it('결과가 오기 전엔 없음, 회원은 readingId', () => {
    expect(tarotShareBase(base({ resultStatus: 'pending' }))).toBeNull();
    expect(tarotShareBase(base({ resultStatus: 'ready', result: result({ readingId: 'r1' }) }))).toEqual({ readingId: 'r1' });
  });

  it('게스트는 입력 그대로 — 선택지는 선택 타로에서만, 앞뒤 공백 없이', () => {
    const guest = tarotShareBase(base({ resultStatus: 'ready', result: result(), spreadId: 'choice', choiceA: ' 치킨 ', choiceB: '피자', question: 'q' }));
    expect(guest).toEqual({ reading: { spreadId: 'choice', topic: 'general', question: 'q', choices: { a: '치킨', b: '피자' }, cards: drawn } });
    const noChoice = tarotShareBase(base({ resultStatus: 'ready', result: result(), choiceA: 'x', choiceB: 'y' }));
    expect(noChoice && 'reading' in noChoice ? noChoice.reading.choices : 'x').toBeNull();
  });

  it('게스트 기록 한 건 → 저장된 입력', () => {
    const entry: TarotHistoryEntry = { id: 'h', createdAt: 1, cards: drawn, result: result({ spreadId: 'daily', question: '오늘', choices: null }) };
    expect(tarotHistoryShareBase(entry)).toEqual({ reading: { spreadId: 'daily', topic: 'general', question: '오늘', choices: null, cards: drawn } });
  });
});

describe('tarotMenuOf', () => {
  it('메뉴 타로만 — 결과 전엔 카드로 정한 후보(이유 없음), 결과가 오면 서버 후보', () => {
    const preview = tarotMenuOf('menu', MENU_CARDS, null);
    expect(preview?.picks).toHaveLength(3);
    expect(preview?.picks.every((p) => p.reason === '' && p.kcal === null)).toBe(true);
    const server = { picks: [{ menuId: 'x', name: '국밥', cuisine: '한식', dishType: '국물', kcal: 600, reason: '따뜻하게' }], profile: 'p', avoid: 'a' };
    expect(tarotMenuOf('menu', MENU_CARDS, result({ menu: server }))).toEqual(server);
    expect(tarotMenuOf('three-sar', MENU_CARDS, null)).toBeNull();
    expect(tarotMenuOf('menu', MENU_CARDS.slice(0, 2), null)).toBeNull();
  });
});

describe('tarotTodayDailyId', () => {
  it('KST 오늘 뽑은 오늘의 카드만', () => {
    const now = new Date('2026-09-26T02:00:00Z'); // KST 11시
    const items = [
      { id: 'a', spreadId: 'three-sar' as const, createdAt: '2026-09-26T01:00:00Z' },
      { id: 'b', spreadId: 'daily' as const, createdAt: '2026-09-25T14:30:00Z' }, // KST 9/25 23:30 → 어제
      { id: 'c', spreadId: 'daily' as const, createdAt: '2026-09-25T15:30:00Z' }, // KST 9/26 00:30 → 오늘
    ];
    expect(tarotTodayDailyId(items, now)).toBe('c');
    expect(tarotTodayDailyId(items.slice(0, 2), now)).toBeNull();
  });
});
