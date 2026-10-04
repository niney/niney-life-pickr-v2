import type { LifeMapSearchItemType, LifeMapSearchResultType } from '@repo/api-contract';
import { LRUCache } from 'lru-cache';
import {
  searchVworldAddresses,
  searchVworldPlaces,
  type FetchLike,
  type VworldSearchAddress,
  type VworldSearchPlace,
} from './vworld-search.adapter.js';

// 일상지도 "지역 이동" 주소·장소 검색 — VWorld 검색 API 프록시. 행정구역(로컬 245지점)·지하철역·
// 버스정류장은 클라이언트가 각자 붙이고, 여기는 그 셋이 못 찾는 주소/POI 만 맡는다.
// 장소(POI)와 도로명 주소를 병렬 1콜씩 부르고 합친다 — 검색어가 "…로/길 + 번호" 꼴이면 주소를
// 앞에, 아니면 장소를 앞에. 같은 좌표(1m)·같은 제목은 접는다. 검색어 단위 LRU 10분 캐시(타이핑
// 중복·뒤로가기 재방문 흡수) + 같은 검색어 동시 요청 합류 + 키 없으면 enabled=false 빈 결과(200) —
// 보조 기능이라 페이지를 막지 않는다.
//
// 업스트림 예산(D-9): 고유 검색어마다 2콜(+5xx 재시도)이라, 검색어를 바꿔 가며 부르면 같은 키를 쓰는 지오코더·
// WMTS 한도까지 갉아먹는다. 서버 전역 일일 호출 상한(Asia/Seoul 날짜, 재시도 포함)을 넘으면 새 검색은 enabled=false
// 빈 결과 — 클라이언트는 주소·장소 칸만 숨기고 로컬(행정구역·역·정류장) 검색은 그대로 쓴다. 캐시 히트는 계속 준다.

const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;
const UPSTREAM_SIZE = 10;
// 검색 1건 = 장소 + 도로명 주소 2콜.
const CALLS_PER_SEARCH = 2;
// 하루 업스트림 호출 상한 — 검색 약 1,500건. 정상 사용(디바운스·로컬 결과 우선)은 훨씬 아래다.
export const LIFE_MAP_SEARCH_DAILY_BUDGET = 3_000;
// "세종대로 110", "창덕궁5길 4-1", "강남대로 396 (역삼동)" — 도로명 + 번지 꼴.
const ROAD_ADDRESS_LIKE = /(로|길)\s*(지하\s*)?\d+(-\d+)?/;

// Asia/Seoul 기준 YYYY-MM-DD — 예산 리셋 경계.
const SEOUL_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// 캐시·합류 키 — 유니코드(NFC)·대소문자를 접는다. 업스트림에는 원래 검색어(앞뒤 공백·연속 공백만 정리)를 보낸다.
const searchKeyOf = (q: string): string => q.normalize('NFC').toLowerCase();

interface LoggerLike {
  warn(obj: unknown, msg?: string): void;
}

export interface LifeMapSearchServiceDeps {
  // 평문 키 공급자(설정>지도 DB 우선 + env 폴백) — 요청마다 불러 키 교체를 즉시 반영.
  getKey: () => Promise<string | null>;
  fetchImpl?: FetchLike;
  now?: () => Date;
  // 하루 업스트림 호출 상한(기본 LIFE_MAP_SEARCH_DAILY_BUDGET) — 테스트 주입용.
  dailyBudget?: number;
  log?: LoggerLike;
}

const lastCategory = (category: string | null): string | null => {
  if (!category) return null;
  const parts = category.split('>').map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? null;
};

const placeToItem = (p: VworldSearchPlace): LifeMapSearchItemType => ({
  kind: 'place',
  id: p.id,
  title: p.title,
  subtitle: [lastCategory(p.category), p.road ?? p.parcel].filter(Boolean).join(' · ') || null,
  lat: p.lat,
  lng: p.lng,
});

