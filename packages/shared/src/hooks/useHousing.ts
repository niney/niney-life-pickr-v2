import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { housingApi, type HousingAxis } from '../api/housing.api.js';

// 집값 훅 — 데이터는 월 단위 적재(실거래 신고 지연 반영을 위해 최근 몇 달을 재수집)라 6시간
// staleTime. bbox 가 바뀌는 동안 이전 결과를 placeholder 로 유지해 배지가 깜빡이지 않게 한다.

const STALE_MS = 6 * 60 * 60_000;
const SEARCH_STALE_MS = 10 * 60_000;

export const housingAxisKey = (axis: HousingAxis): string => `${axis.dealType}|${axis.band}`;

export const useHousingStatus = () =>
  useQuery({
    queryKey: ['housing', 'status'],
    queryFn: () => housingApi.status(),
    staleTime: STALE_MS,
  });

export interface HousingViewportParams {
  bbox: string;
  zoom: number;
  axis: HousingAxis;
}

// 뷰포트 조회 — params null 이면 비활성(지도 미준비). zoom 은 내림 정수로 키를 만든다.
export const useHousingPoints = (params: HousingViewportParams | null) => {
  const enabled = params !== null;
  const zoom = params ? Math.floor(params.zoom) : null;
  return useQuery({
    queryKey: ['housing', 'points', params?.bbox ?? null, zoom, params ? housingAxisKey(params.axis) : null],
    queryFn: () => housingApi.points(params!.bbox, zoom!, params!.axis),
    enabled,
    staleTime: STALE_MS,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 주변 단지 — 좌표 키는 소수 4자리(≈11m) 스냅(일상지도와 같은 규율).
export const useHousingNearby = (
  lat: number | null,
  lng: number | null,
  axis: HousingAxis,
  opts: { radius?: number; limit?: number; enabled?: boolean } = {},
) => {
  const enabled = lat !== null && lng !== null && opts.enabled !== false;
  const keyLat = lat !== null ? lat.toFixed(4) : null;
  const keyLng = lng !== null ? lng.toFixed(4) : null;
  return useQuery({
    queryKey: ['housing', 'nearby', keyLat, keyLng, opts.radius ?? null, opts.limit ?? null, housingAxisKey(axis)],
    queryFn: () => housingApi.nearby(lat!, lng!, axis, { radius: opts.radius, limit: opts.limit }),
    enabled,
    staleTime: STALE_MS,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

// 단지명 검색 — 1자 미만이면 비활성. 디바운스는 호출부(웹)가 입력값에 건다.
export const useHousingSearch = (q: string, limit?: number) => {
  const trimmed = q.trim().replace(/\s+/g, ' ');
  const enabled = trimmed.length >= 1 && trimmed.length <= 40;
  return useQuery({
    queryKey: ['housing', 'search', trimmed, limit ?? null],
    queryFn: () => housingApi.search(trimmed, limit),
    enabled,
    staleTime: SEARCH_STALE_MS,
    retry: false,
    placeholderData: enabled ? (prev) => prev : undefined,
  });
};

export const useHousingComplex = (id: string | null) =>
  useQuery({
    queryKey: ['housing', 'complex', id],
    queryFn: () => housingApi.complex(id!),
    enabled: id !== null,
    staleTime: STALE_MS,
  });

// 거래 목록 — offset 페이징을 무한 스크롤 형태로("더 보기"). 페이지 크기 기본 30.
export const useHousingTrades = (
  id: string | null,
  axis: HousingAxis,
  opts: { pageSize?: number; includeCanceled?: boolean } = {},
) => {
  const pageSize = opts.pageSize ?? 30;
  return useInfiniteQuery({
    queryKey: ['housing', 'trades', id, housingAxisKey(axis), pageSize, opts.includeCanceled ? 1 : 0],
    queryFn: ({ pageParam }) =>
      housingApi.trades(id!, axis, { limit: pageSize, offset: pageParam, includeCanceled: opts.includeCanceled }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((acc, p) => acc + p.items.length, 0);
      return loaded < last.total && last.items.length > 0 ? loaded : undefined;
    },
    enabled: id !== null,
    staleTime: STALE_MS,
  });
};
