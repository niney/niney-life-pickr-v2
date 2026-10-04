import type { SeaActivityType, SeaForecastResultType, SeaRipType, SeaSlotType, SeaSpotType, SeaTideResultType } from '@repo/api-contract';
import {
  SEA_RIP_BEACHES,
  isSeaRipSeason,
  kmaTodayIsoDate,
  matchSeaRipBeach,
  nearestSeaTideStation,
  seaIndexLevelOf,
  seaRipLevelOf,
  seaTideKindOf,
} from '@repo/utils';
import { LRUCache } from 'lru-cache';
import { coerceStrOrNull, numOrNull } from '../../lib/narrow.js';
import { DailyQuota, UpstreamCooldown, retryAfterSec } from '../../lib/upstream-guard.js';
import { KHOA_PATHS, KhoaApiError, callKhoaAll, callKhoaPage, type KhoaCallOptions } from './khoa.adapter.js';

// 바다 예보 프록시 서비스 — DB 없음. 활동별 전량(7일 × 지점 × 오전/오후 × 세부)을 받아 한 슬롯 모양으로 정규화해
// 메모리에 캐시(FORECAST_TTL_MS)하고, 업스트림이 실패하면 STALE_MAX_MS 안의 마지막 값을 stale=true 로 준다.
// 같은 키 동시 요청은 한 번의 업스트림 호출로 합류. 한 번 갱신 = 활동당 1~6콜(바다낚시 1,750행이 최대)이라
// 활동 6개 × 하루 24회 ≈ 300콜 — 개발계정 일 10,000건에 한참 못 미친다.
//
// 물때는 좌표 → 가장 가까운 조석 예보지점(utils SEA_TIDE_STATIONS 166곳) → 지점·날짜 단위 캐시(천문조 계산값이라
// 하루 안 바뀐다). 날짜는 계약이 KST 오늘-2~오늘+10 으로 막아(E-6) 키가 지점 × 13일로 묶이고, 캐시는 LRU 상한.
// 이안류는 제공 기간(6~9월)에만 해수욕 응답에 붙인다(해수욕장 10곳 × 최신 관측 1행).
// 업스트림 호출은 일일 카운터(재시도 포함)로 세고, 실패한 키는 쿨다운(lib/upstream-guard) 동안 다시 부르지 않는다.

export const SEA_FORECAST_TTL_MS = 60 * 60_000;
export const SEA_TIDE_TTL_MS = 12 * 60 * 60_000;
export const SEA_STALE_MAX_MS = 12 * 60 * 60_000;
// 물때 캐시 상한 — 키 최대 2,158개(조석지점 166 × 허용 날짜 13일)를 담고 남는 크기, 엔트리 ≈1KB.
export const SEA_TIDE_CACHE_MAX = 3_000;
// 일일 업스트림 카운터 — 이전엔 없어 날짜 순회 한 IP 로 조석 API 하루 한도가 2.8시간에 바닥났다(E-6). 업스트림
// 한도(개발계정 API 별 10,000)보다 한참 낮게, 정상 사용량의 수 배: 지수 6종은 활동당 하루 24회 × 1~6쪽 ≈300 +
// 이안류(6~9월) 10곳 × 24회 ≈240, 물때는 지점·날짜 키당 12시간 1콜이라 보통 수십 콜.
export const SEA_QUOTA_LIMITS = { forecast: 2_000, tide: 2_000 } as const;
export type SeaQuotaBucket = keyof typeof SEA_QUOTA_LIMITS;

export class SeaServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'SeaServiceError';
  }
}

export interface SeaServiceDeps {
  serviceKey: string;
  callPage?: typeof callKhoaPage;
  now?: () => Date;
  // 테스트 주입용 — 모든 버킷에 같은 한도(dailyLimits 가 버킷별로 우선).
  dailyLimit?: number;
  dailyLimits?: Partial<Record<SeaQuotaBucket, number>>;
}

interface Entry<T> {
  data: T;
  fetchedAt: Date;
  expiresAt: number;
}

// 활동 예보 Map(키 6개 고정)과 물때 LRU 가 함께 맞추는 최소 모양.
interface EntryStore {
  get(key: string): Entry<unknown> | undefined;
  set(key: string, value: Entry<unknown>): unknown;
}

