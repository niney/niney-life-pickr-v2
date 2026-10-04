import type {
  AirBadStationsResultType,
  AirForecastItemType,
  AirForecastResultType,
  AirGradeType,
  AirHistoryPointType,
  AirHistoryTermType,
  AirMeasureItemType,
  AirNearbyResultType,
  AirNearbyStationItemType,
  AirSidoRealtimeResultType,
  AirStationHistoryResultType,
  AirStationInfoItemType,
  AirStationSearchResultType,
  AirStationsResultType,
  AirWeeklyForecastResultType,
} from '@repo/api-contract';
import {
  airAnnouncedToIso,
  airDataTimeToIso,
  airSidoFromAddr,
  airSidoMatches,
  haversineM,
  parseAirDustImage,
  parseAirRegionGrades,
  splitAirReliability,
} from '@repo/utils';
import { LRUCache } from 'lru-cache';
import { intOrNull, numOrNull } from '../../lib/narrow.js';
import {
  DailyQuota,
  UpstreamCooldown,
  retryAfterSec,
  seoulDateKey,
} from '../../lib/upstream-guard.js';
import {
  AirKoreaApiAuthError,
  AirKoreaApiError,
  getDustForecast,
  getSidoRealtime,
  getStationList,
  getStationRealtime,
  getWeeklyForecast,
  type AirKoreaApiRequestOptions,
  type AirKoreaDataTerm,
  type RawAirForecastRow,
  type RawAirMeasureRow,
  type RawAirStationRow,
  type RawAirWeeklyRow,
} from './airkorea-api.adapter.js';

// 에어코리아 프록시 서비스 — DB 없음. 키 단위 메모리 캐시(LRU) + in-flight 합류 + last-known stale 폴백 +
// 오퍼레이션별 일일 쿼터 + 실패 쿨다운(lib/upstream-guard). 단일 인스턴스 전제(CLAUDE.md) — Redis 불필요.
//
// 쿼터: data.go.kr 개발계정 일 500건. 시도별은 '전국' 1콜을 캐시해 전 시도를 거르고, 나쁨 목록도 그
// '전국' 캐시에서 파생한다(0콜). 캐시 만료는 발표 주기에 맞춘다(측정 다음 HH:20, 예보 다음 발표+15분).

// 측정(매시 정각 측정분이 보통 +10~20분에 반영) — 캐시를 다음 HH:20 까지 두고, 받은 자료가 아직 직전 정시
// 분이 아니면(늦게 올라오는 날) 이 간격으로 다시 본다. 장애 시 3시간까지 last-known.
export const AIR_MEASURE_TTL_MS = 10 * 60_000;
export const AIR_MEASURE_STALE_MAX_MS = 3 * 60 * 60_000;
// 측정분 반영 지연 — 정시 + 20분이면 거의 다 올라와 있다(어댑터 프로브 실측 +10~20분).
const MEASURE_PUBLISH_LAG_MS = 20 * 60_000;
// 예보(하루 4회 05/11/17/23시 발표) — 다음 발표 + 15분까지 캐시, 발표분이 늦으면 20분 간격으로 다시 본다.
// 주간예보(하루 1회 오후 발표) — 오늘 발표분이 있으면 자정까지, 없으면 정오 전엔 정오까지·이후엔 60분 간격.
// 장애 시 24시간까지 last-known(예보는 하루 지나도 참고 가치가 있다).
export const AIR_FORECAST_TTL_MS = 20 * 60_000;
export const AIR_WEEKLY_TTL_MS = 60 * 60_000;
export const AIR_FORECAST_STALE_MAX_MS = 24 * 60 * 60_000;
const FORECAST_SLOT_HOURS = [5, 11, 17, 23] as const;
const FORECAST_PUBLISH_LAG_MS = 15 * 60_000;
// 지난 날짜의 예보·주간예보는 더 바뀌지 않는다 — 길게.
const PAST_DATE_TTL_MS = 6 * 60 * 60_000;
// 측정소 목록(좌표·주소) — 사실상 정적. 24시간 캐시, 장애 시 7일까지 last-known.
export const AIR_STATIONS_TTL_MS = 24 * 60 * 60_000;
export const AIR_STATIONS_STALE_MAX_MS = 7 * 24 * 60 * 60_000;
// 정상 TTL 하한(발표 경계 직전에 0 이 되지 않게).
const MIN_TTL_MS = 30_000;
// 로컬 검색 응답 상한.
export const AIR_STATION_SEARCH_MAX = 30;
// 측정소 시계열 캐시 상한 — 엔트리는 서빙 형태(시간 24점 또는 일평균 ≤92점, ≈18KB 이하)라 300개 ≈5MB.
// 키 수가 사용자 입력(측정소 650곳 × 기간 3)에 묶여 있어 LRU 로 막는다(E-3).
export const AIR_HISTORY_CACHE_MAX = 300;

