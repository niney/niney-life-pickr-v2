// 메뉴 타로 — 카드 기운(원소·무드)을 음식 취향으로 옮겨 메뉴 후보를 **결정적으로** 고른다.
// LLM 은 여기서 고른 후보에 "왜 이 카드가 이 메뉴인지" 이유만 쓴다(서버가 후보 id 를 검증해
// 없는 메뉴를 지어내지 못하게). LLM 이 없으면 정적 문장으로 같은 후보를 보여 준다.
//
// 규칙(docs/PLAN-tarot.md v3):
//  - 원소 → 입맛: 불(완드)=매콤·구이·뜨거운 기운, 물(컵)=국물·해산물·위로, 바람(소드)=가볍고
//    시원한·면·샐러드, 땅(펜타클)=든든한 밥·고기·익숙한 맛. 메이저는 황금여명회 배속 원소.
//  - 무드: 메이저는 카드별 표, 마이너는 숫자(1~3 가벼움·8~10 푸짐)·궁정(페이지 모험·나이트 빠름·
//    퀸 집밥·킹 든든)에서.
//  - 역방향은 그 기운이 과하거나 막힌 상태 — 반대 원소(불↔물, 바람↔땅)·반대 무드로 균형을 잡는다.
//  - 자리: mood(오늘의 입맛, 보조 가점) / avoid(피할 것, 감점) / pick(추천, 주 가점).
//  - 동점은 카드 조합에서 만든 시드 난수로 가른다 — 같은 카드면 늘 같은 메뉴(캐시·공유와 일치).
//  - 상위 3개는 조리형태·요리 계통이 겹치지 않게(김치찌개·된장찌개·순두부찌개 방지).

import { createSeededRng, getTarotCard, type TarotDrawnCard } from './tarot.js';
import { TAROT_ELEMENT_LABEL, type TarotCard, type TarotElement } from './tarotCards.js';

export type TarotMenuMood = 'adventurous' | 'comfort' | 'light' | 'hearty' | 'festive' | 'quick';
// @repo/api-contract FoodCuisine / FoodDishType 의 부분집합 문자열 — 메뉴판 대표 메뉴만 쓴다.
export type TarotMenuCuisine = 'korean' | 'chinese' | 'japanese' | 'western' | 'asian' | 'fast_food';
export type TarotMenuDishType =
  | 'rice'
  | 'noodle'
  | 'soup'
  | 'stew'
  | 'grill'
  | 'stir_fry'
  | 'braise'
  | 'steam'
  | 'pancake'
  | 'fried'
  | 'salad'
  | 'raw_fish'
  | 'bakery';

export interface TarotMenuItem {
  id: string;
  name: string;
  cuisine: TarotMenuCuisine;
  dishType: TarotMenuDishType;
  // 원소 친화도 0~2. 예: 김치찌개 = 불 1(매콤) + 물 2(국물).
  elements: Partial<Record<TarotElement, 1 | 2>>;
  moods: readonly TarotMenuMood[];
}

export const TAROT_MENU_MOOD_LABEL: Record<TarotMenuMood, string> = {
  adventurous: '새로운 맛',
  comfort: '익숙한 집밥',
  light: '가볍게',
  hearty: '푸짐하게',
  festive: '여럿이 즐겁게',
  quick: '빠르고 간단하게',
};

export const TAROT_MENU_CUISINE_LABEL: Record<TarotMenuCuisine, string> = {
  korean: '한식',
  chinese: '중식',
  japanese: '일식',
  western: '양식',
  asian: '아시안',
  fast_food: '분식·패스트푸드',
};

export const TAROT_MENU_DISH_LABEL: Record<TarotMenuDishType, string> = {
  rice: '밥',
  noodle: '면',
  soup: '국·탕',
  stew: '찌개·전골',
  grill: '구이',
  stir_fry: '볶음',
  braise: '조림',
  steam: '찜',
  pancake: '전',
  fried: '튀김',
  salad: '샐러드',
  raw_fish: '회·초밥',
  bakery: '빵',
};

// 원소별 입맛 서술 — 프롬프트·정적 문장·화면 칩.
export const TAROT_MENU_ELEMENT_TASTE: Record<TarotElement, string> = {
  fire: '매콤하고 뜨거운 구이·볶음',
  water: '따뜻한 국물과 해산물',
  air: '가볍고 시원한 면·샐러드',
  earth: '든든한 밥과 고기',
};

