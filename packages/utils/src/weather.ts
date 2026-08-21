import type { LatLng } from './geo.js';

// 기상청 단기예보(VilageFcstInfoService_2.0, data.go.kr 15084084) · 중기예보
// (MidFcstInfoService, 15059468) 순수 헬퍼 — 격자 변환, 발표(base) 시각 계산, 코드표,
// 강수량 문자열 파싱, 풍향/풍속 해석, 하늘·강수 → 날씨 상태. 서버(기준 시각·정규화)와
// 웹(표시)이 같은 함수를 쓴다. 시각 계산은 전부 KST(+09:00) — 한국에는 DST 가 없어
// "UTC ms + 9시간" 뒤 getUTC* 로 읽는 단순 산술이 정확하다.

// ── 격자(LCC DFS) ────────────────────────────────────────────────────────────
// 기상청 공식 가이드의 Lambert Conformal Conic 격자(5km). 실측(2026-08-21): 서울시청
// 60,127 · 부산 98,76 · 대구 89,90 · 인천 55,124 · 광주 58,74 · 대전 67,100 · 울산 102,84
// · 수원 60,120 · 춘천 73,134 · 청주 69,107 · 전주 63,89 · 창원 91,77 — 공식표와 일치.

export interface KmaGrid {
  nx: number;
  ny: number;
}

export const KMA_GRID_NX_MAX = 149;
export const KMA_GRID_NY_MAX = 253;

const RE = 6371.00877; // 지구 반경(km)
const GRID = 5.0; // 격자 간격(km)
const SLAT1 = 30.0; // 투영 위도1(degree)
const SLAT2 = 60.0; // 투영 위도2
const OLON = 126.0; // 기준점 경도
const OLAT = 38.0; // 기준점 위도
const XO = 43; // 기준점 X 좌표(GRID)
const YO = 136; // 기준점 Y 좌표
const DEGRAD = Math.PI / 180;
const RADDEG = 180 / Math.PI;

const proj = (() => {
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  return { re, sn, sf, ro, olon };
})();

export const latLngToKmaGrid = (lat: number, lng: number): KmaGrid => {
  const { re, sn, sf, ro, olon } = proj;
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
};

// 격자 → 격자점 위·경도(역변환). 격자 셀 중심을 지도에 찍거나 "이 격자는 어디쯤" 을
// 적을 때.
export const kmaGridToLatLng = (nx: number, ny: number): LatLng => {
  const { re, sn, sf, ro, olon } = proj;
  const xn = nx - XO;
  const yn = ro - ny + YO;
  let ra = Math.sqrt(xn * xn + yn * yn);
  if (sn < 0.0) ra = -ra;
  let alat = Math.pow((re * sf) / ra, 1.0 / sn);
  alat = 2.0 * Math.atan(alat) - Math.PI * 0.5;
  let theta: number;
  if (Math.abs(xn) <= 0.0) theta = 0.0;
  else if (Math.abs(yn) <= 0.0) theta = Math.PI * 0.5 * (xn < 0.0 ? -1 : 1);
  else theta = Math.atan2(xn, yn);
  const alon = theta / sn + olon;
  return { lat: alat * RADDEG, lng: alon * RADDEG };
};

export const isValidKmaGrid = (g: KmaGrid): boolean =>
  Number.isInteger(g.nx) &&
  Number.isInteger(g.ny) &&
  g.nx >= 1 &&
  g.nx <= KMA_GRID_NX_MAX &&
  g.ny >= 1 &&
  g.ny <= KMA_GRID_NY_MAX;

// ── KST 시각 ──────────────────────────────────────────────────────────────────

const KST_OFFSET_MS = 9 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

interface KstParts {
  y: number;
  m: number; // 1~12
  d: number;
  hh: number;
  mm: number;
  // 자정 기준 0 시부터의 분.
  minuteOfDay: number;
}

const kstParts = (at: Date): KstParts => {
  const k = new Date(at.getTime() + KST_OFFSET_MS);
  return {
    y: k.getUTCFullYear(),
    m: k.getUTCMonth() + 1,
    d: k.getUTCDate(),
    hh: k.getUTCHours(),
    mm: k.getUTCMinutes(),
    minuteOfDay: k.getUTCHours() * 60 + k.getUTCMinutes(),
  };
};

const pad2 = (n: number): string => String(n).padStart(2, '0');
const ymdOf = (p: KstParts): string => `${p.y}${pad2(p.m)}${pad2(p.d)}`;

