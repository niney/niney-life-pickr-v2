import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import type { RestaurantPublicListQueryType } from '@repo/api-contract';
import { useRestaurantsPublic } from '@repo/shared';
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

  // 모바일 전용 subBar 컨텐츠 — 검색 input + 카테고리 칩 + 총/정렬.
  // xl+ 데스크톱에서는 컨테이너 div 가 display:none (xl:hidden) 이라 차지하는
  // 높이 0 → ResizeObserver 가 측정한 headerHeight 는 자동으로 56(TopBar 만).
  const subBarContent = useMemo(
    () => (
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
    ),
    [q, total, category, sort, setParam],
  );

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
