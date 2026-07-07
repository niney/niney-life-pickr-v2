import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useBusNearbyStations, useTheme } from '@repo/shared';

// 도보권(m) — 버스 기본 반경(500)보다 좁게. 역 바로 옆 정류장만.
const NEARBY_RADIUS_M = 350;

const formatDist = (m: number): string =>
  m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;

// 도착 패널 하단의 접이식 '주변 버스 정류장' 섹션(웹 12차 이식). 버스 쿼터를
// 아끼려 기본 접힘 + 펼쳤을 때만 조회(enabled 게이트). 행 탭 → 버스 모드 전환
// (near 승계 + stId 선택)은 상위 콜백.
export const SubwayNearbyBusSection = ({
  lat,
  lng,
  onSelect,
}: {
  lat: number;
  lng: number;
  onSelect(stId: string, near: { lat: number; lng: number }): void;
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  // 접힌 상태에서는 좌표를 null 로 넘겨 조회 자체를 막는다(버스 API 콜 0).
  const nearby = useBusNearbyStations(
    expanded ? lat : null,
    expanded ? lng : null,
    NEARBY_RADIUS_M,
  );
  const items = expanded ? (nearby.data?.items ?? []) : [];

  return (
    <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityState={{ expanded }}
        style={styles.headerBtn}
      >
        <Text style={[styles.headerText, { color: theme.colors.textMuted }]}>
          {expanded ? '˅' : '›'} 🚌 주변 버스 정류장
        </Text>
      </Pressable>

      {expanded &&
        (nearby.isLoading && items.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" />
          </View>
        ) : nearby.isError ? (
          <View style={styles.center}>
            <Text style={{ color: theme.colors.danger, fontSize: 13 }}>
              불러오지 못했습니다.
            </Text>
            <Pressable
              onPress={() => void nearby.refetch()}
              style={[styles.retryBtn, { borderColor: theme.colors.border }]}
            >
              <Text style={{ color: theme.colors.text, fontSize: 12 }}>재시도</Text>
            </Pressable>
          </View>
        ) : items.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
            주변에 정류장이 없어요.
          </Text>
        ) : (
          <View style={styles.list}>
            {items.map((it) => (
              <Pressable
                key={it.stId}
                onPress={() => onSelect(it.stId, { lat, lng })}
                android_ripple={{ color: theme.colors.surfaceAlt }}
                style={styles.row}
              >
                <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
                  {it.name}
                </Text>
                <View style={styles.right}>
                  <Text style={[styles.dist, { color: theme.colors.textMuted }]}>
                    {formatDist(it.dist)}
                  </Text>
                  {it.arsId !== '0' && (
                    <View style={[styles.pill, { backgroundColor: theme.colors.surfaceAlt }]}>
                      <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>
                        {it.arsId}
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        ))}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  headerBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  headerText: { fontSize: 12, fontWeight: '600' },
  center: {
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
  },
  retryBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
  },
  list: { marginTop: 4, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  name: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  dist: { fontSize: 12, fontVariant: ['tabular-nums'] },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pillText: { fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
