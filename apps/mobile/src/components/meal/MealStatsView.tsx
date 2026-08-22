import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMealStats, useTheme, type Theme } from '@repo/shared';
import { toLocalDateKey } from '@repo/utils';
import { Card, CardTitle, StateBlock, Tile } from '~/components/common/Cards';
import { BarRow, Chip, ChipRow } from './mealUi';

// 통계 — 기간(1주/1달/3달) 전환 + 분포 막대 + 많이 먹은 음식 + 날짜별 끼니 수.
// 차트 라이브러리를 쓰지 않는 리포 관례대로 View 폭 계산 막대로만 그린다.

const RANGES = [
  { key: '7', label: '1주', days: 7 },
  { key: '30', label: '1달', days: 30 },
  { key: '90', label: '3달', days: 90 },
] as const;

const shift = (days: number): { from: string; to: string } => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return { from: toLocalDateKey(from), to: toLocalDateKey(to) };
};

export const MealStatsView = () => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [rangeKey, setRangeKey] = useState<(typeof RANGES)[number]['key']>('30');
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1];
  const { from, to } = useMemo(() => shift(range.days), [range.days]);
  const { data, isLoading, error, refetch, isFetching } = useMealStats(from, to);

  if (isLoading) return <StateBlock kind="loading" />;
  if (error) return <StateBlock kind="error" message="통계를 불러오지 못했습니다." onRetry={() => void refetch()} retrying={isFetching} />;
  if (!data) return <StateBlock kind="empty" />;

  const maxDish = Math.max(1, ...data.byDishType.map((b) => b.count));
  const maxIngredient = Math.max(1, ...data.byMainIngredient.map((b) => b.count));
  const maxCuisine = Math.max(1, ...data.byCuisine.map((b) => b.count));
  const maxDay = Math.max(1, ...data.byDate.map((d) => d.count));

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ChipRow>
        {RANGES.map((r) => (
          <Chip key={r.key} label={r.label} selected={rangeKey === r.key} onPress={() => setRangeKey(r.key)} />
        ))}
      </ChipRow>

      <Card>
        <CardTitle title="한눈에" sub={`${data.from} ~ ${data.to}`} />
        <View style={styles.tiles}>
          <Tile icon="silverware-fork-knife" label="기록" value={`${data.entryCount}끼`} sub={`${data.recordedDays}/${data.totalDays}일`} />
          <Tile icon="fire" label="연속" value={`${data.streakDays}일`} sub="기록한 날" />
          <Tile icon="repeat" label="겹침" value={`${Math.round(data.repeatRate * 100)}%`} sub="7일 내 재등장" />
          {data.nutrition.avgKcalPerDay !== null ? (
            <Tile
              icon="fire-circle"
              label="하루 평균"
              value={`${Math.round(data.nutrition.avgKcalPerDay).toLocaleString('ko-KR')}kcal`}
              sub={`기록한 날 기준 · ${Math.round(data.nutrition.coverage * 100)}% 반영`}
            />
          ) : null}
        </View>
        {data.nutrition.avgKcalPerDay !== null && data.nutrition.coverage < 1 ? (
          <Text style={styles.coverageNote}>
            영양 정보가 있는 음식만 더한 값이라 실제보다 적게 나와요(외식 브랜드 메뉴는 공개된 값이 없어요).
          </Text>
        ) : null}
      </Card>

      {data.entryCount === 0 ? (
        <Card>
          <StateBlock kind="empty" message="이 기간에는 기록이 없어요." />
        </Card>
      ) : (
        <>
          <Card>
            <CardTitle title="무엇을 먹었나" sub="조리 형태 (주식 기준)" />
            {data.byDishType.slice(0, 8).map((b) => (
              <BarRow key={b.key} label={b.label} value={b.count} max={maxDish} />
            ))}
          </Card>

          <Card>
            <CardTitle title="주재료" />
            {data.byMainIngredient.slice(0, 8).map((b) => (
              <BarRow key={b.key} label={b.label} value={b.count} max={maxIngredient} />
            ))}
          </Card>

          <Card>
            <CardTitle title="요리 계통" />
            {data.byCuisine.slice(0, 6).map((b) => (
              <BarRow key={b.key} label={b.label} value={b.count} max={maxCuisine} />
            ))}
          </Card>

          <Card>
            <CardTitle title="자주 먹은 음식" sub="같은 이름끼리 묶었어요" />
            {data.topFoods.length === 0 ? (
              <Text style={styles.muted}>아직 반복된 음식이 없어요.</Text>
            ) : (
              data.topFoods.map((f) => (
                <View key={f.name} style={styles.topRow}>
                  <Text style={styles.topName} numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Text style={styles.topMeta}>
                    {f.count}회 · 마지막 {f.lastEatenDate.slice(5)}
                  </Text>
                </View>
              ))
            )}
          </Card>

          <Card>
            <CardTitle title="날짜별 끼니 수" />
            <View style={styles.dayBars}>
              {data.byDate.map((d) => (
                <View key={d.date} style={styles.dayBarCol}>
                  <View
                    style={[
                      styles.dayBar,
                      {
                        height: Math.max(2, (d.count / maxDay) * 48),
                        backgroundColor: d.count > 0 ? theme.colors.primary : theme.colors.surfaceAlt,
                      },
                    ]}
                  />
                </View>
              ))}
            </View>
            <View style={styles.dayAxis}>
              <Text style={styles.muted}>{data.byDate[0]?.date.slice(5)}</Text>
              <Text style={styles.muted}>{data.byDate[data.byDate.length - 1]?.date.slice(5)}</Text>
            </View>
          </Card>
        </>
      )}
    </ScrollView>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 16, gap: 12 },
    tiles: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    coverageNote: { marginTop: 8, fontSize: 11, color: theme.colors.textMuted, lineHeight: 16 },
    muted: { fontSize: 12, color: theme.colors.textMuted },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
    topName: { flex: 1, fontSize: 14, color: theme.colors.text },
    topMeta: { fontSize: 11, color: theme.colors.textMuted },
    dayBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 52 },
    dayBarCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
    dayBar: { width: '100%', borderRadius: 2 },
    dayAxis: { flexDirection: 'row', justifyContent: 'space-between' },
  });
