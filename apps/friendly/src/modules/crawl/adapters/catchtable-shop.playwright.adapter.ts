// 캐치테이블 가게 상세 추출 어댑터.
//
// 패턴: /ct/shop/{shopRef} 페이지에 진입하면 SPA가 자동으로 여러 API 를 호출
// 한다. page.on('response') 로 그 응답들을 모아 정규화한다 (네이버 place
// 어댑터와 같은 방식). 메뉴/리뷰처럼 lazy-loaded 영역은 페이지 안으로 스크롤
// 해 트리거한다.
//
// 자동 호출되는 핵심 API:
//   - GET /api/v4/shops/{ref}                   — 원본 가게 메타
//   - GET /api/display/v2/shops/{ref}           — 디스플레이용 정규화 메타 (지하철·주간 일정)
//   - GET /api/v4/shops/{ref}/disables          — 휴무일
//   - POST /api/v2/related-keywords/by-shop     — 관련 키워드
//   - GET /api/v4/shops/{ref}/bookmark/count    — 즐겨찾기 카운트
//
// 스크롤 후 lazy 호출 (best-effort — 잡히면 채움, 못 잡으면 null):
//   - 메뉴 (정확한 path 는 가게 contractState 에 따라 다른 듯)
//   - 리뷰 본문 일부
//
// 검색 어댑터(catchtable-search)와 별도 Browser 인스턴스로 격리해 모바일 UA
// 와 데스크톱 UA 혼선을 막는다 — naver-place / naver-search 분리 패턴과 동일.

import { chromium, type Browser, type BrowserContext } from 'playwright';

const SHOP_URL = (ref: string) => `https://app.catchtable.co.kr/ct/shop/${ref}`;

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HEADLESS = process.env.CATCHTABLE_HEADLESS !== '0';
const GOTO_TIMEOUT_MS = Number(process.env.CATCHTABLE_SHOP_GOTO_MS ?? '30000');
const NETWORK_IDLE_TIMEOUT_MS = Number(process.env.CATCHTABLE_SHOP_IDLE_MS ?? '12000');
// 메뉴/리뷰 lazy 영역까지 스크롤 후 응답이 도착할 시간.
const LAZY_SETTLE_MS = Number(process.env.CATCHTABLE_SHOP_LAZY_MS ?? '2500');

export interface CatchtableShopImage {
  thumbUrl: string;
  imgUrl: string;
  imgWidth: number | null;
  imgHeight: number | null;
}

export interface CatchtableShopSubway {
  lines: string[];
  station: string;
  distance: string;
}

export interface CatchtableShopReview {
  averageScore: number | null;
  totalCount: number;
  blogReviewCount: number;
  foodScore: number | null;
  ambienceScore: number | null;
  serviceScore: number | null;
}

export interface CatchtableShopScheduleDay {
  date: string | null;
  dayOfWeek: string | null;
  isClosed: boolean;
  startTime: string | null;
  endTime: string | null;
  breakStartTime: string | null;
  breakEndTime: string | null;
  lastOrderTime: string | null;
}

export interface CatchtableShopSchedule {
  today: CatchtableShopScheduleDay | null;
  weekly: Array<{
    dayOfWeek: string;
    isClosed: boolean;
    startTime: string | null;
    endTime: string | null;
  }>;
}

export interface CatchtableShopPriceRange {
  lunchMin: number | null;
  lunchMax: number | null;
  dinnerMin: number | null;
  dinnerMax: number | null;
  lunchText: string | null;
  dinnerText: string | null;
}

export interface CatchtableShopMenu {
  name: string;
  price: string | null;
  description: string | null;
  imageUrl: string | null;
}

export interface CatchtableShopReviewSample {
  authorName: string | null;
  score: number | null;
  body: string;
  visitedAt: string | null;
}

export interface CatchtableShopRelatedKeyword {
  label: string;
  type: string;
}

