import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { hikingDayLabel, hikingStartsFor, minToHm, useTheme } from '@repo/shared';
import { hapticSelection } from '~/lib/haptics';

// 산행 날짜·출발 시각 고르기(앱) — 오늘·내일·모레 칩 + ‹ 08:00 › 스텝퍼(30분 간격, 오늘은 지금 이후만). 웹은 칩 + select 다.
// 산행 조건 카드와 추천 입력이 같이 쓴다. 날짜를 바꿀 때 그날 고를 수 없는 시각이면 그날 가장 이른 시각으로 옮긴다.

export interface HikingDayStart {
  day: number;
  startMin: number;
}

interface Props {
  dates: readonly string[];
  value: HikingDayStart;
  // 처음 그린 시각(오늘 지난 시각 거르기) — 렌더 중 Date.now() 를 부르지 않게 부모가 잡아 둔다.
  openedAt: number;
  onChange: (next: HikingDayStart) => void;
  // 스텝퍼 오른쪽 덧붙임(예: "→ 15:40 하산").
  trailing?: ReactNode;
}

export const HikingDayStartPicker = ({ dates, value, openedAt, onChange, trailing }: Props) => {
  const theme = useTheme();
  const date = dates[value.day] ?? dates[0] ?? '';
  const starts = hikingStartsFor(date, value.day, openedAt);
  const at = starts.indexOf(value.startMin);
  const canPrev = at > 0;
  const canNext = at >= 0 && at < starts.length - 1;

  const selectDay = (i: number) => {
    const next = dates[i];
    if (next === undefined || i === value.day) return;
    const allowed = hikingStartsFor(next, i, openedAt);
    hapticSelection();
    onChange({ day: i, startMin: allowed.includes(value.startMin) ? value.startMin : (allowed[0] ?? value.startMin) });
  };
  const step = (delta: number) => {
    const m = starts[at + delta];
    if (m === undefined) return;
    hapticSelection();
    onChange({ day: value.day, startMin: m });
  };

  return (
    <>
      <View style={styles.days} accessibilityRole="radiogroup" accessibilityLabel="산행 날짜">
        {dates.map((d, i) => {
          const on = i === value.day;
          const disabled = hikingStartsFor(d, i, openedAt).length === 0;
          return (
            <Pressable
              key={d}
              onPress={() => selectDay(i)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled }}
              style={({ pressed }) => [
                styles.day,
                on
                  ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                  : { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.dayText, { color: on ? theme.colors.primaryText : theme.colors.text }]} numberOfLines={1}>
                {hikingDayLabel(d, i)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.startRow}>
        <Text style={[styles.startLabel, { color: theme.colors.textMuted }]}>출발</Text>
        <View style={[styles.stepper, { backgroundColor: theme.colors.surfaceAlt }]}>
          <Pressable
            onPress={() => step(-1)}
            disabled={!canPrev}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="출발 30분 앞당기기"
            style={({ pressed }) => [styles.stepBtn, { opacity: !canPrev ? 0.3 : pressed ? 0.5 : 1 }]}
          >
            <MaterialCommunityIcons name="chevron-left" size={20} color={theme.colors.text} />
          </Pressable>
          <Text style={[styles.startValue, { color: theme.colors.text }]} accessibilityLabel={`출발 ${minToHm(value.startMin)}`}>
            {minToHm(value.startMin)}
          </Text>
          <Pressable
            onPress={() => step(1)}
            disabled={!canNext}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="출발 30분 늦추기"
            style={({ pressed }) => [styles.stepBtn, { opacity: !canNext ? 0.3 : pressed ? 0.5 : 1 }]}
          >
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.text} />
          </Pressable>
        </View>
        {trailing}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 32, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 6 },
  dayText: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  startRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  startLabel: { fontSize: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, height: 34 },
  stepBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  startValue: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 46, textAlign: 'center' },
});
