// 다이닝코드 키워드 검색 어댑터.
//
// endpoint: POST https://im.diningcode.com/API/isearch/
//   Content-Type: application/x-www-form-urlencoded
//   body: query=<keyword>&from=<offset>&size=<count>[&lat=&lng=&distance=&order=]
//
// CORS 열려있고 CF 보호 없음 — 네이버 nx-api 와 동일한 HTTP 직접 호출 어댑터.
// 평균 응답 100~400ms.
//
// 핵심 동작:
//   - query 필수. 빈 query 는 라우트 zod 가 막음 → 어댑터는 trim 만.
//   - lat/lng 박으면 응답의 query_region 이 "내주변" 으로 전환되고
//     ranking_params.order 가 자동 r_score. distance 미지정 시 서버 기본 500m.
//   - GET 으로도 동작하지만 size 가 4 로 고정되므로 반드시 POST + form body.
//   - response.result_code 가 "100" 이 정상, 그 외("001" 등)는 에러.
//   - poi_section.total_cnt 는 10000 캡 — 진짜 매칭 카운트는 rcount.
//   - distance 는 SOFT limit — 반경 안에 키워드 매칭이 없으면 다이닝코드가
//     좌표를 무시하고 광역 검색으로 fallback 한다 ("계택닭" + 강남역 500m
//     → 광진구 본점). 좌표 검색 의미를 살리려면 어댑터에서 후필터링 필수.
//     기본값으로 좌표+distance 가 모두 들어오면 strictDistance 적용.

const ENDPOINT = 'https://im.diningcode.com/API/isearch/';

// 다이닝코드는 데스크톱·모바일 통합 — 모바일 UA 라도 동일하게 동작. 그냥
// www.diningcode.com referrer 와 일관성 위해 데스크톱 UA.
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DEFAULT_SIZE = 20;
const FETCH_TIMEOUT_MS = Number(process.env.CRAWL_DININGCODE_TIMEOUT_MS ?? '8000');

export interface DiningcodeSearchOptions {
  from?: number;
  size?: number;
  order?: 'r_score' | 'score' | 'review' | 'distance';
  // lat/lng 한쪽만 들어오면 무시.
  lat?: number;
  lng?: number;
  // 반경(m). lat/lng 동반 시에만 의미.
  distance?: number;
  // true 면 응답 items 중 lat/lng 가 반경(distance) 밖인 것을 잘라낸다.
  // 다이닝코드가 가게명 매칭 fallback 으로 광역 결과를 끼워보내는 케이스를 막음.
  // 기본 true (좌표+distance 동반 시) — 호출자가 명시적으로 false 박으면 끔.
  strictDistance?: boolean;
  signal?: AbortSignal;
}

// 검색 결과 항목 — 응답이 풍부하지만 안정적인 외부 인터페이스로 추림.
export interface DiningcodeSearchResult {
  vRid: string;
  name: string;
  branch: string | null;
  category: string | null;
  address: string | null;
  roadAddress: string | null;
  areas: string[];
  lat: number | null;
  lng: number | null;
  phone: string | null;
  score: number | null;
  userScore: number | null;
  reviewCount: number;
  thumbnailUrl: string | null;
  imageUrls: string[];
  openStatus: string | null;
  distance: string | null;
  keywords: Array<{ term: string; mark: number }>;
  displayReview: {
    user_nm: string | null;
    review_cont: string | null;
    review_reg_dt: string | null;
  } | null;
  rawSourceUrl: string;
}

export interface DiningcodeSearchMeta {
  region: string | null;
  regionName: string | null;
  rcount: number | null;
  order: string | null;
  searchType: string | null;
  altQueries: string[];
  relatedRegions: string[];
  relatedKeywords: string[];
  regionMainKeywords: string[];
}

export interface DiningcodeSearchResponse {
  items: DiningcodeSearchResult[];
  total: number;
  from: number;
  size: number;
  hasMore: boolean;
  meta: DiningcodeSearchMeta;
  source: 'http';
  elapsedMs: number;
  // strictDistance 후필터링으로 잘려나간 항목 수. > 0 이면 다이닝코드가 반경
  // 밖 결과를 끼워보냈다는 신호 — UI 가 "키워드 매칭이 반경 안에 없어 광역
  // 결과를 숨겼습니다" 안내를 띄울 수 있다.
  filteredOutCount: number;
}

export class DiningcodeSearchError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'DiningcodeSearchError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const strOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

// "325" 처럼 string 으로 오는 카운트 → 숫자. 응답 비공식이라 string/number 혼재.
const intOrZero = (v: unknown): number => {
  const n = numOrNull(v);
  return n !== null ? Math.trunc(n) : 0;
};

