// 사주 달력 — 율리우스일, 24절기 조회, 한국 표준시·서머타임 역사, 진태양시(경도) 보정, 음력↔양력.
//
// 절기·음력은 생성물 표(sajuAstroTable.ts — build-saju-tables.ts 가 astronomy-engine 또는 KASI 로 만든다)를
// 디코딩해 쓴다. 런타임 천문 계산은 없다. 지원 범위는 표가 정한다(절기 1899~2051, 음력 1900~2050).
//
// 시각 처리 원칙:
//  - 절기 비교는 UTC 순간(1900-01-01T00:00Z 기준 분)으로 한다. 표도 UTC 분이다.
//  - 일주·시주는 "보정된 지방시" 로 결정한다. 기본은 서울 평균태양시(동경 127.5° = UTC+8:30) —
//    현행 KST(UTC+9) 기준 −30분, 서머타임 중엔 −90분. 국내 만세력 앱이 "진태양시 적용" 이라 부르는 보정과 같고
//    균시차(±16분)는 넣지 않는다. 옵션을 끄면 당시 벽시계 그대로.
//  - 입력 벽시계 → UTC 변환은 당시 표준시(1908~1911·1954~1961 UTC+8:30, 그 외 UTC+9)와 서머타임
//    (1948~1951·1955~1960·1987~1988, IANA tzdata Asia/Seoul 규칙)을 반영한다.

import {
  SAJU_LUNAR_ENCODED,
  SAJU_LUNAR_YEARS,
  SAJU_SOLAR_TERMS_ENCODED,
  SAJU_TABLE_SOURCE,
  SAJU_TERM_YEARS,
} from './sajuAstroTable.js';

export { SAJU_LUNAR_YEARS, SAJU_TABLE_SOURCE, SAJU_TERM_YEARS };

// ── 날짜 기본 ────────────────────────────────────────────────────────────────

/** 1900-01-01 의 율리우스일. 일수(dayNumber)는 이 날을 0 으로 센다. */
export const SAJU_EPOCH_JDN = 2415021;
export const MINUTES_PER_DAY = 1440;
export const KST_OFFSET_MINUTES = 9 * 60;
/** 서울 평균태양시(동경 127.5°) 의 UTC 오프셋 — 진태양시(경도) 보정의 기준. */
export const SEOUL_MEAN_SOLAR_OFFSET_MINUTES = 8 * 60 + 30;

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

export interface CivilDateTime extends CivilDate {
  hour: number;
  minute: number;
}

export const sajuJdn = (year: number, month: number, day: number): number => {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045
  );
};

/** 1900-01-01 = 0 인 일수. */
export const sajuDayNumber = (year: number, month: number, day: number): number =>
  sajuJdn(year, month, day) - SAJU_EPOCH_JDN;

export const sajuDateFromDayNumber = (n: number): CivilDate => {
  const j = n + SAJU_EPOCH_JDN;
  const a = j + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
};

export const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
export const daysInMonth = (year: number, month: number): number =>
  ([31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] as number);
export const isValidCivilDate = (year: number, month: number, day: number): boolean =>
  Number.isInteger(year) &&
  Number.isInteger(month) &&
  Number.isInteger(day) &&
  month >= 1 &&
  month <= 12 &&
  day >= 1 &&
  day <= daysInMonth(year, month);

/** 0=일 … 6=토. */
export const weekdayOfDayNumber = (n: number): number => (((n + 1) % 7) + 7) % 7; // 1900-01-01 은 월요일