const m = (
  id: string,
  name: string,
  cuisine: TarotMenuCuisine,
  dishType: TarotMenuDishType,
  elements: TarotMenuItem['elements'],
  moods: readonly TarotMenuMood[],
): TarotMenuItem => ({ id, name, cuisine, dishType, elements, moods });

// 메뉴판 대표 메뉴 — 누구나 아는 이름만. 카탈로그(FoodItem) 와는 이름으로 느슨하게 잇는다(칼로리 표시).
export const TAROT_MENU_ITEMS: readonly TarotMenuItem[] = [
  // ── 한식 국·찌개·탕 ──
  m('kimchi-jjigae', '김치찌개', 'korean', 'stew', { fire: 1, water: 2 }, ['comfort']),
  m('doenjang-jjigae', '된장찌개', 'korean', 'stew', { water: 2, earth: 1 }, ['comfort']),
  m('sundubu', '순두부찌개', 'korean', 'stew', { fire: 1, water: 2 }, ['comfort', 'quick']),
  m('budae-jjigae', '부대찌개', 'korean', 'stew', { fire: 2, water: 1 }, ['festive', 'hearty']),
  m('gamjatang', '감자탕', 'korean', 'soup', { water: 1, earth: 2 }, ['hearty', 'festive']),
  m('seolleongtang', '설렁탕', 'korean', 'soup', { water: 2, earth: 1 }, ['comfort']),
  m('galbitang', '갈비탕', 'korean', 'soup', { water: 2, earth: 1 }, ['comfort', 'hearty']),
  m('samgyetang', '삼계탕', 'korean', 'soup', { water: 2, earth: 1 }, ['comfort', 'hearty']),
  m('yukgaejang', '육개장', 'korean', 'soup', { fire: 2, water: 1 }, ['hearty']),
  m('haemultang', '해물탕', 'korean', 'soup', { fire: 1, water: 2 }, ['festive']),
  m('kongnamul-gukbap', '콩나물국밥', 'korean', 'soup', { water: 2, air: 1 }, ['light', 'quick']),
  m('dwaeji-gukbap', '돼지국밥', 'korean', 'soup', { water: 2, earth: 1 }, ['hearty', 'comfort']),
  m('sundae-gukbap', '순대국밥', 'korean', 'soup', { water: 2, earth: 1 }, ['hearty', 'comfort']),
  m('ddukguk', '떡국', 'korean', 'soup', { water: 2, earth: 1 }, ['comfort', 'light']),
  m('dak-hanmari', '닭한마리', 'korean', 'soup', { water: 2, earth: 1 }, ['festive', 'hearty']),
  m('jeongol', '버섯전골', 'korean', 'stew', { water: 2, air: 1 }, ['light', 'festive']),
  // ── 한식 구이·볶음·찜 ──
  m('samgyeopsal', '삼겹살', 'korean', 'grill', { fire: 2, earth: 2 }, ['festive', 'hearty']),
  m('galbi', '소갈비', 'korean', 'grill', { fire: 2, earth: 2 }, ['festive', 'hearty']),
  m('bulgogi', '불고기', 'korean', 'grill', { fire: 1, earth: 2 }, ['comfort', 'hearty']),
  m('dak-galbi', '닭갈비', 'korean', 'stir_fry', { fire: 2, earth: 1 }, ['festive']),
  m('jeyuk', '제육볶음', 'korean', 'stir_fry', { fire: 2, earth: 1 }, ['comfort', 'quick']),
  m('ojingeo-bokkeum', '오징어볶음', 'korean', 'stir_fry', { fire: 2, water: 1 }, ['comfort']),
  m('godeungeo-gui', '고등어구이', 'korean', 'grill', { fire: 1, water: 2 }, ['comfort', 'light']),
  m('jjimdak', '찜닭', 'korean', 'braise', { water: 1, earth: 2 }, ['festive', 'hearty']),
  m('galbi-jjim', '갈비찜', 'korean', 'braise', { fire: 1, earth: 2 }, ['festive', 'hearty']),
  m('agujjim', '아귀찜', 'korean', 'steam', { fire: 2, water: 1 }, ['festive', 'adventurous']),
  m('jokbal', '족발', 'korean', 'braise', { earth: 2 }, ['festive', 'hearty']),
  m('bossam', '보쌈', 'korean', 'steam', { water: 1, earth: 2 }, ['festive', 'hearty']),
  m('pajeon', '해물파전', 'korean', 'pancake', { water: 1, earth: 1 }, ['festive', 'comfort']),
  m('dakbal', '닭발', 'korean', 'grill', { fire: 2 }, ['adventurous', 'festive']),
  // ── 한식 밥·면·분식 ──
  m('bibimbap', '비빔밥', 'korean', 'rice', { fire: 1, air: 1, earth: 1 }, ['light', 'comfort']),
  m('kimbap', '김밥', 'korean', 'rice', { air: 1, earth: 1 }, ['quick', 'light']),
  m('dolsot-bibimbap', '돌솥비빔밥', 'korean', 'rice', { fire: 1, earth: 2 }, ['comfort', 'hearty']),
  m('kimchi-bokkeumbap', '김치볶음밥', 'korean', 'rice', { fire: 1, earth: 1 }, ['quick', 'comfort']),
  m('naengmyeon', '물냉면', 'korean', 'noodle', { air: 2, water: 1 }, ['light']),
  m('bibim-naengmyeon', '비빔냉면', 'korean', 'noodle', { fire: 1, air: 2 }, ['light']),
  m('kalguksu', '칼국수', 'korean', 'noodle', { water: 2, earth: 1 }, ['comfort']),
  m('kongguksu', '콩국수', 'korean', 'noodle', { air: 2, water: 1 }, ['light']),
  m('makguksu', '막국수', 'korean', 'noodle', { air: 2 }, ['light', 'quick']),
  m('janchi-guksu', '잔치국수', 'korean', 'noodle', { water: 1, air: 1 }, ['light', 'quick', 'comfort']),
  m('tteokbokki', '떡볶이', 'fast_food', 'stir_fry', { fire: 2, earth: 1 }, ['quick', 'comfort']),
  m('sundae', '순대', 'fast_food', 'steam', { earth: 2 }, ['quick', 'comfort']),
  m('twigim', '모둠튀김', 'fast_food', 'fried', { fire: 1, earth: 1 }, ['quick', 'festive']),
  m('ramyeon', '라면', 'fast_food', 'noodle', { fire: 1, water: 1 }, ['quick', 'comfort']),
  m('jjolmyeon', '쫄면', 'fast_food', 'noodle', { fire: 1, air: 2 }, ['quick', 'light']),
  // ── 중식 ──
  m('jjajangmyeon', '짜장면', 'chinese', 'noodle', { earth: 2 }, ['comfort', 'quick']),
  m('jjamppong', '짬뽕', 'chinese', 'noodle', { fire: 2, water: 2 }, ['hearty']),
  m('tangsuyuk', '탕수육', 'chinese', 'fried', { fire: 1, earth: 1 }, ['festive', 'comfort']),
  m('mapo-tofu', '마파두부', 'chinese', 'stir_fry', { fire: 2, earth: 1 }, ['adventurous']),
  m('mala-tang', '마라탕', 'chinese', 'soup', { fire: 2, water: 1 }, ['adventurous', 'festive']),
  m('yangjangpi', '양장피', 'chinese', 'salad', { air: 2, water: 1 }, ['festive', 'light']),
  m('kkanpunggi', '깐풍기', 'chinese', 'fried', { fire: 2 }, ['festive']),
  m('bokkeumbap-chinese', '볶음밥', 'chinese', 'rice', { fire: 1, earth: 2 }, ['quick', 'comfort']),
  m('yangkkochi', '양꼬치', 'chinese', 'grill', { fire: 2, earth: 1 }, ['festive', 'adventurous']),
  // ── 일식 ──
  m('sushi', '초밥', 'japanese', 'raw_fish', { water: 2, air: 1 }, ['light', 'festive']),
  m('sashimi', '회', 'japanese', 'raw_fish', { water: 2, air: 1 }, ['festive', 'light']),
  m('ramen', '라멘', 'japanese', 'noodle', { water: 2, earth: 1 }, ['comfort', 'hearty']),
  m('udon', '우동', 'japanese', 'noodle', { water: 2 }, ['comfort', 'light', 'quick']),
  m('soba', '메밀소바', 'japanese', 'noodle', { air: 2 }, ['light']),
  m('tonkatsu', '돈가스', 'japanese', 'fried', { earth: 2, fire: 1 }, ['comfort', 'hearty']),
  m('katsudon', '가츠동', 'japanese', 'rice', { earth: 2 }, ['quick', 'hearty']),
  m('gyudon', '규동', 'japanese', 'rice', { earth: 2 }, ['quick', 'comfort']),
  m('onigiri', '오니기리', 'japanese', 'rice', { air: 1, earth: 1 }, ['quick', 'light']),
  m('okonomiyaki', '오코노미야키', 'japanese', 'pancake', { fire: 1, earth: 1 }, ['adventurous', 'festive']),
  m('yakitori', '야키토리', 'japanese', 'grill', { fire: 2 }, ['festive']),
  m('curry-japanese', '일본식 카레', 'japanese', 'rice', { fire: 1, earth: 2 }, ['comfort']),
  // ── 양식 ──
  m('pasta-tomato', '토마토 파스타', 'western', 'noodle', { fire: 1, air: 1 }, ['light', 'comfort']),
  m('pasta-cream', '크림 파스타', 'western', 'noodle', { water: 1, earth: 2 }, ['comfort', 'hearty']),
  m('pasta-oil', '알리오 올리오', 'western', 'noodle', { air: 2 }, ['light']),
  m('pizza', '피자', 'western', 'bakery', { fire: 1, earth: 2 }, ['festive', 'hearty']),
  m('steak', '스테이크', 'western', 'grill', { fire: 2, earth: 2 }, ['festive', 'hearty']),
  m('hamburger', '수제버거', 'western', 'bakery', { earth: 2, fire: 1 }, ['quick', 'hearty']),
  m('risotto', '리조또', 'western', 'rice', { water: 1, earth: 2 }, ['comfort']),
  m('salad-bowl', '샐러드 볼', 'western', 'salad', { air: 2 }, ['light']),
  m('sandwich', '샌드위치', 'western', 'bakery', { air: 1, earth: 1 }, ['quick', 'light']),
  m('fish-and-chips', '피시앤칩스', 'western', 'fried', { water: 1, earth: 1 }, ['adventurous']),
  m('fried-chicken', '치킨', 'western', 'fried', { fire: 2, earth: 1 }, ['festive', 'comfort']),
  m('brunch', '브런치 플레이트', 'western', 'bakery', { air: 1, earth: 1 }, ['light', 'festive']),
  // ── 아시안 ──
  m('pho', '쌀국수', 'asian', 'noodle', { water: 2, air: 1 }, ['light', 'comfort']),
  m('pad-thai', '팟타이', 'asian', 'noodle', { fire: 1, earth: 1 }, ['adventurous']),
  m('bun-cha', '분짜', 'asian', 'noodle', { fire: 1, air: 1 }, ['adventurous', 'light']),
  m('tom-yum', '똠얌꿍', 'asian', 'soup', { fire: 2, water: 2 }, ['adventurous']),
  m('curry-indian', '인도 커리', 'asian', 'rice', { fire: 2, earth: 1 }, ['adventurous', 'hearty']),
  m('nasi-goreng', '나시고렝', 'asian', 'rice', { fire: 1, earth: 1 }, ['adventurous']),
  m('banh-mi', '반미', 'asian', 'bakery', { air: 1, earth: 1 }, ['quick', 'adventurous']),
  m('khao-pad', '태국식 볶음밥', 'asian', 'rice', { fire: 1, earth: 1 }, ['adventurous', 'quick']),
  m('dimsum', '딤섬', 'chinese', 'steam', { water: 1, earth: 1 }, ['festive', 'light']),
  // ── 그 외 대표 ──
  m('mandu', '만두', 'korean', 'steam', { water: 1, earth: 1 }, ['quick', 'comfort']),
  m('jeon-modum', '모둠전', 'korean', 'pancake', { earth: 1, fire: 1 }, ['festive', 'comfort']),
  m('dakgangjeong', '닭강정', 'fast_food', 'fried', { fire: 2 }, ['quick', 'festive']),
  m('hotdog', '핫도그', 'fast_food', 'fried', { earth: 1 }, ['quick']),
  m('toast', '길거리 토스트', 'fast_food', 'bakery', { earth: 1, air: 1 }, ['quick', 'comfort']),
  m('dak-jjim-andong', '안동찜닭', 'korean', 'braise', { water: 1, earth: 2 }, ['festive', 'hearty']),
  m('gopchang', '곱창구이', 'korean', 'grill', { fire: 2, earth: 2 }, ['adventurous', 'festive']),
  m('jogae-gui', '조개구이', 'korean', 'grill', { fire: 1, water: 2 }, ['festive', 'adventurous']),
  m('hoe-deopbap', '회덮밥', 'korean', 'rice', { water: 2, air: 1 }, ['light']),
  m('yukhoe', '육회', 'korean', 'salad', { earth: 2, air: 1 }, ['adventurous', 'festive']),
];

