import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme, type HikingSort } from '@repo/shared';

// 등산 지도 위 플로팅 헤더 — [뒤로] [산·봉우리·지역·국립공원 검색] [내 위치] + [오늘 추천] 칩 · 정렬 칩(가까운순·높은순·이름순).
// 추천을 켜면 목록 시트가 추천으로 바뀌어 정렬 칩은 숨긴다.
// 일상지도 헤더와 같은 카드 룩·보간: 목록 시트 index 1.5→2 에서 플로팅 카드 → sticky 바.

const SORTS: { key: HikingSort; label: string }[] = [
  { key: 'near', label: '가까운순' },
  { key: 'height', label: '높은순' },
  { key: 'name', label: '이름순' },
];

interface Props {
  topInset: number;
  sheetIndex: SharedValue<number>;
  q: string;
  onChangeQ: (q: string) => void;
  sort: HikingSort;
  onSort: (s: HikingSort) => void;
  recommend: boolean;
  onToggleRecommend: () => void;
  onBack: () => void;
  onLocate: () => void;
  locating: boolean;
  onMeasure: (h: number) => void;
}

export const HikingHeader = ({ topInset, sheetIndex, q, onChangeQ, sort, onSort, recommend, onToggleRecommend, onBack, onLocate, locating, onMeasure }: Props) => {
  const theme = useTheme();
  const animatedCardStyle = useAnimatedStyle(() => {
    'worklet';
    const t = Math.min(1, Math.max(0, (sheetIndex.value - 1.5) / 0.5));
    return { marginHorizontal: 12 * (1 - t), marginTop: 8 * (1 - t), borderRadius: 12 * (1 - t), shadowOpacity: 0.15 * (1 - t), elevation: 4 * (1 - t) };
  });
  const animatedWrapStyle = useAnimatedStyle(() => {
    'worklet';
    const t = Math.min(1, Math.max(0, (sheetIndex.value - 1.5) / 0.5));
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
          <View style={[styles.search, { backgroundColor: theme.colors.surfaceAlt }]}>
            <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.textMuted} />
            <TextInput
              value={q}
              onChangeText={onChangeQ}
              placeholder="산·봉우리·지역·국립공원 검색"
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="search"
              autoCorrect={false}
              style={[styles.input, { color: theme.colors.text }]}
              accessibilityLabel="산 검색"
            />
            {q.length > 0 && (
              <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" hitSlop={8} onPress={() => onChangeQ('')}>
                <MaterialCommunityIcons name="close-circle" size={16} color={theme.colors.textMuted} />
              </Pressable>
            )}
          </View>
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
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: recommend }}
            accessibilityHint={recommend ? '산 목록으로 돌아갑니다' : '날짜·시간·난이도로 오늘 갈 산을 추천합니다'}
            onPress={onToggleRecommend}
            style={({ pressed }) => [
              styles.chip,
              recommend ? { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary } : { borderColor: theme.colors.border },
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <MaterialCommunityIcons name="star-four-points-outline" size={14} color={recommend ? theme.colors.primaryText : theme.colors.primary} />
            <Text style={[styles.chipText, { color: recommend ? theme.colors.primaryText : theme.colors.text }]}>오늘 추천</Text>
            {recommend && <MaterialCommunityIcons name="close" size={13} color={theme.colors.primaryText} />}
          </Pressable>
          {!recommend && SORTS.map(({ key, label }) => {
            const on = sort === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => onSort(key)}
                style={({ pressed }) => [
                  styles.chip,
                  { borderColor: on ? theme.colors.text : theme.colors.border, backgroundColor: on ? theme.colors.surfaceAlt : 'transparent', opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text style={[styles.chipText, { color: on ? theme.colors.text : theme.colors.textMuted }]}>{label}</Text>
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
  card: { borderWidth: StyleSheet.hairlineWidth, padding: 8, gap: 8, shadowColor: '#000', shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: 8, paddingHorizontal: 10 },
  input: { flex: 1, fontSize: 13, paddingVertical: 0 },
  iconBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, height: 30 },
  chipText: { fontSize: 12, fontWeight: '600' },
});