// 일일 업스트림 쿼터 — 기존 단일 카운터 총량 450(개발계정 500에서 여유)을 오퍼레이션별로 나눈다(E-2·E-8).
// 측정소 시계열을 아무리 불러도 공용 키(지도·내 주변·상단바 칩이 함께 보는 전국 실시간·예보)는 멈추지 않는다.
// 공용 키는 발표 주기 TTL 뒤 정상 하루 ≈47콜(24시간 시뮬레이션: 전국 25·예보 6·주간 15·목록 1)이라 버킷마다
// 장애 재시도(쿨다운 상한 5분 = 시간당 12콜)·재시작 여유를 두고, 나머지는 측정소 시계열(3MONTH 는 3콜).
// 재시도도 같은 버킷에 센다.
export const AIR_QUOTA_LIMITS = {
  realtime: 100,
  forecast: 30,
  weekly: 30,
  stations: 30,
  history: 260,
} as const;
export type AirQuotaBucket = keyof typeof AIR_QUOTA_LIMITS;
// 쿨다운 단위 — 대기오염정보(15073861)와 측정소정보(15073877)는 활용신청이 따로인 별개 API.
type AirUpstream = 'arpltn' | 'msrstn';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const KST_OFFSET_MS = 9 * HOUR_MS;

// 라우트가 HTTP status 로 변환하는 서비스 에러(404 = 모르는 측정소, 503 = 키 미설정·쿼터 소진·쿨다운).
export class AirQualityServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    opts: { cause?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'AirQualityServiceError';
  }
}

export interface AirQualityServiceDeps {
  serviceKey: string;
  // 테스트 주입용 — 기본은 실제 에어코리아 어댑터.
  adapter?: {
    getSidoRealtime?: typeof getSidoRealtime;
    getStationRealtime?: typeof getStationRealtime;
    getDustForecast?: typeof getDustForecast;
    getWeeklyForecast?: typeof getWeeklyForecast;
    getStationList?: typeof getStationList;
  };
  // 테스트 주입용 — TTL/쿼터 경계 시간 제어(가짜 타이머 불필요).
  now?: () => Date;
  // 테스트 주입용 — 모든 버킷에 같은 한도(dailyLimits 가 버킷별로 우선).
  dailyLimit?: number;
  dailyLimits?: Partial<Record<AirQuotaBucket, number>>;
}

interface CacheEntry {
  data: unknown;
  fetchedAt: Date;
  expiresAt: number;
  staleMaxMs: number;
}
interface Cached<T> {
  data: T;
  fetchedAt: Date;
  stale: boolean;
}
interface Loaded<T> {
  data: T;
  ttlMs: number;
}
// 측정소 시계열 캐시 엔트리 — 응답에 필요한 모양만(원본 행 전체를 들고 있지 않는다).
interface StationHistoryData {
  latest: AirMeasureItemType | null;
  points: AirHistoryPointType[];
  total: number;
}

// ── 발표 주기 TTL ───────────────────────────────────────────────────────────

// 측정 키(전국·측정소 시계열) — 다음 HH:20 까지. 받은 자료의 최신 측정 시각이 지금 있어야 할 정시 분(HH:20
// 이 지났으면 이번 정시, 아니면 직전 정시)보다 오래됐으면 늦게 올라오는 중이라 10분 뒤 다시 본다.
// E-8: 10분 고정 TTL 은 같은 자료를 시간당 ≈5.5번 받았다(24시간 시뮬레이션 388/450).
export const measureTtlMs = (now: Date, latestMeasuredAt: string | null): number => {
  const nowMs = now.getTime();
  // KST 는 정시 단위 오프셋이라 UTC 정시 경계가 곧 KST 정시 경계다.
  const hourStart = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
  const pastMark = nowMs - hourStart >= MEASURE_PUBLISH_LAG_MS;
  const nextMark = hourStart + MEASURE_PUBLISH_LAG_MS + (pastMark ? HOUR_MS : 0);
  const expected = pastMark ? hourStart : hourStart - HOUR_MS;
  const latestMs = latestMeasuredAt ? Date.parse(latestMeasuredAt) : Number.NaN;
  const late = !Number.isFinite(latestMs) || latestMs < expected;
  const untilMark = nextMark - nowMs;
  return Math.max(MIN_TTL_MS, late ? Math.min(AIR_MEASURE_TTL_MS, untilMark) : untilMark);
};

