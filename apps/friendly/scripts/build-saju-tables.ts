// 사주 달력 표 생성 — 24절기 시각 + 음력 월 표 → packages/utils/src/sajuAstroTable.ts
//
// 실행: pnpm --filter friendly build:saju-tables [--source=astro|kasi] [--from=1899] [--to=2051]
//   astro (기본)  astronomy-engine(MIT, DE405 기반 축약 모델)으로 태양 황경·합삭을 계산하고 무중치윤법으로
//                음력 월을 세운다. KASI 공개값과 분 단위로 대조해 보면 절기는 ±1분, 합삭 날짜는 일치.
//   kasi          data.go.kr 한국천문연구원 "24절기 정보"(SpcdeInfoService) + "음양력 정보"(LrsrCldInfoService).
//                DATA_GO_KR_API_KEY 필요. 연도당 절기 1건 + 음력 월 12건 호출(151년 ≈ 2,000건).
//                공식 값이므로 받을 수 있으면 이쪽을 우선한다. 결과 파일 머리에 source 가 남는다.
//
// 표 형식(런타임 파서는 utils sajuCalendar.ts):
//  - 절기: fromYear..toYear 각 연도 24개(소한 285° 부터 15° 간격 → 동지 270°)의 UTC 분(1900-01-01T00:00Z 기준).
//          첫 값은 10진, 이후는 직전 값과의 차이를 base36 4자리 고정폭으로 이어 붙인 문자열.
//  - 음력: 음력 연도별 "시작일수,윤달(0=없음),월길이비트" 를 ';' 로 이어 붙인 문자열. 시작일수는 음력 1월 1일의
//          1900-01-01(KST) 기준 일수, 비트는 1=30일·0=29일, 윤달이 있으면 그 달 뒤에 한 비트가 더 들어간다.
// 자체 검증: 설날(음력 1/1) 양력 날짜 1990~2050 과 윤달 목록 1900~2050 을 골든셋과 대조해 불일치를 출력한다.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};

const SOURCE = opt('source', 'astro') as 'astro' | 'kasi';
const FROM_YEAR = Number(opt('from', '1899'));
const TO_YEAR = Number(opt('to', '2051'));
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const OUT = path.resolve(REPO_ROOT, 'packages/utils/src/sajuAstroTable.ts');

// ── 날짜 유틸 (utils sajuCalendar.ts 와 같은 정의) ─────────────────────────────

const EPOCH_JDN = 2415021; // 1900-01-01
const KST_OFFSET_MIN = 9 * 60;

