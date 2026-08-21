import { useQuery } from '@tanstack/react-query';
import type { LifeMapLayerType } from '@repo/api-contract';
import { LIFE_MAP_BOOLEAN_FILTERS, lifeMapApi, type LifeMapFilterParams } from '../api/life-map.api.js';

// 일상지도 훅 — 데이터는 CSV 재적재 때만 바뀌는 정적 마스터라 24시간 staleTime(지하철 마스터와
// 같은 사다리). bbox 가 바뀌는 동안 이전 결과를 placeholder 로 유지해 마커가 깜빡이지 않게 한다.

const STATIC_STALE_MS = 24 * 60 * 60_000;

// 필터 → 쿼리 키 조각(배열·객체 identity 에 흔들리지 않게 문자열로).
export const lifeMapFiltersKey = (f: LifeMapFilterParams | undefined): string =>
  `${(f?.purpose ?? []).join(',')}|${LIFE_MAP_BOOLEAN_FILTERS.map((k) => (f?.[k] ? '1' : '0')).join('')}`;

export const useLifeMapStatus = () =>
  useQuery({
    queryKey: ['life-map', 'status'],
    queryFn: () => lifeMapApi.status(),
    staleTime: STATIC_STALE_MS,
  });

export interface LifeMapViewportParams {
  layer: LifeMapLayerType;
  bbox: string;
  zoom: number;
  filters?: LifeMapFilterParams;
}

// 뷰포트 조회 — params null 이면 비활성(레이어 꺼짐·지도 미준비). zoom 은 내림 정수로 키를 만든다.
export const useLifeMapPoints = (params: LifeMapViewportParams | null) => {
  const enabled = params !== null;
  const zoom = params ? Math.floor(params.zoom) : null;
  return useQuery({
    queryKey: ['life-map', 'points', params?.layer ?? null, params?.bbox ?? null, zoom, lifeMapFiltersKey(params?.filters)],
    queryFn: () => lifeMapApi.points(params!.layer, params!.bbox, zoom!, params!.filters),
    enabled,
    staleTime: STATIC_STALE_MS,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 주변 목록 — 좌표 키는 소수 4자리(≈11m) 스냅(지하철 주변과 같은 규율).
export const useLifeMapNearby = (
  layer: LifeMapLayerType,
  lat: number | null,
  lng: number | null,
  opts: { radius?: number; limit?: number; filters?: LifeMapFilterParams; enabled?: boolean } = {},
) => {
  const enabled = lat !== null && lng !== null && opts.enabled !== false;
  const keyLat = lat !== null ? lat.toFixed(4) : null;
  const keyLng = lng !== null ? lng.toFixed(4) : null;
  return useQuery({
    queryKey: ['life-map', 'nearby', layer, keyLat, keyLng, opts.radius ?? null, opts.limit ?? null, lifeMapFiltersKey(opts.filters)],
    queryFn: () => lifeMapApi.nearby(layer, lat!, lng!, { radius: opts.radius, limit: opts.limit, filters: opts.filters }),
    enabled,
    staleTime: STATIC_STALE_MS,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 지역 이동 검색(주소·장소) — 2자 미만이면 비활성. 서버가 10분 캐시를 들고 있어 같은 검색어
// 재조회를 클라이언트에서도 10분 막는다. 디바운스는 호출부(웹)가 입력값에 건다.
const SEARCH_STALE_MS = 10 * 60_000;
export const useLifeMapSearch = (q: string, limit?: number) => {
  const trimmed = q.trim().replace(/\s+/g, ' ');
  const enabled = trimmed.length >= 2 && trimmed.length <= 60;
  return useQuery({
    queryKey: ['life-map', 'search', trimmed, limit ?? null],
    queryFn: () => lifeMapApi.search(trimmed, limit),
    enabled,
    staleTime: SEARCH_STALE_MS,
    retry: false,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

export const useLifeMapDetail = (layer: LifeMapLayerType | null, id: string | null) => {
  const enabled = layer !== null && id !== null;
  return useQuery({
    queryKey: ['life-map', 'detail', layer, id],
    queryFn: () => lifeMapApi.detail(layer!, id!),
    enabled,
    staleTime: STATIC_STALE_MS,
  });
};
