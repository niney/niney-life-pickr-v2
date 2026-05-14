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

  // fullWidth=true → 각 아이템이 flex:1 로 컨테이너를 균등 분할 (웹의
  // grid-template-columns: repeat(N, 1fr) 와 동일).
  // fullWidth=false → flex 안 주고 content(텍스트+패딩) 너비로 줄어들게 둔다
  // (웹의 width:undefined + 1fr 컬럼이 content 로 수축하는 동작과 매칭).
  const itemStyle = (active: boolean): ViewStyle => ({
    ...(fullWidth ? { flex: 1 } : null),
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