export interface CatchtableShopData {
  shopRef: string;
  alias: string | null;
  shopName: string;
  shopNameEn: string | null;
  category: string | null;
  landName: string | null;
  serviceDesc: string | null;
  address: string | null;
  addressDetail: string | null;
  lat: number | null;
  lon: number | null;
  subways: CatchtableShopSubway[];
  phone: string | null;
  images: CatchtableShopImage[];
  priceRange: CatchtableShopPriceRange;
  review: CatchtableShopReview;
  schedule: CatchtableShopSchedule | null;
  disableDays: string[];
  awardItems: string[];
  relatedKeywords: CatchtableShopRelatedKeyword[];
  bookmarkCount: number | null;
  mainService: string | null;
  contractState: string | null;
  exposeCatchtable: boolean;
  useOnline: boolean;
  useCatchtable: boolean;
  // lazy 영역. 응답을 못 잡으면 null (등록 안 된 가게 / 비가맹점일 때 빈도 큼).
  menus: CatchtableShopMenu[] | null;
  reviewSamples: CatchtableShopReviewSample[] | null;
  rawSourceUrl: string;
  fetchedAt: string;
  elapsedMs: number;
  source: 'playwright';
}

export class CatchtableShopError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'CatchtableShopError';
  }
}

let browserPromise: Promise<Browser> | null = null;
let contextPromise: Promise<BrowserContext> | null = null;

const getBrowser = (): Promise<Browser> => {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: HEADLESS });
  }
  return browserPromise;
};

const getContext = async (): Promise<BrowserContext> => {
  if (contextPromise) {
    const ctx = await contextPromise.catch(() => null);
    if (ctx) return ctx;
    contextPromise = null;
  }
  contextPromise = (async () => {
    const browser = await getBrowser();
    const ctx = await browser.newContext({
      userAgent: DESKTOP_UA,
      viewport: { width: 1280, height: 900 },
      locale: 'ko-KR',
    });
    // 가벼운 미리보기 — 폰트/이미지 비용을 줄여 페이지 hydrate 만 빠르게.
    await ctx.route('**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,ttf,mp4,m3u8,avif}', (route) =>
      route.abort(),
    );
    return ctx;
  })();
  return contextPromise;
};

// 응답 URL 매칭 헬퍼. shopRef 가 URL 안에 그대로 박혀 있는 응답이 가장 풍부.
// alias 로 호출되는 변종도 있어(같은 데이터 중복) 둘 다 받아두고 정규화에서
// 우선순위로 처리.
const includesShopMeta = (url: string, ref: string): boolean =>
  url.includes(`/api/v4/shops/${ref}`) &&
  !url.includes('/disables') &&
  !url.includes('/bookmark') &&
  !url.includes('/shop-open-subscription') &&
  !url.includes('/coupons');

const includesDisplay = (url: string, ref: string): boolean =>
  url.includes(`/api/display/v2/shops/${ref}`) && !url.includes('/sections/');

const includesDisplayAlias = (url: string): boolean =>
  /\/api\/display\/v2\/shops\/[A-Za-z0-9_-]+(?:\?|$|\/(?!sections))/.test(url) &&
  !url.includes('/sections/');

const includesDisables = (url: string, ref: string): boolean =>
  url.includes(`/api/v4/shops/${ref}/disables`);

const includesBookmark = (url: string, ref: string): boolean =>
  url.includes(`/api/v4/shops/${ref}/bookmark/count`);

const includesKeywords = (url: string): boolean =>
  url.includes('/api/v2/related-keywords/by-shop');

const includesMenu = (url: string): boolean =>
  /\/api\/v\d+\/shop\/(detail\/shopMenuInfo|menus)/.test(url) ||
  /\/api\/v\d+\/shops\/[A-Za-z0-9_-]+\/menus?(\?|$|\/)/.test(url);

const includesReview = (url: string): boolean =>
  /\/api\/v\d+\/review/.test(url) && !url.includes('/keywords');

