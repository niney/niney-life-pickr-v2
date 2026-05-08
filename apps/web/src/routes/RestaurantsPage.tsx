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
    <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      {/* xl+ : 리스트 / (선택시) 상세 / 지도 3-column. xl 미만: 토글. */}
      <div className="relative flex h-full w-full">
        <aside
          className={cn(
            'relative h-full w-full border-r bg-background xl:w-[400px] xl:shrink-0',
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
              // xl+: 인접 column
              'xl:relative xl:h-full xl:w-[440px] xl:shrink-0 xl:border-r',
              // xl-: list aside 영역 위로 덮어쓰기 (mobileView=list 일 때만)
              'absolute inset-y-0 left-0 right-0 z-30 xl:left-auto xl:right-auto xl:z-auto',
              mobileView === 'list' ? 'block' : 'hidden xl:block',
            )}
          >
            <PublicRestaurantDetail placeId={placeId} onClose={handleClosePanel} />
          </aside>
        )}

        <section
          className={cn(
            'relative h-full flex-1',
            mobileView === 'map' ? 'block' : 'hidden xl:block',
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

      {/* 모바일 토글 — xl 미만에서만 노출 */}
      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 overflow-hidden rounded-full border bg-background/95 shadow-md xl:hidden">
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
