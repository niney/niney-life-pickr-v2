import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BusStationSearchResultType } from '@repo/api-contract';
import { busApi } from '../api/bus.api.js';

// 실시간(도착/위치) 폴링 × 일 1,000건(개발계정) 한도 제약 — 폴링은 화면이
// 활성이고 정류장/노선이 선택된 동안에만 돈다. enabled(선택 시)만 켜고,
// refetchIntervalInBackground 는 기본 false 라 탭 비활성 시 자동 중단.

// 제출형 검색 — q 는 호출자가 Enter/버튼으로 확정한 검색어. 서버가 30일
// DB 캐시를 들고 있고 정류장 정보는 장기 불변이라 staleTime 24h — 같은
// 키워드 재방문 시 일 1,000건(개발계정) 한도를 안 깎는다.
export const useBusStationSearch = (q: string) => {
  const trimmed = q.trim();
  // 서버 q 제약(2~50자) FE 미러 — 범위 밖이면 호출 자체를 막는다.
  const enabled = trimmed.length >= 2 && trimmed.length <= 50;
  return useQuery({
    queryKey: ['bus', 'stations', 'search', trimmed],
    queryFn: () => busApi.searchStations(trimmed),
    enabled,
    staleTime: 86_400_000,
    // v5 는 disabled 쿼리에도 placeholderData 를 채운다 — 빈/짧은 검색어로
    // 돌아왔을 때 이전 결과가 잔상으로 남지 않게 enabled 일 때만 유지.
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 좌표 기반 주변 정류장 — 좌표는 호출자가 Geolocation 으로 확정해 넘긴다.
// 서버가 60초 격자 캐시를 들고 있어 staleTime 을 맞춰 같은 자리 재조회를
// 클라이언트에서도 차단한다. 좌표 키는 소수 4자리 스냅(≈11m) — 사소한 GPS
// 흔들림으로 쿼리 키가 갈라져 재호출되는 것을 방지.
export const useBusNearbyStations = (
  lat: number | null,
  lng: number | null,
  radius?: number,
) => {
  const enabled = lat !== null && lng !== null;
  const keyLat = lat !== null ? lat.toFixed(4) : null;
  const keyLng = lng !== null ? lng.toFixed(4) : null;
  return useQuery({
    queryKey: ['bus', 'stations', 'nearby', keyLat, keyLng, radius ?? null],
    queryFn: () => busApi.nearbyStations(lat!, lng!, radius !== undefined ? { radius } : {}),
    enabled,
    staleTime: 60_000,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 강제 새로고침(force=true). 성공 시 같은 검색 키 캐시를 응답으로 직접 교체 —
// invalidate 로 일반(force 없는) 요청을 한 번 더 보내지 않는다.
export const useBusStationsRefresh = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (q: string) => busApi.searchStations(q.trim(), { force: true }),
    onSuccess: async (data, q) => {
      const queryKey = ['bus', 'stations', 'search', q.trim()];
      // 같은 키로 진행 중인 일반 쿼리가 뒤늦게 응답해 force 결과를 롤백하는
      // 레이스 차단 — 취소를 기다린 뒤 캐시 교체.
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<BusStationSearchResultType>(queryKey, data);
    },
  });
};

// 정류소 실시간 도착정보 — 30초 폴링. refetchIntervalInBackground 기본 false
// — 탭이 비활성이면 폴링이 자동 중단돼 일일 한도를 아낀다. placeholderData 로
// 30초 갱신 사이 패널이 깜빡(로딩 상태로 리셋)이지 않게 유지.
export const useBusStationArrivals = (arsId: string | null) => {
  // arsId '0' = 가상정류장 — 서버가 400 으로 거절하므로 호출 자체를 막는다.
  const enabled = !!arsId && arsId !== '0';
  return useQuery({
    queryKey: ['bus', 'stations', 'arrivals', arsId],
    queryFn: () => busApi.stationArrivals(arsId!),
    enabled,
    refetchInterval: 30_000,
    staleTime: 0,
    gcTime: 60_000,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 노선 전체 실시간 버스 위치 — 15초 폴링. 구간(startOrd/endOrd) 조회에서 노선
// 전체(getBusPosByRtid)로 전환 — 업스트림 쿼터 비용이 같고(1콜), 도착정보
// staOrd 를 기다릴 필요가 없어 노선 선택 즉시 조회된다. 노선 보기(폴리라인)
// 위에 전 차량이 얹히는 그림이 완성형.
export const useBusPositions = (busRouteId: string | null) => {
  const enabled = !!busRouteId;
  return useQuery({
    queryKey: ['bus', 'positions', busRouteId],
    queryFn: () => busApi.busPositions(busRouteId!),
    enabled,
    refetchInterval: 15_000,
    staleTime: 0,
    gcTime: 30_000,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 노선 상세(형상+경유 정류소+기본정보) — 형상은 사실상 정적이라 서버 DB 30일
// 캐시 + 클라이언트 staleTime 24h. 재조회가 무의미하고 폴링도 없다(도착/위치와
// 달리 실시간 아님). busRouteId 선택(추적) 시에만 조회.
export const useBusRouteDetail = (busRouteId: string | null) => {
  return useQuery({
    queryKey: ['bus', 'routes', busRouteId, 'detail'],
    queryFn: () => busApi.routeDetail(busRouteId!),
    enabled: busRouteId !== null,
    staleTime: 86_400_000,
  });
};