export const fetchCatchtableShop = async (shopRef: string): Promise<CatchtableShopData> => {
  const trimmed = shopRef.trim();
  if (!trimmed) throw new CatchtableShopError('shopRef is empty');

  const t0 = Date.now();
  const ctx = await getContext();
  const page = await ctx.newPage();

  // 응답 모음. 같은 path 가 여러 번 발사되더라도 마지막 응답만 유지.
  const buckets: {
    shopMeta?: unknown;
    display?: unknown;
    displayAlias?: unknown;
    disables?: unknown;
    bookmark?: unknown;
    keywords?: unknown;
    menus: unknown[];
    reviews: unknown[];
  } = { menus: [], reviews: [] };

  const handleResponse = async (resp: import('playwright').Response): Promise<void> => {
    const url = resp.url();
    if (!url.includes('ct-api.catchtable.co.kr')) return;
    const ct = resp.headers()['content-type'] ?? '';
    if (!ct.includes('json')) return;
    let body: unknown = null;
    try {
      body = await resp.json();
    } catch {
      return;
    }
    if (includesShopMeta(url, trimmed)) buckets.shopMeta = body;
    else if (includesDisplay(url, trimmed)) buckets.display = body;
    else if (includesDisplayAlias(url)) buckets.displayAlias = body;
    else if (includesDisables(url, trimmed)) buckets.disables = body;
    else if (includesBookmark(url, trimmed)) buckets.bookmark = body;
    else if (includesKeywords(url)) buckets.keywords = body;
    else if (includesMenu(url)) buckets.menus.push(body);
    else if (includesReview(url)) buckets.reviews.push(body);
  };

  page.on('response', (r) => {
    void handleResponse(r);
  });

  try {
    await page.goto(SHOP_URL(trimmed), {
      waitUntil: 'domcontentloaded',
      timeout: GOTO_TIMEOUT_MS,
    });
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => undefined);
    // 페이지가 자동 호출하는 메타 응답이 다 도착할 시간.
    await page.waitForTimeout(800);

    // Lazy 트리거 — 메뉴·리뷰 영역까지 스크롤.
    for (const dy of [800, 1500, 2000, 2500]) {
      await page.mouse.wheel(0, dy).catch(() => undefined);
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(LAZY_SETTLE_MS);
  } catch (e) {
    await page.close().catch(() => undefined);
    throw new CatchtableShopError(`failed to load shop ${trimmed}`, e);
  }

  await page.close().catch(() => undefined);

  const data = normalize(trimmed, buckets, Date.now() - t0);
  return data;
};

// ── normalize ───────────────────────────────────────────────────────────────

interface ShopApiData {
  shopRef?: string;
  alias?: string;
  shopName?: string;
  shopNameEn?: string;
  foodKind?: string;
  landName?: string;
  serviceDesc?: string;
  shopPhone?: string;
  dispShopPhone?: string;
  shopAddress?: string;
  shopAddress2?: string;
  lat?: number;
  lon?: number;
  lunchPriceMin?: number;
  lunchPriceMax?: number;
  dinnerPriceMin?: number;
  dinnerPriceMax?: number;
  lunchPriceText?: string;
  dinnerPriceText?: string;
  lunchAndDinnerPriceText?: string;
  images?: Array<{ thumbUrl?: string; imgUrl?: string; imgWidth?: number; imgHeight?: number }>;
  review?: {
    finalScore?: string | number;
    foodScore?: string | number;
    ambienceScore?: string | number;
    serviceScore?: string | number;
    totalReviewCount?: number;
    totalBlogReviewCount?: number;
  };
  awardItemList?: Array<{ awardName?: string; name?: string }>;
  mainService?: string;
  exposeCatchTable?: boolean;
  useShopPhoneYn?: string;
}

interface DisplayApiData {
  alias?: string;
  shopRef?: string;
  shopName?: string;
  mainService?: string;
  useOnline?: boolean;
  useCatchtable?: boolean;
  exposeCatchtable?: boolean;
  contractState?: string;
  landName?: string;
  serviceDesc?: string;
  mainImages?: Array<{ thumbUrl?: string; imgUrl?: string; imgWidth?: number; imgHeight?: number }>;
  phoneInfo?: { useShopPhone?: boolean; shopPhone?: string; displayShopPhone?: string };
  addressInfo?: {
    shop?: { address?: string; location?: { lat?: number; lon?: number } };
    subways?: Array<{ subwayLines?: string[]; subwayStation?: string; distance?: string }>;
  };
  schedule?: {
    defaultSchedule?: {
      date?: string;
      dayOfWeek?: string;
      isClosed?: boolean;
      operationTime?: { startTime?: string | null; endTime?: string | null };
      breakTime?: { startTime?: string | null; endTime?: string | null };
      lastOrderTime?: string | null;
    };
    weeklySchedule?: { schedules?: Array<{ dayOfWeek?: string; isClosed?: boolean; operationTime?: { startTime?: string; endTime?: string } }> };
  };
}

const toNumberOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const sanePhone = (p?: string): string | null => {
  if (!p) return null;
  const t = p.trim();
  if (!t || t === '0000') return null;
  return t;
};

const normalize = (
  shopRef: string,
  b: {
    shopMeta?: unknown;
    display?: unknown;
    displayAlias?: unknown;
    disables?: unknown;
    bookmark?: unknown;
    keywords?: unknown;
    menus: unknown[];
    reviews: unknown[];
  },
  elapsedMs: number,
): CatchtableShopData => {
  const shopMeta =
    ((b.shopMeta as { data?: ShopApiData })?.data ?? {}) as ShopApiData;
  const shop: ShopApiData =
    (shopMeta as unknown as { shopDetailVO?: ShopApiData }).shopDetailVO ?? shopMeta;
  // display 응답은 data wrapper 없이 바로 옴. alias 호출도 같은 모양.
  const display: DisplayApiData = (b.display as DisplayApiData) ?? (b.displayAlias as DisplayApiData) ?? {};

  if (!shop.shopName && !display.shopName) {
    throw new CatchtableShopError(`shop meta not found for ${shopRef}`);
  }

  const images: CatchtableShopImage[] = (() => {
    const fromShop = (shop.images ?? []).map((i) => ({
      thumbUrl: i.thumbUrl ?? i.imgUrl ?? '',
      imgUrl: i.imgUrl ?? i.thumbUrl ?? '',
      imgWidth: typeof i.imgWidth === 'number' ? i.imgWidth : null,
      imgHeight: typeof i.imgHeight === 'number' ? i.imgHeight : null,
    }));
    const fromDisplay = (display.mainImages ?? []).map((i) => ({
      thumbUrl: i.thumbUrl ?? i.imgUrl ?? '',
      imgUrl: i.imgUrl ?? i.thumbUrl ?? '',
      imgWidth: typeof i.imgWidth === 'number' ? i.imgWidth : null,
      imgHeight: typeof i.imgHeight === 'number' ? i.imgHeight : null,
    }));
    const merged = [...fromShop, ...fromDisplay];
    const seen = new Set<string>();
    return merged.filter((m) => {
      if (!m.imgUrl) return false;
      if (seen.has(m.imgUrl)) return false;
      seen.add(m.imgUrl);
      return true;
    });
  })();

  const subways: CatchtableShopSubway[] = (display.addressInfo?.subways ?? [])
    .map((s) => ({
      lines: s.subwayLines ?? [],
      station: s.subwayStation ?? '',
      distance: s.distance ?? '',
    }))
    .filter((s) => s.station);

  const schedule: CatchtableShopSchedule | null = (() => {
    const def = display.schedule?.defaultSchedule;
    const weekly = display.schedule?.weeklySchedule?.schedules ?? [];
    if (!def && weekly.length === 0) return null;
    return {
      today: def
        ? {
            date: def.date ?? null,
            dayOfWeek: def.dayOfWeek ?? null,
            isClosed: Boolean(def.isClosed),
            startTime: def.operationTime?.startTime ?? null,
            endTime: def.operationTime?.endTime ?? null,
            breakStartTime: def.breakTime?.startTime ?? null,
            breakEndTime: def.breakTime?.endTime ?? null,
            lastOrderTime: def.lastOrderTime ?? null,
          }
        : null,
      weekly: weekly.map((w) => ({
        dayOfWeek: w.dayOfWeek ?? '',
        isClosed: Boolean(w.isClosed),
        startTime: w.operationTime?.startTime ?? null,
        endTime: w.operationTime?.endTime ?? null,
      })),
    };
  })();

  const disableDays: string[] = (() => {
    const data = (b.disables as { data?: { shopDisableDays?: Array<{ date?: string } | string> } })?.data;
    if (!data?.shopDisableDays) return [];
    return data.shopDisableDays
      .map((d) => (typeof d === 'string' ? d : d.date ?? ''))
      .filter((d): d is string => Boolean(d));
  })();

  const bookmarkCount: number | null = (() => {
    const v = (b.bookmark as { data?: { bookmarkCnt?: number } })?.data?.bookmarkCnt;
    return typeof v === 'number' ? v : null;
  })();

  const relatedKeywords: CatchtableShopRelatedKeyword[] = (() => {
    const list =
      (b.keywords as { data?: { relatedKeywords?: Array<{ label?: string; keywordType?: string }> } })
        ?.data?.relatedKeywords ?? [];
    return list
      .map((k) => ({ label: k.label ?? '', type: k.keywordType ?? '' }))
      .filter((k) => k.label);
  })();

  const awardItems: string[] = (shop.awardItemList ?? [])
    .map((a) => a.awardName ?? a.name ?? '')
    .filter((s) => s);

  // 메뉴 / 리뷰는 best-effort. 응답 모양이 가게마다 다를 수 있어 우선 비워두고
  // 다음 사이클에서 정확한 path/shape 가 발견되면 채운다.
  const menus: CatchtableShopMenu[] | null = (() => {
    if (b.menus.length === 0) return null;
    const out: CatchtableShopMenu[] = [];
    for (const raw of b.menus) {
      const data = (raw as { data?: unknown }).data ?? raw;
      const list = Array.isArray((data as { list?: unknown[] })?.list)
        ? (data as { list: unknown[] }).list
        : Array.isArray(data)
          ? (data as unknown[])
          : [];
      for (const m of list) {
        const mm = m as { name?: string; menuName?: string; price?: number | string; priceText?: string; description?: string; menuDesc?: string; imageUrl?: string; imgUrl?: string };
        const name = mm.name ?? mm.menuName;
        if (!name) continue;
        out.push({
          name,
          price:
            mm.priceText ??
            (typeof mm.price === 'number' ? mm.price.toLocaleString() + '원' : mm.price ?? null),
          description: mm.description ?? mm.menuDesc ?? null,
          imageUrl: mm.imageUrl ?? mm.imgUrl ?? null,
        });
      }
    }
    return out.length > 0 ? out : null;
  })();

  const reviewSamples: CatchtableShopReviewSample[] | null = (() => {
    if (b.reviews.length === 0) return null;
    const out: CatchtableShopReviewSample[] = [];
    for (const raw of b.reviews) {
      const data = (raw as { data?: unknown }).data ?? raw;
      const list = Array.isArray((data as { list?: unknown[] })?.list)
        ? (data as { list: unknown[] }).list
        : Array.isArray((data as { reviews?: unknown[] })?.reviews)
          ? (data as { reviews: unknown[] }).reviews
          : Array.isArray((data as { items?: unknown[] })?.items)
            ? (data as { items: unknown[] }).items
            : [];
      for (const r of list) {
        const rr = r as { writerName?: string; ctUserName?: string; userName?: string; score?: number | string; finalScore?: number | string; reviewContent?: string; content?: string; body?: string; visitDate?: string; createdDate?: string };
        const body = rr.reviewContent ?? rr.content ?? rr.body;
        if (!body) continue;
        out.push({
          authorName: rr.writerName ?? rr.ctUserName ?? rr.userName ?? null,
          score: toNumberOrNull(rr.score ?? rr.finalScore),
          body: body.length > 400 ? body.slice(0, 400) : body,
          visitedAt: rr.visitDate ?? rr.createdDate ?? null,
        });
      }
    }
    return out.length > 0 ? out.slice(0, 10) : null;
  })();

  return {
    shopRef,
    alias: shop.alias ?? display.alias ?? null,
    shopName: shop.shopName ?? display.shopName ?? '',
    shopNameEn: shop.shopNameEn ?? null,
    category: shop.foodKind ?? null,
    landName: shop.landName ?? display.landName ?? null,
    serviceDesc: shop.serviceDesc ?? display.serviceDesc ?? null,
    address: shop.shopAddress ?? display.addressInfo?.shop?.address ?? null,
    addressDetail: shop.shopAddress2 ?? null,
    lat: toNumberOrNull(shop.lat ?? display.addressInfo?.shop?.location?.lat),
    lon: toNumberOrNull(shop.lon ?? display.addressInfo?.shop?.location?.lon),
    subways,
    phone: sanePhone(shop.shopPhone) ?? sanePhone(display.phoneInfo?.shopPhone) ?? null,
    images,
    priceRange: {
      lunchMin: toNumberOrNull(shop.lunchPriceMin),
      lunchMax: toNumberOrNull(shop.lunchPriceMax),
      dinnerMin: toNumberOrNull(shop.dinnerPriceMin),
      dinnerMax: toNumberOrNull(shop.dinnerPriceMax),
      lunchText: shop.lunchPriceText ?? null,
      dinnerText: shop.dinnerPriceText ?? null,
    },
    review: {
      averageScore: toNumberOrNull(shop.review?.finalScore),
      totalCount: shop.review?.totalReviewCount ?? 0,
      blogReviewCount: shop.review?.totalBlogReviewCount ?? 0,
      foodScore: toNumberOrNull(shop.review?.foodScore),
      ambienceScore: toNumberOrNull(shop.review?.ambienceScore),
      serviceScore: toNumberOrNull(shop.review?.serviceScore),
    },
    schedule,
    disableDays,
    awardItems,
    relatedKeywords,
    bookmarkCount,
    mainService: shop.mainService ?? display.mainService ?? null,
    contractState: display.contractState ?? null,
    exposeCatchtable: Boolean(shop.exposeCatchTable ?? display.exposeCatchtable),
    useOnline: Boolean(display.useOnline),
    useCatchtable: Boolean(display.useCatchtable),
    menus,
    reviewSamples,
    rawSourceUrl: SHOP_URL(shopRef),
    fetchedAt: new Date().toISOString(),
    elapsedMs,
    source: 'playwright',
  };
};

