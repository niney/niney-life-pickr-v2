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
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import BottomSheet, {
  BottomSheetFlatList,
  BottomSheetScrollView,
  type BottomSheetBackgroundProps,
} from '@gorhom/bottom-sheet';
import { useRestaurantsPublic, useTheme } from '@repo/shared';
import { computeBboxAround, isInKorea } from '@repo/utils';
import type {
  RestaurantPublicListItemType,
  RestaurantPublicListQueryType,
} from '@repo/api-contract';
import { PublicRestaurantCard } from '~/components/PublicRestaurantCard';
import { PublicRestaurantsWebMap } from '~/components/PublicRestaurantsWebMap';
import { RestaurantsFloatingHeader } from '~/components/RestaurantsFloatingHeader';
import { PublicRestaurantDetail } from '~/components/restaurantDetail/PublicRestaurantDetail';
import { useUserLocationNative } from '~/hooks/useUserLocationNative';

type SortKey = NonNullable<RestaurantPublicListQueryType['sort']>;
const PAGE_SIZE = 60;
// 권한 거부/한국 밖일 때 폴백 — 서울시청.
const SEOUL: { lat: number; lng: number } = { lat: 37.5665, lng: 126.978 };

// 첫 진입 시 자동 적용할 bbox 의 반경. 사용자 위치(granted) 든 서울(denied)
// 든 동일하게 ±1.5km — "현재 보고 있는 위치에서만" 일관 멘탈 모델. 웹의
// RestaurantsV2Page 와 동일 값으로 통일.
const INITIAL_NEARBY_KM = 1.5;

const formatBbox = (b: {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}): string =>
  // PublicRestaurantsWebMap 의 formatBbox 와 동일 — 소수점 5자리.
  [b.minLng, b.minLat, b.maxLng, b.maxLat].map((n) => n.toFixed(5)).join(',');
// gorhom 의 % snap 은 (screenH - topInset) 기준 — '100%' 는 topInset 바로
// 아래까지 차서 헤더 sticky 와 시트가 맞붙는다.
const SNAP_POINTS = ['20%', '50%', '100%'];
// 검색 카드 onLayout 전까지 사용할 폴백 높이.
const FALLBACK_SEARCH_H = 144;