export const TAROT_MENU_BY_ID: ReadonlyMap<string, TarotMenuItem> = new Map(TAROT_MENU_ITEMS.map((x) => [x.id, x]));
export const getTarotMenuItem = (id: string): TarotMenuItem | undefined => TAROT_MENU_BY_ID.get(id);

// ── 카드 → 기운 ─────────────────────────────────────────────────────────────

const COMPLEMENT: Record<TarotElement, TarotElement> = { fire: 'water', water: 'fire', air: 'earth', earth: 'air' };
const OPPOSITE_MOOD: Record<TarotMenuMood, TarotMenuMood> = {
  adventurous: 'comfort',
  comfort: 'adventurous',
  light: 'hearty',
  hearty: 'light',
  festive: 'quick',
  quick: 'festive',
};

// 메이저 22장 무드 — 카드 전통 의미의 "먹는 기분" 번역.
const MAJOR_MOOD: readonly TarotMenuMood[] = [
  'adventurous', // 0 바보 — 새로운 시도
  'quick', // 1 마법사 — 재빠른 손
  'light', // 2 여사제 — 고요·절제
  'hearty', // 3 여황제 — 풍요
  'hearty', // 4 황제 — 든든한 정통
  'comfort', // 5 교황 — 전통·익숙함
  'festive', // 6 연인 — 함께
  'quick', // 7 전차 — 속도
  'hearty', // 8 힘 — 기운 보충
  'comfort', // 9 은둔자 — 혼자 조용히
  'adventurous', // 10 운명의 수레바퀴 — 우연에 맡김
  'light', // 11 정의 — 균형
  'light', // 12 매달린 사람 — 비움
  'adventurous', // 13 죽음 — 습관 끊기
  'light', // 14 절제 — 절제
  'festive', // 15 악마 — 유혹·탐닉
  'adventurous', // 16 탑 — 판을 뒤엎는 맛
  'light', // 17 별 — 맑음·회복
  'comfort', // 18 달 — 불안엔 익숙한 맛
  'festive', // 19 태양 — 활기·여럿이
  'comfort', // 20 심판 — 되찾는 옛 맛
  'festive', // 21 세계 — 완성·축하
];

