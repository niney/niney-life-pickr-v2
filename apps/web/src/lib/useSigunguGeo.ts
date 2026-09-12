import { useQuery } from '@tanstack/react-query';
import type Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat } from 'ol/proj';

// 시군구 경계(public/sigungu-geo.json — 250개, KOSIS 행정구역 코드 5자리 + 이름) — 일상지도 배경
// 레이어(범죄 통계)가 면을 칠하고 "지도 중심이 어느 시군구인가" 를 찾는 데 쓴다. 정적 파일(565KB)
// 이라 한 번만 받아 EPSG:3857 로 읽은 OL Feature 로 세션 내내 들고 있는다(무기한 캐시). 어드민
// 지역통계 지도는 같은 파일을 자기 ref 로 따로 받는다(공개 페이지와 코드 공유 없음 — 그대로 둔다).

export const SIGUNGU_GEO_URL = `${import.meta.env.BASE_URL}sigungu-geo.json`;

export interface SigunguGeo {
  features: Feature[];
}

export const useSigunguGeo = (enabled = true) =>
  useQuery<SigunguGeo>({
    queryKey: ['sigungu-geo'],
    queryFn: async () => {
      const res = await fetch(SIGUNGU_GEO_URL);
      if (!res.ok) throw new Error(`시군구 경계를 불러오지 못했습니다(HTTP ${res.status})`);
      const json = (await res.json()) as object;
      const features = new GeoJSON().readFeatures(json, { featureProjection: 'EPSG:3857' }) as Feature[];
      return { features };
    },
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });

export const sigunguCodeOf = (f: Feature): string => String(f.get('code') ?? '');
export const sigunguNameOf = (f: Feature): string => String(f.get('name') ?? '');

// 좌표(WGS84)가 든 시군구 코드 — 250개 폴리곤 선형 탐색(수 ms). 바다·국외면 null.
export const sigunguCodeAt = (features: readonly Feature[], lat: number, lng: number): string | null => {
  const c = fromLonLat([lng, lat]);
  for (const f of features) {
    const g = f.getGeometry();
    if (g && g.intersectsCoordinate(c)) return sigunguCodeOf(f);
  }
  return null;
};
