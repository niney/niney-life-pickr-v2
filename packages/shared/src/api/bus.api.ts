import { Routes, type BusStationSearchResultType } from '@repo/api-contract';
import { apiFetch } from './client.js';

// 서울시 버스 정류장 검색 — friendly 프록시 호출. 공개 라우트(토큰 불필요).
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
};
