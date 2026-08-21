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
// 중복·뒤로가기 재방문 흡수) + 키 없으면 enabled=false 빈 결과(200) — 보조 기능이라 페이지를
// 막지 않는다.

const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;
const UPSTREAM_SIZE = 10;
// "세종대로 110", "창덕궁5길 4-1", "강남대로 396 (역삼동)" — 도로명 + 번지 꼴.
const ROAD_ADDRESS_LIKE = /(로|길)\s*(지하\s*)?\d+(-\d+)?/;

export interface LifeMapSearchServiceDeps {
  // 평문 키 공급자(설정>지도 DB 우선 + env 폴백) — 요청마다 불러 키 교체를 즉시 반영.
  getKey: () => Promise<string | null>;
  fetchImpl?: FetchLike;
  now?: () => Date;
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

  constructor(private readonly deps: LifeMapSearchServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async search(qRaw: string, limit: number): Promise<LifeMapSearchResultType> {
    const q = qRaw.trim().replace(/\s+/g, ' ');
    const fetchedAt = this.now().toISOString();
    const key = (await this.deps.getKey()) ?? '';
    if (!key) return { q, items: [], enabled: false, fetchedAt };

    const cached = this.cache.get(q);
    if (cached) return { q, items: cached.slice(0, limit), enabled: true, fetchedAt };

    const opts = { key, size: UPSTREAM_SIZE, fetchImpl: this.deps.fetchImpl };
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
    this.cache.set(q, items);
    return { q, items: items.slice(0, limit), enabled: true, fetchedAt };
  }
}
