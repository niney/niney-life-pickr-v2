// 상세 화면 전용 의미 색상. theme.colors 의 기본 토큰에 없는 sentiment 색을
// 한 곳에 모은다. 웹 (emerald-500/rose-500/amber-400/zinc-400) 톤 매칭.
export const SENTIMENT_COLORS = {
  positive: '#10b981',
  negative: '#f43f5e',
  neutral: '#a1a1aa',
  mixed: '#f59e0b',
} as const;

export const POSITIVE_BG = 'rgba(16, 185, 129, 0.15)';
export const NEGATIVE_BG = 'rgba(244, 63, 94, 0.15)';
export const MIXED_BG = 'rgba(245, 158, 11, 0.15)';
export const NEUTRAL_BG = 'rgba(161, 161, 170, 0.15)';

export const STAR = '#d97706';
