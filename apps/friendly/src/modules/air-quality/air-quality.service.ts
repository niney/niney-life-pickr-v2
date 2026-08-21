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
import { intOrNull, numOrNull } from '../../lib/narrow.js';
import {
  getBadStations,
  getDustForecast,
  getSidoRealtime,
  getStationList,
  getStationRealtime,
  getWeeklyForecast,
  type AirKoreaApiRequestOptions,
  type AirKoreaDataTerm,
  type RawAirBadStationRow,
  type RawAirForecastRow,
  type RawAirMeasureRow,
  type RawAirStationRow,
  type RawAirWeeklyRow,
} from './airkorea-api.adapter.js';

// 에어코리아 프록시 서비스 — DB 없음. 키 단위 메모리 캐시(TTL) + in-flight 합류 +
// last-known stale 폴백 + 일일 쿼터 카운터(버스/지하철 실시간 캐시 골격 이식, 측정
// 주기에 맞춰 TTL 만 길다). 단일 인스턴스 전제(CLAUDE.md) — Redis 불필요.
//
// 쿼터: data.go.kr 개발계정 일 500건. 시도별은 '전국' 1콜을 캐시해 전 시도를 거르고,
// 나머지도 키 단위 캐시라 페이지 1회 로드 ≈ 5콜, 이후 TTL 동안 0콜.

// 측정(매시 정각 갱신, 보통 +10~20분에 반영) — 10분 캐시. 장애 시 3시간까지 last-known.
export const AIR_MEASURE_TTL_MS = 10 * 60_000;
export const AIR_MEASURE_STALE_MAX_MS = 3 * 60 * 60_000;
// 예보(하루 4회 05/11/17/23시 발표) — 20분 캐시 / 주간예보(하루 1회 오후) — 60분.
// 장애 시 24시간까지 last-known(예보는 하루 지나도 참고 가치가 있다).
export const AIR_FORECAST_TTL_MS = 20 * 60_000;
export const AIR_WEEKLY_TTL_MS = 60 * 60_000;
export const AIR_FORECAST_STALE_MAX_MS = 24 * 60 * 60_000;
// 측정소 목록(좌표·주소) — 사실상 정적. 24시간 캐시, 장애 시 7일까지 last-known.
export const AIR_STATIONS_TTL_MS = 24 * 60 * 60_000;
export const AIR_STATIONS_STALE_MAX_MS = 7 * 24 * 60 * 60_000;
// 로컬 검색 응답 상한.
export const AIR_STATION_SEARCH_MAX = 30;
// 일일 업스트림 호출 한도 기본값 — 개발계정 500건에서 여유를 둔 450.
export const DEFAULT_DAILY_UPSTREAM_LIMIT = 450;

// Asia/Seoul 기준 YYYY-MM-DD — 쿼터 리셋 경계 + 예보 조회일. en-CA 로캘이 ISO 형식.
const SEOUL_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const seoulDateKey = (d: Date): string => SEOUL_DATE_FMT.format(d);
const DAY_MS = 86_400_000;

// 라우트가 HTTP status 로 변환하는 서비스 에러(503 = 키 미설정·쿼터 소진).
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
    getBadStations?: typeof getBadStations;
    getDustForecast?: typeof getDustForecast;
    getWeeklyForecast?: typeof getWeeklyForecast;
    getStationList?: typeof getStationList;
  };
  // 테스트 주입용 — TTL/쿼터 경계 시간 제어(가짜 타이머 불필요).
  now?: () => Date;
  // 일일 업스트림 호출 한도(기본 DEFAULT_DAILY_UPSTREAM_LIMIT) — 테스트 주입용.
  dailyLimit?: number;
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

const toBadStationItems = (rows: RawAirBadStationRow[]): AirBadStationsResultType['items'] =>
  rows
    .filter((r) => !!r.stationName)
    .map((r) => ({
      stationName: r.stationName ?? '',
      addr: r.addr ?? '',
      sidoName: airSidoFromAddr(r.addr),
    }));

// ── 서비스 ──────────────────────────────────────────────────────────────────