// "키워드,키워드,키워드" → string[]. 빈 문자열 / undefined 면 빈 배열.
const splitCsv = (v: unknown): string[] => {
  if (typeof v !== 'string' || v.length === 0) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

const mapItem = (raw: Record<string, unknown>): DiningcodeSearchResult | null => {
  const vRid = strOrNull(raw['v_rid']);
  const name = strOrNull(raw['nm']);
  if (!vRid || !name) return null;

  const imgList = Array.isArray(raw['image_list'])
    ? (raw['image_list'] as unknown[]).filter(
        (s): s is string => typeof s === 'string' && s.length > 0,
      )
    : [];

  const keywordsRaw = Array.isArray(raw['keyword'])
    ? (raw['keyword'] as Array<Record<string, unknown>>)
    : [];
  const keywords = keywordsRaw
    .map((k) => ({
      term: strOrNull(k['term']) ?? '',
      mark: intOrZero(k['mark']),
    }))
    .filter((k) => k.term.length > 0);

  const areaRaw = Array.isArray(raw['area'])
    ? (raw['area'] as unknown[]).filter(
        (s): s is string => typeof s === 'string' && s.length > 0,
      )
    : [];

  const dr = isObject(raw['display_review']) ? raw['display_review'] : null;
  const displayReview = dr
    ? {
        user_nm: strOrNull(dr['user_nm']),
        review_cont: strOrNull(dr['review_cont']),
        review_reg_dt: strOrNull(dr['review_reg_dt']),
      }
    : null;

  return {
    vRid,
    name,
    branch: strOrNull(raw['branch']),
    category: strOrNull(raw['category']),
    address: strOrNull(raw['addr']),
    roadAddress: strOrNull(raw['road_addr']),
    areas: areaRaw,
    lat: numOrNull(raw['lat']),
    lng: numOrNull(raw['lng']),
    phone: strOrNull(raw['phone']),
    // score: 다이닝코드 자체 빅데이터 점수 (0~100)
    score: numOrNull(raw['score']) !== null ? Math.trunc(numOrNull(raw['score'])!) : null,
    // user_score: 사용자 평균 평점 (1~5, 소수점 1자리)
    userScore: numOrNull(raw['user_score']),
    reviewCount: intOrZero(raw['review_cnt']),
    thumbnailUrl: strOrNull(raw['image']),
    imageUrls: imgList,
    openStatus: strOrNull(raw['open_status']),
    distance: strOrNull(raw['distance']),
    keywords,
    displayReview,
    rawSourceUrl: `https://www.diningcode.com/profile.php?rid=${encodeURIComponent(vRid)}`,
  };
};

const extractMeta = (poi: Record<string, unknown>): DiningcodeSearchMeta => {
  // poi_section.params 안에 region_keyword 가 있고, 그 안에 region/related/main keyword 가 들어있음.
  const params = isObject(poi['params']) ? poi['params'] : {};
  const rk = isObject(params['region_keyword']) ? params['region_keyword'] : {};
  const ranking = isObject(params['ranking_params']) ? params['ranking_params'] : {};

  const altQueriesRaw = poi['alt_queries'];
  const altQueries = Array.isArray(altQueriesRaw)
    ? (altQueriesRaw as unknown[]).filter(
        (s): s is string => typeof s === 'string' && s.length > 0,
      )
    : [];

  return {
    region: strOrNull(poi['region']) ?? strOrNull(rk['region']),
    regionName: strOrNull(poi['region_name']),
    rcount: numOrNull(params['rcount']) !== null
      ? Math.trunc(numOrNull(params['rcount'])!)
      : null,
    order: strOrNull(ranking['order']) ?? strOrNull(poi['order']),
    searchType: strOrNull(params['search_type']),
    altQueries,
    relatedRegions: splitCsv(rk['related_region']),
    relatedKeywords: splitCsv(rk['related_keyword']),
    regionMainKeywords: splitCsv(rk['region_main_keyword']),
  };
};

export const searchDiningcodePlaces = async (
  query: string,
  options: DiningcodeSearchOptions = {},
): Promise<DiningcodeSearchResponse> => {
  const trimmed = query.trim();
  if (!trimmed) throw new DiningcodeSearchError('query is empty');

  const t0 = Date.now();
  const from = Math.max(options.from ?? 0, 0);
  const size = Math.min(Math.max(options.size ?? DEFAULT_SIZE, 1), 30);

  const params = new URLSearchParams();
  params.set('query', trimmed);
  params.set('from', String(from));
  params.set('size', String(size));
  if (options.order) params.set('order', options.order);
  if (
    typeof options.lat === 'number' &&
    typeof options.lng === 'number' &&
    Number.isFinite(options.lat) &&
    Number.isFinite(options.lng)
  ) {
    params.set('lat', String(options.lat));
    params.set('lng', String(options.lng));
    if (typeof options.distance === 'number' && Number.isFinite(options.distance)) {
      params.set('distance', String(options.distance));
    }
  }

  // signal 미지정 시 자체 timeout — 외부 호출이 stuck 되지 않게 안전망.
  const ac = options.signal ? null : new AbortController();
  const timeoutId = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Referer: 'https://www.diningcode.com/',
        Origin: 'https://www.diningcode.com',
        'User-Agent': DESKTOP_UA,
      },
      body: params.toString(),
      signal: options.signal ?? ac?.signal,
    });
  } catch (e) {
    throw new DiningcodeSearchError(
      e instanceof Error ? `fetch failed: ${e.message}` : 'fetch failed',
      e,
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!res.ok) {
    throw new DiningcodeSearchError(`status ${res.status}`);
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch (e) {
    throw new DiningcodeSearchError(
      `response not JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!isObject(json)) {
    throw new DiningcodeSearchError('unexpected response shape');
  }
  const code = json['result_code'];
  if (code !== '100') {
    const msg = typeof json['result_msg'] === 'string' ? json['result_msg'] : 'unknown';
    throw new DiningcodeSearchError(`api error ${String(code)}: ${msg}`);
  }

  const rd = isObject(json['result_data']) ? json['result_data'] : null;
  const poi = rd && isObject(rd['poi_section']) ? rd['poi_section'] : null;
  if (!poi) {
    throw new DiningcodeSearchError('result_data.poi_section missing');
  }

  const rawItems = Array.isArray(poi['list'])
    ? (poi['list'] as Array<Record<string, unknown>>)
    : [];
  const seen = new Set<string>();
  let items: DiningcodeSearchResult[] = [];
  for (const r of rawItems) {
    const m = mapItem(r);
    if (!m) continue;
    if (seen.has(m.vRid)) continue;
    seen.add(m.vRid);
    items.push(m);
  }

  // strictDistance 후필터링 — 좌표+반경 모두 들어왔고 명시적 off 가 아니면
  // 반경 밖 항목 제거. 다이닝코드 응답 distance 문자열 ("451m" / "1.2km")이
  // 신뢰 가능한 단일 소스 — 항목 lat/lng 와 검색 center 거리를 직접 계산하면
  // EPSG:4326 평면 근사 오차가 도시 단위에선 무시 가능하지만, 응답이 이미
  // 정확한 값을 주므로 그걸 우선. 두 값 모두 없는 항목만 무시(보수적 PASS).
  const hasCoord =
    typeof options.lat === 'number' &&
    typeof options.lng === 'number' &&
    Number.isFinite(options.lat) &&
    Number.isFinite(options.lng);
  const radiusM = options.distance ?? null;
  const shouldFilter =
    hasCoord && radiusM !== null && options.strictDistance !== false;
  let filteredOutCount = 0;
  if (shouldFilter) {
    const center = { lat: options.lat!, lng: options.lng! };
    const before = items.length;
    items = items.filter((it) => withinRadius(it, center, radiusM!));
    filteredOutCount = before - items.length;
  }

  // 서버 echo 의 params.from/size 가 우선 — order 등 보정값을 그대로 노출.
  // rd 는 위에서 null check 통과했지만 strictDistance 블록을 거치며 narrowing
  // 이 풀려 다시 확인 (TS narrow drift 회피).
  const echoParams =
    rd && isObject(rd['params']) ? (rd['params'] as Record<string, unknown>) : {};
  const echoFrom = numOrNull(echoParams['from']);
  const echoSize = numOrNull(echoParams['size']);
  const total = intOrZero(poi['total_cnt']);
  const meta = extractMeta(poi);
  const actualFrom = echoFrom !== null ? Math.trunc(echoFrom) : from;
  const actualSize = echoSize !== null ? Math.trunc(echoSize) : size;
  const hasMore = items.length > 0 && actualFrom + items.length < total;

  return {
    items,
    total,
    from: actualFrom,
    size: actualSize,
    hasMore,
    meta,
    source: 'http',
    elapsedMs: Date.now() - t0,
    filteredOutCount,
  };
};

// 응답 distance 문자열 ("451m" / "1.2km" / "" / null) → 미터(number).
// 다이닝코드는 항상 m / km 단위만 쓴다(실측). 파싱 실패면 null.
const parseDistanceM = (raw: string | null): number | null => {
  if (!raw) return null;
  const m = raw.match(/^([\d.]+)\s*(m|km)$/i);
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return null;
  return m[2]!.toLowerCase() === 'km' ? v * 1000 : v;
};

// 응답 lat/lng 와 center 거리(미터). EPSG:4326 평면 근사 — 도시 스케일에서
// 충분한 정확도, 비싸지 않다. 응답 distance 문자열을 우선 사용하므로 폴백용.
const haversineM = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const withinRadius = (
  item: DiningcodeSearchResult,
  center: { lat: number; lng: number },
  radiusM: number,
): boolean => {
  // 1순위: 응답이 박아준 distance 문자열. 가장 신뢰 가능 (다이닝코드가 자체
  // 계산한 값이라 단위/기준 일관).
  const respDist = parseDistanceM(item.distance);
  if (respDist !== null) return respDist <= radiusM;
  // 2순위: lat/lng 직접 계산.
  if (item.lat !== null && item.lng !== null) {
    return haversineM(center, { lat: item.lat, lng: item.lng }) <= radiusM;
  }
  // 둘 다 없으면 판정 불가 — 보수적으로 통과 (드랍하면 좌표 없는 가게가
  // 항상 사라져 데이터 가시성이 나빠짐).
  return true;
};
