import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useAirLocation,
  useLifeMapDetail,
  useLifeMapNearby,
  useLifeMapPoints,
  useLifeMapStatus,
  useUserLocation,
} from '@repo/shared';
import type { LifeMapCellType, LifeMapNearbyItemType } from '@repo/api-contract';
import {
  LIFE_MAP_POINT_MIN_ZOOM,
  approxDistanceM,
  formatBbox,
  isInKorea,
  isLifeMapLayer,
  parseLatLngParam,
  type LifeMapLayer,
} from '@repo/utils';
import { usePublicLayout } from '~/components/PublicLayout';
import type { MapCanvasHandle, MapViewport } from '~/components/restaurant/MapCanvas';
import { LifeDetailCard } from '~/components/life-map/LifeDetailCard';
import { LifeGoToBox, type LifeGoToTarget } from '~/components/life-map/LifeGoToBox';
import { LifeLayerBar } from '~/components/life-map/LifeLayerBar';
import { LifeMapFooter } from '~/components/life-map/LifeMapFooter';
import { LifeMapView } from '~/components/life-map/LifeMapView';
import { LifeNearbyList } from '~/components/life-map/LifeNearbyList';
import { BottomSheet } from '~/components/sheet/BottomSheet';
import { SHEET_PEEK_HEIGHT, sheetHalfInset, useMapSheets } from '~/components/sheet/useMapSheets';
import { useDebounced } from '~/lib/useDebounced';
import { useIsDesktopXl } from '~/lib/useMediaQuery';
import { cn } from '~/lib/utils';
import { useLifeMapPrefsStore } from '~/stores/lifeMapPrefsStore';

// 일상지도 — 전국 CCTV·공중화장실을 한 지도에. URL 이 진실: ?ll=lat,lng&z=줌(뷰포트), ?sel=layer:id
// (선택). 레이어·필터는 persist 스토어. 진입 중심은 URL → 저장한 내 위치(날씨·대기와 공유) →
// 서울시청. 지도를 움직이면 뷰포트(bbox·줌)로 점/셀을 다시 받고, 주변 목록은 지도 중심 기준.
//
// 레이아웃은 지도 한 장(OL 인스턴스 1개) + 패널.
//   - 데스크톱(xl+): 좌 패널 400px(이동 검색 · 레이어/필터 · 주변 목록 또는 상세 · 푸터) / 우 지도.
//   - 모바일: 맛집 v2 와 같은 시트 패턴 — 상단바 subBar 에 지역 이동 검색(드롭다운형) + 레이어 토글,
//     지도는 그 아래 fixed 배경, 주변 목록은 3-snap 바텀시트(peek 은 탭·건수 머리 행만 보이고 half 부터
//     필터 칩 행과 목록), 상세는 시트 하나를 더 얹는다(useMapSheets — 진입 half, 닫히면 목록 스냅 복원).
// 분기는 CSS 이중 마운트(hidden xl:flex / xl:hidden)가 아니라 useIsDesktopXl(JS) — 지도·패널을 한 벌만
// 두고 시트는 모바일에서만 마운트한다(데스크톱에 시트가 숨어 있으면 html overflow 락이 따라온다).
// 지도 <section> 은 두 분기에서 같은 자리라 폭이 바뀌어도 OL 인스턴스를 다시 만들지 않는다.

const SEOUL = { lat: 37.5665, lng: 126.978 };
const DEFAULT_ZOOM = 15;
const NEARBY_RADIUS_M: Record<LifeMapLayer, number> = { toilet: 1000, cctv: 500 };
const NEARBY_LIMIT = 15;
// 뷰포트 → 조회 디바운스. 패닝 중 중간 프레임 bbox 로 요청이 연달아 나가지 않게.
const VIEWPORT_DEBOUNCE_MS = 250;

const parseZoom = (raw: string | null): number | null => {
  if (raw === null) return null;
  const z = Number(raw);
  return Number.isFinite(z) && z >= 5 && z <= 19 ? z : null;
};
const parseSel = (raw: string | null): { layer: LifeMapLayer; id: string } | null => {
  if (!raw) return null;
  const i = raw.indexOf(':');
  if (i <= 0) return null;
  const layer = raw.slice(0, i);
  const id = raw.slice(i + 1);
  return isLifeMapLayer(layer) && id.length > 0 ? { layer, id } : null;
};

interface InitialView {
  lat: number;
  lng: number;
  zoom: number;
  source: 'url' | 'saved' | 'default';
}

