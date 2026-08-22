import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { AirWeeklyForecastResultType } from '@repo/api-contract';
import { formatYmdWithWeekday, sortAirRegions } from '@repo/utils';
import { airGradeColorFromText } from '~/lib/airGradeColor';
import { AirGradeBadge } from './AirPrimitives';

// 초미세먼지 주간예보 — 발표일 기준 D+3~D+6, 권역 행 × 4일 칸(낮음/높음 2단계) + 대기질 전망 원문.

export const AirWeeklyCard = ({ data }: { data: AirWeeklyForecastResultType }) => {
  const theme = useTheme();
  if (!data.presentedAt || data.days.length === 0) {
    return (
      <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
        최근 발표된 주간예보가 없습니다. 주간예보는 매일 오후에 발표되며, 당일분이 없으면 전일분을 보여줍니다.
      </Text>
    );
  }
  const regionSet = new Map<string, true>();
  for (const d of data.days) for (const g of d.grades) regionSet.set(g.region, true);
  const regions = sortAirRegions([...regionSet.keys()].map((region) => ({ region }))).map((r) => r.region);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.outlook, { color: theme.colors.text }]}>
        <Text style={{ color: theme.colors.textMuted }}>발표 {data.presentedAt} · </Text>
        {data.outlook ?? '대기질 전망 원문이 없습니다.'}
      </Text>
      <View style={styles.headRow}>
        <Text style={[styles.regionCol, styles.headText, { color: theme.colors.textMuted }]}>권역</Text>
        {data.days.map((d) => (
          <View key={d.date} style={styles.dayCol}>
            <Text style={[styles.headText, { color: theme.colors.text }]} numberOfLines={1}>
              {formatYmdWithWeekday(d.date)}
            </Text>
            {d.reliability ? <Text style={[styles.rel, { color: theme.colors.textMuted }]}>신뢰도 {d.reliability}</Text> : null}
          </View>
        ))}
      </View>
      {regions.map((region, idx) => (
        <View key={region} style={[styles.row, { borderTopColor: theme.colors.border, borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth }]}>
          <Text style={[styles.regionCol, { color: theme.colors.text }]} numberOfLines={1}>
            {region}
          </Text>
          {data.days.map((d) => {
            const g = d.grades.find((x) => x.region === region)?.grade ?? null;
            const c = airGradeColorFromText(g);
            return (
              <View key={d.date} style={styles.dayCol}>
                <View style={[styles.cell, { backgroundColor: c.tint }]}>
                  <View style={[styles.dot, { backgroundColor: c.hex }]} />
                  <Text style={[styles.cellText, { color: theme.colors.text }]}>{g ?? '-'}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        <Text style={[styles.rel, { color: theme.colors.textMuted }]}>2단계 등급</Text>
        <AirGradeBadge text="낮음" />
        <Text style={[styles.rel, { color: theme.colors.textMuted }]}>보통 이하</Text>
        <AirGradeBadge text="높음" />
        <Text style={[styles.rel, { color: theme.colors.textMuted }]}>나쁨 이상 가능</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 12, lineHeight: 19 },
  outlook: { fontSize: 13, lineHeight: 19 },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingBottom: 4 },
  headText: { fontSize: 11, fontWeight: '600' },
  regionCol: { width: 64, fontSize: 12 },
  dayCol: { flex: 1, gap: 2 },
  rel: { fontSize: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  cell: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 6, height: 26 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  cellText: { fontSize: 11, fontWeight: '600' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
});
