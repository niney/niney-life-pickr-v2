import { describe, expect, it } from 'vitest';
import {
  TAROT_CARDS,
  TAROT_DECK_SIZE,
  TAROT_ELEMENTS,
  TAROT_SUIT_META,
  TAROT_SUITS,
} from './tarotCards';

describe('TAROT_CARDS', () => {
  it('78장이고 id 가 유일하다', () => {
    expect(TAROT_CARDS).toHaveLength(TAROT_DECK_SIZE);
    expect(new Set(TAROT_CARDS.map((c) => c.id)).size).toBe(78);
  });

  it('메이저 22장은 0~21 번호와 major-NN id 를 가진다', () => {
    const majors = TAROT_CARDS.filter((c) => c.arcana === 'major');
    expect(majors).toHaveLength(22);
    majors.forEach((c, i) => {
      expect(c.number).toBe(i);
      expect(c.id).toBe(`major-${String(i).padStart(2, '0')}`);
      expect(c.suit).toBeNull();
    });
    expect(majors[0]!.nameEn).toBe('The Fool');
    expect(majors[21]!.nameEn).toBe('The World');
  });

  it('수트별 14장: 01~10 + page/knight/queen/king, 원소는 수트 원소', () => {
    for (const suit of TAROT_SUITS) {
      const cards = TAROT_CARDS.filter((c) => c.suit === suit);
      expect(cards).toHaveLength(14);
      expect(cards.map((c) => c.number)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
      const ids = cards.map((c) => c.id);
      for (let n = 1; n <= 10; n++) expect(ids).toContain(`${suit}-${String(n).padStart(2, '0')}`);
      for (const court of ['page', 'knight', 'queen', 'king']) expect(ids).toContain(`${suit}-${court}`);
      for (const c of cards) {
        expect(c.arcana).toBe('minor');
        expect(c.element).toBe(TAROT_SUIT_META[suit].element);
      }
    }
  });

  it('궁정 카드 이름은 음차(페이지·나이트·퀸·킹) + "X of Suit"', () => {
    const page = TAROT_CARDS.find((c) => c.id === 'cups-page')!;
    expect(page.nameKo).toBe('컵 페이지');
    expect(page.nameEn).toBe('Page of Cups');
    const ace = TAROT_CARDS.find((c) => c.id === 'pentacles-01')!;
    expect(ace.nameKo).toBe('펜타클 에이스');
    expect(ace.nameEn).toBe('Ace of Pentacles');
  });

  it('모든 카드에 이름·키워드 3개 이상·정/역 의미(존댓말 두 문장)·원소가 있다', () => {
    for (const c of TAROT_CARDS) {
      expect(c.nameKo.length, c.id).toBeGreaterThan(0);
      expect(c.nameEn.length, c.id).toBeGreaterThan(0);
      expect(c.keywordsUpright.length, c.id).toBeGreaterThanOrEqual(3);
      expect(c.keywordsReversed.length, c.id).toBeGreaterThanOrEqual(3);
      expect(TAROT_ELEMENTS, c.id).toContain(c.element);
      for (const meaning of [c.meaningUpright, c.meaningReversed]) {
        expect(meaning.length, c.id).toBeGreaterThan(20);
        expect(meaning.endsWith('다.') || meaning.endsWith('요.'), `${c.id}: ${meaning}`).toBe(true);
        expect(meaning.split('. ').length, `${c.id}: 두 문장`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('정/역 키워드와 의미는 서로 다르다', () => {
    for (const c of TAROT_CARDS) {
      expect(c.meaningUpright, c.id).not.toBe(c.meaningReversed);
      expect(c.keywordsUpright, c.id).not.toEqual(c.keywordsReversed);
    }
  });
});
