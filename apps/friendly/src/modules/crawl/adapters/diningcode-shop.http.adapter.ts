// 다이닝코드 가게 상세 어댑터.
//
// endpoint: POST https://im.diningcode.com/API/profile/
//   Content-Type: application/x-www-form-urlencoded
//   body: v_rid=<vRid>[&tab=review|blog&page=<N>]
//
// 응답은 result_data 가 16개 섹션의 배열. 핵심 섹션만 추려서 평탄한 객체로
// 정규화. 검색과 마찬가지로 CORS 열려있고 CF 보호 없음 — Playwright 불필요.
// 단일 호출 ~150-400ms.
//
// 페이지네이션:
//   - tab 미지정: review 첫 페이지(4-5건) + blog 첫 페이지 + 모든 메타 데이터
//   - tab=review&page=N: 같은 endpoint 호출이지만 review 페이지만 갈아끼움.
//     응답은 여전히 16섹션 다 옴 (대역폭 낭비) — 리뷰 페이지네이션을 자주
//     하는 화면에선 어댑터가 review 섹션만 추려 반환.

import type {
  DiningcodeShopDataType,
  DiningcodeShopReviewType,
  DiningcodeShopReviewsResponseType,
  DiningcodeShopReviewsSectionType,
} from '@repo/api-contract';

type ScoreSliceT = NonNullable<
  DiningcodeShopDataType['scoreDetail']
>['tasteInfo'] extends infer B
  ? B extends { good: infer G }
    ? G
    : never
  : never;

type ScoreBucketT = NonNullable<
  DiningcodeShopDataType['scoreDetail']
>['tasteInfo'];

const ENDPOINT = 'https://im.diningcode.com/API/profile/';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = Number(process.env.CRAWL_DININGCODE_TIMEOUT_MS ?? '8000');

export interface DiningcodeShopOptions {
  signal?: AbortSignal;
}

export class DiningcodeShopError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'DiningcodeShopError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const strOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

const httpUrlOrNull = (v: unknown): string | null => {
  const s = strOrNull(v);
  if (!s) return null;
  // 다이닝코드 일부 응답이 protocol 누락 URL ("blog.naver.com/...") 을 박아 보냄
  // — zod 가 .url() 에서 reject 하므로 어댑터가 https:// 보강 후 반환.
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

const intOrZero = (v: unknown): number => {
  const n = numOrNull(v);
  return n !== null ? Math.trunc(n) : 0;
};

// 다이닝코드는 카운트류를 종종 string 으로 — "0,1185" 등 콤마 포함 케이스도 방어.
const parseIntLoose = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''));
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return 0;
};

// 응답이 string array 일 때만 정상값으로 보고 빈 배열로 폴백.
const strArray = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === 'string' && s.length > 0);
};

const findSection = (
  sections: unknown[],
  key: string,
): Record<string, unknown> | null => {
  for (const s of sections) {
    if (isObject(s) && s['key'] === key) return s;
  }
  return null;
};

// ── 핵심 매퍼들 ─────────────────────────────────────────────────────────

const mapImage = (
  raw: Record<string, unknown>,
): DiningcodeShopDataType['images'][number] | null => {
  const origin = httpUrlOrNull(raw['origin']);
  const thumb = httpUrlOrNull(raw['thumb']);
  const middle = httpUrlOrNull(raw['middle']);
  if (!origin || !thumb || !middle) return null;
  return {
    pdId: strOrNull(raw['pd_id']),
    origin,
    thumb,
    middle,
    uploaderName: strOrNull(raw['user_name']),
    uploaderProfileImg: httpUrlOrNull(raw['user_photo']),
    date: strOrNull(raw['date']),
    type: strOrNull(raw['type']),
  };
};

const mapReviewImage = (
  raw: Record<string, unknown>,
): DiningcodeShopReviewType['images'][number] | null => {
  const origin = httpUrlOrNull(raw['origin']);
  const thumb = httpUrlOrNull(raw['thumb']);
  const middle = httpUrlOrNull(raw['middle']);
  if (!origin || !thumb || !middle) return null;
  return {
    pdId: strOrNull(raw['pd_id']),
    type: strOrNull(raw['type']) ?? 'PHOTO',
    origin,
    thumb,
    middle,
  };
};

