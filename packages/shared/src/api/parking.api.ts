import {
  Routes,
  type EvNearbyResultType,
  type EvPointsResultType,
  type EvStationDetailType,
  type ParkingAirportsResultType,
  type ParkingLotDetailType,
  type ParkingLotNearbyResultType,
  type ParkingLotPointsResultType,
  type ParkingStatusResultType,
  type RestaurantParkingReviewsType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 주차(/parking) — friendly 공개 프록시(토큰 불필요). 주차장·충전소는 로컬 DB, 실시간(서울 시영·공항)과 충전기 상태는
// 서버 폴러가 채운 값이라 요청 경로 업스트림 호출이 없다. docs/PLAN-parking.md

// 주차장 필터 — 공영만·무료만·실시간 연계만.
export interface ParkingLotFilters {
  publicOnly?: boolean;
  freeOnly?: boolean;
  liveOnly?: boolean;
}
// 충전소 필터 — 급속·주차료 무료·지금 사용 가능·이용자 제한 없음.
export interface EvFilters {
  fastOnly?: boolean;
  freeParkingOnly?: boolean;
  availableOnly?: boolean;
  openOnly?: boolean;
}
export const PARKING_LOT_FILTER_KEYS = ['publicOnly', 'freeOnly', 'liveOnly'] as const;
export const EV_FILTER_KEYS = ['fastOnly', 'freeParkingOnly', 'availableOnly', 'openOnly'] as const;

const applyFlags = (params: URLSearchParams, f: object | undefined, keys: readonly string[]): void => {
  if (!f) return;
  for (const k of keys) if ((f as Record<string, unknown>)[k]) params.set(k, '1');
};

export const parkingApi = {
  status: () => apiFetch<ParkingStatusResultType>(Routes.Parking.status),
  // 뷰포트 조회 — bbox 는 @repo/utils formatBbox 문자열, zoom 은 정수(서버도 내림).
  lotPoints: (bbox: string, zoom: number, filters?: ParkingLotFilters) => {
    const params = new URLSearchParams({ bbox, zoom: String(Math.floor(zoom)) });
    applyFlags(params, filters, PARKING_LOT_FILTER_KEYS);
    return apiFetch<ParkingLotPointsResultType>(`${Routes.Parking.lotPoints}?${params.toString()}`);
  },
  lotNearby: (lat: number, lng: number, opts: { radius?: number; limit?: number; filters?: ParkingLotFilters } = {}) => {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    if (opts.radius !== undefined) params.set('radius', String(opts.radius));
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    applyFlags(params, opts.filters, PARKING_LOT_FILTER_KEYS);
    return apiFetch<ParkingLotNearbyResultType>(`${Routes.Parking.lotNearby}?${params.toString()}`);
  },
  lotDetail: (id: string) => apiFetch<ParkingLotDetailType>(Routes.Parking.lotDetail(id)),
  evPoints: (bbox: string, zoom: number, filters?: EvFilters) => {
    const params = new URLSearchParams({ bbox, zoom: String(Math.floor(zoom)) });
    applyFlags(params, filters, EV_FILTER_KEYS);
    return apiFetch<EvPointsResultType>(`${Routes.Parking.evPoints}?${params.toString()}`);
  },
  evNearby: (lat: number, lng: number, opts: { radius?: number; limit?: number; filters?: EvFilters } = {}) => {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    if (opts.radius !== undefined) params.set('radius', String(opts.radius));
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    applyFlags(params, opts.filters, EV_FILTER_KEYS);
    return apiFetch<EvNearbyResultType>(`${Routes.Parking.evNearby}?${params.toString()}`);
  },
  evDetail: (id: string) => apiFetch<EvStationDetailType>(Routes.Parking.evDetail(id)),
  airports: () => apiFetch<ParkingAirportsResultType>(Routes.Parking.airports),
  restaurantReviews: (placeId: string) => apiFetch<RestaurantParkingReviewsType>(Routes.Parking.restaurantReviews(placeId)),
};