const addressToItem = (a: VworldSearchAddress): LifeMapSearchItemType => ({
  kind: a.kind,
  id: a.id,
  title: (a.kind === 'road' ? a.road : a.parcel) ?? a.parcel ?? a.road ?? '',
  subtitle: a.building ?? (a.kind === 'road' ? a.parcel : a.road),
  lat: a.lat,
  lng: a.lng,
});

const dedupeKey = (it: LifeMapSearchItemType): string => `${it.title}|${it.lat.toFixed(5)}|${it.lng.toFixed(5)}`;

export class LifeMapSearchService {
  private readonly cache = new LRUCache<string, LifeMapSearchItemType[]>({ max: CACHE_MAX, ttl: CACHE_TTL_MS });
  // 같은 검색어 동시 요청 합류 — 진행 중 Promise 를 공유하고 끝나면 지운다.
  private readonly inflight = new Map<string, Promise<LifeMapSearchItemType[]>>();
  private budget = { dateKey: '', used: 0, warned: false };

  constructor(private readonly deps: LifeMapSearchServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  // 오늘 쓴 호출 수(날짜가 바뀌면 0부터).
  private budgetToday(): { dateKey: string; used: number; warned: boolean } {
    const dateKey = SEOUL_DATE_FMT.format(this.now());
    if (this.budget.dateKey !== dateKey) this.budget = { dateKey, used: 0, warned: false };
    return this.budget;
  }

  async search(qRaw: string, limit: number): Promise<LifeMapSearchResultType> {
    const q = qRaw.trim().replace(/\s+/g, ' ');
    const fetchedAt = this.now().toISOString();
    const key = (await this.deps.getKey()) ?? '';
    if (!key) return { q, items: [], enabled: false, fetchedAt };

    const ck = searchKeyOf(q);
    const cached = this.cache.get(ck);
    if (cached) return { q, items: cached.slice(0, limit), enabled: true, fetchedAt };

    let pending = this.inflight.get(ck);
    if (!pending) {
      const b = this.budgetToday();
      if (b.used + CALLS_PER_SEARCH > (this.deps.dailyBudget ?? LIFE_MAP_SEARCH_DAILY_BUDGET)) {
        if (!b.warned) {
          b.warned = true;
          this.deps.log?.warn({ used: b.used, dateKey: b.dateKey }, '[life-map] VWorld 검색 일일 예산 소진 — 오늘 새 검색은 빈 결과');
        }
        return { q, items: [], enabled: false, fetchedAt };
      }
      // 기본 2콜은 시작할 때 미리 잡는다 — 다른 검색어가 동시에 들어와도 예산을 넘겨 출발하지 않게.
      b.used += CALLS_PER_SEARCH;
      pending = this.fetchItems(q, key, ck).finally(() => {
        this.inflight.delete(ck);
      });
      this.inflight.set(ck, pending);
    }
    const items = await pending;
    return { q, items: items.slice(0, limit), enabled: true, fetchedAt };
  }

  private async fetchItems(q: string, key: string, ck: string): Promise<LifeMapSearchItemType[]> {
    // 미리 잡은 2콜을 넘는 시도(어댑터의 5xx 재시도)만 더 센다.
    let attempts = 0;
    const fetchImpl: FetchLike = (url, init) => {
      attempts += 1;
      if (attempts > CALLS_PER_SEARCH) this.budgetToday().used += 1;
      return (this.deps.fetchImpl ?? fetch)(url, init);
    };
    const opts = { key, size: UPSTREAM_SIZE, fetchImpl };
    const addressFirst = ROAD_ADDRESS_LIKE.test(q);
    const [places, roads] = await Promise.all([
      searchVworldPlaces(q, opts),
      searchVworldAddresses(q, 'road', opts),
    ]);
    const ordered = addressFirst
      ? [...roads.map(addressToItem), ...places.map(placeToItem)]
      : [...places.map(placeToItem), ...roads.map(addressToItem)];
    const seen = new Set<string>();
    const items: LifeMapSearchItemType[] = [];
    for (const it of ordered) {
      if (!it.title) continue;
      const k = dedupeKey(it);
      if (seen.has(k)) continue;
      seen.add(k);
      items.push(it);
    }
    this.cache.set(ck, items);
    return items;
  }
}