const mapReview = (
  raw: Record<string, unknown>,
): DiningcodeShopReviewType | null => {
  const info = isObject(raw['review_info']) ? raw['review_info'] : null;
  const user = isObject(raw['user_info']) ? raw['user_info'] : null;
  if (!info) return null;
  const rvId = strOrNull(info['rv_id']);
  if (!rvId) return null;

  const userLevel = isObject(user?.['user_level']) ? user!['user_level'] : null;
  const reply = isObject(info['reply_info']) ? info['reply_info'] : null;
  // 다이닝코드는 답글 없을 때 reply_dt 를 "1970년 1월 1일" 로 박는다 — 가짜값
  // 통과시키지 않게 reply_comment 가 있을 때만 답글 노출.
  const hasReply =
    !!reply && strOrNull(reply['reply_comment']) !== null;

  const imgs = Array.isArray(info['review_img'])
    ? (info['review_img'] as Array<Record<string, unknown>>)
        .map(mapReviewImage)
        .filter((x): x is DiningcodeShopReviewType['images'][number] => x !== null)
    : [];

  return {
    rvId,
    vRvid: strOrNull(info['v_rvid']) ?? '',
    vUid: strOrNull(info['v_uid']) ?? '',
    userName: strOrNull(user?.['user_nm']),
    userProfileImg: httpUrlOrNull(user?.['user_profile_img']),
    userLevelCode: strOrNull(userLevel?.['cd']),
    reviewDt: strOrNull(info['review_dt']) ?? '',
    // review_total_score 는 string ("5") 으로 옴.
    totalScore: numOrNull(info['review_total_score']) !== null
      ? Math.trunc(numOrNull(info['review_total_score'])!)
      : null,
    tasteScore: strOrNull(info['review_taste_score']),
    serviceScore: strOrNull(info['review_service_score']),
    priceScore: strOrNull(info['review_price_score']),
    cleanScore: strOrNull(info['review_clean_score']),
    content: strOrNull(info['review_cont']),
    keywords: strArray(info['review_keyword']),
    images: imgs,
    orderMenu: strArray(info['order_menu']),
    replyComment: hasReply ? strOrNull(reply!['reply_comment']) : null,
    replyDt: hasReply ? strOrNull(reply!['reply_dt']) : null,
    replyPartner: hasReply ? strOrNull(reply!['reply_partner']) : null,
    favoritesCount: parseIntLoose(info['review_favorites_cnt'] ?? info['review_favorite_cnt']),
  };
};

const mapReviewsSection = (
  sec: Record<string, unknown> | null,
): DiningcodeShopReviewsSectionType => {
  if (!sec) {
    return { page: 1, totalCount: 0, totalPage: 0, list: [] };
  }
  const list = Array.isArray(sec['list'])
    ? (sec['list'] as Array<Record<string, unknown>>)
        .map(mapReview)
        .filter((x): x is DiningcodeShopReviewType => x !== null)
    : [];
  return {
    page: parseIntLoose(sec['page'] ?? 1) || 1,
    totalCount: parseIntLoose(sec['total_cnt']),
    totalPage: parseIntLoose(sec['total_page']),
    list,
  };
};

const mapMenu = (
  raw: Record<string, unknown>,
): DiningcodeShopDataType['menus'][number] | null => {
  const name = strOrNull(raw['menu']);
  if (!name) return null;
  return {
    name,
    price: strOrNull(raw['price']),
    description: strOrNull(raw['description']),
    rank: parseIntLoose(raw['rank']),
    best: parseIntLoose(raw['best']) === 1,
    selectionCount: parseIntLoose(raw['selection_count']),
    selectionRate: parseIntLoose(raw['selection_rate']),
    reviewCount: parseIntLoose(raw['review_count']),
    commentCount: parseIntLoose(raw['comment_count']),
  };
};

const mapBlog = (
  raw: Record<string, unknown>,
): DiningcodeShopDataType['blogsFirstPage']['list'][number] | null => {
  const pId = strOrNull(raw['p_id']);
  const title = strOrNull(raw['title']);
  const url = strOrNull(raw['url']);
  if (!pId || !title || !url) return null;
  return {
    pId,
    title,
    // protocol 없는 URL 도 그대로 — schema 가 url() 아니라 string 으로 받는다.
    url,
    contents: strOrNull(raw['contents']),
    nickname: strOrNull(raw['nickname']),
    image: httpUrlOrNull(raw['image']),
    site: strOrNull(raw['site']),
    date: strOrNull(raw['date']),
  };
};

const mapBlogsSection = (
  sec: Record<string, unknown> | null,
): DiningcodeShopDataType['blogsFirstPage'] => {
  if (!sec) return { page: 1, totalPage: 0, list: [] };
  const list = Array.isArray(sec['list'])
    ? (sec['list'] as Array<Record<string, unknown>>)
        .map(mapBlog)
        .filter((x): x is DiningcodeShopDataType['blogsFirstPage']['list'][number] => x !== null)
    : [];
  return {
    page: parseIntLoose(sec['page'] ?? 1) || 1,
    totalPage: parseIntLoose(sec['total_page']),
    list,
  };
};

