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
import {
  useRestaurantFavorites,
  useRestaurantPublic,
  useRestaurantsPublic,
  useUserLocation,
} from '@repo/shared';
import { computeBboxAround, formatBbox, isInKorea } from '@repo/utils';
import { usePublicLayout } from '~/components/PublicLayout';
import { RestaurantDetailWarmup } from '~/components/restaurant/RestaurantDetailWarmup';
import { toFavoriteItem } from '~/components/restaurant/favoriteSnapshot';
import {
  PublicRestaurantList,
  PublicRestaurantListBody,
  PublicRestaurantListHeader,
} from '~/components/restaurant/PublicRestaurantList';
import { PublicRestaurantsMap } from '~/components/restaurant/PublicRestaurantsMap';
import { BottomSheet } from '~/components/sheet/BottomSheet';
import { SHEET_PEEK_HEIGHT, useMapSheets } from '~/components/sheet/useMapSheets';
import { useDebounced } from '~/lib/useDebounced';
import { useIsDesktopXl } from '~/lib/useMediaQuery';
import { cn } from '~/lib/utils';
import { usePanelSide } from '~/stores/panelPrefsStore';

type SortKey = NonNullable<RestaurantPublicListQueryType['sort']>;
const VALID_SORTS: SortKey[] = ['recent', 'satisfaction', 'positive', 'rating'];
const isSortKey = (s: string | null): s is SortKey =>
  s !== null && (VALID_SORTS as string[]).includes(s);

// 목록 응답 전의 고정 빈 배열 — `?? []` 는 렌더마다 새 배열이라 지도의 markers 메모가 매번 깨진다.
const NO_ITEMS: RestaurantPublicListItemType[] = [];