// ── 메뉴 (가게 메뉴 페이지에서 자동 호출되는 tabs/menu 응답 가로채기) ───────

const MENU_PAGE_URL = (ref: string) =>
  `https://app.catchtable.co.kr/ct/shop/${ref}/menuAllList`;

const MENU_ENDPOINT = (ref: string) =>
  `https://ct-api.catchtable.co.kr/api/display/v2/shops/${ref}/tabs/menu`;

export interface CatchtableShopMenuBoard {
  thumbUrl: string;
  imageUrl: string;
  width: number | null;
  height: number | null;
  type: string | null;
  regDate: string | null;
}

export interface CatchtableShopMenuItem {
  foodMenuSeq: number | null;
  name: string;
  // 캐치테이블 응답에서 가격은 string ("230000") 또는 빈 문자열. 정규화 후에도
  // string 유지 (단위/표기 차이를 손실 없이 보존).
  minPrice: string | null;
  maxPrice: string | null;
  description: string | null;
  isRecommended: boolean;
  isNew: boolean;
  isRepresentative: boolean;
  imageUrl: string | null;
}

export interface CatchtableShopMenuDetailInfo {
  isKidsMenu: boolean | null;
  kidsMenuGuide: string | null;
  isAllergyMenuSubstitute: boolean | null;
  allergyMenuSubstituteGuide: string | null;
  isVeganMenuSubstitute: boolean | null;
  veganMenuSubstituteGuide: string | null;
  isAlcoholOrderRequired: boolean;
  corkChargeGuide: string | null;
  lastMenuUpdateDateTime: string | null;
}

