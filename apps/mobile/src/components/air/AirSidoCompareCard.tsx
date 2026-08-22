import { StyleSheet, Text, View } from 'react-native';
import { SegmentedControl, useTheme } from '@repo/shared';
import type { AirMeasureItemType } from '@repo/api-contract';
import { AIR_SIDO_OPTIONS, airGradeFromValue, airSidoMatches, formatAirValue } from '@repo/utils';
import { airGradeColor } from '~/lib/airGradeColor';

// 전국 시도 비교 — '전국' 응답을 시도별 평균으로 접어 막대로. 2026-07 광주·전남 통합 이후 업스트림이
// 두 지역을 '전남광주' 한 라벨로 준다(AIR_SIDO_OPTIONS 에 같은 값).

type Metric = 'pm25' | 'pm10';

interface Props {
  items: AirMeasureItemType[];
  metric: Metric;
  onMetric: (m: Metric) => void;
  selectedSido: string;
}

export const AirSidoCompareCard = ({ items, metric, onMetric, selectedSido }: Props) => {
  const theme = useTheme();
  const rows = AIR_SIDO_OPTIONS.filter((o) => o.value !== '전국').map((o) => {
    const vals = items.filter((m) => airSidoMatches(m.sidoName, o.value)).map((m) => m[metric]).filter((v): v is number => v !== null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { option: o, avg, n: vals.length };
  });
  const max = Math.max(1, ...rows.map((r) => r.avg ?? 0));
  return (
    <View style={styles.wrap}>
      <SegmentedControl
        fullWidth={false}
        value={metric}
        options={[
          { value: 'pm25', label: 'PM2.5' },
          { value: 'pm10', label: 'PM10' },
        ]}
        onChange={onMetric}
      />
      {rows.map((r) => {
        const grade = airGradeFromValue(metric, r.avg);
        const c = airGradeColor(grade);
        const selected = r.option.value === selectedSido;
        return (
          <View key={r.option.value} style={styles.row}>
            <Text style={[styles.label, { color: theme.colors.text, fontWeight: selected ? '700' : '400' }]} numberOfLines={1}>
              {r.option.label}
            </Text>
            <View style={[styles.bar, { backgroundColor: theme.colors.surfaceAlt }]}>
              {r.avg !== null && <View style={[styles.fill, { width: `${Math.max(2, (r.avg / max) * 100)}%`, backgroundColor: c.hex }]} />}
            </View>
            <Text style={[styles.value, { color: theme.colors.text }]}>{formatAirValue(metric, r.avg)}</Text>
            <Text style={[styles.n, { color: theme.colors.textMuted }]}>{r.n}곳</Text>
          </View>
        );
      })}
      <Text style={[styles.note, { color: theme.colors.textMuted }]}>시도 안 측정소 평균(㎍/㎥) · 막대 색은 그 평균의 등급</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { width: 64, fontSize: 12 },
  bar: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  value: { width: 34, textAlign: 'right', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  n: { width: 30, fontSize: 10, textAlign: 'right' },
  note: { fontSize: 10, marginTop: 2 },
});