// KST 그날 0시(UTC ms).
const kstDayStartMs = (nowMs: number): number =>
  Math.floor((nowMs + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;

// 예보 키 — 정규 발표(05/11/17/23시) + 15분 마크 기준. 다음 마크까지 캐시하되, 이미 지난 마크의 발표분이
// 자료에 없으면(늦게 올라오는 중) 20분 뒤 다시 본다.
export const forecastTtlMs = (now: Date, latestAnnouncedAt: string | null): number => {
  const nowMs = now.getTime();
  const day0 = kstDayStartMs(nowMs);
  let nextMark = Number.POSITIVE_INFINITY;
  let expectedSlot = Number.NEGATIVE_INFINITY;
  for (const dayStart of [day0 - DAY_MS, day0, day0 + DAY_MS]) {
    for (const h of FORECAST_SLOT_HOURS) {
      const slot = dayStart + h * HOUR_MS;
      const mark = slot + FORECAST_PUBLISH_LAG_MS;
      if (mark > nowMs) nextMark = Math.min(nextMark, mark);
      else expectedSlot = Math.max(expectedSlot, slot);
    }
  }
  const latestMs = latestAnnouncedAt ? Date.parse(latestAnnouncedAt) : Number.NaN;
  const late = !Number.isFinite(latestMs) || latestMs < expectedSlot;
  const untilMark = nextMark - nowMs;
  return Math.max(MIN_TTL_MS, late ? Math.min(AIR_FORECAST_TTL_MS, untilMark) : untilMark);
};

// 주간예보 키 — 오늘 발표분이 있으면 KST 자정까지(오토 키가 날짜로 바뀐다), 없으면 정오 전엔 정오까지(오후
// 발표라 오전엔 새 자료가 없다), 정오 이후엔 60분 간격. E-8: 60분 고정은 오전 내내 2콜씩 반복했다.
export const weeklyTtlMs = (now: Date, hasToday: boolean): number => {
  const nowMs = now.getTime();
  const day0 = kstDayStartMs(nowMs);
  const midnight = day0 + DAY_MS;
  const noon = day0 + 12 * HOUR_MS;
  if (hasToday) return Math.max(MIN_TTL_MS, midnight - nowMs);
  if (nowMs < noon) return Math.max(MIN_TTL_MS, noon - nowMs);
  return Math.max(MIN_TTL_MS, Math.min(AIR_WEEKLY_TTL_MS, midnight - nowMs));
};

// 명시 date 는 KST 오늘-2 ~ 오늘+1 안의 실제 날짜로 맞춘다 — 웹·앱은 date 를 보내지 않고(오늘 자동), 범위를
// 열어 두면 날짜마다 새 캐시 키·업스트림 1콜이라 무인증 순회로 하루 쿼터가 바닥났다(E-2). 범위 밖은 가까운 끝,
// 범위 안이지만 없는 날짜(09-31 등)는 오늘. 응답 date 가 실제 조회일을 알린다.
export const clampAirDate = (date: string, now: Date): string => {
  const nowMs = now.getTime();
  const allowed = [-2, -1, 0, 1].map((d) => seoulDateKey(new Date(nowMs + d * DAY_MS)));
  if (allowed.includes(date)) return date;
  const first = allowed[0]!;
  const last = allowed[allowed.length - 1]!;
  if (date < first) return first;
  if (date > last) return last;
  return seoulDateKey(now);
};

// ── 정규화 ──────────────────────────────────────────────────────────────────

// 농도 문자열 → 숫자. 결측 "-"/빈값/비수치 → null.
const toNum = (v: string | null): number | null => (v === null || v === '-' ? null : numOrNull(v));
// 등급 문자열('1'~'4') → 1~4, 그 외 null.
const toGrade = (v: string | null): AirGradeType => {
  const n = intOrNull(v);
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
};

export const toMeasureItem = (r: RawAirMeasureRow): AirMeasureItemType => ({
  stationName: r.stationName ?? '',
  stationCode: r.stationCode,
  sidoName: r.sidoName,
  mangName: r.mangName,
  dataTime: r.dataTime,
  measuredAt: airDataTimeToIso(r.dataTime),
  so2: toNum(r.so2Value),
  co: toNum(r.coValue),
  o3: toNum(r.o3Value),
  no2: toNum(r.no2Value),
  pm10: toNum(r.pm10Value),
  pm25: toNum(r.pm25Value),
  pm10Avg24: toNum(r.pm10Value24),
  pm25Avg24: toNum(r.pm25Value24),
  khai: toNum(r.khaiValue),
  khaiGrade: toGrade(r.khaiGrade),
  so2Grade: toGrade(r.so2Grade),
  coGrade: toGrade(r.coGrade),
  o3Grade: toGrade(r.o3Grade),
  no2Grade: toGrade(r.no2Grade),
  pm10Grade: toGrade(r.pm10Grade),
  pm25Grade: toGrade(r.pm25Grade),
  pm10Grade1h: toGrade(r.pm10Grade1h),
  pm25Grade1h: toGrade(r.pm25Grade1h),
  flags: {
    so2: r.so2Flag,
    co: r.coFlag,
    o3: r.o3Flag,
    no2: r.no2Flag,
    pm10: r.pm10Flag,
    pm25: r.pm25Flag,
  },
});

const toHourPoint = (m: AirMeasureItemType): AirHistoryPointType => ({
  time: m.dataTime ?? '',
  measuredAt: m.measuredAt,
  so2: m.so2,
  co: m.co,
  o3: m.o3,
  no2: m.no2,
  pm10: m.pm10,
  pm25: m.pm25,
  khai: m.khai,
});

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
const round = (v: number | null, digits: number): number | null =>
  v === null ? null : Number(v.toFixed(digits));

// 시간 행 → 일평균. 그룹 키는 dataTime 의 날짜 부분 — 업스트림 표기상 "24:00" 이 전일에
// 붙어 있어 에어코리아 일평균 관행(01~24시)과 같은 묶음이 된다. 결측은 평균에서 제외.
export const foldDaily = (rows: AirMeasureItemType[]): AirHistoryPointType[] => {
  const buckets = new Map<string, AirMeasureItemType[]>();
  for (const r of rows) {
    const day = r.dataTime?.slice(0, 10);
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const list = buckets.get(day);
    if (list) list.push(r);
    else buckets.set(day, [r]);
  }
  const pick = (list: AirMeasureItemType[], k: 'so2' | 'co' | 'o3' | 'no2' | 'pm10' | 'pm25' | 'khai'): number[] =>
    list.map((x) => x[k]).filter((v): v is number => v !== null);
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, list]) => ({
      time: day,
      measuredAt: null,
      so2: round(mean(pick(list, 'so2')), 4),
      co: round(mean(pick(list, 'co')), 2),
      o3: round(mean(pick(list, 'o3')), 4),
      no2: round(mean(pick(list, 'no2')), 4),
      pm10: round(mean(pick(list, 'pm10')), 1),
      pm25: round(mean(pick(list, 'pm25')), 1),
      khai: round(mean(pick(list, 'khai')), 0),
    }));
};

