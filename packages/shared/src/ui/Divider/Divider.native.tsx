import { Text, View } from 'react-native';
import { useTheme } from '../../design/ThemeProvider.js';
import type { DividerProps } from './Divider.types.js';

export const Divider = ({ label }: DividerProps) => {
  const theme = useTheme();
  if (!label) {
    return (
      <View style={{ height: 1, backgroundColor: theme.colors.border, alignSelf: 'stretch' }} />
    );
  }
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.md,
        alignSelf: 'stretch',
      }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
      <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
    </View>
  );
};
