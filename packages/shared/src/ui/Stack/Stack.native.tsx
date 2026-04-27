import { View, type ViewStyle } from 'react-native';
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
  const style: ViewStyle = {
    flexDirection: direction,
    gap: gap ? theme.space[gap] : undefined,
    alignItems: align ? alignMap[align] : undefined,
    justifyContent: justify ? justifyMap[justify] : undefined,
    padding: padding ? theme.space[padding] : undefined,
    alignSelf: fullWidth ? 'stretch' : undefined,
    flex,
  };
  return <View style={style}>{children}</View>;
};
