import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMealCalendar, useMealEntries, useTheme, type Theme } from '@repo/shared';
import {
  MEAL_SLOT_LABEL,
  MEAL_SLOT_ORDER,
  mealDateTitle,
  monthRange,
  toLocalDateKey,
  toLocalMonthKey,
} from '@repo/utils';
import { StateBlock } from '~/components/common/Cards';
import { MealEntryCard } from './MealEntryCard';
import { MealIconButton, MealSection, MealSectionTitle } from './mealUi';
import { mealFont, mealRadius, useMealFabInsets } from './mealTokens';

// 달력 — 월 그리드(끼니 점) + 날짜 선택 시 그날 기록. 라이브러리 없이 7열 그리드를 직접 그린다.
// 오늘은 숫자를 주황 원으로, 고른 날은 회색 칸으로 표시한다. 그날 기록은 섹션 안의 줄로 보인다(카드 안 카드 X).

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const shiftMonth = (month: string, delta: number): string => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y!, (m ?? 1) - 1 + delta, 1);
  return toLocalMonthKey(d);
};

export const MealCalendarView = ({ onOpenEntry }: { onOpenEntry: (id: string) => void }) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { contentBottom } = useMealFabInsets();
  const today = toLocalDateKey(new Date());
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
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: contentBottom }]}
      showsVerticalScrollIndicator={false}
    >
      <MealSection>
        <View style={styles.monthRow}>
          <MealIconButton icon="chevron-left" accessibilityLabel="이전 달" onSurface onPress={() => shift(-1)} />
          <Text style={styles.monthText}>{`${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`}</Text>
          <MealIconButton icon="chevron-right" accessibilityLabel="다음 달" onSurface onPress={() => shift(1)} />
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
                const isToday = date === today;
                return (
                  <Pressable
                    key={date ?? `pad-${i}`}
                    accessibilityRole="button"
                    accessibilityLabel={date ? `${mealDateTitle(date, today)}${info ? `, ${info.count}끼` : ''}` : undefined}
                    accessibilityState={{ selected: isSelected }}
                    disabled={!date}
                    onPress={() => setSelected(isSelected ? null : date)}
                    style={[styles.cell, isSelected && { backgroundColor: theme.colors.surfaceAlt }]}
                  >
                    {date ? (
                      <>
                        <View style={[styles.dayCircle, isToday && { backgroundColor: theme.colors.primary }]}>
                          <Text
                            style={[
                              styles.dayNum,
                              {
                                color: isToday
                                  ? theme.colors.primaryText
                                  : info
                                    ? theme.colors.text
                                    : theme.colors.textMuted,
                                fontWeight: isToday || info ? '600' : '400',
                              },
                            ]}
                          >
                            {Number(date.slice(-2))}
                          </Text>
                        </View>
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
      </MealSection>

      {selected ? (
        <MealSection>
          <MealSectionTitle
            title={mealDateTitle(selected, today)}
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
            <View>
              {dayEntries.data!.items.map((e, i) => (
                <View key={e.id} style={i > 0 ? styles.divider : null}>
                  <MealEntryCard entry={e} variant="row" onPress={() => onOpenEntry(e.id)} />
                </View>
              ))}
            </View>
          )}
        </MealSection>
      ) : null}
    </ScrollView>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 16, gap: 12 },
    monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    monthText: { fontSize: mealFont.title, fontWeight: '700', color: theme.colors.text },
    weekRow: { flexDirection: 'row' },
    weekday: { flex: 1, textAlign: 'center', fontSize: mealFont.caption, color: theme.colors.textMuted },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    // 칸 높이는 고정 — 퍼센트 폭 + aspectRatio 는 Yoga 가 그리드 높이를 칸보다 크게 잡아 아래에 빈 줄이 남았다.
    cell: {
      width: `${100 / 7}%`,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      borderRadius: mealRadius.small,
    },
    dayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    dayNum: { fontSize: mealFont.body, fontVariant: ['tabular-nums'] },
    dots: { flexDirection: 'row', gap: 2, height: 5 },
    dot: { width: 4, height: 4, borderRadius: 2 },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  });
