import type {
  WeatherBaseType,
  WeatherForecastDayType,
  WeatherForecastHourType,
  WeatherForecastResultType,
  WeatherHalfDayType,
  WeatherMidLandDayType,
  WeatherMidResultType,
  WeatherMidSeaDayType,
  WeatherMidSeaResultType,
  WeatherMidTaDayType,
  WeatherNowcastNowType,
  WeatherNowcastResultType,
  WeatherUltraHourType,
  WeatherVersionItemType,
  WeatherVersionsResultType,
} from '@repo/api-contract';
import {
  WEATHER_MID_LAND_REGIONS,
  WEATHER_MID_NATION_STN_ID,
  WEATHER_MID_SEA_REGIONS,
  WEATHER_PLACES,
  kmaBaseToIso,
  kmaFcstTimeToIso,
  kmaMidTmFc,
  kmaNextBaseAvailableAt,
  kmaNextMidTmFcAt,
  kmaPrevBase,
  kmaPrevMidTmFc,
  kmaTmFcToIso,
  kmaUltraFcstBase,
  kmaUltraNcstBase,
  kmaVilageBase,
  kmaYmdAddDays,
  parseKmaPrecipText,
  type KmaBase,
  type KmaBaseKind,
} from '@repo/utils';
import { LRUCache } from 'lru-cache';
import { intOrNull, numOrNull } from '../../lib/narrow.js';
import { DailyQuota, UpstreamCooldown, retryAfterSec } from '../../lib/upstream-guard.js';
import {
  KmaApiAuthError,
  KmaApiError,
  getFcstVersion,
  getMidFcst,
  getMidLandFcst,
  getMidSeaFcst,
  getMidTa,
  getUltraSrtFcst,
  getUltraSrtNcst,
  getVilageFcst,
  type KmaApiRequestOptions,
  type KmaFcstCall,
  type KmaMidCall,
  type RawKmaFcstRow,
  type RawKmaMidRow,
} from './kma-api.adapter.js';

// 기상청 날씨 프록시 서비스 — DB 없음. 키 단위 메모리 캐시(LRU, 바이트 상한) + in-flight 합류 + last-known
// stale 폴백 + 서비스별 일일 쿼터 + 실패 쿨다운(lib/upstream-guard, TTL 만 "다음 발표 시각까지" 로 동적).
// 단일 인스턴스 전제(CLAUDE.md) — 앱에 하나만 두고(plugins/weather.ts 의 app.weather) 날씨·식단 추천 라우트가
// 같은 캐시·쿼터를 쓴다(C-5: 인스턴스가 둘이면 쿼터 합계가 실한도를 넘었다).
//
// 발표 슬롯 규율: 기준 시각(base)은 서버가 KST 로 계산하고(@repo/utils), 새 슬롯이 아직
// 업스트림에 없으면(NO_DATA) 한 슬롯 이전으로 1회 폴백한다(fallback=true). 폴백 응답은
// 짧게(5분) 캐시해 새 슬롯이 올라오면 곧 갈아탄다. 정상 응답은 다음 슬롯 제공 시각까지
// 캐시 — 같은 격자를 아무리 여러 사람이 봐도 슬롯당 업스트림 1콜이다.

// 폴백/장애 시 짧은 TTL.
export const WEATHER_SHORT_TTL_MS = 5 * 60_000;
// 정상 TTL 하한(슬롯 경계 직전에 0 이 되지 않게).
const MIN_TTL_MS = 30_000;
// last-known 허용 — 실황/예보 3시간, 단기예보 6시간, 중기 24시간.
export const WEATHER_NOWCAST_STALE_MAX_MS = 3 * 60 * 60_000;
export const WEATHER_FORECAST_STALE_MAX_MS = 6 * 60 * 60_000;
export const WEATHER_MID_STALE_MAX_MS = 24 * 60 * 60_000;
// 캐시 상한(바이트 근사 = JSON 길이 × 2) — 단기예보 엔트리 ≈40KB 라 격자 3.7만 곳을 바꿔 가며 부르면 쿼터
// 범위 안에서만 ≈358MB 가 쌓였다(E-4). 정상 격자는 사용자 위치 수백 곳이라 32MB(단기 ≈800 + 실황) 안이다.
export const WEATHER_CACHE_MAX_BYTES = 32 * 1024 * 1024;
// 일일 쿼터 — 기존 두 서비스 합산 9,000 을 서비스별로 나눈다(E-4, 업스트림 한도도 서비스별 10,000). 정상
// 사용량은 단기(실황·초단기 격자당 시간 2콜 + 단기 발표 8회 + 버전)가 중기(화이트리스트 지점 ≈170곳 × 하루
// 발표 2회 × 2~3콜)의 열 배 안팎이라 7,500 / 1,500. 중기를 남용해도 단기(상단바 칩·추천 날씨)는 멈추지 않는다.
export const WEATHER_QUOTA_LIMITS = { vilage: 7_500, mid: 1_500 } as const;
export type WeatherQuotaBucket = keyof typeof WEATHER_QUOTA_LIMITS;
// 식단 추천의 날씨 대기 상한 — 캐시가 없을 때만 업스트림을 이만큼 기다리고 계절 추정으로 넘어간다(C-5).
export const WEATHER_ADVICE_WAIT_MS = 1_500;

