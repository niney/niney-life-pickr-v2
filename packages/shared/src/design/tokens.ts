export const palette = {
  amber500: '#f59e0b',
  amber600: '#d97706',
  zinc50: '#fafafa',
  zinc100: '#f4f4f5',
  zinc200: '#e4e4e7',
  zinc500: '#71717a',
  zinc700: '#3f3f46',
  zinc800: '#27272a',
  zinc900: '#18181b',
  zinc950: '#09090b',
  red500: '#ef4444',
  white: '#ffffff',
  black: '#000000',
} as const;

export const lightColors = {
  bg: palette.zinc50,
  surface: palette.white,
  surfaceAlt: palette.zinc100,
  text: palette.zinc900,
  textMuted: palette.zinc500,
  border: 'rgba(0,0,0,0.08)',
  primary: palette.amber500,
  primaryHover: palette.amber600,
  primaryText: palette.white,
  danger: palette.red500,
  dangerBg: 'rgba(239,68,68,0.08)',
} as const;

export type ColorTokens = { -readonly [K in keyof typeof lightColors]: string };

export const darkColors: ColorTokens = {
  bg: palette.zinc950,
  surface: palette.zinc900,
  surfaceAlt: palette.zinc800,
  text: palette.zinc50,
  textMuted: palette.zinc500,
  border: 'rgba(255,255,255,0.1)',
  primary: palette.amber500,
  primaryHover: palette.amber600,
  primaryText: palette.zinc950,
  danger: palette.red500,
  dangerBg: 'rgba(239,68,68,0.15)',
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

export type SpaceTokens = typeof space;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export type RadiusTokens = typeof radius;

export const typography = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700' as const },
  h1: { fontSize: 24, lineHeight: 32, fontWeight: '700' as const },
  h2: { fontSize: 20, lineHeight: 28, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
} as const;

export type TypographyTokens = typeof typography;

export const duration = {
  fast: 150,
  base: 200,
  slow: 300,
} as const;
