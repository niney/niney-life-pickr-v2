import {
  Routes,
  type HousingAreaBandType,
  type HousingComplexDetailType,
  type HousingDealTypeType,
  type HousingNearbyResultType,
  type HousingPointsResultType,
  type HousingSearchResultType,
  type HousingStatusResultType,
  type HousingTradesResultType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 집값(아파트 실거래가·단지) — friendly 공개 라우트(토큰 불필요). 로컬 DB 조회라 싸지만 지도를 움직일
// 때마다 1콜이 나가므로 훅 쪽에서 bbox 디바운스·긴 staleTime 으로 누른다. 모든 조회의 축은
// dealType(매매/전세/월세) × band(전용면적 구간).

export interface HousingAxis {
  dealType: HousingDealTypeType;
  band: HousingAreaBandType;
}

const axisParams = (params: URLSearchParams, axis: HousingAxis): void => {
  params.set('dealType', axis.dealType);
  params.set('band', axis.band);
};

export const housingApi = {
  status: () => apiFetch<HousingStatusResultType>(Routes.Housing.status),
  // 뷰포트 조회 — bbox 는 @repo/utils formatBbox 문자열, zoom 은 정수로 보낸다(서버도 내림).
  points: (bbox: string, zoom: number, axis: HousingAxis) => {
    const params = new URLSearchParams({ bbox, zoom: String(Math.floor(zoom)) });
    axisParams(params, axis);
    return apiFetch<HousingPointsResultType>(`${Routes.Housing.points}?${params.toString()}`);
  },
  nearby: (lat: number, lng: number, axis: HousingAxis, opts: { radius?: number; limit?: number } = {}) => {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    if (opts.radius !== undefined) params.set('radius', String(opts.radius));
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    axisParams(params, axis);
    return apiFetch<HousingNearbyResultType>(`${Routes.Housing.nearby}?${params.toString()}`);
  },
  // 단지명 검색 — 1자 이상.
  search: (q: string, limit?: number) => {
    const params = new URLSearchParams({ q });
    if (limit !== undefined) params.set('limit', String(limit));
    return apiFetch<HousingSearchResultType>(`${Routes.Housing.search}?${params.toString()}`);
  },
  complex: (id: string) => apiFetch<HousingComplexDetailType>(Routes.Housing.complex(id)),
  trades: (id: string, axis: HousingAxis, opts: { limit?: number; offset?: number; includeCanceled?: boolean } = {}) => {
    const params = new URLSearchParams();
    axisParams(params, axis);
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.offset !== undefined) params.set('offset', String(opts.offset));
    if (opts.includeCanceled) params.set('includeCanceled', '1');
    return apiFetch<HousingTradesResultType>(`${Routes.Housing.trades(id)}?${params.toString()}`);
  },
};