// 발표 기준 시각 — base_date(YYYYMMDD) + base_time(HHMM).
export interface KmaBase {
  date: string;
  time: string;
}

export type KmaBaseKind = 'ncst' | 'ultra' | 'vilage';

// KST 벽시계(자정 기준 분) → 그 날의 KST Date. 날짜를 n 일 옮길 수 있다.
const kstDateAt = (p: KstParts, minuteOfDay: number, dayOffset = 0): Date =>
  new Date(Date.UTC(p.y, p.m - 1, p.d) - KST_OFFSET_MS + dayOffset * DAY_MS + minuteOfDay * 60_000);

// base(KST 벽시계) → Date.
export const kmaBaseToDate = (base: KmaBase): Date => {
  const y = Number(base.date.slice(0, 4));
  const m = Number(base.date.slice(4, 6));
  const d = Number(base.date.slice(6, 8));
  const hh = Number(base.time.slice(0, 2));
  const mm = Number(base.time.slice(2, 4));
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - KST_OFFSET_MS);
};

const baseFromDate = (at: Date): KmaBase => {
  const p = kstParts(at);
  return { date: ymdOf(p), time: `${pad2(p.hh)}${pad2(p.mm)}` };
};

// ISO(+09:00) — "YYYY-MM-DDTHH:mm:00+09:00".
export const kmaBaseToIso = (base: KmaBase): string =>
  `${base.date.slice(0, 4)}-${base.date.slice(4, 6)}-${base.date.slice(6, 8)}T${base.time.slice(0, 2)}:${base.time.slice(2, 4)}:00+09:00`;

// 예보 시각(fcstDate + fcstTime) → ISO. "2400" 은 오지 않지만(실측 익일 "0000") 방어.
export const kmaFcstTimeToIso = (fcstDate: string, fcstTime: string): string | null => {
  if (!/^\d{8}$/.test(fcstDate) || !/^\d{4}$/.test(fcstTime)) return null;
  const hh = Number(fcstTime.slice(0, 2));
  if (hh >= 24) {
    const next = new Date(kmaBaseToDate({ date: fcstDate, time: '0000' }).getTime() + DAY_MS);
    return kmaBaseToIso({ ...baseFromDate(next), time: `${pad2(hh - 24)}${fcstTime.slice(2)}` });
  }
  return kmaBaseToIso({ date: fcstDate, time: fcstTime });
};

// "YYYYMMDD" → "YYYY-MM-DD".
export const kmaYmdToIsoDate = (ymd: string): string =>
  /^\d{8}$/.test(ymd) ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : ymd;

// "YYYYMMDD" 에 n 일 더한 "YYYY-MM-DD"(중기예보 D+n 날짜).
export const kmaYmdAddDays = (ymd: string, days: number): string => {
  const base = kmaBaseToDate({ date: ymd, time: '0000' });
  const p = kstParts(new Date(base.getTime() + days * DAY_MS));
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
};

// KST 오늘 "YYYY-MM-DD".
export const kmaTodayIsoDate = (now: Date = new Date()): string => {
  const p = kstParts(now);
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
};

// 초단기실황 — 매시 정각 생성, HH:10 부터 제공. 분 < 10 이면 직전 시각.
export const kmaUltraNcstBase = (now: Date): KmaBase => {
  const p = kstParts(now);
  const hourStart = kstDateAt(p, p.hh * 60);
  return baseFromDate(p.mm >= 10 ? hourStart : new Date(hourStart.getTime() - HOUR_MS));
};

// 초단기예보 — 매시 30분 생성, HH:45 부터 제공. 분 < 45 면 직전 시각의 30분.
export const kmaUltraFcstBase = (now: Date): KmaBase => {
  const p = kstParts(now);
  const thisHalf = kstDateAt(p, p.hh * 60 + 30);
  return baseFromDate(p.mm >= 45 ? thisHalf : new Date(thisHalf.getTime() - HOUR_MS));
};

// 단기예보 — 하루 8회(02·05·08·11·14·17·20·23시) 생성, 각 +10분부터 제공.
export const KMA_VILAGE_BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23] as const;

export const kmaVilageBase = (now: Date): KmaBase => {
  const p = kstParts(now);
  let hour: number | null = null;
  for (const h of KMA_VILAGE_BASE_HOURS) if (p.minuteOfDay >= h * 60 + 10) hour = h;
  if (hour === null) return baseFromDate(kstDateAt(p, 23 * 60, -1));
  return baseFromDate(kstDateAt(p, hour * 60));
};

