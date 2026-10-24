import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@repo/shared';
import { mealFont, mealRadius } from './mealTokens';

// 식단 화면 공용 조각 — 섹션 카드, 선택 칩, 아이콘 버튼, 값 타일, 가로 막대.
// 테마 토큰만 쓰고 라이브러리는 들이지 않는다. 차트 라이브러리를 쓰지 않는 리포 관례상
// 분포 표시는 View 폭 계산 막대로 그린다.
//
// 화면 바탕은 theme.colors.bgGrouped(라이트는 연회색)이고, 그 위에 흰 MealSection 을 올려 칸을 나눈다.
// 테두리 대신 바탕색 차이로 칸을 나눠야 앱(iOS 그룹 목록)처럼 보인다. 글자·모서리 값은 mealTokens.ts.

export type MealIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

// 섹션 카드 — 흰 바탕·둥근 모서리, 테두리 없음.
export const MealSection = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => {
  const theme = useTheme();
  return <View style={[styles.section, { backgroundColor: theme.colors.surface }, style]}>{children}</View>;
};

export const MealSectionTitle = ({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string | null;
  right?: ReactNode;
}) => {
  const theme = useTheme();
  return (
    <View style={styles.titleRow}>
      <View style={styles.titleText}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        {sub ? (
          <Text style={[styles.sub, { color: theme.colors.textMuted }]} numberOfLines={3}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
};

export const Chip = ({
  label,
  selected,
  onPress,
  tone = 'default',
  disabled,
  icon,
  trailingIcon,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  icon?: MealIconName;
  trailingIcon?: MealIconName;
  accessibilityLabel?: string;
}) => {
  const theme = useTheme();
  const danger = tone === 'danger';
  const color = selected ? theme.colors.primaryText : danger ? theme.colors.danger : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
      {icon ? <MaterialCommunityIcons name={icon} size={15} color={color} /> : null}
      <Text style={[styles.chipText, { color }]}>{label}</Text>
      {trailingIcon ? <MaterialCommunityIcons name={trailingIcon} size={15} color={color} /> : null}
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

// 둥근 아이콘 버튼 — 달력 월 이동·필터 열기 등. badge 가 있으면 오른쪽 위에 숫자를 단다.
// 회색 바탕 위에선 흰 버튼(onSurface=false), 흰 섹션 안에선 회색 버튼(onSurface)으로 둔다.
export const MealIconButton = ({
  icon,
  onPress,
  accessibilityLabel,
  active,
  badge,
  size = 40,
  onSurface,
}: {
  icon: MealIconName;
  onPress: () => void;
  accessibilityLabel: string;
  active?: boolean;
  badge?: number;
  size?: number;
  onSurface?: boolean;
}) => {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        {
          width: size,
          height: size,
          backgroundColor: active
            ? theme.colors.primary
            : onSurface
              ? theme.colors.surfaceAlt
              : theme.colors.surface,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={Math.round(size * 0.5)}
        color={active ? theme.colors.primaryText : theme.colors.text}
      />
      {badge ? (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: theme.colors.danger,
              borderColor: onSurface ? theme.colors.surface : theme.colors.bgGrouped,
            },
          ]}
        >
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
};

// 값 타일 — 아이콘 + 라벨 + 큰 값(+보조). 섹션 안에서 회색 바탕으로 칸을 나눈다(테두리 없음).
export const StatTile = ({
  icon,
  label,
  value,
  sub,
}: {
  icon: MealIconName;
  label: string;
  value: string;
  sub?: string | null;
}) => {
  const theme = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: theme.colors.surfaceAlt }]}>
      <View style={styles.tileLabelRow}>
        <MaterialCommunityIcons name={icon} size={14} color={theme.colors.textMuted} />
        <Text style={[styles.tileLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      </View>
      <Text style={[styles.tileValue, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? (
        <Text style={[styles.tileLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
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
  section: { borderRadius: mealRadius.card, padding: 16, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleText: { flex: 1, gap: 3 },
  title: { fontSize: mealFont.headline, lineHeight: 22, fontWeight: '700' },
  sub: { fontSize: mealFont.footnote, lineHeight: 18 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: mealRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { fontSize: mealFont.footnote, fontWeight: '500' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldLabel: { fontSize: mealFont.footnote, fontWeight: '600' },
  iconButton: { borderRadius: mealRadius.pill, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: mealFont.caption, lineHeight: 14, fontWeight: '700' },
  tile: { flex: 1, minWidth: '45%', borderRadius: mealRadius.control, padding: 12, gap: 2 },
  tileLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tileLabel: { fontSize: mealFont.caption },
  tileValue: { fontSize: mealFont.number, lineHeight: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 84, fontSize: mealFont.caption },
  barTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barValue: { width: 38, fontSize: mealFont.caption, textAlign: 'right' },
});