const jdn = (y: number, m: number, d: number): number => {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
};
const dayNumber = (y: number, m: number, d: number): number => jdn(y, m, d) - EPOCH_JDN;
const fromDayNumber = (n: number): { y: number; m: number; d: number } => {
  const j = n + EPOCH_JDN;
  const a = j + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return { d: e - Math.floor((153 * m + 2) / 5) + 1, m: m + 3 - 12 * Math.floor(m / 10), y: 100 * b + d - 4800 + Math.floor(m / 10) };
};
const utcMinutes = (date: Date): number => Math.round((date.getTime() - Date.UTC(1900, 0, 1)) / 60_000);
const kstDayOfUtcMinutes = (min: number): number => Math.floor((min + KST_OFFSET_MIN) / 1440);
const fmt = (n: number): string => {
  const { y, m, d } = fromDayNumber(n);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

// ── 골든셋 ───────────────────────────────────────────────────────────────────

// 설날(음력 1월 1일) 양력 날짜 1990~2050 — 월력요항·연휴 기사로 확인(2027 은 2/7, 1996·1999·2003·2050 은 연휴 시작일이 아니라 설날 당일).
const SEOLLAL: Record<number, string> = {
  1990: '01-27', 1991: '02-15', 1992: '02-04', 1993: '01-23', 1994: '02-10', 1995: '01-31', 1996: '02-19',
  1997: '02-08', 1998: '01-28', 1999: '02-16', 2000: '02-05', 2001: '01-24', 2002: '02-12', 2003: '02-01',
  2004: '01-22', 2005: '02-09', 2006: '01-29', 2007: '02-18', 2008: '02-07', 2009: '01-26', 2010: '02-14',
  2011: '02-03', 2012: '01-23', 2013: '02-10', 2014: '01-31', 2015: '02-19', 2016: '02-08', 2017: '01-28',
  2018: '02-16', 2019: '02-05', 2020: '01-25', 2021: '02-12', 2022: '02-01', 2023: '01-22', 2024: '02-10',
  2025: '01-29', 2026: '02-17', 2027: '02-07', 2028: '01-27', 2029: '02-13', 2030: '02-03', 2031: '01-23',
  2032: '02-11', 2033: '01-31', 2034: '02-19', 2035: '02-08', 2036: '01-28', 2037: '02-15', 2038: '02-04',
  2039: '01-24', 2040: '02-12', 2041: '02-01', 2042: '01-22', 2043: '02-10', 2044: '01-30', 2045: '02-17',
  2046: '02-06', 2047: '01-26', 2048: '02-14', 2049: '02-02', 2050: '01-23',
};
// 윤달 — 1900~2050 (나무위키 윤달 표).
const LEAP_MONTHS: Record<number, number> = {
  1900: 8, 1903: 5, 1906: 4, 1909: 2, 1911: 6, 1914: 5, 1917: 2, 1919: 7, 1922: 5, 1925: 4, 1928: 2, 1930: 6,
  1933: 5, 1936: 3, 1938: 7, 1941: 6, 1944: 4, 1947: 2, 1949: 7, 1952: 5, 1955: 3, 1957: 8, 1960: 6, 1963: 4,
  1966: 3, 1968: 7, 1971: 5, 1974: 4, 1976: 8, 1979: 6, 1982: 4, 1984: 10, 1987: 6, 1990: 5, 1993: 3, 1995: 8,
  1998: 5, 2001: 4, 2004: 2, 2006: 7, 2009: 5, 2012: 3, 2014: 9, 2017: 5, 2020: 4, 2023: 2, 2025: 6, 2028: 5,
  2031: 3, 2033: 11, 2036: 6, 2039: 5, 2042: 2, 2044: 7, 2047: 5, 2050: 3,
};

// ── 표 자료형 ────────────────────────────────────────────────────────────────

interface LunarYear {
  year: number;
  start: number; // 음력 1/1 의 일수
  leap: number; // 0 = 없음
  lengths: number[]; // 12 or 13
}

// ── astro 소스 ───────────────────────────────────────────────────────────────

const buildAstro = async (): Promise<{ terms: number[]; lunar: LunarYear[]; label: string }> => {
  const A = await import('astronomy-engine');
  const terms: number[] = [];
  // 연도별 24개: 소한(285°) → … → 동지(270°). 대략 1월 5일 + 15.2일 × i 근처에서 탐색.
  for (let y = FROM_YEAR; y <= TO_YEAR; y++) {
    for (let i = 0; i < 24; i++) {
      const lon = (285 + 15 * i) % 360;
      const approx = new Date(Date.UTC(y, 0, 5) + i * 15.22 * 86_400_000 - 8 * 86_400_000);
      const t = A.SearchSunLongitude(lon, approx, 20);
      if (!t) throw new Error(`절기 탐색 실패 ${y}/${i}`);
      terms.push(utcMinutes(t.date));
    }
  }
  // 합삭 — FROM_YEAR-1 년 11월부터 TO_YEAR 년 3월까지.
  const newMoons: number[] = [];
  let cursor = new Date(Date.UTC(FROM_YEAR - 1, 10, 1));
  const end = Date.UTC(TO_YEAR, 3, 1);
  while (cursor.getTime() < end) {
    const t = A.SearchMoonPhase(0, cursor, 40);
    if (!t) throw new Error('합삭 탐색 실패');
    newMoons.push(utcMinutes(t.date));
    cursor = new Date(t.date.getTime() + 20 * 86_400_000);
  }
  const lunar = buildLunarFromAstro(terms, newMoons);
  return { terms, lunar, label: `astronomy-engine ${(A as { default?: unknown }).default ? '' : ''}2.1.19 + 무중치윤법(KST)` };
};

// 무중치윤법: 동지가 든 달이 11월. 두 동지 사이에 달이 13개면 그중 중기가 없는 첫 달이 윤달.
const buildLunarFromAstro = (terms: number[], newMoons: number[]): LunarYear[] => {
  const moonDays = newMoons.map(kstDayOfUtcMinutes);
  const termDay = (y: number, i: number): number => kstDayOfUtcMinutes(terms[(y - FROM_YEAR) * 24 + i]);
  const dongjiDay = (y: number): number => termDay(y, 23);
  // 중기(홀수 index) 날짜 목록.
  const midDays: number[] = [];
  for (let y = FROM_YEAR; y <= TO_YEAR; y++) for (let i = 1; i < 24; i += 2) midDays.push(termDay(y, i));
  const hasMid = (from: number, to: number): boolean => midDays.some((d) => d >= from && d < to);
  const lastMoonAtOrBefore = (day: number): number => {
    let idx = -1;
    for (let k = 0; k < moonDays.length; k++) if (moonDays[k] <= day) idx = k;
    return idx;
  };

  // 달 하나 = { start, number, year, leap }
  const months: Array<{ start: number; num: number; year: number; leap: boolean }> = [];
  for (let y = FROM_YEAR; y < TO_YEAR; y++) {
    const a = lastMoonAtOrBefore(dongjiDay(y)); // 11월(y)
    const b = lastMoonAtOrBefore(dongjiDay(y + 1)); // 11월(y+1)
    const count = b - a; // 11월(y) 부터 11월(y+1) 직전까지 달 수: 12 또는 13
    let leapUsed = false;
    let num = 11;
    let year = y;
    for (let k = a; k < b; k++) {
      const start = moonDays[k];
      const next = moonDays[k + 1];
      if (count === 13 && !leapUsed && !hasMid(start, next)) {
        months.push({ start, num, year, leap: true });
        leapUsed = true;
        continue;
      }
      if (k !== a) {
        num = num === 12 ? 1 : num + 1;
        if (num === 1) year = y + 1;
      }
      months.push({ start, num, year, leap: false });
    }
  }
  // 연도별로 묶는다.
  const byYear = new Map<number, LunarYear>();
  for (let i = 0; i < months.length - 1; i++) {
    const m = months[i];
    const len = months[i + 1].start - m.start;
    if (len !== 29 && len !== 30) throw new Error(`음력 달 길이 이상 ${m.year}/${m.num}: ${len}`);
    let rec = byYear.get(m.year);
    if (!rec) {
      rec = { year: m.year, start: 0, leap: 0, lengths: [] };
      byYear.set(m.year, rec);
    }
    if (m.num === 1 && !m.leap) rec.start = m.start;
    if (m.leap) rec.leap = m.num;
    rec.lengths.push(len);
  }
  return [...byYear.values()].filter((r) => r.year >= FROM_YEAR && r.year <= TO_YEAR - 1 && r.lengths.length >= 12).sort((p, q) => p.year - q.year);
};

// ── kasi 소스 ────────────────────────────────────────────────────────────────

const buildKasi = async (): Promise<{ terms: number[]; lunar: LunarYear[]; label: string }> => {
  const key = process.env.DATA_GO_KR_API_KEY;
  if (!key) throw new Error('DATA_GO_KR_API_KEY 가 없습니다(.env).');
  const BASE = 'https://apis.data.go.kr/B090041/openapi/service';
  const getItems = async (url: string): Promise<Array<Record<string, string | number>>> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const json = (await res.json()) as { response?: { body?: { items?: { item?: unknown } } } };
    const item = json.response?.body?.items?.item;
    if (!item) return [];
    return (Array.isArray(item) ? item : [item]) as Array<Record<string, string | number>>;
  };
  const TERM_NAMES = ['소한', '대한', '입춘', '우수', '경칩', '춘분', '청명', '곡우', '입하', '소만', '망종', '하지', '소서', '대서', '입추', '처서', '백로', '추분', '한로', '상강', '입동', '소설', '대설', '동지'];
  const terms: number[] = [];
  for (let y = FROM_YEAR; y <= TO_YEAR; y++) {
    const items = await getItems(`${BASE}/SpcdeInfoService/get24DivisionsInfo?solYear=${y}&numOfRows=30&_type=json&ServiceKey=${encodeURIComponent(key)}`);
    for (const name of TERM_NAMES) {
      const it = items.find((r) => String(r.dateName) === name);
      if (!it || !it.kst) throw new Error(`${y} ${name} 없음`);
      const d = String(it.locdate);
      const t = String(it.kst).padStart(4, '0');
      const utc = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)), Number(t.slice(0, 2)), Number(t.slice(2, 4))) - KST_OFFSET_MIN * 60_000;
      terms.push(utcMinutes(new Date(utc)));
    }
    process.stdout.write(`절기 ${y}\r`);
  }
  const lunar: LunarYear[] = [];
  for (let y = FROM_YEAR; y <= TO_YEAR - 1; y++) {
    const starts: Array<{ num: number; leap: boolean; day: number }> = [];
    for (let m = 1; m <= 12; m++) {
      const items = await getItems(`${BASE}/LrsrCldInfoService/getSolCalInfo?lunYear=${y}&lunMonth=${String(m).padStart(2, '0')}&lunDay=01&_type=json&ServiceKey=${encodeURIComponent(key)}`);
      for (const it of items) {
        starts.push({ num: m, leap: String(it.lunLeapmonth) === '윤', day: dayNumber(Number(it.solYear), Number(it.solMonth), Number(it.solDay)) });
      }
    }
    starts.sort((p, q) => p.day - q.day);
    // 다음 해 1월 1일로 마지막 달 길이를 구한다.
    const nextItems = await getItems(`${BASE}/LrsrCldInfoService/getSolCalInfo?lunYear=${y + 1}&lunMonth=01&lunDay=01&_type=json&ServiceKey=${encodeURIComponent(key)}`);
    const nextStart = nextItems.length ? dayNumber(Number(nextItems[0].solYear), Number(nextItems[0].solMonth), Number(nextItems[0].solDay)) : NaN;
    const lengths = starts.map((s, i) => (i + 1 < starts.length ? starts[i + 1].day : nextStart) - s.day);
    lunar.push({ year: y, start: starts[0].day, leap: starts.find((s) => s.leap)?.num ?? 0, lengths });
    process.stdout.write(`음력 ${y}\r`);
  }
  return { terms, lunar, label: 'KASI data.go.kr (SpcdeInfoService/get24DivisionsInfo + LrsrCldInfoService/getSolCalInfo)' };
};

