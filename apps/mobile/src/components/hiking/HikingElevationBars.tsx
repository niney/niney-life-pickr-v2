import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import { formatHikingEle, formatHikingLength, type HikingProfile } from '@repo/utils';

// 고도 그래프(앱) — 앱엔 SVG 가 없어 막대로 그린다. 프로필(20m 간격)을 BARS 칸으로 나눠 칸마다 가장 높은 고도.

const BARS = 60;
const HEIGHT = 96;

export const HikingElevationBars = ({ profile, lengthM }: { profile: HikingProfile; lengthM: number }) => {
  const theme = useTheme();
  const bars = useMemo(() => {
    const { d, e } = profile;
    if (e.length < 2) return null;
    const total = d.at(-1) ?? lengthM;
    const out = new Array<number>(BARS).fill(-Infinity);
    for (let i = 0; i < e.length; i++) {
      const k = Math.min(BARS - 1, Math.floor((d[i]! / (total || 1)) * BARS));
      out[k] = Math.max(out[k]!, e[i]!);
    }
    // 빈 칸(점이 없는 칸)은 앞 칸 값으로.
    for (let k = 0; k < BARS; k++) if (out[k] === -Infinity) out[k] = k > 0 ? out[k - 1]! : e[0]!;
    return { values: out, min: Math.min(...e), max: Math.max(...e), total };
  }, [profile, lengthM]);
  if (!bars) return null;
  const span = Math.max(1, bars.max - bars.min);
  return (
    <View style={styles.wrap} accessibilityLabel={`고도 그래프 — 가장 낮은 곳 ${formatHikingEle(bars.min)}, 가장 높은 곳 ${formatHikingEle(bars.max)}`}>
      <View style={styles.axis}>
        <Text style={[styles.axisText, { color: theme.colors.textMuted }]}>{formatHikingEle(bars.max)}</Text>
        <Text style={[styles.axisText, { color: theme.colors.textMuted }]}>{formatHikingEle(bars.min)}</Text>
      </View>
      <View style={[styles.chart, { borderBottomColor: theme.colors.border }]}>
        {bars.values.map((v, i) => (
          <View key={i} style={[styles.bar, { height: 6 + ((v - bars.min) / span) * (HEIGHT - 6), backgroundColor: '#16a34a' }]} />
        ))}
      </View>
      <View style={styles.xAxis}>
        <Text style={[styles.axisText, { color: theme.colors.textMuted }]}>0</Text>
        <Text style={[styles.axisText, { color: theme.colors.textMuted }]}>{formatHikingLength(bars.total)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: 6 },
  axis: { position: 'absolute', left: 0, top: 0, height: HEIGHT, justifyContent: 'space-between', zIndex: 1 },
  axisText: { fontSize: 10, fontVariant: ['tabular-nums'] },
  chart: { height: HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 1, borderBottomWidth: StyleSheet.hairlineWidth, paddingLeft: 44 },
  bar: { flex: 1, borderTopLeftRadius: 1, borderTopRightRadius: 1, opacity: 0.75 },
  xAxis: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 44, marginTop: 2 },
});
