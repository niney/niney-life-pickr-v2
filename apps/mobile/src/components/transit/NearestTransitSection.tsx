import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { BusNearbyItemType, SubwayNearbyGroupItemType } from '@repo/api-contract';
import { BusStationRow } from '~/components/bus/BusStationListRows';
import { SubwayStationRow } from '~/components/subway/SubwayStationListRows';

const VISIBLE_LIMIT = 3;

interface Props {
  busItems: BusNearbyItemType[];
  subwayItems: SubwayNearbyGroupItemType[];
  busLoading: boolean;
  subwayLoading: boolean;
  busError: boolean;
  subwayError: boolean;
  onSelectBus(stId: string): void;
  onSelectSubway(stationId: string): void;
  onRetryBus(): void;
  onRetrySubway(): void;
  onClose(): void;
}

// 사용자 명시 액션 뒤에만 조회되는 통합 빠른 선택. 버스는 길 반대편 정류장이
// 더 가까울 수 있어 1곳을 자동 선택하지 않고 거리순 후보를 최대 3곳 노출한다.
export const NearestTransitSection = ({
  busItems,
  subwayItems,
  busLoading,
  subwayLoading,
  busError,
  subwayError,
  onSelectBus,
  onSelectSubway,
  onRetryBus,
  onRetrySubway,
  onClose,
}: Props) => {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.colors.text }]}>내 위치에서 가까운 곳</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>거리순 빠른 선택</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="가까운 곳 닫기">
          <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>✕</Text>
        </Pressable>
      </View>

      <NearestGroup
        title="🚌 가까운 정류장"
        loading={busLoading}
        error={busError}
        empty={busItems.length === 0}
        onRetry={onRetryBus}
      >
        {busItems.slice(0, VISIBLE_LIMIT).map((item) => (
          <BusStationRow
            key={item.stId}
            item={item}
            selected={false}
            onSelect={onSelectBus}
          />
        ))}
      </NearestGroup>

      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

      <NearestGroup
        title="🚇 가까운 역"
        loading={subwayLoading}
        error={subwayError}
        empty={subwayItems.length === 0}
        onRetry={onRetrySubway}
      >
        {subwayItems.slice(0, VISIBLE_LIMIT).map((item) => (
          <SubwayStationRow
            key={item.id}
            item={item}
            selected={false}
            onSelect={onSelectSubway}
          />
        ))}
      </NearestGroup>
    </View>
  );
};

const NearestGroup = ({
  title,
  loading,
  error,
  empty,
  onRetry,
  children,
}: {
  title: string;
  loading: boolean;
  error: boolean;
  empty: boolean;
  onRetry(): void;
  children: React.ReactNode;
}) => {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: theme.colors.textMuted }]}>{title}</Text>
      {loading && empty ? (
        <View style={styles.status}>
          <ActivityIndicator size="small" />
        </View>
      ) : error && empty ? (
        <View style={styles.statusRow}>
          <Text style={[styles.statusText, { color: theme.colors.danger }]}>불러오지 못했습니다.</Text>
          <Pressable onPress={onRetry} hitSlop={8}>
            <Text style={[styles.retryText, { color: theme.colors.text }]}>재시도</Text>
          </Pressable>
        </View>
      ) : empty ? (
        <Text style={[styles.statusText, { color: theme.colors.textMuted }]}>주변에 없습니다.</Text>
      ) : (
        <View style={styles.rows}>{children}</View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth },
  group: { gap: 5 },
  groupTitle: { fontSize: 12, fontWeight: '600', paddingHorizontal: 4 },
  rows: { gap: 2 },
  status: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  statusRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  statusText: { fontSize: 12, paddingHorizontal: 4, paddingVertical: 10 },
  retryText: { fontSize: 12, fontWeight: '600' },
});
