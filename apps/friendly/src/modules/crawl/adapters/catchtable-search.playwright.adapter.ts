// 캐치테이블 키워드 검색 어댑터.
//
// endpoint: POST https://ct-api.catchtable.co.kr/api/v6/search/list
//   body.keywordSearch.keyword 가 실제 검색어. 'keyword' 단독 필드는 백엔드가
//   무시하고 추천 결과만 돌려주므로 반드시 `keywordSearch: { keyword }` 형식.
//
// Cloudflare 가 직접 외부 fetch 를 차단(403)하므로, naver-search 가 PC 페이지를
// 띄워 응답을 가로채는 것과 같은 패턴을 쓴다 — 단 우리는 페이지 안에서
// `fetch()` 를 호출해 JSON 만 받아온다 (응답 가로채기 대신 직접 호출).
//
// 모듈 스코프 캐싱:
//   - Browser 1개 (lazy)
//   - BrowserContext + warm Page 1개 (lazy, 모든 호출에서 재사용)
//   - Fastify onClose 에서 closeCatchtableSearchBrowser() 로 정리
//
// 첫 호출은 페이지 로드 비용으로 ~14s, 이후는 ~200-900ms.
// 16000+ 결과는 키워드가 백엔드에 안 먹힌 fallback 신호 → response.fallback=true.

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const ENDPOINT = 'https://ct-api.catchtable.co.kr/api/v6/search/list';
const WARM_URL =
  'https://app.catchtable.co.kr/ct/map/search-map?serviceType=INTEGRATION&isInitSearch=1';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 서울시청. 호출자가 좌표 안 넘기면 이걸 사용.
const DEFAULT_CENTER = { lat: 37.5518333, lon: 126.9887774 };

// totalShopCount 가 이 값 이상이면 키워드 매칭 실패 → 추천 DB 전체 fallback
// 으로 간주. 실측: 정상 키워드 hit 은 1~수천. fallback 은 16849 고정.
const FALLBACK_TOTAL_THRESHOLD = 10_000;

const HEADLESS = process.env.CATCHTABLE_HEADLESS !== '0';
const WARM_TIMEOUT_MS = Number(process.env.CATCHTABLE_WARM_TIMEOUT_MS ?? '30000');
const NETWORK_IDLE_TIMEOUT_MS = Number(process.env.CATCHTABLE_NETWORK_IDLE_MS ?? '12000');

export interface CatchtableSearchOptions {
  // 1~30. 백엔드가 size 를 일부 무시하는 경향이 있어 실제 반환은 ~30 일 수 있음.
  limit?: number;
  // 페이지네이션 토큰. 첫 호출은 '0' (또는 undefined). 다음 호출엔 직전 응답의
  // nextOffset 그대로 넘기면 됨.
  offset?: string;
  // 좌표 기반 정렬에 사용. 미지정 시 서울시청.
  coord?: { lat: number; lon: number };
  // 캐치테이블 가맹점만 (true, default) vs 전체 (false).
  contractedOnly?: boolean;
  signal?: AbortSignal;
}

// 호출자에게 노출하는 정규화 결과. shopMeta 원본은 훨씬 풍부 — 필요한 필드만
// 추려서 안정적인 외부 인터페이스로 둔다.
export interface CatchtableSearchResult {
  shopRef: string;
  shopName: string;
  foodKind: string | null;
  // 빌딩/위치 라벨 (예: "현대백화점 무역센터점"). 정규 주소가 아니라 단축 라벨.
  landName: string | null;
  // 캐치테이블 내부 base64 슬러그. /ct/shop/<urlPathAlias> 로 쓸 수 있지만
  // shopRef 도 같은 라우트에서 동작하므로 정규 URL 은 shopRef 기반.
  urlPathAlias: string | null;
  // /ct/shop/{shopRef} — 어드민이 클릭해 캐치테이블 상세를 새 탭으로 여는 용도.
  rawSourceUrl: string;
  imageUrl: string | null;
  reviewCount: number;
  avgScore: number | null;
  shopPhone: string | null;
  lat: number | null;
  lon: number | null;
  // "OPEN" | "DAY_OFF" 등 응답이 주는 거 그대로. UI 표시 매핑은 호출자 책임.
  operationStatus: string | null;
  // "DINING" | "WAITING" | "PICKUP" — 가게의 주력 서비스 채널.
  mainService: string | null;
  badges: string[];
}