// ── 인코딩·검증·출력 ─────────────────────────────────────────────────────────

const encodeTerms = (terms: number[]): string => {
  let out = String(terms[0]);
  for (let i = 1; i < terms.length; i++) {
    const delta = terms[i] - terms[i - 1];
    if (delta <= 0 || delta >= 36 ** 4) throw new Error(`절기 간격 이상 ${i}: ${delta}`);
    out += delta.toString(36).padStart(4, '0');
  }
  return out;
};
const encodeLunar = (lunar: LunarYear[]): string =>
  lunar.map((r) => `${r.start},${r.leap},${r.lengths.map((l) => (l === 30 ? '1' : '0')).join('')}`).join(';');

const verify = (lunar: LunarYear[]): number => {
  let bad = 0;
  for (const [ys, md] of Object.entries(SEOLLAL)) {
    const y = Number(ys);
    const rec = lunar.find((r) => r.year === y);
    const got = rec ? fmt(rec.start) : 'none';
    if (got !== `${y}-${md}`) {
      bad++;
      console.log(`설날 불일치 ${y}: 기대 ${y}-${md}, 계산 ${got}`);
    }
  }
  for (const r of lunar) {
    if (r.year < 1900 || r.year > 2050) continue;
    const want = LEAP_MONTHS[r.year] ?? 0;
    if (want !== r.leap) {
      bad++;
      console.log(`윤달 불일치 ${r.year}: 기대 ${want || '없음'}, 계산 ${r.leap || '없음'}`);
    }
    const days = r.lengths.reduce((a, b) => a + b, 0);
    if (days < 353 || days > 385) {
      bad++;
      console.log(`연 길이 이상 ${r.year}: ${days}`);
    }
  }
  return bad;
};

