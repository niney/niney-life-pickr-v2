import { StyleSheet, Text, View } from 'react-native';
import { mergeDailyRows, useTheme, type WeatherDailyHalf } from '@repo/shared';
import type { WeatherForecastDayType, WeatherMidResultType } from '@repo/api-contract';
import { formatKmaTemp, formatYmdWithWeekday, relativeDayLabel } from '@repo/utils';
import { WeatherGlyph } from './WeatherGlyph';

// 열흘 — 단기예보 일별 요약(오늘~D+3) + 중기예보(D+4~D+10)를 날짜순 세로 행으로(병합은 공용
// mergeDailyRows). 행: 날짜 / 오전·오후(중기 D+8~ 는 하루 한 값) 아이콘+강수확률 / 최저·최고 +
// 전체 기간 공통 축 위 기온 막대.

interface Props {
  shortDays: WeatherForecastDayType[];
  mid: WeatherMidResultType | null;
  todayYmd: string;
}

export const WeatherDailyCard = ({ shortDays, mid, todayYmd }: Props) => {
  const theme = useTheme();
  const rows = mergeDailyRows(shortDays, mid);
  if (rows.length === 0) {
    return <Text style={[styles.empty, { color: theme.colors.textMuted }]}>표시할 일별 예보가 없습니다.</Text>;
  }
  const temps = rows.flatMap((r) => [r.tmn, r.tmx]).filter((v): v is number => v !== null);
  const lo = temps.length ? Math.min(...temps) : 0;
  const hi = temps.length ? Math.max(...temps) : 1;
  const span = Math.max(1, hi - lo);
  const pct = (v: number): number => ((v - lo) / span) * 100;

  const half = (tag: string, h: WeatherDailyHalf | null) => (
    <View style={styles.half} accessibilityLabel={h ? `${tag} ${h.label} 강수확률 ${h.pop ?? '-'}%` : `${tag} 자료 없음`}>
      <Text style={[styles.halfTag, { color: theme.colors.textMuted }]}>{tag}</Text>
      {h ? (
        <>
          <WeatherGlyph condition={h.condition} size={22} label={h.label} />
          <Text style={[styles.pop, { color: (h.pop ?? 0) >= 60 ? '#3b82f6' : theme.colors.textMuted }]}>{h.pop ?? '-'}%</Text>
        </>
      ) : (
        <Text style={[styles.pop, { color: theme.colors.textMuted }]}>-</Text>
      )}
    </View>
  );

  return (
    <View>
      {rows.map((r, idx) => {
        const head = relativeDayLabel(r.date, todayYmd);
        const isToday = head === '오늘';
        return (
          <View
            key={r.date}
            style={[
              styles.row,
              { borderTopColor: theme.colors.border, borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth },
              isToday && { backgroundColor: 'rgba(245,158,11,0.06)' },
            ]}
          >
            <View style={styles.dateCol}>
              <Text style={[styles.dateHead, { color: theme.colors.text }]}>{head}</Text>
              <Text style={[styles.dateSub, { color: theme.colors.textMuted }]}>{formatYmdWithWeekday(r.date)}</Text>
              <Text style={[styles.source, { color: theme.colors.textMuted }]}>
                {r.source === 'short' ? (r.partial ? '단기·남은 시각' : '단기예보') : '중기예보'}
              </Text>
            </View>
            <View style={styles.halves}>{r.all ? half('하루', r.all) : <>{half('오전', r.am)}{half('오후', r.pm)}</>}</View>
            <View style={styles.tempCol}>
              <View style={styles.tempRow}>
                <Text style={[styles.tmn, { color: theme.colors.textMuted }]}>{formatKmaTemp(r.tmn)}°</Text>
                <Text style={[styles.tmx, { color: theme.colors.text }]}>{formatKmaTemp(r.tmx)}°</Text>
              </View>
              <View style={[styles.bar, { backgroundColor: theme.colors.surfaceAlt }]}>
                {r.tmn !== null && r.tmx !== null && (
                  <View
                    style={[
                      styles.barFill,
                      { left: `${pct(r.tmn)}%`, width: `${Math.max(6, pct(r.tmx) - pct(r.tmn))}%`, backgroundColor: '#f59e0b' },
                    ]}
                  />
                )}
              </View>
              {r.source === 'mid' && r.tmnNote ? (
                <Text style={[styles.note, { color: theme.colors.textMuted }]}>{r.tmnNote.replace('오차 ', '±')}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 6 },
  dateCol: { width: 72, gap: 1 },
  dateHead: { fontSize: 13, fontWeight: '600' },
  dateSub: { fontSize: 11 },
  source: { fontSize: 9 },
  halves: { flexDirection: 'row', gap: 10, flex: 1, justifyContent: 'center' },
  half: { alignItems: 'center', gap: 2, minWidth: 40 },
  halfTag: { fontSize: 9 },
  pop: { fontSize: 11, fontVariant: ['tabular-nums'] },
  tempCol: { width: 92, gap: 3 },
  tempRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  tmn: { fontSize: 12, fontVariant: ['tabular-nums'] },
  tmx: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  bar: { height: 5, borderRadius: 3, overflow: 'hidden' },
  barFill: { position: 'absolute', top: 0, height: 5, borderRadius: 3 },
  note: { fontSize: 9, textAlign: 'right' },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 16 },
});