// 중기 파라미터 화이트리스트(E-4) — utils 지점표(웹·앱이 고르는 값의 원천)에 있는 조합만 받는다. 형식만 맞는
// 가짜 구역코드는 업스트림까지 가서 요청당 6콜(NO_DATA 폴백 포함)을 썼다. 육상 구역 ↔ 기온 지점은 같은 지점
// 행의 짝이어야 하고, 전망 지점은 그 구역의 지점 또는 전국(108)만.
const MID_LAND_BY_ID = new Map(WEATHER_MID_LAND_REGIONS.map((r) => [r.regId, r]));
const MID_LAND_TA_PAIRS = new Set(WEATHER_PLACES.map((p) => `${p.landRegId}|${p.taRegId}`));
const MID_SEA_IDS = new Set(WEATHER_MID_SEA_REGIONS.map((r) => r.regId));

export const midQueryProblem = (land: string, ta: string, stn?: string): string | null => {
  const region = MID_LAND_BY_ID.get(land);
  if (!region) return `알 수 없는 중기육상예보 구역입니다(land=${land}).`;
  if (!MID_LAND_TA_PAIRS.has(`${land}|${ta}`)) {
    return `중기기온 지점(ta=${ta})이 구역(land=${land})에 속하지 않습니다.`;
  }
  if (stn !== undefined && stn !== region.stnId && stn !== WEATHER_MID_NATION_STN_ID) {
    return `중기전망 지점(stn=${stn})은 권역(${region.stnId}) 또는 전국(${WEATHER_MID_NATION_STN_ID})만 받습니다.`;
  }
  return null;
};

export const midSeaQueryProblem = (regId: string): string | null =>
  MID_SEA_IDS.has(regId) ? null : `알 수 없는 중기해상예보 해역입니다(regId=${regId}).`;

export class WeatherServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    opts: { cause?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'WeatherServiceError';
  }
}

export interface WeatherServiceDeps {
  serviceKey: string;
  adapter?: {
    getUltraSrtNcst?: typeof getUltraSrtNcst;
    getUltraSrtFcst?: typeof getUltraSrtFcst;
    getVilageFcst?: typeof getVilageFcst;
    getFcstVersion?: typeof getFcstVersion;
    getMidFcst?: typeof getMidFcst;
    getMidLandFcst?: typeof getMidLandFcst;
    getMidTa?: typeof getMidTa;
    getMidSeaFcst?: typeof getMidSeaFcst;
  };
  now?: () => Date;
  // 테스트 주입용 — 모든 버킷에 같은 한도(dailyLimits 가 버킷별로 우선).
  dailyLimit?: number;
  dailyLimits?: Partial<Record<WeatherQuotaBucket, number>>;
  // 테스트 주입용 — 캐시 바이트 상한(기본 WEATHER_CACHE_MAX_BYTES).
  cacheMaxBytes?: number;
}

