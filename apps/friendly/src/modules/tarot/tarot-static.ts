import type {
  TarotCardReadingType,
  TarotChoiceVerdictType,
  TarotChoicesType,
  TarotTopicType,
} from '@repo/api-contract';
import {
  tarotCardKeywords,
  tarotCardMeaning,
  tarotOrientationLabel,
  type TarotSpread,
} from '@repo/utils';
import type { TarotPromptCard } from './tarot.prompts.js';

// 정적 해석 — LLM 이 없거나(키 미설정) 실패하거나 한도를 넘었을 때. 카드의 정적 의미(정·역)를
// 자리 라벨·주제 문구와 조립한다. 화면은 절대 비지 않는다(docs/PLAN-tarot.md).

export interface TarotStaticReading {
  cards: TarotCardReadingType[];
  summary: string;
  advice: string;
  keyword: string;
  choice: TarotChoiceVerdictType | null;
}

const TOPIC_FRAME: Record<TarotTopicType, string> = {
  general: '전체적인 흐름',
  love: '연애와 마음의 흐름',
  work: '일과 공부의 흐름',
  money: '돈과 관련된 흐름',
  relationship: '사람 사이의 흐름',
  choice: '선택을 둘러싼 흐름',
};

// "다."로 끝나는 두 문장 중 두 번째(조언 성격) — 없으면 전체.
const secondSentence = (meaning: string): string => {
  const parts = meaning.split(/(?<=\.)\s+/);
  return parts.length >= 2 ? parts.slice(1).join(' ') : meaning;
};

const cardLabel = (c: TarotPromptCard): string =>
  `${c.card.nameKo}${c.drawn.reversed ? ' 역방향' : ''}`;

export const buildStaticReading = (
  spread: TarotSpread,
  topic: TarotTopicType,
  cards: readonly TarotPromptCard[],
  choices: TarotChoicesType | null,
): TarotStaticReading => {
  const readings: TarotCardReadingType[] = cards.map((c) => ({
    cardId: c.card.id,
    position: c.drawn.position,
    positionLabel: c.positionLabel,
    reversed: c.drawn.reversed,
    nameKo: c.card.nameKo,
    nameEn: c.card.nameEn,
    keywords: [...tarotCardKeywords(c.card, c.drawn.reversed)],
    text: `${c.positionLabel} 자리의 카드는 ${c.card.nameKo}(${tarotOrientationLabel(c.drawn.reversed)})입니다. ${tarotCardMeaning(c.card, c.drawn.reversed)}`,
  }));

  // 조언 자리가 있으면 그 카드, 없으면 마지막 카드가 조언·키워드의 근거.
  const adviceCard = cards.find((c) => c.drawn.position === 'advice') ?? cards[cards.length - 1]!;
  const keywords = tarotCardKeywords(adviceCard.card, adviceCard.drawn.reversed);
  const keyword = keywords[0] ?? adviceCard.card.nameKo;

  const allKeywords = Array.from(
    new Set(cards.flatMap((c) => tarotCardKeywords(c.card, c.drawn.reversed).slice(0, 2))),
  ).slice(0, 6);
  const summary =
    cards.length === 1
      ? `오늘의 카드는 ${cardLabel(adviceCard)}입니다. ${TOPIC_FRAME[topic]}은 '${allKeywords.join(', ')}' 이라는 말로 요약할 수 있습니다. 카드의 의미를 하루 동안 마음에 두고 지내 보세요.`
      : `이번 리딩은 ${cards.map((c) => `${c.positionLabel}의 ${cardLabel(c)}`).join(', ')} 조합입니다. ${TOPIC_FRAME[topic]}은 '${allKeywords.join(', ')}' 으로 이어집니다. 자리 순서대로 카드 의미를 따라가면 지금 상황의 맥락이 보입니다.`;

  const advice = `특히 ${adviceCard.positionLabel} 자리의 ${cardLabel(adviceCard)}에 주목하세요. ${secondSentence(tarotCardMeaning(adviceCard.card, adviceCard.drawn.reversed))}`;

  return {
    cards: readings,
    summary,
    advice,
    keyword,
    choice: spread.id === 'choice' && choices ? staticChoiceVerdict(cards, adviceCard, keyword) : null,
  };
};

// 선택 타로 정적 판정 — 정·역 방향만으로 가른다. 같은 방향이면 우열 없음(either, 낮은 확신).
const staticChoiceVerdict = (
  cards: readonly TarotPromptCard[],
  adviceCard: TarotPromptCard,
  keyword: string,
): TarotChoiceVerdictType => {
  const a = cards.find((c) => c.drawn.position === 'optionA');
  const b = cards.find((c) => c.drawn.position === 'optionB');
  if (a && b && a.drawn.reversed !== b.drawn.reversed) {
    const pick = a.drawn.reversed ? 'B' : 'A';
    const picked = pick === 'A' ? a : b;
    const other = pick === 'A' ? b : a;
    return {
      recommended: pick,
      confidence: 'mid',
      reason: `${pick} 자리의 ${picked.card.nameKo}는 정방향으로 '${tarotCardKeywords(picked.card, false)[0]}'을 말하고, 다른 쪽의 ${other.card.nameKo}는 역방향으로 '${tarotCardKeywords(other.card, true)[0]}'을 경고합니다.`,
    };
  }
  return {
    recommended: 'either',
    confidence: 'low',
    reason: `두 카드의 방향이 같아 카드만으로 우열을 가리기 어렵습니다. 조언 카드 ${adviceCard.card.nameKo}가 가리키는 '${keyword}'를 기준으로 판단해 보세요.`,
  };
};
