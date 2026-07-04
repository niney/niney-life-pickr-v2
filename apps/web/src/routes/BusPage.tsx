import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  useBusNearbyStations,
  useBusPositions,
  useBusStationArrivals,
  useBusStationSearch,
  useBusStationsRefresh,
} from '@repo/shared';
import { usePublicLayout } from '~/components/PublicLayout';
import { BusArrivalPanel } from '~/components/bus/BusArrivalPanel';
import {
  BusStationList,
  BusStationListBody,
  BusStationSearchBar,
} from '~/components/bus/BusStationList';
import { BusStationsMap } from '~/components/bus/BusStationsMap';

// GPS 좌표 반올림 자릿수 — 소수 5자리(≈1.1m)면 정류장 식별에 충분하고, URL 에
// 원시 좌표를 그대로 노출하지 않아 공유 시 위치 정밀도도 낮춘다.
const roundCoord = (n: number): number => Math.round(n * 1e5) / 1e5;

// near 파라미터('lat,lng') 파싱 — 형식/한국 WGS84 범위(계약과 동일)를 통과해야
// 주변 모드로 인정. 딥링크·수동 편집으로 들어온 쓰레기 값은 null → 키워드 모드.
const parseNear = (raw: string | null): { lat: number; lng: number } | null => {
  if (!raw) return null;
  const [latStr, lngStr] = raw.split(',');
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 33 || lat > 39 || lng < 124 || lng > 132) return null;
  return { lat, lng };
};

