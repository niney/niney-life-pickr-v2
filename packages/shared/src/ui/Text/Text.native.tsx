import { Text as RNText, type TextStyle } from 'react-native';
import { useTheme } from '../../design/ThemeProvider.js';
import type { TextProps } from './Text.types.js';

export const Text = ({ variant = 'body', color = 'text', align, children }: TextProps) => {
  const theme = useTheme();
  const t = theme.typography[variant];
  const style: TextStyle = {
    fontSize: t.fontSize,
    lineHeight: t.lineHeight,
    fontWeight: t.fontWeight,
    color: theme.colors[color],
    textAlign: align,
  };
  return <RNText style={style}>{children}</RNText>;
};
