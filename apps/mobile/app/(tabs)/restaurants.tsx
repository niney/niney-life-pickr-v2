import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useRestaurantsPublic, useTheme } from '@repo/shared';
import type {
  RestaurantPublicListItemType,
  RestaurantPublicListQueryType,
} from '@repo/api-contract';
import { PublicRestaurantCard } from '~/components/PublicRestaurantCard';
import { RestaurantSearchBar } from '~/components/RestaurantSearchBar';

type SortKey = NonNullable<RestaurantPublicListQueryType['sort']>;
const PAGE_SIZE = 60;

// 맛집 탭 — 웹 RestaurantsPage 의 공개 리스트 마이그레이션. 모바일 UX에 맞춰:
//  - 지도/패널 토글/hover 제거 (Phase 2 에서 react-native-maps 도입 예정)
//  - URL 동기화 대신 로컬 state
//  - 페이지네이션 대신 무한 스크롤 + pull-to-refresh
export default function RestaurantsScreen() {
  const router = useRouter();
  const theme = useTheme();

  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('recent');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<RestaurantPublicListItemType[]>([]);

  const query = useRestaurantsPublic({
    q: q || undefined,
    category: category ?? undefined,
    sort,
    limit: PAGE_SIZE,
    offset,
  });

  useEffect(() => {
    const page = query.data?.items;
    if (!page) return;
    setItems((prev) => (offset === 0 ? page : [...prev, ...page]));
  }, [query.data, offset]);

  const total = query.data?.total ?? 0;
  const hasMore = items.length < total;

  const reset = useCallback(() => {
    setOffset(0);
    setItems([]);
  }, []);

  const handleChangeQ = useCallback(
    (next: string) => {
      if (next === q) return;
      setQ(next);
      reset();
    },
    [q, reset],
  );

  const handleChangeCategory = useCallback(
    (next: string | null) => {
      if (next === category) return;
      setCategory(next);
      reset();
    },
    [category, reset],
  );

  const handleChangeSort = useCallback(
    (next: SortKey) => {
      if (next === sort) return;
      setSort(next);
      reset();
    },
    [sort, reset],
  );

  const handleEndReached = useCallback(() => {
    if (query.isFetching || !hasMore) return;
    setOffset((o) => o + PAGE_SIZE);
  }, [query.isFetching, hasMore]);

  const handleRefresh = useCallback(() => {
    reset();
    query.refetch();
  }, [reset, query]);

  const handleSelect = useCallback(
    (placeId: string) => {
      router.push(`/restaurant/${placeId}` as never);
    },
    [router],
  );

  const isInitialLoading = query.isLoading && items.length === 0;
  const isError = query.isError && items.length === 0;

  const header = useMemo(
    () => (
      <RestaurantSearchBar
        q={q}
        category={category}
        sort={sort}
        total={total}
        onChangeQ={handleChangeQ}
        onChangeCategory={handleChangeCategory}
        onChangeSort={handleChangeSort}
      />
    ),
    [q, category, sort, total, handleChangeQ, handleChangeCategory, handleChangeSort],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.placeId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleSelect(item.placeId)}
            android_ripple={{ color: theme.colors.surfaceAlt }}
          >
            <PublicRestaurantCard item={item} />
          </Pressable>
        )}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={query.isFetching && offset === 0} onRefresh={handleRefresh} />
        }
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          isInitialLoading ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : isError ? (
            <View style={styles.center}>
              <Text style={{ color: theme.colors.danger }}>결과를 불러오지 못했습니다.</Text>
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={{ color: theme.colors.textMuted }}>
                조건에 맞는 식당이 없습니다.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          hasMore && query.isFetching && offset > 0 ? (
            <View style={styles.footer}>
              <ActivityIndicator />
            </View>
          ) : !hasMore && items.length > 0 ? (
            <Text style={[styles.endText, { color: theme.colors.textMuted }]}>
              총 {total}곳
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16 },
  sep: { height: 8 },
  center: { paddingVertical: 48, alignItems: 'center' },
  footer: { paddingVertical: 16, alignItems: 'center' },
  endText: { textAlign: 'center', fontSize: 12, paddingVertical: 16 },
});
