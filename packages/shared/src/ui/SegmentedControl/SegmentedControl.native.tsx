import { Pressable, Text, View, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from '../../design/ThemeProvider.js';
import type { SegmentedControlProps } from './SegmentedControl.types.js';

export const SegmentedControl = <T extends string>({
  value,
  options,
  onChange,
  fullWidth = true,
}: SegmentedControlProps<T>) => {
  const theme = useTheme();

  const wrapperStyle: ViewStyle = {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    padding: 4,
    gap: 4,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
  };

  const itemStyle = (active: boolean): ViewStyle => ({
    flex: 1,
    backgroundColor: active ? theme.colors.surface : 'transparent',
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
  });

  const labelStyle = (active: boolean): TextStyle => ({
    color: active ? theme.colors.text : theme.colors.textMuted,
    fontWeight: active ? '600' : '500',
    fontSize: 14,
  });

  return (
    <View style={wrapperStyle}>
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          onPress={() => onChange(opt.value)}
          style={itemStyle(opt.value === value)}
        >
          <Text style={labelStyle(opt.value === value)}>{opt.label}</Text>
        </Pressable>
      ))}
    </View>
  );
};
