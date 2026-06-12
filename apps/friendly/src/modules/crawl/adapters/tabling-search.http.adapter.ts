// 테이블링 키워드 검색 어댑터.
//
// endpoint: POST https://mobile-v2-api.tabling.co.kr/v1/search/restaurants/map
//   Content-Type: application/json
//   body: {"search":"<keyword>","pageSize":20,"sort":"RECOMMEND","categories":[]
//          [,"last":[<prev page cursor array>]]}
//
// 웹·앱 검색창이 그대로 호출하는 무인증 Elasticsearch 백엔드. CORS 열려 있고
// 토큰/쿠키 불필요 — 다이닝코드/네이버 nx-api 와 동일한 순수 HTTP 어댑터. 응답
// 카드에 좌표·평점·추천메뉴가 실려 별도 상세 호출 전에도 등록 후보를 추릴 수
// 있다. 상세 근거: docs/research/tabling-crawl-feasibility.md §2.
//
// 핵심 동작:
//   - search 필수(빈 값은 라우트 zod 가 막음 → 어댑터는 trim 만).
//   - GET 아닌 POST. (조사 초기엔 GET 만 시도해 404 → "검색 API 없음" 으로
//     오판했다. 실제는 POST 라우트.)
//   - 페이지네이션은 응답 `last`(Elasticsearch search_after 토큰 — 길이 3 배열)를
//     다음 호출 body `last` 로 넘긴다. 경계에서 1건 겹칠 수 있어 호출자는
//     idx 로 dedup 한다.
//   - 정렬은 RECOMMEND(기본)·DISTANCE·RATING 만 유효(그 외 ONLY_SORT 400).
//   - 좌표 중심 파라미터가 없어 결과는 사실상 전국 키워드 매칭이다.

import type {
  TablingSearchResultType,
  TablingSearchResponseType,
  TablingSearchSortType,
} from '@repo/api-contract';

const ENDPOINT =
  'https://mobile-v2-api.tabling.co.kr/v1/search/restaurants/map';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DEFAULT_PAGE_SIZE = 20;
const FETCH_TIMEOUT_MS = Number(process.env.CRAWL_TABLING_TIMEOUT_MS ?? '8000');

export interface TablingSearchOptions {
  cursor?: string | null;
  pageSize?: number;
  sort?: TablingSearchSortType;
  signal?: AbortSignal;
}

export class TablingSearchError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'TablingSearchError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const strOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