// ── 정규화 ─────────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
const str = (r: Row, k: string): string | null => {
  const v = coerceStrOrNull(r[k]);
  return v && v.trim() ? v.trim() : null;
};
const num = (r: Row, k: string): number | null => numOrNull(r[k]);
// 최소·최대 쌍 → 가운데(소수 한 자리). 한쪽만 있으면 그 값.
const mid = (r: Row, lo: string, hi: string): number | null => {
  const a = num(r, lo);
  const b = num(r, hi);
  if (a === null) return b;
  if (b === null) return a;
  return Math.round(((a + b) / 2) * 10) / 10;
};
// 원문 '오전'|'오후'|'일'(하루 — 해수욕·바다여행 D+3 이후) → am|pm|null.
const period = (r: Row): 'am' | 'pm' | null => {
  const v = str(r, 'predcNoonSeCd');
  return v === '오전' ? 'am' : v === '오후' ? 'pm' : null;
};
const hhmm = (v: string | null): string | null => {
  const m = /(\d{1,2}):(\d{2})/.exec(v ?? '');
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]}` : null;
};

const emptySlot = (date: string): SeaSlotType => ({
  date,
  period: null,
  variants: [],
  level: null,
  label: null,
  waveM: null,
  wavePeriodS: null,
  waterTempC: null,
  airTempC: null,
  windMs: null,
  currentMs: null,
  tidePhase: null,
  weather: null,
  openStatus: null,
  timeFrom: null,
  timeTo: null,
});

// 세부(어종·등급) 한 줄 — 이름이 없으면 세부 없음.
const variantOf = (r: Row, field: string, s: SeaSlotType): SeaSlotType['variants'] => {
  const name = str(r, field);
  return name ? [{ name, level: s.level, label: s.label }] : [];
};

// 같은 날짜·시간대 슬롯을 하나로 — 세부를 이어 붙이고 level/label 은 가장 좋은 세부(체험불가 0 < 매우나쁨 1 …).
const mergeSlots = (slots: SeaSlotType[]): SeaSlotType[] => {
  const out: SeaSlotType[] = [];
  const byKey = new Map<string, SeaSlotType>();
  for (const s of slots) {
    const key = `${s.date}|${s.period ?? '-'}`;
    const prev = byKey.get(key);
    if (!prev) {
      const copy = { ...s, variants: [...s.variants] };
      byKey.set(key, copy);
      out.push(copy);
      continue;
    }
    prev.variants.push(...s.variants);
    if (s.level !== null && (prev.level === null || s.level > prev.level)) {
      prev.level = s.level;
      prev.label = s.label;
    }
  }
  return out;
};

// 활동별 원문 → (지점명, 슬롯). 필드명은 2026-09-24 실측 응답 기준.
const NAME_FIELD: Record<SeaActivityType, string> = {
  beach: 'bbchNm',
  surf: 'surfPlcNm',
  fishing: 'seafsPstnNm',
  mudflat: 'mdftExpcnVlgNm',
  seaSplit: 'splocPstnNm',
  seaTrip: 'sareaDtlNm',
};

export const toSeaSlot = (activity: SeaActivityType, r: Row): SeaSlotType | null => {
  const date = str(r, 'predcYmd');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const label = str(r, 'totalIndex');
  const s: SeaSlotType = { ...emptySlot(date), label, level: seaIndexLevelOf(label) };
  switch (activity) {
    case 'beach':
      return { ...s, period: period(r), waveM: num(r, 'maxWvhgt'), waterTempC: num(r, 'avgWtem'), airTempC: num(r, 'avgArtmp'), windMs: num(r, 'maxWspd'), openStatus: str(r, 'opnStat') };
    case 'surf':
      return { ...s, period: period(r), variants: variantOf(r, 'grdCn', s), waveM: num(r, 'avgWvhgt'), wavePeriodS: num(r, 'avgWvpd'), windMs: num(r, 'avgWspd'), waterTempC: num(r, 'avgWtem') };
    case 'fishing':
      return {
        ...s,
        period: period(r),
        variants: variantOf(r, 'seafsTgfshNm', s),
        tidePhase: str(r, 'tdlvHrCn'),
        waveM: num(r, 'maxWvhgt'),
        waterTempC: mid(r, 'minWtem', 'maxWtem'),
        airTempC: mid(r, 'minArtmp', 'maxArtmp'),
        currentMs: num(r, 'maxCrsp'),
        windMs: num(r, 'maxWspd'),
      };
    case 'mudflat':
      return { ...s, timeFrom: hhmm(str(r, 'mdftExprnBgngTm')), timeTo: hhmm(str(r, 'mdftExprnEndTm')), airTempC: mid(r, 'minArtmp', 'maxArtmp'), windMs: num(r, 'maxWspd'), weather: str(r, 'weather') };
    case 'seaSplit':
      return { ...s, timeFrom: hhmm(str(r, 'splocBgngDt')), timeTo: hhmm(str(r, 'splocEndDt')), airTempC: mid(r, 'minArtmp', 'maxArtmp'), windMs: num(r, 'maxWspd'), weather: str(r, 'weather') };
    case 'seaTrip':
      return {
        ...s,
        period: period(r),
        tidePhase: str(r, 'tdlvHrCn'),
        airTempC: num(r, 'avgArtmp'),
        windMs: num(r, 'avgWspd'),
        waterTempC: num(r, 'avgWtem'),
        waveM: num(r, 'avgWvhgt'),
        currentMs: num(r, 'avgCrsp'),
        weather: str(r, 'weather'),
      };
  }
};

// 행 → 지점 묶음. 같은 이름이라도 좌표가 다르면 다른 지점(id 에 좌표 접미). 슬롯은 날짜 → 오전·오후 순, 같은
// 날짜·시간대의 세부(어종·등급) 행은 한 슬롯의 variants 로 합친다(원문 순).
export const groupSeaSpots = (activity: SeaActivityType, rows: Row[]): { dates: string[]; spots: SeaSpotType[] } => {
  const byKey = new Map<string, { name: string; lat: number; lng: number; slots: SeaSlotType[] }>();
  const dates = new Set<string>();
  for (const r of rows) {
    const name = str(r, NAME_FIELD[activity]);
    const lat = num(r, 'lat');
    const lng = num(r, 'lot');
    const slot = toSeaSlot(activity, r);
    if (!name || lat === null || lng === null || !slot) continue;
    const key = `${name}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    let g = byKey.get(key);
    if (!g) byKey.set(key, (g = { name, lat, lng, slots: [] }));
    g.slots.push(slot);
    dates.add(slot.date);
  }
  const nameCount = new Map<string, number>();
  for (const g of byKey.values()) nameCount.set(g.name, (nameCount.get(g.name) ?? 0) + 1);
  const periodRank = (p: SeaSlotType['period']): number => (p === 'am' ? 0 : p === 'pm' ? 1 : 0);
  const spots = [...byKey.values()]
    .map((g) => ({
      id: (nameCount.get(g.name) ?? 0) > 1 ? `${g.name}@${g.lat.toFixed(3)},${g.lng.toFixed(3)}` : g.name,
      name: g.name,
      lat: g.lat,
      lng: g.lng,
      // 안정 정렬 — 같은 날짜·시간대 안의 세부(어종·등급)는 원문 순서 유지.
      slots: mergeSlots(
        g.slots
          .map((s, i) => ({ s, i }))
          .sort((a, b) => a.s.date.localeCompare(b.s.date) || periodRank(a.s.period) - periodRank(b.s.period) || a.i - b.i)
          .map((x) => x.s),
      ),
      rip: null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { dates: [...dates].sort(), spots };
};

// 이안류 최신 관측 1행 — 관측 시각 최댓값.
export const latestRip = (code: string, rows: Row[]): SeaRipType | null => {
  let best: Row | null = null;
  let bestAt = '';
  for (const r of rows) {
    const at = str(r, 'obsrvnDt') ?? '';
    if (at > bestAt) {
      best = r;
      bestAt = at;
    }
  }
  if (!best) return null;
  const label = str(best, 'lastScrCn');
  return { code, level: seaRipLevelOf(label), label, observedAt: bestAt, waveM: num(best, 'wvhgt') };
};

export class SeaService {
  // 활동 예보(키 6개 고정) · 물때(지점 × 날짜, LRU 상한 — 예전 Map 은 청소·상한이 없어 키가 영구 상주했다).
  private readonly forecasts = new Map<string, Entry<unknown>>();
  private readonly tides = new LRUCache<string, Entry<unknown>>({ max: SEA_TIDE_CACHE_MAX });
  private readonly inflight = new Map<string, Promise<{ data: unknown; fetchedAt: Date; stale: boolean }>>();
  private readonly quota: DailyQuota<SeaQuotaBucket>;
  private readonly cooldown = new UpstreamCooldown();

  constructor(private readonly deps: SeaServiceDeps) {
    const limits = {} as Record<SeaQuotaBucket, number>;
    for (const b of Object.keys(SEA_QUOTA_LIMITS) as SeaQuotaBucket[]) {
      limits[b] = deps.dailyLimits?.[b] ?? deps.dailyLimit ?? SEA_QUOTA_LIMITS[b];
    }
    this.quota = new DailyQuota(
      limits,
      () => new SeaServiceError('해양조사원 API 일일 호출 한도를 소진해 요청을 처리할 수 없습니다. 내일 다시 시도해주세요.', 503),
    );
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private opts(): KhoaCallOptions {
    if (!this.deps.serviceKey) throw new SeaServiceError('DATA_GO_KR_API_KEY 가 설정되지 않았습니다', 503);
    return { serviceKey: this.deps.serviceKey };
  }

  private get callPage(): typeof callKhoaPage {
    return this.deps.callPage ?? callKhoaPage;
  }

  // 쪽마다 일일 카운터 1(초과면 throw — 캐시 레이어가 stale 폴백) + 어댑터 재시도도 같은 버킷에 가산.
  private countedPage(bucket: SeaQuotaBucket, now: Date): typeof callKhoaPage {
    return (path, params, opts) => {
      this.quota.consume(bucket, now);
      return this.callPage(path, params, { ...opts, onRetry: () => this.quota.record(bucket, now) });
    };
  }

  // 캐시 + 합류 + 쿨다운 + stale 폴백 — 로더가 던지면 STALE_MAX_MS 안 마지막 값으로. 실패한 키는 쿨다운(30초→5분,
  // 인증·한도 오류면 그 API 전체) 동안 업스트림·카운터 없이 마지막 값이나 503(E-V2).
  private cached<T>(
    store: EntryStore,
    key: string,
    upstream: string,
    ttlMs: number,
    load: (now: Date) => Promise<T>,
  ): Promise<{ data: T; fetchedAt: Date; stale: boolean }> {
    const now = this.now();
    const nowMs = now.getTime();
    const hit = store.get(key) as Entry<T> | undefined;
    if (hit && hit.expiresAt > nowMs) return Promise.resolve({ data: hit.data, fetchedAt: hit.fetchedAt, stale: false });
    const existing = this.inflight.get(key) as Promise<{ data: T; fetchedAt: Date; stale: boolean }> | undefined;
    if (existing) return existing;
    const lastKnown = hit && nowMs - hit.fetchedAt.getTime() <= SEA_STALE_MAX_MS ? hit : null;

    const blockedUntil = this.cooldown.blockedUntil(upstream, key, nowMs);
    if (blockedUntil !== null) {
      if (lastKnown) return Promise.resolve({ data: lastKnown.data, fetchedAt: lastKnown.fetchedAt, stale: true });
      return Promise.reject(
        new SeaServiceError(
          `해양조사원 API 가 응답하지 않아 잠시 조회를 멈췄습니다. ${retryAfterSec(blockedUntil, nowMs)}초 뒤 다시 시도해 주세요.`,
          503,
        ),
      );
    }

    const task = (async (): Promise<{ data: T; fetchedAt: Date; stale: boolean }> => {
      try {
        const data = await load(now);
        this.cooldown.success(upstream, key);
        store.set(key, { data, fetchedAt: now, expiresAt: nowMs + ttlMs });
        return { data, fetchedAt: now, stale: false };
      } catch (e) {
        // 업스트림 실패만 쿨다운 — 카운터 소진은 업스트림 탓이 아니다. 503 은 게이트웨이 인증·한도(20~33).
        if (e instanceof KhoaApiError) this.cooldown.failure(upstream, key, nowMs, e.statusCode === 503);
        if (lastKnown) return { data: lastKnown.data, fetchedAt: lastKnown.fetchedAt, stale: true };
        throw e;
      }
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, task as Promise<{ data: unknown; fetchedAt: Date; stale: boolean }>);
    return task;
  }

  async getForecast(activity: SeaActivityType): Promise<SeaForecastResultType> {
    const opts = this.opts();
    const path = KHOA_PATHS[activity];
    const { data, fetchedAt, stale } = await this.cached(this.forecasts, `forecast:${activity}`, path, SEA_FORECAST_TTL_MS, async (now) => {
      const params: Record<string, string> = activity === 'fishing' ? { gubun: '갯바위' } : {};
      const rows = await callKhoaAll(path, params, opts, this.countedPage('forecast', now));
      const grouped = groupSeaSpots(activity, rows);
      if (activity === 'beach') await this.attachRips(grouped.spots, opts, now);
      return grouped;
    });
    return { activity, dates: data.dates, spots: data.spots, fetchedAt: fetchedAt.toISOString(), stale };
  }

  // 이안류 — 제공 기간이면 10곳 최신 관측을 해수욕장에 붙인다. 한 곳 실패(카운터 소진 포함)는 그 곳만 빈다(예보
  // 전체를 막지 않음).
  private async attachRips(spots: SeaSpotType[], opts: KhoaCallOptions, now: Date): Promise<void> {
    const month = Number(kmaTodayIsoDate(this.now()).slice(5, 7));
    if (!isSeaRipSeason(month)) return;
    const page = this.countedPage('forecast', now);
    const rips = new Map<string, SeaRipType>();
    await Promise.all(
      SEA_RIP_BEACHES.map(async (b) => {
        try {
          const res = await page(KHOA_PATHS.rip, { beachCode: b.code, numOfRows: '300', pageNo: '1' }, opts);
          const rip = latestRip(b.code, res.items);
          if (rip) rips.set(b.code, rip);
        } catch {
          // 이안류는 보조 정보 — 실패해도 해수욕 예보는 그대로.
        }
      }),
    );
    for (const s of spots) {
      const b = matchSeaRipBeach(s.name, s);
      const rip = b ? rips.get(b.code) : undefined;
      if (rip) s.rip = rip;
    }
  }

  async getTide(lat: number, lng: number, date: string): Promise<SeaTideResultType> {
    const opts = this.opts();
    const station = nearestSeaTideStation({ lat, lng });
    const { data, fetchedAt, stale } = await this.cached(this.tides, `tide:${station.code}:${date}`, KHOA_PATHS.tide, SEA_TIDE_TTL_MS, async (now) => {
      const page = await this.countedPage('tide', now)(
        KHOA_PATHS.tide,
        { obsCode: station.code, reqDate: date.replace(/-/g, ''), numOfRows: '10', pageNo: '1' },
        opts,
      );
      return page.items
        .map((r) => {
          const at = str(r, 'predcDt') ?? '';
          const kind = seaTideKindOf(str(r, 'extrSe'));
          const time = hhmm(at.slice(11));
          return kind && time && at.startsWith(date) ? { time, kind, levelCm: num(r, 'predcTdlvVl') } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => a.time.localeCompare(b.time));
    });
    return {
      station: { code: station.code, name: station.name, lat: station.lat, lng: station.lng, distM: station.distM },
      date,
      extremes: data,
      fetchedAt: fetchedAt.toISOString(),
      stale,
    };
  }

  // 측정·진단용 — 버킷별 오늘 사용량, 물때 캐시 엔트리 수(시뮬레이션·테스트).
  quotaUsed(bucket: SeaQuotaBucket): number {
    return this.quota.used(bucket, this.now());
  }

  tideCacheSize(): number {
    return this.tides.size;
  }
}
