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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRestaurantRanking, useTheme } from '@repo/shared';
import type { RestaurantRankingItemType } from '@repo/api-contract';
import { RankingHeader } from '~/components/RankingHeader';
import { RankingRow } from '~/components/RankingRow';

const PAGE_SIZE = 20;
const MIN_MENTIONS = 5;

type Sort = 'positive' | 'negative';

// 홈 = 맛집 랭킹. 웹의 apps/web/src/routes/HomePage.tsx 를 RN으로 포팅하되, 페이지
// 이전/다음 버튼 대신 모바일 친화적인 무한 스크롤(onEndReached) + pull-to-refresh.
// 정렬·중립 토글이 바뀌면 offset 과 누적 items 를 초기화한다.
export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [sort, setSort] = useState<Sort>('positive');
  const [excludeNeutral, setExcludeNeutral] = useState(false);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<RestaurantRankingItemType[]>([]);

  const query = useRestaurantRanking({
    sort,
    excludeNeutral,
    minMentions: MIN_MENTIONS,
    limit: PAGE_SIZE,
    offset,
  });

  // 페이지가 fetch 될 때마다 누적. offset===0 이면 새 토글 조합이므로 덮어쓰기.
  // placeId 로 dedupe — 같은 offset 의 query.data 가 reference 만 갈리며 다시
  // 들어오는 케이스(staleTime 만료 / placeholderData 갱신 / 포커스 refetch)에
  // 같은 page 가 또 합쳐져 "duplicate key" 가 발생하던 버그 방어.
  useEffect(() => {
    const page = query.data?.items;
    if (!page) return;
    setItems((prev) => {
      if (offset === 0) return page;
      const seen = new Set(prev.map((it) => it.placeId));
      return [...prev, ...page.filter((it) => !seen.has(it.placeId))];
    });
  }, [query.data, offset]);

  const total = query.data?.total ?? 0;
  const hasMore = items.length < total;

  const resetTo = useCallback((next: Partial<{ sort: Sort; excludeNeutral: boolean }>) => {
    if (next.sort !== undefined) setSort(next.sort);
    if (next.excludeNeutral !== undefined) setExcludeNeutral(next.excludeNeutral);
    setOffset(0);
    setItems([]);
  }, []);

  const handleChangeSort = useCallback(
    (next: Sort) => {
      if (next === sort) return;
      resetTo({ sort: next });
    },
    [sort, resetTo],
  );

  const handleChangeNeutral = useCallback(
    (next: boolean) => {
      if (next === excludeNeutral) return;
      resetTo({ excludeNeutral: next });
    },
    [excludeNeutral, resetTo],
  );

  const handleEndReached = useCallback(() => {
    if (query.isFetching || !hasMore) return;
    setOffset((o) => o + PAGE_SIZE);
  }, [query.isFetching, hasMore]);

  const handleRefresh = useCallback(() => {
    setOffset(0);
    setItems([]);
    query.refetch();
  }, [query]);

  const handleSelect = useCallback(
    (placeId: string) => {
      router.push(`/restaurant/${placeId}` as never);
    },
    [router],
  );

  const isInitialLoading = query.isLoading && items.length === 0;
  const isError = query.isError && items.length === 0;

  const listHeader = useMemo(
    () => (
      <RankingHeader
        sort={sort}
        excludeNeutral={excludeNeutral}
        onChangeSort={handleChangeSort}
        onChangeNeutral={handleChangeNeutral}
      />
    ),
    [sort, excludeNeutral, handleChangeSort, handleChangeNeutral],
  );

  return (
    // 상단 헤더(Tabs)를 숨겼으므로 상태바 영역만큼 직접 padding. 좌우/하단은
    // 탭바·기본 레이아웃이 처리.
    <View style={[styles.container, { backgroundColor: theme.colors.bg, paddingTop: insets.top }]}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.placeId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={listHeader}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleSelect(item.placeId)}
            android_ripple={{ color: theme.colors.surfaceAlt }}
          >
            <RankingRow item={item} sort={sort} />
          </Pressable>
        )}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={query.isFetching && offset === 0} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          isInitialLoading ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : isError ? (
            <View style={styles.center}>
              <Text style={{ color: theme.colors.danger }}>랭킹을 불러오지 못했습니다.</Text>
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={{ color: theme.colors.textMuted }}>
                조건에 맞는 식당이 아직 없습니다.
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
              총 {total}개
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, gap: 0 },
  sep: { height: 8 },
  center: { paddingVertical: 48, alignItems: 'center' },
  footer: { paddingVertical: 16, alignItems: 'center' },
  endText: { textAlign: 'center', fontSize: 12, paddingVertical: 16 },
});
