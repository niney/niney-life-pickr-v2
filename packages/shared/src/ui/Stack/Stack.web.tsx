import type { CSSProperties } from 'react';
import { useTheme } from '../../design/ThemeProvider.js';
import type { StackProps } from './Stack.types.js';

const alignMap = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
} as const;

const justifyMap = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
} as const;

export const Stack = ({
  direction = 'column',
  gap,
  align,
  justify,
  padding,
  fullWidth,
  flex,
  children,
}: StackProps) => {
  const theme = useTheme();
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: direction,
    gap: gap ? theme.space[gap] : undefined,
    alignItems: align ? alignMap[align] : undefined,
    justifyContent: justify ? justifyMap[justify] : undefined,
    padding: padding ? theme.space[padding] : undefined,
    width: fullWidth ? '100%' : undefined,
    flex,
  };
  return <div style={style}>{children}</div>;
};