// 사용자 위치 기반 첫 진입 시 검색 반경. ±1.5km → 3km × 3km 박스 — 도심
// 권역이면 limit 80 안에 충분히 채워지고, 지방이면 결과 0 가능 (그땐 사용자
// 가 "전체 영역" 으로 풀거나 패닝하여 재검색).
const INITIAL_NEARBY_KM = 1.5;
// 권한 거부/한국 밖일 때 폴백 — 서울시청. vworld 가 한국 영토만 커버해서
// 한국 밖 좌표는 타일 전부 404, 그래서 모바일과 동일 폴백 정책.
const SEOUL: { lat: number; lng: number } = { lat: 37.5665, lng: 126.978 };
// 첫 진입에서 위치 판정(→ bbox 자동 적용)을 기다려 주는 상한(ms). 이 안에 정해지면 목록 조회는 bbox
// 가 붙은 1회뿐이고, 넘으면(첫 방문의 권한 프롬프트·콜드 측위) 전역 목록을 먼저 보여 준다.
const INITIAL_AREA_WAIT_MS = 800;
// /restaurants 의 모바일 UX 를 네이버 지도식 바텀시트 패턴으로 교체한 v2.
// xl+ 데스크톱은 기존 RestaurantsPage 와 같은 3-column, 그 아래는 시트 패턴 — 분기는 CSS 이중
// 마운트(hidden xl:flex / xl:hidden)가 아니라 useIsDesktopXl(JS)로 한 벌만 그린다(일상지도·집값과
// 같은 방식 — 지도·목록·상세가 화면에 보이는 쪽만 존재). 모바일 전용 변경:
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
  const isDesktop = useIsDesktopXl();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  // 입력은 q(URL)로 즉시 반영하되 리스트 쿼리엔 디바운스된 값을 넘겨, 타이핑마다
  // limit=80 리스트 API 를 재요청하지 않게 한다(RestaurantsPage 와 같은 방식).
  const debouncedQ = useDebounced(q, 300);
  const category = searchParams.get('category');
  const sortRaw = searchParams.get('sort');
  const sort: SortKey = isSortKey(sortRaw) ? sortRaw : 'recent';
  const bbox = searchParams.get('bbox');

  const detailMatch = useMatch('/restaurants-v2/:placeId');
  const shareMatch = useMatch('/r/:placeId');
  const isShareRoute = !!shareMatch;
  const placeId = detailMatch?.params.placeId ?? shareMatch?.params.placeId ?? null;
  // BrowserRouter 의 useNavigate 는 pathname 이 바뀔 때마다 새 함수를 돌려준다(상대 경로 해석용
  // 클로저). 그대로 콜백 deps 에 두면 식당을 고를 때마다 handleSelectItem 이 새 참조가 되어 카드
  // 80장의 memo 가 전부 깨진다 — favoritesRef 와 같은 방식으로 최신 함수만 ref 에 담아 둔다.
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  });

  const viewMode: 'list' | 'detail' = placeId === null ? 'list' : 'detail';

  // 목록/상세 두 시트의 스냅 조율(상세 진입 시 목록 스냅 기억 → peek, 상세 half / 닫히면 복원)은
  // 공용 훅 — 대중교통·일상지도와 같은 규칙.
  const { listSnap, setListSnap, detailSnap, setDetailSnap } = useMapSheets(placeId !== null);

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

  // ── 첫 목록 조회 게이트 ──────────────────────────────────────────────────────
  // bbox 없이 들어오면 아래 effect 가 위치(또는 서울 폴백) 기준 bbox 를 곧 URL 에 넣는다. 그 전에
  // 조회하면 전국 80건을 받았다가 바로 버리게 되므로 bbox 가 정해질 때까지 조회를 미룬다. 위치
  // 판정이 늦어질 수 있어(INITIAL_AREA_WAIT_MS) 상한을 넘으면 예전처럼 전역 목록부터 보여 주고,
  // bbox 가 정해지면 다시 조회한다. 공유 라우트(자동 bbox 없음)와 bbox 를 들고 온 진입은 기다리지 않는다.
  //
  // areaResolved = "bbox 가 한 번이라도 정해졌거나 상한이 지났다". 한 번 켜지면 이후엔 "전체 영역"
  // 으로 bbox 를 지워도 기다리지 않는다. bbox 가 URL 에 들어온 바로 그 렌더에서 켠다(렌더 중 파생) —
  // effect 에서 켜면 "게이트는 열렸는데 bbox 는 아직" 인 렌더가 끼어 전역 조회가 한 번 나간다.
  const [areaResolved, setAreaResolved] = useState(false);
  if (!areaResolved && !isShareRoute && bbox !== null) setAreaResolved(true);
  const waitingForArea = !isShareRoute && bbox === null && !areaResolved;
  useEffect(() => {
    if (!waitingForArea) return;
    const timer = window.setTimeout(() => setAreaResolved(true), INITIAL_AREA_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [waitingForArea]);

  const list = useRestaurantsPublic(
    {
      q: debouncedQ || undefined,
      category: category ?? undefined,
      sort,
      bbox: bbox ?? undefined,
      limit: 80,
    },
    { enabled: !waitingForArea },
  );
  const items = list.data?.items ?? NO_ITEMS;
  const total = list.data?.total ?? 0;
  // 게이트가 닫혀 있는 동안은 조회 전이라 isLoading 이 false 다 — 그대로 두면 목록이 "조건에 맞는
  // 식당이 없습니다" 로 보이므로 로딩으로 친다.
  const listLoading = list.isLoading || waitingForArea;

  // 맛집 즐겨찾기 — 페이지당 1회 호출 원칙. 상세(Outlet)에는 context 로 내려주고
  // 카드에는 ref 경유 안정 콜백으로 넘겨 카드 memo 를 보존한다(시트 드래그 등
  // 페이지 재렌더마다 80개 카드가 통째로 리렌더되지 않도록).
  const favorites = useRestaurantFavorites();
  const favoritesRef = useRef(favorites);
  useEffect(() => {
    favoritesRef.current = favorites;
  });
  const handleToggleFavorite = useCallback((item: RestaurantPublicListItemType) => {
    favoritesRef.current.toggle(toFavoriteItem(item));
  }, []);
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
      // 공유 진입의 지도 핀은 상세 응답으로 조립 — 여행로그 요약도 상세의 tour 에서.
      tour: detail.tour
        ? {
            nTravelers: detail.tour.nTravelers,
            bayesScore: detail.tour.bayesScore,
            spendPpMedian: detail.tour.spendPpMedian,
            revisitRate: detail.tour.revisitRate,
          }
        : null,
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
      navigateRef.current({
        pathname: isShareRoute ? `/r/${id}` : `/restaurants-v2/${id}`,
        search: isShareRoute ? '' : window.location.search,
      });
      // 시트 스냅 전이(목록 peek·상세 half, 닫힐 때 복원)는 placeId 변화를 보고 useMapSheets 가 처리.
    },
    [isShareRoute],
  );

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
  // 데스크톱(xl+)은 등록하지 않는다(목록 패널이 자기 헤더를 갖는다) → headerHeight 는 TopBar 만.
  // detail 진입 시에도 null → headerHeight 가 TopBar 만큼으로 줄어 시트가 상세 컨텐츠를
  // 더 넓게 노출 (검색·카테고리는 list 화면에서만 의미 있음).
  const subBarContent = useMemo(() => {
    if (isDesktop || viewMode === 'detail') return null;
    return (
      <PublicRestaurantListHeader
        q={q}
        total={total}
        category={category}
        sort={sort}
        onChangeQ={(next) => setParam('q', next)}
        onChangeCategory={(next) => setParam('category', next)}
        onChangeSort={(next) => setParam('sort', next === 'recent' ? null : next)}
      />
    );
  }, [isDesktop, viewMode, q, total, category, sort, setParam]);

  // subBar 등록/해제. useLayoutEffect 로 paint 전 PublicLayout state 갱신 →
  // 첫 paint 부터 통합 헤더 모습으로 렌더.
  useLayoutEffect(() => {
    setSubBar(subBarContent);
    return () => setSubBar(null);
  }, [setSubBar, subBarContent]);

  return (
    <div
      className={cn(
        'relative w-full',
        isDesktop && 'flex',
        isDesktop && effectivePanelSide === 'right' && 'flex-row-reverse',
      )}
      // 데스크톱은 헤더 아래 한 화면에 꼭 맞춘다(실측 헤더 높이 — 일상지도·집값과 같은 방식). 고정값
      // (100dvh - 3.5rem)으로 잡으면 헤더 테두리 1px 만큼 넘쳐 문서에 세로 스크롤이 생긴다.
      style={isDesktop ? { height: `calc(100dvh - ${headerHeight}px)` } : undefined}
    >
      {/* 지도 — 데스크톱은 3-column 의 마지막 칸(order-3), 모바일은 헤더 아래 fixed 배경(시트가 그 위에).
          두 분기에서 같은 자리(첫 자식)라 화면 폭이 xl 경계를 넘나들어도 OL 인스턴스(뷰포트·타일)는
          그대로다. --map-bottom-inset: 좌하단 레이어 컨트롤이 peek 시트 위로 올라오게(MapLayerControl). */}
      <section
        className={cn(isDesktop ? 'relative order-3 min-h-0 flex-1' : 'fixed inset-x-0 bottom-0 z-0')}
        style={
          isDesktop
            ? undefined
            : ({ top: `${headerHeight}px`, '--map-bottom-inset': `${SHEET_PEEK_HEIGHT}px` } as React.CSSProperties)
        }
      >
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

      {/* 상세 탭 묶음은 lazy 청크 — 받는 동안 상세·인사이트 조회는 여기서 먼저 걸어 둔다. */}
      {placeId && <RestaurantDetailWarmup placeId={placeId} />}

      {isDesktop ? (
        /* ━━━ 데스크톱 (xl+) — 기존 RestaurantsPage 와 같은 3-column: [목록 | 상세 | 지도]. ━━━ */
        <>
          {!isShareRoute && (
            <aside
              className={cn(
                'relative order-1 h-full w-[400px] shrink-0 overflow-y-auto bg-background',
                panelSide === 'left' ? 'border-r' : 'border-l',
              )}
            >
              <PublicRestaurantList
                items={items}
                total={total}
                isLoading={listLoading}
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
                isFavorite={favorites.isFavorite}
                onToggleFavorite={handleToggleFavorite}
              />
            </aside>
          )}

          {placeId && (
            <aside
              className={cn(
                'order-2 h-full w-[440px] shrink-0 overflow-hidden bg-background',
                effectivePanelSide === 'left' ? 'border-r' : 'border-l',
              )}
            >
              <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
                <Outlet context={favorites} />
              </Suspense>
            </aside>
          )}
        </>
      ) : (
        /* ━━━ 모바일 (xl-) — 통합 헤더(subBar slot) + 시트 패턴. 지도는 위 fixed 배경, 시트의
           topOffset 은 통합 헤더 실측 높이. ━━━ */
        <>
          {/* 1. 목록 BottomSheet (상시 마운트) */}
          <BottomSheet
            snap={listSnap}
            onSnapChange={setListSnap}
            topOffset={headerHeight}
            peekHeight={SHEET_PEEK_HEIGHT}
            disableScrollLock={placeId !== null}
            hidden={placeId !== null}
            zIndex={20}
          >
            <div className="px-3 pb-24 pt-2">
              <PublicRestaurantListBody
                items={items}
                isLoading={listLoading}
                isError={list.isError}
                selectedPlaceId={placeId}
                onSelectItem={handleSelectItem}
                onZoomItem={handleZoomItem}
                isFavorite={favorites.isFavorite}
                onToggleFavorite={handleToggleFavorite}
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
              peekHeight={SHEET_PEEK_HEIGHT}
              zIndex={30}
            >
              <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
                <Outlet context={favorites} />
              </Suspense>
            </BottomSheet>
          )}
        </>
      )}
    </div>
  );
};
