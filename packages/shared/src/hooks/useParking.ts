import { useQuery } from '@tanstack/react-query';
import { EV_FILTER_KEYS, PARKING_LOT_FILTER_KEYS, parkingApi, type EvFilters, type ParkingLotFilters } from '../api/parking.api.js';

// 주차 훅 — 주차장·충전소 마스터는 재적재 때만 바뀌지만 점에 실린 실시간 단계(주차장 5분·충전기 10분 폴링)가 있어
// 뷰포트·주변은 짧게(2분) 두고 5분마다 다시 받는다. 상세·공항도 같은 주기. bbox 가 바뀌는 동안 이전 결과를
// placeholder 로 유지해 마커가 깜빡이지 않게 한다(일상지도와 같은 규율).

const LIVE_STALE_MS = 2 * 60_000;
const LIVE_REFETCH_MS = 5 * 60_000;
const STATUS_STALE_MS = 5 * 60_000;

const flagsKey = (f: object | undefined, keys: readonly string[]): string =>
  keys.map((k) => ((f as Record<string, unknown> | undefined)?.[k] ? '1' : '0')).join('');

export const useParkingStatus = () =>
  useQuery({ queryKey: ['parking', 'status'], queryFn: () => parkingApi.status(), staleTime: STATUS_STALE_MS });

export interface ParkingViewportParams<F> {
  bbox: string;
  zoom: number;
  filters?: F;
}

// 뷰포트 조회 — params null 이면 비활성(탭 꺼짐·지도 미준비). zoom 은 내림 정수로 키를 만든다.
export const useParkingLotPoints = (params: ParkingViewportParams<ParkingLotFilters> | null) => {
  const enabled = params !== null;
  const zoom = params ? Math.floor(params.zoom) : null;
  return useQuery({
    queryKey: ['parking', 'lots', 'points', params?.bbox ?? null, zoom, flagsKey(params?.filters, PARKING_LOT_FILTER_KEYS)],
    queryFn: () => parkingApi.lotPoints(params!.bbox, zoom!, params!.filters),
    enabled,
    staleTime: LIVE_STALE_MS,
    refetchInterval: enabled ? LIVE_REFETCH_MS : false,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 주변 목록 — 좌표 키는 소수 4자리(≈11m) 스냅.
export const useParkingLotNearby = (
  lat: number | null,
  lng: number | null,
  opts: { radius?: number; limit?: number; filters?: ParkingLotFilters; enabled?: boolean } = {},
) => {
  const enabled = lat !== null && lng !== null && opts.enabled !== false;
  return useQuery({
    queryKey: ['parking', 'lots', 'nearby', lat?.toFixed(4) ?? null, lng?.toFixed(4) ?? null, opts.radius ?? null, opts.limit ?? null, flagsKey(opts.filters, PARKING_LOT_FILTER_KEYS)],
    queryFn: () => parkingApi.lotNearby(lat!, lng!, { radius: opts.radius, limit: opts.limit, filters: opts.filters }),
    enabled,
    staleTime: LIVE_STALE_MS,
    refetchInterval: enabled ? LIVE_REFETCH_MS : false,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

export const useParkingLotDetail = (id: string | null) =>
  useQuery({
    queryKey: ['parking', 'lots', 'detail', id],
    queryFn: () => parkingApi.lotDetail(id!),
    enabled: id !== null,
    staleTime: LIVE_STALE_MS,
    refetchInterval: id !== null ? LIVE_REFETCH_MS : false,
  });

export const useEvPoints = (params: ParkingViewportParams<EvFilters> | null) => {
  const enabled = params !== null;
  const zoom = params ? Math.floor(params.zoom) : null;
  return useQuery({
    queryKey: ['parking', 'ev', 'points', params?.bbox ?? null, zoom, flagsKey(params?.filters, EV_FILTER_KEYS)],
    queryFn: () => parkingApi.evPoints(params!.bbox, zoom!, params!.filters),
    enabled,
    staleTime: LIVE_STALE_MS,
    refetchInterval: enabled ? LIVE_REFETCH_MS : false,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

export const useEvNearby = (
  lat: number | null,
  lng: number | null,
  opts: { radius?: number; limit?: number; filters?: EvFilters; enabled?: boolean } = {},
) => {
  const enabled = lat !== null && lng !== null && opts.enabled !== false;
  return useQuery({
    queryKey: ['parking', 'ev', 'nearby', lat?.toFixed(4) ?? null, lng?.toFixed(4) ?? null, opts.radius ?? null, opts.limit ?? null, flagsKey(opts.filters, EV_FILTER_KEYS)],
    queryFn: () => parkingApi.evNearby(lat!, lng!, { radius: opts.radius, limit: opts.limit, filters: opts.filters }),
    enabled,
    staleTime: LIVE_STALE_MS,
    refetchInterval: enabled ? LIVE_REFETCH_MS : false,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

export const useEvDetail = (id: string | null) =>
  useQuery({
    queryKey: ['parking', 'ev', 'detail', id],
    queryFn: () => parkingApi.evDetail(id!),
    enabled: id !== null,
    staleTime: LIVE_STALE_MS,
    refetchInterval: id !== null ? LIVE_REFETCH_MS : false,
  });

export const useParkingAirports = (enabled = true) =>
  useQuery({
    queryKey: ['parking', 'airports'],
    queryFn: () => parkingApi.airports(),
    enabled,
    staleTime: LIVE_STALE_MS,
    refetchInterval: enabled ? LIVE_REFETCH_MS : false,
  });

// 맛집 '가는 법' — 리뷰 주차 평가. 리뷰 분석은 크롤 때만 바뀌어 길게 둔다. 404(식당 없음)는 재시도하지 않는다.
export const useRestaurantParkingReviews = (placeId: string | null) =>
  useQuery({
    queryKey: ['parking', 'restaurant-reviews', placeId],
    queryFn: () => parkingApi.restaurantReviews(placeId!),
    enabled: placeId !== null,
    staleTime: 30 * 60_000,
    retry: false,
  });
