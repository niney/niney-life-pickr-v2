import { useQuery } from '@tanstack/react-query';
import { subwayApi } from '../api/subway.api.js';

// 역 라이브 검색 — 역사마스터를 로컬 DB 에 적재해 조회하므로 쿼터 부담이 0 이고,
// 마스터가 사실상 불변이라 staleTime 24h(같은 역명 재검색 시 재호출 없음).
// placeholderData 로 타이핑 중 이전 결과를 유지해 잔상 없이 갱신한다. 타이핑
// 지연(디바운스)은 호출부(웹)가 useDeferredValue 로 처리 — 여기엔 타이머/effect 없음.
export const useSubwayStationSearch = (q: string) => {
  const trimmed = q.trim();
  // 서버 q 제약(1~50자) FE 미러 — 범위 밖이면 호출 자체를 막는다(빈 검색어 포함).
  const enabled = trimmed.length >= 1 && trimmed.length <= 50;
  return useQuery({
    queryKey: ['subway', 'stations', 'search', trimmed],
    queryFn: () => subwayApi.searchStations(trimmed),
    enabled,
    staleTime: 86_400_000,
    // v5 는 disabled 쿼리에도 placeholderData 를 채운다 — 빈 검색어로 돌아왔을 때
    // 이전 결과가 잔상으로 남지 않게 enabled 일 때만 유지.
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 좌표 기반 주변 역 — 좌표는 호출자가 Geolocation(또는 지도 재조회)으로 확정해
// 넘긴다. 로컬 마스터 조회라 staleTime 60s 로 같은 자리 재조회를 클라이언트에서도
// 차단한다. 좌표 키는 소수 4자리 스냅(≈11m) — 사소한 GPS 흔들림으로 쿼리 키가
// 갈라져 재호출되는 것을 방지(useBusNearbyStations 미러). 반경 기본 1500m.
export const useSubwayNearbyStations = (
  lat: number | null,
  lng: number | null,
  radius = 1500,
) => {
  const enabled = lat !== null && lng !== null;
  const keyLat = lat !== null ? lat.toFixed(4) : null;
  const keyLng = lng !== null ? lng.toFixed(4) : null;
  return useQuery({
    queryKey: ['subway', 'stations', 'nearby', keyLat, keyLng, radius],
    queryFn: () => subwayApi.nearbyStations(lat!, lng!, { radius }),
    enabled,
    staleTime: 60_000,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 역 실시간 도착정보 — 30초 폴링. refetchIntervalInBackground 기본 false 라 탭이
// 비활성이면 폴링이 자동 중단돼 업스트림 쿼터를 아낀다(버스 도착 패턴). placeholderData
// 로 30초 갱신 사이 패널이 깜빡(로딩 리셋)이지 않게 유지한다. stationId 는 검색 결과
// 그룹의 id(`${lineId}:${name}`) — 선택(패널 열림) 시에만 조회.
export const useSubwayStationArrivals = (stationId: string | null) => {
  const enabled = !!stationId;
  return useQuery({
    queryKey: ['subway', 'arrivals', stationId],
    queryFn: () => subwayApi.stationArrivals(stationId!),
    enabled,
    refetchInterval: 30_000,
    staleTime: 0,
    gcTime: 60_000,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 호선 상세(역 순서 + 지선 sections) — 적재 데이터라 사실상 정적. staleTime 24h,
// 폴링 없음. lineId 선택('노선 보기') 시에만 조회.
export const useSubwayLineDetail = (lineId: string | null) => {
  return useQuery({
    queryKey: ['subway', 'lines', lineId, 'detail'],
    queryFn: () => subwayApi.lineDetail(lineId!),
    enabled: lineId !== null,
    staleTime: 86_400_000,
  });
};