export interface CatchtableShopMenusResponse {
  shopRef: string;
  menuBoards: CatchtableShopMenuBoard[];
  menus: CatchtableShopMenuItem[];
  menuDetailInfo: CatchtableShopMenuDetailInfo | null;
  fetchedAt: string;
  elapsedMs: number;
  source: 'playwright';
}

export const fetchCatchtableShopMenus = async (
  shopRef: string,
): Promise<CatchtableShopMenusResponse> => {
  const trimmed = shopRef.trim();
  if (!trimmed) throw new CatchtableShopError('shopRef is empty');

  const t0 = Date.now();
  const ctx = await getContext();
  const page = await ctx.newPage();

  let captured: unknown = null;
  page.on('response', async (resp) => {
    if (!resp.url().startsWith(MENU_ENDPOINT(trimmed))) return;
    try {
      captured = await resp.json();
    } catch {
      // ignore
    }
  });

  try {
    await page.goto(MENU_PAGE_URL(trimmed), {
      waitUntil: 'domcontentloaded',
      timeout: GOTO_TIMEOUT_MS,
    });
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => undefined);
    await page.waitForTimeout(800);
  } catch (e) {
    await page.close().catch(() => undefined);
    throw new CatchtableShopError(`failed to load menu page for ${trimmed}`, e);
  }
  await page.close().catch(() => undefined);

  // 응답이 안 잡혔으면 fetch 로 한 번 더 시도 (warm page 에서). 페이지 hydrate
  // 가 실패해도 같은 origin 의 직접 호출은 가능한 경우가 있다.
  if (!captured) {
    captured = await directFetch(MENU_ENDPOINT(trimmed)).catch(() => null);
  }

  if (!captured || typeof captured !== 'object') {
    throw new CatchtableShopError(`menu response missing for ${trimmed}`);
  }

  const d = captured as {
    menuBoards?: Array<Record<string, unknown>>;
    menus?: Array<Record<string, unknown>>;
    menuDetailInfo?: Record<string, unknown>;
  };

  return {
    shopRef: trimmed,
    menuBoards: (d.menuBoards ?? []).map(normalizeBoard).filter((b): b is CatchtableShopMenuBoard => b !== null),
    menus: (d.menus ?? []).map(normalizeMenuItem).filter((m): m is CatchtableShopMenuItem => m !== null),
    menuDetailInfo: d.menuDetailInfo ? normalizeMenuDetail(d.menuDetailInfo) : null,
    fetchedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    source: 'playwright',
  };
};

