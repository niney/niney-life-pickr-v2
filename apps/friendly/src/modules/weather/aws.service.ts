import type { WeatherAwsItemType, WeatherAwsResultType } from '@repo/api-contract';
import { haversineM } from '@repo/utils';
import {
  getAwsMinute,
  getAwsStations,
  type KmaApiHubRequestOptions,
  type RawAwsMinuteRow,
  type RawAwsStationRow,
} from './kma-apihub.adapter.js';

// AWS(방재기상관측) 매분 자료 서비스 — 기상청 API허브. 격자 실황(5km·정시·+10분 지연)을
// "가장 가까운 관측소의 지금 값"(수백 m~수 km, 1분 단위)으로 보강한다. 업스트림 호출은 두
// 종류뿐이고 둘 다 전국 1콜이라 좌표별 캐시가 필요 없다:
//   지점 정보(stn_inf)  — 24시간 캐시(사실상 정적), 장애 시 7일 last-known
//   매분 관측(nph-aws2_min, stn=0 전국) — 2분 캐시(매분 갱신이지만 화면 리듬에 맞춤), 장애 시
//   30분 last-known(stale). tm2 는 KST 현재 분 — 관측이 아직 안 올라온 분이면 업스트림이 직전
//   값을 주거나 비므로, 비면 1분 전으로 1회 폴백.
// 키(KMA_APIHUB_KEY)가 없으면 enabled=false 빈 결과(200) — 보강은 선택 기능.

export const AWS_STATIONS_TTL_MS = 24 * 60 * 60_000;
export const AWS_STATIONS_STALE_MAX_MS = 7 * 24 * 60 * 60_000;
export const AWS_MINUTE_TTL_MS = 2 * 60_000;
export const AWS_MINUTE_STALE_MAX_MS = 30 * 60_000;
// 관측 시각이 이보다 오래됐으면(관측소 결측·통신 장애) 항목에서 값 대신 null 로 — 표시용.
export const AWS_OBS_MAX_AGE_MS = 20 * 60_000;
// 매분 자료 지연 보정 — 현재 시각에서 이만큼(분) 물러난 분을 차례로 묻는다.
export const AWS_MINUTE_LAG_OFFSETS = [2, 5, 8] as const;

export interface AwsServiceDeps {
  authKey: string;
  adapter?: {
    getAwsStations?: typeof getAwsStations;
    getAwsMinute?: typeof getAwsMinute;
  };
  now?: () => Date;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: Date;
  expiresAt: number;
  staleMaxMs: number;
}
interface Cached<T> {
  data: T;
  fetchedAt: Date;
  stale: boolean;
}

const KST_OFFSET_MS = 9 * 60 * 60_000;
const pad2 = (n: number): string => String(n).padStart(2, '0');
// Date → KST "YYYYMMDDHHmm".
export const toKstMinute = (at: Date): string => {
  const k = new Date(at.getTime() + KST_OFFSET_MS);
  return `${k.getUTCFullYear()}${pad2(k.getUTCMonth() + 1)}${pad2(k.getUTCDate())}${pad2(k.getUTCHours())}${pad2(k.getUTCMinutes())}`;
};
// "YYYYMMDDHHmm" → ISO(+09:00) / Date.
export const kstMinuteToIso = (tm: string): string | null =>
  /^\d{12}$/.test(tm) ? `${tm.slice(0, 4)}-${tm.slice(4, 6)}-${tm.slice(6, 8)}T${tm.slice(8, 10)}:${tm.slice(10, 12)}:00+09:00` : null;
const kstMinuteToDate = (tm: string): Date | null => {
  const iso = kstMinuteToIso(tm);
  return iso ? new Date(iso) : null;
};

export interface AwsStation {
  stn: string;
  name: string;
  lat: number;
  lng: number;
  ht: number | null;
}

// 지점 행 정규화 — 위·경도 범위로 축 검증(한국 WGS84). 이름 없으면 지점번호.
export const toAwsStation = (r: RawAwsStationRow): AwsStation | null => {
  if (r.stn === null || r.lat === null || r.lon === null) return null;
  if (r.lat < 32 || r.lat > 40 || r.lon < 123 || r.lon > 133) return null;
  return { stn: r.stn, name: r.name ?? r.stn, lat: r.lat, lng: r.lon, ht: r.ht };
};

export class AwsService {
  private stationsCache: CacheEntry<AwsStation[]> | null = null;
  private minuteCache: CacheEntry<{ tm: string | null; byStn: Map<string, RawAwsMinuteRow> }> | null = null;
  private inflightStations: Promise<Cached<AwsStation[]>> | null = null;
  private inflightMinute: Promise<Cached<{ tm: string | null; byStn: Map<string, RawAwsMinuteRow> }>> | null = null;

  constructor(private readonly deps: AwsServiceDeps) {}

