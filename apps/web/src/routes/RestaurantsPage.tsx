import { Suspense, useCallback, useState } from 'react';
import { Outlet, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import { List, MapIcon } from 'lucide-react';
import type { RestaurantPublicListQueryType } from '@repo/api-contract';
import { useRestaurantsPublic } from '@repo/shared';
import { PublicRestaurantList } from '~/components/restaurant/PublicRestaurantList';
import { PublicRestaurantsMap } from '~/components/restaurant/PublicRestaurantsMap';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { usePanelSide } from '~/stores/panelPrefsStore';

type SortKey = NonNullable<RestaurantPublicListQueryType['sort']>;
const VALID_SORTS: SortKey[] = ['recent', 'satisfaction', 'positive', 'rating'];
const isSortKey = (s: string | null): s is SortKey =>
  s !== null && (VALID_SORTS as string[]).includes(s);

type MobileView = 'list' | 'map';

// 공개 맛집 페이지(layout). 네이버 지도 패턴: 좌측 결과 리스트 + 우측 풀-뷰포트
// 지도. xl(>=1280) 이상에서 양쪽 동시 노출, 그 미만에서는 [목록/지도] 탭 토글.
//
// 상세는 nested route(/restaurants/:placeId)의 Outlet 으로 들어온다 —
// - xl+ : list 와 map 사이에 별도 column.
// - xl- : list/map 을 통째로 hidden 처리하고 outlet 만 페이지 흐름으로 표시
//   (body 스크롤 = 모바일 브라우저 주소창 자동 minify + 모달 패턴 없음).
export const RestaurantsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category');
  const sortRaw = searchParams.get('sort');
  const sort: SortKey = isSortKey(sortRaw) ? sortRaw : 'recent';
  const bbox = searchParams.get('bbox');

  // 상세 활성 여부는 nested route path 로 판단 (URL 의 단일 source-of-truth).
  const detailMatch = useMatch('/restaurants/:placeId');
  const placeId = detailMatch?.params.placeId ?? null;
  const navigate = useNavigate();

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

  // 호버는 일시적 — URL 까지 안 가고 로컬 상태로만 (마커 강조 즉시 반영).
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);

  // 모바일 토글 — xl 미만 list/map 전환. placeId 있을 땐 outlet 이 화면을
  // 차지하므로 토글 자체가 숨김.
  const [mobileView, setMobileView] = useState<MobileView>('map');
  // 데스크톱 좌/우 패널 토글 — 사용자별 선호 저장. xl 미만에선 의미 없음.
  const [panelSide, togglePanelSide] = usePanelSide('public.restaurants');

  const handleSelectItem = useCallback(
    (id: string) => {
      // 식당 선택 = path 전환 (push) — 식당 간 뒤로가기 가능, tab query 는
      // 초기화(home). 기존 list 검색/필터 query 는 보존.
      navigate({ pathname: `/restaurants/${id}`, search: window.location.search });
      setMobileView('list');
    },
    [navigate],
  );

  const handleResearch = useCallback(
    (b: string) => setParam('bbox', b),
    [setParam],
  );
  const handleClearArea = useCallback(() => setParam('bbox', null), [setParam]);

  // 모바일에서 상세가 열려있으면 list/map/토글을 모두 숨겨 outlet 만 노출.
  // body 스크롤이 자연 발생해 주소창 minify 가 동작한다.
  const mobileHasDetail = placeId !== null;

  return (
    <div className="relative w-full">
      <div
        className={cn(
          'relative flex w-full',
          panelSide === 'right' && 'xl:flex-row-reverse',
        )}
      >
        <aside
          className={cn(
            'relative w-full bg-background',
            // xl+: sticky 컬럼 — 헤더(56px) 아래 고정, aside 자체가 스크롤 컨테이너.
            'xl:sticky xl:top-14 xl:h-[calc(100dvh-3.5rem)] xl:w-[400px] xl:shrink-0 xl:overflow-y-auto',
            // 패널이 좌측이면 우측 모서리에 border-r, 우측이면 좌측 모서리.
            panelSide === 'left' ? 'border-r xl:border-r' : 'xl:border-l',
            // 모바일: 상세 열림 → 무조건 숨김. 그 외엔 mobileView==='list' 일 때만.
            mobileHasDetail
              ? 'hidden xl:block'
              : mobileView === 'list'
                ? 'block'
                : 'hidden xl:block',
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

        {/* 상세 outlet.
            - xl+ : list 와 map 사이 sticky 컬럼.
            - xl- : 페이지 흐름의 일부 (자체 height 없음 → body 스크롤). */}
        {placeId && (
          <aside
            className={cn(
              'w-full bg-background',
              // xl+: sticky 별도 컬럼.
              'xl:sticky xl:top-14 xl:h-[calc(100dvh-3.5rem)] xl:w-[440px] xl:shrink-0 xl:overflow-hidden',
              panelSide === 'left' ? 'xl:border-r' : 'xl:border-l',
            )}
          >
            {/* 상세 탭 묶음은 lazy — 목록은 그대로 두고 이 패널만 로딩 표시. */}
            <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
              <Outlet />
            </Suspense>
          </aside>
        )}

        <section
          className={cn(
            'relative flex-1',
            // xl+: sticky 풀뷰포트 고정.
            'xl:sticky xl:top-14 xl:h-[calc(100dvh-3.5rem)]',
            // 모바일: 상세 열림 → 숨김. 그 외 map 모드일 때 fixed 풀스크린.
            mobileHasDetail
              ? 'hidden xl:block'
              : mobileView === 'map'
                ? 'fixed inset-x-0 bottom-0 top-14 z-10 xl:relative xl:inset-auto xl:bottom-auto'
                : 'hidden xl:block',
          )}
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
        </section>
      </div>

      {/* 모바일 토글 — xl 미만 + 상세 미열림에서만 노출. fixed 로 스크롤과 무관하게
          항상 표시, map 모드 fixed 지도(z-10) 위에 떠야 하므로 z-40. */}
      {!mobileHasDetail && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 overflow-hidden rounded-full border bg-background/95 shadow-md xl:hidden">
          <Button
            type="button"
            variant={mobileView === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setMobileView('list')}
            className="rounded-none gap-1.5"
          >
            <List className="size-3.5" />
            목록 ({total})
          </Button>
          <Button
            type="button"
            variant={mobileView === 'map' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setMobileView('map')}
            className="rounded-none gap-1.5"
          >
            <MapIcon className="size-3.5" />
            지도
          </Button>
        </div>
      )}
    </div>
  );
};
