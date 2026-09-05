// 타로 순수 유틸 — 스프레드·주제·뽑기·검증·이미지 경로. 카드 데이터는 tarotCards.ts.
// 뽑기는 클라이언트가 수행하고(부채꼴에서 직접 고르는 경험이 핵심, 결과에 이해관계 없음)
// 서버는 validateDrawnCards 로 같은 규칙으로 검증만 한다.

import { TAROT_CARDS, type TarotCard } from './tarotCards.js';

export const TAROT_CARD_BY_ID: ReadonlyMap<string, TarotCard> = new Map(
  TAROT_CARDS.map((c) => [c.id, c]),
);
export const getTarotCard = (id: string): TarotCard | undefined => TAROT_CARD_BY_ID.get(id);
export const isTarotCardId = (id: string): boolean => TAROT_CARD_BY_ID.has(id);

export const tarotOrientationLabel = (reversed: boolean): string => (reversed ? '역방향' : '정방향');
export const tarotCardKeywords = (card: TarotCard, reversed: boolean): readonly string[] =>
  reversed ? card.keywordsReversed : card.keywordsUpright;
export const tarotCardMeaning = (card: TarotCard, reversed: boolean): string =>
  reversed ? card.meaningReversed : card.meaningUpright;

// --- 주제 -------------------------------------------------------------------

export const TAROT_TOPICS = ['general', 'love', 'work', 'money', 'relationship', 'choice', 'food'] as const;
export type TarotTopic = (typeof TAROT_TOPICS)[number];

export const TAROT_TOPIC_LABEL: Record<TarotTopic, string> = {
  general: '전체 운',
  love: '연애',
  work: '일·공부',
  money: '돈',
  relationship: '인간관계',
  choice: '선택',
  food: '음식',
};

export const TAROT_QUESTION_MAX_LENGTH = 200;
// 선택 타로의 A/B 선택지 텍스트 상한.
export const TAROT_CHOICE_MAX_LENGTH = 40;

// --- 스프레드 ---------------------------------------------------------------

export interface TarotSpreadPosition {
  id: string;
  label: string;
  // LLM 프롬프트에 넣는 자리 의미. 정적 해석 템플릿에도 쓴다.
  hint: string;
}

export interface TarotSpread {
  id: TarotSpreadId;
  nameKo: string;
  description: string;
  positions: readonly TarotSpreadPosition[];
  // 회원 전용(켈틱 크로스).
  memberOnly: boolean;
  // v1 제공 여부 — false 면 UI 목록에서 숨기고 서버가 거부한다.
  available: boolean;
}

export const TAROT_SPREAD_IDS = ['daily', 'three-ppf', 'three-sar', 'choice', 'menu', 'celtic'] as const;
export type TarotSpreadId = (typeof TAROT_SPREAD_IDS)[number];

