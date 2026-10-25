// 일출·일몰 — NOAA Solar Calculator 식(Meeus 근사, 오차 1~2분). 천문연 출몰시각 API 는 좌표를 줘도 미리 정한 지점 값을
// 줘서(docs/PLAN-hiking.md) 좌표로 직접 계산한다. 날짜는 KST 달력 날짜, 결과는 시각(Date). 대기 굴절·해 반지름은 표준값
// (천정거리 90.833°)이고 고도에 따른 지평 강하는 넣지 않는다 — 산에서도 내려와야 하는 곳은 들머리 높이다.
// 해가 지지 않거나 뜨지 않는 날(극지)은 null.

const DAY_MS = 86_400_000;
const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

// 해 뜸·짐 · 시민박명(해가 지평선 아래 6°, 등 없이 걸을 수 있는 밝기의 끝).
const ZENITH_SUN = 90.833;
const ZENITH_CIVIL = 96;

interface SolarParams {
  // 적위(라디안)·균시차(분).
  decl: number;
  eqTimeMin: number;
}

// UTC 시각의 해 적위·균시차.
const solarParams = (ms: number): SolarParams => {
  const jd = ms / DAY_MS + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const l0 = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(rad(m)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(rad(2 * m)) * (0.019993 - 0.000101 * t) +
    Math.sin(rad(3 * m)) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda)));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const eqTime =
    y * Math.sin(2 * rad(l0)) -
    2 * e * Math.sin(rad(m)) +
    4 * e * y * Math.sin(rad(m)) * Math.cos(2 * rad(l0)) -
    0.5 * y * y * Math.sin(4 * rad(l0)) -
    1.25 * e * e * Math.sin(2 * rad(m));
  return { decl, eqTimeMin: 4 * deg(eqTime) };
};

// 시간각(도) — 해가 그 천정거리에 오지 않으면 null.
const hourAngleDeg = (lat: number, decl: number, zenith: number): number | null => {
  const cosH = Math.cos(rad(zenith)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl);
  return cosH < -1 || cosH > 1 ? null : deg(Math.acos(cosH));
};

// "YYYY-MM-DD"(KST 달력 날짜) 의 UTC 자정 ms. 한국 경도에선 남중이 같은 UTC 날짜 03시 반쯤이라 뜸·짐을 그 자정에서 분으로 센다.
const utcMidnight = (ymd: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

// 사건 하나 — 남중 기준 첫 근사 뒤, 그 시각의 적위·균시차로 한 번 더 고친다.
const eventAt = (midnight: number, lat: number, lng: number, zenith: number, sign: -1 | 1): Date | null => {
  let p = solarParams(midnight + (720 - 4 * lng) * 60_000);
  let minutes: number | null = null;
  for (let i = 0; i < 2; i++) {
    const ha = hourAngleDeg(lat, p.decl, zenith);
    if (ha === null) return null;
    minutes = 720 - 4 * (lng - sign * ha) - p.eqTimeMin;
    p = solarParams(midnight + minutes * 60_000);
  }
  return minutes === null ? null : new Date(midnight + Math.round(minutes * 60_000));
};

export interface SunTimes {
  // 시민박명 시작 · 일출 · 일몰 · 시민박명 끝.
  dawn: Date | null;
  sunrise: Date | null;
  sunset: Date | null;
  dusk: Date | null;
}

export const sunTimes = (ymd: string, lat: number, lng: number): SunTimes => {
  const midnight = utcMidnight(ymd);
  if (midnight === null) return { dawn: null, sunrise: null, sunset: null, dusk: null };
  return {
    dawn: eventAt(midnight, lat, lng, ZENITH_CIVIL, -1),
    sunrise: eventAt(midnight, lat, lng, ZENITH_SUN, -1),
    sunset: eventAt(midnight, lat, lng, ZENITH_SUN, 1),
    dusk: eventAt(midnight, lat, lng, ZENITH_CIVIL, 1),
  };
};