export const LifeMapPage = () => {
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

  const layers = useLifeMapPrefsStore((s) => s.layers);
  const purposes = useLifeMapPrefsStore((s) => s.purposes);
  const toiletFilters = useLifeMapPrefsStore((s) => s.toiletFilters);
  const toggleLayer = useLifeMapPrefsStore((s) => s.toggleLayer);
  const togglePurpose = useLifeMapPrefsStore((s) => s.togglePurpose);
  const setPurposes = useLifeMapPrefsStore((s) => s.setPurposes);
  const toggleToiletFilter = useLifeMapPrefsStore((s) => s.toggleToiletFilter);
  const clearPurposes = useCallback(() => setPurposes([]), [setPurposes]);

  // 저장한 내 위치(날씨·대기정보와 공유).
  const airLocation = useAirLocation();
  const saved = airLocation.location;

  // 진입 중심 — 마운트 1회 결정(이후엔 지도가 진실). 로그인 사용자의 저장 위치는 서버 조회라 늦게
  // 올 수 있어, URL 중심이 없고 사용자가 아직 안 움직였으면 도착 시 1회 이동한다.
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

  // 뷰포트 — 모든 변경(onViewportSync)을 받아 디바운스 후 조회 키로. 사용자 이동(onViewportChangeEnd)
  // 만 URL 에 반영한다.
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
  const cctvFilters = useMemo(() => ({ purpose: purposes }), [purposes]);
  const toiletFilterParams = useMemo(() => ({ ...toiletFilters }), [toiletFilters]);
  const cctvQ = useLifeMapPoints(
    layers.cctv && bbox && zoom !== null ? { layer: 'cctv', bbox, zoom, filters: cctvFilters } : null,
  );
  const toiletQ = useLifeMapPoints(
    layers.toilet && bbox && zoom !== null ? { layer: 'toilet', bbox, zoom, filters: toiletFilterParams } : null,
  );
  const statusQ = useLifeMapStatus();

  // 주변 목록 — 탭(화장실/CCTV), 지도 중심 기준(뷰포트 동기 전엔 진입 중심). 꺼진 레이어 탭이면
  // 켜진 쪽으로 보이되 사용자의 탭 선택은 보존.
  const [listTab, setListTab] = useState<LifeMapLayer>('toilet');
  const activeTab: LifeMapLayer = layers[listTab] ? listTab : layers.toilet ? 'toilet' : layers.cctv ? 'cctv' : listTab;
  const center = debouncedViewport
    ? { lat: debouncedViewport.centerLat, lng: debouncedViewport.centerLng }
    : { lat: initial.lat, lng: initial.lng };
  const nearbyQ = useLifeMapNearby(activeTab, center.lat, center.lng, {
    radius: NEARBY_RADIUS_M[activeTab],
    limit: NEARBY_LIMIT,
    filters: activeTab === 'cctv' ? cctvFilters : toiletFilterParams,
    enabled: layers[activeTab],
  });

  // 선택 — URL sel. 상세는 별도 조회(점 응답엔 최소 필드뿐). 파싱 결과는 원문 키로 메모 — 파생
  // 메모(labeledToiletIds)가 매 렌더 새 객체에 흔들리지 않게.
  const selRaw = searchParams.get('sel');
  const sel = useMemo(() => parseSel(selRaw), [selRaw]);
  const detailQ = useLifeMapDetail(sel?.layer ?? null, sel?.id ?? null);
  const selectedMarkerId = sel ? `${sel.layer}:${sel.id}` : null;
  const select = useCallback((layer: LifeMapLayer, id: string) => setParams({ sel: `${layer}:${id}` }), [setParams]);
  const clearSelection = useCallback(() => setParams({ sel: null }), [setParams]);
  const handleSelectCell = useCallback((_layer: LifeMapLayer, cell: LifeMapCellType) => {
    const current = viewportRef.current?.zoom ?? DEFAULT_ZOOM;
    mapRef.current?.flyToZoomIn(cell.lat, cell.lng, Math.floor(current) + 2);
  }, []);
  // 모바일은 상세 시트(half)가 아래를 덮으므로 지점이 보이는 위쪽 영역 가운데에 오게 중심을 민다.
  const flyInset = useCallback(
    () => (isDesktop ? undefined : { bottomInset: sheetHalfInset(headerHeight) }),
    [isDesktop, headerHeight],
  );
  const handleListSelect = useCallback(
    (item: LifeMapNearbyItemType) => {
      select(item.layer, item.id);
      if (item.lat !== null && item.lng !== null) mapRef.current?.flyTo(item.lat, item.lng, undefined, flyInset());
    },
    [select, flyInset],
  );
  // URL 로 sel 을 들고 진입했을 때(마커 클릭이 아닌 경우) 상세가 오면 그 위치로 1회 이동.
  const flownSelRef = useRef<string | null>(null);
  useEffect(() => {
    const item = detailQ.data;
    if (!item || !sel || flownSelRef.current === selectedMarkerId) return;
    flownSelRef.current = selectedMarkerId;
    if (userMovedRef.current) return;
    if (item.lat !== null && item.lng !== null) mapRef.current?.flyTo(item.lat, item.lng, undefined, flyInset());
  }, [detailQ.data, sel, selectedMarkerId, flyInset]);

  // 모바일 시트 스냅 조율 — 상세(sel)가 열리면 목록 시트 peek·숨김, 상세 시트 half.
  const sheets = useMapSheets(sel !== null);

  // 지역 이동(옴니박스) — 선택한 곳으로 날아가고 URL 도 맞춘다(programmatic move 는 URL 동기 안 되므로 직접).
  const [goToOpen, setGoToOpen] = useState(false);
  const handleGo = useCallback(
    (t: LifeGoToTarget) => {
      userMovedRef.current = true;
      mapRef.current?.flyTo(t.lat, t.lng, t.zoom);
      setParams({ ll: `${t.lat.toFixed(5)},${t.lng.toFixed(5)}`, z: String(t.zoom) });
    },
    [setParams],
  );

  // 내 위치 — 버튼으로만(auto:false). 얻으면 그곳으로 이동.
  const userLoc = useUserLocation({ auto: false });
  const myLocation = userLoc.status === 'granted' && userLoc.coords && isInKorea(userLoc.coords) ? userLoc.coords : null;
  useEffect(() => {
    if (myLocation) mapRef.current?.flyTo(myLocation.lat, myLocation.lng, DEFAULT_ZOOM);
  }, [myLocation]);

  const labeledToiletIds = useMemo(() => {
    const ids = new Set<string>();
    if (activeTab === 'toilet') for (const it of nearbyQ.data?.items ?? []) ids.add(it.id);
    if (sel?.layer === 'toilet') ids.add(sel.id);
    return ids;
  }, [activeTab, nearbyQ.data, sel]);

  // 안내 — 켜진 레이어가 셀 모드면 "몇 이상 확대", 점이 잘렸으면 "일부만 표시".
  const hint = (() => {
    const zoomLabel = zoom !== null ? ` (지금 ${Math.floor(zoom)})` : '';
    const parts: string[] = [];
    if (layers.cctv && cctvQ.data?.mode === 'cells') parts.push(`CCTV ${LIFE_MAP_POINT_MIN_ZOOM.cctv}`);
    if (layers.toilet && toiletQ.data?.mode === 'cells') parts.push(`화장실 ${LIFE_MAP_POINT_MIN_ZOOM.toilet}`);
    if (parts.length > 0) return `${parts.join(' · ')} 이상 확대하면 개별 지점이 보입니다${zoomLabel}`;
    if ((layers.cctv && cctvQ.data?.truncated) || (layers.toilet && toiletQ.data?.truncated)) {
      return '지점이 많아 일부만 표시 중 — 더 확대해 주세요';
    }
    return null;
  })();
  const mapLoading = cctvQ.isFetching || toiletQ.isFetching;

  const detailDist =
    detailQ.data && myLocation && detailQ.data.lat !== null && detailQ.data.lng !== null
      ? Math.round(approxDistanceM(myLocation, { lat: detailQ.data.lat, lng: detailQ.data.lng }))
      : null;

  // ── 모바일 상단바 subBar — 지역 이동(드롭다운형) + 레이어 토글. 데스크톱은 등록하지 않는다. ──
  const savedForGoTo = saved ? { lat: saved.lat, lng: saved.lng, label: saved.label } : null;
  const subBarContent = useMemo(
    () =>
      isDesktop ? null : (
        <div data-testid="life-subbar">
          <LifeGoToBox variant="bar" open={goToOpen} onOpenChange={setGoToOpen} savedLocation={savedForGoTo} onGo={handleGo} />
          <LifeLayerBar
            section="layers"
            className="border-b-0 pt-0"
            layers={layers}
            purposes={purposes}
            toiletFilters={toiletFilters}
            status={statusQ.data}
            onToggleLayer={toggleLayer}
            onTogglePurpose={togglePurpose}
            onClearPurposes={clearPurposes}
            onToggleToiletFilter={toggleToiletFilter}
          />
        </div>
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- savedForGoTo 는 saved 에서만 파생
    [isDesktop, goToOpen, saved, handleGo, layers, purposes, toiletFilters, statusQ.data, toggleLayer, togglePurpose, clearPurposes, toggleToiletFilter],
  );
  useLayoutEffect(() => {
    setSubBar(subBarContent);
    return () => setSubBar(null);
  }, [setSubBar, subBarContent]);

  // ── 패널 조각(데스크톱 패널 / 모바일 시트 공용) ──
  const layerBarProps = {
    layers,
    purposes,
    toiletFilters,
    status: statusQ.data,
    onToggleLayer: toggleLayer,
    onTogglePurpose: togglePurpose,
    onClearPurposes: clearPurposes,
    onToggleToiletFilter: toggleToiletFilter,
  };
  const nearbyList = (filters?: React.ReactNode) => (
    <LifeNearbyList
      tab={activeTab}
      layers={layers}
      onTab={setListTab}
      data={nearbyQ.data}
      isLoading={nearbyQ.isFetching}
      radiusM={NEARBY_RADIUS_M[activeTab]}
      selectedId={sel?.layer === activeTab ? sel.id : null}
      onSelect={handleListSelect}
      filters={filters}
    />
  );
  const detailContent =
    sel && detailQ.data ? (
      <LifeDetailCard
        item={detailQ.data}
        distM={detailDist}
        onBack={clearSelection}
        onFlyTo={(lat, lng) => mapRef.current?.flyTo(lat, lng, undefined, flyInset())}
      />
    ) : sel && detailQ.isLoading ? (
      <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">상세 불러오는 중…</div>
    ) : sel && detailQ.isError ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
        항목을 찾을 수 없습니다(데이터가 갱신돼 빠졌을 수 있음).
        <button type="button" onClick={clearSelection} className="text-xs underline underline-offset-2">
          목록으로
        </button>
      </div>
    ) : null;

  return (
    <div
      className={cn('w-full', isDesktop ? 'flex flex-row' : 'relative')}
      style={isDesktop ? { height: `calc(100dvh - ${headerHeight}px)` } : undefined}
    >
      {/* 지도 — 데스크톱은 우측 flex 칸, 모바일은 헤더 아래 fixed 배경(시트가 그 위에). 두 분기에서 같은
          자리(첫 자식)라 폭이 바뀌어도 OL 인스턴스는 그대로. --map-bottom-inset: peek 시트가 덮는 높이만큼
          좌하단 레이어 컨트롤·우하단 내 위치 버튼을 올린다. */}
      <section
        className={cn(isDesktop ? 'relative order-2 min-h-0 flex-1' : 'fixed inset-x-0 bottom-0 z-0')}
        style={
          isDesktop
            ? undefined
            : ({ top: `${headerHeight}px`, '--map-bottom-inset': `${SHEET_PEEK_HEIGHT}px` } as React.CSSProperties)
        }
      >
        <LifeMapView
          ref={mapRef}
          cctv={layers.cctv ? cctvQ.data : undefined}
          toilet={layers.toilet ? toiletQ.data : undefined}
          labeledToiletIds={labeledToiletIds}
          selectedMarkerId={selectedMarkerId}
          initialCenter={{ lat: initial.lat, lng: initial.lng, zoom: initial.zoom }}
          myLocation={myLocation}
          savedLocation={saved ? { lat: saved.lat, lng: saved.lng } : null}
          locationStatus={userLoc.status}
          onLocate={userLoc.refetch}
          loading={mapLoading}
          hint={hint}
          onSelectPoint={select}
          onSelectCell={handleSelectCell}
          onViewportSync={handleViewportSync}
          onViewportChangeEnd={handleViewportChangeEnd}
        />
      </section>

      {isDesktop ? (
        /* ━━━ 데스크톱(xl+) — 좌 패널 400px ━━━ */
        <aside className="order-1 flex h-full w-[400px] shrink-0 flex-col border-r">
          <LifeGoToBox open={goToOpen} onOpenChange={setGoToOpen} savedLocation={savedForGoTo} onGo={handleGo} />
          {goToOpen ? null : (
            <>
              <LifeLayerBar {...layerBarProps} />
              {detailContent ?? nearbyList()}
            </>
          )}
          <LifeMapFooter status={statusQ.data} />
        </aside>
      ) : (
        /* ━━━ 모바일 — 목록 시트 + (선택 시) 상세 시트. topOffset 은 통합 헤더 실측 높이. ━━━ */
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
            <div className="pb-4" data-testid="life-list-sheet">
              {nearbyList(<LifeLayerBar section="filters" className="border-b-0 py-1" {...layerBarProps} />)}
              <LifeMapFooter status={statusQ.data} />
            </div>
          </BottomSheet>
          {sel && (
            <BottomSheet
              key={selectedMarkerId}
              snap={sheets.detailSnap}
              onSnapChange={sheets.setDetailSnap}
              topOffset={headerHeight}
              peekHeight={SHEET_PEEK_HEIGHT}
              zIndex={25}
            >
              <div className="pb-4" data-testid="life-detail-sheet">
                {detailContent}
              </div>
            </BottomSheet>
          )}
        </>
      )}
    </div>
  );
};
