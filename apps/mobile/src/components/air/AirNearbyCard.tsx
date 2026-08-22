import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@repo/shared';
import type { AirNearbyStationItemType } from '@repo/api-contract';
import { formatAirValue, formatDistanceM } from '@repo/utils';
import { AirGradeBadge } from './AirPrimitives';

// 내 주변 측정소 — 기준점(저장한 내 위치 또는 GPS)에서 가까운 순. 행 탭 → 그 측정소로 전환.

interface Props {
  // 기준점 설명("저장한 내 위치(양천구)" / "현재 위치(GPS)") — null 이면 아직 기준점 없음.
  centerLabel: string | null;
  items: AirNearbyStationItemType[];
  loading: boolean;
  errorMessage: string | null;
  selectedStation: string | null;
  onSelect: (item: AirNearbyStationItemType) => void;
  onLocate: () => void;
  locating: boolean;
}

export const AirNearbyCard = ({ centerLabel, items, loading, errorMessage, selectedStation, onSelect, onLocate, locating }: Props) => {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.centerText, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {centerLabel ? `기준 ${centerLabel}` : '기준점이 없어요 — 내 위치로 찾거나 날씨에서 내 위치를 저장하세요.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onLocate}
          disabled={locating}
          style={({ pressed }) => [styles.locateBtn, { borderColor: theme.colors.border, opacity: pressed || locating ? 0.6 : 1 }]}
        >
          {locating ? <ActivityIndicator size="small" color={theme.colors.textMuted} /> : <MaterialCommunityIcons name="crosshairs-gps" size={14} color={theme.colors.text} />}
          <Text style={[styles.locateText, { color: theme.colors.text }]}>내 위치로 찾기</Text>
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={theme.colors.textMuted} style={{ paddingVertical: 12 }} />
      ) : errorMessage ? (
        <Text style={[styles.empty, { color: theme.colors.danger }]}>{errorMessage}</Text>
      ) : !centerLabel ? null : items.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>반경 20km 안에 측정소가 없습니다.</Text>
      ) : (
        items.map((it, idx) => {
          const m = it.measure;
          const selected = it.stationName === selectedStation;
          return (
            <Pressable
              key={it.stationName}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onSelect(it)}
              style={({ pressed }) => [
                styles.row,
                { borderTopColor: theme.colors.border, borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <View style={styles.rowMain}>
                <Text style={[styles.name, { color: theme.colors.text, fontWeight: selected ? '700' : '600' }]} numberOfLines={1}>
                  {it.stationName}
                  {it.mangName ? <Text style={[styles.sub, { color: theme.colors.textMuted }]}>  {it.mangName}</Text> : null}
                </Text>
                <Text style={[styles.sub, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {formatDistanceM(it.dist)} · {it.addr}
                </Text>
              </View>
              <View style={styles.rowRight}>
                {m ? (
                  <>
                    <AirGradeBadge grade={m.khaiGrade ?? m.pm25Grade ?? m.pm10Grade} />
                    <Text style={[styles.pm, { color: theme.colors.textMuted }]}>
                      PM2.5 {formatAirValue('pm25', m.pm25)} · PM10 {formatAirValue('pm10', m.pm10)}
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.pm, { color: theme.colors.textMuted }]}>측정값 없음</Text>
                )}
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  centerText: { flex: 1, fontSize: 11 },
  locateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 8, height: 28 },
  locateText: { fontSize: 12, fontWeight: '500' },
  empty: { fontSize: 12, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  rowMain: { flex: 1, gap: 2 },
  name: { fontSize: 14 },
  sub: { fontSize: 11 },
  rowRight: { alignItems: 'flex-end', gap: 3 },
  pm: { fontSize: 10, fontVariant: ['tabular-nums'] },
});
