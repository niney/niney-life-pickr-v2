import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { AirHistoryPointType } from '@repo/api-contract';
import { AIR_GRADE_LEVELS, airGradeFromValue, airPollutantMeta, type AirPollutant } from '@repo/utils';
import { airGradeColor } from '~/lib/airGradeColor';

// 24시간 등급 띠 — 시간별 농도를 등급색 칸으로만 펼쳐 "어제 이 시간부터 지금까지"를 한 줄에. 칸은
// 색+위치만 담당(값은 카드 위 히어로·아래 목록에). 날짜가 바뀌는 칸에 얇은 경계.

interface Props {
  points: AirHistoryPointType[]; // 시간 오름차순
  todayYmd: string;
}

const ROWS: Array<Exclude<AirPollutant, 'khai' | 'no2' | 'co' | 'so2'>> = ['pm10', 'pm25', 'o3'];

export const AirHourStrip = ({ points, todayYmd }: Props) => {
  const theme = useTheme();
  if (points.length === 0) return null;
  const n = points.length;
  const labelEvery = n > 30 ? 6 : 3;
  const dayStartAt = (i: number): boolean => {
    const prev = points[i - 1];
    const p = points[i]!;
    return i === 0 || (prev !== undefined && prev.time.slice(0, 10) !== p.time.slice(0, 10));
  };
  return (
    <View style={styles.wrap} accessibilityLabel="시간별 등급 띠">
      {ROWS.map((k) => {
        const meta = airPollutantMeta(k);
        return (
          <View key={k} style={styles.row}>
            <Text style={[styles.rowHead, { color: theme.colors.textMuted }]}>{meta.short}</Text>
            <View style={styles.cells}>
              {points.map((p, i) => {
                const grade = airGradeFromValue(k, p[k]);
                const dayBreak = i > 0 && dayStartAt(i);
                return (
                  <View
                    key={p.time}
                    style={[
                      styles.cell,
                      { backgroundColor: grade ? airGradeColor(grade).hex : theme.colors.surfaceAlt },
                      dayBreak && { marginLeft: 3 },
                    ]}
                  />
                );
              })}
            </View>
          </View>
        );
      })}
      <View style={styles.row}>
        <Text style={styles.rowHead} />
        <View style={styles.cells}>
          {points.map((p, i) => {
            const dayStart = dayStartAt(i);
            const show = dayStart || i % labelEvery === 0 || i === n - 1;
            const m = /^\d{4}-(\d{2})-(\d{2})\s+(\d{1,2}):/.exec(p.time);
            const label = !show || !m ? '' : dayStart ? `${Number(m[1])}/${Number(m[2])}` : `${Number(m[3])}시`;
            return (
              <Text
                key={p.time}
                numberOfLines={1}
                style={[styles.axis, { color: dayStart ? theme.colors.text : theme.colors.textMuted, fontWeight: dayStart ? '600' : '400' }]}
              >
                {label}
              </Text>
            );
          })}
        </View>
      </View>
      <View style={styles.legend}>
        {AIR_GRADE_LEVELS.map((g) => (
          <View key={g} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: airGradeColor(g).hex }]} />
            <Text style={[styles.legendText, { color: theme.colors.textMuted }]}>{airGradeColor(g).label}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.colors.surfaceAlt }]} />
          <Text style={[styles.legendText, { color: theme.colors.textMuted }]}>결측</Text>
        </View>
        <Text style={[styles.legendText, { color: theme.colors.textMuted, marginLeft: 'auto' }]}>{todayYmd.slice(5).replace('-', '/')} 기준 최근 24시간</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowHead: { width: 40, fontSize: 11, fontWeight: '600' },
  cells: { flex: 1, flexDirection: 'row', gap: 2 },
  cell: { flex: 1, height: 18, borderRadius: 3 },
  axis: { flex: 1, fontSize: 9, fontVariant: ['tabular-nums'], overflow: 'visible' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 11 },
});
