// 위경도 좌표를 다루는 순수 유틸 — bbox·거리·좌표 반올림.

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

// 등거리 사각 근사 거리(m) — 짧은 거리(≤수 km) 임계 판정·표시용.
// 하버사인급 정밀도가 필요하면 haversineM 을 쓴다.
export const approxDistanceM = (a: LatLng, b: LatLng): number => {
  const mPerLatDeg = 111_320;
  const dLat = (a.lat - b.lat) * mPerLatDeg;
  const dLng = (a.lng - b.lng) * mPerLatDeg * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

// 두 좌표 간 측지 거리(m). Haversine — asin 인자는 부동소수점 오차로 1 을
// 넘을 수 있어 클램프.
export const haversineM = (a: LatLng, b: LatLng): number => {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

// 좌표 소수 5자리(≈1m) 반올림 — URL·브리지 직렬화 키 안정용.
export const roundCoord = (n: number): number => Math.round(n * 1e5) / 1e5;