const FORECAST_CODE_ORDER: Record<string, number> = { PM10: 0, PM25: 1, O3: 2 };

const toForecastItem = (r: RawAirForecastRow): AirForecastItemType | null => {
  const code = r.informCode?.toUpperCase().replace('.', '');
  if (code !== 'PM10' && code !== 'PM25' && code !== 'O3') return null;
  return {
    code,
    announced: r.dataTime ?? '',
    announcedAt: airAnnouncedToIso(r.dataTime),
    targetDate: r.informData ?? '',
    overall: r.informOverall,
    cause: r.informCause,
    actionKnack: r.actionKnack,
    grades: parseAirRegionGrades(r.informGrade),
    images: r.imageUrls
      .map((u) => parseAirDustImage(u))
      .filter((img): img is NonNullable<typeof img> => img !== null),
  };
};

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const toForecastItems = (rows: RawAirForecastRow[]): AirForecastItemType[] =>
  rows
    .map(toForecastItem)
    .filter((x): x is AirForecastItemType => x !== null)
    // 최신 발표 먼저, 같은 발표 안에서는 PM10→PM25→O3, 대상일 오름차순.
    .sort(
      (a, b) =>
        -cmp(a.announcedAt ?? '', b.announcedAt ?? '') ||
        (FORECAST_CODE_ORDER[a.code] ?? 9) - (FORECAST_CODE_ORDER[b.code] ?? 9) ||
        cmp(a.targetDate, b.targetDate),
    );

export const toWeeklyResult = (
  row: RawAirWeeklyRow | null,
  fetchedAt: Date,
  stale: boolean,
): AirWeeklyForecastResultType => {
  if (!row) {
    return { presentedAt: null, outlook: null, days: [], fetchedAt: fetchedAt.toISOString(), stale };
  }
  const days = row.days
    .filter((d): d is { date: string; text: string | null } => !!d.date)
    .map((d) => {
      const { regions, reliability } = splitAirReliability(parseAirRegionGrades(d.text));
      return { date: d.date, grades: regions, reliability };
    })
    .sort((a, b) => cmp(a.date, b.date));
  return {
    presentedAt: row.presnatnDt,
    outlook: row.gwthcnd,
    days,
    fetchedAt: fetchedAt.toISOString(),
    stale,
  };
};

// WGS84 한국 범위 — 업스트림 dmX/dmY 의 축 배정을 값으로 판정한다(문서: dmX 위도,
// dmY 경도. 그러나 과거 버전은 TM 좌표였고 축이 뒤집힌 사례도 있어 믿지 않는다).
const inLatRange = (v: number | null): v is number => v !== null && v >= 33 && v <= 39;
const inLngRange = (v: number | null): v is number => v !== null && v >= 124 && v <= 132;

export const toStationInfoItem = (r: RawAirStationRow): AirStationInfoItemType => {
  const x = toNum(r.dmX);
  const y = toNum(r.dmY);
  let lat: number | null = null;
  let lng: number | null = null;
  if (inLatRange(x) && inLngRange(y)) {
    lat = x;
    lng = y;
  } else if (inLatRange(y) && inLngRange(x)) {
    lat = y;
    lng = x;
  }
  return {
    stationName: r.stationName ?? '',
    addr: r.addr ?? '',
    sidoName: airSidoFromAddr(r.addr),
    mangName: r.mangName,
    year: r.year,
    items: (r.item ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    lat,
    lng,
  };
};

// 통합대기환경지수 나쁨(3) 이상 측정소 — 업스트림 나쁨 목록 오퍼레이션 대신 '전국' 실시간의 khaiGrade 로
// 만든다(같은 시각 자료, 0콜 — E-8). 주소는 측정소 목록에서(동명 측정소는 시도로 고름), 목록이 없으면 빈
// 주소 + 측정 시도명.
export const deriveBadStations = (
  measures: AirMeasureItemType[],
  stations: AirStationInfoItemType[] | null,
): AirBadStationsResultType['items'] => {
  const byName = new Map<string, AirStationInfoItemType[]>();
  for (const s of stations ?? []) {
    const list = byName.get(s.stationName);
    if (list) list.push(s);
    else byName.set(s.stationName, [s]);
  }
  return measures
    .filter((m) => m.stationName && m.khaiGrade !== null && m.khaiGrade >= 3)
    .map((m) => {
      const candidates = byName.get(m.stationName) ?? [];
      const info =
        candidates.find((s) => s.sidoName !== null && airSidoMatches(m.sidoName, s.sidoName)) ??
        candidates[0] ??
        null;
      const addr = info?.addr ?? '';
      return { stationName: m.stationName, addr, sidoName: airSidoFromAddr(addr) ?? m.sidoName };
    });
};

// ── 서비스 ──────────────────────────────────────────────────────────────────

// stale 상한을 넘긴 엔트리 청소 — 만료 엔트리는 last-known 재료라 남기고, 상한을 넘긴 것만 지운다.
const sweepStale = (cache: LRUCache<string, CacheEntry>, nowMs: number): void => {
  const dead: string[] = [];
  for (const [k, v] of cache.entries()) {
    if (nowMs - v.fetchedAt.getTime() > v.staleMaxMs) dead.push(k);
  }
  for (const k of dead) cache.delete(k);
};

// 자료 안 최신 측정 시각(ISO) — 측정 TTL 의 "늦게 올라오는 중" 판정용.
const latestMeasuredAt = (items: readonly AirMeasureItemType[]): string | null => {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const m of items) {
    if (!m.measuredAt) continue;
    const t = Date.parse(m.measuredAt);
    if (t > bestMs) {
      bestMs = t;
      best = m.measuredAt;
    }
  }
  return best;
};

