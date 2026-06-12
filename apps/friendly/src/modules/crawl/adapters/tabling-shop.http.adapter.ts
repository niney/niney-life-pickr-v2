// 테이블링 가게 상세 어댑터.
//
// host: https://mobile-v2-api.tabling.co.kr  (웹·앱 공유 백엔드, 무인증)
//   GET /v1/restaurant/:idx            — 기본 정보(좌표/주소/전화/평점/플래그)
//   GET /v1/restaurant/:idx/menu       — 메뉴(카테고리 → menus[])
//   GET /v1/review/restaurant/:idx     — 리뷰(커서 페이지네이션)
//
// CORS 열려 있고 토큰/쿠키 불필요 — 다이닝코드와 동일한 순수 HTTP 어댑터로,
// Playwright 불필요(캐치테이블과 대비). 좌표(lat/lng)가 응답에 들어와 머지에
// 그대로 쓸 수 있다. 상세 근거: docs/research/tabling-crawl-feasibility.md.

import type {
  TablingShopDataType,
  TablingShopReviewType,
  TablingShopReviewsResponseType,
} from '@repo/api-contract';

const HOST = 'https://mobile-v2-api.tabling.co.kr';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = Number(process.env.CRAWL_TABLING_TIMEOUT_MS ?? '8000');
// 리뷰 한 페이지 크기. 첫 페이지 + 일괄 저장 페이지네이션 공용.
const REVIEW_PAGE_SIZE = Number(process.env.CRAWL_TABLING_REVIEW_PAGE_SIZE ?? '20');

export interface TablingShopOptions {
  signal?: AbortSignal;
}

export class TablingShopError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'TablingShopError';
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
  // 테이블링은 좌표를 string("37.54...") 으로 내려보낸다.
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

const intOrZero = (v: unknown): number => intOrNull(v) ?? 0;

const boolOf = (v: unknown): boolean => v === true;

// string[] 만 통과, 그 외 빈 배열.
const strArray = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === 'string' && s.length > 0);
};

// ── 내부 GET 헬퍼 ────────────────────────────────────────────────────────