export const TAROT_SPREADS: Record<TarotSpreadId, TarotSpread> = {
  daily: {
    id: 'daily',
    nameKo: '오늘의 카드',
    description: '하루에 한 장. 오늘 하루의 흐름과 마음가짐을 봅니다.',
    positions: [{ id: 'today', label: '오늘', hint: '오늘 하루 전체의 흐름과 질문자가 지니면 좋을 마음가짐' }],
    memberOnly: false,
    available: true,
  },
  'three-ppf': {
    id: 'three-ppf',
    nameKo: '과거·현재·미래',
    description: '흐름을 시간순으로 읽는 가장 기본적인 세 장입니다.',
    positions: [
      { id: 'past', label: '과거', hint: '지금 상황을 만든 과거의 원인과 배경' },
      { id: 'present', label: '현재', hint: '지금 질문자가 처한 상황과 마음 상태' },
      { id: 'future', label: '미래', hint: '지금의 흐름이 이어질 때 다가올 가까운 미래' },
    ],
    memberOnly: false,
    available: true,
  },
  'three-sar': {
    id: 'three-sar',
    nameKo: '상황·조언·결과',
    description: '지금 상황을 진단하고, 무엇을 하면 좋을지, 그 결과까지 봅니다.',
    positions: [
      { id: 'situation', label: '상황', hint: '질문을 둘러싼 지금의 상황과 핵심 문제' },
      { id: 'advice', label: '조언', hint: '질문자가 지금 취하면 좋은 태도나 행동' },
      { id: 'outcome', label: '결과', hint: '조언을 따랐을 때 이르게 될 결과' },
    ],
    memberOnly: false,
    available: true,
  },
  choice: {
    id: 'choice',
    nameKo: '선택 타로',
    description: 'A 와 B, 두 갈래 중 어느 쪽인지. 각 선택의 흐름과 결정을 위한 조언을 봅니다.',
    positions: [
      { id: 'optionA', label: 'A 를 고르면', hint: 'A 선택지를 골랐을 때의 흐름과 결과' },
      { id: 'optionB', label: 'B 를 고르면', hint: 'B 선택지를 골랐을 때의 흐름과 결과' },
      { id: 'advice', label: '조언', hint: '결정을 내리기 위해 질문자가 봐야 할 핵심' },
    ],
    memberOnly: false,
    available: true,
  },
  // 메뉴 타로(v3) — 주제는 food 고정. 카드 기운 → 메뉴 후보 선택은 tarotMenu.ts.
  menu: {
    id: 'menu',
    nameKo: '메뉴 타로',
    description: '오늘 뭐 먹지? 세 장으로 입맛의 기운을 읽고 메뉴를 골라 드립니다.',
    positions: [
      { id: 'mood', label: '오늘의 입맛', hint: '지금 몸과 마음이 끌리는 맛의 기운' },
      { id: 'avoid', label: '피할 것', hint: '오늘은 피하는 편이 좋은 맛이나 먹는 방식' },
      { id: 'pick', label: '추천', hint: '오늘의 한 끼로 카드가 미는 맛의 방향' },
    ],
    memberOnly: false,
    available: true,
  },
  celtic: {
    id: 'celtic',
    nameKo: '켈틱 크로스',
    description: '열 장으로 상황의 안팎을 깊게 읽는 정통 스프레드입니다.',
    positions: [
      { id: 'present', label: '현재 상황', hint: '질문의 중심에 있는 현재 상황' },
      { id: 'challenge', label: '도전·장애', hint: '현재를 가로지르는 장애물이나 맞서야 할 과제' },
      { id: 'foundation', label: '근원', hint: '상황의 뿌리, 무의식적 배경' },
      { id: 'past', label: '과거', hint: '지나가고 있는 최근의 영향' },
      { id: 'goal', label: '목표·가능성', hint: '의식적으로 바라는 것, 최선의 가능성' },
      { id: 'future', label: '가까운 미래', hint: '곧 다가올 흐름' },
      { id: 'self', label: '나 자신', hint: '질문자의 태도와 자기 인식' },
      { id: 'environment', label: '주변 환경', hint: '주변 사람과 환경의 영향' },
      { id: 'hopes', label: '희망과 두려움', hint: '질문자가 바라면서도 두려워하는 것' },
      { id: 'outcome', label: '최종 결과', hint: '모든 흐름이 향하는 최종 결과' },
    ],
    memberOnly: true,
    available: false,
  },
};

export const TAROT_SPREAD_LIST: readonly TarotSpread[] = TAROT_SPREAD_IDS.map((id) => TAROT_SPREADS[id]);
export const TAROT_AVAILABLE_SPREADS: readonly TarotSpread[] = TAROT_SPREAD_LIST.filter((s) => s.available);
export const getTarotSpread = (id: string): TarotSpread | undefined =>
  (TAROT_SPREAD_IDS as readonly string[]).includes(id) ? TAROT_SPREADS[id as TarotSpreadId] : undefined;

// --- 난수·셔플·뽑기 ----------------------------------------------------------

// [0, 1) 난수원. 서비스는 Math.random, 테스트·재현은 createSeededRng.
export type TarotRng = () => number;

// mulberry32 — 작고 결정적인 32비트 시드 난수. 암호학적 용도 아님(뽑기에 이해관계 없음).
export const createSeededRng = (seed: number): TarotRng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// 역방향 확률. 50% 는 체감상 너무 어두워 30% 로 둔다(사용자 결정 2026-09-02).
export const TAROT_REVERSED_PROBABILITY = 0.3;

