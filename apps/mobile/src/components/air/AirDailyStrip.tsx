import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { AirHistoryPointType } from '@repo/api-contract';
import { airGradeFromValue, airPollutantMeta, formatAirValue, type AirPollutant } from '@repo/utils';
import { airGradeColor } from '~/lib/airGradeColor';

// 30·90일 추이(앱) — 일평균을 등급색 막대 높이로(차트 라이브러리 없이 View 막대). 웹의 SVG 선 차트
// 대신 "어느 날이 나빴나"를 한 줄에. 항목은 PM2.5/PM10/O₃ 중 하나, 막대 탭 대신 값은 5일마다 라벨.

interface Props {
  points: AirHistoryPointType[]; // 날짜 오름차순, unit 'day'
  metric: Extract<AirPollutant, 'pm25' | 'pm10' | 'o3'>;
}

const BAR_W = 10;
const BAR_GAP = 2;
const CHART_H = 72;

export const AirDailyStrip = ({ points, metric }: Props) => {
  const theme = useTheme();
  if (points.length === 0) {
    return <Text style={[styles.empty, { color: theme.colors.textMuted }]}>표시할 일평균이 없습니다.</Text>;
  }
  const meta = airPollutantMeta(metric);
  const vals = points.map((p) => p[metric]).filter((v): v is number => v !== null);
  const max = Math.max(meta.breakpoints[1], ...vals); // 최소 축 = '보통' 상한 — 좋은 날만 있어도 막대가 너무 크지 않게
  const labelEvery = points.length > 45 ? 10 : 5;
  return (
    <View style={{ gap: 4 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
        <View>
          <View style={[styles.chart, { height: CHART_H, borderBottomColor: theme.colors.border }]}>
            {/* 등급 경계선 — 좋음/보통 상한 */}
            {meta.breakpoints.slice(0, 2).map((b) => (
              <View key={b} style={[styles.guide, { bottom: (b / max) * CHART_H, borderTopColor: theme.colors.border }]} />
            ))}
            {points.map((p) => {
              const v = p[metric];
              const grade = airGradeFromValue(metric, v);
              const h = v === null ? 0 : Math.max(2, (Math.min(v, max) / max) * CHART_H);
              return (
                <View key={p.time} style={[styles.barSlot, { width: BAR_W + BAR_GAP }]}>
                  <View style={[styles.bar, { width: BAR_W, height: h, backgroundColor: v === null ? theme.colors.surfaceAlt : airGradeColor(grade).hex }]} />
                </View>
              );
            })}
          </View>
          {/* 축 라벨 — 막대 슬롯(12px)보다 넓으므로 절대 배치(플렉스 폭에 눌려 말줄임되지 않게) */}
          <View style={[styles.axis, { width: points.length * (BAR_W + BAR_GAP) }]}>
            {points.map((p, i) => {
              const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(p.time);
              const show = i % labelEvery === 0 && i <= points.length - 4;
              if (!show || !m) return null;
              return (
                <Text key={p.time} style={[styles.axisText, { left: i * (BAR_W + BAR_GAP), color: theme.colors.textMuted }]}>
                  {Number(m[1])}/{Number(m[2])}
                </Text>
              );
            })}
          </View>
        </View>
      </ScrollView>
      <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
        {meta.short} 일평균 {meta.unit} · 최근 {points.length}일 · 가로선은 좋음/보통 상한({meta.breakpoints[0]}·{meta.breakpoints[1]}) · 마지막 {formatAirValue(metric, vals[vals.length - 1] ?? null)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  empty: { fontSize: 12, textAlign: 'center', paddingVertical: 12 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: StyleSheet.hairlineWidth, position: 'relative' },
  guide: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed' },
  barSlot: { alignItems: 'center', justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  axis: { height: 14, marginTop: 2, position: 'relative' },
  axisText: { position: 'absolute', top: 0, fontSize: 9, fontVariant: ['tabular-nums'] },
  caption: { fontSize: 11 },
});