export const formatCivilDate = (d: CivilDate): string =>
  `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

/** 분 단위 UTC 순간(1900-01-01T00:00Z 기준) → 주어진 오프셋의 지방 시각. */
export const civilFromMinutes = (minutes: number, offsetMinutes: number): CivilDateTime => {
  const local = minutes + offsetMinutes;
  const dayNo = Math.floor(local / MINUTES_PER_DAY);
  const rem = local - dayNo * MINUTES_PER_DAY;
  const date = sajuDateFromDayNumber(dayNo);
  return { ...date, hour: Math.floor(rem / 60), minute: rem % 60 };
};

/** 지방 시각 + 오프셋 → UTC 분. */
export const minutesFromCivil = (dt: CivilDateTime, offsetMinutes: number): number =>
  sajuDayNumber(dt.year, dt.month, dt.day) * MINUTES_PER_DAY + dt.hour * 60 + dt.minute - offsetMinutes;

// ── 24절기 ───────────────────────────────────────────────────────────────────

export const SAJU_SOLAR_TERM_NAMES = [
  '소한', '대한', '입춘', '우수', '경칩', '춘분', '청명', '곡우', '입하', '소만', '망종', '하지',
  '소서', '대서', '입추', '처서', '백로', '추분', '한로', '상강', '입동', '소설', '대설', '동지',
] as const;
export const SAJU_SOLAR_TERM_HANJA = [
  '小寒', '大寒', '立春', '雨水', '驚蟄', '春分', '淸明', '穀雨', '立夏', '小滿', '芒種', '夏至',
  '小暑', '大暑', '立秋', '處暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
] as const;
export type SolarTermIndex = number; // 0..23 (짝수 = 절(節), 홀수 = 중기(中氣))

/** 절기 index → 태양 황경(도). */
export const solarTermLongitude = (index: number): number => (285 + 15 * index) % 360;
/** 절(節)인가 — 월주가 바뀌는 12절기(소한·입춘·경칩·청명·입하·망종·소서·입추·백로·한로·입동·대설). */
export const isMonthTerm = (index: number): boolean => index % 2 === 0;
/** 절 index → 그 절로 시작하는 달의 지지. 입춘(2)→인(2), 경칩(4)→묘(3) … 대설(22)→자(0), 소한(0)→축(1). */
export const monthBranchOfTerm = (index: number): number => (index / 2 + 1) % 12;

let termCache: Int32Array | null = null;
const decodeTerms = (): Int32Array => {
  if (termCache) return termCache;
  const total = (SAJU_TERM_YEARS.to - SAJU_TERM_YEARS.from + 1) * 24;
  const s = SAJU_SOLAR_TERMS_ENCODED;
  const headLen = s.length - 4 * (total - 1);
  const arr = new Int32Array(total);
  let v = Number.parseInt(s.slice(0, headLen), 10);
  arr[0] = v;
  for (let i = 1; i < total; i++) {
    const at = headLen + 4 * (i - 1);
    v += Number.parseInt(s.slice(at, at + 4), 36);
    arr[i] = v;
  }
  termCache = arr;
  return arr;
};

export const isSolarTermYearSupported = (year: number): boolean =>
  year >= SAJU_TERM_YEARS.from && year <= SAJU_TERM_YEARS.to;

/** 그 해 절기의 UTC 분. 범위 밖이면 null. */
export const solarTermUtcMinutes = (year: number, index: number): number | null => {
  if (!isSolarTermYearSupported(year) || index < 0 || index > 23) return null;
  return decodeTerms()[(year - SAJU_TERM_YEARS.from) * 24 + index] ?? null;
};

export interface SolarTermHit {
  year: number;
  index: number;
  /** 절기 순간(UTC 분). */
  atUtcMinutes: number;
  /** 다음 절(節)의 순간 — 이 달의 끝. */
  nextMonthTermUtcMinutes: number;
}

/** 주어진 UTC 순간이 속한 달의 절(節). 표 범위 밖이면 null. */
export const findMonthTermAt = (utcMinutes: number): SolarTermHit | null => {
  const terms = decodeTerms();
  const total = terms.length;
  // 이분 탐색: utcMinutes 이하의 마지막 절기.
  let lo = 0;
  let hi = total - 1;
  if (utcMinutes < (terms[0] as number) || utcMinutes >= (terms[total - 1] as number)) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((terms[mid] as number) <= utcMinutes) lo = mid;
    else hi = mid - 1;
  }
  // 절(짝수 index)까지 내려간다.
  let i = lo;
  if (i % 2 === 1) i -= 1;
  if (i < 0 || i + 2 >= total) return null;
  return {
    year: SAJU_TERM_YEARS.from + Math.floor(i / 24),
    index: i % 24,
    atUtcMinutes: terms[i] as number,
    nextMonthTermUtcMinutes: terms[i + 2] as number,
  };
};

/** 그 해 입춘 순간(UTC 분). */
export const ipchunUtcMinutes = (year: number): number | null => solarTermUtcMinutes(year, 2);

/** 그 해의 24절기 전부(UTC 분) — 달력 표시용. */
export const solarTermsOfYear = (year: number): Array<{ index: number; name: string; atUtcMinutes: number }> | null => {
  if (!isSolarTermYearSupported(year)) return null;
  return SAJU_SOLAR_TERM_NAMES.map((name, index) => ({
    index,
    name,
    atUtcMinutes: solarTermUtcMinutes(year, index) as number,
  }));
};

// ── 한국 표준시·서머타임 ─────────────────────────────────────────────────────

interface StandardPeriod {
  fromDay: number;
  offset: number;
}
// IANA Asia/Seoul: LMT 8:27:52 → 1908-04-01 8:30 → 1912-01-01 9:00 → 1954-03-21 8:30 → 1961-08-10 9:00.
const STANDARD_PERIODS: readonly StandardPeriod[] = [
  { fromDay: sajuDayNumber(1908, 4, 1), offset: 510 },
  { fromDay: sajuDayNumber(1912, 1, 1), offset: 540 },
  { fromDay: sajuDayNumber(1954, 3, 21), offset: 510 },
  { fromDay: sajuDayNumber(1961, 8, 10), offset: 540 },
];
const LMT_OFFSET = 508; // 8:27:52 반올림

interface DstPeriod {
  /** 시작 벽시계(표준시) 분. */
  startWall: number;
  /** 종료 벽시계(서머타임) 분 — 이 순간부터 표준시. */
  endWall: number;
}
const wall = (y: number, m: number, d: number, h = 0, mi = 0): number =>
  sajuDayNumber(y, m, d) * MINUTES_PER_DAY + h * 60 + mi;
// IANA Rule ROK. 24:00 종료는 다음날 0:00 으로 적었다.
const DST_PERIODS: readonly DstPeriod[] = [
  { startWall: wall(1948, 6, 1), endWall: wall(1948, 9, 13) },
  { startWall: wall(1949, 4, 3), endWall: wall(1949, 9, 11) },
  { startWall: wall(1950, 4, 1), endWall: wall(1950, 9, 10) },
  { startWall: wall(1951, 5, 6), endWall: wall(1951, 9, 9) },
  { startWall: wall(1955, 5, 5), endWall: wall(1955, 9, 9) },
  { startWall: wall(1956, 5, 20), endWall: wall(1956, 9, 30) },
  { startWall: wall(1957, 5, 5), endWall: wall(1957, 9, 22) },
  { startWall: wall(1958, 5, 4), endWall: wall(1958, 9, 21) },
  { startWall: wall(1959, 5, 3), endWall: wall(1959, 9, 20) },
  { startWall: wall(1960, 5, 1), endWall: wall(1960, 9, 18) },
  { startWall: wall(1987, 5, 10, 2), endWall: wall(1987, 10, 11, 3) },
  { startWall: wall(1988, 5, 8, 2), endWall: wall(1988, 10, 9, 3) },
];

export interface KoreaTimeResolution {
  /** UTC 분(1900-01-01T00:00Z 기준). */
  utcMinutes: number;
  /** 당시 표준시 오프셋(분). */
  standardOffsetMinutes: number;
  /** 서머타임 적용 여부(적용 시 실제 오프셋은 +60). */
  dst: boolean;
  /** 실제 오프셋(분). */
  offsetMinutes: number;
}

/** 한국 벽시계(당시 표준시 + 서머타임) → UTC. */
export const resolveKoreaWallClock = (dt: CivilDateTime): KoreaTimeResolution => {
  const dayNo = sajuDayNumber(dt.year, dt.month, dt.day);
  let standard = LMT_OFFSET;
  for (const p of STANDARD_PERIODS) if (dayNo >= p.fromDay) standard = p.offset;
  const wallMin = dayNo * MINUTES_PER_DAY + dt.hour * 60 + dt.minute;
  const dst = DST_PERIODS.some((p) => wallMin >= p.startWall && wallMin < p.endWall);
  const offset = standard + (dst ? 60 : 0);
  return { utcMinutes: wallMin - offset, standardOffsetMinutes: standard, dst, offsetMinutes: offset };
};

/** 현재 KST 기준 오늘/지금 → UTC 분. */
export const utcMinutesFromDate = (date: Date): number =>
  Math.floor((date.getTime() - Date.UTC(1900, 0, 1)) / 60_000);

/** KST 벽시계로 본 날짜(일수). */
export const kstDayNumberOfDate = (date: Date): number =>
  Math.floor((utcMinutesFromDate(date) + KST_OFFSET_MINUTES) / MINUTES_PER_DAY);

// ── 음력 ─────────────────────────────────────────────────────────────────────

export interface LunarMonthInfo {
  month: number;
  leap: boolean;
  length: number;
  /** 초하루 일수. */
  startDayNumber: number;
}

export interface LunarYearInfo {
  year: number;
  /** 음력 1월 1일 일수. */
  startDayNumber: number;
  /** 윤달 월(0 = 없음). */
  leapMonth: number;
  months: readonly LunarMonthInfo[];
}

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  leap: boolean;
}

let lunarCache: Map<number, LunarYearInfo> | null = null;
const decodeLunar = (): Map<number, LunarYearInfo> => {
  if (lunarCache) return lunarCache;
  const map = new Map<number, LunarYearInfo>();
  const records = SAJU_LUNAR_ENCODED.split(';');
  records.forEach((rec, i) => {
    const [startStr = '0', leapStr = '0', bits = ''] = rec.split(',');
    const year = SAJU_LUNAR_YEARS.from + i;
    const start = Number(startStr);
    const leapMonth = Number(leapStr);
    const months: LunarMonthInfo[] = [];
    let cursor = start;
    let m = 1;
    let isLeap = false;
    for (const bit of bits) {
      const length = bit === '1' ? 30 : 29;
      months.push({ month: m, leap: isLeap, length, startDayNumber: cursor });
      cursor += length;
      if (leapMonth && m === leapMonth && !isLeap) isLeap = true;
      else {
        m++;
        isLeap = false;
      }
    }
    map.set(year, { year, startDayNumber: start, leapMonth, months });
  });
  lunarCache = map;
  return map;
};

export const isLunarYearSupported = (year: number): boolean =>
  year >= SAJU_LUNAR_YEARS.from && year <= SAJU_LUNAR_YEARS.to;

export const lunarYearInfo = (year: number): LunarYearInfo | null => decodeLunar().get(year) ?? null;

/** 음력 → 양력. 없는 날(윤달 없음·30일 없음)이면 null. */
export const lunarToSolar = (year: number, month: number, day: number, leap = false): CivilDate | null => {
  const info = lunarYearInfo(year);
  if (!info) return null;
  const mi = info.months.find((x) => x.month === month && x.leap === leap);
  if (!mi || day < 1 || day > mi.length) return null;
  return sajuDateFromDayNumber(mi.startDayNumber + day - 1);
};

/** 양력 → 음력. 표 범위 밖(1900-01-31 이전, 2050 말 이후)이면 null. */
export const solarToLunar = (year: number, month: number, day: number): LunarDate | null => {
  const n = sajuDayNumber(year, month, day);
  const table = decodeLunar();
  // 양력 연도와 같거나 하나 앞선 음력 연도에 속한다.
  for (const y of [year, year - 1]) {
    const info = table.get(y);
    if (!info) continue;
    for (const mi of info.months) {
      if (n >= mi.startDayNumber && n < mi.startDayNumber + mi.length) {
        return { year: y, month: mi.month, day: n - mi.startDayNumber + 1, leap: mi.leap };
      }
    }
  }
  return null;
};

/** 음력 달 길이(29/30). 없으면 null. */
export const lunarMonthLength = (year: number, month: number, leap = false): number | null =>
  lunarYearInfo(year)?.months.find((x) => x.month === month && x.leap === leap)?.length ?? null;

/** 음력 표시 문자열 — "2025년 윤6월 1일". */
export const formatLunarDate = (d: LunarDate): string => `${d.year}년 ${d.leap ? '윤' : ''}${d.month}월 ${d.day}일`;