// 한 슬롯 이전 base — 새 슬롯 데이터가 아직 없을 때(NO_DATA) 폴백용.
export const kmaPrevBase = (kind: KmaBaseKind, base: KmaBase): KmaBase => {
  const at = kmaBaseToDate(base);
  if (kind !== 'vilage') return baseFromDate(new Date(at.getTime() - HOUR_MS));
  return baseFromDate(new Date(at.getTime() - 3 * HOUR_MS));
};

// 다음 슬롯이 제공되기 시작하는 시각(KST) — 서버 캐시 TTL 계산용.
export const kmaNextBaseAvailableAt = (kind: KmaBaseKind, now: Date): Date => {
  const p = kstParts(now);
  if (kind === 'ncst') {
    const thisAvail = kstDateAt(p, p.hh * 60 + 10);
    return now.getTime() < thisAvail.getTime() ? thisAvail : new Date(thisAvail.getTime() + HOUR_MS);
  }
  if (kind === 'ultra') {
    const thisAvail = kstDateAt(p, p.hh * 60 + 45);
    return now.getTime() < thisAvail.getTime() ? thisAvail : new Date(thisAvail.getTime() + HOUR_MS);
  }
  for (const h of KMA_VILAGE_BASE_HOURS) {
    if (p.minuteOfDay < h * 60 + 10) return kstDateAt(p, h * 60 + 10);
  }
  return kstDateAt(p, 2 * 60 + 10, 1);
};

// 중기예보 발표 시각 tmFc(YYYYMMDDHHmm) — 하루 2회(06:00·18:00). 최근 발표분.
export const kmaMidTmFc = (now: Date): string => {
  const p = kstParts(now);
  if (p.minuteOfDay >= 18 * 60) return `${ymdOf(p)}1800`;
  if (p.minuteOfDay >= 6 * 60) return `${ymdOf(p)}0600`;
  return `${ymdOf(kstParts(kstDateAt(p, 0, -1)))}1800`;
};

export const kmaPrevMidTmFc = (tmFc: string): string => {
  const date = tmFc.slice(0, 8);
  const time = tmFc.slice(8, 12);
  if (time === '1800') return `${date}0600`;
  const prev = kstParts(new Date(kmaBaseToDate({ date, time: '0000' }).getTime() - DAY_MS));
  return `${ymdOf(prev)}1800`;
};

export const kmaTmFcToIso = (tmFc: string): string | null =>
  /^\d{12}$/.test(tmFc) ? kmaBaseToIso({ date: tmFc.slice(0, 8), time: tmFc.slice(8, 12) }) : null;

// 다음 중기 발표 시각(06:00/18:00) — 캐시 TTL 용.
export const kmaNextMidTmFcAt = (now: Date): Date => {
  const p = kstParts(now);
  if (p.minuteOfDay < 6 * 60) return kstDateAt(p, 6 * 60);
  if (p.minuteOfDay < 18 * 60) return kstDateAt(p, 18 * 60);
  return kstDateAt(p, 6 * 60, 1);
};

// ── 코드표 ───────────────────────────────────────────────────────────────────

// 하늘상태(SKY) — 1 맑음 / 3 구름많음 / 4 흐림 (2 는 쓰지 않는다).
export const KMA_SKY_LABEL: Record<number, string> = { 1: '맑음', 3: '구름많음', 4: '흐림' };

// 강수형태(PTY) — 단기: 0 없음 1 비 2 비/눈 3 눈 4 소나기. 초단기: 5 빗방울 6 빗방울눈날림 7 눈날림 추가.
export const KMA_PTY_LABEL: Record<number, string> = {
  0: '없음',
  1: '비',
  2: '비/눈',
  3: '눈',
  4: '소나기',
  5: '빗방울',
  6: '빗방울·눈날림',
  7: '눈날림',
};

export const kmaSkyLabel = (sky: number | null | undefined): string =>
  sky === null || sky === undefined ? '-' : (KMA_SKY_LABEL[sky] ?? `하늘 ${sky}`);
export const kmaPtyLabel = (pty: number | null | undefined): string =>
  pty === null || pty === undefined ? '-' : (KMA_PTY_LABEL[pty] ?? `강수 ${pty}`);

