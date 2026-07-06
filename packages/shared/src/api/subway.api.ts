import { Routes, type SubwayStationSearchResultType } from '@repo/api-contract';
import { apiFetch } from './client.js';

// 수도권 전철 역 검색 — friendly 가 역사마스터를 DB 에 전량 적재해 로컬 조회한다
// (업스트림 0콜). 공개 라우트(토큰 불필요). 버스와 달리 쿼터 부담이 없어 호출부가
// 라이브 검색(타이핑 즉시)을 쓴다.
export const subwayApi = {
  // 역명 라이브 검색 — q 는 1~50자(서버가 NFC 정규화). 서버가 동일 역명 + 좌표
  // 근접 항목을 그룹(환승역)으로 묶어 반환한다.
  searchStations: (q: string) => {
    const params = new URLSearchParams();
    params.set('q', q);
    return apiFetch<SubwayStationSearchResultType>(
      `${Routes.Subway.stationSearch}?${params.toString()}`,
    );
  },
};
