import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useAirLocation,
  useHousingComplex,
  useHousingNearby,
  useHousingPoints,
  useHousingSearch,
  useHousingStatus,
  useUserLocation,
  type HousingAxis,
} from '@repo/shared';
import type { HousingCellType, HousingNearbyItemType } from '@repo/api-contract';
import { HOUSING_POINT_MIN_ZOOM, approxDistanceM, formatBbox, isInKorea, parseLatLngParam } from '@repo/utils';
import { usePublicLayout } from '~/components/PublicLayout';
import type { MapCanvasHandle, MapViewport } from '~/components/restaurant/MapCanvas';
import { LifeGoToBox, type LifeGoToSection, type LifeGoToTarget } from '~/components/life-map/LifeGoToBox';
import { HousingDetailCard } from '~/components/housing/HousingDetailCard';
import { HousingFilterBar } from '~/components/housing/HousingFilterBar';
import { HousingFooter } from '~/components/housing/HousingFooter';
import { HousingMapView } from '~/components/housing/HousingMapView';
import { HousingNearbyList } from '~/components/housing/HousingNearbyList';
import { BottomSheet } from '~/components/sheet/BottomSheet';
import { SHEET_PEEK_HEIGHT, sheetHalfInset, useMapSheets } from '~/components/sheet/useMapSheets';
import { useDebounced } from '~/lib/useDebounced';
import { useIsDesktopXl } from '~/lib/useMediaQuery';
import { cn } from '~/lib/utils';
import { useHousingPrefsStore } from '~/stores/housingPrefsStore';

// 집값 — 전국 아파트 단지의 최근 실거래가를 지도에. URL 이 진실: ?ll=lat,lng&z=줌(뷰포트), ?sel=단지id
// (선택). 거래 유형(매매/전세/월세)·전용면적 구간은 persist 스토어(축). 진입 중심은 URL → 저장한 내
// 위치(날씨·대기·일상지도와 공유) → 서울시청. 지도를 움직이면 뷰포트(bbox·줌)로 배지/셀을 다시 받고,
// 주변 목록은 지도 중심 기준. 지역 이동 옴니박스는 일상지도의 LifeGoToBox 를 그대로 쓰되 '아파트 단지'
// 검색 섹션을 앞에 끼운다(단지 선택 = 이동 + sel).
//
// 레이아웃·분기·시트 조율은 LifeMapPage 와 같다(지도 한 장 + 패널, useIsDesktopXl 로 JS 분기,
// 모바일은 상단바 subBar + 목록/상세 바텀시트 + useMapSheets).

const SEOUL = { lat: 37.5665, lng: 126.978 };
const DEFAULT_ZOOM = 15;
const COMPLEX_ZOOM = 16;
const NEARBY_RADIUS_M = 1000;
const NEARBY_LIMIT = 15;
const SEARCH_LIMIT = 6;
// 뷰포트 → 조회 디바운스. 패닝 중 중간 프레임 bbox 로 요청이 연달아 나가지 않게.
const VIEWPORT_DEBOUNCE_MS = 250;

const parseZoom = (raw: string | null): number | null => {
  if (raw === null) return null;
  const z = Number(raw);
  return Number.isFinite(z) && z >= 5 && z <= 19 ? z : null;
};
const parseSel = (raw: string | null): string | null => (raw && raw.length > 0 && raw.length <= 200 ? raw : null);

interface InitialView {
  lat: number;
  lng: number;
  zoom: number;
  source: 'url' | 'saved' | 'default';
}

