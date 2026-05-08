import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRestaurantByPlaceId } from '@repo/shared';
import { MenuRankingCard } from '~/components/MenuRankingCard';

export default function RestaurantDetailScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const router = useRouter();
  const detail = useRestaurantByPlaceId(placeId ?? null);

  return (
    <>
      <Stack.Screen options={{ title: '맛집 상세', headerBackTitle: '뒤로' }} />
      <ScrollView contentContainerStyle={styles.container}>
        {detail.isLoading ? (
          <ActivityIndicator />
        ) : !detail.data ? (
          <View style={styles.center}>
            <Text style={styles.note}>식당을 찾을 수 없습니다.</Text>
            <Pressable onPress={() => router.back()} style={styles.btn}>
              <Text style={styles.btnText}>뒤로</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={styles.name}>{detail.data.name}</Text>
              {detail.data.category && (
                <Text style={styles.category}>{detail.data.category}</Text>
              )}
              {detail.data.address && (
                <Text style={styles.address}>{detail.data.address}</Text>
              )}
              <Text style={styles.meta}>
                리뷰 {detail.data.reviews.length}
              </Text>
            </View>

            {placeId && <MenuRankingCard placeId={placeId} />}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  center: { alignItems: 'center', gap: 12, padding: 24 },
  note: { color: '#64748b' },
  btn: { backgroundColor: '#1e293b', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  btnText: { color: '#fff', fontWeight: '600' },
  header: { gap: 4 },
  name: { fontSize: 20, fontWeight: '700' },
  category: { fontSize: 13, color: '#475569' },
  address: { fontSize: 12, color: '#64748b' },
  meta: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
});
