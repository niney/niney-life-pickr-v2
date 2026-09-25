import { Platform } from 'react-native';
import { TAROT_BG, TAROT_GOLD, TAROT_INK } from '@repo/shared';

// 타로 네이티브 화면 팔레트 — 웹 타로(남색 밤하늘 + 금선)와 같은 값. 기본 색은 shared tarotTheme 에서.

const rgba = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export const TR = {
  bg: TAROT_BG,
  bg2: '#1a2358',
  panel: '#0b1030',
  gold: TAROT_GOLD,
  goldHi: '#e6c86f',
  onGold: '#1a1408',
  cream: '#f3e9c6',
  ink: TAROT_INK,
  coral: '#ffb4a2',
} as const;

export const ink = (a: number): string => rgba(TAROT_INK, a);
export const gold = (a: number): string => rgba(TAROT_GOLD, a);
export const coral = (a: number): string => rgba('#ffb4a2', a);
export const white = (a: number): string => `rgba(255,255,255,${a})`;

export const SERIF = Platform.select({ ios: 'AppleMyungjo', android: 'serif', default: undefined });

/** 카드 비율 7:12(1024×1756). */
export const CARD_RATIO = 1756 / 1024;