// 맛집 탭 — 네이버지도 앱식 통합 화면. 지도 전체 깔림 + 위에 floating 헤더 +
// gorhom BottomSheet 2개 적층 (list / detail 독립). list 시트는 항상 mount,
// detail 시트는 평소 닫힘 (index=-1) 으로 placeId 선택 시 위로 슬라이드.
// children swap 이 없어 BottomSheetFlatList 가 unmount 되지 않고 스크롤이
// 자연 보존된다. snap=full 부근에서 헤더가 sticky 로 보간 (그림자/마진/라운드).
export default function RestaurantsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('recent');
  const [bbox, setBbox] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<RestaurantPublicListItemType[]>([]);

  // 권한 체크는 vworld 초기화(WebView mount) 전에 끝낸다. resolved 가 되기
  // 전에는 단순 View+Text 로딩 화면 — WebView 가 mount 안 됨 → 마운트 후
  // unmount/remount swap 이 reanimated worklet 와 충돌하던 이전 버그 회피.
  // 페이지 진입 시 한 번 트리거. refetch 는 "내 위치" 버튼에서.
  const userLoc = useUserLocationNative();
  const triggeredRef = useRef(false);
  useEffect(() => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    userLoc.refetch();
    // refetch 만 deps — userLoc 객체 자체는 매 렌더 새 인스턴스라 deps 두면
    // effect 가 자주 재실행 시도. refetch 는 useCallback([]) 으로 stable.
  }, [userLoc.refetch]);

  // resolved: 권한 결과가 확정된 상태. idle/pending 동안엔 WebView 안 띄움.
  const resolved =
    userLoc.status === 'granted' ||
    userLoc.status === 'denied' ||
    userLoc.status === 'unavailable';

  // 시작 좌표: granted + 한국 안 → 사용자 좌표 / 그 외 → 서울.
  // vworld 가 한국 영토만 커버해서 한국 밖 좌표는 타일 전부 404.
  const usableUserCoords =
    userLoc.status === 'granted' &&
    userLoc.coords &&
    isInKorea(userLoc.coords)
      ? userLoc.coords
      : null;
  const initialCenter = usableUserCoords ?? SEOUL;

  // focusCoord — 사용자가 "내 위치" 재요청해서 결과가 들어오면 flyTo. 첫 진입
  // 의 initialCenter 는 HTML 에 박혀 처리되므로 여기선 null 로 두고, 이후
  // refetch 결과(granted든 denied든)로 새 객체가 들어오면 발사.
  const [focusCoord, setFocusCoord] = useState<{ lat: number; lng: number } | null>(null);
  const manualRequestRef = useRef(false);

  // 첫 진입 자동 bbox — 권한 결정(granted/denied/unavailable) 후 1회. granted +
  // 한국이면 사용자 좌표, 그 외엔 서울 좌표 ±1.5km. "현재 보고 있는 위치에서만"
  // 일관 멘탈 모델. bbox 가 이미 들어 있으면(딥링크 등 — 현재 모바일은 없지만
  // 보존성 차원에서) 덮어쓰지 않는다.
  const appliedGeoBboxRef = useRef(false);
  useEffect(() => {
    if (appliedGeoBboxRef.current) return;
    if (userLoc.status === 'idle' || userLoc.status === 'pending') return;
    appliedGeoBboxRef.current = true;
    if (bbox) return;
    const center =
      userLoc.status === 'granted' &&
      userLoc.coords &&
      isInKorea(userLoc.coords)
        ? userLoc.coords
        : SEOUL;
    setBbox(formatBbox(computeBboxAround(center, INITIAL_NEARBY_KM)));
    // bbox 변경에 따른 페이지 reset. reset() 콜백은 아직 선언 전이라 직접 호출.
    // items 는 자동 교체(useEffect offset===0 분기)에 맡김.
    setOffset(0);
  }, [userLoc.status, userLoc.coords, bbox]);

  useEffect(() => {
    if (!manualRequestRef.current) return;
    // pending/idle 동안은 대기 — 결과 도착 시 한 번에 결정.
    if (userLoc.status === 'pending' || userLoc.status === 'idle') return;
    manualRequestRef.current = false;
    if (
      userLoc.status === 'granted' &&
      userLoc.coords &&
      isInKorea(userLoc.coords)
    ) {
      // 사용자 위치로 fly + 그 주변 ±1.5km 로 bbox 강제 적용 (사용자 명시 의도).
      setFocusCoord({ lat: userLoc.coords.lat, lng: userLoc.coords.lng });
      setBbox(formatBbox(computeBboxAround(userLoc.coords, INITIAL_NEARBY_KM)));
      setOffset(0);
    } else {
      // 권한 거부/한국 밖이면 시각적으로 서울 폴백만 — 사용자가 보고 있던 검색
      // 결과(bbox) 는 그대로 둔다. 사용자가 의도적으로 누른 한 번의 액션으로
      // 기존 검색을 갈아엎는 건 너무 침습적.
      setFocusCoord({ ...SEOUL });
    }
  }, [userLoc.status, userLoc.coords]);

  // Promise<UserLocationResult> 를 그대로 패스 — 호출자(PublicRestaurantsWebMap)
  // 가 await 해서 분기 (denied 상태에서 시스템 설정 다녀온 사용자가 클릭한
  // 경우 silent refetch 로 풀리거나, 여전히 막혀 있으면 Alert).
  const handleRequestLocation = useCallback(() => {
    manualRequestRef.current = true;
    return userLoc.refetch();
  }, [userLoc.refetch]);

  // detail 표시 여부는 placeId 존재로 판단. 별도 view 상태 불필요.
  const [placeId, setPlaceId] = useState<string | null>(null);
  // 검색 floating 카드 실측 높이. mapTopInset / sheetTopInset 계산에 사용.
  const [searchCardH, setSearchCardH] = useState(FALLBACK_SEARCH_H);

  // list / detail 각각 독립된 BottomSheet ref.
  const listSheetRef = useRef<BottomSheet | null>(null);
  const detailSheetRef = useRef<BottomSheet | null>(null);
  // 각 시트의 animatedIndex (gorhom 이 매 프레임 갱신).
  const listSheetIndex = useSharedValue(1);
  const detailSheetIndex = useSharedValue(-1);
  // FloatingHeader 보간 입력 — 현재 보이는 시트의 index. detail 열림 여부에
  // 따라 list / detail 중 활성 시트의 값을 따라간다.
  const detailOpenSV = useSharedValue(0);
  const headerSheetIndex = useDerivedValue(() => {
    'worklet';
    const v =
      detailOpenSV.value === 1 ? detailSheetIndex.value : listSheetIndex.value;
    // detail 이 닫힘 상태(-1) 일 때 헤더가 음수 보간 영역으로 가지 않도록 클램프.
    return Math.max(0, v);
  });
  // 상세 진입 직전 list snap index — 복귀 시 같은 위치로.
  const listSnapBeforeDetailRef = useRef(1);

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

  // offset 만 0 으로. items 는 비우지 않고 query 결과 도착 시 offset===0 분기
  // 에서 자동 교체 (위 useEffect). 빈 화면 1프레임 깜빡임이 없어지고, 새 결과
  // 가 들어올 때까지 이전 결과가 잠시 stale 로 보임 (네이버지도/카카오맵 패턴).
  const reset = useCallback(() => {
    setOffset(0);
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

  // RefreshControl 의 refreshing 을 query.isFetching 직접 의존에서 떼어내고
  // pull-to-refresh 액션에만 한정. 직접 의존하면 setBbox 등 다른 경로로
  // isFetching 이 빠르게 토글될 때 RefreshControl re-render 가 BottomSheetFlatList
  // 의 reanimated 스크롤 worklet 과 race → 네이티브 스택 폭주.
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setPullRefreshing(true);
    reset();
    try {
      await query.refetch();
    } finally {
      setPullRefreshing(false);
    }
  }, [reset, query.refetch]);

  const handleSelect = useCallback(
    (id: string) => {
      // list 현재 snap 저장 → 복귀 시 복원. list 시트는 peek 으로 내려서
      // detail 위로 비어져 보이지 않게 한다 (detail 50%, list 20%).
      const cur = Math.round(listSheetIndex.value);
      listSnapBeforeDetailRef.current = Math.max(0, Math.min(2, cur));
      setPlaceId(id);
      detailOpenSV.value = 1;
      listSheetRef.current?.snapToIndex(0);
      // detail 시트는 placeId 가 truthy 일 때만 conditional mount.
      // 마운트와 동시에 index=1 로 열려 race 없이 entry 애니메이션이 재생됨.
    },
    [listSheetIndex, detailOpenSV],
  );

  // detail 닫고 list 복원 — handleBack(즉시 unmount) / onClose(pan-down 후) 공통.
  const closeDetail = useCallback(() => {
    setPlaceId(null);
    detailOpenSV.value = 0;
    listSheetRef.current?.snapToIndex(listSnapBeforeDetailRef.current);
  }, [detailOpenSV]);

  // 뒤로가기 — close() 애니메이션 스킵하고 setPlaceId(null) 로 시트를 즉시
  // unmount. 빠른 복귀 UX.
  const handleBack = closeDetail;
  // pan-down-to-close 경로 — gorhom 닫힘 애니메이션 완료 후 호출.
  const handleDetailClose = closeDetail;

  // Android 하드웨어 백 — detail 일 때 가로채서 list 복귀.
  useEffect(() => {
    if (!placeId) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [placeId, handleBack]);

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

  // list 시트: 검색 카드 바로 아래까지만 올라옴 (full 시 첫 카드가 sticky 뒤로
  // 숨지 않게).
  // detail 시트: 검색 카드까지 덮을 수 있음 — full 시 검색바가 가려지고 시트 안
  // sticky '← + 식당명' 만 노출.
  const listTopInset = insets.top + searchCardH;
  const detailTopInset = insets.top;
  // 지도 floating 버튼은 검색 카드 아래에 위치 — 검색 카드는 항상 floating.
  const mapTopInset = insets.top + searchCardH + 8;

  const handleMeasureSearch = useCallback(
    (h: number) => setSearchCardH((prev) => (prev === h ? prev : h)),
    [],
  );

  // 권한 미해결 단계 — 단순 View+Text 로딩만. reanimated/svg 없는 순정
  // 컴포넌트라 worklets 충돌 없음. resolved 이후엔 같은 트리에 WebView mount.
  if (!resolved) {
    return (
      <View
        style={[
          styles.container,
          styles.bootCenter,
          { backgroundColor: theme.colors.bg },
        ]}
      >
        <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
          위치 확인 중…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <PublicRestaurantsWebMap
        items={items}
        selectedPlaceId={placeId}
        appliedBbox={bbox}
        topInset={mapTopInset}
        initialCenter={initialCenter}
        focusCoord={focusCoord}
        locationStatus={userLoc.status}
        onRequestLocation={handleRequestLocation}
        onSelectMarker={handleSelect}
        onResearchInArea={handleResearchInArea}
        onClearArea={handleClearArea}
      />

      {/* list 시트 — 항상 mount. children=FlatList 고정이라 unmount 발생 X.
          시트가 검색 floating 헤더(z=10) 보다 위 (z=20). */}
      <BottomSheet
        ref={listSheetRef}
        index={1}
        snapPoints={SNAP_POINTS}
        topInset={listTopInset}
        animatedIndex={listSheetIndex}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        containerStyle={styles.listSheetContainer}
        handleIndicatorStyle={{ backgroundColor: theme.colors.border, width: 36 }}
        backgroundComponent={(bgProps) => (
          <SheetBackground
            {...bgProps}
            sheetIndex={listSheetIndex}
            color={theme.colors.surface}
          />
        )}
      >
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
              refreshing={pullRefreshing}
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
      </BottomSheet>

      {/* detail 시트 — placeId 가 있을 때만 mount. 마운트와 동시에 index=1
          로 열리며 entry 애니메이션 재생. handleBack 또는 pan-down-to-close →
          onClose → setPlaceId(null) 로 unmount. z=30 으로 list 시트(z=20)
          위에 적층. (index=-1 초기 마운트 시 발생하던 첫 진입 race 회피.) */}
      {placeId ? (
        <BottomSheet
          ref={detailSheetRef}
          index={1}
          snapPoints={SNAP_POINTS}
          topInset={detailTopInset}
          animatedIndex={detailSheetIndex}
          enablePanDownToClose
          onClose={handleDetailClose}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          containerStyle={styles.detailSheetContainer}
          handleIndicatorStyle={{
            backgroundColor: theme.colors.border,
            width: 36,
          }}
          backgroundComponent={(bgProps) => (
            <SheetBackground
              {...bgProps}
              sheetIndex={detailSheetIndex}
              color={theme.colors.surface}
            />
          )}
        >
          <PublicRestaurantDetail
            placeId={placeId}
            Scroller={BottomSheetScrollView}
            onBack={handleBack}
          />
        </BottomSheet>
      ) : null}

      <RestaurantsFloatingHeader
        sheetIndex={headerSheetIndex}
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
  bootCenter: { alignItems: 'center', justifyContent: 'center' },
  // detail 시트가 list 시트 위로 적층되도록 z 분리.
  listSheetContainer: { zIndex: 20 },
  detailSheetContainer: { zIndex: 30 },
  listPad: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  sep: { height: 8 },
  center: { paddingVertical: 48, alignItems: 'center' },
  footer: { paddingVertical: 16, alignItems: 'center' },
  endText: { textAlign: 'center', fontSize: 12, paddingVertical: 16 },
});