const normalizeBoard = (b: Record<string, unknown>): CatchtableShopMenuBoard | null => {
  const imgUrl = typeof b.imageUrl === 'string' ? b.imageUrl : null;
  const thumb = typeof b.thumbUrl === 'string' ? b.thumbUrl : imgUrl;
  if (!thumb && !imgUrl) return null;
  return {
    thumbUrl: thumb ?? imgUrl!,
    imageUrl: imgUrl ?? thumb!,
    width: typeof b.width === 'number' ? b.width : null,
    height: typeof b.height === 'number' ? b.height : null,
    type: typeof b.type === 'string' ? b.type : null,
    regDate: typeof b.regDate === 'string' ? b.regDate : null,
  };
};

const normalizeMenuItem = (m: Record<string, unknown>): CatchtableShopMenuItem | null => {
  const name = typeof m.name === 'string' ? m.name : null;
  if (!name) return null;
  const minPrice = m.minPrice;
  const maxPrice = m.maxPrice;
  return {
    foodMenuSeq: typeof m.foodMenuSeq === 'number' ? m.foodMenuSeq : null,
    name,
    minPrice: typeof minPrice === 'string' && minPrice ? minPrice : null,
    maxPrice: typeof maxPrice === 'string' && maxPrice ? maxPrice : null,
    description: typeof m.description === 'string' && m.description ? m.description : null,
    isRecommended: Boolean(m.isRecommended),
    isNew: Boolean(m.isNew),
    isRepresentative: Boolean(m.isRepresentative),
    imageUrl: typeof m.imageUrl === 'string' ? m.imageUrl : null,
  };
};

