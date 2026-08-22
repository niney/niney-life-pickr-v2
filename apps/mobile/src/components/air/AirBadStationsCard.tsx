import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { AirBadStationItemType } from '@repo/api-contract';
import { AIR_SIDO_OPTIONS, airSidoMatches } from '@repo/utils';

// 통합대기환경지수 '나쁨' 이상 측정소 — 시도로 묶어 칩으로. 칩 탭 = 그 측정소로 전환(시도도 함께).

interface Props {
  items: AirBadStationItemType[];
  onSelect: (stationName: string, sidoOptionValue: string | null) => void;
}

export const AirBadStationsCard = ({ items, onSelect }: Props) => {
  const theme = useTheme();
  if (items.length === 0) {
    return <Text style={[styles.empty, { color: theme.colors.textMuted }]}>지금 통합대기환경지수가 '나쁨' 이상인 측정소가 없습니다.</Text>;
  }
  const groups = new Map<string, AirBadStationItemType[]>();
  for (const it of items) {
    const k = it.sidoName ?? '기타';
    const list = groups.get(k);
    if (list) list.push(it);
    else groups.set(k, [it]);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  return (
    <View style={styles.wrap}>
      <Text style={[styles.lead, { color: theme.colors.text }]}>
        지금 <Text style={{ color: '#e11d48', fontWeight: '700' }}>{items.length}곳</Text>의 측정소가 '나쁨' 이상입니다.
      </Text>
      {ordered.map(([sido, list]) => {
        const option =
          AIR_SIDO_OPTIONS.find((o) => o.value !== '전국' && airSidoMatches(o.value, sido))?.value ??
          AIR_SIDO_OPTIONS.find((o) => o.value !== '전국' && airSidoMatches(sido, o.value))?.value ??
          null;
        return (
          <View key={sido} style={styles.group}>
            <Text style={[styles.sido, { color: theme.colors.textMuted }]}>
              {sido} <Text style={{ fontVariant: ['tabular-nums'] }}>{list.length}</Text>
            </Text>
            <View style={styles.chips}>
              {list.map((it) => (
                <Pressable
                  key={`${sido}:${it.stationName}`}
                  accessibilityRole="button"
                  onPress={() => onSelect(it.stationName, option)}
                  style={({ pressed }) => [styles.chip, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={[styles.chipText, { color: theme.colors.text }]}>{it.stationName}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  lead: { fontSize: 13 },
  group: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  sido: { width: 56, fontSize: 11, fontWeight: '600', paddingTop: 4 },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(244,63,94,0.4)', backgroundColor: 'rgba(244,63,94,0.1)', paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 12 },
});
