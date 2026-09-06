import { SAJU_WUXING_META, type Wuxing } from '@repo/utils';

// 사주 화면 공통 색·문구 — 타로(남색 밤하늘·금)와 구분되는 "천문도" 팔레트: 먹빛·한지·주사(朱砂)·금.
// 3D 조명·인장 색과 DOM 패널이 같은 값을 쓴다.

export const SAJU_BG = '#0b0b0f';
export const SAJU_STONE = '#15151c';
export const SAJU_HANJI = '#efe6d3';
export const SAJU_JUSA = '#b8322a';
export const SAJU_GOLD = '#d9b65b';
export const SAJU_INK_TEXT = '#e9e2d2';

export const WUXING_COLOR: Record<Wuxing, string> = {
  wood: SAJU_WUXING_META.wood.color,
  fire: SAJU_WUXING_META.fire.color,
  earth: SAJU_WUXING_META.earth.color,
  metal: SAJU_WUXING_META.metal.color,
  water: SAJU_WUXING_META.water.color,
};
// 먹빛 배경 위 글자용 — 금(金)은 회백이라 조금 밝게, 수(水)는 남색이라 조금 밝게.
export const WUXING_TEXT_COLOR: Record<Wuxing, string> = {
  wood: '#5fc39b',
  fire: '#ff6b4a',
  earth: '#e0b45a',
  metal: '#f0efe6',
  water: '#6f95d6',
};

export const SAJU_SOURCE_LABEL = { llm: 'AI 풀이', static: '기본 풀이', mixed: 'AI + 기본 풀이' } as const;

export const SAJU_DISCLAIMER = '재미로 보는 사주예요. 건강·법률·투자 판단은 전문가와 상의하세요.';
