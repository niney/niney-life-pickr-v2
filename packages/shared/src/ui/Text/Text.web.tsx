import type { CSSProperties } from 'react';
import { useTheme } from '../../design/ThemeProvider.js';
import type { TextProps } from './Text.types.js';

export const Text = ({ variant = 'body', color = 'text', align, children }: TextProps) => {
  const theme = useTheme();
  const t = theme.typography[variant];
  const style: CSSProperties = {
    fontSize: t.fontSize,
    lineHeight: `${t.lineHeight}px`,
    fontWeight: t.fontWeight,
    color: theme.colors[color],
    textAlign: align,
    margin: 0,
  };
  const Tag = variant === 'display' || variant === 'h1' ? 'h1' : variant === 'h2' ? 'h2' : 'p';
  return <Tag style={style}>{children}</Tag>;
};
