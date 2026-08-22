import { ActivityIndicator, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@repo/shared';
import { LIFE_CCTV_GROUP_COLOR, LIFE_MAP_LAYER_LABEL, LIFE_TOILET_COLOR, type LifeMapLayer } from '@repo/utils';
import type { LifeMapStatusResultType } from '@repo/api-contract';

// 지도 위 플로팅 헤더 — [검색(지역·역·정류장·주소로 이동) → 모달] + [레이어 칩 CCTV/공중화장실] + [내 위치].
// 대중교통 플로팅 헤더와 같은 카드 룩(보간 애니메이션은 생략 — 시트가 full 이면 헤더 위로 덮인다).

interface Props {
  topInset: number;
  layers: Record<LifeMapLayer, boolean>;
  status: LifeMapStatusResultType | undefined;
  onToggleLayer: (layer: LifeMapLayer) => void;
  onOpenSearch: () => void;
  onBack: () => void;
  onLocate: () => void;
  locating: boolean;
  onMeasure: (h: number) => void;
}

export const LifeMapHeader = ({ topInset, layers, status, onToggleLayer, onOpenSearch, onBack, onLocate, locating, onMeasure }: Props) => {
  const theme = useTheme();
  const countOf = (layer: LifeMapLayer): number | null => status?.layers.find((l) => l.layer === layer)?.count ?? null;
  return (
    <View style={[styles.wrap, { paddingTop: topInset, pointerEvents: 'box-none' }]}>
      <View
        onLayout={(e: LayoutChangeEvent) => onMeasure(e.nativeEvent.layout.height)}
        style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      >
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="뒤로"
            onPress={onBack}
            style={({ pressed }) => [styles.iconBtn, { borderColor: theme.colors.border, opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialCommunityIcons name="arrow-left" size={18} color={theme.colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="search"
            onPress={onOpenSearch}
            style={({ pressed }) => [styles.search, { backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.textMuted} />
            <Text style={[styles.searchText, { color: theme.colors.textMuted }]} numberOfLines={1}>
              지역·역·정류장·주소로 이동
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="내 위치로 이동"
            onPress={onLocate}
            disabled={locating}
            style={({ pressed }) => [styles.iconBtn, { borderColor: theme.colors.border, opacity: pressed ? 0.6 : 1 }]}
          >
            {locating ? <ActivityIndicator size="small" color={theme.colors.textMuted} /> : <MaterialCommunityIcons name="crosshairs-gps" size={18} color={theme.colors.text} />}
          </Pressable>
        </View>
        <View style={styles.chips}>
          {(['cctv', 'toilet'] as const).map((layer) => {
            const on = layers[layer];
            const color = layer === 'cctv' ? LIFE_CCTV_GROUP_COLOR.safety : LIFE_TOILET_COLOR;
            const count = countOf(layer);
            return (
              <Pressable
                key={layer}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => onToggleLayer(layer)}
                style={({ pressed }) => [
                  styles.chip,
                  { borderColor: on ? theme.colors.text : theme.colors.border, backgroundColor: on ? theme.colors.surfaceAlt : 'transparent', opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <View style={[styles.dot, { backgroundColor: color, opacity: on ? 1 : 0.35 }]} />
                <MaterialCommunityIcons name={layer === 'cctv' ? 'cctv' : 'toilet'} size={14} color={on ? theme.colors.text : theme.colors.textMuted} />
                <Text style={[styles.chipText, { color: on ? theme.colors.text : theme.colors.textMuted, textDecorationLine: on ? 'none' : 'line-through' }]}>
                  {LIFE_MAP_LAYER_LABEL[layer]}
                </Text>
                {count !== null && <Text style={[styles.count, { color: theme.colors.textMuted }]}>{count.toLocaleString('ko-KR')}</Text>}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  card: { marginHorizontal: 12, marginTop: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 8, gap: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: 8, paddingHorizontal: 10 },
  searchText: { fontSize: 13, flex: 1 },
  iconBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, height: 30 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 12, fontWeight: '600' },
  count: { fontSize: 10 },
});
