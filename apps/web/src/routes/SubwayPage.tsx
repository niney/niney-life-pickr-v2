import { useCallback, useDeferredValue, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSubwayStationSearch } from '@repo/shared';
import { usePublicLayout } from '~/components/PublicLayout';
import { TransitTabs } from '~/components/transit/TransitTabs';
import {
  SubwayStationList,
  SubwayStationListBody,
  SubwayStationSearchBar,
} from '~/components/subway/SubwayStationList';
import { SubwayStationsMap } from '~/components/subway/SubwayStationsMap';

// 수도권 전철 역 검색 + 지도. 검색어(q)·선택 역(stn)을 URL 에 동기화 — 새로고침/
// 공유 시 같은 화면 복원. 역사마스터를 로컬 DB 에서 조회하므로 쿼터 부담이 없어
// 라이브 검색(타이핑 즉시)이며, 타이핑 부하는 useDeferredValue 로만 완화한다
// (디바운스 타이머/useEffect 없음).
export const SubwayPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const stn = searchParams.get('stn');

  // 검색 입력의 진실은 로컬 state — URL q 는 쓰기 전용 미러다. URL 을 input value 에
  // 직결하면(useSearchParams 왕복) 라우터 리렌더가 한글 IME 조합 세션을 리셋해 첫
  // 글자가 유실된다(실측: "강남" → "남"). 초기값만 URL 에서 복원(lazy initializer)해
  // 딥링크/새로고침을 살린다. 뒤로가기 등 외부 URL 변경은 input 에 역반영하지 않는다
  // (1차 수용) — URL→state effect 를 넣으면 조합 중 롤백 레이스로 같은 버그가 재발한다.
  const [qInput, setQInput] = useState(() => searchParams.get('q') ?? '');

  // 통합 헤더 실측 높이 — 루트 높이를 viewport 잔여분으로 고정해 지도/리스트가
  // 내부 스크롤로만 동작하게 한다.
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

  // 라이브 검색 — 인풋 값은 즉시(qInput)지만, 실제 쿼리는 deferred 로 지연해 타이핑
  // 부하를 완화한다(파생 상태 — effect 없음).
  const deferredQ = useDeferredValue(qInput);
  const search = useSubwayStationSearch(deferredQ);

  // 소비 게이트 — 유효 검색어(1~50자, 훅 enabled 와 동일 조건)가 아닐 때는 캐시에
  // 남은 이전 응답을 마커·리스트로 흘리지 않는다.
  const trimmedQ = deferredQ.trim();
  const hasQ = trimmedQ.length >= 1 && trimmedQ.length <= 50;
  const items = hasQ ? (search.data?.items ?? []) : [];
  const total = hasQ ? (search.data?.total ?? 0) : 0;
  const fetchedAt = hasQ ? (search.data?.fetchedAt ?? null) : null;

  // 재검색(새 키 + placeholder 표시) 중에도 진행 표시 — placeholder 를 띄운 페치는
  // isLoading 이 false 라 별도로 본다.
  const searching =
    search.isLoading || (search.isFetching && search.isPlaceholderData);

  // 선택 역(stn)이 확정 결과에 없음 — 안내만 하고 URL 은 건드리지 않는다.
  // placeholder 표시 중에는 판정 보류.
  const selectedMissing =
    stn !== null &&
    hasQ &&
    search.isSuccess &&
    !search.isPlaceholderData &&
    !items.some((it) => it.id === stn);

  // 라이브 검색 — 로컬 state 를 먼저 갱신(IME 안전한 input 진실)하고, URL q 는
  // 그 뒤에 replace 로 미러링한다. 검색어가 바뀌면 이전 선택(stn)은 다른 결과셋의
  // 것이라 해제한다.
  const handleChangeQ = useCallback(
    (next: string) => {
      setQInput(next);
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          if (next) sp.set('q', next);
          else sp.delete('q');
          sp.delete('stn');
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleSelect = useCallback((id: string) => setParam('stn', id), [setParam]);

  const listProps = {
    q: qInput,
    total,
    fetchedAt,
    items,
    isLoading: searching,
    isError: search.isError,
    selectedId: stn,
    selectedMissing,
    onChangeQ: handleChangeQ,
    onSelect: handleSelect,
    onRetry: () => void search.refetch(),
  };

  return (
    <div className="flex w-full flex-col" style={{ height: `calc(100dvh - ${headerHeight}px)` }}>
      <TransitTabs active="subway" />
      <div className="min-h-0 flex-1">
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            데스크톱 (xl+) — 좌 검색 패널(400px) + 우 지도.
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="hidden h-full xl:flex">
          <aside className="flex w-[400px] shrink-0 flex-col border-r">
            <SubwayStationList {...listProps} />
          </aside>
          <section className="relative flex-1">
            <SubwayStationsMap groups={items} selectedId={stn} onSelect={handleSelect} />
          </section>
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            모바일 (xl 미만) — 검색바 고정 / 지도 / 리스트 세로 적층.
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="flex h-full flex-col xl:hidden">
          <div className="border-b">
            <SubwayStationSearchBar
              q={qInput}
              total={total}
              fetchedAt={fetchedAt}
              truncated={hasQ && items.length < total}
              onChangeQ={handleChangeQ}
            />
          </div>
          <div className="relative min-h-[40dvh] flex-1">
            <SubwayStationsMap groups={items} selectedId={stn} onSelect={handleSelect} />
          </div>
          <div className="h-[38dvh] overflow-y-auto border-t p-3">
            <SubwayStationListBody
              q={qInput}
              items={items}
              isLoading={searching}
              isError={search.isError}
              selectedId={stn}
              selectedMissing={selectedMissing}
              onSelect={handleSelect}
              onRetry={() => void search.refetch()}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
