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
import { intOrNull, numOrNull } from '../../lib/narrow.js';
import {
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

// 기상청 날씨 프록시 서비스 — DB 없음. 키 단위 메모리 캐시 + in-flight 합류 + last-known
// stale 폴백 + 일일 쿼터 카운터(에어코리아 서비스의 골격을 그대로, TTL 만 "다음 발표
// 시각까지" 로 동적). 단일 인스턴스 전제(CLAUDE.md).
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
// 기상청 개발계정 일 10,000건(서비스별) — 여유를 둔 9,000 을 두 서비스 합산으로 센다.
export const DEFAULT_DAILY_UPSTREAM_LIMIT = 9000;

const SEOUL_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const seoulDateKey = (d: Date): string => SEOUL_DATE_FMT.format(d);

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

export class WeatherService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<Cached<unknown>>>();
  private quota = { dateKey: '', count: 0 };

  constructor(private readonly deps: WeatherServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private requireKey(): KmaApiRequestOptions {
    if (!this.deps.serviceKey) {
      throw new WeatherServiceError('DATA_GO_KR_API_KEY 가 설정되지 않아 날씨를 조회할 수 없습니다.', 503);
    }
    return { serviceKey: this.deps.serviceKey };
  }

  private consumeQuota(now: Date, calls = 1): void {
    const dateKey = seoulDateKey(now);
    if (this.quota.dateKey !== dateKey) this.quota = { dateKey, count: 0 };
    if (this.quota.count + calls > (this.deps.dailyLimit ?? DEFAULT_DAILY_UPSTREAM_LIMIT)) {
      throw new WeatherServiceError('기상청 API 일일 호출 한도를 소진해 요청을 처리할 수 없습니다. 내일 다시 시도해주세요.', 503);
    }
    this.quota.count += calls;
  }

  // 키 1개 — TTL 내 히트 / in-flight 합류 / 실패 시 staleMaxMs 내 last-known 을 stale 로.
  // TTL 은 로더가 결과와 함께 정한다(다음 발표 시각까지, 폴백이면 짧게).
  private cached<T>(key: string, staleMaxMs: number, load: (now: Date) => Promise<Loaded<T>>): Promise<Cached<T>> {
    const now = this.now();
    const hit = this.cache.get(key);
    if (hit && now.getTime() <= hit.expiresAt) {
      return Promise.resolve({ data: hit.data as T, fetchedAt: hit.fetchedAt, stale: false });
    }
    for (const [k, v] of this.cache) {
      if (now.getTime() - v.fetchedAt.getTime() > v.staleMaxMs) this.cache.delete(k);
    }
    const existing = this.inflight.get(key) as Promise<Cached<T>> | undefined;
    if (existing) return existing;
    const task = this.loadInto(key, now, staleMaxMs, load).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, task as Promise<Cached<unknown>>);
    return task;
  }

  private async loadInto<T>(key: string, now: Date, staleMaxMs: number, load: (now: Date) => Promise<Loaded<T>>): Promise<Cached<T>> {
    try {
      const { data, ttlMs } = await load(now);
      this.cache.set(key, { data, fetchedAt: now, expiresAt: now.getTime() + Math.max(MIN_TTL_MS, ttlMs), staleMaxMs });
      return { data, fetchedAt: now, stale: false };
    } catch (e) {
      const lastKnown = this.cache.get(key);
      if (lastKnown && now.getTime() - lastKnown.fetchedAt.getTime() <= lastKnown.staleMaxMs) {
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
    fetchRows: (p: { baseDate: string; baseTime: string; nx: number; ny: number }) => Promise<KmaFcstCall>,
  ): Promise<{ base: KmaBase; rows: RawKmaFcstRow[]; fallback: boolean; noData: boolean }> {
    this.consumeQuota(now);
    const first = await fetchRows({ baseDate: base.date, baseTime: base.time, nx, ny });
    if (!first.noData || first.rows.length > 0) {
      return { base: rowBase(first.rows) ?? base, rows: first.rows, fallback: false, noData: false };
    }
    const prev = kmaPrevBase(kind, base);
    this.consumeQuota(now);
    const second = await fetchRows({ baseDate: prev.date, baseTime: prev.time, nx, ny });
    return {
      base: rowBase(second.rows) ?? prev,
      rows: second.rows,
      fallback: true,
      noData: second.noData && second.rows.length === 0,
    };
  }

  // ── 초단기실황 + 초단기예보 ────────────────────────────────────────────────
  async getNowcast(nx: number, ny: number): Promise<WeatherNowcastResultType> {
    const opts = this.requireKey();
    const fetchNcst = this.deps.adapter?.getUltraSrtNcst ?? getUltraSrtNcst;
    const fetchUltra = this.deps.adapter?.getUltraSrtFcst ?? getUltraSrtFcst;
    const { data, fetchedAt, stale } = await this.cached(
      `nowcast:${nx},${ny}`,
      WEATHER_NOWCAST_STALE_MAX_MS,
      async (now) => {
        const [ncst, ultra] = await Promise.all([
          this.fetchWithFallback('ncst', kmaUltraNcstBase(now), nx, ny, now, (p) => fetchNcst(p, opts)),
          this.fetchWithFallback('ultra', kmaUltraFcstBase(now), nx, ny, now, (p) => fetchUltra(p, opts)),
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

  // ── 단기예보 ─────────────────────────────────────────────────────────────
  async getForecast(nx: number, ny: number): Promise<WeatherForecastResultType> {
    const opts = this.requireKey();
    const fetchVilage = this.deps.adapter?.getVilageFcst ?? getVilageFcst;
    const { data, fetchedAt, stale } = await this.cached(
      `forecast:${nx},${ny}`,
      WEATHER_FORECAST_STALE_MAX_MS,
      async (now) => {
        const res = await this.fetchWithFallback('vilage', kmaVilageBase(now), nx, ny, now, (p) => fetchVilage(p, opts));
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
    const opts = this.requireKey();
    const fetchVersion = this.deps.adapter?.getFcstVersion ?? getFcstVersion;
    const { data, fetchedAt, stale } = await this.cached('versions', WEATHER_NOWCAST_STALE_MAX_MS, async (now) => {
      const bases: Array<{ ftype: 'ODAM' | 'VSRT' | 'SHRT'; label: string; base: KmaBase; kind: KmaBaseKind }> = [
        { ftype: 'ODAM', label: '초단기실황', base: kmaUltraNcstBase(now), kind: 'ncst' },
        { ftype: 'VSRT', label: '초단기예보', base: kmaUltraFcstBase(now), kind: 'ultra' },
        { ftype: 'SHRT', label: '단기예보', base: kmaVilageBase(now), kind: 'vilage' },
      ];
      this.consumeQuota(now, bases.length);
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
    fetchAt: (tmFc: string) => Promise<R>,
    isEmpty: (results: R) => boolean,
  ): Promise<{ tmFc: string; results: R; fallback: boolean }> {
    const tmFc = kmaMidTmFc(now);
    this.consumeQuota(now, calls);
    const first = await fetchAt(tmFc);
    if (!isEmpty(first)) return { tmFc, results: first, fallback: false };
    const prev = kmaPrevMidTmFc(tmFc);
    this.consumeQuota(now, calls);
    const second = await fetchAt(prev);
    return { tmFc: prev, results: second, fallback: true };
  }

  // ── 중기육상 + 중기기온 + 중기전망 ───────────────────────────────────────
  async getMid(land: string, ta: string, stn?: string): Promise<WeatherMidResultType> {
    const opts = this.requireKey();
    const fetchLand = this.deps.adapter?.getMidLandFcst ?? getMidLandFcst;
    const fetchTa = this.deps.adapter?.getMidTa ?? getMidTa;
    const fetchOutlook = this.deps.adapter?.getMidFcst ?? getMidFcst;
    const { data, fetchedAt, stale } = await this.cached(`mid:${land}:${ta}:${stn ?? '-'}`, WEATHER_MID_STALE_MAX_MS, async (now) => {
      const { tmFc, results, fallback } = await this.fetchMidWithFallback(
        now,
        stn ? 3 : 2,
        (at) =>
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
    const opts = this.requireKey();
    const fetchSea = this.deps.adapter?.getMidSeaFcst ?? getMidSeaFcst;
    const { data, fetchedAt, stale } = await this.cached(`mid-sea:${regId}`, WEATHER_MID_STALE_MAX_MS, async (now) => {
      const { tmFc, results, fallback } = await this.fetchMidWithFallback(
        now,
        1,
        (at) => fetchSea(regId, at, opts),
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
}
