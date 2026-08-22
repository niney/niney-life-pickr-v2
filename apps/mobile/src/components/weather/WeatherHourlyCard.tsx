import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { WeatherForecastHourType } from '@repo/api-contract';
import { formatKmaTemp, kmaCondition, kmaYmdToIsoDate, relativeDayLabel } from '@repo/utils';
import { WeatherGlyph } from './WeatherGlyph';

// 3일 시간별 — 웹의 SVG 메테오그램 대신 가로 스크롤 시간 카드(차트 라이브러리 없이). 칸마다 시각·
// 상태 아이콘·기온·기온 막대(전체 기간 최저~최고 축 — 옆으로 넘기며 오르내림이 읽힌다)·강수확률(·강수량
// 범주). 날짜가 바뀌는 첫 칸 위에 '내일'/'모레' 표지.

interface Props {
  hours: WeatherForecastHourType[];
  todayYmd: string;
}

const CELL_W = 60;
const TEMP_BAR_H = 40;

interface Cell {
  key: string;
  dayLabel: string | null;
  hour: number;
  h: WeatherForecastHourType;
}

export const WeatherHourlyCard = ({ hours, todayYmd }: Props) => {
  const theme = useTheme();
  const cells = useMemo<Cell[]>(
    () =>
      hours.map((h, i) => {
        const prev = i > 0 ? hours[i - 1] : undefined;
        const dayLabel = !prev || prev.fcstDate !== h.fcstDate ? relativeDayLabel(kmaYmdToIsoDate(h.fcstDate), todayYmd) : null;
        return { key: h.at, dayLabel, hour: Number(h.fcstTime.slice(0, 2)), h };
      }),
    [hours, todayYmd],
  );

  if (cells.length === 0) {
    return <Text style={[styles.empty, { color: theme.colors.textMuted }]}>표시할 시간별 예보가 없습니다.</Text>;
  }
  const temps = hours.map((h) => h.tmp).filter((v): v is number => v !== null);
  const tLo = temps.length ? Math.min(...temps) : 0;
  const tHi = temps.length ? Math.max(...temps) : 1;
  const tSpan = Math.max(1, tHi - tLo);

  return (
    <FlatList
      horizontal
      data={cells}
      keyExtractor={(c) => c.key}
      showsHorizontalScrollIndicator={false}
      initialNumToRender={12}
      getItemLayout={(_, index) => ({ length: CELL_W, offset: CELL_W * index, index })}
      renderItem={({ item: c }) => {
        const cond = kmaCondition(c.h.sky, c.h.pty);
        const wet = (c.h.pty !== null && c.h.pty > 0) || (c.h.pop ?? 0) >= 30;
        // 기온 막대는 '비가 올 법한 시간'(강수형태 있음 또는 확률 60%↑)만 파랑 — 30%대까지 파랗게 하면 전부 파래진다.
        const rainy = (c.h.pty !== null && c.h.pty > 0) || (c.h.pop ?? 0) >= 60;
        return (
          <View style={[styles.cell, { borderLeftColor: theme.colors.border, borderLeftWidth: c.dayLabel ? StyleSheet.hairlineWidth : 0 }]}>
            <Text style={[styles.day, { color: theme.colors.text }]} numberOfLines={1}>
              {c.dayLabel ?? ' '}
            </Text>
            <Text style={[styles.hour, { color: theme.colors.textMuted }]}>{c.hour}시</Text>
            <WeatherGlyph condition={cond} hour={c.hour} size={22} />
            <Text style={[styles.temp, { color: theme.colors.text }]}>{formatKmaTemp(c.h.tmp)}°</Text>
            <View style={[styles.tempBarTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
              {c.h.tmp !== null && (
                <View
                  style={[
                    styles.tempBar,
                    { height: 4 + ((c.h.tmp - tLo) / tSpan) * (TEMP_BAR_H - 4), backgroundColor: rainy ? '#3b82f6' : '#f59e0b' },
                  ]}
                />
              )}
            </View>
            <Text style={[styles.pop, { color: wet ? '#3b82f6' : theme.colors.textMuted }]}>{c.h.pop ?? '-'}%</Text>
            <Text style={[styles.rain, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {c.h.pcp.none ? (c.h.sno.none ? ' ' : c.h.sno.text) : c.h.pcp.text}
            </Text>
          </View>
        );
      }}
    />
  );
};

const styles = StyleSheet.create({
  cell: { width: CELL_W, alignItems: 'center', gap: 3, paddingVertical: 4 },
  day: { fontSize: 11, fontWeight: '600', height: 14 },
  hour: { fontSize: 11, fontVariant: ['tabular-nums'] },
  temp: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  tempBarTrack: { width: 6, height: TEMP_BAR_H, borderRadius: 3, justifyContent: 'flex-end', overflow: 'hidden' },
  tempBar: { width: 6, borderRadius: 3 },
  pop: { fontSize: 11, fontVariant: ['tabular-nums'] },
  rain: { fontSize: 9, height: 12 },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 16 },
});
