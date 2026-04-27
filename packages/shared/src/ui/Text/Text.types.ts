import type { ReactNode } from 'react';
import type { ColorTokens, TypographyTokens } from '../../design/tokens.js';

export type TextVariant = keyof TypographyTokens;
export type TextColor = keyof Pick<ColorTokens, 'text' | 'textMuted' | 'primary' | 'danger' | 'primaryText'>;

export interface TextProps {
  variant?: TextVariant;
  color?: TextColor;
  align?: 'left' | 'center' | 'right';
  children: ReactNode;
}