// 예보 항목(category) 표 — 어느 오퍼레이션에서 오는지와 단위. 범례·표 머리에 쓴다.
export type KmaCategoryKind = 'ncst' | 'ultra' | 'vilage';
export interface KmaCategoryMeta {
  code: string;
  label: string;
  unit: string;
  kinds: KmaCategoryKind[];
}
export const KMA_CATEGORIES: readonly KmaCategoryMeta[] = [
  { code: 'T1H', label: '기온', unit: '℃', kinds: ['ncst', 'ultra'] },
  { code: 'TMP', label: '1시간 기온', unit: '℃', kinds: ['vilage'] },
  { code: 'TMN', label: '일 최저기온', unit: '℃', kinds: ['vilage'] },
  { code: 'TMX', label: '일 최고기온', unit: '℃', kinds: ['vilage'] },
  { code: 'RN1', label: '1시간 강수량', unit: 'mm(실황) / 범주(예보)', kinds: ['ncst', 'ultra'] },
  { code: 'PCP', label: '1시간 강수량', unit: '범주(mm)', kinds: ['vilage'] },
  { code: 'SNO', label: '1시간 신적설', unit: '범주(cm)', kinds: ['vilage'] },
  { code: 'POP', label: '강수확률', unit: '%', kinds: ['ultra', 'vilage'] },
  { code: 'PTY', label: '강수형태', unit: '코드', kinds: ['ncst', 'ultra', 'vilage'] },
  { code: 'SKY', label: '하늘상태', unit: '코드', kinds: ['ultra', 'vilage'] },
  { code: 'REH', label: '습도', unit: '%', kinds: ['ncst', 'ultra', 'vilage'] },
  { code: 'WSD', label: '풍속', unit: 'm/s', kinds: ['ncst', 'ultra', 'vilage'] },
  { code: 'VEC', label: '풍향', unit: 'deg', kinds: ['ncst', 'ultra', 'vilage'] },
  { code: 'UUU', label: '동서바람성분', unit: 'm/s', kinds: ['ncst', 'ultra', 'vilage'] },
  { code: 'VVV', label: '남북바람성분', unit: 'm/s', kinds: ['ncst', 'ultra', 'vilage'] },
  { code: 'LGT', label: '낙뢰', unit: 'kA', kinds: ['ultra'] },
  { code: 'WAV', label: '파고', unit: 'm', kinds: ['vilage'] },
];

// ── 강수량/적설 문자열 ────────────────────────────────────────────────────────
// 예보 PCP/RN1/SNO 는 범주 문자열로 온다(실측): "강수없음"/"적설없음", "1mm 미만",
// "1.0mm", "30.0~50.0mm", "50.0mm 이상", 드물게 "0". 표시는 원문, 수치(차트·정렬)는
// 보수적으로 — 미만은 0.5, 범위는 하한, 이상은 그 값.
export interface KmaPrecipAmount {
  text: string; // 표시용 원문(결측은 '-')
  // 대표 수치(mm/cm). 없음 0, 결측 null.
  value: number | null;
  none: boolean; // 강수/적설 없음
}

export const parseKmaPrecipText = (raw: string | null | undefined): KmaPrecipAmount => {
  if (raw === null || raw === undefined) return { text: '-', value: null, none: false };
  const text = raw.trim();
  if (text === '' || text === '-') return { text: '-', value: null, none: false };
  if (text === '0' || text === '0.0' || text.includes('없음')) return { text, value: 0, none: true };
  const under = /^([\d.]+)\s*(?:mm|cm)?\s*미만$/.exec(text);
  if (under) return { text, value: Number(under[1]) / 2, none: false };
  const range = /^([\d.]+)\s*~\s*([\d.]+)/.exec(text);
  if (range) return { text, value: Number(range[1]), none: false };
  const over = /^([\d.]+)\s*(?:mm|cm)?\s*이상$/.exec(text);
  if (over) return { text, value: Number(over[1]), none: false };
  const num = /^([\d.]+)/.exec(text);
  if (num && Number.isFinite(Number(num[1]))) return { text, value: Number(num[1]), none: false };
  return { text, value: null, none: false };
};

// ── 바람 ─────────────────────────────────────────────────────────────────────
// 풍향(deg) → 16방위. 기상청 가이드: (VEC + 22.5 × 0.5) / 22.5 의 정수부.
const WIND_DIRS_16 = [
  '북',
  '북북동',
  '북동',
  '동북동',
  '동',
  '동남동',
  '남동',
  '남남동',
  '남',
  '남남서',
  '남서',
  '서남서',
  '서',
  '서북서',
  '북서',
  '북북서',
  '북',
] as const;