export interface CatchtableSearchResponse {
  items: CatchtableSearchResult[];
  totalShopCount: number;
  hasMore: boolean;
  nextOffset: string | null;
  source: 'playwright';
  // true 면 키워드가 백엔드에 매칭 안 됐고 추천 결과로 fallback 된 상태.
  fallback: boolean;
  elapsedMs: number;
}

export class CatchtableSearchError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'CatchtableSearchError';
  }
}

// 모듈 스코프 — 단일 인스턴스 공유. CLAUDE.md 규칙(Redis 금지 / 단일 인스턴스)
// 과 일치. 동시 여러 어드민 검색이 와도 같은 BrowserContext 안에서 직렬화됨.
// 동시성 부담이 커지면 BrowserContext pool 로 확장 가능.
let browserPromise: Promise<Browser> | null = null;
let contextPromise: Promise<{ ctx: BrowserContext; page: Page }> | null = null;

const getBrowser = (): Promise<Browser> => {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: HEADLESS });
  }
  return browserPromise;
};

const getWarmedPage = async (): Promise<Page> => {
  if (contextPromise) {
    const cached = await contextPromise.catch(() => null);
    if (cached && !cached.page.isClosed()) return cached.page;
    // page 가 끊겼으면 컨텍스트 재구축.
    contextPromise = null;
  }
  contextPromise = (async () => {
    const browser = await getBrowser();
    const ctx = await browser.newContext({
      userAgent: DESKTOP_UA,
      viewport: { width: 1280, height: 900 },
      locale: 'ko-KR',
    });
    // 미디어/폰트 차단 — JS 실행과 쿠키만 필요하지 이미지/CSS 는 불필요.
    await ctx.route('**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,ttf,mp4,m3u8,avif}', (route) =>
      route.abort(),
    );
    const page = await ctx.newPage();
    await page.goto(WARM_URL, { waitUntil: 'domcontentloaded', timeout: WARM_TIMEOUT_MS });
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => undefined);
    // 약간의 idle — Cloudflare cookie / axios interceptor 들이 자리 잡을 시간.
    await page.waitForTimeout(1_200);
    return { ctx, page };
  })();
  const { page } = await contextPromise;
  return page;
};

const buildBody = (query: string, opts: CatchtableSearchOptions) => {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 30);
  const offset = opts.offset ?? '0';
  const center = opts.coord ?? DEFAULT_CENTER;
  const contractedType = opts.contractedOnly === false ? 'ALL' : 'CONTRACTED_ONLY';
  return {
    paging: { offset, size: limit },
    listType: 'GENERAL',
    reservationParams: {},
    notUseSpellCorrection: false,
    divideType: 'DIVIDE_BY_AVAILABILITY',
    sort: { sortType: 'recommended', sortChunkSize: 5 },
    userInfo: { clientGeoPoint: { lat: center.lat, lon: center.lon } },
    filters: {
      legalDistrictCodes: [],
      facilityCodes: [],
      filterTags: [],
      contractedType,
    },
    recommendationModel: 'bmk-cwse',
    useRerank: true,
    keywordSearch: { keyword: query },
  };
};