const mapBusinessHour = (
  raw: Record<string, unknown>,
): DiningcodeShopDataType['businessHours'][number] | null => {
  const duration = strOrNull(raw['duration']);
  const time = strOrNull(raw['time']);
  if (!duration || !time) return null;
  return { duration, time, today: raw['today'] === true };
};

const mapScoreSlice = (raw: unknown): ScoreSliceT => {
  if (!isObject(raw)) return { text: null, percent: 0 };
  return {
    text: strOrNull(raw['text']),
    percent: parseIntLoose(raw['percent']),
  };
};

const mapScoreBucket = (raw: unknown): ScoreBucketT => {
  if (!isObject(raw)) return null;
  return {
    average: numOrNull(raw['average']),
    good: mapScoreSlice(raw['good']),
    normal: mapScoreSlice(raw['normal']),
    bad: mapScoreSlice(raw['bad']),
  };
};

const mapScore = (
  sec: Record<string, unknown> | null,
): DiningcodeShopDataType['scoreDetail'] => {
  if (!sec) return null;
  const s = isObject(sec['score']) ? sec['score'] : null;
  if (!s) return null;
  return {
    average: numOrNull(s['average']),
    total: parseIntLoose(s['total']),
    reviewTotal: parseIntLoose(s['review_total']),
    taste: numOrNull(s['taste']),
    service: numOrNull(s['service']),
    price: numOrNull(s['price']),
    clean: numOrNull(s['clean']),
    distribution: {
      s5: parseIntLoose(s['score5']),
      s4_5: parseIntLoose(s['score4_5']),
      s4: parseIntLoose(s['score4']),
      s3_5: parseIntLoose(s['score3_5']),
      s3: parseIntLoose(s['score3']),
      s2: parseIntLoose(s['score2']),
      s1: parseIntLoose(s['score1']),
    },
    tasteInfo: mapScoreBucket(s['taste_info']),
    priceInfo: mapScoreBucket(s['price_info']),
    serviceInfo: mapScoreBucket(s['service_info']),
    cleanInfo: mapScoreBucket(s['clean_info']),
    text: strOrNull(s['text']),
  };
};

// ── 내부 fetch 헬퍼 ──────────────────────────────────────────────────────

interface ProfileFetchResult {
  sections: unknown[];
  elapsedMs: number;
}

