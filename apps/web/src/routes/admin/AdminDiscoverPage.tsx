import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useActiveCrawlJobStore,
  useNaverSearch,
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

  const search = useNaverSearch(q, bbox);
  // 어드민 list 응답에는 좌표가 없어서 공개 list 를 그대로 쓴다 — 데이터는 동일하고
  // 좌표·도로명·대표 사진·AI 통계가 한 번에 들어와 마커/리스트 모두 충분히 채울
  // 수 있다. 검색 q 와는 독립 — 등록된 맛집 전체를 보여 줘야 사용자가 새 검색
  // 결과와 위치 비교를 할 수 있다.
  const list = useRestaurantsPublic({ limit: 200 });
  const searchItems = search.data?.items ?? [];
  const registeredItems = list.data?.items ?? [];

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
    // 병렬 startCrawl. 서버가 max_concurrent 로 알아서 큐잉(stage='queued') 하므로
    // 클라이언트는 N 개를 한꺼번에 보내도 안전. mutateAsync 의 결과로 받은 jobId
    // 를 글로벌 active job store 에 등록 — 다른 페이지(/admin/restaurants)에서도
    // 같은 잡이 inline 진행 패널로 노출된다.
    const results = await Promise.allSettled(
      selected.map((it) =>
        startMutation.mutateAsync({ url: it.rawSourceUrl, mode: 'create' }),
      ),
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const it = selected[i];
      if (!r || !it) continue;
      if (r.status === 'fulfilled' && r.value.ok) {
        addJob({
          jobId: r.value.jobId,
          placeId: it.placeId,
          source: 'list-row',
          mode: 'create',
        });
      }
    }
    setCheckedIds(new Set());
  }, [checkedIds, searchItems, startMutation, addJob]);

  const handleSubmitQuery = useCallback(
    (next: string) => setParam('q', next || null),
    [setParam],
  );
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
        label: it.placeId === placeId ? it.name : undefined,
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
            panelSide={side}
          />
        </section>
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

          {/* 등록 맛집 상세 슬라이드 — 같은 패널 영역을 absolute 로 덮어쓰며
              translate-x 로 슬라이드. unmount 시점은 detailPlaceId === null
              로 떨어지는 즉시 — 닫기 애니메이션은 생략(단순). */}
          {detailPlaceId && (
            <div
              key={detailPlaceId}
              className="absolute inset-0 z-20 animate-in slide-in-from-right-4 bg-background duration-200"
            >
              <PublicRestaurantDetail
                placeId={detailPlaceId}
                onClose={handleCloseDetail}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
