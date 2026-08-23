import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMealCalendar, useMealEntries, useTheme, type Theme } from '@repo/shared';
import { MEAL_SLOT_LABEL, MEAL_SLOT_ORDER, monthRange, toLocalMonthKey } from '@repo/utils';
import { Card, CardTitle, StateBlock } from '~/components/common/Cards';
import { Chip } from './mealUi';
import { MealEntryCard } from './MealEntryCard';

// 달력 — 월 그리드(끼니 점) + 날짜 선택 시 그날 기록. 라이브러리 없이 7열 그리드를 직접 그린다.

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const shiftMonth = (month: string, delta: number): string => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y!, (m ?? 1) - 1 + delta, 1);
  return toLocalMonthKey(d);
};

export const MealCalendarView = ({ onOpenEntry }: { onOpenEntry: (id: string) => void }) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [month, setMonth] = useState(() => toLocalMonthKey(new Date()));
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useMealCalendar(month);
  const dayEntries = useMealEntries(
    selected ? { from: selected, to: selected, limit: 20 } : {},
    selected !== null,
  );

  const shift = (delta: number) => {
    setMonth(shiftMonth(month, delta));
    setSelected(null);
  };

  // 월 그리드 — 1일의 요일만큼 앞을 비우고 말일까지 채운다.
  const cells = useMemo(() => {
    const range = monthRange(month);
    if (!range) return [];
    const [y, m] = month.split('-').map(Number);
    const first = new Date(y!, (m ?? 1) - 1, 1);
    const lastDay = new Date(y!, m ?? 1, 0).getDate();
    const lead = first.getDay();
    const out: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= lastDay; d += 1) {
      out.push(`${month}-${`${d}`.padStart(2, '0')}`);
    }
    return out;
  }, [month]);

  const byDate = useMemo(() => new Map((data?.days ?? []).map((d) => [d.date, d])), [data]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Card>
        <View style={styles.monthRow}>
          <Chip label="◀" onPress={() => shift(-1)} />
          <Text style={styles.monthText}>{month.replace('-', '년 ')}월</Text>
          <Chip label="▶" onPress={() => shift(1)} />
        </View>

        {isLoading ? (
          <StateBlock kind="loading" />
        ) : error ? (
          <StateBlock kind="error" message="달력을 불러오지 못했습니다." onRetry={() => void refetch()} retrying={isFetching} />
        ) : (
          <>
            <View style={styles.weekRow}>
              {WEEKDAYS.map((w) => (
                <Text key={w} style={styles.weekday}>
                  {w}
                </Text>
              ))}
            </View>
            <View style={styles.grid}>
              {cells.map((date, i) => {
                const info = date ? byDate.get(date) : undefined;
                const isSelected = date !== null && date === selected;
                return (
                  <Pressable
                    key={date ?? `pad-${i}`}
                    accessibilityRole="button"
                    accessibilityLabel={date ?? undefined}
                    disabled={!date}
                    onPress={() => setSelected(isSelected ? null : date)}
                    style={[
                      styles.cell,
                      isSelected && { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.primary },
                    ]}
                  >
                    {date ? (
                      <>
                        <Text style={[styles.dayNum, { color: info ? theme.colors.text : theme.colors.textMuted }]}>
                          {Number(date.slice(-2))}
                        </Text>
                        <View style={styles.dots}>
                          {(info?.slots ?? [])
                            .slice()
                            .sort((a, b) => MEAL_SLOT_ORDER[a] - MEAL_SLOT_ORDER[b])
                            .slice(0, 3)
                            .map((s) => (
                              <View key={s} style={[styles.dot, { backgroundColor: theme.colors.primary }]} />
                            ))}
                        </View>
                      </>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </Card>

      {selected ? (
        <Card>
          <CardTitle
            title={`${selected} 기록`}
            sub={
              byDate.get(selected)
                ? `${byDate.get(selected)!.count}끼 · ${byDate
                    .get(selected)!
                    .slots.map((s) => MEAL_SLOT_LABEL[s])
                    .join('·')}`
                : '기록 없음'
            }
          />
          {dayEntries.isLoading ? (
            <StateBlock kind="loading" />
          ) : (dayEntries.data?.items.length ?? 0) === 0 ? (
            <StateBlock kind="empty" message="이 날은 기록이 없어요." />
          ) : (
            <View style={styles.dayList}>
              {dayEntries.data!.items.map((e) => (
                <MealEntryCard key={e.id} entry={e} onPress={() => onOpenEntry(e.id)} />
              ))}
            </View>
          )}
        </Card>
      ) : null}
    </ScrollView>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 16, gap: 12 },
    monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    monthText: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
    weekRow: { flexDirection: 'row' },
    weekday: { flex: 1, textAlign: 'center', fontSize: 11, color: theme.colors.textMuted },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'transparent',
      borderRadius: 8,
    },
    dayNum: { fontSize: 13 },
    dots: { flexDirection: 'row', gap: 2, height: 5 },
    dot: { width: 4, height: 4, borderRadius: 2 },
    dayList: { gap: 8 },
  });
