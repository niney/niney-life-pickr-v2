import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useAirLocation,
  useEvDetail,
  useEvNearby,
  useEvPoints,
  useParkingAirports,
  useParkingLotDetail,
  useParkingLotNearby,
  useParkingLotPoints,
  useParkingStatus,
  useUserLocation,
} from '@repo/shared';
import type { EvStationNearbyItemType, ParkingAirportType, ParkingLotNearbyItemType } from '@repo/api-contract';
import {
  EV_POINT_MIN_ZOOM,
  PARKING_NEARBY_RADIUS_M,
  PARKING_POINT_MIN_ZOOM,
  approxDistanceM,
  formatBbox,
  isInKorea,
  isParkingTab,
  parseLatLngParam,
  type ParkingTab,
} from '@repo/utils';
import { usePublicLayout } from '~/components/PublicLayout';
import type { MapCanvasHandle, MapMarker, MapViewport } from '~/components/restaurant/MapCanvas';
import { LifeGoToBox, type LifeGoToTarget } from '~/components/life-map/LifeGoToBox';
import { AirportDetailCard, EvStationDetailCard, ParkingLotDetailCard } from '~/components/parking/ParkingDetails';
import { ParkingFooter } from '~/components/parking/ParkingFooter';
import { AirportList, EvList, ParkingLotList } from '~/components/parking/ParkingLists';
import { ParkingMapView } from '~/components/parking/ParkingMapView';
import { ParkingTabBar } from '~/components/parking/ParkingTabBar';
import {
  buildAirportMarkers,
  buildEvMarkers,
  buildParkingLotMarkers,
  parkingCellAt,
  parkingMarkerId,
  type ParsedParkingMarkerId,
} from '~/components/parking/parkingMarkers';
import { BottomSheet } from '~/components/sheet/BottomSheet';
import { SHEET_PEEK_HEIGHT, sheetHalfInset, useMapSheets } from '~/components/sheet/useMapSheets';
import { useDebounced } from '~/lib/useDebounced';
import { useIsDesktopXl } from '~/lib/useMediaQuery';
import { cn } from '~/lib/utils';
import { useParkingPrefsStore } from '~/stores/parkingPrefsStore';

// 주차 — 주차장(전국 표준데이터 + 서울 공영, 서울 시영 실시간 여석)·전기차 충전소(충전기 상태 10분 반영)·공항 주차(5분).
// URL 이 진실: ?t=lot|ev|airport(탭), ?ll=lat,lng&z=줌(뷰포트), ?sel=id(주차장 id·충전소 id·공항 IATA). 필터는 persist
// 스토어. 진입 중심은 URL → 저장한 내 위치(날씨·대기·일상지도와 공유) → 서울시청. 지도를 움직이면 지금 탭의 점/셀을
// 다시 받고, 주변 목록은 지도 중심 기준(공항은 14곳을 거리순).
//
// 레이아웃·분기·시트 조율은 집값·일상지도와 같다(지도 한 장 + 패널, useIsDesktopXl 로 JS 분기, 모바일은 상단바 subBar
// + 목록/상세 바텀시트 + useMapSheets). docs/PLAN-parking.md

const SEOUL = { lat: 37.5665, lng: 126.978 };
const DEFAULT_ZOOM = 15;
const KOREA_VIEW = { lat: 36.1, lng: 127.8, zoom: 7 };
const AIRPORT_ZOOM = 14;
const NEARBY_LIMIT = 15;
const VIEWPORT_DEBOUNCE_MS = 250;

const parseZoom = (raw: string | null): number | null => {
  if (raw === null) return null;
  const z = Number(raw);
  return Number.isFinite(z) && z >= 5 && z <= 19 ? z : null;
};
const parseSel = (raw: string | null): string | null => (raw && raw.length > 0 && raw.length <= 80 ? raw : null);

interface InitialView {
  lat: number;
  lng: number;
  zoom: number;
  source: 'url' | 'saved' | 'default';
}

