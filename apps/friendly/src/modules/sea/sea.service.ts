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
import { coerceStrOrNull, numOrNull } from '../../lib/narrow.js';
import { KHOA_PATHS, callKhoaAll, callKhoaPage, type KhoaCallOptions } from './khoa.adapter.js';

// 바다 예보 프록시 서비스 — DB 없음. 활동별 전량(7일 × 지점 × 오전/오후 × 세부)을 받아 한 슬롯 모양으로 정규화해
// 메모리에 캐시(FORECAST_TTL_MS)하고, 업스트림이 실패하면 STALE_MAX_MS 안의 마지막 값을 stale=true 로 준다.
// 같은 키 동시 요청은 한 번의 업스트림 호출로 합류. 한 번 갱신 = 활동당 1~6콜(바다낚시 1,750행이 최대)이라
// 활동 6개 × 하루 24회 ≈ 300콜 — 개발계정 일 10,000건에 한참 못 미친다.
//
// 물때는 좌표 → 가장 가까운 조석 예보지점(utils SEA_TIDE_STATIONS 166곳) → 지점·날짜 단위 캐시(천문조 계산값이라
// 하루 안 바뀐다). 이안류는 제공 기간(6~9월)에만 해수욕 응답에 붙인다(해수욕장 10곳 × 최신 관측 1행).

export const SEA_FORECAST_TTL_MS = 60 * 60_000;
export const SEA_TIDE_TTL_MS = 12 * 60 * 60_000;
export const SEA_STALE_MAX_MS = 12 * 60 * 60_000;

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
}

interface Entry<T> {
  data: T;
  fetchedAt: Date;
  expiresAt: number;
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
  private readonly cache = new Map<string, Entry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: SeaServiceDeps) {}

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

  // 캐시 + 합류 + stale 폴백 — 로더가 던지면 STALE_MAX_MS 안 마지막 값으로.
  private async cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<{ data: T; fetchedAt: Date; stale: boolean }> {
    const now = this.now().getTime();
    const hit = this.cache.get(key) as Entry<T> | undefined;
    if (hit && hit.expiresAt > now) return { data: hit.data, fetchedAt: hit.fetchedAt, stale: false };
    let p = this.inflight.get(key) as Promise<T> | undefined;
    if (!p) {
      p = load().finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    try {
      const data = await p;
      const fetchedAt = this.now();
      this.cache.set(key, { data, fetchedAt, expiresAt: fetchedAt.getTime() + ttlMs });
      return { data, fetchedAt, stale: false };
    } catch (e) {
      if (hit && now - hit.fetchedAt.getTime() <= SEA_STALE_MAX_MS) return { data: hit.data, fetchedAt: hit.fetchedAt, stale: true };
      throw e;
    }
  }

  async getForecast(activity: SeaActivityType): Promise<SeaForecastResultType> {
    const opts = this.opts();
    const { data, fetchedAt, stale } = await this.cached(`forecast:${activity}`, SEA_FORECAST_TTL_MS, async () => {
      const params: Record<string, string> = activity === 'fishing' ? { gubun: '갯바위' } : {};
      const rows = await callKhoaAll(KHOA_PATHS[activity], params, opts, this.callPage);
      const grouped = groupSeaSpots(activity, rows);
      if (activity === 'beach') await this.attachRips(grouped.spots, opts);
      return grouped;
    });
    return { activity, dates: data.dates, spots: data.spots, fetchedAt: fetchedAt.toISOString(), stale };
  }

  // 이안류 — 제공 기간이면 10곳 최신 관측을 해수욕장에 붙인다. 한 곳 실패는 그 곳만 빈다(예보 전체를 막지 않음).
  private async attachRips(spots: SeaSpotType[], opts: KhoaCallOptions): Promise<void> {
    const month = Number(kmaTodayIsoDate(this.now()).slice(5, 7));
    if (!isSeaRipSeason(month)) return;
    const rips = new Map<string, SeaRipType>();
    await Promise.all(
      SEA_RIP_BEACHES.map(async (b) => {
        try {
          const page = await this.callPage(KHOA_PATHS.rip, { beachCode: b.code, numOfRows: '300', pageNo: '1' }, opts);
          const rip = latestRip(b.code, page.items);
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
    const { data, fetchedAt, stale } = await this.cached(`tide:${station.code}:${date}`, SEA_TIDE_TTL_MS, async () => {
      const page = await this.callPage(
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
}
