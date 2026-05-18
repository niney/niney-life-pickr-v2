// 위경도 좌표를 다루는 순수 유틸. 현재는 사용자 위치 → 주변 검색 bbox
// 계산 한 가지만 — 추가 필요해지면 같은 파일에 모은다.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

// 1° latitude ≈ 111.32 km (지구 평균). longitude 는 위도에 따라 좁아지므로
// cos(lat) 보정. 짧은 거리(≤수 km) 정사각형 근사로 충분 — 정확한 측지 거리
// 가 필요한 곳은 아니라 Haversine 등은 안 씀.
const KM_PER_LAT_DEG = 111.32;

export const computeBboxAround = (center: LatLng, radiusKm: number): Bbox => {
  const latDelta = radiusKm / KM_PER_LAT_DEG;
  const lngDelta = radiusKm / (KM_PER_LAT_DEG * Math.cos((center.lat * Math.PI) / 180));
  return {
    minLng: center.lng - lngDelta,
    minLat: center.lat - latDelta,
    maxLng: center.lng + lngDelta,
    maxLat: center.lat + latDelta,
  };
};
