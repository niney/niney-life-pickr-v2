// VWorld 검색 API(search 2.0) 어댑터 — 일상지도 "지역 이동" 검색의 주소·장소 섹션.
// 실측(2026-08-21): type=place → POI(title·category·address.road/parcel·point),
// type=address&category=road|parcel → 주소(address.road/parcel/bldnm·point). type=district 는
// category 필수라 쓰지 않는다(행정구역은 로컬 245지점으로 처리). 키는 WMTS/지오코더와 같은 인증키.
// 응답 status=ERROR(키·한도) → VworldSearchAuthError(503), 그 외 HTTP/형식 오류 → VworldSearchError(502).

export interface VworldSearchPlace {
  kind: 'place';
  id: string;
  title: string;
  category: string | null;
  road: string | null;
  parcel: string | null;
  lat: number;
  lng: number;
}
export interface VworldSearchAddress {
  kind: 'road' | 'parcel';
  id: string;
  road: string | null;
  parcel: string | null;
  building: string | null;
  lat: number;
  lng: number;
}

export class VworldSearchError extends Error {
  readonly statusCode: number;
  readonly requestUrl: string;
  constructor(message: string, statusCode: number, requestUrl: string) {
    super(message);
    this.name = 'VworldSearchError';
    this.statusCode = statusCode;
    this.requestUrl = requestUrl;
  }
}
export class VworldSearchAuthError extends VworldSearchError {
  constructor(message: string, requestUrl: string) {
    super(message, 503, requestUrl);
    this.name = 'VworldSearchAuthError';
  }
}

const SEARCH_URL = 'https://api.vworld.kr/req/search';
const FETCH_TIMEOUT_MS = 8_000;
// 실측(2026-08-21): vworld 검색은 간헐적으로 HTTP 502 를 돌려준다(바로 다시 부르면 성공). 5xx·네트워크
// 실패만 짧게 1회 재시도 — 타이핑 중 호출이라 길게 기다리진 않는다.
const RETRY_DELAY_MS = 300;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface VworldSearchOptions {
  key: string;
  size?: number;
  fetchImpl?: FetchLike;
}

interface RawItem {
  id?: unknown;
  title?: unknown;
  category?: unknown;
  address?: { road?: unknown; parcel?: unknown; bldnm?: unknown; bldnmdc?: unknown; category?: unknown };
  point?: { x?: unknown; y?: unknown };
}

const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);

const callSearch = async (
  query: string,
  params: Record<string, string>,
  opts: VworldSearchOptions,
): Promise<RawItem[]> => {
  const qs = new URLSearchParams({
    service: 'search',
    request: 'search',
    version: '2.0',
    crs: 'EPSG:4326',
    size: String(opts.size ?? 10),
    page: '1',
    query,
    format: 'json',
    errorformat: 'json',
    ...params,
  });
  const masked = `${SEARCH_URL}?${qs.toString()}&key=***`;
  qs.set('key', opts.key);
  const url = `${SEARCH_URL}?${qs.toString()}`;
  const fetchImpl = opts.fetchImpl ?? fetch;
  let json: unknown;
  for (let attempt = 0; ; attempt += 1) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, { signal: ac.signal });
      if (!res.ok) throw new VworldSearchError(`vworld 검색 HTTP ${res.status}`, res.status >= 500 ? 502 : 503, masked);
      json = await res.json().catch(() => null);
      break;
    } catch (e) {
      const err =
        e instanceof VworldSearchError
          ? e
          : new VworldSearchError(`vworld 검색 호출 실패: ${e instanceof Error ? e.message : String(e)}`, 502, masked);
      // 502(5xx/네트워크)만 1회 재시도, 4xx 성격(503) 은 즉시.
      if (err.statusCode !== 502 || attempt >= 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    } finally {
      clearTimeout(timer);
    }
  }
  const r = (json as { response?: { status?: unknown; result?: { items?: unknown }; error?: { code?: unknown; text?: unknown } } } | null)
    ?.response;
  if (r?.status === 'OK') return Array.isArray(r.result?.items) ? (r.result.items as RawItem[]) : [];
  if (r?.status === 'NOT_FOUND') return [];
  const code = strOrNull(r?.error?.code) ?? '';
  const text = strOrNull(r?.error?.text) ?? '응답 형식 이상';
  // 키 미등록·한도 초과 류는 재시도 무의미 → 503(설정 문제)로 구분.
  if (/KEY|AUTH|LIMIT|DOMAIN|INCORRECT_KEY|UNAUTHENTICATED/i.test(code)) {
    throw new VworldSearchAuthError(`vworld 검색 인증/한도 오류(${code}: ${text})`, masked);
  }
  throw new VworldSearchError(`vworld 검색 오류(${code || '?'}: ${text})`, 502, masked);
};

const toPoint = (it: RawItem): { lat: number; lng: number } | null => {
  const lat = Number(it.point?.y);
  const lng = Number(it.point?.x);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132 ? { lat, lng } : null;
};

// 장소(POI) 검색.
export const searchVworldPlaces = async (query: string, opts: VworldSearchOptions): Promise<VworldSearchPlace[]> => {
  const items = await callSearch(query, { type: 'place' }, opts);
  const out: VworldSearchPlace[] = [];
  for (const it of items) {
    const p = toPoint(it);
    const title = strOrNull(it.title);
    if (!p || !title) continue;
    out.push({
      kind: 'place',
      id: strOrNull(it.id) ?? `${title}|${p.lat}|${p.lng}`,
      title,
      category: strOrNull(it.category),
      road: strOrNull(it.address?.road),
      parcel: strOrNull(it.address?.parcel),
      lat: p.lat,
      lng: p.lng,
    });
  }
  return out;
};

// 주소 검색 — 도로명(category=road) 또는 지번(parcel).
export const searchVworldAddresses = async (
  query: string,
  category: 'road' | 'parcel',
  opts: VworldSearchOptions,
): Promise<VworldSearchAddress[]> => {
  const items = await callSearch(query, { type: 'address', category }, opts);
  const out: VworldSearchAddress[] = [];
  for (const it of items) {
    const p = toPoint(it);
    if (!p) continue;
    const road = strOrNull(it.address?.road);
    const parcel = strOrNull(it.address?.parcel);
    if (!road && !parcel) continue;
    const bldnm = strOrNull(it.address?.bldnm);
    const bldnmdc = strOrNull(it.address?.bldnmdc);
    out.push({
      kind: category,
      id: `${strOrNull(it.id) ?? ''}|${road ?? parcel}|${bldnm ?? ''}|${bldnmdc ?? ''}`,
      road,
      parcel,
      building: bldnm ? `${bldnm}${bldnmdc ? ` ${bldnmdc}` : ''}` : null,
      lat: p.lat,
      lng: p.lng,
    });
  }
  return out;
};
