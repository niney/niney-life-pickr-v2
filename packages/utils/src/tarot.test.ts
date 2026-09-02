import { describe, expect, it } from 'vitest';
import {
  buildDrawnCards,
  createSeededRng,
  getTarotCard,
  getTarotSpread,
  isTarotCardId,
  pickRandomCards,
  shuffleTarotDeck,
  TAROT_AVAILABLE_SPREADS,
  TAROT_CARD_ASPECT,
  TAROT_CARD_DIMENSIONS,
  TAROT_REVERSED_PROBABILITY,
  TAROT_SPREAD_IDS,
  TAROT_SPREADS,
  tarotCardBackImagePath,
  tarotCardImagePath,
  tarotCardKeywords,
  tarotCardMeaning,
  validateDrawnCards,
} from './tarot';
import { TAROT_CARDS } from './tarotCards';

describe('createSeededRng', () => {
  it('[0,1) 범위이고 같은 시드는 같은 수열', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      expect(b()).toBe(x);
    }
  });
});

describe('shuffleTarotDeck', () => {
  it('78장의 순열이다', () => {
    const order = shuffleTarotDeck(createSeededRng(1));
    expect(order).toHaveLength(78);
    expect(new Set(order).size).toBe(78);
    expect([...order].sort()).toEqual(TAROT_CARDS.map((c) => c.id).sort());
  });

  it('시드가 같으면 같은 순서, 다르면 다른 순서', () => {
    expect(shuffleTarotDeck(createSeededRng(7))).toEqual(shuffleTarotDeck(createSeededRng(7)));
    expect(shuffleTarotDeck(createSeededRng(7))).not.toEqual(shuffleTarotDeck(createSeededRng(8)));
  });
});

describe('spreads', () => {
  it('모든 스프레드가 정의돼 있고 자리 id 가 유일하다', () => {
    for (const id of TAROT_SPREAD_IDS) {
      const s = TAROT_SPREADS[id];
      expect(s.id).toBe(id);
      expect(s.positions.length).toBeGreaterThan(0);
      expect(new Set(s.positions.map((p) => p.id)).size).toBe(s.positions.length);
      for (const p of s.positions) expect(p.hint.length).toBeGreaterThan(0);
    }
    expect(getTarotSpread('nope')).toBeUndefined();
  });

  it('v1 은 daily·3장×2·choice, 켈틱은 회원 전용·미제공', () => {
    expect(TAROT_AVAILABLE_SPREADS.map((s) => s.id)).toEqual(['daily', 'three-ppf', 'three-sar', 'choice']);
    expect(TAROT_SPREADS.daily.positions).toHaveLength(1);
    expect(TAROT_SPREADS.choice.positions.map((p) => p.id)).toEqual(['optionA', 'optionB', 'advice']);
    expect(TAROT_SPREADS.celtic.positions).toHaveLength(10);
    expect(TAROT_SPREADS.celtic.memberOnly).toBe(true);
    expect(TAROT_SPREADS.celtic.available).toBe(false);
  });
});

describe('buildDrawnCards', () => {
  const spread = TAROT_SPREADS['three-ppf'];

  it('고른 순서대로 자리에 놓는다', () => {
    const drawn = buildDrawnCards(spread, ['major-00', 'cups-03', 'swords-king'], { reversedEnabled: false });
    expect(drawn).toEqual([
      { cardId: 'major-00', position: 'past', reversed: false },
      { cardId: 'cups-03', position: 'present', reversed: false },
      { cardId: 'swords-king', position: 'future', reversed: false },
    ]);
  });

  it('장수가 다르면 throw', () => {
    expect(() => buildDrawnCards(spread, ['major-00'])).toThrow();
  });

  it('역방향 확률을 따른다 (기본 30%)', () => {
    expect(TAROT_REVERSED_PROBABILITY).toBe(0.3);
    const rng = createSeededRng(99);
    let reversed = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const [c] = buildDrawnCards(TAROT_SPREADS.daily, ['major-17'], { rng });
      if (c!.reversed) reversed++;
    }
    expect(reversed / N).toBeGreaterThan(0.26);
    expect(reversed / N).toBeLessThan(0.34);
    expect(buildDrawnCards(TAROT_SPREADS.daily, ['major-17'], { reversedProbability: 1 })[0]!.reversed).toBe(true);
    expect(buildDrawnCards(TAROT_SPREADS.daily, ['major-17'], { reversedProbability: 0 })[0]!.reversed).toBe(false);
  });
});

