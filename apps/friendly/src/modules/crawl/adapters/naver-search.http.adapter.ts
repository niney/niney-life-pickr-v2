// 네이버 모바일 nx-api GraphQL 을 직접 호출해 좌표 기반 식당 검색을 수행하는
// 어댑터. 옛 Playwright 기반 PC `allSearch` 어댑터와 달리 페이지 띄우기가
// 필요 없어 매우 가볍다 (검색당 ~100-300ms vs Playwright ~1100ms).
//
// endpoint: POST https://nx-api.place.naver.com/graphql
//   operationName: getItems (임의 — server side 검증 거의 없음)
//   variables.input: { query, x, y, start, display, isNx }
//
// 핵심 동작:
//   - x/y 좌표가 영역 한정자 — 같은 검색어로 좌표만 바꾸면 결과 영역도 바뀐다
//     (강남역 좌표 + "맛집" → 강남 가게들 / 해운대 좌표 + "맛집" → 해운대 가게들)
//   - query 필수 (빈 query → 0 결과). 사용자 미입력 시 DEFAULT_QUERY 박는다.
//   - 검색어에 영역명 박지 말 것 — 좌표 무시되고 검색어가 영역 결정 (충돌).
//     "강남구 맛집" + 해운대 좌표 → 강남 결과 (좌표는 distance 계산용으로만).
//   - display 1~99 (100 이상 거부), 페이지네이션 ~300개까지.
//   - GraphQL 응답이지만 schema 가 비공식 — 우리가 query 자체 정의.

const ENDPOINT = 'https://nx-api.place.naver.com/graphql';

// 모바일 UA. 데스크톱 UA 로 바꿔도 동작은 하지만 모바일 origin 으로 일관 유지.
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// 빈 query 박혀 들어오면 이걸로 대체. 페이지의 default 와 동일 (음식점 일반).
const DEFAULT_QUERY = '맛집';
// bbox/coord 모두 안 들어오면 이 좌표 박는다. 페이지가 default 로 박는 좌표와
// 일치 (서울시청). 어드민 발견 페이지의 정상 흐름에서는 viewport center 가 항상
// 들어와 이 default 가 사용되는 일이 거의 없어야 — 안전망.
const DEFAULT_CENTER = { lng: 126.9783882, lat: 37.5666103 };

const MAX_PAGE_SIZE = 99;
const DEFAULT_PAGE_SIZE = 50;

const FETCH_TIMEOUT_MS = Number(process.env.CRAWL_SEARCH_HTTP_TIMEOUT_MS ?? '8000');

export interface NaverSearchResult {
  placeId: string;
  name: string;
  category: string | null;
  address: string | null;
  roadAddress: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  thumbnailUrl: string | null;
  reviewCount: number | null;
  // 검색 좌표(center)로부터의 거리. nx-api 가 string 으로 노출 — 예: "350m", "1.2km".
  // 좌표가 없거나 응답에 안 실리면 null.
  distance: string | null;
  // url-normalizer 가 placeId 를 추출 가능한 정규 진입 URL.
  // FE 가 startCrawl 에 그대로 넘기면 기존 파이프라인이 동작한다.
  rawSourceUrl: string;
}

export interface NaverSearchOptions {
  // bbox "minLng,minLat,maxLng,maxLat" — center 자동 추출.
  bbox?: string;
  // 직접 좌표 (bbox 보다 우선).
  coord?: { lng: number; lat: number };
  // 1-based 페이지 번호.
  page?: number;
  // 1~99. limit 도 같은 의미로 받음 (옛 시그니처 호환).
  pageSize?: number;
  limit?: number;
  signal?: AbortSignal;
  // 응답을 bbox 안 가게만 후필터링. 좁은 영역 정밀 한정용 — 네이버는 좌표
  // center 기반 정렬만 하고 bbox 강제는 안 하므로, 사용자가 좁은 영역만
  // 원하면 이 옵션이 도움.
  filterByBbox?: boolean;
}

export class NaverSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NaverSearchError';
  }
}

// fragment 의 필드 셋은 Phase 7 introspection-by-error 로 검증된 것.
// 추가하고 싶은 필드는 schema 에러 메시지("Did you mean")로 알아낼 수 있음.
const QUERY = `query getItems($input: RestaurantListInput) {
  restaurantList(input: $input) {
    total
    items {
      id
      name
      category
      x
      y
      address
      roadAddress
      fullAddress
      phone
      virtualPhone
      visitorReviewCount
      blogCafeReviewCount
      bookingReviewCount
      totalReviewCount
      reviewCount
      visitorReviewScore
      imageUrl
      imageUrls
      tags
      microReview
      businessHours
      bookingUrl
      hasBooking
      naverBookingCategory
      distance
      routeUrl
      businessCategory
      franchiseValue
      __typename
    }
    __typename
  }
}`;

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

// reviewCount 는 응답에 string with comma 로 옴 ("3,651"). 숫자 변환.
const parseReviewCount = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v.replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const parseBboxCenter = (bbox: string | undefined): { lng: number; lat: number } | null => {
  if (!bbox) return null;
  const parts = bbox.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
  return { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 };
};