  get enabled(): boolean {
    return this.deps.authKey.length > 0;
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private opts(): KmaApiHubRequestOptions {
    return { authKey: this.deps.authKey };
  }

  // 단일 키 캐시 — TTL 히트 / in-flight 합류 / 실패 시 stale 폴백. 두 자료가 각자 1개 키라
  // Map 없이 엔트리 하나씩.
  private async cachedOne<T>(
    slot: 'stations' | 'minute',
    ttlMs: number,
    staleMaxMs: number,
    load: (now: Date) => Promise<T>,
  ): Promise<Cached<T>> {
    const now = this.now();
    const entry = (slot === 'stations' ? this.stationsCache : this.minuteCache) as CacheEntry<T> | null;
    if (entry && now.getTime() <= entry.expiresAt) return { data: entry.data, fetchedAt: entry.fetchedAt, stale: false };
    const inflight = (slot === 'stations' ? this.inflightStations : this.inflightMinute) as Promise<Cached<T>> | null;
    if (inflight) return inflight;
    const task = (async (): Promise<Cached<T>> => {
      try {
        const data = await load(now);
        const next: CacheEntry<T> = { data, fetchedAt: now, expiresAt: now.getTime() + ttlMs, staleMaxMs };
        if (slot === 'stations') this.stationsCache = next as CacheEntry<AwsStation[]>;
        else this.minuteCache = next as CacheEntry<{ tm: string | null; byStn: Map<string, RawAwsMinuteRow> }>;
        return { data, fetchedAt: now, stale: false };
      } catch (e) {
        if (entry && now.getTime() - entry.fetchedAt.getTime() <= entry.staleMaxMs) {
          return { data: entry.data, fetchedAt: entry.fetchedAt, stale: true };
        }
        throw e;
      } finally {
        if (slot === 'stations') this.inflightStations = null;
        else this.inflightMinute = null;
      }
    })();
    if (slot === 'stations') this.inflightStations = task as Promise<Cached<AwsStation[]>>;
    else this.inflightMinute = task as Promise<Cached<{ tm: string | null; byStn: Map<string, RawAwsMinuteRow> }>>;
    return task;
  }

  private loadStations(): Promise<Cached<AwsStation[]>> {
    const fetchStations = this.deps.adapter?.getAwsStations ?? getAwsStations;
    return this.cachedOne('stations', AWS_STATIONS_TTL_MS, AWS_STATIONS_STALE_MAX_MS, async (now) => {
      const { rows } = await fetchStations(toKstMinute(now), this.opts());
      const out: AwsStation[] = [];
      for (const r of rows) {
        const s = toAwsStation(r);
        if (s) out.push(s);
      }
      return out;
    });
  }

  // 실측(2026-08-21): 매분 자료는 2~4분 늦게 들어오고, 아직 없는 분을 물으면 빈 응답이 아니라
  // 전 지점 -99.9(센티널) 행이 온다. 그래서 현재-2분부터 묻고, 값 있는 행이 10% 미만이면
  // -5분, -8분으로 물러난다(최대 3콜). 전부 비어도 마지막 응답을 쓴다(값은 null 로 내려감).
  private loadMinute(): Promise<Cached<{ tm: string | null; byStn: Map<string, RawAwsMinuteRow> }>> {
    const fetchMinute = this.deps.adapter?.getAwsMinute ?? getAwsMinute;
    return this.cachedOne('minute', AWS_MINUTE_TTL_MS, AWS_MINUTE_STALE_MAX_MS, async (now) => {
      let picked: { tm: string; rows: RawAwsMinuteRow[] } | null = null;
      for (const offsetMin of AWS_MINUTE_LAG_OFFSETS) {
        const tm2 = toKstMinute(new Date(now.getTime() - offsetMin * 60_000));
        const { rows } = await fetchMinute(tm2, '0', this.opts());
        picked = { tm: tm2, rows };
        const live = rows.filter((r) => r.ta !== null || r.hm !== null || r.rn15m !== null).length;
        if (rows.length > 0 && live >= Math.max(1, Math.ceil(rows.length * 0.1))) break;
      }
      const rows = picked?.rows ?? [];
      const byStn = new Map<string, RawAwsMinuteRow>();
      for (const r of rows) {
        if (r.stn === null) continue;
        // 같은 지점이 여러 행이면(시간 범위 응답) 가장 늦은 관측.
        const cur = byStn.get(r.stn);
        if (!cur || (r.tm ?? '') > (cur.tm ?? '')) byStn.set(r.stn, r);
      }
      return { tm: rows.length > 0 && picked ? picked.tm : null, byStn };
    });
  }

  // 좌표 기준 가장 가까운 관측소 N곳 + 그 지점의 최근 관측값.
  async getNearby(lat: number, lng: number, radiusM: number, limit: number): Promise<WeatherAwsResultType> {
    const now = this.now();
    if (!this.enabled) {
      return { enabled: false, center: { lat, lng }, items: [], tm: null, fetchedAt: now.toISOString(), stale: false };
    }
    const [stations, minute] = await Promise.all([this.loadStations(), this.loadMinute()]);
    const nearest = stations.data
      .map((s) => ({ s, dist: haversineM({ lat, lng }, { lat: s.lat, lng: s.lng }) }))
      .filter((x) => x.dist <= radiusM)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit);
    const items: WeatherAwsItemType[] = nearest.map(({ s, dist }) => {
      const m = minute.data.byStn.get(s.stn) ?? null;
      const obsAt = m?.tm ? kstMinuteToDate(m.tm) : null;
      const fresh = obsAt !== null && now.getTime() - obsAt.getTime() <= AWS_OBS_MAX_AGE_MS;
      const v = fresh && m ? m : null;
      return {
        stn: s.stn,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        ht: s.ht,
        dist: Math.round(dist),
        tm: v?.tm ?? null,
        observedAt: v?.tm ? kstMinuteToIso(v.tm) : null,
        ta: v?.ta ?? null,
        hm: v?.hm ?? null,
        wd10: v?.wd10 ?? null,
        ws10: v?.ws10 ?? null,
        re: v?.re ?? null,
        rn15m: v?.rn15m ?? null,
        rn60m: v?.rn60m ?? null,
        rn12h: v?.rn12h ?? null,
        rnDay: v?.rnDay ?? null,
        td: v?.td ?? null,
        pa: v?.pa ?? null,
      };
    });
    return {
      enabled: true,
      center: { lat, lng },
      items,
      tm: minute.data.tm,
      fetchedAt: minute.fetchedAt.toISOString(),
      stale: stations.stale || minute.stale,
    };
  }
}