describe('pickRandomCards', () => {
  it('이미 고른 카드를 제외하고 덱 안에서 중복 없이 고른다', () => {
    const deck = shuffleTarotDeck(createSeededRng(3));
    const exclude = deck.slice(0, 5);
    const picked = pickRandomCards(deck, exclude, 4, createSeededRng(4));
    expect(picked).toHaveLength(4);
    expect(new Set(picked).size).toBe(4);
    for (const id of picked) {
      expect(deck).toContain(id);
      expect(exclude).not.toContain(id);
    }
  });

  it('남은 장수보다 많이 요청하면 남은 만큼만', () => {
    expect(pickRandomCards(['a', 'b', 'c'], ['a'], 5, createSeededRng(1)).sort()).toEqual(['b', 'c']);
  });
});

describe('validateDrawnCards', () => {
  const spread = TAROT_SPREADS['three-sar'];
  const ok = [
    { cardId: 'major-01', position: 'situation', reversed: false },
    { cardId: 'wands-08', position: 'advice', reversed: true },
    { cardId: 'pentacles-queen', position: 'outcome', reversed: false },
  ];

  it('유효하면 null', () => {
    expect(validateDrawnCards(spread, ok)).toBeNull();
  });
  it('장수 불일치', () => {
    expect(validateDrawnCards(spread, ok.slice(0, 2))).toBe('count_mismatch');
  });
  it('모르는 카드', () => {
    expect(validateDrawnCards(spread, [{ ...ok[0]!, cardId: 'major-99' }, ok[1]!, ok[2]!])).toBe('unknown_card');
  });
  it('중복 카드', () => {
    expect(validateDrawnCards(spread, [ok[0]!, { ...ok[1]!, cardId: 'major-01' }, ok[2]!])).toBe('duplicate_card');
  });
  it('자리 순서 불일치', () => {
    expect(validateDrawnCards(spread, [ok[1]!, ok[0]!, ok[2]!])).toBe('position_mismatch');
  });
});

describe('card lookup & images', () => {
  it('getTarotCard / isTarotCardId', () => {
    expect(getTarotCard('major-17')?.nameKo).toBe('별');
    expect(isTarotCardId('swords-10')).toBe(true);
    expect(isTarotCardId('coins-01')).toBe(false);
  });

  it('정/역 키워드·의미 선택', () => {
    const star = getTarotCard('major-17')!;
    expect(tarotCardKeywords(star, false)).toBe(star.keywordsUpright);
    expect(tarotCardKeywords(star, true)).toBe(star.keywordsReversed);
    expect(tarotCardMeaning(star, true)).toBe(star.meaningReversed);
  });

  it('이미지 경로와 7:12 치수', () => {
    expect(tarotCardImagePath('major-00')).toBe('/tarot/cards/major-00-512.webp');
    expect(tarotCardImagePath('wands-page', 1024)).toBe('/tarot/cards/wands-page-1024.webp');
    expect(tarotCardBackImagePath()).toBe('/tarot/cards/back-512.webp');
    for (const d of Object.values(TAROT_CARD_DIMENSIONS)) {
      expect(d.height % 2).toBe(0);
      expect(Math.abs(d.width / d.height - TAROT_CARD_ASPECT)).toBeLessThan(0.001);
    }
  });
});