export const searchCatchtablePlaces = async (
  query: string,
  options: CatchtableSearchOptions = {},
): Promise<CatchtableSearchResponse> => {
  const trimmed = query.trim();
  if (!trimmed) throw new CatchtableSearchError('query is empty');

  const t0 = Date.now();
  const body = buildBody(trimmed, options);

  let raw: { status: number; json: unknown };
  try {
    const page = await getWarmedPage();
    if (options.signal?.aborted) throw new CatchtableSearchError('aborted');
    raw = await page.evaluate(
      async ({ url, body }) => {
        const resp = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(body),
        });
        const text = await resp.text();
        let json: unknown = null;
        try {
          json = JSON.parse(text);
        } catch {
          // keep null
        }
        return { status: resp.status, json };
      },
      { url: ENDPOINT, body },
    );
  } catch (e) {
    throw new CatchtableSearchError('playwright fetch failed', e);
  }
  if (raw.status < 200 || raw.status >= 300) {
    throw new CatchtableSearchError(`search responded ${raw.status}`);
  }

  const data = (
    raw.json as {
      data?: {
        totalShopCount?: number;
        paging?: { hasMore?: boolean; nextOffset?: string };
        shopResults?: { shops?: Array<Record<string, unknown>> };
      };
    } | null
  )?.data;
  if (!data) throw new CatchtableSearchError('unexpected response shape');

  const totalShopCount = data.totalShopCount ?? 0;
  const shopsRaw = data.shopResults?.shops ?? [];
  const items = shopsRaw
    .map(toResult)
    .filter((x): x is CatchtableSearchResult => x !== null);

  return {
    items,
    totalShopCount,
    hasMore: Boolean(data.paging?.hasMore),
    nextOffset: data.paging?.nextOffset ?? null,
    source: 'playwright',
    fallback: totalShopCount >= FALLBACK_TOTAL_THRESHOLD,
    elapsedMs: Date.now() - t0,
  };
};

const toResult = (shop: Record<string, unknown>): CatchtableSearchResult | null => {
  const meta = shop.shopMeta as Record<string, unknown> | undefined;
  if (!meta) return null;
  const ref = typeof meta.shopRef === 'string' ? meta.shopRef : '';
  const name = typeof meta.shopName === 'string' ? meta.shopName : '';
  if (!ref || !name) return null;

  const images = (meta.images as Array<{ thumbUrl?: string; imgUrl?: string }> | undefined) ?? [];
  const coord = meta.shopCoord as { lat?: number; lon?: number } | undefined;
  const badgesRaw = meta.badges as
    | {
        automaticBadgeItems?: Array<{ name?: string }>;
        awardBadgeItems?: Array<{ name?: string }>;
        tvBadgeItems?: Array<{ name?: string }>;
      }
    | undefined;
  const badgeNames: string[] = [];
  for (const arr of [
    badgesRaw?.automaticBadgeItems,
    badgesRaw?.awardBadgeItems,
    badgesRaw?.tvBadgeItems,
  ]) {
    for (const b of arr ?? []) {
      if (b?.name) badgeNames.push(b.name);
    }
  }

  // shopPhone === '0000' 은 캐치테이블이 비공개 안내용으로 박는 placeholder.
  const phone = typeof meta.shopPhone === 'string' && meta.shopPhone !== '0000' ? meta.shopPhone : null;

  return {
    shopRef: ref,
    shopName: name,
    foodKind: typeof meta.foodKind === 'string' ? meta.foodKind : null,
    landName: typeof meta.landName === 'string' ? meta.landName : null,
    urlPathAlias: typeof meta.urlPathAlias === 'string' ? meta.urlPathAlias : null,
    rawSourceUrl: `https://app.catchtable.co.kr/ct/shop/${ref}`,
    imageUrl: images[0]?.thumbUrl ?? images[0]?.imgUrl ?? null,
    reviewCount: typeof meta.reviewCount === 'number' ? meta.reviewCount : 0,
    avgScore: typeof meta.avgScore === 'number' ? meta.avgScore : null,
    shopPhone: phone,
    lat: typeof coord?.lat === 'number' ? coord.lat : null,
    lon: typeof coord?.lon === 'number' ? coord.lon : null,
    operationStatus: typeof meta.operationStatus === 'string' ? meta.operationStatus : null,
    mainService: typeof meta.mainService === 'string' ? meta.mainService : null,
    badges: badgeNames,
  };
};

export const closeCatchtableSearchBrowser = async (): Promise<void> => {
  if (contextPromise) {
    const cached = await contextPromise.catch(() => null);
    if (cached) await cached.ctx.close().catch(() => undefined);
    contextPromise = null;
  }
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b) await b.close().catch(() => undefined);
    browserPromise = null;
  }
};
