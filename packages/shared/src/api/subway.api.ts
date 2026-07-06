import {
  Routes,
  type SubwayArrivalsResultType,
  type SubwayLineDetailResultType,
  type SubwayNearbyResultType,
  type SubwayPositionsResultType,
  type SubwayStationSearchResultType,
} from '@repo/api-contract';
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
  // 좌표 기반 주변 역 — 로컬 마스터 조회(업스트림 0콜)라 버스의 셀 캐시·쿼터가
  // 없다. 반경(m)은 서버 기본 1500·상한 3000. dist 오름차순 30그룹 절단.
  nearbyStations: (lat: number, lng: number, opts: { radius?: number } = {}) => {
    const params = new URLSearchParams();
    params.set('lat', String(lat));
    params.set('lng', String(lng));
    if (opts.radius !== undefined) params.set('radius', String(opts.radius));
    return apiFetch<SubwayNearbyResultType>(
      `${Routes.Subway.stationsNearby}?${params.toString()}`,
    );
  },
  // 역 실시간 도착정보 — 서버 15초 마이크로 캐시를 얹은 프록시. stationId 는
  // `${lineId}:${name}` 합성(콜론·한글)이라 Routes 빌더가 encodeURIComponent 를
  // 책임진다. 서버가 그룹 lineId 집합으로 동명이역 응답을 필터해 돌려준다.
  stationArrivals: (stationId: string) =>
    apiFetch<SubwayArrivalsResultType>(Routes.Subway.stationArrivals(stationId)),
  // 호선 상세 — 노선별 역 순서(sections, 지선 분리) + 근사 폴리라인 원천. 로컬 적재
  // 데이터라 캐시·쿼터 없음. 폴리라인은 FE 가 sections[].stations 좌표로 그린다.
  lineDetail: (lineId: string) =>
    apiFetch<SubwayLineDetailResultType>(Routes.Subway.lineDetail(lineId)),
  // 노선 실시간 열차 위치 — 현재역+상태만(GPS 없음). 좌표는 서버가 마스터 조인으로
  // enrich(실패 시 null). FE 가 5차 sections 와 조합해 역간 위치를 보간한다.
  linePositions: (lineId: string) =>
    apiFetch<SubwayPositionsResultType>(Routes.Subway.linePositions(lineId)),
};
