import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetFlatList, type BottomSheetBackgroundProps } from '@gorhom/bottom-sheet';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useAirLocation,
  useLifeMapDetail,
  useLifeMapNearby,
  useLifeMapPoints,
  useLifeMapStatus,
  useTheme,
} from '@repo/shared';
import type { LifeMapCellType, LifeMapNearbyItemType } from '@repo/api-contract';
import {
  LIFE_MAP_POINT_MIN_ZOOM,
  approxDistanceM,
  buildAirSavedLocationMarkerDataUrl,
  formatBbox,
  isInKorea,
  isLifeMapLayer,
  parseLatLngParam,
  type LifeMapLayer,
} from '@repo/utils';
import { TransitMapView } from '~/components/transit/TransitMapView';
import type { TransitMapHandle } from '~/components/transit/useTransitMapSync';
import type { BridgeMarker, BridgeViewport } from '~/components/transit/transitMapBridge';
import { LifeDetailPanel } from '~/components/lifeMap/LifeDetailPanel';
import { LifeFilterRows } from '~/components/lifeMap/LifeFilterRows';
import { LifeFooter } from '~/components/lifeMap/LifeFooter';
import { LifeGoToModal, type LifeGoToTarget } from '~/components/lifeMap/LifeGoToModal';
import { LifeMapHeader } from '~/components/lifeMap/LifeMapHeader';
import { LifeNearbyEmpty, LifeNearbyHeader, LifeNearbyRow } from '~/components/lifeMap/LifeNearbyRows';
import { buildLifeBridgeMarkers, lifeCellAt, parseLifeMarkerId } from '~/components/lifeMap/lifeMapBridgeMarkers';
import { useUserLocationNative } from '~/hooks/useUserLocationNative';
import { useLifeMapPrefsStore } from '~/lib/lifeMapPrefsStore';

// 일상지도(앱) — 전국 CCTV·공중화장실을 한 지도에. 대중교통 탭과 같은 골격: WebView 지도(TransitMapView)
// 풀블리드 + 플로팅 헤더(뒤로·이동 검색·레이어 칩·내 위치) + List 시트(필터 행 → 주변 목록 → 범례/출처)
// + 선택 시 Detail 시트. 데이터 훅·마커 규칙은 웹과 공용(@repo/shared·@repo/utils), 마커는 브리지 아이콘
// 사전으로 보내 수천 점에도 페이로드가 작다. 진입 중심은 파라미터(ll) → 저장한 내 위치(날씨·대기와 공유)
// → 서울시청. 지도를 움직이면 뷰포트(bbox·줌)로 점/셀을 다시 받고, 주변 목록은 지도 중심 기준.

const SEOUL = { lat: 37.5665, lng: 126.978 };
const DEFAULT_ZOOM = 15;
const NEARBY_RADIUS_M: Record<LifeMapLayer, number> = { toilet: 1000, cctv: 500 };
const NEARBY_LIMIT = 15;
const VIEWPORT_DEBOUNCE_MS = 250;
const SNAP_POINTS = ['20%', '50%', '100%'];
const SHEET_TOP_UNSET = 10_000;
const SAVED_LOCATION_ICON = buildAirSavedLocationMarkerDataUrl();

const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const parseSel = (raw: string | null): { layer: LifeMapLayer; id: string } | null => {
  if (!raw) return null;
  const i = raw.indexOf(':');
  if (i <= 0) return null;
  const layer = raw.slice(0, i);
  const id = raw.slice(i + 1);
  return isLifeMapLayer(layer) && id.length > 0 ? { layer, id } : null;
};

