import {
  Routes,
  type BusArrivalsResultType,
  type BusNearbyResultType,
  type BusPositionsResultType,
  type BusStationSearchResultType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 서울시 버스 정류장 검색/실시간 조회 — friendly 프록시 호출. 공개 라우트(토큰 불필요).
export const busApi = {
  // force: 캐시 무시하고 서울시 API 재호출(강제 새로고침 버튼). true 일 때만
  // 쿼리에 부착 — 기본 검색 URL 을 깨끗하게 유지.
  searchStations: (q: string, opts: { force?: boolean } = {}) => {
    const params = new URLSearchParams();
    params.set('q', q);
    if (opts.force) params.set('force', 'true');
    return apiFetch<BusStationSearchResultType>(
      `${Routes.Bus.stationSearch}?${params.toString()}`,
    );
  },
  // 좌표 기반 주변 정류장 — 반경(m)은 서버 기본 500·상한 1000. 서버가 셀
  // 단위 DB 30일 캐시를 들고 있어 지도 자동 조회도 업스트림을 거의 안 때린다.
  nearbyStations: (lat: number, lng: number, opts: { radius?: number } = {}) => {
    const params = new URLSearchParams();
    params.set('lat', String(lat));
    params.set('lng', String(lng));
    if (opts.radius !== undefined) params.set('radius', String(opts.radius));
    return apiFetch<BusNearbyResultType>(
      `${Routes.Bus.stationsNearby}?${params.toString()}`,
    );
  },
  // 정류소 실시간 도착정보 — 무캐싱 프록시. arsId '0'(가상정류장)은 서버가
  // 400 으로 거절하므로 호출 전 차단은 훅(enabled)이 담당.
  stationArrivals: (arsId: string) =>
    apiFetch<BusArrivalsResultType>(Routes.Bus.stationArrivals(arsId)),
  // 노선 구간 실시간 버스 위치 — startOrd/endOrd 는 도착정보 staOrd 기반 윈도우
  // (서버 제약: endOrd ≥ startOrd, 구간 ≤ 50).
  busPositions: (busRouteId: string, opts: { startOrd: number; endOrd: number }) => {
    const params = new URLSearchParams();
    params.set('startOrd', String(opts.startOrd));
    params.set('endOrd', String(opts.endOrd));
    return apiFetch<BusPositionsResultType>(
      `${Routes.Bus.busPositions(busRouteId)}?${params.toString()}`,
    );
  },
};