const fetchProfile = async (
  body: URLSearchParams,
  signal?: AbortSignal,
): Promise<ProfileFetchResult> => {
  const t0 = Date.now();
  const ac = signal ? null : new AbortController();
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
      body: body.toString(),
      signal: signal ?? ac?.signal,
    });
  } catch (e) {
    throw new DiningcodeShopError(
      e instanceof Error ? `fetch failed: ${e.message}` : 'fetch failed',
      e,
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!res.ok) throw new DiningcodeShopError(`status ${res.status}`);

  let json: unknown = null;
  try {
    json = await res.json();
  } catch (e) {
    throw new DiningcodeShopError(
      `response not JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!isObject(json)) throw new DiningcodeShopError('unexpected response shape');
  const code = json['result_code'];
  if (code !== '100') {
    const msg = typeof json['result_msg'] === 'string' ? json['result_msg'] : 'unknown';
    throw new DiningcodeShopError(`api error ${String(code)}: ${msg}`);
  }

  const rd = json['result_data'];
  if (!Array.isArray(rd)) {
    throw new DiningcodeShopError('result_data missing or not array');
  }
  return { sections: rd, elapsedMs: Date.now() - t0 };
};

// ── public API ──────────────────────────────────────────────────────────

export const fetchDiningcodeShop = async (
  vRid: string,
  options: DiningcodeShopOptions = {},
): Promise<DiningcodeShopDataType> => {
  const trimmed = vRid.trim();
  if (!trimmed) throw new DiningcodeShopError('vRid is empty');

  const body = new URLSearchParams();
  body.set('v_rid', trimmed);

  const { sections, elapsedMs } = await fetchProfile(body, options.signal);

  const restaurant = findSection(sections, 'restaurant');
  if (!restaurant) {
    throw new DiningcodeShopError('restaurant section missing');
  }
  const detail = findSection(sections, 'detail');
  const menuSec = findSection(sections, 'menu');
  const photoSec = findSection(sections, 'photo');
  const reviewSec = findSection(sections, 'review');
  const blogSec = findSection(sections, 'blog');
  const tagSec = findSection(sections, 'tag');

  // restaurant.images 는 {list:[]} object (배열 아님). list 안의 항목만 추출.
  const imagesRaw =
    isObject(restaurant['images']) && Array.isArray(restaurant['images']['list'])
      ? (restaurant['images']['list'] as Array<Record<string, unknown>>)
      : [];
  const images = imagesRaw
    .map(mapImage)
    .filter((x): x is DiningcodeShopDataType['images'][number] => x !== null);

  const photos = photoSec && Array.isArray(photoSec['list'])
    ? (photoSec['list'] as Array<Record<string, unknown>>)
        .map(mapImage)
        .filter((x): x is DiningcodeShopDataType['photos'][number] => x !== null)
    : [];

  const menus = menuSec && Array.isArray(menuSec['list'])
    ? (menuSec['list'] as Array<Record<string, unknown>>)
        .map(mapMenu)
        .filter((x): x is DiningcodeShopDataType['menus'][number] => x !== null)
    : [];

  const businessHours = detail && Array.isArray(detail['bhour'])
    ? (detail['bhour'] as Array<Record<string, unknown>>)
        .map(mapBusinessHour)
        .filter((x): x is DiningcodeShopDataType['businessHours'][number] => x !== null)
    : [];
  const businessHoursSummary = detail && Array.isArray(detail['bhour_seo'])
    ? (detail['bhour_seo'] as Array<Record<string, unknown>>)
        .map(mapBusinessHour)
        .filter((x): x is DiningcodeShopDataType['businessHours'][number] => x !== null)
    : [];

  // detail.status 가 종일/오늘 휴무에 따라 다른 shape — 한 객체로만 옴.
  const statusRaw = detail && isObject(detail['status']) ? detail['status'] : null;
  const status = statusRaw
    ? {
        isOpen: strOrNull(statusRaw['is_open']),
        color: strOrNull(statusRaw['color']),
        time: strOrNull(statusRaw['time']),
      }
    : null;

  // detail.tag / detail.facility 는 응답이 ", 백년가체" 처럼 공백 prefix 가 붙는
  // 케이스가 있어 trim.
  const cleanList = (v: unknown): string[] =>
    strArray(v).map((s) => s.trim()).filter((s) => s.length > 0);

  const rn = strOrNull(restaurant['rn']) ?? '';
  const branch = strOrNull(restaurant['branch']);
  const fullName = strOrNull(restaurant['name']) ?? (branch ? `${rn} ${branch}` : rn);

  return {
    vRid: trimmed,
    name: rn,
    branch,
    fullName,
    area: strOrNull(restaurant['area']),
    categories: cleanList(restaurant['categories']),
    descTags: cleanList(restaurant['desc']),
    score: numOrNull(restaurant['score']) !== null
      ? Math.trunc(numOrNull(restaurant['score'])!)
      : null,
    address: strOrNull(detail?.['address']),
    roadAddress: strOrNull(detail?.['road_address']),
    phone: strOrNull(detail?.['phone']) ?? strOrNull(restaurant['phone']),
    lat: numOrNull(restaurant['lat']),
    lng: numOrNull(restaurant['lng']),
    thumbnailUrl: httpUrlOrNull(restaurant['img']),
    images,
    photos,
    tags: cleanList(detail?.['tag']),
    facilities: cleanList(detail?.['facility']),
    status,
    businessHours,
    businessHoursSummary,
    menus,
    menuTotalCount: parseIntLoose(menuSec?.['menu_total_count']),
    hasPopularMenu: menuSec?.['has_popular_menu'] === true,
    scoreDetail: mapScore(findSection(sections, 'score')),
    reviewsFirstPage: mapReviewsSection(reviewSec),
    blogsFirstPage: mapBlogsSection(blogSec),
    wordcloudUrl: httpUrlOrNull(tagSec?.['word']),
    wordcloudUrlMobile: httpUrlOrNull(tagSec?.['word_m']),
    rawSourceUrl: `https://www.diningcode.com/profile.php?rid=${encodeURIComponent(trimmed)}`,
    fetchedAt: new Date().toISOString(),
    elapsedMs,
    source: 'http',
  };
};

// 리뷰 페이지네이션 — 같은 endpoint 에 tab=review&page=N 으로 호출. 응답이
// 전체 16섹션 다 오지만 review 만 추려서 가볍게 반환 (실제 응답 크기와 무관하게
// JSON.stringify 했을 때의 wire size 만 작아진다).
export const fetchDiningcodeShopReviews = async (
  vRid: string,
  page: number,
  options: DiningcodeShopOptions = {},
): Promise<DiningcodeShopReviewsResponseType> => {
  const trimmed = vRid.trim();
  if (!trimmed) throw new DiningcodeShopError('vRid is empty');
  const safePage = Math.max(1, Math.trunc(page));

  const body = new URLSearchParams();
  body.set('v_rid', trimmed);
  body.set('tab', 'review');
  body.set('page', String(safePage));

  const { sections, elapsedMs } = await fetchProfile(body, options.signal);
  const sec = mapReviewsSection(findSection(sections, 'review'));

  return {
    vRid: trimmed,
    page: sec.page,
    totalCount: sec.totalCount,
    totalPage: sec.totalPage,
    list: sec.list,
    source: 'http',
    elapsedMs,
  };
};