export class AirQualityService {
  // 공용 키(전국·측정소 목록·예보·주간) — 고정 키 + clamp 된 날짜라 수십 개 안이다.
  private readonly common = new LRUCache<string, CacheEntry>({ max: 64 });
  // 측정소 시계열 — 서빙 형태만, 개수 상한(E-3).
  private readonly history = new LRUCache<string, CacheEntry>({ max: AIR_HISTORY_CACHE_MAX });
  private readonly inflight = new Map<string, Promise<Cached<unknown>>>();
  private readonly quota: DailyQuota<AirQuotaBucket>;
  private readonly cooldown = new UpstreamCooldown();
  // 측정소 이름 집합 — 목록·전국 배열(캐시 엔트리) 단위 메모. 재조회로 배열이 바뀌면 새로 만든다.
  private readonly nameSets = new WeakMap<object, Set<string>>();

  constructor(private readonly deps: AirQualityServiceDeps) {
    const limits = {} as Record<AirQuotaBucket, number>;
    for (const b of Object.keys(AIR_QUOTA_LIMITS) as AirQuotaBucket[]) {
      limits[b] = deps.dailyLimits?.[b] ?? deps.dailyLimit ?? AIR_QUOTA_LIMITS[b];
    }
    this.quota = new DailyQuota(
      limits,
      () =>
        new AirQualityServiceError(
          '에어코리아 API 일일 호출 한도를 소진해 요청을 처리할 수 없습니다. 내일 다시 시도해주세요.',
          503,
        ),
    );
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private requireKey(): AirKoreaApiRequestOptions {
    if (!this.deps.serviceKey) {
      throw new AirQualityServiceError(
        'DATA_GO_KR_API_KEY 가 설정되지 않아 대기정보를 조회할 수 없습니다.',
        503,
      );
    }
    return { serviceKey: this.deps.serviceKey };
  }

  // 버킷에서 calls 만큼 확보(초과 시 소비 없이 503 throw — 캐시 레이어가 stale 폴백)하고, 어댑터의 재시도도
  // 같은 버킷에 세는 요청 옵션을 돌려준다.
  private take(bucket: AirQuotaBucket, now: Date, calls = 1): AirKoreaApiRequestOptions {
    const opts = this.requireKey();
    this.quota.consume(bucket, now, calls);
    return { ...opts, onRetry: () => this.quota.record(bucket, now) };
  }

  // 키 1개 — TTL 내 히트는 fetchedAt 보존, 미스는 in-flight 합류(같은 키 동시 요청 업스트림 1회). 업스트림
  // 실패·쿼터 소진·쿨다운 중에는 staleMaxMs 내 last-known 을 stale 로, 없으면 에러(쿨다운은 503).
  private cached<T>(
    cache: LRUCache<string, CacheEntry>,
    key: string,
    upstream: AirUpstream,
    staleMaxMs: number,
    load: (now: Date) => Promise<Loaded<T>>,
  ): Promise<Cached<T>> {
    const now = this.now();
    const nowMs = now.getTime();
    const hit = cache.get(key);
    if (hit && nowMs <= hit.expiresAt) {
      return Promise.resolve({ data: hit.data as T, fetchedAt: hit.fetchedAt, stale: false });
    }
    const existing = this.inflight.get(key) as Promise<Cached<T>> | undefined;
    if (existing) return existing;
    sweepStale(cache, nowMs);

    // 실패 쿨다운 — 업스트림·쿼터 없이 last-known 이나 503(E-V2).
    const blockedUntil = this.cooldown.blockedUntil(upstream, key, nowMs);
    if (blockedUntil !== null) {
      const lastKnown = cache.get(key);
      if (lastKnown) {
        return Promise.resolve({ data: lastKnown.data as T, fetchedAt: lastKnown.fetchedAt, stale: true });
      }
      return Promise.reject(
        new AirQualityServiceError(
          `에어코리아 API 가 응답하지 않아 잠시 조회를 멈췄습니다. ${retryAfterSec(blockedUntil, nowMs)}초 뒤 다시 시도해 주세요.`,
          503,
        ),
      );
    }

    const task = this.loadInto(cache, key, upstream, now, staleMaxMs, load).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, task as Promise<Cached<unknown>>);
    return task;
  }

