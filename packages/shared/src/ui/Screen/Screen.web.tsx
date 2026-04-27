import type { CSSProperties } from 'react';
import { useTheme } from '../../design/ThemeProvider.js';
import type { ScreenProps } from './Screen.types.js';

export const Screen = ({ centered = true, maxWidth = 420, children }: ScreenProps) => {
  const theme = useTheme();
  const outer: CSSProperties = {
    minHeight: '100vh',
    backgroundColor: theme.colors.bg,
    display: 'flex',
    justifyContent: 'center',
    alignItems: centered ? 'center' : 'flex-start',
    padding: theme.space.lg,
  };
  const inner: CSSProperties = {
    width: '100%',
    maxWidth,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.space.lg,
  };
  return (
    <div style={outer}>
      <div style={inner}>{children}</div>
    </div>
  );
};
