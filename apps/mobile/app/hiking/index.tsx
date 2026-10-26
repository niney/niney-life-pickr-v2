import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetFlatList, type BottomSheetBackgroundProps } from '@gorhom/bottom-sheet';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import {
  HIKING_DEFAULT_SORT,
  SEOUL_CITY_HALL,
  rankMountains,
  useAirLocation,
  useHikingCourse,
  useHikingMountain,
  useHikingMountains,
  useTheme,
  type HikingSort,
  type RankedMountain,
} from '@repo/shared';
import { isInKorea } from '@repo/utils';
import { TransitMapView } from '~/components/transit/TransitMapView';
import type { TransitMapHandle } from '~/components/transit/useTransitMapSync';
import type { BridgeViewport } from '~/components/transit/transitMapBridge';
import { HikingCoursePanel } from '~/components/hiking/HikingCoursePanel';
import { HikingHeader } from '~/components/hiking/HikingHeader';
import { HikingMountainPanel } from '~/components/hiking/HikingMountainPanel';
import { HikingMountainRow } from '~/components/hiking/HikingMountainRow';
import {
  bboxCorners,
  buildCourseLines,
  buildMountainMarkers,
  buildPoiMarkers,
  mountainMarkerId,
  parseHikingMarkerId,
  poiMarkerId,
} from '~/components/hiking/hikingBridge';
import { useUserLocationNative } from '~/hooks/useUserLocationNative';

// 등산(앱) — 100대 명산·전국 주요 봉우리·국립공원 공식 코스. 일상지도와 같은 골격: WebView 지도(TransitMapView) 풀블리드 +
// 플로팅 헤더(뒤로·검색·내 위치·정렬) + 목록 시트(산 목록) + 고르면 상세 시트(산 → 코스). 데이터·문구 규칙은 웹과 공용
// (@repo/shared 훅·hikingFormat, @repo/utils). 진입 파라미터 m(산)·c(코스). 추천·산행 조건·가는 법은 다음 차수.

const KOREA = { lat: 36.4, lng: 127.8 };
const START_ZOOM = 7;
const VIEWPORT_DEBOUNCE_MS = 250;
const SNAP_POINTS = ['20%', '50%', '100%'];
const SHEET_TOP_UNSET = 10_000;
const FIT_PADDING = 48;

