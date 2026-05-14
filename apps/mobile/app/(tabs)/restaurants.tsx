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
import { useRestaurantsPublic, useTheme } from '@repo/shared';
import type {
  RestaurantPublicListItemType,
  RestaurantPublicListQueryType,
} from '@repo/api-contract';
import { PublicRestaurantCard } from '~/components/PublicRestaurantCard';
import { PublicRestaurantsWebMap } from '~/components/PublicRestaurantsWebMap';
import { RestaurantSearchBar } from '~/components/RestaurantSearchBar';

type SortKey = NonNullable<RestaurantPublicListQueryType['sort']>;
const PAGE_SIZE = 60;

type ViewMode = 'list' | 'map';

// 맛집 탭 — 웹 RestaurantsPage 의 공개 리스트 + 지도. 모바일 UX에 맞춰:
//  - 하단 FAB 로 list/map 토글 (xl+ split 제거)
//  - hover/패널 좌우 토글 제거
//  - URL 동기화 대신 로컬 state
//  - 페이지네이션 대신 무한 스크롤 + pull-to-refresh
//  - 지도는 WebView + OpenLayers + VWorld 타일 (웹 MapCanvas 와 동일 렌더)
export default function RestaurantsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('recent');
  const [bbox, setBbox] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<RestaurantPublicListItemType[]>([]);
  const [view, setView] = useState<ViewMode>('list');

  const query = useRestaurantsPublic({
    q: q || undefined,
    category: category ?? undefined,
    sort,
    bbox: bbox ?? undefined,
    limit: PAGE_SIZE,
    offset,
  });

  // 같은 offset 의 query.data 가 다시 들어와도 중복 placeId 가 안 쌓이도록 dedupe.
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

  const handleResearchInArea = useCallback(
    (next: string) => {
      setBbox(next);
      reset();
    },
    [reset],
  );

  const handleClearArea = useCallback(() => {
    setBbox(null);
    reset();
  }, [reset]);

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
    // 상단 헤더(Tabs) 숨김. list 모드는 검색바가 노치 밑에서 시작하도록
    // paddingTop=insets.top; map 모드는 지도 타일이 edge-to-edge 가 자연
    // (Naver/Kakao 지도 패턴). map 모드의 floating 버튼(재검색/전체 영역) 은
    // WebMap 안에서 topInset 만큼 띄워 노치를 피한다.
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.bg,
          paddingTop: view === 'list' ? insets.top : 0,
        },
      ]}
    >
      {view === 'list' ? (
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
            <RefreshControl
              refreshing={query.isFetching && offset === 0}
              onRefresh={handleRefresh}
            />
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
      ) : (
        <PublicRestaurantsWebMap
          items={items}
          selectedPlaceId={null}
          appliedBbox={bbox}
          topInset={insets.top}
          onSelectMarker={handleSelect}
          onResearchInArea={handleResearchInArea}
          onClearArea={handleClearArea}
        />
      )}

      <View style={styles.fabWrap} pointerEvents="box-none">
        <View
          style={[
            styles.fab,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <ToggleBtn
            label={`목록 (${total})`}
            active={view === 'list'}
            onPress={() => setView('list')}
          />
          <ToggleBtn label="지도" active={view === 'map'} onPress={() => setView('map')} />
        </View>
      </View>
    </View>
  );
}

const ToggleBtn = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.fabBtn, active && { backgroundColor: theme.colors.primary }]}
    >
      <Text
        style={[
          styles.fabBtnText,
          { color: active ? theme.colors.primaryText : theme.colors.textMuted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16 },
  sep: { height: 8 },
  center: { paddingVertical: 48, alignItems: 'center' },
  footer: { paddingVertical: 16, alignItems: 'center' },
  endText: { textAlign: 'center', fontSize: 12, paddingVertical: 16 },
  fabWrap: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  fabBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  fabBtnText: { fontSize: 13, fontWeight: '600' },
});