const COURT_MOOD: Record<number, TarotMenuMood> = { 11: 'adventurous', 12: 'quick', 13: 'comfort', 14: 'hearty' };

export interface TarotCardAppetite {
  element: TarotElement;
  mood: TarotMenuMood | null;
  // 역방향으로 뒤집힌 기운인지(설명 문장용).
  flipped: boolean;
}

// 카드 한 장의 기운. 역방향은 반대 원소·반대 무드.
export const tarotCardAppetite = (card: TarotCard, reversed: boolean): TarotCardAppetite => {
  let mood: TarotMenuMood | null = null;
  if (card.arcana === 'major') mood = MAJOR_MOOD[card.number] ?? null;
  else if (card.number >= 11) mood = COURT_MOOD[card.number] ?? null;
  else if (card.number <= 3) mood = 'light';
  else if (card.number >= 8) mood = 'hearty';
  if (!reversed) return { element: card.element, mood, flipped: false };
  return { element: COMPLEMENT[card.element], mood: mood ? OPPOSITE_MOOD[mood] : null, flipped: true };
};

export const tarotAppetiteLabel = (a: TarotCardAppetite): string =>
  `${TAROT_ELEMENT_LABEL[a.element]}의 기운 — ${TAROT_MENU_ELEMENT_TASTE[a.element]}${a.mood ? `, ${TAROT_MENU_MOOD_LABEL[a.mood]}` : ''}`;

