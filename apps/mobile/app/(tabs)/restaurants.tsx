import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import BottomSheet, {
  BottomSheetFlatList,
  BottomSheetScrollView,
  type BottomSheetBackgroundProps,
} from '@gorhom/bottom-sheet';
import { useRestaurantsPublic, useTheme } from '@repo/shared';
import type {
  RestaurantPublicListItemType,
  RestaurantPublicListQueryType,
} from '@repo/api-contract';
import { PublicRestaurantCard } from '~/components/PublicRestaurantCard';
import { PublicRestaurantsWebMap } from '~/components/PublicRestaurantsWebMap';
import { RestaurantsFloatingHeader } from '~/components/RestaurantsFloatingHeader';
import { PublicRestaurantDetail } from '~/components/restaurantDetail/PublicRestaurantDetail';

type SortKey = NonNullable<RestaurantPublicListQueryType['sort']>;
const PAGE_SIZE = 60;
// gorhom 의 % snap 은 (screenH - topInset) 기준 — '100%' 는 topInset 바로
// 아래까지 차서 헤더 sticky 와 시트가 맞붙는다.
const SNAP_POINTS = ['20%', '50%', '100%'];
// 검색 카드 onLayout 전까지 사용할 폴백 높이.
const FALLBACK_SEARCH_H = 144;

// 맛집 탭 — 네이버지도 앱식 통합 화면. 지도 전체 깔림 + 위에 floating 헤더 +
// gorhom BottomSheet 가 위에 떠 있음. 시트 안에서 list ↔ detail content swap.
// snap: 12% peek / 50% half / 92% full. snap=full 부근에서 헤더가 sticky 로
// 보간 (그림자/마진/라운드 사라짐).
export default function RestaurantsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('recent');
  const [bbox, setBbox] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<RestaurantPublicListItemType[]>([]);

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [placeId, setPlaceId] = useState<string | null>(null);
  // 검색 floating 카드 실측 높이. mapTopInset / sheetTopInset 계산에 사용.
  const [searchCardH, setSearchCardH] = useState(FALLBACK_SEARCH_H);

  const sheetRef = useRef<BottomSheet | null>(null);
  // FloatingHeader 의 보간 입력. gorhom 이 매 프레임 갱신.
  const sheetIndex = useSharedValue(1);
  // 상세 진입 직전 snap index — 복귀 시 같은 위치로.
  const snapBeforeDetailRef = useRef(1);

  const query = useRestaurantsPublic({
    q: q || undefined,
    category: category ?? undefined,
    sort,
    bbox: bbox ?? undefined,
    limit: PAGE_SIZE,
    offset,
  });

  // 같은 offset 의 page 가 다시 들어와도 중복 placeId 가 쌓이지 않도록 dedupe.
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
    (id: string) => {
      // sheetIndex.value 는 worklet SharedValue 지만 JS 에서도 동기 읽기 OK.
      const cur = Math.round(sheetIndex.value);
      snapBeforeDetailRef.current = Math.max(0, Math.min(2, cur));
      setPlaceId(id);
      setView('detail');
      sheetRef.current?.snapToIndex(1);
    },
    [sheetIndex],
  );

  const handleBack = useCallback(() => {
    setView('list');
    setPlaceId(null);
    sheetRef.current?.snapToIndex(snapBeforeDetailRef.current);
  }, []);

  // Android 하드웨어 백 — detail 일 때 가로채서 list 복귀.
  useEffect(() => {
    if (view !== 'detail') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [view, handleBack]);

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
  const isErrorEmpty = query.isError && items.length === 0;

  // list 모드: 시트가 검색 카드 바로 아래까지만 올라옴 (full 시 첫 카드가
  // sticky 뒤로 숨지 않게).
  // detail 모드: 시트가 검색 카드까지 덮을 수 있음 — full 시 검색바가 가려지고
  // 시트 안 sticky '← + 식당명' 만 노출.
  const sheetTopInset =
    view === 'detail' ? insets.top : insets.top + searchCardH;
  // 지도 floating 버튼은 view 와 무관 — 검색 카드는 detail 모드에서도 그대로
  // floating 이므로 카드 아래에 위치해야 한다.
  const mapTopInset = insets.top + searchCardH + 8;

  const handleMeasureSearch = useCallback(
    (h: number) => setSearchCardH((prev) => (prev === h ? prev : h)),
    [],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <PublicRestaurantsWebMap
        items={items}
        selectedPlaceId={placeId}
        appliedBbox={bbox}
        topInset={mapTopInset}
        onSelectMarker={handleSelect}
        onResearchInArea={handleResearchInArea}
        onClearArea={handleClearArea}
      />

      <BottomSheet
        ref={sheetRef}
        index={1}
        snapPoints={SNAP_POINTS}
        topInset={sheetTopInset}
        animatedIndex={sheetIndex}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        // 시트가 검색 floating 헤더(z=10) 보다 위. detail 모드 + full 시
        // 시트 visible 영역이 검색바를 덮어서 자연스럽게 가린다.
        containerStyle={styles.sheetContainer}
        handleIndicatorStyle={{ backgroundColor: theme.colors.border, width: 36 }}
        backgroundComponent={(bgProps) => (
          <SheetBackground
            {...bgProps}
            sheetIndex={sheetIndex}
            color={theme.colors.surface}
          />
        )}
      >
        {view === 'list' ? (
          <BottomSheetFlatList
            data={items}
            keyExtractor={(it) => it.placeId}
            contentContainerStyle={styles.listPad}
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
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={query.isFetching && offset === 0}
                onRefresh={handleRefresh}
              />
            }
            ListEmptyComponent={
              isInitialLoading ? (
                <View style={styles.center}>
                  <ActivityIndicator />
                </View>
              ) : isErrorEmpty ? (
                <View style={styles.center}>
                  <Text style={{ color: theme.colors.danger }}>
                    결과를 불러오지 못했습니다.
                  </Text>
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
        ) : placeId ? (
          <PublicRestaurantDetail
            placeId={placeId}
            Scroller={BottomSheetScrollView}
            onBack={handleBack}
          />
        ) : null}
      </BottomSheet>

      <RestaurantsFloatingHeader
        sheetIndex={sheetIndex}
        topInset={insets.top}
        onMeasure={handleMeasureSearch}
        q={q}
        category={category}
        sort={sort}
        total={total}
        onChangeQ={handleChangeQ}
        onChangeCategory={handleChangeCategory}
        onChangeSort={handleChangeSort}
      />
    </View>
  );
}

// 시트 BG — peek/half 에서는 상단 라운드 16, full 에 닿으면 라운드 0 으로 보간.
// gorhom 의 backgroundStyle prop 은 정적이라 동적 radius 가 안 돼서 별도
// component 로 빼서 Animated.View 로 처리.
const SheetBackground = ({
  style,
  sheetIndex,
  color,
}: BottomSheetBackgroundProps & {
  sheetIndex: SharedValue<number>;
  color: string;
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const idx = sheetIndex.value;
    const t = Math.min(1, Math.max(0, (idx - 1.5) / 0.5));
    return {
      borderTopLeftRadius: 16 * (1 - t),
      borderTopRightRadius: 16 * (1 - t),
    };
  });
  return (
    <Animated.View style={[style, { backgroundColor: color }, animatedStyle]} />
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  sheetContainer: { zIndex: 20 },
  listPad: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  sep: { height: 8 },
  center: { paddingVertical: 48, alignItems: 'center' },
  footer: { paddingVertical: 16, alignItems: 'center' },
  endText: { textAlign: 'center', fontSize: 12, paddingVertical: 16 },
});
