import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { List, MapIcon } from 'lucide-react';
import type { RestaurantPublicListQueryType } from '@repo/api-contract';
import { useRestaurantsPublic } from '@repo/shared';
import { PublicRestaurantList } from '~/components/restaurant/PublicRestaurantList';
import { PublicRestaurantsMap } from '~/components/restaurant/PublicRestaurantsMap';
import { PublicRestaurantDetail } from '~/components/restaurant/detail/PublicRestaurantDetail';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { usePanelSide } from '~/stores/panelPrefsStore';

type SortKey = NonNullable<RestaurantPublicListQueryType['sort']>;
const VALID_SORTS: SortKey[] = ['recent', 'satisfaction', 'positive', 'rating'];
const isSortKey = (s: string | null): s is SortKey =>
  s !== null && (VALID_SORTS as string[]).includes(s);

type MobileView = 'list' | 'map';

// 공개 맛집 페이지 — 네이버 지도 패턴: 좌측 결과 리스트 + 우측 풀-뷰포트 지도.
// xl(>=1280) 이상에서 양쪽 동시 노출, 그 미만에서는 [목록/지도] 탭 토글.
export const RestaurantsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category');
  const sortRaw = searchParams.get('sort');
  const sort: SortKey = isSortKey(sortRaw) ? sortRaw : 'recent';
  const bbox = searchParams.get('bbox');
  const placeId = searchParams.get('placeId');

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

  // 모바일 토글 — 상세 패널이 열렸을 때는 자동으로 list 뷰가 자연스러움 (지도
  // 위에 패널 띄우는 것보다 list 위에서 상세 보는 게 narrow 화면에서 덜 답답).
  const [mobileView, setMobileView] = useState<MobileView>('map');
  // 데스크톱 좌/우 패널 토글 — 사용자별 선호 저장. xl 미만에선 의미 없음.
  const [panelSide, togglePanelSide] = usePanelSide('public.restaurants');

  const handleSelectItem = useCallback(
    (id: string) => {
      setParam('placeId', id);
      // 모바일에서 마커 클릭 → 패널이 list aside 안에 있어 자동으로 list 뷰로
      // 전환해야 보인다. xl+ 에서는 동시 표시라 무관.
      setMobileView('list');
    },
    [setParam],
  );
  const handleClosePanel = useCallback(() => {
    setParam('placeId', null);
  }, [setParam]);

  const handleResearch = useCallback(
    (b: string) => setParam('bbox', b),
    [setParam],
  );
  const handleClearArea = useCallback(() => setParam('bbox', null), [setParam]);

  return (
    <div className="relative w-full">
      {/* xl+ : 리스트 / (선택시) 상세 / 지도 3-column — 각 컬럼은 sticky 로 시각적
          풀뷰포트 고정. xl 미만: list 모드는 페이지 자연 흐름(body 스크롤 → 모바일
          브라우저 주소창 자동 minify), map/detail 은 fixed 오버레이.
          panelSide==='right' 일 때 xl+ 에서 flex-row-reverse 로 list+detail 묶음을
          시각적 우측에 배치. */}
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
            mobileView === 'list' ? 'block' : 'hidden xl:block',
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

        {/* 상세 패널 — placeId 있을 때만 mount.
            xl+ 에서는 list 와 map 사이에 별도 column 으로 추가 (네이버 지도
            패턴 — list/detail/map). xl 미만에서는 list aside 위에 absolute
            덮어쓰기로 동작 (좁은 화면에서 list 와 detail 동시 표시 무리).
            mobileView=map 일 때는 숨김 — 사용자가 명시적으로 지도 모드로
            갔으니 detail 도 같이 빠지게. */}
        {placeId && (
          <aside
            className={cn(
              'bg-background',
              // xl+: sticky 별도 컬럼 (list 와 map 사이). border 는 panelSide 에
              // 따라 list aside 와 같은 쪽.
              'xl:sticky xl:top-14 xl:h-[calc(100dvh-3.5rem)] xl:w-[440px] xl:shrink-0 xl:overflow-hidden',
              panelSide === 'left' ? 'xl:border-r' : 'xl:border-l',
              // xl-: 풀스크린 모달. 전역 PublicTopBar(z-30)·모바일 토글(z-40)
              // 위로 덮어 상단 중복 영역과 body 스크롤 누수를 차단한다.
              'fixed inset-0 z-50 xl:relative xl:inset-auto',
              mobileView === 'list' ? 'block' : 'hidden xl:block',
            )}
          >
            <PublicRestaurantDetail placeId={placeId} onClose={handleClosePanel} />
          </aside>
        )}

        <section
          className={cn(
            'relative flex-1',
            // xl+: sticky 풀뷰포트 고정.
            'xl:sticky xl:top-14 xl:h-[calc(100dvh-3.5rem)]',
            // xl-: map 모드일 때 헤더 아래 fixed 풀스크린.
            mobileView === 'map'
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

      {/* 모바일 토글 — xl 미만에서만 노출. fixed 로 스크롤과 무관하게 항상 표시,
          map 모드 fixed 지도(z-10) 위에 떠야 하므로 z-40. */}
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
    </div>
  );
};
