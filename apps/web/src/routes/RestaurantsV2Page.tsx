import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import type { RestaurantPublicListQueryType } from '@repo/api-contract';
import { useRestaurantsPublic, useUserLocation } from '@repo/shared';
import { computeBboxAround } from '@repo/utils';
import { usePublicLayout } from '~/components/PublicLayout';
import {
  PublicRestaurantList,
  PublicRestaurantListBody,
  PublicRestaurantListHeader,
} from '~/components/restaurant/PublicRestaurantList';
import { PublicRestaurantsMap } from '~/components/restaurant/PublicRestaurantsMap';
import { BottomSheet, type Snap } from '~/components/restaurant-v2/BottomSheet';
import { cn } from '~/lib/utils';
import { usePanelSide } from '~/stores/panelPrefsStore';

type SortKey = NonNullable<RestaurantPublicListQueryType['sort']>;
const VALID_SORTS: SortKey[] = ['recent', 'satisfaction', 'positive', 'rating'];
const isSortKey = (s: string | null): s is SortKey =>
  s !== null && (VALID_SORTS as string[]).includes(s);

// 사용자 위치 기반 첫 진입 시 검색 반경. ±1.5km → 3km × 3km 박스 — 도심
// 권역이면 limit 80 안에 충분히 채워지고, 지방이면 결과 0 가능 (그땐 사용자
// 가 "전체 영역" 으로 풀거나 패닝하여 재검색).
const INITIAL_NEARBY_KM = 1.5;
const formatBbox = (b: { minLng: number; minLat: number; maxLng: number; maxLat: number }) =>
  // PublicRestaurantsMap.tsx 의 formatBbox 와 동일 — 소수점 5자리.
  [b.minLng, b.minLat, b.maxLng, b.maxLat].map((n) => n.toFixed(5)).join(',');

