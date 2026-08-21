import {
  Routes,
  type LifeMapItemType,
  type LifeMapLayerType,
  type LifeMapNearbyResultType,
  type LifeMapPointsResultType,
  type LifeMapSearchResultType,
  type LifeMapStatusResultType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 일상지도(전국 CCTV·공중화장실) — friendly 공개 프록시(토큰 불필요). 로컬 DB 조회라 싸지만
// 지도를 움직일 때마다 레이어당 1콜이 나가므로 훅 쪽에서 bbox 디바운스·24h staleTime 으로 누른다.

// 필터 — purpose 는 CCTV 설치목적(@repo/utils LIFE_CCTV_PURPOSES), 불리언은 화장실 편의 조건(AND).
export interface LifeMapFilterParams {
  purpose?: readonly string[];
  open24?: boolean;
  disabled?: boolean;
  kids?: boolean;
  diaper?: boolean;
  bell?: boolean;
}
export const LIFE_MAP_BOOLEAN_FILTERS = ['open24', 'disabled', 'kids', 'diaper', 'bell'] as const;

const applyFilters = (params: URLSearchParams, f: LifeMapFilterParams | undefined): void => {
  if (!f) return;
  if (f.purpose && f.purpose.length > 0) params.set('purpose', f.purpose.join(','));
  for (const k of LIFE_MAP_BOOLEAN_FILTERS) if (f[k]) params.set(k, '1');
};

export const lifeMapApi = {
  status: () => apiFetch<LifeMapStatusResultType>(Routes.LifeMap.status),
  // 뷰포트 조회 — bbox 는 @repo/utils formatBbox 문자열, zoom 은 정수로 보낸다(서버도 내림).
  points: (layer: LifeMapLayerType, bbox: string, zoom: number, filters?: LifeMapFilterParams) => {
    const params = new URLSearchParams({ layer, bbox, zoom: String(Math.floor(zoom)) });
    applyFilters(params, filters);
    return apiFetch<LifeMapPointsResultType>(`${Routes.LifeMap.points}?${params.toString()}`);
  },
  nearby: (
    layer: LifeMapLayerType,
    lat: number,
    lng: number,
    opts: { radius?: number; limit?: number; filters?: LifeMapFilterParams } = {},
  ) => {
    const params = new URLSearchParams({ layer, lat: String(lat), lng: String(lng) });
    if (opts.radius !== undefined) params.set('radius', String(opts.radius));
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    applyFilters(params, opts.filters);
    return apiFetch<LifeMapNearbyResultType>(`${Routes.LifeMap.nearby}?${params.toString()}`);
  },
  detail: (layer: LifeMapLayerType, id: string) => apiFetch<LifeMapItemType>(Routes.LifeMap.detail(layer, id)),
  // 지역 이동 검색(주소·장소) — 2자 이상. 서버에 키가 없으면 enabled=false 빈 목록.
  search: (q: string, limit?: number) => {
    const params = new URLSearchParams({ q });
    if (limit !== undefined) params.set('limit', String(limit));
    return apiFetch<LifeMapSearchResultType>(`${Routes.LifeMap.search}?${params.toString()}`);
  },
};
