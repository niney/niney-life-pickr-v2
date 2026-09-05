import { describe, expect, it } from 'vitest';
import { TAROT_SPREADS, getTarotCard, type TarotDrawnCard } from './tarot.js';
import { TAROT_CARDS } from './tarotCards.js';
import { createTarotFlowState, tarotFlowReducer } from './tarotFlow.js';
import {
  TAROT_MENU_ITEMS,
  TAROT_MENU_PICK_COUNT,
  selectTarotMenus,
  tarotCardAppetite,
} from './tarotMenu.js';

const draw = (mood: string, avoid: string, pick: string, reversed: boolean[] = [false, false, false]): TarotDrawnCard[] => [
  { cardId: mood, position: 'mood', reversed: reversed[0]! },
  { cardId: avoid, position: 'avoid', reversed: reversed[1]! },
  { cardId: pick, position: 'pick', reversed: reversed[2]! },
];

describe('tarotMenu 데이터', () => {
  it('메뉴 id 는 유일하고 원소 친화도가 하나 이상 있다', () => {
    const ids = new Set(TAROT_MENU_ITEMS.map((x) => x.id));
    expect(ids.size).toBe(TAROT_MENU_ITEMS.length);
    for (const item of TAROT_MENU_ITEMS) {
      expect(Object.keys(item.elements).length).toBeGreaterThan(0);
      expect(item.moods.length).toBeGreaterThan(0);
    }
    expect(TAROT_MENU_ITEMS.length).toBeGreaterThanOrEqual(80);
  });

  it('menu 스프레드 자리는 mood·avoid·pick 순', () => {
    expect(TAROT_SPREADS.menu.positions.map((p) => p.id)).toEqual(['mood', 'avoid', 'pick']);
    expect(TAROT_SPREADS.menu.available).toBe(true);
  });
});

describe('tarotCardAppetite', () => {
  it('정방향은 카드 원소 그대로, 역방향은 반대 원소·반대 무드', () => {
    const wandsKing = getTarotCard('wands-king')!;
    expect(tarotCardAppetite(wandsKing, false)).toEqual({ element: 'fire', mood: 'hearty', flipped: false });
    expect(tarotCardAppetite(wandsKing, true)).toEqual({ element: 'water', mood: 'light', flipped: true });
    const fool = getTarotCard('major-00')!;
    expect(tarotCardAppetite(fool, false)).toEqual({ element: 'air', mood: 'adventurous', flipped: false });
    expect(tarotCardAppetite(fool, true)).toEqual({ element: 'earth', mood: 'comfort', flipped: true });
    // 숫자 4~7 은 무드 없음.
    expect(tarotCardAppetite(getTarotCard('cups-05')!, false).mood).toBeNull();
  });

  it('78장 전부 원소가 나온다', () => {
    for (const card of TAROT_CARDS) {
      expect(['fire', 'water', 'air', 'earth']).toContain(tarotCardAppetite(card, false).element);
    }
  });
});

describe('selectTarotMenus', () => {
  it('항상 3개, 서로 다른 조리형태·요리 계통, 같은 카드면 같은 결과', () => {
    const cards = draw('cups-02', 'swords-03', 'wands-king');
    const a = selectTarotMenus(cards);
    const b = selectTarotMenus(cards);
    expect(a.picks).toHaveLength(TAROT_MENU_PICK_COUNT);
    expect(a.picks.map((p) => p.id)).toEqual(b.picks.map((p) => p.id));
    expect(new Set(a.picks.map((p) => p.dishType)).size).toBe(3);
    expect(new Set(a.picks.map((p) => p.cuisine)).size).toBe(3);
    expect(a.profile).toContain('구이');
    expect(a.avoid).toContain('가볍고');
  });

  it('추천 자리 원소가 결과를 이끈다 — 불(완드)은 구이·매운 쪽, 물(컵)은 국물 쪽', () => {
    const fire = selectTarotMenus(draw('pentacles-05', 'swords-05', 'wands-08'));
    const water = selectTarotMenus(draw('pentacles-05', 'swords-05', 'cups-08'));
    expect(fire.picks[0]!.elements.fire).toBe(2);
    expect(water.picks[0]!.elements.water).toBe(2);
    expect(fire.picks[0]!.id).not.toBe(water.picks[0]!.id);
  });

  it('피할 것 자리의 원소는 감점된다', () => {
    const noAvoid = selectTarotMenus(draw('pentacles-05', 'cups-05', 'wands-08'));
    const avoidFire = selectTarotMenus(draw('pentacles-05', 'wands-05', 'wands-08'));
    // 불을 피하면 추천의 불 친화도 합이 줄거나 같다.
    const fireSum = (s: typeof noAvoid) => s.picks.reduce((acc, p) => acc + (p.elements.fire ?? 0), 0);
    expect(fireSum(avoidFire)).toBeLessThanOrEqual(fireSum(noAvoid));
  });

  it('역방향 추천은 반대 원소로 균형을 잡는다', () => {
    const upright = selectTarotMenus(draw('pentacles-05', 'swords-05', 'wands-08'));
    const reversed = selectTarotMenus(draw('pentacles-05', 'swords-05', 'wands-08', [false, false, true]));
    expect(reversed.appetites.pick.element).toBe('water');
    expect(reversed.appetites.pick.flipped).toBe(true);
    expect(reversed.picks[0]!.id).not.toBe(upright.picks[0]!.id);
  });

  it('피할 것이 추천과 같은 원소면 "과한 쪽만" 으로 푼다', () => {
    const same = selectTarotMenus(draw('wands-king', 'wands-05', 'wands-06'));
    expect(same.avoid).toContain('같은 불의 기운이 겹쳐요');
    expect(same.avoid).toContain('맵고 자극적인 것');
  });

  it('자리가 빠지면 throw', () => {
    expect(() => selectTarotMenus(draw('cups-02', 'swords-03', 'wands-king').slice(0, 2))).toThrow(/pick/);
  });

  it('카드 순서·역방향이 다르면 동점 가르기 시드도 달라 결과가 달라질 수 있다', () => {
    const seen = new Set<string>();
    for (const [mood, avoid, pick] of [
      ['major-00', 'major-01', 'major-02'],
      ['major-03', 'major-04', 'major-05'],
      ['cups-01', 'wands-01', 'swords-01'],
      ['pentacles-10', 'cups-10', 'wands-10'],
    ] as const) {
      seen.add(selectTarotMenus(draw(mood, avoid, pick)).picks[0]!.id);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('tarotFlow — 메뉴 타로 주제 고정', () => {
  it('menu 스프레드를 고르면 주제가 food 로 잠기고, 다른 스프레드로 돌아가면 전체 운', () => {
    let s = createTarotFlowState();
    s = tarotFlowReducer(s, { type: 'set_topic', topic: 'love' });
    s = tarotFlowReducer(s, { type: 'set_spread', spreadId: 'menu' });
    expect(s.topic).toBe('food');
    s = tarotFlowReducer(s, { type: 'set_topic', topic: 'work' });
    expect(s.topic).toBe('food');
    s = tarotFlowReducer(s, { type: 'set_spread', spreadId: 'three-sar' });
    expect(s.topic).toBe('general');
    // food 주제는 메뉴 스프레드 밖에서 직접 고를 수 없다.
    s = tarotFlowReducer(s, { type: 'set_topic', topic: 'food' });
    expect(s.topic).toBe('general');
  });
});