const getJson = async (
  path: string,
  signal?: AbortSignal,
): Promise<{ json: unknown; status: number }> => {
  const ac = signal ? null : new AbortController();
  const timeoutId = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;

  let res: Response;
  try {
    res = await fetch(`${HOST}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Referer: 'https://www.tabling.co.kr/',
        Origin: 'https://www.tabling.co.kr',
        'User-Agent': DESKTOP_UA,
      },
      signal: signal ?? ac?.signal,
    });
  } catch (e) {
    throw new TablingShopError(
      e instanceof Error ? `fetch failed: ${e.message}` : 'fetch failed',
      e,
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { json, status: res.status };
};

// ── 매퍼 ─────────────────────────────────────────────────────────────────

const mapMenu = (
  raw: Record<string, unknown>,
): TablingShopDataType['menuCategories'][number]['menus'][number] | null => {
  const name = strOrNull(raw['name']);
  if (!name) return null;
  return {
    name,
    price: numOrNull(raw['price']),
    description: strOrNull(raw['description']),
    imageUrl: httpUrlOrNull(raw['imageUrl']),
    isFeatured: boolOf(raw['isFeatured']),
    isMain: boolOf(raw['isMain']),
  };
};

const mapMenuCategory = (
  raw: Record<string, unknown>,
): TablingShopDataType['menuCategories'][number] | null => {
  const categoryName = strOrNull(raw['categoryName']);
  if (!categoryName) return null;
  const menus = Array.isArray(raw['menus'])
    ? (raw['menus'] as Array<Record<string, unknown>>)
        .map(mapMenu)
        .filter((m): m is NonNullable<typeof m> => m !== null)
    : [];
  return {
    categoryName,
    categoryDescription: strOrNull(raw['categoryDescription']),
    menus,
  };
};

const mapTime = (
  raw: unknown,
): { startTime: string | null; endTime: string | null } | null => {
  if (!isObject(raw)) return null;
  return {
    startTime: strOrNull(raw['startTime']),
    endTime: strOrNull(raw['endTime']),
  };
};

const mapBusinessDay = (
  raw: Record<string, unknown>,
): TablingShopDataType['businessDays'][number] => {
  const open = Array.isArray(raw['openTimeList'])
    ? raw['openTimeList'].map(mapTime).filter((t): t is NonNullable<typeof t> => t !== null)
    : [];
  const brk = Array.isArray(raw['breakTimeList'])
    ? raw['breakTimeList'].map(mapTime).filter((t): t is NonNullable<typeof t> => t !== null)
    : [];
  return {
    dayOfWeek: intOrZero(raw['dayOfWeek']),
    dayStatus: strOrNull(raw['dayStatus']),
    openTimeList: open,
    breakTimeList: brk,
  };
};

const mapRating = (
  raw: unknown,
): TablingShopDataType['ratings'][number] | null => {
  if (!isObject(raw)) return null;
  const category = strOrNull(raw['category']);
  const points = numOrNull(raw['points']);
  if (!category || points === null) return null;
  return { category, points };
};

// 리뷰 이미지 항목은 string 또는 {imageUrl|url|origin} object 둘 다 가능 — 방어적 추출.
const reviewImageUrl = (raw: unknown): string | null => {
  if (typeof raw === 'string') return httpUrlOrNull(raw);
  if (isObject(raw)) {
    return (
      httpUrlOrNull(raw['imageUrl']) ??
      httpUrlOrNull(raw['url']) ??
      httpUrlOrNull(raw['origin']) ??
      httpUrlOrNull(raw['thumbnailUrl'])
    );
  }
  return null;
};

// menuOrders 항목도 string 또는 {name|menuName} object 가능.
const menuOrderName = (raw: unknown): string | null => {
  if (typeof raw === 'string') return raw.length > 0 ? raw : null;
  if (isObject(raw)) return strOrNull(raw['name']) ?? strOrNull(raw['menuName']);
  return null;
};

// reply 는 object(있을 때) 또는 null. 답글 텍스트만 추출.
const replyText = (raw: unknown): string | null => {
  if (typeof raw === 'string') return strOrNull(raw);
  if (isObject(raw)) {
    return (
      strOrNull(raw['contents']) ??
      strOrNull(raw['comment']) ??
      strOrNull(raw['text']) ??
      strOrNull(raw['reply'])
    );
  }
  return null;
};

const mapReview = (raw: Record<string, unknown>): TablingShopReviewType | null => {
  // 리뷰 idx 는 24-hex ObjectId 문자열(가게 idx 와 달리 숫자가 아님).
  const idx = strOrNull(raw['idx']);
  if (!idx) return null;
  const images = Array.isArray(raw['images'])
    ? raw['images'].map(reviewImageUrl).filter((u): u is string => u !== null)
    : [];
  const menuOrders = Array.isArray(raw['menuOrders'])
    ? raw['menuOrders'].map(menuOrderName).filter((m): m is string => m !== null)
    : [];
  return {
    idx,
    cursorId: strOrNull(raw['cursorId']),
    nickname: strOrNull(raw['nickname']),
    reviewDate: strOrNull(raw['reviewDate']),
    rating: numOrNull(raw['rating']),
    contents: strOrNull(raw['contents']),
    imageUrls: images,
    menuOrders,
    likeCount: intOrZero(raw['likeCount']),
    reply: replyText(raw['reply']),
    isBlinded: boolOf(raw['isBlinded']),
    // 서비스 레이어가 (source='tabling', sourceId=idx) Review.externalId='tb:rv:<idx>'
    // 매칭으로 주입 — 어댑터는 항상 null.
    summaryText: null,
  };
};

const mapReviewsSection = (
  json: unknown,
): { totalCount: number; imageReviewCount: number; list: TablingShopReviewType[] } => {
  if (!isObject(json)) return { totalCount: 0, imageReviewCount: 0, list: [] };
  const list = Array.isArray(json['reviews'])
    ? (json['reviews'] as Array<Record<string, unknown>>)
        .map(mapReview)
        .filter((r): r is TablingShopReviewType => r !== null)
    : [];
  return {
    totalCount: intOrZero(json['reviewTotalCount']),
    imageReviewCount: intOrZero(json['imageReviewTotalCount']),
    list,
  };
};

// ── public API ────────────────────────────────────────────────────────────

export const fetchTablingShop = async (
  idx: number,
  options: TablingShopOptions = {},
): Promise<TablingShopDataType> => {
  if (!Number.isInteger(idx) || idx <= 0) {
    throw new TablingShopError(`invalid idx: ${idx}`);
  }
  const t0 = Date.now();

  // 상세는 필수, 메뉴/리뷰는 best-effort(일부 가게는 404/빈 응답).
  const [detailRes, menuRes, reviewRes] = await Promise.all([
    getJson(`/v1/restaurant/${idx}`, options.signal),
    getJson(`/v1/restaurant/${idx}/menu`, options.signal).catch(() => ({ json: null, status: 0 })),
    getJson(
      `/v1/review/restaurant/${idx}?pageSize=${REVIEW_PAGE_SIZE}`,
      options.signal,
    ).catch(() => ({ json: null, status: 0 })),
  ]);

  if (detailRes.status === 404) {
    throw new TablingShopError(`restaurant ${idx} not found (404)`);
  }
  const d = detailRes.json;
  if (!isObject(d) || !strOrNull(d['name'])) {
    throw new TablingShopError(`restaurant ${idx}: unexpected detail shape`);
  }

  const menuList =
    isObject(menuRes.json) && Array.isArray(menuRes.json['list'])
      ? (menuRes.json['list'] as Array<Record<string, unknown>>)
          .map(mapMenuCategory)
          .filter((c): c is NonNullable<typeof c> => c !== null)
      : [];

  const ratings = Array.isArray(d['ratings'])
    ? d['ratings'].map(mapRating).filter((r): r is NonNullable<typeof r> => r !== null)
    : [];

  const businessDays = Array.isArray(d['restaurantTimes'])
    ? (d['restaurantTimes'] as Array<Record<string, unknown>>).map(mapBusinessDay)
    : [];

  return {
    idx,
    name: strOrNull(d['name']) ?? String(idx),
    excerpt: strOrNull(d['excerpt']),
    description: strOrNull(d['description']),
    category: strOrNull(d['categories']),
    address: strOrNull(d['address']),
    roadAddress: strOrNull(d['address1']),
    jibunAddress: strOrNull(d['address2']),
    addressDetail: strOrNull(d['addressDetail']),
    phone: strOrNull(d['tel']),
    lat: numOrNull(d['latitude']),
    lng: numOrNull(d['longitude']),
    rating: numOrNull(d['rating']),
    ratings,
    reviewTotalCount: intOrNull(d['reviewTotalCount']),
    favoriteCount: intOrNull(d['favoriteCount']),
    statusLabel: strOrNull(d['restaurantStatusLabel']),
    images: strArray(d['restaurantImages'])
      .map((u) => httpUrlOrNull(u))
      .filter((u): u is string => u !== null),
    menuCategories: menuList,
    businessDays,
    flags: {
      useWaiting: boolOf(d['useWaiting']),
      useRemoteWaiting: boolOf(d['useRemoteWaiting']),
      useReservation: boolOf(d['useReservation']),
      useTakeOut: boolOf(d['useTakeOut']),
      useOnSiteOrder: boolOf(d['useOnSiteOrder']),
    },
    waitingCount: intOrNull(d['waitingCount']),
    reviewsFirstPage: mapReviewsSection(reviewRes.json),
    rawSourceUrl: `https://www.tabling.co.kr/restaurant/${idx}`,
    fetchedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    source: 'http',
  };
};

// 리뷰 페이지네이션 — `lastIdx` 커서 기반. cursor 는 불투명 토큰으로, 실제로는
// 직전 페이지 마지막 리뷰의 idx(ObjectId)다(테이블링 API 파라미터명 `lastIdx`).
// cursor 미지정이면 첫 페이지. 응답이 페이지 크기만큼 차면 마지막 리뷰 idx 를
// nextCursor 로 돌려준다(리뷰의 cursorId 필드는 페이지네이션 토큰이 아님 — 주의).
export const fetchTablingShopReviews = async (
  idx: number,
  cursor?: string | null,
  options: TablingShopOptions = {},
): Promise<TablingShopReviewsResponseType> => {
  if (!Number.isInteger(idx) || idx <= 0) {
    throw new TablingShopError(`invalid idx: ${idx}`);
  }
  const t0 = Date.now();
  const params = new URLSearchParams();
  params.set('pageSize', String(REVIEW_PAGE_SIZE));
  if (cursor) params.set('lastIdx', cursor);

  const { json } = await getJson(
    `/v1/review/restaurant/${idx}?${params.toString()}`,
    options.signal,
  );
  const sec = mapReviewsSection(json);
  const last = sec.list.length > 0 ? sec.list[sec.list.length - 1] : null;
  const nextCursor =
    sec.list.length >= REVIEW_PAGE_SIZE && last ? last.idx : null;

  return {
    idx,
    totalCount: sec.totalCount,
    nextCursor,
    list: sec.list,
    source: 'http',
    elapsedMs: Date.now() - t0,
  };
};
