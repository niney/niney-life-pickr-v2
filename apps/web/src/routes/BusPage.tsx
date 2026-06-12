import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useBusStationSearch, useBusStationsRefresh } from '@repo/shared';
import { usePublicLayout } from '~/components/PublicLayout';
import {
  BusStationList,
  BusStationListBody,
  BusStationSearchBar,
} from '~/components/bus/BusStationList';
import { BusStationsMap } from '~/components/bus/BusStationsMap';

// 서울시 버스 정류장 검색 + 지도. 검색어(q)·선택 정류장(stId)을 URL 에 동기화
// — 새로고침/공유 시 같은 화면 복원. 검색은 제출형(Enter/버튼)만 — 서울시 API
// 일 한도 보호 정책이 클라이언트 UX 까지 관통한다.
export const BusPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const stId = searchParams.get('stId');

  // 통합 헤더(TopBar+subBar) 실측 높이 — 루트 높이를 viewport 잔여분으로 고정해
  // 지도/리스트가 내부 스크롤로만 동작하게 한다.
  const { headerHeight } = usePublicLayout();

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

  const search = useBusStationSearch(q);
  const refresh = useBusStationsRefresh();

  // 소비 게이트 — 유효 검색어(2~50자, 훅 enabled 와 동일 조건)가 아닐 때는
  // 캐시에 남은 이전 응답을 마커·배너로 흘리지 않는다.
  const trimmedQ = q.trim();
  const hasQ = trimmedQ.length >= 2 && trimmedQ.length <= 50;
  const items = hasQ ? (search.data?.items ?? []) : [];
  const total = hasQ ? (search.data?.total ?? 0) : 0;
  const fetchedAt = hasQ ? (search.data?.fetchedAt ?? null) : null;
  // 서울시 API 실패로 만료 캐시를 반환한 응답 — 메타 행 경고 배지용.
  const stale = hasQ && search.data?.source === 'stale';

  // 재검색(새 키 + placeholder 표시) 중에도 진행 표시 — placeholder 를 띄운
  // 페치는 isLoading 이 false 라 별도로 본다.
  const searching =
    search.isLoading || (search.isFetching && search.isPlaceholderData);

  // 선택 정류장(stId)이 확정된 결과에 없음(다른 검색어로 재검색 등) — 안내만
  // 하고 URL 은 건드리지 않는다. placeholder 표시 중에는 판정 보류.
  const selectedMissing =
    stId !== null &&
    hasQ &&
    search.isSuccess &&
    !search.isPlaceholderData &&
    !items.some((it) => it.stId === stId);

  // 새 검색 제출 — q 교체 + 이전 선택(stId) 해제를 한 번의 history 교체로.
  // setParam 2회 호출은 함수형 updater 가 같은 렌더의 searchParams 를 두 번
  // 읽어 첫 변경이 유실될 수 있다.
  const handleSubmitQ = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          const v = next.trim();
          if (v) sp.set('q', v);
          else sp.delete('q');
          sp.delete('stId');
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleSelect = useCallback((id: string) => setParam('stId', id), [setParam]);

  const { mutate: refreshMutate, isPending: refreshPending } = refresh;
  const handleForceRefresh = useCallback(() => {
    const t = q.trim();
    // isPending 가드 — 연타로 서울시 API 를 중복 호출하지 않는다.
    if (t.length < 2 || t.length > 50 || refreshPending) return;
    refreshMutate(q, {
      // source!=='api' = 서버 60초 스로틀로 실제 재호출이 생략된 응답.
      // 웹 전용 피드백이라 shared 훅이 아닌 여기서 처리.
      onSuccess: (data) => {
        if (data.source !== 'api') toast.info('잠시 후 다시 시도해 주세요.');
      },
      onError: () => {
        toast.error('새로고침에 실패했어요. 잠시 후 다시 시도해 주세요.');
      },
    });
  }, [q, refreshMutate, refreshPending]);

  const listProps = {
    q,
    items,
    total,
    fetchedAt,
    isLoading: searching,
    isError: search.isError,
    selectedStId: stId,
    selectedMissing,
    refreshing: refreshPending,
    stale,
    onSubmitQ: handleSubmitQ,
    onSelect: handleSelect,
    onForceRefresh: handleForceRefresh,
  };

  return (
    <div className="w-full" style={{ height: `calc(100dvh - ${headerHeight}px)` }}>
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          데스크톱 (xl+) — 좌 검색 패널(400px) + 우 지도.
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="hidden h-full xl:flex">
        <aside className="flex w-[400px] shrink-0 flex-col border-r">
          <BusStationList {...listProps} />
        </aside>
        <section className="relative flex-1">
          <BusStationsMap
            items={items}
            selectedStId={stId}
            onSelectMarker={handleSelect}
          />
        </section>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          모바일 (xl 미만) — 검색바 고정 / 지도 / 리스트 세로 적층.
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex h-full flex-col xl:hidden">
        <div className="border-b">
          <BusStationSearchBar
            q={q}
            total={total}
            fetchedAt={fetchedAt}
            refreshing={refreshPending}
            truncated={hasQ && items.length < total}
            stale={stale}
            onSubmitQ={handleSubmitQ}
            onForceRefresh={handleForceRefresh}
          />
        </div>
        <div className="relative min-h-[40dvh] flex-1">
          <BusStationsMap
            items={items}
            selectedStId={stId}
            onSelectMarker={handleSelect}
          />
        </div>
        <div className="h-[38dvh] overflow-y-auto border-t p-3">
          <BusStationListBody
            q={q}
            items={items}
            isLoading={searching}
            isError={search.isError}
            selectedStId={stId}
            selectedMissing={selectedMissing}
            refreshing={refreshPending}
            onSelect={handleSelect}
            onRetry={handleForceRefresh}
          />
        </div>
      </div>
    </div>
  );
};