  private async loadInto<T>(
    cache: LRUCache<string, CacheEntry>,
    key: string,
    upstream: AirUpstream,
    now: Date,
    staleMaxMs: number,
    load: (now: Date) => Promise<Loaded<T>>,
  ): Promise<Cached<T>> {
    const nowMs = now.getTime();
    try {
      const { data, ttlMs } = await load(now);
      this.cooldown.success(upstream, key);
      cache.set(key, { data, fetchedAt: now, expiresAt: nowMs + ttlMs, staleMaxMs });
      return { data, fetchedAt: now, stale: false };
    } catch (e) {
      // 업스트림 실패만 쿨다운 — 쿼터 소진(우리 카운터)은 업스트림 탓이 아니다. 인증·일일한도(게이트웨이
      // 20~33)는 어떤 키로 불러도 같은 답이라 그 API 전체를 막는다.
      if (e instanceof AirKoreaApiError) {
        this.cooldown.failure(upstream, key, nowMs, e instanceof AirKoreaApiAuthError);
      }
      const lastKnown = cache.get(key);
      if (lastKnown && nowMs - lastKnown.fetchedAt.getTime() <= lastKnown.staleMaxMs) {
        return { data: lastKnown.data as T, fetchedAt: lastKnown.fetchedAt, stale: true };
      }
      throw e;
    }
  }

  // '전국' 실시간 1콜(673개소) — 시도별·내 주변·나쁨 목록·측정소 화이트리스트가 함께 쓰는 단일 캐시.
  private loadSidoAll(): Promise<Cached<AirMeasureItemType[]>> {
    const fetchAll = this.deps.adapter?.getSidoRealtime ?? getSidoRealtime;
    return this.cached(this.common, 'sido:전국', 'arpltn', AIR_MEASURE_STALE_MAX_MS, async (now) => {
      const { rows } = await fetchAll('전국', this.take('realtime', now));
      const items = rows.map(toMeasureItem);
      return { data: items, ttlMs: measureTtlMs(now, latestMeasuredAt(items)) };
    });
  }

  // ── 시도별 실시간 측정정보 ───────────────────────────────────────────────
  // 업스트림 '전국' 1콜을 캐시하고 요청 시도로 거른다 — 17개 시도 각각의 캐시 미스 팬아웃을 막고(쿼터
  // 17→1), 2026-07 광주·전남 통합 라벨('전남광주')과 개별 '광주' 조회 타임아웃(실측)을 우회한다.
  async getSidoRealtime(sidoName: string): Promise<AirSidoRealtimeResultType> {
    this.requireKey();
    const { data, fetchedAt, stale } = await this.loadSidoAll();
    const wanted = sidoName.trim();
    const items = data.filter((m) => airSidoMatches(m.sidoName, wanted));
    return { sidoName: wanted, items, total: items.length, fetchedAt: fetchedAt.toISOString(), stale };
  }

  // 측정소 화이트리스트(E-2) — 측정소 목록(24h 캐시) ∪ 전국 실시간(측정 캐시)의 이름. 둘 다 평소 캐시 히트라
  // 0콜이고, 목록 API 가 죽었으면 전국 이름만으로 판정한다. 둘 다 없으면 판정할 수 없어 그 에러를 낸다
  // (업스트림이 그만큼 죽었으면 시계열 호출도 어차피 실패한다).
  private async isKnownStation(name: string): Promise<boolean> {
    const [list, realtime] = await Promise.allSettled([this.loadStations(), this.loadSidoAll()]);
    const sources: Array<readonly { stationName: string }[]> = [];
    if (list.status === 'fulfilled') sources.push(list.value.data);
    if (realtime.status === 'fulfilled') sources.push(realtime.value.data);
    if (sources.length === 0) {
      throw realtime.status === 'rejected'
        ? realtime.reason
        : new AirQualityServiceError('측정소 목록을 확인할 수 없습니다.', 503);
    }
    return sources.some((rows) => this.nameSet(rows).has(name));
  }

  private nameSet(rows: readonly { stationName: string }[]): Set<string> {
    let set = this.nameSets.get(rows);
    if (!set) {
      set = new Set(rows.map((r) => r.stationName.trim().normalize('NFC')).filter((n) => n.length > 0));
      this.nameSets.set(rows, set);
    }
    return set;
  }

