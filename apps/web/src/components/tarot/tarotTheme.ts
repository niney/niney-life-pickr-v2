import type { TarotElement } from '@repo/utils';

// 타로 화면 공통 색·문구. 3D 조명색과 DOM 오버레이가 같은 팔레트를 쓴다.

export const TAROT_BG = '#05071a';
export const TAROT_GOLD = '#d9b65b';
export const TAROT_INK = '#ece6d6';

// 수트 원소별 림 라이트 색 — 마지막으로 뒤집힌 카드의 원소를 따른다.
export const ELEMENT_COLOR: Record<TarotElement, string> = {
  fire: '#ff8a4c',
  water: '#5cc8ff',
  air: '#d9def5',
  earth: '#9bd67a',
};

export const TAROT_SOURCE_LABEL = { llm: 'AI 해석', static: '카드 기본 해석' } as const;

export const TAROT_DISCLAIMER = '재미로 보는 타로예요. 의료·법률·투자 판단은 전문가와 상의하세요.';