const inBbox = (
  pt: { lat: number | null; lng: number | null },
  bboxStr: string,
): boolean => {
  if (pt.lat === null || pt.lng === null) return false;
  const parts = bboxStr.split(',').map(Number);
  if (parts.length !== 4) return false;
  const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
  return pt.lng >= minLng && pt.lng <= maxLng && pt.lat >= minLat && pt.lat <= maxLat;
};

const mapItem = (raw: Record<string, unknown>): NaverSearchResult | null => {
  const placeId = strOrNull(raw['id']);
  const name = strOrNull(raw['name']);
  if (!placeId || !name) return null;

  return {
    placeId,
    name,
    category: strOrNull(raw['category']),
    // fullAddress (예: "서울특별시 강남구 역삼동 817-38 1층") 가 풀 주소.
    // address (예: "역삼동 817-38") 는 시/구 빠진 약식이라 fullAddress 우선.
    address: strOrNull(raw['fullAddress']) ?? strOrNull(raw['address']),
    roadAddress: strOrNull(raw['roadAddress']),
    // 좌표는 string 으로 옴 — Number 변환.
    lat: numOrNull(raw['y']),
    lng: numOrNull(raw['x']),
    // 직영=phone, 가맹=virtualPhone — 둘 중 있는 거.
    phone: strOrNull(raw['phone']) ?? strOrNull(raw['virtualPhone']),
    thumbnailUrl: strOrNull(raw['imageUrl']),
    // total > visitor > review 우선순위 (실제 응답에선 totalReviewCount 가
    // 가장 자주 채워짐). 모두 string-with-comma 형식이라 parseReviewCount 가 처리.
    reviewCount:
      parseReviewCount(raw['totalReviewCount']) ??
      parseReviewCount(raw['visitorReviewCount']) ??
      parseReviewCount(raw['reviewCount']),
    distance: strOrNull(raw['distance']),
    rawSourceUrl: `https://map.naver.com/p/entry/place/${placeId}`,
  };
};

// nx-api GraphQL 호출. 키워드 검색 + 좌표 영역 한정.
// 옛 Playwright 어댑터의 시그니처(`searchPlacesViaMapNaver(query, options)`)와
// 호환되도록 같은 이름으로 export — service 는 import 경로만 바꾸면 된다.
export const searchPlacesViaMapNaver = async (
  query: string,
  options: NaverSearchOptions = {},
): Promise<NaverSearchResult[]> => {
  const trimmed = query.trim();
  const queryFinal = trimmed.length > 0 ? trimmed : DEFAULT_QUERY;

  const center =
    options.coord ?? parseBboxCenter(options.bbox) ?? DEFAULT_CENTER;

  const pageSize = Math.min(
    Math.max(options.pageSize ?? options.limit ?? DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const page = Math.max(options.page ?? 1, 1);
  const start = (page - 1) * pageSize + 1;

  const body = JSON.stringify([
    {
      operationName: 'getItems',
      variables: {
        input: {
          query: queryFinal,
          x: String(center.lng),
          y: String(center.lat),
          start,
          display: pageSize,
          isNx: true,
        },
      },
      query: QUERY,
    },
  ]);

  // signal 이 없으면 자체 timeout — 외부 호출이라 stuck 방지.
  const ac = options.signal ? null : new AbortController();
  const timeoutId = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Referer: 'https://m.search.naver.com/',
        Origin: 'https://m.search.naver.com',
        'User-Agent': MOBILE_UA,
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
      body,
      signal: options.signal ?? ac?.signal,
    });
  } catch (e) {
    throw new NaverSearchError(
      e instanceof Error ? `fetch failed: ${e.message}` : 'fetch failed',
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!res.ok) {
    throw new NaverSearchError(`status ${res.status}`);
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch (e) {
    throw new NaverSearchError(
      `response not JSON: ${e instanceof Error ? e.message : e}`,
    );
  }

  // GraphQL 응답은 batch (배열) 또는 단일 객체.
  const op = Array.isArray(json) ? (json as Array<unknown>)[0] : json;
  if (!isObject(op)) {
    throw new NaverSearchError('unexpected response shape');
  }

  const errs = op['errors'];
  if (Array.isArray(errs) && errs.length > 0) {
    const first = errs[0] as Record<string, unknown>;
    throw new NaverSearchError(
      `graphql error: ${String(first['message'] ?? 'unknown')}`,
    );
  }

  const data = isObject(op['data']) ? (op['data'] as Record<string, unknown>) : null;
  const list =
    data && isObject(data['restaurantList'])
      ? (data['restaurantList'] as Record<string, unknown>)
      : null;
  const rawItems =
    list && Array.isArray(list['items'])
      ? (list['items'] as Array<Record<string, unknown>>)
      : [];

  const seenIds = new Set<string>();
  let items: NaverSearchResult[] = [];
  for (const r of rawItems) {
    const m = mapItem(r);
    if (!m) continue;
    if (seenIds.has(m.placeId)) continue;
    seenIds.add(m.placeId);
    items.push(m);
  }

  // bbox 안 가게만 후필터링. 좌표 center 만으론 영역이 좀 넓을 수 있어 좁은
  // 영역 한정이 필요할 때 사용.
  if (options.filterByBbox && options.bbox) {
    items = items.filter((it) =>
      inBbox({ lat: it.lat, lng: it.lng }, options.bbox!),
    );
  }

  return items;
};

