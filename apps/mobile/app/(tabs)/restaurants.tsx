import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  useAuthStore,
  useCurrentUser,
  useRestaurantList,
} from '@repo/shared';
import type { RestaurantListItemType } from '@repo/api-contract';

// 맛집 탭 — 등록된 식당 리스트. 현재 list API 가 admin 전용이라
// 비-ADMIN 사용자에겐 안내만 표시.
export default function RestaurantsScreen() {
  const router = useRouter();
  const { data: me } = useCurrentUser();
  const isGuest = useAuthStore((s) => s.isGuest);
  const isAdmin = me?.role === 'ADMIN';
  const list = useRestaurantList();

  if (isGuest || !isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>맛집</Text>
        <Text style={styles.note}>
          현재 맛집 데이터는 관리자만 조회할 수 있습니다.
        </Text>
      </View>
    );
  }

  if (list.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const items = list.data?.items ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>맛집 ({items.length})</Text>
      <FlatList
        data={items}
        keyExtractor={(r) => r.placeId}
        renderItem={({ item }) => (
          <RestaurantRow
            item={item}
            onPress={() =>
              // expo-router 의 type-safe path 는 .expo/types/router.d.ts 가 갱신돼야
              // 인식됨. expo start 한 번 돌면 타입이 자동 보강되지만, 지금 typecheck
              // 만 도는 환경을 위해 캐스트.
              router.push(`/restaurant/${item.placeId}` as never)
            }
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>등록된 식당이 없습니다.</Text>}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
      />
    </View>
  );
}

const RestaurantRow = ({
  item,
  onPress,
}: {
  item: RestaurantListItemType;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} style={styles.row}>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={styles.name}>{item.name}</Text>
      {item.category && <Text style={styles.category}>{item.category}</Text>}
      <Text style={styles.meta}>
        리뷰 {item.totalReviews} · 분석 {item.summaryDone}
      </Text>
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  title: { fontSize: 22, fontWeight: '700' },
  note: { color: '#64748b', textAlign: 'center' },
  empty: { color: '#888', textAlign: 'center', marginTop: 40 },
  row: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: { fontSize: 16, fontWeight: '600' },
  category: { fontSize: 12, color: '#64748b' },
  meta: { fontSize: 11, color: '#94a3b8' },
});
