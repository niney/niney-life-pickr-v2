// 네이버 PC 지도 검색 결과를 Playwright 로 캡처해서 NaverSearchResult[] 로
// 매핑하는 어댑터. 직접 fetch 는 `ncaptcha` 벽에 막혀 사용 불가 — 페이지를
// 띄워야 토큰/세션 쿠키가 발급되고 같은 컨텍스트에서 호출된 allSearch
// 응답이 정상으로 돌아온다.
//
// 목표 응답 엔드포인트:
//   GET https://map.naver.com/p/api/search/allSearch?query=...&type=all&searchCoord=...&token=...
// 응답 모양:
//   { result: { place: { list: [ { id, name, category[], address, roadAddress, tel, x, y, thumUrl, reviewCount, ... } ] } } }
//
// id 가 그대로 placeId. x/y 는 문자열이라 Number 변환 필요.

import { chromium, type Browser } from 'playwright';

// 정렬용 표준 ASCII 데스크톱 UA. 모바일 UA 로 바꾸면 페이지 라우팅이 m.place
// 로 빠져 allSearch 호출 자체가 일어나지 않는다.
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HEADLESS = process.env.CRAWL_SEARCH_HEADLESS !== '0';
const NAV_TIMEOUT_MS = Number(process.env.CRAWL_SEARCH_TIMEOUT_MS ?? '15000');
const RESPONSE_WAIT_MS = Number(process.env.CRAWL_SEARCH_WAIT_MS ?? '8000');

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
  // url-normalizer 가 placeId 를 추출할 수 있는 정규 진입 URL.
  // FE 가 startCrawl 에 그대로 넘기면 기존 파이프라인이 동작한다.
  rawSourceUrl: string;
}

export interface NaverSearchOptions {
  signal?: AbortSignal;
  // 결과 상한. 네이버는 페이지당 ~20 개 — 첫 페이지만 가져온다.
  // 더 필요하면 task 7 단계에서 페이지네이션 추가.
  limit?: number;
}

export class NaverSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NaverSearchError';
  }
}

let browserPromise: Promise<Browser> | null = null;

const getBrowser = (): Promise<Browser> => {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: HEADLESS });
  }
  return browserPromise;
};

export const closeSearchBrowser = async (): Promise<void> => {
  if (!browserPromise) return;
  const b = await browserPromise;
  await b.close();
  browserPromise = null;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const strOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

const buildResult = (raw: Record<string, unknown>): NaverSearchResult | null => {
  const placeId = strOrNull(raw['id']);
  const name = strOrNull(raw['name']);
  if (!placeId || !name) return null;

  const cats = Array.isArray(raw['category']) ? (raw['category'] as unknown[]) : [];
  const category =
    cats.length > 0 && typeof cats[0] === 'string' ? (cats[0] as string) : null;

  return {
    placeId,
    name,
    category,
    address: strOrNull(raw['address']),
    roadAddress: strOrNull(raw['roadAddress']),
    lat: numOrNull(raw['y']),
    lng: numOrNull(raw['x']),
    phone: strOrNull(raw['tel']) ?? strOrNull(raw['virtualTel']),
    thumbnailUrl: strOrNull(raw['thumUrl']),
    reviewCount: numOrNull(raw['reviewCount']),
    rawSourceUrl: `https://map.naver.com/p/entry/place/${placeId}`,
  };
};

const SHOULD_BLOCK = new Set(['image', 'font', 'stylesheet', 'media']);

// PC 지도 검색 페이지를 띄우고 allSearch 응답을 가로챈다. 페이지가 자체적으로
// captcha 토큰을 발급해 호출하므로 우리는 그 결과만 슬쩍 받아 가는 구조.
export const searchPlacesViaMapNaver = async (
  query: string,
  options: NaverSearchOptions = {},
): Promise<NaverSearchResult[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent: DESKTOP_UA,
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
  });

  try {
    const page = await ctx.newPage();

    await page.route('**/*', (route) => {
      const t = route.request().resourceType();
      if (SHOULD_BLOCK.has(t)) return route.abort();
      return route.continue();
    });

    // 첫 allSearch 응답만 보관 — 페이지 이동/필터 클릭 시 추가로 호출될 수
    // 있는데 우리가 원하는 건 초기 검색 결과뿐.
    let captured: Record<string, unknown> | null = null;
    page.on('response', async (res) => {
      if (captured) return;
      const u = res.url();
      if (!u.includes('/p/api/search/allSearch')) return;
      const ct = res.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      try {
        const body = await res.json();
        if (isObject(body)) captured = body;
      } catch {
        // 무시 — JSON 파싱 실패한 응답은 captcha 페이지일 수 있다
      }
    });

    const target = `https://map.naver.com/p/search/${encodeURIComponent(trimmed)}`;
    try {
      await page.goto(target, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT_MS,
      });
    } catch (e) {
      throw new NaverSearchError(
        e instanceof Error ? `Navigation failed: ${e.message}` : 'Navigation failed',
      );
    }

    // 응답이 도달할 때까지 폴링. networkidle 까지 가지 않아도 일찍 빠져나간다.
    const deadline = Date.now() + RESPONSE_WAIT_MS;
    while (!captured && Date.now() < deadline) {
      if (options.signal?.aborted) throw new NaverSearchError('aborted');
      await page.waitForTimeout(150);
    }

    if (!captured) {
      throw new NaverSearchError(
        'allSearch response did not arrive within timeout (page possibly hit captcha)',
      );
    }

    const result = isObject(captured['result'])
      ? (captured['result'] as Record<string, unknown>)
      : null;
    // ncaptcha-all-search-no-result 응답은 result.place 가 null 로 와서 자연스럽게
    // 빈 배열로 떨어진다. 그래도 명시적으로 감지해서 에러로 던지진 않는다 — 빈
    // 결과는 사용자에게 '검색 결과 없음' 으로 보여 주면 충분.
    const place =
      result && isObject(result['place'])
        ? (result['place'] as Record<string, unknown>)
        : null;
    const list = place && Array.isArray(place['list']) ? (place['list'] as unknown[]) : [];

    const seenIds = new Set<string>();
    const out: NaverSearchResult[] = [];
    const limit = options.limit ?? list.length;
    for (const raw of list) {
      if (out.length >= limit) break;
      if (!isObject(raw)) continue;
      const item = buildResult(raw);
      if (!item) continue;
      if (seenIds.has(item.placeId)) continue;
      seenIds.add(item.placeId);
      out.push(item);
    }
    return out;
  } finally {
    await ctx.close().catch(() => undefined);
  }
};
