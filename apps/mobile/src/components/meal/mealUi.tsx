import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@repo/shared';

// 식단 화면 공용 조각 — 선택 칩, 칩 줄, 섹션 제목, 가로 막대. 날씨·대기의 Cards.tsx 와 같은
// 결(테마 토큰만 사용, 라이브러리 없음)을 따른다. 차트 라이브러리를 쓰지 않는 리포 관례상
// 분포 표시는 View 폭 계산 막대로 그린다.

export const Chip = ({
  label,
  selected,
  onPress,
  tone = 'default',
  disabled,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}) => {
  const theme = useTheme();
  const danger = tone === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          backgroundColor: selected ? theme.colors.primary : 'transparent',
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          {
            color: selected
              ? theme.colors.primaryText
              : danger
                ? theme.colors.danger
                : theme.colors.text,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

export const ChipRow = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[styles.chipRow, style]}>{children}</View>
);

export const FieldLabel = ({ children }: { children: ReactNode }) => {
  const theme = useTheme();
  return <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>{children}</Text>;
};

// 가로 막대 — 분포 표시. value/max 비율로 폭을 잡고 라벨·수치를 양옆에 둔다.
export const BarRow = ({
  label,
  value,
  max,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
}) => {
  const theme = useTheme();
  const ratio = max > 0 ? Math.max(0.02, value / max) : 0;
  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, { color: theme.colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.barTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
        <View style={[styles.barFill, { backgroundColor: theme.colors.primary, width: `${ratio * 100}%` }]} />
      </View>
      <Text style={[styles.barValue, { color: theme.colors.textMuted }]}>
        {value}
        {suffix ?? ''}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: { fontSize: 13, fontWeight: '500' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '600' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 84, fontSize: 12 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barValue: { width: 38, fontSize: 11, textAlign: 'right' },
});
