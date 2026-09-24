// 위경도 좌표를 다루는 순수 유틸 — bbox·거리·좌표 반올림·UTM-K(EPSG:5179) 변환.

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

// bbox → 쿼리 문자열 값("minLng,minLat,maxLng,maxLat"). 소수점 5자리 —
// vworld bbox 1m 정도 해상도면 충분하고 URL 길이를 아낀다. 웹 지도 3곳·
// 스마트픽·앱 WebView 지도가 전부 같은 포맷을 쓰므로 여기 한 곳으로 통일.
export const formatBbox = (b: Bbox): string =>
  [b.minLng, b.minLat, b.maxLng, b.maxLat].map((n) => n.toFixed(5)).join(',');

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

// ── UTM-K(EPSG:5179) ↔ WGS84 ─────────────────────────────────────────────
// 국토지리정보원 통합좌표계(Korea 2000 / Unified CS): GRS80 타원체, 원점 38°N·127.5°E, 축척 0.9996,
// 가산 (1,000,000, 2,000,000). 서울시 침수흔적도 SHP 등이 이 좌표계다. KGD2002 는 ITRF 기반이라 WGS84 와
// 서브미터 차이뿐 → 데이텀 변환 없이 횡메르카토르(Snyder 급수) 순·역변환만 한다(한반도 범위 mm 급).
const UTMK = { a: 6_378_137, f: 1 / 298.257222101, k0: 0.9996, lat0: 38, lng0: 127.5, fe: 1_000_000, fn: 2_000_000 };
const UTMK_E2 = UTMK.f * (2 - UTMK.f);
const UTMK_EP2 = UTMK_E2 / (1 - UTMK_E2);
const toRadian = (d: number): number => (d * Math.PI) / 180;
const toDegree = (r: number): number => (r * 180) / Math.PI;
// 적도에서 위도 phi 까지 자오선 호 길이.
const meridianArc = (phi: number): number => {
  const e2 = UTMK_E2;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  return (
    UTMK.a *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi))
  );
};
const UTMK_M0 = meridianArc(toRadian(UTMK.lat0));

export interface ProjectedXY {
  x: number;
  y: number;
}

export const wgs84ToUtmk = (p: LatLng): ProjectedXY => {
  const phi = toRadian(p.lat);
  const n = UTMK.a / Math.sqrt(1 - UTMK_E2 * Math.sin(phi) ** 2);
  const t = Math.tan(phi) ** 2;
  const c = UTMK_EP2 * Math.cos(phi) ** 2;
  const a = (toRadian(p.lng) - toRadian(UTMK.lng0)) * Math.cos(phi);
  const m = meridianArc(phi);
  const x =
    UTMK.fe +
    UTMK.k0 * n * (a + ((1 - t + c) * a ** 3) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * UTMK_EP2) * a ** 5) / 120);
  const y =
    UTMK.fn +
    UTMK.k0 *
      (m -
        UTMK_M0 +
        n *
          Math.tan(phi) *
          ((a * a) / 2 + ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 + ((61 - 58 * t + t * t + 600 * c - 330 * UTMK_EP2) * a ** 6) / 720));
  return { x, y };
};

export const utmkToWgs84 = (xy: ProjectedXY): LatLng => {
  const e2 = UTMK_E2;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const m = UTMK_M0 + (xy.y - UTMK.fn) / UTMK.k0;
  const mu = m / (UTMK.a * (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const c1 = UTMK_EP2 * cos1 ** 2;
  const t1 = Math.tan(phi1) ** 2;
  const n1 = UTMK.a / Math.sqrt(1 - e2 * sin1 ** 2);
  const r1 = (UTMK.a * (1 - e2)) / (1 - e2 * sin1 ** 2) ** 1.5;
  const d = (xy.x - UTMK.fe) / (n1 * UTMK.k0);
  const lat =
    phi1 -
    ((n1 * Math.tan(phi1)) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * UTMK_EP2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * UTMK_EP2 - 3 * c1 * c1) * d ** 6) / 720);
  const lng =
    toRadian(UTMK.lng0) +
    (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * UTMK_EP2 + 24 * t1 * t1) * d ** 5) / 120) /
      cos1;
  return { lat: toDegree(lat), lng: toDegree(lng) };
};

// 좌표 소수 5자리(≈1m) 반올림 — URL·브리지 직렬화 키 안정용.
export const roundCoord = (n: number): number => Math.round(n * 1e5) / 1e5;

// 'lat,lng' 문자열 파싱 — 형식 + 한국 WGS84 범위(lat 33~39, lng 124~132 — API
// 계약과 동일)를 통과해야 유효 좌표. 딥링크·수동 편집 쓰레기 값은 null.
// (KOREA_BBOX 보다 넉넉한 범위 — 계약 검증과 같은 경계를 쓴다.)
export const parseLatLngParam = (raw: string | null): LatLng | null => {
  if (!raw) return null;
  const [latStr, lngStr] = raw.split(',');
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 33 || lat > 39 || lng < 124 || lng > 132) return null;
  return { lat, lng };
};