const normalizeMenuDetail = (d: Record<string, unknown>): CatchtableShopMenuDetailInfo => ({
  isKidsMenu: typeof d.isKidsMenu === 'boolean' ? d.isKidsMenu : null,
  kidsMenuGuide: typeof d.kidsMenuGuide === 'string' && d.kidsMenuGuide ? d.kidsMenuGuide : null,
  isAllergyMenuSubstitute: typeof d.isAllergyMenuSubstitute === 'boolean' ? d.isAllergyMenuSubstitute : null,
  allergyMenuSubstituteGuide:
    typeof d.allergyMenuSubstituteGuide === 'string' && d.allergyMenuSubstituteGuide
      ? d.allergyMenuSubstituteGuide
      : null,
  isVeganMenuSubstitute: typeof d.isVeganMenuSubstitute === 'boolean' ? d.isVeganMenuSubstitute : null,
  veganMenuSubstituteGuide:
    typeof d.veganMenuSubstituteGuide === 'string' && d.veganMenuSubstituteGuide
      ? d.veganMenuSubstituteGuide
      : null,
  isAlcoholOrderRequired: Boolean(d.isAlcoholOrderRequired),
  corkChargeGuide: typeof d.corkChargeGuide === 'string' && d.corkChargeGuide ? d.corkChargeGuide : null,
  lastMenuUpdateDateTime: typeof d.lastMenuUpdateDateTime === 'string' ? d.lastMenuUpdateDateTime : null,
});

// ── AI 리뷰 종합 (캐치테이블이 자체 생성한 가게 요약 — 매우 풍부) ──────────

const REVIEW_OVERVIEW_ENDPOINT = (ref: string) =>
  `https://ct-api.catchtable.co.kr/api/review/v2/shops/${ref}/review-overview`;

export interface CatchtableShopReviewOverviewResponse {
  shopRef: string;
  // 한 줄 제목. 캐치테이블 AI 가 만든 가게 한 줄 요약.
  title: string | null;
  // 3~4 문장 정도의 가게 특징 설명.
  sentences: string[];
  latestUpdateDate: string | null;
  fetchedAt: string;
  elapsedMs: number;
  source: 'playwright';
}

export const fetchCatchtableShopReviewOverview = async (
  shopRef: string,
): Promise<CatchtableShopReviewOverviewResponse> => {
  const trimmed = shopRef.trim();
  if (!trimmed) throw new CatchtableShopError('shopRef is empty');
  const t0 = Date.now();

  const raw = await directFetch(REVIEW_OVERVIEW_ENDPOINT(trimmed));
  if (!raw || typeof raw !== 'object') {
    throw new CatchtableShopError(`review-overview missing for ${trimmed}`);
  }
  const d = raw as { title?: string; sentences?: string[]; latestUpdateDate?: string };

  return {
    shopRef: trimmed,
    title: typeof d.title === 'string' ? d.title : null,
    sentences: Array.isArray(d.sentences) ? d.sentences.filter((s): s is string => typeof s === 'string') : [],
    latestUpdateDate: typeof d.latestUpdateDate === 'string' ? d.latestUpdateDate : null,
    fetchedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    source: 'playwright',
  };
};

// 워밍된 컨텍스트의 페이지 안에서 fetch — Cloudflare/봇 보호 우회. 메인 페이지
// 진입은 필요 없고 같은 origin 쿠키만 있으면 호출 가능. 검색 어댑터의 페이지
// 안 fetch 와 같은 패턴.
const directFetch = async (url: string): Promise<unknown> => {
  const ctx = await getContext();
  // 가벼운 비ualizing about:blank 페이지. 같은 origin 쿠키만 들고 fetch 만 함.
  const page = await ctx.newPage();
  try {
    // 첫 호출에선 origin 쿠키가 없을 수 있어 home 진입을 한 번만 진행. context
    // 가 재사용되므로 이후 호출에선 즉시 fetch.
    await page.goto('https://app.catchtable.co.kr/', {
      waitUntil: 'domcontentloaded',
      timeout: GOTO_TIMEOUT_MS,
    });
    const result = await page.evaluate(async (u) => {
      const resp = await fetch(u, {
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      const text = await resp.text();
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }, url);
    return result;
  } finally {
    await page.close().catch(() => undefined);
  }
};

export const closeCatchtableShopBrowser = async (): Promise<void> => {
  if (contextPromise) {
    const ctx = await contextPromise.catch(() => null);
    if (ctx) await ctx.close().catch(() => undefined);
    contextPromise = null;
  }
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b) await b.close().catch(() => undefined);
    browserPromise = null;
  }
};
