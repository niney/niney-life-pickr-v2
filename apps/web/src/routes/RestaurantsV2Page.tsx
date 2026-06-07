import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Outlet, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import type {
  RestaurantPublicListItemType,
  RestaurantPublicListQueryType,
} from '@repo/api-contract';
import { useRestaurantPublic, useRestaurantsPublic, useUserLocation } from '@repo/shared';
import { computeBboxAround, isInKorea } from '@repo/utils';
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
// 권한 거부/한국 밖일 때 폴백 — 서울시청. vworld 가 한국 영토만 커버해서
// 한국 밖 좌표는 타일 전부 404, 그래서 모바일과 동일 폴백 정책.
const SEOUL: { lat: number; lng: number } = { lat: 37.5665, lng: 126.978 };
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
// /r/:placeId 공유/SEO 라우트도 이 화면을 부모로 사용한다. 이때는 리스트만
// 숨기고 지도 + 상세를 유지한다.
export const RestaurantsV2Page = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category');
  const sortRaw = searchParams.get('sort');
  const sort: SortKey = isSortKey(sortRaw) ? sortRaw : 'recent';
  const bbox = searchParams.get('bbox');

  const detailMatch = useMatch('/restaurants-v2/:placeId');
  const shareMatch = useMatch('/r/:placeId');
  const isShareRoute = !!shareMatch;
  const placeId = detailMatch?.params.placeId ?? shareMatch?.params.placeId ?? null;
  const navigate = useNavigate();

  const viewMode: 'list' | 'detail' = placeId === null ? 'list' : 'detail';

  const [listSnap, setListSnap] = useState<Snap>('peek');
  const [detailSnap, setDetailSnap] = useState<Snap>('half');
  const snapBeforeDetailRef = useRef<Snap>('peek');

  const [panelSide, togglePanelSide] = usePanelSide('public.restaurants');
  const effectivePanelSide = isShareRoute ? 'left' : panelSide;

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
  const shareDetail = useRestaurantPublic(isShareRoute ? placeId : null);
  const shareMapItem = useMemo<RestaurantPublicListItemType | null>(() => {
    const detail = shareDetail.data;
    if (!isShareRoute || !detail) return null;
    return {
      placeId: detail.placeId,
      name: detail.name,
      category: detail.category,
      address: detail.address,
      roadAddress: detail.roadAddress,
      rating: detail.rating,
      reviewCount: detail.reviewCount,
      latitude: detail.latitude,
      longitude: detail.longitude,
      thumbnailUrl: detail.imageUrls[0] ?? null,
      firstCrawledAt: detail.firstCrawledAt,
      totalReviews: detail.storedReviewCount.total,
      summaryPending: 0,
      summaryRunning: 0,
      summaryDone: 0,
      summaryFailed: 0,
      analyzedCount: 0,
      avgSentimentScore: null,
      avgSatisfactionScore: null,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
    };
  }, [isShareRoute, shareDetail.data]);
  const mapItems = useMemo(() => {
    if (!shareMapItem) return items;
    if (items.some((it) => it.placeId === shareMapItem.placeId)) return items;
    return [shareMapItem, ...items];
  }, [items, shareMapItem]);

  // 더블클릭 = 해당 식당으로 지도 확대. 매번 새 객체를 만들어 같은 식당을 다시
  // 더블클릭해도 PublicRestaurantsMap 의 effect 가 재실행된다.
  const [zoomFocus, setZoomFocus] = useState<{ placeId: string } | null>(null);
  const handleZoomItem = useCallback((id: string) => setZoomFocus({ placeId: id }), []);

  const handleSelectItem = useCallback(
    (id: string) => {
      navigate({
        pathname: isShareRoute ? `/r/${id}` : `/restaurants-v2/${id}`,
        search: isShareRoute ? '' : window.location.search,
      });
      // prev 캡처로 진입 직전 snap 저장 — listSnap 을 deps 에 넣지 않아도 됨.
      setListSnap((prev) => {
        snapBeforeDetailRef.current = prev;
        return 'peek';
      });
      setDetailSnap('half');
    },
    [navigate, isShareRoute],
  );

  // 닫기는 RestaurantDetailRoute 의 onClose 가 navigate('/restaurants-v2') 로
  // 처리. 그 결과 placeId 가 null 이 되는 걸 여기서 감지해서 snap 복원.
  const prevPlaceIdRef = useRef(placeId);
  useEffect(() => {
    if (prevPlaceIdRef.current !== null && placeId === null) {
      setListSnap(snapBeforeDetailRef.current);
    }
    prevPlaceIdRef.current = placeId;
  }, [placeId]);

  const handleResearch = useCallback((b: string) => setParam('bbox', b), [setParam]);
  const handleClearArea = useCallback(() => setParam('bbox', null), [setParam]);

  // 첫 진입 시 자동 bbox 적용. one-shot — 한 번 적용된 후 사용자가 "전체 영역"
  // 으로 해제하거나 직접 패닝해 재검색하면 다시 끼어들지 않는다. granted +
  // 한국이면 사용자 좌표, 그 외(denied/unavailable/한국 밖)면 서울 ±1.5km —
  // "현재 보고 있는 위치에서만" 일관 멘탈 모델 (앱과 동일).
  const userLoc = useUserLocation();
  const appliedGeoBboxRef = useRef(false);
  useEffect(() => {
    if (isShareRoute) return;
    if (appliedGeoBboxRef.current) return;
    // pending/idle 동안은 대기 — 권한 결정 후 한 번에.
    if (userLoc.status === 'idle' || userLoc.status === 'pending') return;
    appliedGeoBboxRef.current = true;
    // 공유 링크 등으로 URL 에 이미 bbox 가 있으면 사용자 의도 우선 — 덮어쓰지
    // 않는다. one-shot 플래그는 위에서 이미 true 로 마크.
    if (bbox) return;
    const center =
      userLoc.status === 'granted' && userLoc.coords && isInKorea(userLoc.coords)
        ? userLoc.coords
        : SEOUL;
    const box = computeBboxAround(center, INITIAL_NEARBY_KM);
    setParam('bbox', formatBbox(box));
  }, [isShareRoute, userLoc.status, userLoc.coords, bbox, setParam]);

  // "내 위치" 버튼 클릭은 사용자의 명시 의도 — 기존 URL bbox 가 있어도 덮어
  // 쓴다. manualRequestRef 로 "다음 granted 도착 시 강제 적용" 표시.
  const manualRequestRef = useRef(false);
  useEffect(() => {
    if (isShareRoute) return;
    if (!manualRequestRef.current) return;
    if (userLoc.status !== 'granted' || !userLoc.coords) return;
    manualRequestRef.current = false;
    const box = computeBboxAround(userLoc.coords, INITIAL_NEARBY_KM);
    setParam('bbox', formatBbox(box));
  }, [isShareRoute, userLoc.status, userLoc.coords, setParam]);

  const handleRequestLocation = useCallback(() => {
    manualRequestRef.current = true;
    userLoc.refetch();
  }, [userLoc]);

  // 지도 view 동기화용 중심 좌표. PublicRestaurantsMap 이 참조 변경마다 flyTo —
  // 첫 자동 도착과 수동 refetch 양쪽 다 처리. 권한 거부면 null → 서울시청 폴백.
  const focusCoord = !isShareRoute && userLoc.status === 'granted' ? userLoc.coords : null;

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
          effectivePanelSide === 'right' && 'xl:flex-row-reverse',
        )}
      >
        {!isShareRoute && (
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
              onZoomItem={handleZoomItem}
              panelSide={panelSide}
              onTogglePanelSide={togglePanelSide}
            />
          </aside>
        )}

        {placeId && (
          <aside
            className={cn(
              'w-full bg-background',
              'xl:sticky xl:top-14 xl:h-[calc(100dvh-3.5rem)] xl:w-[440px] xl:shrink-0 xl:overflow-hidden',
              effectivePanelSide === 'left' ? 'xl:border-r' : 'xl:border-l',
            )}
          >
            <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
              <Outlet />
            </Suspense>
          </aside>
        )}

        <section className="relative flex-1 xl:sticky xl:top-14 xl:h-[calc(100dvh-3.5rem)]">
          <PublicRestaurantsMap
            items={mapItems}
            selectedPlaceId={placeId}
            zoomFocus={zoomFocus}
            appliedBbox={bbox}
            focusCoord={focusCoord}
            locationStatus={isShareRoute ? undefined : userLoc.status}
            onRequestLocation={isShareRoute ? undefined : handleRequestLocation}
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
        <div className="fixed inset-x-0 bottom-0 z-0" style={{ top: `${headerHeight}px` }}>
          <PublicRestaurantsMap
            items={mapItems}
            selectedPlaceId={placeId}
            zoomFocus={zoomFocus}
            appliedBbox={bbox}
            focusCoord={focusCoord}
            locationStatus={isShareRoute ? undefined : userLoc.status}
            onRequestLocation={isShareRoute ? undefined : handleRequestLocation}
            onSelectMarker={handleSelectItem}
            onResearchInArea={handleResearch}
            onClearArea={handleClearArea}
          />
        </div>

        {/* 1. 목록 BottomSheet (상시 마운트) */}
        <BottomSheet
          snap={listSnap}
          onSnapChange={setListSnap}
          topOffset={headerHeight}
          peekHeight={120}
          disableScrollLock={placeId !== null}
          hidden={placeId !== null}
          zIndex={20}
        >
          <div className="px-3 pb-24 pt-2">
            <PublicRestaurantListBody
              items={items}
              isLoading={list.isLoading}
              isError={list.isError}
              selectedPlaceId={placeId}
              onSelectItem={handleSelectItem}
              onZoomItem={handleZoomItem}
            />
          </div>
        </BottomSheet>

        {/* 2. 상세 BottomSheet (placeId 존재 시 적층 마운트) */}
        {placeId && (
          <BottomSheet
            key={placeId}
            snap={detailSnap}
            onSnapChange={setDetailSnap}
            topOffset={headerHeight}
            peekHeight={120}
            zIndex={30}
          >
            <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
              <Outlet />
            </Suspense>
          </BottomSheet>
        )}
      </div>
    </div>
  );
};