const main = async (): Promise<void> => {
  const built = SOURCE === 'kasi' ? await buildKasi() : await buildAstro();
  const bad = verify(built.lunar);
  const lunarFrom = built.lunar[0].year;
  const lunarTo = built.lunar[built.lunar.length - 1].year;
  const src = `// 생성물 — apps/friendly/scripts/build-saju-tables.ts (--source=${SOURCE}). 손으로 고치지 말 것.
// source: ${built.label}
// 생성: ${new Date().toISOString().slice(0, 10)}, 검증 불일치 ${bad}건(설날 1990~2050·윤달 1900~2050 골든셋)
// 형식은 스크립트 머리 주석과 sajuCalendar.ts 참조.

export const SAJU_TABLE_SOURCE = ${JSON.stringify(built.label)};
export const SAJU_TERM_YEARS = { from: ${FROM_YEAR}, to: ${TO_YEAR} } as const;
export const SAJU_LUNAR_YEARS = { from: ${lunarFrom}, to: ${lunarTo} } as const;
export const SAJU_SOLAR_TERMS_ENCODED =
  '${encodeTerms(built.terms)}';
export const SAJU_LUNAR_ENCODED =
  '${encodeLunar(built.lunar)}';
`;
  writeFileSync(OUT, src, 'utf8');
  console.log(`\n${path.relative(REPO_ROOT, OUT)} 작성 — 절기 ${built.terms.length}개(${FROM_YEAR}~${TO_YEAR}), 음력 ${built.lunar.length}년(${lunarFrom}~${lunarTo}), 검증 불일치 ${bad}건`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