// 서울시 버스 정류장 검색 + 지도 + 실시간 도착정보. 검색어(q)·선택 정류장(stId)·
// 선택 노선(routeId)·주변 좌표(near)를 URL 에 동기화 — 새로고침/공유 시 같은 화면
// 복원. 검색은 제출형(Enter/버튼)만, 실시간 폴링은 선택 시에만 — 서울시 API 일
// 한도 보호 정책이 클라이언트 UX 까지 관통한다.
export const BusPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const stId = searchParams.get('stId');
  const routeId = searchParams.get('routeId');

  // 주변 모드 — near 파라미터가 유효 좌표일 때. 키워드(q)와 배타이며, URL 이
  // 유일 진실이라 새로고침/딥링크 시 Geolocation 재요청 없이 좌표로 복원된다.
  const near = parseNear(searchParams.get('near'));
  const nearMode = near !== null;

  // Geolocation 실패 안내(권한 거부/타임아웃/미지원/비보안) — 좌표를 못 얻으면
  // URL 을 바꾸지 않으므로 이 로컬 상태로만 리스트 영역에 노출한다.
  const [geoError, setGeoError] = useState<string | null>(null);

  // 지도 자동 재조회 좌표 — 줌이 가까운 상태에서 패닝이 끝나면 지도가 알아서
  // 넘겨준다. URL(near)은 명시 액션의 몫이라 건드리지 않는다 — history 오염
  // 방지, 새로고침 시 마지막 명시 지점으로 복원. 명시 액션 시 null 로 리셋.
  const [autoNear, setAutoNear] = useState<{ lat: number; lng: number } | null>(null);
  // 실제 조회·기준점 마커에 쓰는 좌표 — 자동 조회가 있으면 그쪽이 우선.
  const effectiveNear = nearMode ? (autoNear ?? near) : null;

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

  // 주변 정류장 — near(또는 자동 재조회) 좌표가 있을 때만 호출(훅 enabled 가드).
  // 좌표는 URL 에서 복원 → Geolocation 재요청 없이 딥링크 동작.
  const nearby = useBusNearbyStations(
    effectiveNear?.lat ?? null,
    effectiveNear?.lng ?? null,
  );
  const nearItems = nearMode ? (nearby.data?.items ?? []) : [];
  const nearSearching =
    nearby.isLoading || (nearby.isFetching && nearby.isPlaceholderData);

  // ── 활성 소스 — 주변 모드면 nearby, 아니면 검색. 이 아래 로직(선택/지도/도착)은
  //    소스만 다를 뿐 동일하게 흐른다. ──────────────────────────────────────────
  const activeItems = nearMode ? nearItems : items;
  const activeTotal = nearMode ? (nearby.data?.total ?? 0) : total;
  const activeFetchedAt = nearMode ? (nearby.data?.fetchedAt ?? null) : fetchedAt;
  const activeLoading = nearMode ? nearSearching : searching;
  const activeError = nearMode ? nearby.isError : search.isError;
  const activeSuccess = nearMode ? nearby.isSuccess : search.isSuccess;
  const activePlaceholder = nearMode
    ? nearby.isPlaceholderData
    : search.isPlaceholderData;

  // 선택 정류장(stId)이 확정된 결과에 없음(다른 검색어로 재검색 등) — 안내만
  // 하고 URL 은 건드리지 않는다. placeholder 표시 중에는 판정 보류.
  const selectedMissing =
    stId !== null &&
    (nearMode || hasQ) &&
    activeSuccess &&
    !activePlaceholder &&
    !activeItems.some((it) => it.stId === stId);

  // 새 검색 제출 — q 교체 + 이전 선택(stId/routeId) 해제를 한 번의 history
  // 교체로. setParam 2회 호출은 함수형 updater 가 같은 렌더의 searchParams 를
  // 두 번 읽어 첫 변경이 유실될 수 있다.
  const handleSubmitQ = useCallback(
    (next: string) => {
      // 키워드 제출 → 주변 모드 해제(near/geoError/자동 좌표 제거). q 와 near 는 배타.
      setGeoError(null);
      setAutoNear(null);
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          const v = next.trim();
          if (v) sp.set('q', v);
          else sp.delete('q');
          sp.delete('near');
          sp.delete('stId');
          sp.delete('routeId');
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // '주변 정류장' 버튼 — Geolocation 으로 좌표를 얻어 near 모드로. 성공 시 q 를
  // 지워(배타) URL 을 near 로 교체, 실패 시 리스트 영역에 안내만 남긴다.
  const handleNearby = useCallback(() => {
    setGeoError(null);
    setAutoNear(null);
    // HTTPS(또는 localhost) 아니면 브라우저가 Geolocation 자체를 막는다.
    if (!('geolocation' in navigator) || !window.isSecureContext) {
      setGeoError(
        '내 위치를 사용하려면 보안 연결(HTTPS)이 필요합니다. 이 기기의 브라우저에서 위치 접근이 제한됐을 수 있어요.',
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = roundCoord(pos.coords.latitude);
        const lng = roundCoord(pos.coords.longitude);
        setSearchParams(
          (prev) => {
            const sp = new URLSearchParams(prev);
            sp.set('near', `${lat},${lng}`);
            sp.delete('q');
            sp.delete('stId');
            sp.delete('routeId');
            return sp;
          },
          { replace: true },
        );
      },
      (err) => {
        // 코드별 안내 — 권한 거부(1)/위치 불가(2)/타임아웃(3).
        const msg =
          err.code === err.PERMISSION_DENIED
            ? '위치 접근이 거부됐습니다. 브라우저 설정에서 위치 권한을 허용해 주세요.'
            : err.code === err.TIMEOUT
              ? '위치를 가져오는 데 시간이 너무 오래 걸렸어요. 다시 시도해 주세요.'
              : '현재 위치를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.';
        setGeoError(msg);
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }, [setSearchParams]);

  // '이 위치에서 재검색' — 지도 중심 좌표로 near 를 교체. 기준점이 더 이상
  // 내 위치(GPS)가 아닐 수 있지만 파란 점 마커의 의미는 '조회 기준점'으로
  // 통일한다. 이전 선택(stId/routeId)은 새 영역과 무관해 함께 해제.
  const handleResearchAt = useCallback(
    (center: { lat: number; lng: number }) => {
      setGeoError(null);
      setAutoNear(null);
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          sp.set('near', `${roundCoord(center.lat)},${roundCoord(center.lng)}`);
          sp.delete('q');
          sp.delete('stId');
          sp.delete('routeId');
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // 지도 자동 재조회 — 줌이 가까운 상태의 패닝 종료 시 지도에서 호출. URL 은
  // 건드리지 않고 로컬 좌표만 교체 → 리스트/마커가 새 지점 기준으로 갱신된다.
  const handleAutoResearchAt = useCallback((center: { lat: number; lng: number }) => {
    setAutoNear({ lat: roundCoord(center.lat), lng: roundCoord(center.lng) });
  }, []);

  // 주변 모드 해제 — near/geoError 제거하고 검색(키워드) 화면으로 복귀.
  const handleClearNear = useCallback(() => {
    setGeoError(null);
    setAutoNear(null);
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        sp.delete('near');
        sp.delete('stId');
        sp.delete('routeId');
        return sp;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  // 정류장 선택 — 다른 정류장으로 바뀌면 노선 선택(routeId)은 의미가 없어
  // 같은 history 교체 안에서 함께 해제.
  const handleSelect = useCallback(
    (id: string) => {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          if (sp.get('stId') !== id) sp.delete('routeId');
          sp.set('stId', id);
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // '← 목록' — 정류장/노선 선택을 한 번에 해제해 검색 목록으로 복귀.
  const handleBack = useCallback(() => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        sp.delete('stId');
        sp.delete('routeId');
        return sp;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  // 노선 행 클릭 — 재클릭 시 해제(토글).
  const handleToggleRoute = useCallback(
    (id: string) => setParam('routeId', id === routeId ? null : id),
    [setParam, routeId],
  );

  const { mutate: refreshMutate, isPending: refreshPending } = refresh;
  const { refetch: nearbyRefetch } = nearby;
  const handleForceRefresh = useCallback(() => {
    // 주변 모드에는 강제 새로고침 개념이 없다 — 에러 재시도(onRetry)로만 들어오며
    // 60초 격자 캐시 소스를 다시 조회한다.
    if (nearMode) {
      void nearbyRefetch();
      return;
    }
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
  }, [nearMode, nearbyRefetch, q, refreshMutate, refreshPending]);

  // 선택 정류장 실체 — 현재 결과에 있어야만 도착정보 뷰로 전환한다. 없으면
  // (다른 검색어로 재검색 등 죽은 stId) 기존 selectedMissing 안내 경로 유지.
  const selectedStation =
    stId !== null ? (activeItems.find((it) => it.stId === stId) ?? null) : null;

  // 도착정보 30초 폴링 — 가상정류장(arsId '0')은 훅 enabled 가 차단.
  const arrivals = useBusStationArrivals(selectedStation?.arsId ?? null);
  const arrivalItems = arrivals.data?.items ?? [];

  // 선택 노선의 staOrd 로 위치 조회 구간(직전 5개 정류장 윈도우) 계산.
  // staOrd 가 null 인 노선은 패널에서 클릭 비활성이라 여기 못 들어온다.
  const selectedArrival = routeId
    ? (arrivalItems.find((it) => it.busRouteId === routeId) ?? null)
    : null;
  const staOrd = selectedArrival?.staOrd ?? null;
  const positions = useBusPositions(
    routeId,
    staOrd !== null ? Math.max(1, staOrd - 5) : null,
    staOrd,
  );
  // 노선 선택 중일 때만 지도에 차량 마커 — 해제 시 즉시 제거.
  const vehicles = routeId ? (positions.data?.items ?? []) : [];

  const arrivalPanel = selectedStation ? (
    <BusArrivalPanel
      station={selectedStation}
      items={arrivalItems}
      fetchedAt={arrivals.data?.fetchedAt ?? null}
      isLoading={arrivals.isLoading}
      isFetching={arrivals.isFetching}
      isPlaceholder={arrivals.isPlaceholderData}
      isError={arrivals.isError}
      selectedRouteId={routeId}
      onToggleRoute={handleToggleRoute}
      onBack={handleBack}
      onRetry={() => void arrivals.refetch()}
    />
  ) : null;

  const listProps = {
    q,
    nearMode,
    geoError,
    items: activeItems,
    total: activeTotal,
    fetchedAt: activeFetchedAt,
    isLoading: activeLoading,
    isError: activeError,
    selectedStId: stId,
    selectedMissing,
    // 주변 모드는 강제 새로고침 개념이 없어 refreshing 은 키워드 모드에서만.
    refreshing: refreshPending,
    // 주변 응답에는 stale 소스가 없다.
    stale: nearMode ? false : stale,
    onSubmitQ: handleSubmitQ,
    onSelect: handleSelect,
    onForceRefresh: handleForceRefresh,
    onNearby: handleNearby,
    onClearNear: handleClearNear,
  };

  return (
    <div className="w-full" style={{ height: `calc(100dvh - ${headerHeight}px)` }}>
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          데스크톱 (xl+) — 좌 검색 패널(400px) + 우 지도.
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="hidden h-full xl:flex">
        {/* 정류장 선택 시 좌패널이 도착정보 뷰로 전환 — '← 목록'으로 복귀. */}
        <aside className="flex w-[400px] shrink-0 flex-col border-r">
          {arrivalPanel ?? <BusStationList {...listProps} />}
        </aside>
        <section className="relative flex-1">
          <BusStationsMap
            items={activeItems}
            vehicles={vehicles}
            myLocation={effectiveNear}
            selectedStId={stId}
            onSelectMarker={handleSelect}
            onResearchAt={nearMode ? handleResearchAt : undefined}
            onAutoResearchAt={nearMode ? handleAutoResearchAt : undefined}
            suppressFit={autoNear !== null}
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
            nearMode={nearMode}
            total={activeTotal}
            fetchedAt={activeFetchedAt}
            refreshing={refreshPending}
            truncated={(nearMode || hasQ) && activeItems.length < activeTotal}
            stale={nearMode ? false : stale}
            onSubmitQ={handleSubmitQ}
            onForceRefresh={handleForceRefresh}
            onNearby={handleNearby}
            onClearNear={handleClearNear}
          />
        </div>
        <div className="relative min-h-[40dvh] flex-1">
          <BusStationsMap
            items={activeItems}
            vehicles={vehicles}
            myLocation={effectiveNear}
            selectedStId={stId}
            onSelectMarker={handleSelect}
            onResearchAt={nearMode ? handleResearchAt : undefined}
            onAutoResearchAt={nearMode ? handleAutoResearchAt : undefined}
            suppressFit={autoNear !== null}
          />
        </div>
        {/* 정류장 선택 시 하단 리스트 영역이 도착정보 뷰로 전환 — 패널은 내부
            스크롤(헤더 고정)이라 컨테이너는 flex 로만 감싼다. */}
        {arrivalPanel ? (
          <div className="flex h-[38dvh] flex-col border-t">{arrivalPanel}</div>
        ) : (
          <div className="h-[38dvh] overflow-y-auto border-t p-3">
            <BusStationListBody
              q={q}
              nearMode={nearMode}
              geoError={geoError}
              items={activeItems}
              isLoading={activeLoading}
              isError={activeError}
              selectedStId={stId}
              selectedMissing={selectedMissing}
              refreshing={refreshPending}
              onSelect={handleSelect}
              onRetry={handleForceRefresh}
            />
          </div>
        )}
      </div>
    </div>
  );
};
