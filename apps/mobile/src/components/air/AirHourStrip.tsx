import { useState } from 'react';
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

const CELL_GAP = 2;
const DAY_BREAK_GAP = 3;

export const AirHourStrip = ({ points, todayYmd }: Props) => {
  const theme = useTheme();
  // 축 라벨은 칸(≈12px)보다 넓어 플렉스 칸 안에 두면 네이티브에서 말줄임된다 → 칸 행 폭을 재서 절대 배치.
  const [axisWidth, setAxisWidth] = useState(0);
  if (points.length === 0) return null;
  const n = points.length;
  const labelEvery = n > 30 ? 6 : 3;
  const dayStartAt = (i: number): boolean => {
    const prev = points[i - 1];
    const p = points[i]!;
    return i === 0 || (prev !== undefined && prev.time.slice(0, 10) !== p.time.slice(0, 10));
  };
  const breaksBefore = (i: number): number => {
    let c = 0;
    for (let j = 1; j <= i; j++) if (dayStartAt(j)) c++;
    return c;
  };
  const totalBreaks = breaksBefore(n - 1);
  const cellW = n > 0 ? (axisWidth - CELL_GAP * (n - 1) - DAY_BREAK_GAP * totalBreaks) / n : 0;
  const cellLeft = (i: number): number => i * (cellW + CELL_GAP) + DAY_BREAK_GAP * breaksBefore(i);
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
                      dayBreak && { marginLeft: DAY_BREAK_GAP },
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
        <View style={styles.axisRow} onLayout={(e) => setAxisWidth(e.nativeEvent.layout.width)}>
          {axisWidth > 0 &&
            points.map((p, i) => {
              const dayStart = dayStartAt(i);
              const last = i === n - 1;
              // 정기(3시간) 라벨은 날짜 라벨·마지막(지금) 라벨과 2칸 이내면 생략 — 9px 글자가 겹치지 않게
              const nearDayStart = [i - 2, i - 1, i + 1, i + 2].some((j) => j > 0 && j < n && dayStartAt(j));
              const show = dayStart || last || (i % labelEvery === 0 && n - 1 - i >= 2 && !nearDayStart);
              const m = /^\d{4}-(\d{2})-(\d{2})\s+(\d{1,2}):/.exec(p.time);
              if (!show || !m) return null;
              const label = dayStart ? `${Number(m[1])}/${Number(m[2])}` : `${Number(m[3])}시`;
              return (
                <Text
                  key={p.time}
                  style={[
                    styles.axis,
                    last ? { right: 0 } : { left: cellLeft(i) },
                    { color: dayStart ? theme.colors.text : theme.colors.textMuted, fontWeight: dayStart ? '600' : '400' },
                  ]}
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
  cells: { flex: 1, flexDirection: 'row', gap: CELL_GAP },
  cell: { flex: 1, height: 18, borderRadius: 3 },
  axisRow: { flex: 1, height: 14, position: 'relative' },
  axis: { position: 'absolute', top: 0, fontSize: 9, fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 11 },
});