const httpUrlOrNull = (v: unknown): string | null => {
  const s = strOrNull(v);
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const intOrNull = (v: unknown): number | null => {
  const n = numOrNull(v);
  return n !== null ? Math.trunc(n) : null;
};

const boolOf = (v: unknown): boolean => v === true;

// classification(+classification2)를 단일 카테고리 문자열로. 둘째가 있고 첫째와
// 다르면 " · " 결합("양식 · 이탈리안"), 없으면 첫째만.
const joinCategory = (raw: Record<string, unknown>): string | null => {
  const a = strOrNull(raw['classification']);
  const b = strOrNull(raw['classification2']);
  if (a && b && a !== b) return `${a} · ${b}`;
  return a ?? b;
};

const mapRecommendedMenu = (
  v: unknown,
): TablingSearchResultType['recommendedMenus'][number] | null => {
  if (!isObject(v)) return null;
  const name = strOrNull(v['name']);
  if (!name) return null;
  return {
    name,
    price: numOrNull(v['price']),
    imageUrl: httpUrlOrNull(v['imageUrl']),
  };
};

const mapResult = (raw: unknown): TablingSearchResultType | null => {
  if (!isObject(raw)) return null;
  const idx = intOrNull(raw['restaurantIdx']);
  const name = strOrNull(raw['restaurantName']);
  if (idx === null || idx <= 0 || !name) return null;

  const recommendedMenus = Array.isArray(raw['recommendedMenus'])
    ? raw['recommendedMenus']
        .map(mapRecommendedMenu)
        .filter((m): m is NonNullable<typeof m> => m !== null)
    : [];

  return {
    idx,
    name,
    category: joinCategory(raw),
    summaryAddress: strOrNull(raw['summaryAddress']),
    rating: numOrNull(raw['rating']),
    reviewCount: intOrNull(raw['reviewCount']),
    lat: numOrNull(raw['latitude']),
    lng: numOrNull(raw['longitude']),
    thumbnailUrl: httpUrlOrNull(raw['thumbnail']),
    excerpt: strOrNull(raw['excerpt']),
    isNew: boolOf(raw['isNew']),
    waitingCount: intOrNull(raw['waitingCount']),
    flags: {
      useWaiting: boolOf(raw['useWaiting']),
      useRemoteWaiting: boolOf(raw['useRemoteWaiting']),
      useReservation: boolOf(raw['useReservation']),
      useTakeOut: boolOf(raw['useTakeOut']),
      useOnSiteOrder: boolOf(raw['useOnSiteOrder']),
    },
    recommendedMenus,
    distance: strOrNull(raw['distance']),
    rawSourceUrl: `https://www.tabling.co.kr/restaurant/${idx}`,
  };
};

// 커서 문자열(JSON 직렬화된 `last` 배열) → body 에 실을 배열. 깨진 토큰은 무시.
const parseCursor = (cursor?: string | null): unknown[] | null => {
  if (!cursor) return null;
  try {
    const v = JSON.parse(cursor) as unknown;
    return Array.isArray(v) && v.length > 0 ? v : null;
  } catch {
    return null;
  }
};

export const fetchTablingSearch = async (
  keyword: string,
  options: TablingSearchOptions = {},
): Promise<TablingSearchResponseType> => {
  const search = keyword.trim();
  if (!search) throw new TablingSearchError('empty keyword');
  const t0 = Date.now();
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  const body: Record<string, unknown> = {
    search,
    pageSize,
    sort: options.sort ?? 'RECOMMEND',
    categories: [],
  };
  const last = parseCursor(options.cursor);
  if (last) body['last'] = last;

  const ac = options.signal ? null : new AbortController();
  const timeoutId = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Referer: 'https://www.tabling.co.kr/',
        Origin: 'https://www.tabling.co.kr',
        'User-Agent': DESKTOP_UA,
        // 실제 웹 클라이언트가 보내는 헤더 — 필수는 아니나 정합성 위해 동봉.
        'app-platform': 'WEB',
        'app-version': '4.11.0',
      },
      body: JSON.stringify(body),
      signal: options.signal ?? ac?.signal,
    });
  } catch (e) {
    throw new TablingSearchError(
      e instanceof Error ? `fetch failed: ${e.message}` : 'fetch failed',
      e,
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!res.ok) throw new TablingSearchError(`status ${res.status}`);

  let json: unknown = null;
  try {
    json = await res.json();
  } catch (e) {
    throw new TablingSearchError('invalid JSON response', e);
  }
  if (!isObject(json)) {
    throw new TablingSearchError('unexpected response shape');
  }
  // 에러 본문도 200 이 아닌 경우가 있어 error 키 방어(ONLY_SORT 등).
  if (isObject(json['error'])) {
    const code = strOrNull(json['error']['errorCode']) ?? 'unknown';
    throw new TablingSearchError(`tabling search error: ${code}`);
  }

  const list = Array.isArray(json['list'])
    ? json['list']
        .map(mapResult)
        .filter((r): r is TablingSearchResultType => r !== null)
    : [];

  // 다음 페이지 커서 — 응답 `last`(search_after 토큰). 한 페이지를 꽉 채웠고
  // last 가 비지 않은 배열일 때만 더 있다고 본다(끝 페이지는 부분 채움).
  const lastToken = json['last'];
  const hasFullPage = list.length >= pageSize;
  const nextCursor =
    hasFullPage && Array.isArray(lastToken) && lastToken.length > 0
      ? JSON.stringify(lastToken)
      : null;

  return {
    items: list,
    total: intOrNull(json['total']) ?? 0,
    nextCursor,
    source: 'http',
    elapsedMs: Date.now() - t0,
  };
};