  // ── 측정소별 실시간 측정정보 ─────────────────────────────────────────────
  // DAILY 는 시간별 원본(최근 24시간), MONTH/3MONTH 는 일평균으로 접는다. latest 는 가장 최근 시간 행(등급·
  // 플래그·측정망) — 상세 카드가 쓴다. 캐시에는 이 서빙 형태만 둔다(3MONTH 원본 ≈2,200행 ≈1.2MB → ≈18KB, E-3).
  async getStationHistory(
    stationName: string,
    term: AirHistoryTermType,
  ): Promise<AirStationHistoryResultType> {
    this.requireKey();
    const fetchStation = this.deps.adapter?.getStationRealtime ?? getStationRealtime;
    const name = stationName.trim().normalize('NFC');
    const dataTerm: AirKoreaDataTerm = term;
    const key = `station:${name}:${term}`;
    // 캐시에 있는 키는 이미 검증한 이름 — 미스만 화이트리스트를 탄다. 모르는 이름은 404, 쿼터 0.
    if (!this.history.has(key) && !(await this.isKnownStation(name))) {
      throw new AirQualityServiceError(`측정소 '${name}' 을(를) 찾을 수 없습니다.`, 404);
    }
    const { data, fetchedAt, stale } = await this.cached<StationHistoryData>(
      this.history,
      key,
      'arpltn',
      AIR_MEASURE_STALE_MAX_MS,
      async (now) => {
        // 3MONTH 는 3페이지(≈2,200행) — 페이지 수만큼 쿼터 소비.
        const opts = this.take('history', now, term === '3MONTH' ? 3 : 1);
        const { rows, totalCount } = await fetchStation(name, dataTerm, opts);
        const items = rows
          .map(toMeasureItem)
          // measuredAt 이 없는 행(시각 결측)은 시계열에 놓을 수 없어 제외.
          .filter((m) => m.measuredAt !== null)
          .sort((a, b) => cmp(a.measuredAt ?? '', b.measuredAt ?? ''));
        const latest = items[items.length - 1] ?? null;
        const points = term === 'DAILY' ? items.map(toHourPoint) : foldDaily(items);
        return {
          data: { latest, points, total: totalCount ?? rows.length },
          ttlMs: measureTtlMs(now, latest?.measuredAt ?? null),
        };
      },
    );
    return {
      stationName: name,
      term,
      unit: term === 'DAILY' ? 'hour' : 'day',
      latest: data.latest,
      points: data.points,
      total: data.total,
      fetchedAt: fetchedAt.toISOString(),
      stale,
    };
  }

  // ── 통합대기환경지수 나쁨 이상 측정소 ────────────────────────────────────
  // '전국' 실시간 캐시에서 파생 — 업스트림 0콜(E-8). 신선도·stale 은 '전국' 을 따른다.
  async getBadStations(): Promise<AirBadStationsResultType> {
    this.requireKey();
    const [realtime, list] = await Promise.all([
      this.loadSidoAll(),
      // 주소 보강은 선택 — 측정소정보 API 가 죽어도 나쁨 목록은 이름·시도로 낸다.
      this.loadStations().catch(() => null),
    ]);
    const items = deriveBadStations(realtime.data, list?.data ?? null);
    return {
      items,
      total: items.length,
      fetchedAt: realtime.fetchedAt.toISOString(),
      stale: realtime.stale,
    };
  }

  // ── 대기질 예보통보 ─────────────────────────────────────────────────────
  // date 생략 시 KST 오늘 — 당일 발표분이 아직 없으면(05시 전) 전일 발표분으로 폴백(전일 23시 발표가 오늘·
  // 내일을 담고 있다). 명시 date 는 오늘-2~오늘+1 로 맞추고(clampAirDate) 폴백 없이 그 날짜만.
  async getForecast(date?: string): Promise<AirForecastResultType> {
    this.requireKey();
    const fetchForecast = this.deps.adapter?.getDustForecast ?? getDustForecast;
    const now = this.now();
    const today = seoulDateKey(now);
    const target = date !== undefined ? clampAirDate(date, now) : today;
    const key = date !== undefined ? `forecast:${target}` : `forecast:auto:${today}`;
    const { data, fetchedAt, stale } = await this.cached(
      this.common,
      key,
      'arpltn',
      AIR_FORECAST_STALE_MAX_MS,
      async (at) => {
        const rows = await fetchForecast(target, this.take('forecast', at));
        if (rows.length > 0 || date !== undefined) {
          const items = toForecastItems(rows);
          const ttlMs =
            target < today ? PAST_DATE_TTL_MS : forecastTtlMs(at, items[0]?.announcedAt ?? null);
          return { data: { date: target, items }, ttlMs };
        }
        const yesterday = seoulDateKey(new Date(at.getTime() - DAY_MS));
        const prev = toForecastItems(await fetchForecast(yesterday, this.take('forecast', at)));
        return {
          data: { date: yesterday, items: prev },
          ttlMs: forecastTtlMs(at, prev[0]?.announcedAt ?? null),
        };
      },
    );
    return { date: data.date, items: data.items, fetchedAt: fetchedAt.toISOString(), stale };
  }

  // ── 측정소 정보(측정소정보 API) ─────────────────────────────────────────
  // 전량 24시간 캐시 — 지도 마커·검색·내 주변·나쁨 목록 주소·시계열 화이트리스트의 단일 원천. 활용신청
  // 전이면 503(AirKoreaApiAuthError 30) — 라우트가 그대로 내려 FE 가 신청 안내를 띄운다.
  private loadStations(): Promise<Cached<AirStationInfoItemType[]>> {
    const fetchList = this.deps.adapter?.getStationList ?? getStationList;
    return this.cached(this.common, 'stations', 'msrstn', AIR_STATIONS_STALE_MAX_MS, async (now) => {
      const { rows } = await fetchList(this.take('stations', now));
      return {
        data: rows.filter((r) => !!r.stationName).map(toStationInfoItem),
        ttlMs: AIR_STATIONS_TTL_MS,
      };
    });
  }