export const ParkingPage = () => {
  const { setSubBar, headerHeight } = usePublicLayout();
  const isDesktop = useIsDesktopXl();
  const [searchParams, setSearchParams] = useSearchParams();
  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const rawTab = searchParams.get('t');
  const tab: ParkingTab = isParkingTab(rawTab) ? rawTab : 'lot';
  const lotFilters = useParkingPrefsStore((s) => s.lotFilters);
  const evFilters = useParkingPrefsStore((s) => s.evFilters);
  const toggleLotFilter = useParkingPrefsStore((s) => s.toggleLotFilter);
  const toggleEvFilter = useParkingPrefsStore((s) => s.toggleEvFilter);

  const airLocation = useAirLocation();
  const saved = airLocation.location;
  const savedForGoTo = useMemo(() => (saved ? { lat: saved.lat, lng: saved.lng, label: saved.label } : null), [saved]);

  // 진입 중심 — 마운트 1회 결정(이후엔 지도가 진실). 저장 위치가 늦게 오면(로그인 사용자) 사용자가 안 움직였을 때 1회 이동.
  const [initial] = useState<InitialView>(() => {
    const ll = parseLatLngParam(searchParams.get('ll'));
    if (ll) return { ...ll, zoom: parseZoom(searchParams.get('z')) ?? DEFAULT_ZOOM, source: 'url' };
    if (saved) return { lat: saved.lat, lng: saved.lng, zoom: DEFAULT_ZOOM, source: 'saved' };
    return { ...SEOUL, zoom: DEFAULT_ZOOM, source: 'default' };
  });
  const mapRef = useRef<MapCanvasHandle>(null);
  const userMovedRef = useRef(false);
  const flownToSavedRef = useRef(initial.source !== 'default');
  useEffect(() => {
    if (!saved || flownToSavedRef.current || userMovedRef.current) return;
    flownToSavedRef.current = true;
    mapRef.current?.flyTo(saved.lat, saved.lng, DEFAULT_ZOOM);
  }, [saved]);

  // 뷰포트 — 모든 변경을 디바운스해 조회 키로, 사용자 이동만 URL 에 반영.
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const viewportRef = useRef<MapViewport | null>(null);
  const debouncedViewport = useDebounced(viewport, VIEWPORT_DEBOUNCE_MS);
  const handleViewportSync = useCallback((vp: MapViewport) => {
    viewportRef.current = vp;
    setViewport(vp);
  }, []);
  const handleViewportChangeEnd = useCallback(
    (vp: MapViewport) => {
      userMovedRef.current = true;
      setParams({ ll: `${vp.centerLat.toFixed(5)},${vp.centerLng.toFixed(5)}`, z: vp.zoom.toFixed(1) });
    },
    [setParams],
  );

  const bbox = debouncedViewport ? formatBbox(debouncedViewport.bbox) : null;
  const zoom = debouncedViewport?.zoom ?? null;
  const center = debouncedViewport ? { lat: debouncedViewport.centerLat, lng: debouncedViewport.centerLng } : { lat: initial.lat, lng: initial.lng };

  const lotPointsQ = useParkingLotPoints(tab === 'lot' && bbox && zoom !== null ? { bbox, zoom, filters: lotFilters } : null);
  const evPointsQ = useEvPoints(tab === 'ev' && bbox && zoom !== null ? { bbox, zoom, filters: evFilters } : null);
  const airportsQ = useParkingAirports(tab === 'airport');
  const statusQ = useParkingStatus();
  const lotNearbyQ = useParkingLotNearby(center.lat, center.lng, { radius: PARKING_NEARBY_RADIUS_M, limit: NEARBY_LIMIT, filters: lotFilters, enabled: tab === 'lot' });
  const evNearbyQ = useEvNearby(center.lat, center.lng, { radius: PARKING_NEARBY_RADIUS_M, limit: NEARBY_LIMIT, filters: evFilters, enabled: tab === 'ev' });

  // 선택 — URL sel(탭마다 뜻이 다르다). 상세는 별도 조회(점 응답엔 최소 필드뿐), 공항은 목록 응답에서.
  const sel = parseSel(searchParams.get('sel'));
  const lotDetailQ = useParkingLotDetail(tab === 'lot' ? sel : null);
  const evDetailQ = useEvDetail(tab === 'ev' ? sel : null);
  const selectedAirport = tab === 'airport' && sel ? (airportsQ.data?.airports.find((a) => a.code === sel) ?? null) : null;
  const select = useCallback((id: string) => setParams({ sel: id }), [setParams]);
  const clearSelection = useCallback(() => setParams({ sel: null }), [setParams]);
  const flyInset = useCallback(() => (isDesktop ? undefined : { bottomInset: sheetHalfInset(headerHeight) }), [isDesktop, headerHeight]);

  // 탭 전환 — 선택은 비운다. 공항 탭은 전국이 보이게(이미 넓게 보고 있으면 그대로).
  const handleTab = useCallback(
    (next: ParkingTab) => {
      if (next === tab) return;
      setParams({ t: next === 'lot' ? null : next, sel: null });
      if (next === 'airport' && (viewportRef.current?.zoom ?? DEFAULT_ZOOM) > 9) {
        userMovedRef.current = true;
        mapRef.current?.flyTo(KOREA_VIEW.lat, KOREA_VIEW.lng, KOREA_VIEW.zoom);
      }
    },
    [tab, setParams],
  );

  const handleMarkerSelect = useCallback(
    (parsed: ParsedParkingMarkerId) => {
      if (parsed.kind === 'cell') {
        const source = parsed.layer === 'lot' ? lotPointsQ.data : evPointsQ.data;
        const cell = parkingCellAt(source, parsed.index);
        const current = viewportRef.current?.zoom ?? DEFAULT_ZOOM;
        if (cell) mapRef.current?.flyToZoomIn(cell.lat, cell.lng, Math.floor(current) + 2);
        return;
      }
      if (parsed.kind === 'airport') {
        const a = airportsQ.data?.airports.find((x) => x.code === parsed.id);
        select(parsed.id);
        if (a) mapRef.current?.flyToZoomIn(a.lat, a.lng, AIRPORT_ZOOM, flyInset());
        return;
      }
      select(parsed.id);
    },
    [lotPointsQ.data, evPointsQ.data, airportsQ.data, select, flyInset],
  );
  const handleLotSelect = useCallback(
    (item: ParkingLotNearbyItemType) => {
      select(item.id);
      if (item.lat !== null && item.lng !== null) mapRef.current?.flyTo(item.lat, item.lng, undefined, flyInset());
    },
    [select, flyInset],
  );
  const handleEvSelect = useCallback(
    (item: EvStationNearbyItemType) => {
      select(item.id);
      mapRef.current?.flyTo(item.lat, item.lng, undefined, flyInset());
    },
    [select, flyInset],
  );
  const handleAirportSelect = useCallback(
    (a: ParkingAirportType) => {
      select(a.code);
      userMovedRef.current = true;
      mapRef.current?.flyToZoomIn(a.lat, a.lng, AIRPORT_ZOOM, flyInset());
    },
    [select, flyInset],
  );

  // URL 로 sel 을 들고 진입했을 때(마커 클릭이 아닌 경우) 상세가 오면 그 위치로 1회 이동.
  const flownSelRef = useRef<string | null>(null);
  const selCoords =
    tab === 'lot' && lotDetailQ.data?.lat != null && lotDetailQ.data.lng != null
      ? { lat: lotDetailQ.data.lat, lng: lotDetailQ.data.lng }
      : tab === 'ev' && evDetailQ.data
        ? { lat: evDetailQ.data.lat, lng: evDetailQ.data.lng }
        : selectedAirport
          ? { lat: selectedAirport.lat, lng: selectedAirport.lng }
          : null;
  useEffect(() => {
    if (!sel || !selCoords || flownSelRef.current === `${tab}:${sel}`) return;
    flownSelRef.current = `${tab}:${sel}`;
    if (userMovedRef.current) return;
    mapRef.current?.flyTo(selCoords.lat, selCoords.lng, tab === 'airport' ? AIRPORT_ZOOM : undefined, flyInset());
    // 좌표 도착만 추적(객체는 매 렌더 새로 만들어진다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, tab, selCoords?.lat, selCoords?.lng, flyInset]);

  const sheets = useMapSheets(sel !== null);

  // 지역 이동(옴니박스) — 일상지도의 LifeGoToBox 그대로.
  const [goToOpen, setGoToOpen] = useState(false);
  const handleGo = useCallback(
    (t: LifeGoToTarget) => {
      userMovedRef.current = true;
      mapRef.current?.flyTo(t.lat, t.lng, t.zoom);
      setParams({ ll: `${t.lat.toFixed(5)},${t.lng.toFixed(5)}`, z: String(t.zoom) });
    },
    [setParams],
  );

  // 내 위치 — 버튼으로만. 얻으면 그곳으로 이동.
  const userLoc = useUserLocation({ auto: false });
  const myLocation = userLoc.status === 'granted' && userLoc.coords && isInKorea(userLoc.coords) ? userLoc.coords : null;
  useEffect(() => {
    if (myLocation) mapRef.current?.flyTo(myLocation.lat, myLocation.lng, DEFAULT_ZOOM);
  }, [myLocation]);

  // 마커 — 지금 탭만. 라벨은 주변 목록 + 선택.
  const labeledIds = useMemo(() => {
    const ids = new Set<string>();
    const items = tab === 'lot' ? (lotNearbyQ.data?.items ?? []) : tab === 'ev' ? (evNearbyQ.data?.items ?? []) : [];
    for (const it of items) ids.add(it.id);
    if (sel) ids.add(sel);
    return ids;
  }, [tab, lotNearbyQ.data, evNearbyQ.data, sel]);
  const markers = useMemo<MapMarker[]>(() => {
    if (tab === 'lot') return buildParkingLotMarkers(lotPointsQ.data, labeledIds);
    if (tab === 'ev') return buildEvMarkers(evPointsQ.data, labeledIds);
    return buildAirportMarkers(airportsQ.data?.airports);
  }, [tab, lotPointsQ.data, evPointsQ.data, airportsQ.data, labeledIds]);
  const selectedMarkerId = sel ? parkingMarkerId(tab, sel) : null;

  const hint = (() => {
    const zoomLabel = zoom !== null ? ` (지금 ${Math.floor(zoom)})` : '';
    if (tab === 'lot' && lotPointsQ.data?.mode === 'cells') return `${PARKING_POINT_MIN_ZOOM} 이상 확대하면 주차장이 하나씩 보입니다${zoomLabel}`;
    if (tab === 'ev' && evPointsQ.data?.mode === 'cells') return `${EV_POINT_MIN_ZOOM} 이상 확대하면 충전소가 하나씩 보입니다${zoomLabel}`;
    if ((tab === 'lot' && lotPointsQ.data?.truncated) || (tab === 'ev' && evPointsQ.data?.truncated)) return '많아서 일부만 표시 중 — 더 확대해 주세요';
    return null;
  })();
  const mapLoading = tab === 'lot' ? lotPointsQ.isFetching : tab === 'ev' ? evPointsQ.isFetching : airportsQ.isLoading;

  const distFromMe = (lat: number | null | undefined, lng: number | null | undefined): number | null =>
    myLocation && lat != null && lng != null ? Math.round(approxDistanceM(myLocation, { lat, lng })) : null;

  // ── 모바일 상단바 subBar — 지역 이동 + 탭. 데스크톱은 등록하지 않는다. ──
  const subBarContent = useMemo(
    () =>
      isDesktop ? null : (
        <div data-testid="parking-subbar">
          <LifeGoToBox variant="bar" open={goToOpen} onOpenChange={setGoToOpen} savedLocation={savedForGoTo} onGo={handleGo} placeholder="지역·역·주소로 이동" />
          <ParkingTabBar
            section="tabs"
            className="border-b-0 pt-0"
            tab={tab}
            onTab={handleTab}
            lotFilters={lotFilters}
            evFilters={evFilters}
            onToggleLot={toggleLotFilter}
            onToggleEv={toggleEvFilter}
          />
        </div>
      ),
    [isDesktop, goToOpen, savedForGoTo, handleGo, tab, handleTab, lotFilters, evFilters, toggleLotFilter, toggleEvFilter],
  );
  useLayoutEffect(() => {
    setSubBar(subBarContent);
    return () => setSubBar(null);
  }, [setSubBar, subBarContent]);

  // ── 패널 조각(데스크톱 패널 / 모바일 시트 공용) ──
  const flyTo = useCallback((lat: number, lng: number) => mapRef.current?.flyTo(lat, lng, undefined, flyInset()), [flyInset]);
  const list = (filters?: React.ReactNode) =>
    tab === 'lot' ? (
      <ParkingLotList
        data={lotNearbyQ.data}
        isLoading={lotNearbyQ.isFetching}
        isError={lotNearbyQ.isError}
        radiusM={PARKING_NEARBY_RADIUS_M}
        selectedId={sel}
        onSelect={handleLotSelect}
        filters={filters}
      />
    ) : tab === 'ev' ? (
      <EvList
        data={evNearbyQ.data}
        isLoading={evNearbyQ.isFetching}
        isError={evNearbyQ.isError}
        radiusM={PARKING_NEARBY_RADIUS_M}
        selectedId={sel}
        onSelect={handleEvSelect}
        filters={filters}
      />
    ) : (
      <AirportList
        airports={airportsQ.data?.airports}
        isLoading={airportsQ.isLoading}
        isError={airportsQ.isError}
        center={center}
        selectedCode={sel}
        onSelect={handleAirportSelect}
        fetchedAt={airportsQ.data?.fetchedAt ?? null}
        stale={airportsQ.data?.stale ?? false}
      />
    );
  const detailQ = tab === 'lot' ? lotDetailQ : tab === 'ev' ? evDetailQ : null;
  const detailContent = !sel ? null : tab === 'lot' && lotDetailQ.data ? (
    <ParkingLotDetailCard key={sel} item={lotDetailQ.data} distM={distFromMe(lotDetailQ.data.lat, lotDetailQ.data.lng)} onBack={clearSelection} onFlyTo={flyTo} />
  ) : tab === 'ev' && evDetailQ.data ? (
    <EvStationDetailCard key={sel} item={evDetailQ.data} distM={distFromMe(evDetailQ.data.lat, evDetailQ.data.lng)} onBack={clearSelection} onFlyTo={flyTo} />
  ) : selectedAirport ? (
    <AirportDetailCard key={sel} airport={selectedAirport} onBack={clearSelection} onFlyTo={flyTo} />
  ) : detailQ?.isLoading || (tab === 'airport' && airportsQ.isLoading) ? (
    <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">불러오는 중…</div>
  ) : (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
      항목을 찾을 수 없습니다(데이터가 갱신돼 빠졌을 수 있음).
      <button type="button" onClick={clearSelection} className="text-xs underline underline-offset-2">
        목록으로
      </button>
    </div>
  );
  const tabBarProps = { tab, onTab: handleTab, lotFilters, evFilters, onToggleLot: toggleLotFilter, onToggleEv: toggleEvFilter };

  return (
    <div className={cn('w-full', isDesktop ? 'flex flex-row' : 'relative')} style={isDesktop ? { height: `calc(100dvh - ${headerHeight}px)` } : undefined}>
      <section
        className={cn(isDesktop ? 'relative order-2 min-h-0 flex-1' : 'fixed inset-x-0 bottom-0 z-0')}
        style={isDesktop ? undefined : ({ top: `${headerHeight}px`, '--map-bottom-inset': `${SHEET_PEEK_HEIGHT}px` } as React.CSSProperties)}
      >
        <ParkingMapView
          ref={mapRef}
          markers={markers}
          selectedMarkerId={selectedMarkerId}
          initialCenter={{ lat: initial.lat, lng: initial.lng, zoom: initial.zoom }}
          myLocation={myLocation}
          savedLocation={saved ? { lat: saved.lat, lng: saved.lng } : null}
          locationStatus={userLoc.status}
          onLocate={userLoc.refetch}
          loading={mapLoading}
          hint={hint}
          onMarkerSelect={handleMarkerSelect}
          onViewportSync={handleViewportSync}
          onViewportChangeEnd={handleViewportChangeEnd}
        />
      </section>

      {isDesktop ? (
        <aside className="order-1 flex h-full w-[400px] shrink-0 flex-col border-r">
          <LifeGoToBox open={goToOpen} onOpenChange={setGoToOpen} savedLocation={savedForGoTo} onGo={handleGo} placeholder="지역·역·주소로 이동" />
          {goToOpen ? null : (
            <>
              <ParkingTabBar {...tabBarProps} />
              {detailContent ?? list()}
            </>
          )}
          <ParkingFooter tab={tab} status={statusQ.data} />
        </aside>
      ) : (
        <>
          <BottomSheet
            snap={sheets.listSnap}
            onSnapChange={sheets.setListSnap}
            topOffset={headerHeight}
            peekHeight={SHEET_PEEK_HEIGHT}
            hidden={sheets.listHidden}
            disableScrollLock={sheets.listHidden}
            zIndex={20}
          >
            <div className="pb-4" data-testid="parking-list-sheet">
              {list(<ParkingTabBar section="filters" className="border-b-0 py-1" {...tabBarProps} />)}
              <ParkingFooter tab={tab} status={statusQ.data} />
            </div>
          </BottomSheet>
          {sel && (
            <BottomSheet key={`${tab}:${sel}`} snap={sheets.detailSnap} onSnapChange={sheets.setDetailSnap} topOffset={headerHeight} peekHeight={SHEET_PEEK_HEIGHT} zIndex={25}>
              <div className="pb-4" data-testid="parking-detail-sheet">
                {detailContent}
              </div>
            </BottomSheet>
          )}
        </>
      )}
    </div>
  );
};
