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

// vworld 타일은 한국 영토만 커버 — 시뮬레이터/실 사용자 좌표가 한국 밖이면
// 타일 전부 404 가 떨어진다. bbox 는 본토·제주·울릉 포함 넉넉히 잡음.
// (북쪽 38.7 은 휴전선 이남 — 북한은 어차피 데이터 없음.)
const KOREA_BBOX: Bbox = {
  minLng: 124.5,
  minLat: 33.0,
  maxLng: 131.9,
  maxLat: 38.7,
};

export const isInKorea = (coords: LatLng): boolean =>
  coords.lat >= KOREA_BBOX.minLat &&
  coords.lat <= KOREA_BBOX.maxLat &&
  coords.lng >= KOREA_BBOX.minLng &&
  coords.lng <= KOREA_BBOX.maxLng;
