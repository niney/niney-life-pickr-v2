import { useCallback, useMemo, useRef, useState } from 'react';
import type { BusStationItemType } from '@repo/api-contract';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { busRouteTypeColor } from '@repo/utils';
import {
  useBusFavorites,
  useBusNearbyStations,
  useBusPositions,
  useBusRouteDetail,
  useBusStationArrivals,
  useBusStationSearch,
  useBusStationsRefresh,
  useSubwayFavorites,
} from '@repo/shared';
import { usePublicLayout } from '~/components/PublicLayout';
import { BusArrivalPanel } from '~/components/bus/BusArrivalPanel';
import {
  BusStationList,
  BusStationListBody,
  BusStationSearchBar,
} from '~/components/bus/BusStationList';
import { BusStationsMap } from '~/components/bus/BusStationsMap';
import { TransitTabs } from '~/components/transit/TransitTabs';
import {
  TransitFavoritesSection,
  type TransitFavTarget,
} from '~/components/transit/TransitFavoritesSection';

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
  const navigate = useNavigate();
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
  // 즐겨찾기 — 게스트/로그인 하이브리드. 로그인 직후 게스트 저장분을 서버로
  // 1회 병합하는 부수효과도 이 훅이 담당(BusPage 에서 단 한 번만 호출).
  const favorites = useBusFavorites();
  // 통합 즐겨찾기 섹션은 양 도메인을 함께 보여준다 — 지하철 즐겨찾기도 여기서
  // 읽는다(각 훅은 페이지당 1회 호출 규칙, BusPage 에선 이 한 번뿐).
  const subwayFavorites = useSubwayFavorites();
  const hasFavorites =
    favorites.stations.length > 0 ||
    favorites.routes.length > 0 ||
    subwayFavorites.stations.length > 0 ||
    subwayFavorites.lines.length > 0;

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

  // 지도 마커 누적 — 주변 모드에서 자동 재조회로 결과가 교체될 때 이전 지점
  // 마커까지 사라지면 이동 중 화면이 간헐적으로 비어 보인다. 지도에는 이번
  // 주변 세션의 합집합을 유지하고(리스트는 현재 지점 결과만), 모드 이탈 시
  // 리셋한다. ref 는 렌더 간 누적 저장소 — useMemo 안에서만 갱신.
  const accumRef = useRef(new Map<string, BusStationItemType>());
  // 명시 액션(📍/재검색 버튼)으로 URL near 가 바뀌면 누적을 비운다 — 안 비우면
  // 직후 fitToMarkers 가 이전 지점 마커까지 포함해 크게 줌아웃된다.
  const nearRaw = searchParams.get('near');
  const prevNearRawRef = useRef(nearRaw);
  const mapItems = useMemo(() => {
    if (!nearMode) {
      accumRef.current = new Map();
      return items;
    }
    if (prevNearRawRef.current !== nearRaw) {
      prevNearRawRef.current = nearRaw;
      accumRef.current = new Map();
    }
    const acc = accumRef.current;
    for (const it of nearItems) acc.set(it.stId, it);
    // 무한 성장 방지 — 상한 초과 시 현재 지점 결과만 남기고 리셋.
    if (acc.size > 600) {
      accumRef.current = new Map(nearItems.map((it) => [it.stId, it]));
    }
    return [...accumRef.current.values()];
  }, [nearMode, nearRaw, nearItems, items]);

  // 선택 정류장(stId)이 확정된 결과에 없음(다른 검색어로 재검색 등) — 안내만
  // 하고 URL 은 건드리지 않는다. placeholder 표시 중에는 판정 보류.
  // 주변 모드는 지도 누적(mapItems)에 있으면 유효 — 누적 마커 클릭도 선택이다.
  const selectedMissing =
    stId !== null &&
    (nearMode || hasQ) &&
    activeSuccess &&
    !activePlaceholder &&
    !mapItems.some((it) => it.stId === stId);

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

  // 추적 노선의 경유 정류소 stId 집합 — handleSelect 가 클릭 시점에 읽어(ref)
  // 정류장 전환이 '노선 위 이동'인지 판정한다. 값은 routeDetail 확정 후 아래에서
  // 갱신(MapCanvas 의 latest-value ref 패턴과 동일하게 렌더 중 대입).
  const routeStationIdsRef = useRef<Set<string>>(new Set());

  // 정류장 선택 — 다른 정류장으로 바뀌면 노선 선택(routeId)은 보통 의미가 없어
  // 해제한다. 단 새 정류장이 추적 중 노선의 경유 정류소면(노선 점 클릭 등)
  // routeId 를 유지 — 노선 위를 정류장 단위로 이어 탐색할 수 있게(도착정보에도
  // 그 노선이 있어 staOrd 윈도우가 자연 갱신).
  const handleSelect = useCallback(
    (id: string) => {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          if (sp.get('stId') !== id) {
            const staysOnRoute =
              sp.get('routeId') !== null && routeStationIdsRef.current.has(id);
            if (!staysOnRoute) sp.delete('routeId');
          }
          sp.set('stId', id);
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // 즐겨찾는 버스 선택 — 정류장 + 노선을 한 번에 설정(도착 패널 + 지도 추적).
  // 즐겨찾기 섹션은 초기 화면(q/near 없음)에서만 노출되므로 q/near 는 이미 비어
  // 있다 — 별도 정리 없이 stId/routeId 만 세팅한다.
  const handleSelectFavoriteRoute = useCallback(
    (favStId: string, busRouteId: string) => {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          sp.set('stId', favStId);
          sp.set('routeId', busRouteId);
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // 통합 즐겨찾기 '이동' — 버스 항목은 기존 in-page 핸들러(동일 URL 계약)로
  // 재사용하고, 지하철 항목은 지하철 탭으로 navigate(stn 딥링크). 새 URL 시맨틱을
  // 만들지 않는다.
  const handleFavNavigate = useCallback(
    (t: TransitFavTarget) => {
      switch (t.kind) {
        case 'bus-station':
          handleSelect(t.stId);
          break;
        case 'bus-route':
          handleSelectFavoriteRoute(t.stId, t.busRouteId);
          break;
        case 'subway-station':
        case 'subway-line':
          navigate({
            pathname: '/subway',
            search: `?${new URLSearchParams({ stn: t.stationId })}`,
          });
          break;
      }
    },
    [handleSelect, handleSelectFavoriteRoute, navigate],
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

  // 노선 보기(추적 중) — 선택 노선의 형상 + 경유 정류소 + 기본정보. 형상이
  // 정적이라 24h 캐시·폴링 없음. routeId 선택 시에만 조회.
  const routeDetail = useBusRouteDetail(routeId);
  // 카드용 노선 기본정보 — 미추적/로딩/실패면 null(패널이 카드 생략).
  const routeInfo = routeId ? (routeDetail.data?.info ?? null) : null;
  // 노선색 — 유형 코드 매핑. 형상 폴리라인과 경유지 점이 같은 색을 공유한다.
  const routeColor = routeDetail.data
    ? busRouteTypeColor(routeDetail.data.info.routeType)
    : '#6b7280';
  // 지도 폴리라인 — 점 2개 미만이면 null. 참조 안정화(memo)로 1,986점 LineString
  // 을 매 렌더 재생성하지 않는다.
  const routeLine = useMemo(() => {
    if (!routeId || !routeDetail.data || routeDetail.data.path.length < 2) return null;
    return { points: routeDetail.data.path, color: routeColor };
  }, [routeId, routeDetail.data, routeColor]);
  // 경유 정류소 — 추적 중일 때만 지도 점 마커로.
  const routeStops = routeId ? routeDetail.data?.stations : undefined;
  // handleSelect(클릭 시점)가 읽을 경유 정류소 stId 집합을 최신화.
  routeStationIdsRef.current = useMemo(
    () => new Set((routeDetail.data?.stations ?? []).map((s) => s.stId)),
    [routeDetail.data],
  );

  // 선택 정류장 실체 — 현재 결과에 있으면 그것으로 도착정보 뷰로 전환한다.
  // 활성 결과(검색/주변)에 없더라도 즐겨찾기 스냅샷(정류장 또는 노선), 나아가
  // 노선 보기 경유 정류소 스냅샷에 있으면 그 값으로 복원 — 즐겨찾기/노선 점으로
  // 진입한 stId 는 검색 목록에 없기 때문. 활성 결과가 항상 먼저 이기므로 기존
  // 검색/딥링크 동작은 바뀌지 않는다. 다 없으면 null(죽은 stId → selectedMissing).
  const selectedStation = useMemo<BusStationItemType | null>(() => {
    if (stId === null) return null;
    const fromActive = mapItems.find((it) => it.stId === stId);
    if (fromActive) return fromActive;
    const favStation = favorites.stations.find((s) => s.stId === stId);
    if (favStation) return favStation;
    // 노선 즐겨찾기 스냅샷도 정류장 정보를 품고 있어 폴백 소스가 된다
    // (그 정류장이 즐겨찾기에 없을 수 있음). name 은 stationName 스냅샷.
    const favRoute = favorites.routes.find((r) => r.stId === stId);
    if (favRoute) {
      return {
        stId: favRoute.stId,
        arsId: favRoute.arsId,
        name: favRoute.stationName,
        lat: favRoute.lat,
        lng: favRoute.lng,
      };
    }
    // 노선 경유지 점 클릭으로 목록에 없는 정류장 선택 시 도착 패널이 살아야 한다.
    const routeStation = routeDetail.data?.stations.find((s) => s.stId === stId);
    if (routeStation) {
      return {
        stId: routeStation.stId,
        arsId: routeStation.arsId,
        name: routeStation.name,
        lat: routeStation.lat,
        lng: routeStation.lng,
      };
    }
    return null;
  }, [stId, mapItems, favorites.stations, favorites.routes, routeDetail.data]);

  // 지도용 마커 목록 — 선택 정류장이 활성 결과에 없으면(즐겨찾기 진입) 덧대어
  // 마커 표시·센터링(BusStationsMap 의 fit/flyTo)이 동작하게 한다. 활성 결과에
  // 이미 있으면 그대로라 기존 지도 동작은 바뀌지 않는다.
  const mapItemsForMap = useMemo(() => {
    if (!selectedStation) return mapItems;
    if (mapItems.some((it) => it.stId === selectedStation.stId)) return mapItems;
    return [...mapItems, selectedStation];
  }, [mapItems, selectedStation]);

  // 도착정보 30초 폴링 — 가상정류장(arsId '0')은 훅 enabled 가 차단.
  const arrivals = useBusStationArrivals(selectedStation?.arsId ?? null);
  const arrivalItems = arrivals.data?.items ?? [];

  // 알약 라벨용 노선 표기 — 도착정보의 routeName 우선, 없으면(도착 로딩 전/
  // 운행종료 노선) 노선 상세의 routeName 폴백.
  const selectedArrival = routeId
    ? (arrivalItems.find((it) => it.busRouteId === routeId) ?? null)
    : null;
  // 노선 전체 실시간 위치 — 구간(staOrd 윈도우) 조회에서 전환. 쿼터 비용 동일
  // (1콜)하고 도착정보를 기다릴 필요가 없어 노선 선택 즉시 전 차량이 뜬다.
  const positions = useBusPositions(routeId);
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
      stationFavorite={favorites.isStationFavorite(selectedStation.stId)}
      onToggleStationFavorite={() =>
        favorites.toggleStation({
          stId: selectedStation.stId,
          arsId: selectedStation.arsId,
          name: selectedStation.name,
          lat: selectedStation.lat,
          lng: selectedStation.lng,
        })
      }
      isRouteFavorite={(busRouteId) =>
        favorites.isRouteFavorite(selectedStation.stId, busRouteId)
      }
      onToggleRouteFavorite={(arrival) =>
        favorites.toggleRoute({
          stId: selectedStation.stId,
          busRouteId: arrival.busRouteId,
          routeName: arrival.routeName,
          stationName: selectedStation.name,
          arsId: selectedStation.arsId,
          lat: selectedStation.lat,
          lng: selectedStation.lng,
        })
      }
      routeInfo={routeInfo}
    />
  ) : null;

  // 초기 화면(검색어·주변·선택 정류장 없음)에 노출할 즐겨찾기 섹션. 0개면
  // undefined 를 넘겨 리스트 본체가 기존 빈 상태 안내를 그대로 보여준다.
  const favoritesSection = hasFavorites ? (
    <TransitFavoritesSection
      bus={favorites}
      subway={subwayFavorites}
      onNavigate={handleFavNavigate}
    />
  ) : undefined;

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
    isStationFavorite: favorites.isStationFavorite,
    onToggleStationFavorite: favorites.toggleStation,
    favoritesContent: favoritesSection,
  };

  return (
    <div className="flex w-full flex-col" style={{ height: `calc(100dvh - ${headerHeight}px)` }}>
      {/* 대중교통 서브탭 — 버스/지하철 전환. 아래 콘텐츠가 잔여 높이를 채운다. */}
      <TransitTabs active="bus" />
      <div className="min-h-0 flex-1">
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
            // 데스크톱·모바일 지도 래퍼는 CSS 숨김(hidden xl:flex / xl:hidden)이라
            // 둘 다 항상 마운트된다 — MapCanvas 가 페이지당 2개 동시 생존. 풀 키를
            // 레이아웃별로 나눠 각자 재사용시켜야 모바일 폭에서도 플래시가 사라진다.
            poolKey="transit-desktop"
            items={mapItemsForMap}
            vehicles={vehicles}
            vehicleLabel={selectedArrival?.routeName ?? routeInfo?.routeName ?? null}
            vehicleColor={routeColor}
            myLocation={effectiveNear}
            selectedStId={stId}
            onSelectMarker={handleSelect}
            onResearchAt={nearMode ? handleResearchAt : undefined}
            onAutoResearchAt={nearMode ? handleAutoResearchAt : undefined}
            routeLine={routeLine}
            routeStops={routeStops}
            // 노선 추적 중에는 fit 억제 — 선택 정류장이 활성결과에 없어 mapItems
            // 가 바뀌어도(경유지 점 클릭 등) 지도가 노선 전체로 줌아웃되지 않게.
            suppressFit={autoNear !== null || routeId !== null}
            loading={nearMode && nearby.isFetching}
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
            // 데스크톱과 별개 인스턴스(동시 마운트) — 풀 키 분리.
            poolKey="transit-mobile"
            items={mapItemsForMap}
            vehicles={vehicles}
            vehicleLabel={selectedArrival?.routeName ?? routeInfo?.routeName ?? null}
            vehicleColor={routeColor}
            myLocation={effectiveNear}
            selectedStId={stId}
            onSelectMarker={handleSelect}
            onResearchAt={nearMode ? handleResearchAt : undefined}
            onAutoResearchAt={nearMode ? handleAutoResearchAt : undefined}
            routeLine={routeLine}
            routeStops={routeStops}
            // 노선 추적 중에는 fit 억제 — 선택 정류장이 활성결과에 없어 mapItems
            // 가 바뀌어도(경유지 점 클릭 등) 지도가 노선 전체로 줌아웃되지 않게.
            suppressFit={autoNear !== null || routeId !== null}
            loading={nearMode && nearby.isFetching}
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
              isStationFavorite={favorites.isStationFavorite}
              onToggleStationFavorite={favorites.toggleStation}
              favoritesContent={favoritesSection}
            />
          </div>
        )}
      </div>
      </div>
    </div>
  );
};