// /restaurants 의 모바일 UX 를 네이버 지도식 바텀시트 패턴으로 교체한 v2.
// xl+ 데스크톱은 기존 RestaurantsPage 와 동일한 3-column (단일 페이지 안에서
// CSS 분기). 모바일 전용 변경:
//   - 검색·카테고리 행을 PublicTopBar 의 subBar 슬롯에 등록 → TopBar 와 한
//     몸인 sticky element 가 되어 dvh(주소창) 변동 시 겹침/잘림 방지
//   - BottomSheet 의 topOffset 은 통합 헤더 실측 px (PublicLayout 의
//     headerHeight context). subBar 컨텐츠가 바뀌어도 자동 동기화
//   - BottomSheet (peek/half/full): snap=full 진입 시 body 스크롤 모드로 swap
//     되어 주소창 minify 동작
//   - 카드 클릭 → 진입 전 snap 저장, 시트 half 로, viewKey='detail' → list
//     스크롤 자동 저장, detail 은 top 부터
//   - 닫기 → 진입 전 snap 복원, viewKey='list' → list 스크롤 복원
export const RestaurantsV2Page = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category');
  const sortRaw = searchParams.get('sort');
  const sort: SortKey = isSortKey(sortRaw) ? sortRaw : 'recent';
  const bbox = searchParams.get('bbox');

  const detailMatch = useMatch('/restaurants-v2/:placeId');
  const placeId = detailMatch?.params.placeId ?? null;
  const navigate = useNavigate();

  const viewMode: 'list' | 'detail' = placeId === null ? 'list' : 'detail';

  const [snap, setSnap] = useState<Snap>('peek');
  const snapBeforeDetailRef = useRef<Snap>('peek');

  const [panelSide, togglePanelSide] = usePanelSide('public.restaurants');

  // PublicLayout 으로부터 subBar slot 과 통합 헤더 실측 높이 받음.
  const { setSubBar, headerHeight } = usePublicLayout();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const list = useRestaurantsPublic({
    q: q || undefined,
    category: category ?? undefined,
    sort,
    bbox: bbox ?? undefined,
    limit: 80,
  });
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);

  const handleSelectItem = useCallback(
    (id: string) => {
      snapBeforeDetailRef.current = snap;
      navigate({
        pathname: `/restaurants-v2/${id}`,
        search: window.location.search,
      });
      setSnap('half');
    },
    [navigate, snap],
  );

  // 닫기는 RestaurantDetailRoute 의 onClose 가 navigate('/restaurants-v2') 로
  // 처리. 그 결과 placeId 가 null 이 되는 걸 여기서 감지해서 snap 복원.
  const prevPlaceIdRef = useRef(placeId);
  useEffect(() => {
    if (prevPlaceIdRef.current !== null && placeId === null) {
      setSnap(snapBeforeDetailRef.current);
    }
    prevPlaceIdRef.current = placeId;
  }, [placeId]);

  const handleResearch = useCallback((b: string) => setParam('bbox', b), [setParam]);
  const handleClearArea = useCallback(() => setParam('bbox', null), [setParam]);

  // 첫 진입 시 사용자 위치 → 주변 bbox 자동 적용. one-shot — 한 번 적용된 후
  // 사용자가 "전체 영역" 으로 해제하거나 직접 패닝해 재검색하면 다시 끼어들지
  // 않는다.
  const userLoc = useUserLocation();
  const appliedGeoBboxRef = useRef(false);
  useEffect(() => {
    if (appliedGeoBboxRef.current) return;
    if (userLoc.status !== 'granted' || !userLoc.coords) return;
    appliedGeoBboxRef.current = true;
    // 공유 링크 등으로 URL 에 이미 bbox 가 있으면 사용자 의도 우선 — 덮어쓰지
    // 않는다. one-shot 플래그는 위에서 이미 true 로 마크.
    if (bbox) return;
    const box = computeBboxAround(userLoc.coords, INITIAL_NEARBY_KM);
    setParam('bbox', formatBbox(box));
  }, [userLoc.status, userLoc.coords, bbox, setParam]);

  // "내 위치" 버튼 클릭은 사용자의 명시 의도 — 기존 URL bbox 가 있어도 덮어
  // 쓴다. manualRequestRef 로 "다음 granted 도착 시 강제 적용" 표시.
  const manualRequestRef = useRef(false);
  useEffect(() => {
    if (!manualRequestRef.current) return;
    if (userLoc.status !== 'granted' || !userLoc.coords) return;
    manualRequestRef.current = false;
    const box = computeBboxAround(userLoc.coords, INITIAL_NEARBY_KM);
    setParam('bbox', formatBbox(box));
  }, [userLoc.status, userLoc.coords, setParam]);

  const handleRequestLocation = useCallback(() => {
    manualRequestRef.current = true;
    userLoc.refetch();
  }, [userLoc]);

  // 지도 view 동기화용 중심 좌표. PublicRestaurantsMap 이 참조 변경마다 flyTo —
  // 첫 자동 도착과 수동 refetch 양쪽 다 처리. 권한 거부면 null → 서울시청 폴백.
  const focusCoord = userLoc.status === 'granted' ? userLoc.coords : null;

  // 모바일 전용 subBar 컨텐츠 — 검색 input + 카테고리 칩 + 총/정렬.
  // xl+ 데스크톱에서는 컨테이너 div 가 display:none (xl:hidden) 이라 차지하는
  // 높이 0 → ResizeObserver 가 측정한 headerHeight 는 자동으로 56(TopBar 만).
  // detail 진입 시엔 null 반환 → headerHeight 가 56 으로 줄어 시트가 상세 컨텐츠를
  // 더 넓게 노출 (검색·카테고리는 list 화면에서만 의미 있음).
  const subBarContent = useMemo(() => {
    if (viewMode === 'detail') return null;
    return (
      <div className="xl:hidden">
        <PublicRestaurantListHeader
          q={q}
          total={total}
          category={category}
          sort={sort}
          onChangeQ={(next) => setParam('q', next)}
          onChangeCategory={(next) => setParam('category', next)}
          onChangeSort={(next) => setParam('sort', next === 'recent' ? null : next)}
        />
      </div>
    );
  }, [viewMode, q, total, category, sort, setParam]);

  // subBar 등록/해제. useLayoutEffect 로 paint 전 PublicLayout state 갱신 →
  // 첫 paint 부터 통합 헤더 모습으로 렌더.
  useLayoutEffect(() => {
    setSubBar(subBarContent);
    return () => setSubBar(null);
  }, [setSubBar, subBarContent]);

  return (
    <div className="relative w-full">
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          데스크톱 (xl+) — 기존 RestaurantsPage 와 동일한 3-column 레이아웃.
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        className={cn(
          'relative hidden w-full xl:flex',
          panelSide === 'right' && 'xl:flex-row-reverse',
        )}
      >
        <aside
          className={cn(
            'relative w-full bg-background',
            'xl:sticky xl:top-14 xl:h-[calc(100dvh-3.5rem)] xl:w-[400px] xl:shrink-0 xl:overflow-y-auto',
            panelSide === 'left' ? 'xl:border-r' : 'xl:border-l',
          )}
        >
          <PublicRestaurantList
            items={items}
            total={total}
            isLoading={list.isLoading}
            isError={list.isError}
            q={q}
            category={category}
            sort={sort}
            selectedPlaceId={placeId}
            onChangeQ={(next) => setParam('q', next)}
            onChangeCategory={(next) => setParam('category', next)}
            onChangeSort={(next) => setParam('sort', next === 'recent' ? null : next)}
            onSelectItem={handleSelectItem}
            onHoverItem={setHoveredPlaceId}
            panelSide={panelSide}
            onTogglePanelSide={togglePanelSide}
          />
        </aside>

        {placeId && (
          <aside
            className={cn(
              'w-full bg-background',
              'xl:sticky xl:top-14 xl:h-[calc(100dvh-3.5rem)] xl:w-[440px] xl:shrink-0 xl:overflow-hidden',
              panelSide === 'left' ? 'xl:border-r' : 'xl:border-l',
            )}
          >
            <Outlet />
          </aside>
        )}

        <section className="relative flex-1 xl:sticky xl:top-14 xl:h-[calc(100dvh-3.5rem)]">
          <PublicRestaurantsMap
            items={items}
            selectedPlaceId={placeId}
            hoveredPlaceId={hoveredPlaceId}
            appliedBbox={bbox}
            focusCoord={focusCoord}
            locationStatus={userLoc.status}
            onRequestLocation={handleRequestLocation}
            onSelectMarker={handleSelectItem}
            onResearchInArea={handleResearch}
            onClearArea={handleClearArea}
          />
        </section>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          모바일 (xl-) — 통합 헤더(subBar slot) + 시트 패턴.
          맵 fixed 배경, 시트의 topOffset 은 통합 헤더 실측 높이.
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="xl:hidden">
        {/* 맵 배경. headerHeight 아래부터 viewport 하단까지. dvh 변동 시 즉시 따라감. */}
        <div
          className="fixed inset-x-0 bottom-0 z-0"
          style={{ top: `${headerHeight}px` }}
        >
          <PublicRestaurantsMap
            items={items}
            selectedPlaceId={placeId}
            hoveredPlaceId={hoveredPlaceId}
            appliedBbox={bbox}
            focusCoord={focusCoord}
            locationStatus={userLoc.status}
            onRequestLocation={handleRequestLocation}
            onSelectMarker={handleSelectItem}
            onResearchInArea={handleResearch}
            onClearArea={handleClearArea}
          />
        </div>

        <BottomSheet
          snap={snap}
          onSnapChange={setSnap}
          topOffset={headerHeight}
          peekHeight={120}
          viewKey={viewMode}
        >
          {viewMode === 'list' ? (
            <div className="px-3 pb-24 pt-2">
              <PublicRestaurantListBody
                items={items}
                isLoading={list.isLoading}
                isError={list.isError}
                selectedPlaceId={placeId}
                onSelectItem={handleSelectItem}
                onHoverItem={setHoveredPlaceId}
              />
            </div>
          ) : (
            <Outlet />
          )}
        </BottomSheet>
      </div>
    </div>
  );
};