export const kmaWindDirection16 = (vec: number | null | undefined): string => {
  if (vec === null || vec === undefined || !Number.isFinite(vec)) return '-';
  const idx = Math.floor(((((vec % 360) + 360) % 360) + 22.5 * 0.5) / 22.5);
  return WIND_DIRS_16[Math.min(16, Math.max(0, idx))] ?? '-';
};

// 풍속 강도 — 기상청 가이드 구간: 0~4 약 / 4~9 약간 강 / 9~14 강 / 14~ 매우 강.
export const kmaWindStrength = (wsd: number | null | undefined): string => {
  if (wsd === null || wsd === undefined || !Number.isFinite(wsd)) return '-';
  if (wsd < 4) return '약함';
  if (wsd < 9) return '약간 강함';
  if (wsd < 14) return '강함';
  return '매우 강함';
};

// ── 날씨 상태(아이콘 키) ──────────────────────────────────────────────────────
// 하늘상태+강수형태(단기/초단기) 또는 중기 날씨 문구(wf: "맑음", "구름많고 비", "흐리고
// 눈" 등)를 공통 키로 접는다 — 웹이 아이콘/라벨을 고르는 단일 축.
export type KmaConditionKey =
  | 'clear'
  | 'partly'
  | 'cloudy'
  | 'rain'
  | 'sleet'
  | 'snow'
  | 'shower'
  | 'drizzle'
  | 'flurry'
  | 'unknown';

export const KMA_CONDITION_LABEL: Record<KmaConditionKey, string> = {
  clear: '맑음',
  partly: '구름많음',
  cloudy: '흐림',
  rain: '비',
  sleet: '비/눈',
  snow: '눈',
  shower: '소나기',
  drizzle: '빗방울',
  flurry: '눈날림',
  unknown: '-',
};

export const kmaCondition = (sky: number | null | undefined, pty: number | null | undefined): KmaConditionKey => {
  switch (pty) {
    case 1:
      return 'rain';
    case 2:
      return 'sleet';
    case 3:
      return 'snow';
    case 4:
      return 'shower';
    case 5:
      return 'drizzle';
    case 6:
      return 'sleet';
    case 7:
      return 'flurry';
    default:
      break;
  }
  if (sky === 1) return 'clear';
  if (sky === 3) return 'partly';
  if (sky === 4) return 'cloudy';
  return 'unknown';
};

// 중기 날씨 문구 → 상태 키. "구름많고 비", "흐리고 비/눈", "구름많고 소나기", "흐리고 눈" 등.
export const kmaConditionFromText = (wf: string | null | undefined): KmaConditionKey => {
  if (!wf) return 'unknown';
  const t = wf.replace(/\s+/g, '');
  if (t.includes('소나기')) return 'shower';
  if (t.includes('비/눈') || t.includes('눈/비') || (t.includes('비') && t.includes('눈'))) return 'sleet';
  if (t.includes('눈')) return 'snow';
  if (t.includes('비')) return 'rain';
  if (t.includes('흐림') || t.includes('흐리')) return 'cloudy';
  if (t.includes('구름')) return 'partly';
  if (t.includes('맑')) return 'clear';
  return 'unknown';
};

// 강수 가능성이 있는 상태인가(강수 아이콘/강조용).
export const kmaConditionIsWet = (key: KmaConditionKey): boolean =>
  key === 'rain' || key === 'sleet' || key === 'snow' || key === 'shower' || key === 'drizzle' || key === 'flurry';

// 중기예보 dayIndex(4~10) 라벨 — "D+4" 대신 요일·날짜는 화면이 붙인다. 여기선 검증만.
export const KMA_MID_DAYS = [4, 5, 6, 7, 8, 9, 10] as const;
export type KmaMidDay = (typeof KMA_MID_DAYS)[number];

// 기온 표시 — 소수 1자리 값이 오면 그대로, 정수면 정수. 결측 '-'.
export const formatKmaTemp = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '-' : String(Number.isInteger(v) ? v : Number(v.toFixed(1)));

// KST 시각 문자열("YYYY-MM-DDTHH:mm:00+09:00") → "H시"/"M/D H시" 라벨.
export const formatKmaHourLabel = (iso: string, todayIsoDate: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const hour = Number(m[4]);
  return date === todayIsoDate ? `${hour}시` : `${Number(m[2])}/${Number(m[3])} ${hour}시`;
};

// 낮/밤 근사 — 일출·일몰 API 없이 06~18시를 낮으로 본다(아이콘 해/달 선택용).
export const kmaIsDaytimeHour = (hour: number): boolean => hour >= 6 && hour < 19;