export default function LifeMapScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ ll?: string; sel?: string }>();

  const layers = useLifeMapPrefsStore((s) => s.layers);
  const purposes = useLifeMapPrefsStore((s) => s.purposes);
  const toiletFilters = useLifeMapPrefsStore((s) => s.toiletFilters);
  const toggleLayer = useLifeMapPrefsStore((s) => s.toggleLayer);
  const togglePurpose = useLifeMapPrefsStore((s) => s.togglePurpose);
  const clearPurposes = useLifeMapPrefsStore((s) => s.clearPurposes);
  const toggleToiletFilter = useLifeMapPrefsStore((s) => s.toggleToiletFilter);

  // 저장한 내 위치(날씨·대기·홈 카드와 공유) — 진입 중심 후보 + 보라 점 오버레이.
  const airLocation = useAirLocation();
  const saved = airLocation.location;
  const [initialCenter] = useState(() => {
    const ll = parseLatLngParam(first(params.ll));
    if (ll) return { lat: ll.lat, lng: ll.lng, zoom: DEFAULT_ZOOM, fromSaved: false };
    if (saved) return { lat: saved.lat, lng: saved.lng, zoom: DEFAULT_ZOOM, fromSaved: true };
    return { ...SEOUL, zoom: DEFAULT_ZOOM, fromSaved: false };
  });
  const mapRef = useRef<TransitMapHandle>(null);
  const userMovedRef = useRef(false);
  const flownToSavedRef = useRef(initialCenter.fromSaved || first(params.ll) !== null);
  useEffect(() => {
    if (!saved || flownToSavedRef.current || userMovedRef.current) return;
    flownToSavedRef.current = true;
    mapRef.current?.flyTo(saved.lat, saved.lng, DEFAULT_ZOOM);
  }, [saved]);

  // ── 뷰포트(모든 moveend) → 250ms 디바운스 → 조회 키 ──
  const [viewport, setViewport] = useState<BridgeViewport | null>(null);
  const [debouncedViewport, setDebouncedViewport] = useState<BridgeViewport | null>(null);
  const viewportRef = useRef<BridgeViewport | null>(null);
  const handleViewportSync = useCallback((vp: BridgeViewport) => {
    viewportRef.current = vp;
    if (vp.user) userMovedRef.current = true;
    setViewport(vp);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedViewport(viewport), VIEWPORT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [viewport]);
  const bbox = debouncedViewport ? formatBbox(debouncedViewport.bbox) : null;
  const zoom = debouncedViewport?.zoom ?? null;
  const cctvFilters = useMemo(() => ({ purpose: purposes }), [purposes]);
  const toiletFilterParams = useMemo(() => ({ ...toiletFilters }), [toiletFilters]);
  const cctvQ = useLifeMapPoints(layers.cctv && bbox && zoom !== null ? { layer: 'cctv', bbox, zoom, filters: cctvFilters } : null);
  const toiletQ = useLifeMapPoints(layers.toilet && bbox && zoom !== null ? { layer: 'toilet', bbox, zoom, filters: toiletFilterParams } : null);
  const statusQ = useLifeMapStatus();

  // 주변 목록 — 탭(화장실/CCTV), 지도 중심 기준.
  const [listTab, setListTab] = useState<LifeMapLayer>('toilet');
  const activeTab: LifeMapLayer = layers[listTab] ? listTab : layers.toilet ? 'toilet' : layers.cctv ? 'cctv' : listTab;
  const center = debouncedViewport ? debouncedViewport.center : { lat: initialCenter.lat, lng: initialCenter.lng };
  const nearbyQ = useLifeMapNearby(activeTab, center.lat, center.lng, {
    radius: NEARBY_RADIUS_M[activeTab],
    limit: NEARBY_LIMIT,
    filters: activeTab === 'cctv' ? cctvFilters : toiletFilterParams,
    enabled: layers[activeTab],
  });

  // 선택 + 상세.
  const [sel, setSel] = useState<{ layer: LifeMapLayer; id: string } | null>(() => parseSel(first(params.sel)));
  const detailQ = useLifeMapDetail(sel?.layer ?? null, sel?.id ?? null);
  const selectedMarkerId = sel ? `${sel.layer}:${sel.id}` : null;

  // 내 위치(파란 점) — 버튼으로만.
  const userLoc = useUserLocationNative();
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
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
        userMovedRef.current = true;
        mapRef.current?.flyTo(r.coords.lat, r.coords.lng, DEFAULT_ZOOM);
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

  // ── 마커 ──
  const labeledToiletIds = useMemo(() => {
    const ids = new Set<string>();
    if (activeTab === 'toilet') for (const it of nearbyQ.data?.items ?? []) ids.add(it.id);
    if (sel?.layer === 'toilet') ids.add(sel.id);
    return ids;
  }, [activeTab, nearbyQ.data, sel]);
  const bridge = useMemo(
    () => buildLifeBridgeMarkers(layers.cctv ? cctvQ.data : undefined, layers.toilet ? toiletQ.data : undefined, labeledToiletIds),
    [layers.cctv, layers.toilet, cctvQ.data, toiletQ.data, labeledToiletIds],
  );
  const overlayMarkers = useMemo<BridgeMarker[]>(
    () => (saved ? [{ id: 'saved-location', lat: saved.lat, lng: saved.lng, label: '내 위치', icon: SAVED_LOCATION_ICON }] : []),
    [saved],
  );

  // ── 시트 ──
  const listSheetRef = useRef<BottomSheet>(null);
  const detailSheetRef = useRef<BottomSheet>(null);
  const listSheetIndex = useSharedValue(1);
  const detailSheetIndex = useSharedValue(1);
  const listSheetTop = useSharedValue(SHEET_TOP_UNSET);
  const detailSheetTop = useSharedValue(SHEET_TOP_UNSET);
  const [headerCardH, setHeaderCardH] = useState(0);
  const handleMeasureHeader = useCallback((h: number) => setHeaderCardH((prev) => (Math.abs(prev - h) < 1 ? prev : h)), []);
  // full 에선 헤더 카드가 sticky 바로 펴지고(마진 0) 시트가 그 바로 아래에 맞붙는다 — 맛집·대중교통과 동일.
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
  const detailVisible = sel !== null;
  useEffect(() => {
    if (!detailVisible) detailSheetTop.value = SHEET_TOP_UNSET;
    syncMapBottomInset();
  }, [detailVisible, detailSheetTop, syncMapBottomInset]);

  // ── 선택 핸들러 ──
  const select = useCallback((layer: LifeMapLayer, id: string) => {
    setSel({ layer, id });
    listSheetRef.current?.snapToIndex(0);
  }, []);
  const clearSelection = useCallback(() => setSel(null), []);
  const handleMarkerSelect = useCallback(
    (markerId: string) => {
      const parsed = parseLifeMarkerId(markerId);
      if (!parsed) return;
      if (parsed.kind === 'point') {
        select(parsed.layer, parsed.id);
        return;
      }
      const cell: LifeMapCellType | null = lifeCellAt(parsed.layer === 'cctv' ? cctvQ.data : toiletQ.data, parsed.index);
      if (!cell) return;
      const current = viewportRef.current?.zoom ?? DEFAULT_ZOOM;
      userMovedRef.current = true;
      mapRef.current?.flyToZoomIn(cell.lat, cell.lng, Math.floor(current) + 2);
    },
    [cctvQ.data, toiletQ.data, select],
  );
  const handleListSelect = useCallback(
    (item: LifeMapNearbyItemType) => {
      select(item.layer, item.id);
      if (item.lat !== null && item.lng !== null) mapRef.current?.flyTo(item.lat, item.lng);
    },
    [select],
  );
  // URL sel 로 진입했을 때 상세가 오면 그 위치로 1회.
  const flownSelRef = useRef<string | null>(null);
  useEffect(() => {
    const item = detailQ.data;
    if (!item || !sel || flownSelRef.current === selectedMarkerId) return;
    flownSelRef.current = selectedMarkerId;
    if (userMovedRef.current) return;
    if (item.lat !== null && item.lng !== null) mapRef.current?.flyTo(item.lat, item.lng);
  }, [detailQ.data, sel, selectedMarkerId]);

  // ── 지역 이동 ──
  const [goToOpen, setGoToOpen] = useState(false);
  const handleGo = useCallback((t: LifeGoToTarget) => {
    userMovedRef.current = true;
    mapRef.current?.flyTo(t.lat, t.lng, t.zoom);
  }, []);

  // ── 안내 칩 ──
  const hint = (() => {
    const zoomLabel = zoom !== null ? ` (지금 ${Math.floor(zoom)})` : '';
    const parts: string[] = [];
    if (layers.cctv && cctvQ.data?.mode === 'cells') parts.push(`CCTV ${LIFE_MAP_POINT_MIN_ZOOM.cctv}`);
    if (layers.toilet && toiletQ.data?.mode === 'cells') parts.push(`화장실 ${LIFE_MAP_POINT_MIN_ZOOM.toilet}`);
    if (parts.length > 0) return `${parts.join(' · ')} 이상 확대하면 개별 지점${zoomLabel}`;
    if ((layers.cctv && cctvQ.data?.truncated) || (layers.toilet && toiletQ.data?.truncated)) return '지점이 많아 일부만 표시 — 더 확대해 주세요';
    return null;
  })();
  const mapLoading = cctvQ.isFetching || toiletQ.isFetching;
  const detailDist =
    detailQ.data && myLocation && detailQ.data.lat !== null && detailQ.data.lng !== null
      ? Math.round(approxDistanceM(myLocation, { lat: detailQ.data.lat, lng: detailQ.data.lng }))
      : null;
  const nearbyItems = nearbyQ.data?.items ?? [];
  const sheetBottomPad = insets.bottom + 24;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]} onLayout={handleMeasureContainer}>
        <TransitMapView
          ref={mapRef}
          initialCenter={{ lat: initialCenter.lat, lng: initialCenter.lng, zoom: initialCenter.zoom }}
          markers={bridge.markers}
          markerIcons={bridge.icons}
          selectedId={selectedMarkerId}
          overlayMarkers={overlayMarkers}
          myLocation={myLocation}
          topInset={mapTopInset}
          viewBottomInset={mapBottomInset}
          onSelectMarker={handleMarkerSelect}
          onViewportSync={handleViewportSync}
        />

        {/* 상단 중앙 칩 — 로딩 / 확대 안내(같은 슬롯, 로딩 우선). */}
        {mapLoading || hint ? (
          <View style={[styles.mapChipWrap, { top: mapTopInset + 4, pointerEvents: 'none' }]}>
            <View style={[styles.mapChip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <MaterialCommunityIcons name={mapLoading ? 'sync' : 'magnify-plus-outline'} size={13} color={theme.colors.textMuted} />
              <Text style={[styles.mapChipText, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {mapLoading ? '불러오는 중…' : hint}
              </Text>
            </View>
          </View>
        ) : null}

        {/* List 시트 — 필터 행 + 주변 목록 + 범례/출처. */}
        <BottomSheet
          ref={listSheetRef}
          index={1}
          snapPoints={SNAP_POINTS}
          topInset={listTopInset}
          animatedIndex={listSheetIndex}
          animatedPosition={listSheetTop}
          onChange={syncMapBottomInset}
          containerStyle={styles.listSheetContainer}
          handleIndicatorStyle={{ backgroundColor: theme.colors.border, width: 36 }}
          backgroundComponent={(bgProps) => <SheetBackground {...bgProps} sheetIndex={listSheetIndex} color={theme.colors.surface} />}
        >
          <BottomSheetFlatList
            data={nearbyItems}
            keyExtractor={(it: LifeMapNearbyItemType) => `${it.layer}:${it.id}`}
            contentContainerStyle={[styles.listPad, { paddingBottom: sheetBottomPad }]}
            ListHeaderComponent={
              <View>
                <LifeFilterRows
                  layers={layers}
                  purposes={purposes}
                  toiletFilters={toiletFilters}
                  onTogglePurpose={togglePurpose}
                  onClearPurposes={clearPurposes}
                  onToggleToiletFilter={toggleToiletFilter}
                />
                <LifeNearbyHeader tab={activeTab} onTab={setListTab} radiusM={NEARBY_RADIUS_M[activeTab]} total={nearbyQ.data?.total ?? null} />
              </View>
            }
            renderItem={({ item }: { item: LifeMapNearbyItemType }) => (
              <LifeNearbyRow item={item} selected={sel?.layer === item.layer && sel.id === item.id} onPress={() => handleListSelect(item)} />
            )}
            ListEmptyComponent={
              <LifeNearbyEmpty
                kind={!layers[activeTab] ? 'off' : nearbyQ.isFetching && !nearbyQ.data ? 'loading' : 'empty'}
                tab={activeTab}
                radiusM={NEARBY_RADIUS_M[activeTab]}
              />
            }
            ListFooterComponent={<LifeFooter status={statusQ.data} />}
          />
        </BottomSheet>

        {/* Detail 시트 — 선택 시에만 mount. 끝까지 내려도 닫히지 않고 최저 스냅까지만(← 목록으로 닫는다). */}
        {detailVisible ? (
          <BottomSheet
            ref={detailSheetRef}
            index={1}
            snapPoints={SNAP_POINTS}
            topInset={detailTopInset}
            animatedIndex={detailSheetIndex}
            animatedPosition={detailSheetTop}
            onChange={syncMapBottomInset}
            containerStyle={styles.detailSheetContainer}
            handleIndicatorStyle={{ backgroundColor: theme.colors.border, width: 36 }}
            backgroundComponent={(bgProps) => <SheetBackground {...bgProps} sheetIndex={detailSheetIndex} color={theme.colors.surface} />}
          >
            <LifeDetailPanel
              item={detailQ.data ?? null}
              loading={detailQ.isLoading && !detailQ.data}
              error={detailQ.isError && !detailQ.data}
              distM={detailDist}
              onBack={clearSelection}
              onFlyTo={(lat, lng) => mapRef.current?.flyTo(lat, lng)}
              bottomPad={sheetBottomPad}
            />
          </BottomSheet>
        ) : null}

        <LifeMapHeader
          topInset={insets.top}
          sheetIndex={listSheetIndex}
          layers={layers}
          status={statusQ.data}
          onToggleLayer={toggleLayer}
          onOpenSearch={() => setGoToOpen(true)}
          onBack={() => router.back()}
          onLocate={() => void locate()}
          locating={locating}
          onMeasure={handleMeasureHeader}
        />
      </View>

      <LifeGoToModal
        visible={goToOpen}
        onClose={() => setGoToOpen(false)}
        savedLocation={saved ? { lat: saved.lat, lng: saved.lng, label: saved.label } : null}
        onGo={handleGo}
      />
    </>
  );
}

const SheetBackground = ({ style, sheetIndex, color }: BottomSheetBackgroundProps & { sheetIndex: SharedValue<number>; color: string }) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const idx = sheetIndex.value;
    const t = Math.min(1, Math.max(0, (idx - 1.5) / 0.5));
    return { borderTopLeftRadius: 16 * (1 - t), borderTopRightRadius: 16 * (1 - t) };
  });
  return <Animated.View style={[style, { backgroundColor: color }, animatedStyle]} />;
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  listSheetContainer: { zIndex: 20 },
  detailSheetContainer: { zIndex: 30 },
  listPad: { paddingHorizontal: 12, paddingTop: 2 },
  mapChipWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 15 },
  mapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '86%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  mapChipText: { fontSize: 12, fontWeight: '500' },
});