const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export default function HikingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ m?: string; c?: string }>();

  const [q, setQ] = useState('');
  const [sort, setSort] = useState<HikingSort>(HIKING_DEFAULT_SORT);
  const [mountainId, setMountainId] = useState<string | null>(() => first(params.m));
  const [courseId, setCourseId] = useState<string | null>(() => (first(params.m) ? first(params.c) : null));
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);

  const mountainsQ = useHikingMountains();
  const mountainQ = useHikingMountain(mountainId);
  const courseQ = useHikingCourse(courseId);

  // 거리 기준 — 내 위치(버튼) → 저장한 내 위치(날씨·대기와 공유) → 서울 시청(웹과 같은 기본).
  const saved = useAirLocation().location;
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const savedLat = saved?.lat ?? null;
  const savedLng = saved?.lng ?? null;
  const origin = useMemo(
    () => myLocation ?? (savedLat !== null && savedLng !== null ? { lat: savedLat, lng: savedLng } : SEOUL_CITY_HALL),
    [myLocation, savedLat, savedLng],
  );
  const ranked = useMemo<RankedMountain[]>(
    () => rankMountains(mountainsQ.data?.items ?? [], { q, group: null, sort, origin }),
    [mountainsQ.data, q, sort, origin],
  );

  // ── 뷰포트(250ms 디바운스) — 줌 10 아래는 100대 명산만, 위는 보이는 영역 안 산 ──
  const mapRef = useRef<TransitMapHandle>(null);
  const [viewport, setViewport] = useState<BridgeViewport | null>(null);
  const [debouncedViewport, setDebouncedViewport] = useState<BridgeViewport | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedViewport(viewport), VIEWPORT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [viewport]);

  const mountain = mountainQ.data ?? null;
  const course = courseQ.data ?? null;
  const bridge = useMemo(() => {
    if (course && courseId) return buildPoiMarkers(course);
    return buildMountainMarkers(ranked.map((r) => r.mountain), debouncedViewport, mountainId);
  }, [course, courseId, ranked, debouncedViewport, mountainId]);
  const routeLines = useMemo(() => (mountain && mountainId ? buildCourseLines(mountain, courseId) : null), [mountain, mountainId, courseId]);
  const selectedMarkerId = courseId ? (selectedPoiId ? poiMarkerId(selectedPoiId) : null) : mountainId ? mountainMarkerId(mountainId) : null;

  // ── 시트 ──
  const listSheetRef = useRef<BottomSheet>(null);
  const listSheetIndex = useSharedValue(1);
  const detailSheetIndex = useSharedValue(1);
  const listSheetTop = useSharedValue(SHEET_TOP_UNSET);
  const detailSheetTop = useSharedValue(SHEET_TOP_UNSET);
  const [headerCardH, setHeaderCardH] = useState(0);
  const handleMeasureHeader = useCallback((h: number) => setHeaderCardH((prev) => (Math.abs(prev - h) < 1 ? prev : h)), []);
  const listTopInset = insets.top + headerCardH;
  const detailTopInset = insets.top;
  const mapTopInset = insets.top + headerCardH + 8;
  const [containerH, setContainerH] = useState(0);
  const [mapBottomInset, setMapBottomInset] = useState(0);
  const handleMeasureContainer = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setContainerH((prev) => (prev === h ? prev : h));
  }, []);
  const syncMapBottomInset = useCallback(() => {
    const top = Math.min(listSheetTop.value, detailSheetTop.value);
    if (!containerH || top >= SHEET_TOP_UNSET) return;
    const covered = Math.max(0, Math.round(containerH - top));
    setMapBottomInset((prev) => (Math.abs(prev - covered) < 8 ? prev : covered));
  }, [containerH, listSheetTop, detailSheetTop]);
  const detailVisible = mountainId !== null;
  const detailOpenSV = useSharedValue(0);
  const headerSheetIndex = useDerivedValue(() => {
    'worklet';
    const v = detailOpenSV.value === 1 ? detailSheetIndex.value : listSheetIndex.value;
    return Math.max(0, v);
  });
  useEffect(() => {
    detailOpenSV.value = detailVisible ? 1 : 0;
    if (!detailVisible) detailSheetTop.value = SHEET_TOP_UNSET;
    syncMapBottomInset();
  }, [detailVisible, detailOpenSV, detailSheetTop, syncMapBottomInset]);

  // ── 지도 맞추기(외부 시스템 = WebView 지도): 산·코스가 바뀌어 데이터가 오면 그 선이 시트 위에 보이게 한 번 ──
  // 지도가 준비되기 전에 보낸 명령은 버려진다(WebView 에 __cmd 가 아직 없다) — 첫 뷰포트 알림(첫 렌더 뒤)을 준비 신호로 본다.
  // ?m= 로 들어오면 산 데이터가 지도보다 먼저 올 수 있다.
  const mapReady = viewport !== null;
  const fittedRef = useRef<string | null>(null);
  useEffect(() => {
    const key = course && courseId ? `c:${course.id}` : mountain && mountainId && !courseId ? `m:${mountain.id}` : null;
    if (!key || !mapReady || fittedRef.current === key) return;
    fittedRef.current = key;
    const boxes = course && courseId ? [course.bbox] : mountain!.courses.length > 0 ? mountain!.courses.map((c) => c.bbox) : [mountain!.bbox];
    mapRef.current?.fitToCoords(bboxCorners(boxes), FIT_PADDING, { belowInset: true });
  }, [course, courseId, mountain, mountainId, mapReady]);

  // ── 고르기 ──
  const selectMountain = useCallback((id: string) => {
    setMountainId(id);
    setCourseId(null);
    setSelectedPoiId(null);
    fittedRef.current = null;
    listSheetRef.current?.snapToIndex(0);
  }, []);
  const closeMountain = useCallback(() => {
    setMountainId(null);
    setCourseId(null);
    setSelectedPoiId(null);
    fittedRef.current = null;
  }, []);
  const selectCourse = useCallback((id: string) => {
    setCourseId(id);
    setSelectedPoiId(null);
  }, []);
  const closeCourse = useCallback(() => {
    setCourseId(null);
    setSelectedPoiId(null);
    fittedRef.current = null;
  }, []);
  const handleMarkerSelect = useCallback(
    (markerId: string) => {
      const parsed = parseHikingMarkerId(markerId);
      if (!parsed) return;
      if (parsed.kind === 'mountain') selectMountain(parsed.id);
      else setSelectedPoiId(parsed.id);
    },
    [selectMountain],
  );
  const handleSelectPoi = useCallback((id: string, lat: number, lng: number) => {
    setSelectedPoiId(id);
    mapRef.current?.flyTo(lat, lng, 15);
  }, []);

  // ── 내 위치 ──
  const userLoc = useUserLocationNative();
  const [locating, setLocating] = useState(false);
  const locate = useCallback(async () => {
    setLocating(true);
    try {
      const r = await userLoc.refetch();
      if (r.status === 'granted' && r.coords) {
        if (!isInKorea(r.coords)) {
          Alert.alert('서비스 지역 밖', '현재 위치가 서비스 지역(한국) 밖이에요.');
          return;
        }
        setMyLocation(r.coords);
        mapRef.current?.flyTo(r.coords.lat, r.coords.lng, 11);
        return;
      }
      if (r.status === 'pending' || r.status === 'idle') return;
      Alert.alert(
        '위치 권한 필요',
        r.status === 'denied' ? '위치 권한이 꺼져 있어요. 설정에서 허용한 뒤 다시 시도해 주세요.' : '이 환경에서는 위치를 사용할 수 없어요. 설정을 확인해 주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '설정 열기', onPress: () => Linking.openSettings().catch(() => {}) },
        ],
      );
    } finally {
      setLocating(false);
    }
  }, [userLoc]);

  const sheetBottomPad = insets.bottom + 24;
  const originLabel = myLocation ? '내 위치' : saved ? '저장한 내 위치' : '서울 시청';
  const items = mountainsQ.data?.items;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]} onLayout={handleMeasureContainer}>
        <TransitMapView
          ref={mapRef}
          initialCenter={{ ...KOREA, zoom: START_ZOOM }}
          markers={bridge.markers}
          markerIcons={bridge.icons}
          selectedId={selectedMarkerId}
          routeLines={routeLines}
          myLocation={myLocation}
          topInset={mapTopInset}
          viewBottomInset={mapBottomInset}
          onSelectMarker={handleMarkerSelect}
          onViewportSync={setViewport}
        />

        <BottomSheet
          ref={listSheetRef}
          index={1}
          snapPoints={SNAP_POINTS}
          enableDynamicSizing={false}
          topInset={listTopInset}
          animatedIndex={listSheetIndex}
          animatedPosition={listSheetTop}
          onChange={syncMapBottomInset}
          containerStyle={styles.listSheetContainer}
          handleIndicatorStyle={{ backgroundColor: theme.colors.border, width: 36 }}
          backgroundComponent={(bgProps) => <SheetBackground {...bgProps} sheetIndex={listSheetIndex} color={theme.colors.surface} />}
        >
          <BottomSheetFlatList
            data={ranked}
            keyExtractor={(r: RankedMountain) => r.mountain.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.listPad, { paddingBottom: sheetBottomPad }]}
            initialNumToRender={20}
            windowSize={7}
            ListHeaderComponent={
              items ? (
                <Text style={[styles.count, { color: theme.colors.textMuted }]}>
                  {ranked.length.toLocaleString('ko-KR')}개 산{sort === 'near' ? ` · ${originLabel} 기준` : ''}
                </Text>
              ) : null
            }
            renderItem={({ item }: { item: RankedMountain }) => (
              <HikingMountainRow mountain={item.mountain} distM={sort === 'near' ? item.distM : null} onPress={() => selectMountain(item.mountain.id)} />
            )}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
                {mountainsQ.isLoading ? '산 목록을 불러오는 중…' : mountainsQ.isError ? '산 목록을 불러오지 못했습니다.' : '검색에 맞는 산이 없습니다.'}
              </Text>
            }
            ListFooterComponent={
              items ? (
                <Text style={[styles.footer, { color: theme.colors.textMuted }]}>
                  코스·지점은 100대 명산 2022년 1월·전국 주요 봉우리 2022년 11월·국립공원 공식 코스 2024년 2월 기준 자료입니다. 입산통제·탐방로
                  폐쇄·공사는 반영되지 않으니 산행 전 국립공원·지자체 안내를 확인하세요. 출처 한국등산트레킹지원센터·행정안전부 산행안전지도(국립공원공단)·
                  산림청(공공데이터포털), 지형 고도 SRTM(U.S. Geological Survey).
                </Text>
              ) : null
            }
          />
        </BottomSheet>

        {detailVisible ? (
          <BottomSheet
            index={1}
            snapPoints={SNAP_POINTS}
            enableDynamicSizing={false}
            topInset={detailTopInset}
            animatedIndex={detailSheetIndex}
            animatedPosition={detailSheetTop}
            onChange={syncMapBottomInset}
            containerStyle={styles.detailSheetContainer}
            handleIndicatorStyle={{ backgroundColor: theme.colors.border, width: 36 }}
            backgroundComponent={(bgProps) => <SheetBackground {...bgProps} sheetIndex={detailSheetIndex} color={theme.colors.surface} />}
          >
            {courseId ? (
              <HikingCoursePanel
                course={course}
                loading={courseQ.isLoading && !course}
                error={courseQ.isError && !course}
                onBack={closeCourse}
                onSelectPoi={handleSelectPoi}
                bottomPad={sheetBottomPad}
              />
            ) : (
              <HikingMountainPanel
                mountain={mountain}
                loading={mountainQ.isLoading && !mountain}
                error={mountainQ.isError && !mountain}
                onBack={closeMountain}
                onSelectCourse={selectCourse}
                bottomPad={sheetBottomPad}
              />
            )}
          </BottomSheet>
        ) : null}

        <HikingHeader
          topInset={insets.top}
          sheetIndex={headerSheetIndex}
          q={q}
          onChangeQ={setQ}
          sort={sort}
          onSort={setSort}
          onBack={() => router.back()}
          onLocate={() => void locate()}
          locating={locating}
          onMeasure={handleMeasureHeader}
        />
      </View>
    </>
  );
}

const SheetBackground = ({ style, sheetIndex, color }: BottomSheetBackgroundProps & { sheetIndex: SharedValue<number>; color: string }) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const t = Math.min(1, Math.max(0, (sheetIndex.value - 1.5) / 0.5));
    return { borderTopLeftRadius: 16 * (1 - t), borderTopRightRadius: 16 * (1 - t) };
  });
  return <Animated.View style={[style, { backgroundColor: color }, animatedStyle]} />;
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  listSheetContainer: { zIndex: 20 },
  detailSheetContainer: { zIndex: 30 },
  listPad: { paddingHorizontal: 12, paddingTop: 2 },
  count: { fontSize: 12, paddingVertical: 6 },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  footer: { fontSize: 11, lineHeight: 16, paddingTop: 12 },
});
