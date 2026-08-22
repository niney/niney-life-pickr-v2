import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { LifeMapNearbyItemType } from '@repo/api-contract';
import { LIFE_CCTV_GROUP_COLOR, LIFE_MAP_LAYER_LABEL, LIFE_TOILET_COLOR, LIFE_TOILET_FEATURES, formatDistanceM, lifeCctvPurposeGroup, lifeToiletOpenLabel, type LifeMapLayer } from '@repo/utils';

// 주변 목록 조각 — 탭 머리(화장실/CCTV + 반경·건수)와 행(화장실: 이름·구분·개방시간·편의 배지 / CCTV:
// 목적·관리기관·대수·방면). BottomSheetFlatList 의 header/row 로 쓴다.

export const LifeNearbyHeader = ({
  tab,
  onTab,
  radiusM,
  total,
}: {
  tab: LifeMapLayer;
  onTab: (l: LifeMapLayer) => void;
  radiusM: number;
  total: number | null;
}) => {
  const theme = useTheme();
  return (
    <View style={styles.head}>
      <View style={[styles.tabs, { borderColor: theme.colors.border }]}>
        {(['toilet', 'cctv'] as const).map((l) => {
          const active = tab === l;
          return (
            <Pressable
              key={l}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onTab(l)}
              style={[styles.tab, active && { backgroundColor: theme.colors.text }]}
            >
              <Text style={[styles.tabText, { color: active ? theme.colors.bg : theme.colors.textMuted }]}>{LIFE_MAP_LAYER_LABEL[l]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
        지도 중심 {formatDistanceM(radiusM)} 안{total !== null ? ` · ${total.toLocaleString('ko-KR')}곳` : ''}
      </Text>
    </View>
  );
};

export const LifeNearbyRow = ({ item, selected, onPress }: { item: LifeMapNearbyItemType; selected: boolean; onPress: () => void }) => {
  const theme = useTheme();
  const dot = item.layer === 'toilet' ? LIFE_TOILET_COLOR : LIFE_CCTV_GROUP_COLOR[lifeCctvPurposeGroup(item.purpose)];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.colors.border, backgroundColor: selected ? theme.colors.surfaceAlt : 'transparent', opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={[styles.rowDot, { backgroundColor: dot }]} />
      <View style={styles.rowMain}>
        {item.layer === 'toilet' ? (
          <>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.sub, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {item.kind} · {lifeToiletOpenLabel(item.openType, item.openDetail, item.open24)}
            </Text>
            {LIFE_TOILET_FEATURES.some((f) => item[f.key]) && (
              <View style={styles.badges}>
                {LIFE_TOILET_FEATURES.filter((f) => item[f.key]).map((f) => (
                  <Text key={f.key} style={[styles.badge, { borderColor: theme.colors.border, color: theme.colors.textMuted }]}>
                    {f.label}
                  </Text>
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {item.purpose} CCTV
            </Text>
            <Text style={[styles.sub, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {item.orgName}
              {item.cameraCount !== null ? ` · ${item.cameraCount}대` : ''}
              {item.direction ? ` · ${item.direction}` : ''}
            </Text>
          </>
        )}
      </View>
      <Text style={[styles.dist, { color: theme.colors.textMuted }]}>{formatDistanceM(item.dist)}</Text>
    </Pressable>
  );
};

export const LifeNearbyEmpty = ({ kind, tab, radiusM }: { kind: 'off' | 'loading' | 'empty'; tab: LifeMapLayer; radiusM: number }) => {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      {kind === 'loading' && <ActivityIndicator color={theme.colors.textMuted} />}
      <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
        {kind === 'off'
          ? `${LIFE_MAP_LAYER_LABEL[tab]} 레이어가 꺼져 있습니다. 위에서 켜면 주변 목록이 나옵니다.`
          : kind === 'loading'
            ? '주변을 찾는 중…'
            : `지도 중심 ${formatDistanceM(radiusM)} 안에 ${LIFE_MAP_LAYER_LABEL[tab]}${tab === 'toilet' ? '이' : '가'} 없습니다. 지도를 옮기거나 필터를 풀어 보세요.`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  tabs: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 2 },
  tab: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  tabText: { fontSize: 12, fontWeight: '600' },
  meta: { marginLeft: 'auto', fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: 6 },
  rowDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  rowMain: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 11 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  badge: { fontSize: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  dist: { fontSize: 12, fontVariant: ['tabular-nums'], marginTop: 2 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 12 },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