// ── 선택 ─────────────────────────────────────────────────────────────────────

export const TAROT_MENU_POSITIONS = ['mood', 'avoid', 'pick'] as const;
export type TarotMenuPosition = (typeof TAROT_MENU_POSITIONS)[number];
export const TAROT_MENU_PICK_COUNT = 3;

export interface TarotMenuSelection {
  // 첫 번째가 추천, 나머지는 대안. 항상 TAROT_MENU_PICK_COUNT 개.
  picks: TarotMenuItem[];
  // 자리별 기운(설명·프롬프트용). 자리 id → 기운.
  appetites: Record<TarotMenuPosition, TarotCardAppetite>;
  // "오늘은 ○○, ○○ 쪽" / "○○ 은 피하세요" 한 줄.
  profile: string;
  avoid: string;
}

const scoreOf = (item: TarotMenuItem, a: TarotCardAppetite, elementW: number, moodW: number): number =>
  (item.elements[a.element] ?? 0) * elementW + (a.mood && item.moods.includes(a.mood) ? moodW : 0);

// 카드 조합 → 시드(동점 가르기). 순서·역방향까지 포함.
const seedOf = (cards: readonly TarotDrawnCard[]): number => {
  let h = 2166136261;
  for (const c of cards) {
    for (const ch of `${c.cardId}:${c.reversed ? 'r' : 'u'};`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return h >>> 0;
};

// 메뉴 스프레드의 카드 3장(mood·avoid·pick 자리 순) → 후보. 자리 id 가 어긋나면 throw(호출자 버그).
export const selectTarotMenus = (cards: readonly TarotDrawnCard[]): TarotMenuSelection => {
  const byPos = new Map(cards.map((c) => [c.position, c]));
  const appetites = {} as Record<TarotMenuPosition, TarotCardAppetite>;
  for (const pos of TAROT_MENU_POSITIONS) {
    const drawn = byPos.get(pos);
    const card = drawn ? getTarotCard(drawn.cardId) : undefined;
    if (!drawn || !card) throw new Error(`tarot-menu: ${pos} 자리 카드가 없습니다`);
    appetites[pos] = tarotCardAppetite(card, drawn.reversed);
  }
  const rng = createSeededRng(seedOf(cards));
  const scored = TAROT_MENU_ITEMS.map((item) => ({
    item,
    score:
      scoreOf(item, appetites.pick, 3, 2) +
      scoreOf(item, appetites.mood, 1.5, 1) -
      scoreOf(item, appetites.avoid, 2, 1) +
      rng() * 0.75,
  })).sort((x, y) => y.score - x.score);

  // 상위부터 담되 조리형태·요리 계통이 이미 담긴 것과 겹치면 뒤로 미룬다. 못 채우면 겹침 허용.
  const picks: TarotMenuItem[] = [];
  const usedDish = new Set<string>();
  const usedCuisine = new Set<string>();
  for (const { item } of scored) {
    if (picks.length >= TAROT_MENU_PICK_COUNT) break;
    if (usedDish.has(item.dishType) || usedCuisine.has(item.cuisine)) continue;
    picks.push(item);
    usedDish.add(item.dishType);
    usedCuisine.add(item.cuisine);
  }
  for (const { item } of scored) {
    if (picks.length >= TAROT_MENU_PICK_COUNT) break;
    if (!picks.includes(item)) picks.push(item);
  }

  const pickA = appetites.pick;
  const moodA = appetites.mood;
  const profile =
    pickA.element === moodA.element
      ? `${TAROT_MENU_ELEMENT_TASTE[pickA.element]}${pickA.mood ? ` · ${TAROT_MENU_MOOD_LABEL[pickA.mood]}` : ''}`
      : `${TAROT_MENU_ELEMENT_TASTE[pickA.element]}, 곁들이면 ${TAROT_MENU_ELEMENT_TASTE[moodA.element]}${pickA.mood ? ` · ${TAROT_MENU_MOOD_LABEL[pickA.mood]}` : ''}`;
  // 피할 것은 원소 서술만 — 무드까지 붙이면 "든든한 밥과 고기 · 가볍게" 처럼 모순으로 읽힌다(점수에는 반영).
  const avoid = TAROT_MENU_ELEMENT_TASTE[appetites.avoid.element];
  return { picks, appetites, profile, avoid };
};