  async getStations(): Promise<AirStationsResultType> {
    this.requireKey();
    const { data, fetchedAt, stale } = await this.loadStations();
    return { items: data, total: data.length, fetchedAt: fetchedAt.toISOString(), stale };
  }

  // 좌표 기반 내 주변 — 캐시된 목록에서 거리 계산(업스트림 0콜) + '전국' 실시간 캐시와 측정소명으로 조인해
  // 현재 값을 붙인다. 실시간이 실패해도 목록은 돌려준다(measure null). 동명 측정소는 주소 시도 ↔ 측정
  // sidoName 매칭으로 고른다. 목록·실시간은 함께 기다린다(순차면 업스트림이 느릴 때 대기가 두 배).
  async getNearbyStations(
    lat: number,
    lng: number,
    radiusM: number,
    limit: number,
  ): Promise<AirNearbyResultType> {
    this.requireKey();
    const [list, realtime] = await Promise.allSettled([this.loadStations(), this.loadSidoAll()]);
    if (list.status === 'rejected') throw list.reason;
    const { data: stations, fetchedAt, stale } = list.value;
    // 측정값 조인은 부가 정보 — 실시간 장애가 '내 주변' 자체를 막지 않는다.
    const measures = realtime.status === 'fulfilled' ? realtime.value.data : [];
    const byName = new Map<string, AirMeasureItemType[]>();
    for (const m of measures) {
      const same = byName.get(m.stationName);
      if (same) same.push(m);
      else byName.set(m.stationName, [m]);
    }
    const center = { lat, lng };
    const withDist = stations
      .filter((s): s is AirStationInfoItemType & { lat: number; lng: number } => s.lat !== null && s.lng !== null)
      .map((s) => ({ s, dist: Math.round(haversineM(center, { lat: s.lat, lng: s.lng })) }))
      .filter((x) => x.dist <= radiusM)
      .sort((a, b) => a.dist - b.dist);
    const items: AirNearbyStationItemType[] = withDist.slice(0, limit).map(({ s, dist }) => {
      const candidates = byName.get(s.stationName) ?? [];
      const measure =
        candidates.find((m) => s.sidoName !== null && airSidoMatches(m.sidoName, s.sidoName)) ??
        candidates[0] ??
        null;
      return { ...s, dist, measure };
    });
    return {
      center,
      items,
      total: withDist.length,
      fetchedAt: fetchedAt.toISOString(),
      stale,
    };
  }

  // 측정소명/주소 로컬 검색 — 이름 앞머리 일치 → 이름 포함 → 주소 포함 순, 상위 30.
  async searchStations(q: string): Promise<AirStationSearchResultType> {
    this.requireKey();
    const { data: stations, fetchedAt, stale } = await this.loadStations();
    const needle = q.trim().normalize('NFC');
    const rank = (s: AirStationInfoItemType): number => {
      const name = s.stationName.normalize('NFC');
      if (name.startsWith(needle)) return 0;
      if (name.includes(needle)) return 1;
      if (s.addr.normalize('NFC').includes(needle)) return 2;
      return -1;
    };
    const matched = stations
      .map((s) => ({ s, r: rank(s) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || cmp(a.s.stationName, b.s.stationName));
    return {
      q: needle,
      items: matched.slice(0, AIR_STATION_SEARCH_MAX).map((x) => x.s),
      total: matched.length,
      fetchedAt: fetchedAt.toISOString(),
      stale,
    };
  }

  // ── 초미세먼지 주간예보 ─────────────────────────────────────────────────
  // 발표일 기준 1행. 오후 발표라 오전엔 당일분이 없다 → 전일로 폴백(명시 date 는 clamp 후 폴백 없음).
  async getWeeklyForecast(date?: string): Promise<AirWeeklyForecastResultType> {
    this.requireKey();
    const fetchWeekly = this.deps.adapter?.getWeeklyForecast ?? getWeeklyForecast;
    const now = this.now();
    const today = seoulDateKey(now);
    const target = date !== undefined ? clampAirDate(date, now) : today;
    const key = date !== undefined ? `weekly:${target}` : `weekly:auto:${today}`;
    const { data, fetchedAt, stale } = await this.cached(
      this.common,
      key,
      'arpltn',
      AIR_FORECAST_STALE_MAX_MS,
      async (at) => {
        const rows = await fetchWeekly(target, this.take('weekly', at));
        if (rows.length > 0 || date !== undefined) {
          const ttlMs =
            target < today ? PAST_DATE_TTL_MS : weeklyTtlMs(at, rows.length > 0 && target === today);
          return { data: rows[0] ?? null, ttlMs };
        }
        const yesterday = seoulDateKey(new Date(at.getTime() - DAY_MS));
        const prev = await fetchWeekly(yesterday, this.take('weekly', at));
        return { data: prev[0] ?? null, ttlMs: weeklyTtlMs(at, false) };
      },
    );
    return toWeeklyResult(data, fetchedAt, stale);
  }

  // 측정·진단용 — 버킷별 오늘 사용량(시뮬레이션·테스트).
  quotaUsed(bucket: AirQuotaBucket): number {
    return this.quota.used(bucket, this.now());
  }
}
