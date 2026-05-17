import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import type { RestaurantPublicListQueryType } from '@repo/api-contract';
import { useRestaurantsPublic } from '@repo/shared';
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

// PublicTopBar 높이 (sticky top-0 h-14).
const TOP_BAR_HEIGHT = 56;
// PublicRestaurantListHeader 의 자연 높이 (p-3 + 검색 input + 카테고리 칩 + 총/정렬).
// SearchRow 컨테이너에 px 박아 고정 — BottomSheet topOffset 과 정확히 일치해야
// 시트 상단이 SearchRow 와 어긋나지 않음.
const SEARCH_ROW_HEIGHT = 140;
const MOBILE_FIXED_TOP = TOP_BAR_HEIGHT + SEARCH_ROW_HEIGHT;

// /restaurants 의 모바일 UX 를 네이버 지도식 바텀시트 패턴으로 교체한 v2.
// xl+ 데스크톱은 기존 RestaurantsPage 와 동일한 3-column (단일 페이지 안에서
// CSS 분기). 모바일 전용 변경:
//   - PublicTopBar 항상 고정 (PublicLayout 의 기본 동작 사용 — v2 경로는 hide-
//     on-mobile 분기 대상이 아님)
//   - 검색·카테고리 행을 시트 밖, TopBar 아래 sticky 위치에 배치
//   - BottomSheet (peek/half/full) 안에 리스트 본체. snap=full 진입 시 body
//     스크롤 모드로 swap → 주소창 minify 동작
//   - 카드 클릭 → 진입 전 snap 저장, 시트 half 로, viewKey 가 'detail' 이 되어
//     이전 list 스크롤 저장 + detail 은 top 부터
//   - 닫기 → 진입 전 snap 복원, viewKey 'list' 로 → list 스크롤 복원
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

  // 모바일 시트 상태. 데스크톱에선 사용 안 됨 (시트 자체가 mount 안 됨).
  const [snap, setSnap] = useState<Snap>('peek');
  // 진입 전 snap 보존 → 닫을 때 복원. ref 라 re-render 트리거 없음.
  const snapBeforeDetailRef = useRef<Snap>('peek');

  // 데스크톱 좌/우 패널 토글 — 기존 RestaurantsPage 와 같은 키 사용해 선호 공유.
  const [panelSide, togglePanelSide] = usePanelSide('public.restaurants');

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
      // 진입 전 snap 보존 — 닫을 때 복원.
      snapBeforeDetailRef.current = snap;
      navigate({
        pathname: `/restaurants-v2/${id}`,
        search: window.location.search,
      });
      // 모바일에서만 의미 있음. 데스크톱은 BottomSheet 자체가 mount 안 되어 snap 무시.
      setSnap('half');
    },
    [navigate, snap],
  );

  // 닫기는 RestaurantDetailRoute 의 onClose 가 navigate('/restaurants-v2') 로
  // 처리. 그 결과 placeId 가 null 이 되는 걸 여기서 감지해서 snap 복원.
  // (외부 시스템(URL) 변화에 따른 동기화라 useEffect 가 적절한 쓰임.)
  const prevPlaceIdRef = useRef(placeId);
  useEffect(() => {
    if (prevPlaceIdRef.current !== null && placeId === null) {
      setSnap(snapBeforeDetailRef.current);
    }
    prevPlaceIdRef.current = placeId;
  }, [placeId]);

  const handleResearch = useCallback(
    (b: string) => setParam('bbox', b),
    [setParam],
  );
  const handleClearArea = useCallback(() => setParam('bbox', null), [setParam]);

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
          모바일 (xl-) — 시트 패턴.
          맵 fixed 배경 + SearchRow sticky + BottomSheet.
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="xl:hidden">
        {/* 맵 배경. PublicTopBar(56px) 아래부터 viewport 하단까지. 시트가 위에
            얹혀도 항상 배경에 있어, 시트가 작아질수록 더 많이 보임. */}
        <div className="fixed inset-x-0 bottom-0 top-14 z-0">
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

        {/* SearchRow — TopBar 바로 아래 sticky. 시트는 이 영역도 침범하지 않도록
            topOffset=TOP_BAR_HEIGHT+SEARCH_ROW_HEIGHT 로 비워둔다. 높이를 정확히
            박아 시트 위치 계산과 일치. */}
        <div
          className="sticky z-30 overflow-hidden border-b bg-background/95 backdrop-blur"
          style={{
            top: `${TOP_BAR_HEIGHT}px`,
            height: `${SEARCH_ROW_HEIGHT}px`,
          }}
        >
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

        <BottomSheet
          snap={snap}
          onSnapChange={setSnap}
          topOffset={MOBILE_FIXED_TOP}
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