interface CacheEntry {
  data: unknown;
  fetchedAt: Date;
  expiresAt: number;
  staleMaxMs: number;
  // 바이트 근사(LRU maxSize 계산용) — 넣을 때 한 번 잰다.
  bytes: number;
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

// ── 정규화 ──────────────────────────────────────────────────────────────────

const toBase = (base: KmaBase): WeatherBaseType => ({ date: base.date, time: base.time, at: kmaBaseToIso(base) });

const num = (v: string | null | undefined): number | null => (v === null || v === undefined || v === '-' ? null : numOrNull(v));
const int = (v: string | null | undefined): number | null => (v === null || v === undefined || v === '-' ? null : intOrNull(v));

// 실황 8항목 → now.
export const toNowcastNow = (rows: RawKmaFcstRow[]): WeatherNowcastNowType | null => {
  if (rows.length === 0) return null;
  const by = new Map<string, string | null>();
  for (const r of rows) if (r.category) by.set(r.category, r.obsrValue);
  return {
    t1h: num(by.get('T1H')),
    rn1: num(by.get('RN1')),
    reh: num(by.get('REH')),
    pty: int(by.get('PTY')),
    vec: num(by.get('VEC')),
    wsd: num(by.get('WSD')),
    uuu: num(by.get('UUU')),
    vvv: num(by.get('VVV')),
  };
};

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// 세로 행 → 시각별 가로 행. (fcstDate, fcstTime) 별 category→fcstValue 맵.
const pivotByTime = (rows: RawKmaFcstRow[]): Array<{ fcstDate: string; fcstTime: string; at: string; v: Map<string, string | null> }> => {
  const buckets = new Map<string, { fcstDate: string; fcstTime: string; at: string; v: Map<string, string | null> }>();
  for (const r of rows) {
    if (!r.fcstDate || !r.fcstTime || !r.category) continue;
    const at = kmaFcstTimeToIso(r.fcstDate, r.fcstTime);
    if (!at) continue;
    const key = `${r.fcstDate}${r.fcstTime}`;
    let b = buckets.get(key);
    if (!b) {
      b = { fcstDate: r.fcstDate, fcstTime: r.fcstTime, at, v: new Map() };
      buckets.set(key, b);
    }
    b.v.set(r.category, r.fcstValue);
  }
  return [...buckets.values()].sort((a, b) => cmp(a.at, b.at));
};

// 초단기예보 11항목 × 6시각.
export const toUltraHours = (rows: RawKmaFcstRow[]): WeatherUltraHourType[] =>
  pivotByTime(rows).map((b) => ({
    fcstDate: b.fcstDate,
    fcstTime: b.fcstTime,
    at: b.at,
    t1h: num(b.v.get('T1H')),
    rn1: parseKmaPrecipText(b.v.get('RN1')),
    sky: int(b.v.get('SKY')),
    pty: int(b.v.get('PTY')),
    pop: num(b.v.get('POP')),
    reh: num(b.v.get('REH')),
    wsd: num(b.v.get('WSD')),
    vec: num(b.v.get('VEC')),
    uuu: num(b.v.get('UUU')),
    vvv: num(b.v.get('VVV')),
    lgt: num(b.v.get('LGT')),
  }));

// 단기예보 14항목 × ~70시각.
export const toForecastHours = (rows: RawKmaFcstRow[]): WeatherForecastHourType[] =>
  pivotByTime(rows).map((b) => ({
    fcstDate: b.fcstDate,
    fcstTime: b.fcstTime,
    at: b.at,
    tmp: num(b.v.get('TMP')),
    tmn: num(b.v.get('TMN')),
    tmx: num(b.v.get('TMX')),
    sky: int(b.v.get('SKY')),
    pty: int(b.v.get('PTY')),
    pop: num(b.v.get('POP')),
    pcp: parseKmaPrecipText(b.v.get('PCP')),
    sno: parseKmaPrecipText(b.v.get('SNO')),
    reh: num(b.v.get('REH')),
    wsd: num(b.v.get('WSD')),
    vec: num(b.v.get('VEC')),
    uuu: num(b.v.get('UUU')),
    vvv: num(b.v.get('VVV')),
    wav: num(b.v.get('WAV')),
  }));

// 반나절 대표 — 강수형태는 0 이 아닌 값 중 최빈(동률이면 먼저 나온 것), 하늘은 가장 흐린
// 값(4 > 3 > 1), 강수확률은 최대.
const foldHalf = (hours: WeatherForecastHourType[]): WeatherHalfDayType | null => {
  if (hours.length === 0) return null;
  const ptyCount = new Map<number, number>();
  let sky: number | null = null;
  let pop: number | null = null;
  for (const h of hours) {
    if (h.pty !== null && h.pty > 0) ptyCount.set(h.pty, (ptyCount.get(h.pty) ?? 0) + 1);
    if (h.sky !== null && (sky === null || h.sky > sky)) sky = h.sky;
    if (h.pop !== null && (pop === null || h.pop > pop)) pop = h.pop;
  }
  let pty: number | null = hours.some((h) => h.pty !== null) ? 0 : null;
  let best = 0;
  for (const [k, c] of ptyCount) {
    if (c > best) {
      best = c;
      pty = k;
    }
  }
  return { sky, pty, pop, hours: hours.length };
};

// 시각 행 → 일별 요약. 마지막 날이 "00시 한 칸"뿐이면(전날 24시의 표기) 일별에서는 뺀다.
export const foldForecastDays = (hours: WeatherForecastHourType[]): WeatherForecastDayType[] => {
  const byDate = new Map<string, WeatherForecastHourType[]>();
  for (const h of hours) {
    const list = byDate.get(h.fcstDate);
    if (list) list.push(h);
    else byDate.set(h.fcstDate, [h]);
  }
  const days: WeatherForecastDayType[] = [];
  for (const [ymd, list] of [...byDate.entries()].sort(([a], [b]) => cmp(a, b))) {
    const date = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    const tmnRow = list.find((h) => h.tmn !== null);
    const tmxRow = list.find((h) => h.tmx !== null);
    const temps = list.map((h) => h.tmp).filter((v): v is number => v !== null);
    const tmn = tmnRow?.tmn ?? (temps.length > 0 ? Math.min(...temps) : null);
    const tmx = tmxRow?.tmx ?? (temps.length > 0 ? Math.max(...temps) : null);
    const pops = list.map((h) => h.pop).filter((v): v is number => v !== null);
    const am = list.filter((h) => Number(h.fcstTime.slice(0, 2)) < 12);
    const pm = list.filter((h) => Number(h.fcstTime.slice(0, 2)) >= 12);
    days.push({
      date,
      tmn,
      tmx,
      tmnFromHours: tmnRow === undefined && tmn !== null,
      tmxFromHours: tmxRow === undefined && tmx !== null,
      popMax: pops.length > 0 ? Math.max(...pops) : null,
      am: foldHalf(am),
      pm: foldHalf(pm),
      partial: list.length < 24,
      hours: list.length,
    });
  }
  const last = days[days.length - 1];
  if (days.length > 1 && last && last.hours === 1) {
    const only = byDate.get(last.date.replace(/-/g, ''))?.[0];
    if (only && only.fcstTime === '0000') days.pop();
  }
  return days;
};

// ── 중기 접기 ────────────────────────────────────────────────────────────────

const fStr = (f: Record<string, string | number | null>, k: string): string | null => {
  const v = f[k];
  return v === undefined || v === null ? null : String(v);
};
const fNum = (f: Record<string, string | number | null>, k: string): number | null => {
  const v = f[k];
  if (v === undefined || v === null) return null;
  return typeof v === 'number' ? v : numOrNull(v);
};
const MID_DAYS = [3, 4, 5, 6, 7, 8, 9, 10] as const;

export const toMidLandDays = (row: RawKmaMidRow, tmFcDate: string): WeatherMidLandDayType[] => {
  const out: WeatherMidLandDayType[] = [];
  for (const d of MID_DAYS) {
    const f = row.fields;
    const hasAm = `wf${d}Am` in f || `rnSt${d}Am` in f;
    const hasAll = `wf${d}` in f || `rnSt${d}` in f;
    if (!hasAm && !hasAll) continue;
    out.push({
      day: d,
      date: kmaYmdAddDays(tmFcDate, d),
      am: hasAm ? { wf: fStr(f, `wf${d}Am`), rnSt: fNum(f, `rnSt${d}Am`) } : null,
      pm: hasAm ? { wf: fStr(f, `wf${d}Pm`), rnSt: fNum(f, `rnSt${d}Pm`) } : null,
      all: hasAll ? { wf: fStr(f, `wf${d}`), rnSt: fNum(f, `rnSt${d}`) } : null,
    });
  }
  return out;
};

export const toMidTaDays = (row: RawKmaMidRow, tmFcDate: string): WeatherMidTaDayType[] => {
  const out: WeatherMidTaDayType[] = [];
  for (const d of MID_DAYS) {
    const f = row.fields;
    if (!(`taMin${d}` in f) && !(`taMax${d}` in f)) continue;
    out.push({
      day: d,
      date: kmaYmdAddDays(tmFcDate, d),
      taMin: fNum(f, `taMin${d}`),
      taMinLow: fNum(f, `taMin${d}Low`),
      taMinHigh: fNum(f, `taMin${d}High`),
      taMax: fNum(f, `taMax${d}`),
      taMaxLow: fNum(f, `taMax${d}Low`),
      taMaxHigh: fNum(f, `taMax${d}High`),
    });
  }
  return out;
};

export const toMidSeaDays = (row: RawKmaMidRow, tmFcDate: string): WeatherMidSeaDayType[] => {
  const out: WeatherMidSeaDayType[] = [];
  for (const d of MID_DAYS) {
    const f = row.fields;
    const hasAm = `wf${d}Am` in f || `wh${d}AAm` in f;
    const hasAll = `wf${d}` in f || `wh${d}A` in f;
    if (!hasAm && !hasAll) continue;
    out.push({
      day: d,
      date: kmaYmdAddDays(tmFcDate, d),
      am: hasAm ? { wf: fStr(f, `wf${d}Am`), whMin: fNum(f, `wh${d}AAm`), whMax: fNum(f, `wh${d}BAm`) } : null,
      pm: hasAm ? { wf: fStr(f, `wf${d}Pm`), whMin: fNum(f, `wh${d}APm`), whMax: fNum(f, `wh${d}BPm`) } : null,
      all: hasAll ? { wf: fStr(f, `wf${d}`), whMin: fNum(f, `wh${d}A`), whMax: fNum(f, `wh${d}B`) } : null,
    });
  }
  return out;
};

// 응답 행이 스스로 밝힌 발표 기준(baseDate/baseTime) — 요청한 base 와 같아야 정상이지만
// 데이터의 자기 표기를 우선한다(테스트·진단에서도 요청 시각이 아니라 자료 시각을 본다).
const rowBase = (rows: RawKmaFcstRow[]): KmaBase | null => {
  const r = rows[0];
  return r?.baseDate && r.baseTime && /^\d{8}$/.test(r.baseDate) && /^\d{4}$/.test(r.baseTime)
    ? { date: r.baseDate, time: r.baseTime }
    : null;
};

// "YYYYMMDDHHmmss" → ISO(+09:00).
const versionToIso = (v: string | null): string | null => {
  if (!v || !/^\d{14}$/.test(v)) return null;
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(8, 10)}:${v.slice(10, 12)}:${v.slice(12, 14)}+09:00`;
};

// ── 서비스 ──────────────────────────────────────────────────────────────────

type WeatherUpstream = WeatherQuotaBucket;
type NowcastData = Omit<WeatherNowcastResultType, 'fetchedAt' | 'stale'>;
const nowcastKey = (nx: number, ny: number): string => `nowcast:${nx},${ny}`;

// stale 상한을 넘긴 엔트리 청소 — 만료 엔트리는 last-known 재료라 남기고, 상한을 넘긴 것만 지운다.
const sweepStale = (cache: LRUCache<string, CacheEntry>, nowMs: number): void => {
  const dead: string[] = [];
  for (const [k, v] of cache.entries()) {
    if (nowMs - v.fetchedAt.getTime() > v.staleMaxMs) dead.push(k);
  }
  for (const k of dead) cache.delete(k);
};

export class WeatherService {
  private readonly cache: LRUCache<string, CacheEntry>;
  private readonly inflight = new Map<string, Promise<Cached<unknown>>>();
  private readonly quota: DailyQuota<WeatherQuotaBucket>;
  private readonly cooldown = new UpstreamCooldown();

  constructor(private readonly deps: WeatherServiceDeps) {
    this.cache = new LRUCache<string, CacheEntry>({
      maxSize: deps.cacheMaxBytes ?? WEATHER_CACHE_MAX_BYTES,
      sizeCalculation: (e) => Math.max(1, e.bytes),
    });
    const limits = {} as Record<WeatherQuotaBucket, number>;
    for (const b of Object.keys(WEATHER_QUOTA_LIMITS) as WeatherQuotaBucket[]) {
      limits[b] = deps.dailyLimits?.[b] ?? deps.dailyLimit ?? WEATHER_QUOTA_LIMITS[b];
    }
    this.quota = new DailyQuota(
      limits,
      () =>
        new WeatherServiceError(
          '기상청 API 일일 호출 한도를 소진해 요청을 처리할 수 없습니다. 내일 다시 시도해주세요.',
          503,
        ),
    );
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private requireKey(): KmaApiRequestOptions {
    if (!this.deps.serviceKey) {
      throw new WeatherServiceError('DATA_GO_KR_API_KEY 가 설정되지 않아 날씨를 조회할 수 없습니다.', 503);
    }
    return { serviceKey: this.deps.serviceKey };
  }

  // 버킷에서 calls 만큼 확보(초과 시 소비 없이 503 throw — 캐시 레이어가 stale 폴백)하고, 어댑터의 재시도도
  // 같은 버킷에 세는 요청 옵션을 돌려준다.
  private take(bucket: WeatherQuotaBucket, now: Date, calls = 1): KmaApiRequestOptions {
    const opts = this.requireKey();
    this.quota.consume(bucket, now, calls);
    return { ...opts, onRetry: () => this.quota.record(bucket, now) };
  }

  // 키 1개 — TTL 내 히트 / in-flight 합류 / 실패·쿨다운 시 staleMaxMs 내 last-known 을 stale 로(없으면 에러,
  // 쿨다운은 503). TTL 은 로더가 결과와 함께 정한다(다음 발표 시각까지, 폴백이면 짧게).
  private cached<T>(
    key: string,
    upstream: WeatherUpstream,
    staleMaxMs: number,
    load: (now: Date) => Promise<Loaded<T>>,
  ): Promise<Cached<T>> {
    const now = this.now();
    const nowMs = now.getTime();
    const hit = this.cache.get(key);
    if (hit && nowMs <= hit.expiresAt) {
      return Promise.resolve({ data: hit.data as T, fetchedAt: hit.fetchedAt, stale: false });
    }
    const existing = this.inflight.get(key) as Promise<Cached<T>> | undefined;
    if (existing) return existing;
    sweepStale(this.cache, nowMs);

    // 실패 쿨다운 — 업스트림·쿼터 없이 last-known 이나 503(E-V2).
    const blockedUntil = this.cooldown.blockedUntil(upstream, key, nowMs);
    if (blockedUntil !== null) {
      const lastKnown = this.cache.get(key);
      if (lastKnown) {
        return Promise.resolve({ data: lastKnown.data as T, fetchedAt: lastKnown.fetchedAt, stale: true });
      }
      return Promise.reject(
        new WeatherServiceError(
          `기상청 API 가 응답하지 않아 잠시 조회를 멈췄습니다. ${retryAfterSec(blockedUntil, nowMs)}초 뒤 다시 시도해 주세요.`,
          503,
        ),
      );
    }

    const task = this.loadInto(key, upstream, now, staleMaxMs, load).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, task as Promise<Cached<unknown>>);
    return task;
  }

  private async loadInto<T>(
    key: string,
    upstream: WeatherUpstream,
    now: Date,
    staleMaxMs: number,
    load: (now: Date) => Promise<Loaded<T>>,
  ): Promise<Cached<T>> {
    const nowMs = now.getTime();
    try {
      const { data, ttlMs } = await load(now);
      this.cooldown.success(upstream, key);
      this.cache.set(key, {
        data,
        fetchedAt: now,
        expiresAt: nowMs + Math.max(MIN_TTL_MS, ttlMs),
        staleMaxMs,
        bytes: JSON.stringify(data).length * 2,
      });
      return { data, fetchedAt: now, stale: false };
    } catch (e) {
      // 업스트림 실패만 쿨다운 — 쿼터 소진(우리 카운터)은 업스트림 탓이 아니다. 인증·일일한도(게이트웨이
      // 20~33)는 어떤 키로 불러도 같은 답이라 그 서비스 전체를 막는다.
      if (e instanceof KmaApiError) {
        this.cooldown.failure(upstream, key, nowMs, e instanceof KmaApiAuthError);
      }
      const lastKnown = this.cache.get(key);
      if (lastKnown && nowMs - lastKnown.fetchedAt.getTime() <= lastKnown.staleMaxMs) {
        return { data: lastKnown.data as T, fetchedAt: lastKnown.fetchedAt, stale: true };
      }
      throw e;
    }
  }

  // 슬롯 호출 + NO_DATA 1회 폴백. 결과가 비어도(둘 다 NO_DATA) 에러가 아니라 빈 행.
  private async fetchWithFallback(
    kind: KmaBaseKind,
    base: KmaBase,
    nx: number,
    ny: number,
    now: Date,
    fetchRows: (
      p: { baseDate: string; baseTime: string; nx: number; ny: number },
      opts: KmaApiRequestOptions,
    ) => Promise<KmaFcstCall>,
  ): Promise<{ base: KmaBase; rows: RawKmaFcstRow[]; fallback: boolean; noData: boolean }> {
    const first = await fetchRows({ baseDate: base.date, baseTime: base.time, nx, ny }, this.take('vilage', now));
    if (!first.noData || first.rows.length > 0) {
      return { base: rowBase(first.rows) ?? base, rows: first.rows, fallback: false, noData: false };
    }
    const prev = kmaPrevBase(kind, base);
    const second = await fetchRows({ baseDate: prev.date, baseTime: prev.time, nx, ny }, this.take('vilage', now));
    return {
      base: rowBase(second.rows) ?? prev,
      rows: second.rows,
      fallback: true,
      noData: second.noData && second.rows.length === 0,
    };
  }

  // ── 초단기실황 + 초단기예보 ────────────────────────────────────────────────
  async getNowcast(nx: number, ny: number): Promise<WeatherNowcastResultType> {
    this.requireKey();
    const fetchNcst = this.deps.adapter?.getUltraSrtNcst ?? getUltraSrtNcst;
    const fetchUltra = this.deps.adapter?.getUltraSrtFcst ?? getUltraSrtFcst;
    const { data, fetchedAt, stale } = await this.cached<NowcastData>(
      nowcastKey(nx, ny),
      'vilage',
      WEATHER_NOWCAST_STALE_MAX_MS,
      async (now) => {
        const [ncst, ultra] = await Promise.all([
          this.fetchWithFallback('ncst', kmaUltraNcstBase(now), nx, ny, now, (p, o) => fetchNcst(p, o)),
          this.fetchWithFallback('ultra', kmaUltraFcstBase(now), nx, ny, now, (p, o) => fetchUltra(p, o)),
        ]);
        const nextAt = Math.min(kmaNextBaseAvailableAt('ncst', now).getTime(), kmaNextBaseAvailableAt('ultra', now).getTime());
        const normalTtl = nextAt - now.getTime();
        const ttlMs = ncst.fallback || ultra.fallback || ncst.noData || ultra.noData ? Math.min(normalTtl, WEATHER_SHORT_TTL_MS) : normalTtl;
        return {
          data: {
            grid: { nx, ny },
            ncstBase: ncst.noData ? null : toBase(ncst.base),
            now: ncst.noData ? null : toNowcastNow(ncst.rows),
            ultraBase: ultra.noData ? null : toBase(ultra.base),
            hours: toUltraHours(ultra.rows),
            ncstFallback: ncst.fallback,
            ultraFallback: ultra.fallback,
          },
          ttlMs,
        };
      },
    );
    return { ...data, fetchedAt: fetchedAt.toISOString(), stale };
  }

  // 업스트림을 부르지 않는 실황 조회 — 캐시(만료돼도 stale 상한 안)만 본다. 없으면 null. 만료분은 stale:true.
  peekNowcast(nx: number, ny: number): WeatherNowcastResultType | null {
    const hit = this.cache.get(nowcastKey(nx, ny));
    if (!hit) return null;
    const nowMs = this.now().getTime();
    if (nowMs - hit.fetchedAt.getTime() > hit.staleMaxMs) return null;
    return { ...(hit.data as NowcastData), fetchedAt: hit.fetchedAt.toISOString(), stale: nowMs > hit.expiresAt };
  }

  // 선택 보강용(식단 추천) — 캐시가 있으면 즉시, 없으면 업스트림을 waitMs 까지만 기다리고 null. 기다림을 넘긴
  // 호출은 끊지 않고 캐시를 채우게 둔다(다음 요청부터 즉시). 실패·키 없음·쿼터 소진도 null — 추천은 날씨 없이도
  // 계절 추정으로 나온다(C-5: 예전엔 캐시 히트 추천도 업스트림을 기다렸고, 그 대기가 사용자 쓰기 장벽 안이었다).
  async nowcastForAdvice(nx: number, ny: number, waitMs = WEATHER_ADVICE_WAIT_MS): Promise<WeatherNowcastResultType | null> {
    const peeked = this.peekNowcast(nx, ny);
    if (peeked) return peeked;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fetched = this.getNowcast(nx, ny).catch(() => null);
    const waited = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), waitMs);
    });
    try {
      return await Promise.race([fetched, waited]);
    } finally {
      clearTimeout(timer);
    }
  }

  // ── 단기예보 ─────────────────────────────────────────────────────────────
  async getForecast(nx: number, ny: number): Promise<WeatherForecastResultType> {
    this.requireKey();
    const fetchVilage = this.deps.adapter?.getVilageFcst ?? getVilageFcst;
    const { data, fetchedAt, stale } = await this.cached(
      `forecast:${nx},${ny}`,
      'vilage',
      WEATHER_FORECAST_STALE_MAX_MS,
      async (now) => {
        const res = await this.fetchWithFallback('vilage', kmaVilageBase(now), nx, ny, now, (p, o) => fetchVilage(p, o));
        const hours = toForecastHours(res.rows);
        const normalTtl = kmaNextBaseAvailableAt('vilage', now).getTime() - now.getTime();
        return {
          data: {
            grid: { nx, ny },
            base: res.noData ? null : toBase(res.base),
            fallback: res.fallback,
            hours,
            days: foldForecastDays(hours),
            total: res.rows.length,
          },
          ttlMs: res.fallback || res.noData ? Math.min(normalTtl, WEATHER_SHORT_TTL_MS) : normalTtl,
        };
      },
    );
    return { ...data, fetchedAt: fetchedAt.toISOString(), stale };
  }

  // ── 예보 버전 ────────────────────────────────────────────────────────────
  async getVersions(): Promise<WeatherVersionsResultType> {
    this.requireKey();
    const fetchVersion = this.deps.adapter?.getFcstVersion ?? getFcstVersion;
    const { data, fetchedAt, stale } = await this.cached('versions', 'vilage', WEATHER_NOWCAST_STALE_MAX_MS, async (now) => {
      const bases: Array<{ ftype: 'ODAM' | 'VSRT' | 'SHRT'; label: string; base: KmaBase; kind: KmaBaseKind }> = [
        { ftype: 'ODAM', label: '초단기실황', base: kmaUltraNcstBase(now), kind: 'ncst' },
        { ftype: 'VSRT', label: '초단기예보', base: kmaUltraFcstBase(now), kind: 'ultra' },
        { ftype: 'SHRT', label: '단기예보', base: kmaVilageBase(now), kind: 'vilage' },
      ];
      const opts = this.take('vilage', now, bases.length);
      const items: WeatherVersionItemType[] = await Promise.all(
        bases.map(async (b) => {
          const rows = await fetchVersion(b.ftype, `${b.base.date}${b.base.time}`, opts);
          const version = rows[0]?.version ?? null;
          return { ftype: b.ftype, label: b.label, base: toBase(b.base), version, versionAt: versionToIso(version) };
        }),
      );
      const nextAt = Math.min(...bases.map((b) => kmaNextBaseAvailableAt(b.kind, now).getTime()));
      return { data: { items }, ttlMs: nextAt - now.getTime() };
    });
    return { items: data.items, fetchedAt: fetchedAt.toISOString(), stale };
  }

  // 중기 계열 — tmFc 슬롯 호출 + NO_DATA 1회 폴백(전 발표분).
  private async fetchMidWithFallback<R>(
    now: Date,
    calls: number,
    fetchAt: (tmFc: string, opts: KmaApiRequestOptions) => Promise<R>,
    isEmpty: (results: R) => boolean,
  ): Promise<{ tmFc: string; results: R; fallback: boolean }> {
    const tmFc = kmaMidTmFc(now);
    const first = await fetchAt(tmFc, this.take('mid', now, calls));
    if (!isEmpty(first)) return { tmFc, results: first, fallback: false };
    const prev = kmaPrevMidTmFc(tmFc);
    const second = await fetchAt(prev, this.take('mid', now, calls));
    return { tmFc: prev, results: second, fallback: true };
  }

  // ── 중기육상 + 중기기온 + 중기전망 ───────────────────────────────────────
  // 파라미터는 utils 지점표 화이트리스트(midQueryProblem) — 가짜 구역은 400, 업스트림·쿼터 0.
  async getMid(land: string, ta: string, stn?: string): Promise<WeatherMidResultType> {
    this.requireKey();
    const problem = midQueryProblem(land, ta, stn);
    if (problem) throw new WeatherServiceError(problem, 400);
    const fetchLand = this.deps.adapter?.getMidLandFcst ?? getMidLandFcst;
    const fetchTa = this.deps.adapter?.getMidTa ?? getMidTa;
    const fetchOutlook = this.deps.adapter?.getMidFcst ?? getMidFcst;
    const { data, fetchedAt, stale } = await this.cached(`mid:${land}:${ta}:${stn ?? '-'}`, 'mid', WEATHER_MID_STALE_MAX_MS, async (now) => {
      const { tmFc, results, fallback } = await this.fetchMidWithFallback(
        now,
        stn ? 3 : 2,
        (at, opts) =>
          Promise.all([
            fetchLand(land, at, opts),
            fetchTa(ta, at, opts),
            stn ? fetchOutlook(stn, at, opts) : Promise.resolve<KmaMidCall>({ rows: [], noData: true }),
          ]),
        // 육상·기온 둘 다 비었을 때만 이전 발표분으로(전망만 비는 일은 전망 없음으로 둔다).
        ([l, t]) => l.rows.length === 0 && t.rows.length === 0,
      );
      const [landRes, taRes, outlookRes] = results;
      const tmFcDate = tmFc.slice(0, 8);
      const landRow = landRes.rows[0] ?? null;
      const taRow = taRes.rows[0] ?? null;
      const outlookText = outlookRes.rows[0] ? fStr(outlookRes.rows[0].fields, 'wfSv') : null;
      const normalTtl = kmaNextMidTmFcAt(now).getTime() - now.getTime();
      const empty = !landRow && !taRow;
      return {
        data: {
          tmFc,
          announcedAt: kmaTmFcToIso(tmFc),
          fallback,
          land: landRow ? { regId: landRow.regId ?? land, days: toMidLandDays(landRow, tmFcDate) } : null,
          ta: taRow ? { regId: taRow.regId ?? ta, days: toMidTaDays(taRow, tmFcDate) } : null,
          outlook: stn && outlookText ? { stnId: stn, text: outlookText } : null,
        },
        ttlMs: fallback || empty ? Math.min(normalTtl, WEATHER_SHORT_TTL_MS) : normalTtl,
      };
    });
    return { ...data, fetchedAt: fetchedAt.toISOString(), stale };
  }

  // ── 중기해상 ─────────────────────────────────────────────────────────────
  async getMidSea(regId: string): Promise<WeatherMidSeaResultType> {
    this.requireKey();
    const problem = midSeaQueryProblem(regId);
    if (problem) throw new WeatherServiceError(problem, 400);
    const fetchSea = this.deps.adapter?.getMidSeaFcst ?? getMidSeaFcst;
    const { data, fetchedAt, stale } = await this.cached(`mid-sea:${regId}`, 'mid', WEATHER_MID_STALE_MAX_MS, async (now) => {
      const { tmFc, results, fallback } = await this.fetchMidWithFallback(
        now,
        1,
        (at, opts) => fetchSea(regId, at, opts),
        (r) => r.rows.length === 0,
      );
      const row = results.rows[0] ?? null;
      const normalTtl = kmaNextMidTmFcAt(now).getTime() - now.getTime();
      return {
        data: {
          tmFc,
          announcedAt: kmaTmFcToIso(tmFc),
          fallback,
          regId: row?.regId ?? regId,
          days: row ? toMidSeaDays(row, tmFc.slice(0, 8)) : [],
        },
        ttlMs: fallback || !row ? Math.min(normalTtl, WEATHER_SHORT_TTL_MS) : normalTtl,
      };
    });
    return { ...data, fetchedAt: fetchedAt.toISOString(), stale };
  }

  // 측정·진단용 — 버킷별 오늘 사용량, 캐시 크기(시뮬레이션·테스트).
  quotaUsed(bucket: WeatherQuotaBucket): number {
    return this.quota.used(bucket, this.now());
  }

  cacheStats(): { entries: number; bytes: number } {
    return { entries: this.cache.size, bytes: this.cache.calculatedSize };
  }
}