export const HousingPage = () => {
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

  const dealType = useHousingPrefsStore((s) => s.dealType);
  const band = useHousingPrefsStore((s) => s.band);
  const setDealType = useHousingPrefsStore((s) => s.setDealType);
  const setBand = useHousingPrefsStore((s) => s.setBand);
  const axis = useMemo<HousingAxis>(() => ({ dealType, band }), [dealType, band]);

  // 저장한 내 위치(날씨·대기정보·일상지도와 공유).
  const airLocation = useAirLocation();
  const saved = airLocation.location;
  const savedForGoTo = useMemo(() => (saved ? { lat: saved.lat, lng: saved.lng, label: saved.label } : null), [saved]);

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
  const pointsQ = useHousingPoints(bbox && zoom !== null ? { bbox, zoom, axis } : null);
  const statusQ = useHousingStatus();

  // 주변 단지 — 지도 중심 기준(뷰포트 동기 전엔 진입 중심).
  const center = debouncedViewport
    ? { lat: debouncedViewport.centerLat, lng: debouncedViewport.centerLng }
    : { lat: initial.lat, lng: initial.lng };
  const nearbyQ = useHousingNearby(center.lat, center.lng, axis, { radius: NEARBY_RADIUS_M, limit: NEARBY_LIMIT });

  // 선택 — URL sel(단지 id). 상세는 별도 조회(배지 응답엔 최소 필드뿐).
  const sel = parseSel(searchParams.get('sel'));
  const detailQ = useHousingComplex(sel);
  const select = useCallback((id: string) => setParams({ sel: id }), [setParams]);
  const clearSelection = useCallback(() => setParams({ sel: null }), [setParams]);
  const handleSelectCell = useCallback((cell: HousingCellType) => {
    const current = viewportRef.current?.zoom ?? DEFAULT_ZOOM;
    mapRef.current?.flyToZoomIn(cell.lat, cell.lng, Math.floor(current) + 2);
  }, []);
  // 모바일은 상세 시트(half)가 아래를 덮으므로 단지가 보이는 위쪽 영역 가운데에 오게 중심을 민다.
  const flyInset = useCallback(
    () => (isDesktop ? undefined : { bottomInset: sheetHalfInset(headerHeight) }),
    [isDesktop, headerHeight],
  );
  const handleListSelect = useCallback(
    (item: HousingNearbyItemType) => {
      select(item.id);
      if (item.lat !== null && item.lng !== null) mapRef.current?.flyTo(item.lat, item.lng, undefined, flyInset());
    },
    [select, flyInset],
  );
  // URL 로 sel 을 들고 진입했을 때(마커 클릭이 아닌 경우) 상세가 오면 그 위치로 1회 이동.
  const flownSelRef = useRef<string | null>(null);
  useEffect(() => {
    const item = detailQ.data;
    if (!item || !sel || flownSelRef.current === sel) return;
    flownSelRef.current = sel;
    if (userMovedRef.current) return;
    if (item.lat !== null && item.lng !== null) mapRef.current?.flyTo(item.lat, item.lng, undefined, flyInset());
  }, [detailQ.data, sel, flyInset]);

  // 모바일 시트 스냅 조율 — 상세(sel)가 열리면 목록 시트 peek·숨김, 상세 시트 half.
  const sheets = useMapSheets(sel !== null);

  // 지역 이동(옴니박스) — 선택한 곳으로 날아가고 URL 도 맞춘다(programmatic move 는 URL 동기 안 되므로 직접).
  // 단지 항목이면 선택(sel)까지 — 상세가 아래를 덮는 모바일은 inset 을 준다.
  const [goToOpen, setGoToOpen] = useState(false);
  const [goToQuery, setGoToQuery] = useState('');
  const searchQ = useHousingSearch(goToQuery, SEARCH_LIMIT);
  const normalizedQuery = goToQuery.trim().replace(/\s+/g, ' ');
  const complexSections = useMemo<LifeGoToSection[]>(() => {
    if (normalizedQuery.length === 0) return [];
    const items = (searchQ.data?.q === normalizedQuery ? searchQ.data.items : []).flatMap<LifeGoToTarget>((c) =>
      c.lat !== null && c.lng !== null
        ? [
            {
              kind: 'complex',
              id: c.id,
              label: c.name,
              sub: `${c.addr}${c.households !== null ? ` · ${c.households.toLocaleString('ko-KR')}세대` : ''}`,
              lat: c.lat,
              lng: c.lng,
              zoom: COMPLEX_ZOOM,
            },
          ]
        : [],
    );
    return [
      { key: 'complex', title: '아파트 단지', items, loading: searchQ.isFetching, error: searchQ.isError && !searchQ.isFetching },
    ];
  }, [normalizedQuery, searchQ.data, searchQ.isFetching, searchQ.isError]);
  const handleGo = useCallback(
    (t: LifeGoToTarget) => {
      userMovedRef.current = true;
      const isComplex = t.kind === 'complex' && !!t.id;
      mapRef.current?.flyTo(t.lat, t.lng, t.zoom, isComplex ? flyInset() : undefined);
      setParams({
        ll: `${t.lat.toFixed(5)},${t.lng.toFixed(5)}`,
        z: String(t.zoom),
        ...(isComplex ? { sel: t.id! } : {}),
      });
    },
    [setParams, flyInset],
  );

  // 내 위치 — 버튼으로만(auto:false). 얻으면 그곳으로 이동.
  const userLoc = useUserLocation({ auto: false });
  const myLocation = userLoc.status === 'granted' && userLoc.coords && isInKorea(userLoc.coords) ? userLoc.coords : null;
  useEffect(() => {
    if (myLocation) mapRef.current?.flyTo(myLocation.lat, myLocation.lng, DEFAULT_ZOOM);
  }, [myLocation]);

  // 안내 — 셀 모드면 "몇 이상 확대", 배지가 잘렸으면 "일부만 표시".
  const hint = (() => {
    const data = pointsQ.data;
    if (!data) return null;
    if (data.mode === 'cells') {
      return `${HOUSING_POINT_MIN_ZOOM} 이상 확대하면 단지별 실거래가가 보입니다${zoom !== null ? ` (지금 ${Math.floor(zoom)})` : ''}`;
    }
    if (data.truncated) return '단지가 많아 일부만 표시 중 — 더 확대해 주세요';
    return null;
  })();

  const detailDist =
    detailQ.data && myLocation && detailQ.data.lat !== null && detailQ.data.lng !== null
      ? Math.round(approxDistanceM(myLocation, { lat: detailQ.data.lat, lng: detailQ.data.lng }))
      : null;

  // ── 모바일 상단바 subBar — 지역 이동(드롭다운형) + 거래 유형 세그먼트. 데스크톱은 등록하지 않는다. ──
  const subBarContent = useMemo(
    () =>
      isDesktop ? null : (
        <div data-testid="housing-subbar">
          <LifeGoToBox
            variant="bar"
            open={goToOpen}
            onOpenChange={setGoToOpen}
            savedLocation={savedForGoTo}
            onGo={handleGo}
            extraSections={complexSections}
            onQueryChange={setGoToQuery}
            placeholder="단지명·지역·역·주소로 이동"
          />
          <HousingFilterBar section="axis" className="border-b-0 pt-0" dealType={dealType} band={band} onDealType={setDealType} onBand={setBand} />
        </div>
      ),
    [isDesktop, goToOpen, savedForGoTo, handleGo, complexSections, dealType, band, setDealType, setBand],
  );
  useLayoutEffect(() => {
    setSubBar(subBarContent);
    return () => setSubBar(null);
  }, [setSubBar, subBarContent]);

  // ── 패널 조각(데스크톱 패널 / 모바일 시트 공용) ──
  const nearbyList = (filters?: React.ReactNode) => (
    <HousingNearbyList
      data={nearbyQ.data}
      isLoading={nearbyQ.isFetching}
      radiusM={NEARBY_RADIUS_M}
      dealType={dealType}
      selectedId={sel}
      onSelect={handleListSelect}
      filters={filters}
    />
  );
  const detailContent =
    sel && detailQ.data ? (
      <HousingDetailCard
        key={sel}
        item={detailQ.data}
        axis={axis}
        distM={detailDist}
        onBack={clearSelection}
        onFlyTo={(lat, lng) => mapRef.current?.flyTo(lat, lng, undefined, flyInset())}
      />
    ) : sel && detailQ.isLoading ? (
      <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">단지 정보를 불러오는 중…</div>
    ) : sel && detailQ.isError ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
        단지를 찾을 수 없습니다(데이터가 갱신돼 빠졌을 수 있음).
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
        <HousingMapView
          ref={mapRef}
          data={pointsQ.data}
          dealType={dealType}
          selectedComplexId={sel}
          initialCenter={{ lat: initial.lat, lng: initial.lng, zoom: initial.zoom }}
          myLocation={myLocation}
          savedLocation={saved ? { lat: saved.lat, lng: saved.lng } : null}
          locationStatus={userLoc.status}
          onLocate={userLoc.refetch}
          loading={pointsQ.isFetching}
          hint={hint}
          onSelectComplex={select}
          onSelectCell={handleSelectCell}
          onViewportSync={handleViewportSync}
          onViewportChangeEnd={handleViewportChangeEnd}
        />
      </section>

      {isDesktop ? (
        /* ━━━ 데스크톱(xl+) — 좌 패널 400px ━━━ */
        <aside className="order-1 flex h-full w-[400px] shrink-0 flex-col border-r">
          <LifeGoToBox
            open={goToOpen}
            onOpenChange={setGoToOpen}
            savedLocation={savedForGoTo}
            onGo={handleGo}
            extraSections={complexSections}
            onQueryChange={setGoToQuery}
            placeholder="단지명·지역·역·주소로 이동"
          />
          {goToOpen ? null : (
            <>
              <HousingFilterBar dealType={dealType} band={band} onDealType={setDealType} onBand={setBand} />
              {detailContent ?? nearbyList()}
            </>
          )}
          <HousingFooter status={statusQ.data} />
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
            <div className="pb-4" data-testid="housing-list-sheet">
              {nearbyList(
                <HousingFilterBar section="bands" className="border-b-0 py-1" dealType={dealType} band={band} onDealType={setDealType} onBand={setBand} />,
              )}
              <HousingFooter status={statusQ.data} />
            </div>
          </BottomSheet>
          {sel && (
            <BottomSheet
              key={sel}
              snap={sheets.detailSnap}
              onSnapChange={sheets.setDetailSnap}
              topOffset={headerHeight}
              peekHeight={SHEET_PEEK_HEIGHT}
              zIndex={25}
            >
              <div className="pb-4" data-testid="housing-detail-sheet">
                {detailContent}
              </div>
            </BottomSheet>
          )}
        </>
      )}
    </div>
  );
};