// 78장 id 를 Fisher–Yates 로 섞는다 — 부채꼴 배열 순서.
export const shuffleTarotDeck = (rng: TarotRng = Math.random): string[] => {
  const ids = TAROT_CARDS.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return ids;
};

export interface TarotDrawnCard {
  cardId: string;
  // 스프레드 자리 id(TarotSpreadPosition.id). 고른 순서대로 자리에 놓인다.
  position: string;
  reversed: boolean;
}

export interface BuildDrawnCardsOptions {
  reversedEnabled?: boolean;
  reversedProbability?: number;
  rng?: TarotRng;
}

// 고른 카드 id 를 스프레드 자리에 순서대로 배치하고 역방향을 굴린다.
// 장수가 스프레드와 다르면 호출자 버그이므로 throw.
export const buildDrawnCards = (
  spread: TarotSpread,
  pickedIds: readonly string[],
  opts: BuildDrawnCardsOptions = {},
): TarotDrawnCard[] => {
  if (pickedIds.length !== spread.positions.length) {
    throw new Error(`tarot: ${spread.id} 은 ${spread.positions.length}장인데 ${pickedIds.length}장을 받았습니다`);
  }
  const rng = opts.rng ?? Math.random;
  const enabled = opts.reversedEnabled ?? true;
  const p = opts.reversedProbability ?? TAROT_REVERSED_PROBABILITY;
  return spread.positions.map((pos, i) => ({
    cardId: pickedIds[i]!,
    position: pos.id,
    reversed: enabled && rng() < p,
  }));
};

// 아직 고르지 않은 카드 중 count 장을 무작위로 고른다("자동으로 뽑기"). 남은 장수보다
// 많이 요청하면 남은 만큼만.
export const pickRandomCards = (
  deckOrder: readonly string[],
  exclude: readonly string[],
  count: number,
  rng: TarotRng = Math.random,
): string[] => {
  const taken = new Set(exclude);
  const pool = deckOrder.filter((id) => !taken.has(id));
  const out: string[] = [];
  while (out.length < count && pool.length > 0) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
};

export type TarotDrawError = 'count_mismatch' | 'unknown_card' | 'duplicate_card' | 'position_mismatch';

// 서버·클라이언트 공통 검증. null 이면 유효.
export const validateDrawnCards = (
  spread: TarotSpread,
  cards: readonly TarotDrawnCard[],
): TarotDrawError | null => {
  if (cards.length !== spread.positions.length) return 'count_mismatch';
  const seen = new Set<string>();
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]!;
    if (!isTarotCardId(c.cardId)) return 'unknown_card';
    if (seen.has(c.cardId)) return 'duplicate_card';
    seen.add(c.cardId);
    if (c.position !== spread.positions[i]!.id) return 'position_mismatch';
  }
  return null;
};

// --- 이미지 -----------------------------------------------------------------

export const TAROT_IMAGE_SIZES = [512, 1024] as const;
export type TarotImageSize = (typeof TAROT_IMAGE_SIZES)[number];

// 7:12 에 가장 가까운 짝수 높이 — 뒷면 강제 대칭 처리 때 절반이 정수여야 한다.
// 512 는 3D 텍스처(뽑힌 카드만 지연 로드), 1024 는 DOM 해석 패널·공유 이미지.
export const TAROT_CARD_DIMENSIONS: Record<TarotImageSize, { width: number; height: number }> = {
  512: { width: 512, height: 878 },
  1024: { width: 1024, height: 1756 },
};
export const TAROT_CARD_ASPECT = 1024 / 1756;

// 웹 dist(apps/web/public) 기준 절대 경로. 앱은 API baseUrl 을 앞에 붙인다(thumbUrl 과 같은 방식).
export const TAROT_CARD_IMAGE_BASE = '/tarot/cards';
export const tarotCardImagePath = (cardId: string, size: TarotImageSize = 512): string =>
  `${TAROT_CARD_IMAGE_BASE}/${cardId}-${size}.webp`;
export const tarotCardBackImagePath = (size: TarotImageSize = 512): string =>
  `${TAROT_CARD_IMAGE_BASE}/back-${size}.webp`;