export class AirQualityService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<Cached<unknown>>>();
  // Asia/Seoul 날짜 단위 업스트림 호출 카운터 — 단일 인스턴스 전제(메모리).
  private quota = { dateKey: '', count: 0 };

  constructor(private readonly deps: AirQualityServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private requireKey(): AirKoreaApiRequestOptions {
    if (!this.deps.serviceKey) {
      throw new AirQualityServiceError(
        'AIRKOREA_API_KEY(또는 BUS_API_KEY) 가 설정되지 않아 대기정보를 조회할 수 없습니다.',
        503,
      );
    }
    return { serviceKey: this.deps.serviceKey };
  }

  // 일일 업스트림 쿼터 소비 — 모든 오퍼레이션이 공유하는 단일 카운터. 초과 시 소비
  // 없이 503 throw — 캐시 레이어가 stale 폴백을 위해 catch 한다.
  private consumeQuota(now: Date, calls = 1): void {
    const dateKey = seoulDateKey(now);
    if (this.quota.dateKey !== dateKey) this.quota = { dateKey, count: 0 };
    if (this.quota.count + calls > (this.deps.dailyLimit ?? DEFAULT_DAILY_UPSTREAM_LIMIT)) {
      throw new AirQualityServiceError(
        '에어코리아 API 일일 호출 한도를 소진해 요청을 처리할 수 없습니다. 내일 다시 시도해주세요.',
        503,
      );
    }
    // 실패해도 호출 시도 자체가 한도를 소모하므로 호출 직전 증가.
    this.quota.count += calls;
  }

  // 키 1개 — TTL 내 히트는 fetchedAt 보존, 미스는 in-flight 합류(같은 키 동시 요청
  // 업스트림 1회). 업스트림 실패·쿼터 소진 시 staleMaxMs 내 last-known 을 stale 로.
  private cached<T>(
    key: string,
    ttlMs: number,
    staleMaxMs: number,
    load: (now: Date) => Promise<T>,
  ): Promise<Cached<T>> {
    const now = this.now();
    const hit = this.cache.get(key);
    if (hit && now.getTime() <= hit.expiresAt) {
      return Promise.resolve({ data: hit.data as T, fetchedAt: hit.fetchedAt, stale: false });
    }
    // 만료 엔트리는 지우지 않는다(stale 폴백 재료). stale 상한을 넘긴 엔트리만 청소.
    for (const [k, v] of this.cache) {
      if (now.getTime() - v.fetchedAt.getTime() > v.staleMaxMs) this.cache.delete(k);
    }
    const existing = this.inflight.get(key) as Promise<Cached<T>> | undefined;
    if (existing) return existing;

    const task = this.loadInto(key, now, ttlMs, staleMaxMs, load).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, task as Promise<Cached<unknown>>);
    return task;
  }

  private async loadInto<T>(
    key: string,
    now: Date,
    ttlMs: number,
    staleMaxMs: number,
    load: (now: Date) => Promise<T>,
  ): Promise<Cached<T>> {
    try {
      const data = await load(now);
      this.cache.set(key, {
        data,
        fetchedAt: now,
        expiresAt: now.getTime() + ttlMs,
        staleMaxMs,
      });
      return { data, fetchedAt: now, stale: false };
    } catch (e) {
      const lastKnown = this.cache.get(key);
      if (lastKnown && now.getTime() - lastKnown.fetchedAt.getTime() <= lastKnown.staleMaxMs) {
        return { data: lastKnown.data as T, fetchedAt: lastKnown.fetchedAt, stale: true };
      }
      throw e;
    }
  }

  // ── 시도별 실시간 측정정보 ───────────────────────────────────────────────
  // 업스트림 '전국' 1콜(673개소)을 캐시하고 요청 시도로 거른다 — 17개 시도 각각의
  // 캐시 미스 팬아웃을 막고(쿼터 17→1), 2026-07 광주·전남 통합 라벨('전남광주')과
  // 개별 '광주' 조회 타임아웃(실측)을 우회한다.
  async getSidoRealtime(sidoName: string): Promise<AirSidoRealtimeResultType> {
    const opts = this.requireKey();
    const fetchAll = this.deps.adapter?.getSidoRealtime ?? getSidoRealtime;
    const { data, fetchedAt, stale } = await this.cached(
      'sido:전국',
      AIR_MEASURE_TTL_MS,
      AIR_MEASURE_STALE_MAX_MS,
      async (now) => {
        this.consumeQuota(now);
        const { rows } = await fetchAll('전국', opts);
        return rows.map(toMeasureItem);
      },
    );
    const wanted = sidoName.trim();
    const items = data.filter((m) => airSidoMatches(m.sidoName, wanted));
    return { sidoName: wanted, items, total: items.length, fetchedAt: fetchedAt.toISOString(), stale };
  }

  // ── 측정소별 실시간 측정정보 ─────────────────────────────────────────────
  // DAILY 는 시간별 원본(최근 24시간), MONTH/3MONTH 는 일평균으로 접는다. latest 는
  // 가장 최근 시간 행(등급·플래그·측정망) — 상세 카드가 쓴다.
  async getStationHistory(
    stationName: string,
    term: AirHistoryTermType,
  ): Promise<AirStationHistoryResultType> {
    const opts = this.requireKey();
    const fetchStation = this.deps.adapter?.getStationRealtime ?? getStationRealtime;
    const name = stationName.trim().normalize('NFC');
    const dataTerm: AirKoreaDataTerm = term;
    const { data, fetchedAt, stale } = await this.cached(
      `station:${name}:${term}`,
      AIR_MEASURE_TTL_MS,
      AIR_MEASURE_STALE_MAX_MS,
      async (now) => {
        // 3MONTH 는 3페이지(≈2,200행) — 페이지 수만큼 쿼터 소비.
        this.consumeQuota(now, term === '3MONTH' ? 3 : 1);
        const { rows, totalCount } = await fetchStation(name, dataTerm, opts);
        const items = rows
          .map(toMeasureItem)
          // measuredAt 이 없는 행(시각 결측)은 시계열에 놓을 수 없어 제외.
          .filter((m) => m.measuredAt !== null)
          .sort((a, b) => cmp(a.measuredAt ?? '', b.measuredAt ?? ''));
        return { items, total: totalCount ?? rows.length };
      },
    );
    const latest = data.items.length > 0 ? (data.items[data.items.length - 1] ?? null) : null;
    const unit = term === 'DAILY' ? 'hour' : 'day';
    const points = unit === 'hour' ? data.items.map(toHourPoint) : foldDaily(data.items);
    return {
      stationName: name,
      term,
      unit,
      latest,
      points,
      total: data.total,
      fetchedAt: fetchedAt.toISOString(),
      stale,
    };
  }

  // ── 통합대기환경지수 나쁨 이상 측정소 ────────────────────────────────────
  async getBadStations(): Promise<AirBadStationsResultType> {
    const opts = this.requireKey();
    const fetchBad = this.deps.adapter?.getBadStations ?? getBadStations;
    const { data, fetchedAt, stale } = await this.cached(
      'bad-stations',
      AIR_MEASURE_TTL_MS,
      AIR_MEASURE_STALE_MAX_MS,
      async (now) => {
        this.consumeQuota(now);
        return toBadStationItems(await fetchBad(opts));
      },
    );
    return { items: data, total: data.length, fetchedAt: fetchedAt.toISOString(), stale };
  }

  // ── 대기질 예보통보 ─────────────────────────────────────────────────────
  // date 생략 시 KST 오늘 — 당일 발표분이 아직 없으면(05시 전) 전일 발표분으로 폴백
  // (전일 23시 발표가 오늘·내일을 담고 있다). 명시 date 는 폴백 없이 그 날짜만.
  async getForecast(date?: string): Promise<AirForecastResultType> {
    const opts = this.requireKey();
    const fetchForecast = this.deps.adapter?.getDustForecast ?? getDustForecast;
    const now = this.now();
    const today = date ?? seoulDateKey(now);
    const key = date ? `forecast:${date}` : `forecast:auto:${today}`;
    const { data, fetchedAt, stale } = await this.cached(
      key,
      AIR_FORECAST_TTL_MS,
      AIR_FORECAST_STALE_MAX_MS,
      async (at) => {
        this.consumeQuota(at);
        const rows = await fetchForecast(today, opts);
        if (rows.length > 0 || date) return { date: today, items: toForecastItems(rows) };
        const yesterday = seoulDateKey(new Date(at.getTime() - DAY_MS));
        this.consumeQuota(at);
        const prev = await fetchForecast(yesterday, opts);
        return { date: yesterday, items: toForecastItems(prev) };
      },
    );
    return { date: data.date, items: data.items, fetchedAt: fetchedAt.toISOString(), stale };
  }

  // ── 측정소 정보(측정소정보 API) ─────────────────────────────────────────
  // 전량 24시간 캐시 — 지도 마커·검색·내 주변의 단일 원천. 활용신청 전이면 503
  // (AirKoreaApiAuthError 30) — 라우트가 그대로 내려 FE 가 신청 안내를 띄운다.
  private loadStations(): Promise<Cached<AirStationInfoItemType[]>> {
    const opts = this.requireKey();
    const fetchList = this.deps.adapter?.getStationList ?? getStationList;
    return this.cached('stations', AIR_STATIONS_TTL_MS, AIR_STATIONS_STALE_MAX_MS, async (now) => {
      this.consumeQuota(now);
      const { rows } = await fetchList(opts);
      return rows.filter((r) => !!r.stationName).map(toStationInfoItem);
    });
  }

  async getStations(): Promise<AirStationsResultType> {
    const { data, fetchedAt, stale } = await this.loadStations();
    return { items: data, total: data.length, fetchedAt: fetchedAt.toISOString(), stale };
  }

  // 좌표 기반 내 주변 — 캐시된 목록에서 거리 계산(업스트림 0콜) + '전국' 실시간
  // 캐시와 측정소명으로 조인해 현재 값을 붙인다. 실시간이 실패해도 목록은 돌려준다
  // (measure null). 동명 측정소는 주소 시도 ↔ 측정 sidoName 매칭으로 고른다.
  async getNearbyStations(
    lat: number,
    lng: number,
    radiusM: number,
    limit: number,
  ): Promise<AirNearbyResultType> {
    const { data: stations, fetchedAt, stale } = await this.loadStations();
    let measures: AirMeasureItemType[] = [];
    try {
      measures = (await this.getSidoRealtime('전국')).items;
    } catch {
      // 측정값 조인은 부가 정보 — 실시간 장애가 '내 주변' 자체를 막지 않는다.
    }
    const byName = new Map<string, AirMeasureItemType[]>();
    for (const m of measures) {
      const list = byName.get(m.stationName);
      if (list) list.push(m);
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
  // 발표일 기준 1행. 오후 발표라 오전엔 당일분이 없다 → 전일로 폴백(명시 date 는 폴백 없음).
  async getWeeklyForecast(date?: string): Promise<AirWeeklyForecastResultType> {
    const opts = this.requireKey();
    const fetchWeekly = this.deps.adapter?.getWeeklyForecast ?? getWeeklyForecast;
    const now = this.now();
    const today = date ?? seoulDateKey(now);
    const key = date ? `weekly:${date}` : `weekly:auto:${today}`;
    const { data, fetchedAt, stale } = await this.cached(
      key,
      AIR_WEEKLY_TTL_MS,
      AIR_FORECAST_STALE_MAX_MS,
      async (at) => {
        this.consumeQuota(at);
        const rows = await fetchWeekly(today, opts);
        if (rows.length > 0 || date) return rows[0] ?? null;
        const yesterday = seoulDateKey(new Date(at.getTime() - DAY_MS));
        this.consumeQuota(at);
        const prev = await fetchWeekly(yesterday, opts);
        return prev[0] ?? null;
      },
    );
    return toWeeklyResult(data, fetchedAt, stale);
  }
}
