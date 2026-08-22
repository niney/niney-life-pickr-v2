import { ActivityIndicator, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@repo/shared';
import { LIFE_CCTV_GROUP_COLOR, LIFE_MAP_LAYER_LABEL, LIFE_TOILET_COLOR, type LifeMapLayer } from '@repo/utils';
import type { LifeMapStatusResultType } from '@repo/api-contract';

// 지도 위 플로팅 헤더 — [검색(지역·역·정류장·주소로 이동) → 모달] + [레이어 칩 CCTV/공중화장실] + [내 위치].
// 맛집·대중교통 플로팅 헤더와 같은 카드 룩 + 같은 보간: 목록 시트 index 1.5→2(half→full 후반)에서
// 플로팅 카드(마진·라운드·그림자) → sticky 바(마진 0, 각진 모서리, 노치 영역 surface 색)로 이어진다.
// 시트 full 상단(listTopInset)은 insets.top + 카드 높이라 full 에선 카드 바로 아래에 시트가 맞붙는다.
// 레이어 칩 행은 full 에서도 유지(목록 보면서 레이어 토글). 상세 시트(z 더 높음)가 full 이면 헤더를 덮는다.

interface Props {
  topInset: number;
  // 목록 시트의 gorhom animatedIndex(0=peek, 1=half, 2=full).
  sheetIndex: SharedValue<number>;
  layers: Record<LifeMapLayer, boolean>;
  status: LifeMapStatusResultType | undefined;
  onToggleLayer: (layer: LifeMapLayer) => void;
  onOpenSearch: () => void;
  onBack: () => void;
  onLocate: () => void;
  locating: boolean;
  onMeasure: (h: number) => void;
}

export const LifeMapHeader = ({ topInset, sheetIndex, layers, status, onToggleLayer, onOpenSearch, onBack, onLocate, locating, onMeasure }: Props) => {
  const theme = useTheme();
  const countOf = (layer: LifeMapLayer): number | null => status?.layers.find((l) => l.layer === layer)?.count ?? null;
  // 카드: 플로팅 ↔ sticky 보간(맛집 RestaurantsFloatingHeader 와 동일 구간·값). 마진은 카드 바깥이라
  // onLayout 이 재는 카드 높이는 보간 중에도 변하지 않는다 → 시트 topInset 재계산 없음.
  const animatedCardStyle = useAnimatedStyle(() => {
    'worklet';
    const idx = sheetIndex.value;
    const t = Math.min(1, Math.max(0, (idx - 1.5) / 0.5));
    return {
      marginHorizontal: 12 * (1 - t),
      marginTop: 8 * (1 - t),
      borderRadius: 12 * (1 - t),
      shadowOpacity: 0.15 * (1 - t),
      elevation: 4 * (1 - t),
    };
  });
  // wrap 의 safe-area(노치) 영역 — full 일 때만 surface 색으로 차서 그 뒤로 지도가 비치지 않게.
  const animatedWrapStyle = useAnimatedStyle(() => {
    'worklet';
    const idx = sheetIndex.value;
    const t = Math.min(1, Math.max(0, (idx - 1.5) / 0.5));
    return { backgroundColor: interpolateColor(t, [0, 1], ['transparent', theme.colors.surface]) };
  });
  return (
    <Animated.View style={[styles.wrap, { paddingTop: topInset, pointerEvents: 'box-none' }, animatedWrapStyle]}>
      <Animated.View
        onLayout={(e: LayoutChangeEvent) => onMeasure(e.nativeEvent.layout.height)}
        style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, animatedCardStyle]}
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
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  // 마진·라운드·그림자·elevation 은 animatedCardStyle 이 시트 위치에 따라 채운다(초기값은 플로팅 상태).
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 8, gap: 8, shadowColor: '#000', shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
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
