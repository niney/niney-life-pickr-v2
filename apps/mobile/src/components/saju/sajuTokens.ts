import { Platform } from 'react-native';
import { SAJU_BG, SAJU_GOLD, SAJU_INK_TEXT, SAJU_JUSA, SAJU_STONE, WUXING_COLOR } from '@repo/shared';
import type { Wuxing } from '@repo/utils';

// 사주(C) 네이티브 화면 색·글꼴 토큰 — 웹 사주 화면(항상 먹빛 "천문도" 팔레트)과 같은 값(@repo/shared sajuTheme).
// 앱 라이트/다크 테마와 무관하게 늘 어두운 무대라 테마 토큰 대신 고정 색이다. 컴포넌트는 sajuUi.tsx.

export const SJ = {
  bg: SAJU_BG,
  stone: SAJU_STONE,
  panel: '#121218',
  gold: SAJU_GOLD,
  jusa: SAJU_JUSA,
  ink: SAJU_INK_TEXT,
  cream: '#f3e9c6',
  salmon: '#ffb4a2',
  onJusa: '#f7eddc',
} as const;

const rgba = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
export const ink = (a: number): string => rgba(SAJU_INK_TEXT, a);
export const gold = (a: number): string => rgba(SAJU_GOLD, a);
export const salmon = (a: number): string => rgba('#ffb4a2', a);
export const jusa = (a: number): string => rgba(SAJU_JUSA, a);
export const white = (a: number): string => `rgba(255,255,255,${a})`;
/** 오행 색 + 투명도 — 칩 테두리 등. */
export const wuxingAlpha = (e: Wuxing, a: number): string => rgba(WUXING_COLOR[e], a);

/** 한자·제목용 명조. iOS 는 AppleMyungjo(한자 포함), Android 는 시스템 serif(Noto Serif CJK). */
export const SERIF = Platform.select({ ios: 'AppleMyungjo', android: 'serif', default: undefined });
