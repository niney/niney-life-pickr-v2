import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useActiveCrawlJobStore,
  useNaverSearch,
  useRestaurantListSummaryEvents,
  useRestaurantsPublic,
  useStartCrawl,
} from '@repo/shared';
import {
  DiscoverPanel,
  type DiscoverTab,
} from '~/components/admin/discover/DiscoverPanel';
import { DiscoverMap } from '~/components/admin/discover/DiscoverMap';
import { PublicRestaurantDetail } from '~/components/restaurant/detail/PublicRestaurantDetail';
import type { MapMarker } from '~/components/restaurant/MapCanvas';
import { cn } from '~/lib/utils';
import { usePanelSide } from '~/stores/panelPrefsStore';

const isDiscoverTab = (s: string | null): s is DiscoverTab =>
  s === 'search' || s === 'registered';

// /admin/discover — 풀블리드 지도 + 우/좌 토글 가능한 패널.
// task 6 단계는 골격 + 검색·등록 리스트 + URL 동기화까지. 마커 합성, 다중 선택,
// 등록 상세 슬라이드는 task 7~9 에서 채운다.
export const AdminDiscoverPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const bbox = searchParams.get('bbox');
  const tab: DiscoverTab = isDiscoverTab(searchParams.get('tab'))
    ? (searchParams.get('tab') as DiscoverTab)
    : 'search';
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

  const [side, toggleSide] = usePanelSide('admin.discover');

  // 지도 viewport 의 최신 bbox — DiscoverMap 의 onViewportSync 로 갱신.
  // 검색 트리거 시점에 URL bbox 가 비어 있으면 이 ref 값을 자동으로 박아
  // 첫 검색도 사용자가 보고 있는 영역에서 결과가 떨어지게 한다.
  const viewportBboxRef = useRef<string | null>(null);

  const search = useNaverSearch(q, bbox);
  // 어드민 list 응답에는 좌표가 없어서 공개 list 를 그대로 쓴다 — 데이터는 동일하고
  // 좌표·도로명·대표 사진·AI 통계가 한 번에 들어와 마커/리스트 모두 충분히 채울
  // 수 있다. 검색 q 와는 독립 — 등록된 맛집 전체를 보여 줘야 사용자가 새 검색
  // 결과와 위치 비교를 할 수 있다.
  // 발견은 어드민 작업 페이지 — 재진입마다 최신 데이터를 강제로 받는다.
  // placeholderData 가 살아 있어 깜빡임은 없고, SSE 가 라이브 갱신을 이어받는다.
  const list = useRestaurantsPublic(
    { limit: 200 },
    { alwaysRefetchOnMount: true },
  );
  const searchItems = search.data?.items ?? [];
  const registeredItems = list.data?.items ?? [];
  // 등록된 행마다 summary SSE 구독 — 진행 배지(pending/running/done/failed)
  // 가 크롤·요약 진행과 함께 라이브 갱신된다. 어드민 맛집 페이지와 동일한
  // 싱글톤 manager 라 연결은 1개로 멀티플렉싱.
  useRestaurantListSummaryEvents(registeredItems.map((it) => it.placeId));

  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  // 다중 선택은 페이지 레벨에서 보관 — 탭 전환·검색어 변경에도 유지.
  // 선택된 placeId 가 더 이상 검색 결과에 없으면 자동으로 무시 (필터링).
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const startMutation = useStartCrawl();
  const addJob = useActiveCrawlJobStore((s) => s.add);
  const activeJobCount = useActiveCrawlJobStore(
    (s) => Object.keys(s.jobs).length,
  );

  const handleToggleChecked = useCallback((placeId: string, on: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(placeId);
      else next.delete(placeId);
      return next;
    });
  }, []);

  const handleStartSelected = useCallback(async () => {
    if (checkedIds.size === 0) return;
    const selected = searchItems.filter((it) => checkedIds.has(it.placeId));
    if (selected.length === 0) return;
    // 직렬 호출. 병렬(Promise.allSettled)로 보내면 거의 동시에 서버에 도착해
    // actor 단위 rate_limit 에 둘째부터 모두 걸린다(이슈: "1개만 크롤링됨").
    // mutateAsync 를 await 로 묶어 응답 사이 자연 stagger 가 발생하게 한다.
    // 시작 거부된 placeId 는 체크 상태로 남겨 두어 사용자가 재시도 가능.
    const failedIds = new Set<string>();
    for (const it of selected) {
      try {
        const r = await startMutation.mutateAsync({
          url: it.rawSourceUrl,
          mode: 'create',
        });
        if (r.ok) {
          addJob({
            jobId: r.jobId,
            placeId: it.placeId,
            source: 'list-row',
            mode: 'create',
          });
        } else {
          failedIds.add(it.placeId);
        }
      } catch {
        failedIds.add(it.placeId);
      }
    }
    setCheckedIds(failedIds);
  }, [checkedIds, searchItems, startMutation, addJob]);

  const handleSubmitQuery = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const np = new URLSearchParams(prev);
          if (next === '') np.delete('q');
          else np.set('q', next);
          // bbox 가 아직 박혀 있지 않고 검색어가 있으면 현재 viewport 자동 첨부.
          // 이 한 줄이 첫 검색을 "이 지역 재검색" 과 동일하게 동작하게 한다.
          // viewportBboxRef 가 null 인 경우(지도 첫 렌더 전)엔 그대로 두어
          // 백엔드가 default center 로 폴백.
          if (next !== '' && !np.get('bbox') && viewportBboxRef.current) {
            np.set('bbox', viewportBboxRef.current);
          }
          return np;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const handleViewportSync = useCallback((nextBbox: string) => {
    viewportBboxRef.current = nextBbox;
  }, []);
  const handleChangeTab = useCallback(
    (next: DiscoverTab) =>
      setParam('tab', next === 'search' ? null : next),
    [setParam],
  );
  const handleSelectItem = useCallback(
    (id: string) => setParam('placeId', id),
    [setParam],
  );
  const handleResearch = useCallback(
    (b: string) => setParam('bbox', b),
    [setParam],
  );
  const handleClearArea = useCallback(() => setParam('bbox', null), [setParam]);
  const handleCloseDetail = useCallback(() => setParam('placeId', null), [setParam]);

  // 등록된 placeId 가 선택된 경우에만 상세 슬라이드 노출. 검색 결과의 미등록
  // placeId 는 단지 마커/행 강조에 그친다.
  const detailPlaceId =
    placeId && registeredItems.some((it) => it.placeId === placeId)
      ? placeId
      : null;

  // 검색 결과(빨강) + 등록 맛집(회색) 합성. 같은 placeId 가 양쪽에 있으면 등록이
  // 우선 — 이미 등록된 가게는 회색으로 보여야 사용자가 중복 크롤링을 피할 수 있다.
  const markers: MapMarker[] = useMemo(() => {
    const seen = new Set<string>();
    const out: MapMarker[] = [];
    for (const it of registeredItems) {
      if (it.latitude === null || it.longitude === null) continue;
      if (seen.has(it.placeId)) continue;
      seen.add(it.placeId);
      out.push({
        id: it.placeId,
        lat: it.latitude,
        lng: it.longitude,
        label: it.placeId === placeId ? it.name : undefined,
        variant: 'muted',
      });
    }
    for (const it of searchItems) {
      if (it.lat === null || it.lng === null) continue;
      if (seen.has(it.placeId)) continue;
      seen.add(it.placeId);
      out.push({
        id: it.placeId,
        lat: it.lat,
        lng: it.lng,
        // 검색 결과(빨강)는 항상 이름 노출 — 사용자가 지도에서 후보를 한눈에
        // 식별할 수 있게. 등록 마커(회색)는 종 자체가 많아질 수 있어 선택된
        // 것만 표시(아래 루프 유지).
        label: it.name,
        variant: 'primary',
      });
    }
    return out;
  }, [registeredItems, searchItems, placeId]);

  // panelSide 'right' → DOM 순서(map → panel)가 시각적으로 일치 (flex-row).
  // 'left' → flex-row-reverse 로 뒤집어 패널이 화면 왼쪽에 붙는다.
  const reverse = side === 'left';

  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      <div
        className={cn(
          'flex h-full w-full',
          reverse ? 'xl:flex-row-reverse' : 'xl:flex-row',
        )}
      >
        {/* 지도는 xl+ 에서만 노출. 어드민 발견은 데스크톱 가정 — 좁은 화면에선
            패널이 풀블리드로 떨어진다. 모바일 지도 모드가 필요해지면 추후 추가. */}
        <section className="relative hidden h-full flex-1 xl:block">
          <DiscoverMap
            markers={markers}
            selectedPlaceId={placeId}
            hoveredPlaceId={hoveredPlaceId}
            appliedBbox={bbox}
            onSelectMarker={handleSelectItem}
            onResearchInArea={handleResearch}
            onClearArea={handleClearArea}
            onViewportSync={handleViewportSync}
            panelSide={side}
          />
        </section>
        {/* 등록 맛집 상세 — 별도 column 으로 추가 (공개 맛집 페이지와 동일한
            list/detail/map 3-column 패턴). DOM 순서 [map, detail, list] 라
            flex-row 일 땐 시각적 [좌:map, 중:detail, 우:list], flex-row-reverse
            일 땐 [좌:list, 중:detail, 우:map] — 어느 쪽이든 detail 이 list 옆에
            붙는다. xl 미만에선 absolute 로 패널 영역 위에 덮어쓰기. */}
        {detailPlaceId && (
          <aside
            key={detailPlaceId}
            className={cn(
              'bg-background',
              'xl:relative xl:h-full xl:w-[440px] xl:shrink-0',
              side === 'right' ? 'xl:border-l' : 'xl:border-r',
              'absolute inset-0 z-30 xl:relative xl:inset-auto xl:z-auto',
              'animate-in slide-in-from-right-4 duration-200',
            )}
          >
            <PublicRestaurantDetail
              placeId={detailPlaceId}
              onClose={handleCloseDetail}
            />
          </aside>
        )}

        <aside
          className={cn(
            'relative h-full w-full bg-background xl:w-[400px] xl:shrink-0',
            // 패널이 시각적으로 우측이면 좌측 모서리에 border, 좌측이면 우측 모서리.
            side === 'right' ? 'xl:border-l' : 'xl:border-r',
          )}
        >
          <DiscoverPanel
            side={side}
            onToggleSide={toggleSide}
            q={q}
            onSubmitQuery={handleSubmitQuery}
            tab={tab}
            onChangeTab={handleChangeTab}
            searchItems={searchItems}
            registeredItems={registeredItems}
            searchLoading={search.isLoading || search.isFetching}
            searchError={search.isError}
            selectedPlaceId={placeId}
            hoveredPlaceId={hoveredPlaceId}
            onSelectItem={handleSelectItem}
            onHoverItem={setHoveredPlaceId}
            checkedIds={checkedIds}
            onToggleChecked={handleToggleChecked}
            onStartSelected={handleStartSelected}
            startInFlight={startMutation.isPending}
            activeJobCount={activeJobCount}
          />
        </aside>
      </div>
    </div>
  );
};
