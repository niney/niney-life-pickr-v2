import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { NaverPlaceDataType } from '@repo/api-contract';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

let browserPromise: Promise<Browser> | null = null;

const getBrowser = (): Promise<Browser> => {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
};

export const closeBrowser = async (): Promise<void> => {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
};

interface CapturedGraphQL {
  url: string;
  body: unknown;
}

export class PlaywrightFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaywrightFetchError';
  }
}

export class PlaceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaceParseError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const findRestaurantNode = (root: unknown): Record<string, unknown> | null => {
  const stack: unknown[] = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
      continue;
    }
    if (!isObject(cur)) continue;
    const typename = cur['__typename'];
    if (
      typeof typename === 'string' &&
      (typename === 'RestaurantListSummary' ||
        typename === 'PlaceSummary' ||
        typename === 'RestaurantSummary' ||
        typename === 'BaseSummary')
    ) {
      return cur;
    }
    if (
      typeof cur['id'] === 'string' &&
      typeof cur['name'] === 'string' &&
      ('category' in cur || 'address' in cur || 'phone' in cur)
    ) {
      return cur;
    }
    for (const value of Object.values(cur)) stack.push(value);
  }
  return null;
};

const pickString = (obj: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length) return v;
  }
  return null;
};

const pickNumber = (obj: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim().length) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
};

const extractImageUrls = (node: Record<string, unknown>): string[] => {
  const urls: string[] = [];
  const seen = new Set<string>();
  const visit = (val: unknown) => {
    if (!val) return;
    if (Array.isArray(val)) {
      for (const v of val) visit(v);
      return;
    }
    if (isObject(val)) {
      const u = val['url'] ?? val['imageUrl'] ?? val['src'];
      if (typeof u === 'string' && /^https?:\/\//.test(u) && !seen.has(u)) {
        seen.add(u);
        urls.push(u);
      }
      for (const v of Object.values(val)) visit(v);
    }
  };
  visit(node['images'] ?? node['imageUrls'] ?? node['photoList']);
  return urls.slice(0, 20);
};

const buildPlaceData = (
  placeId: string,
  canonicalUrl: string,
  node: Record<string, unknown>,
): NaverPlaceDataType => {
  const coordinates = isObject(node['coordinate']) ? node['coordinate'] : node;
  return {
    placeId,
    name: pickString(node, 'name') ?? '',
    category: pickString(node, 'category', 'categoryName'),
    address: pickString(node, 'address', 'fullAddress'),
    roadAddress: pickString(node, 'roadAddress'),
    phone: pickString(node, 'phone', 'virtualPhone', 'tel'),
    businessHours: pickString(node, 'businessHours', 'newBusinessHours'),
    latitude: pickNumber(coordinates, 'y', 'lat', 'latitude'),
    longitude: pickNumber(coordinates, 'x', 'lng', 'longitude'),
    imageUrls: extractImageUrls(node),
    rating: pickNumber(node, 'visitorReviewsScore', 'rating', 'reviewScore'),
    reviewCount: pickNumber(node, 'visitorReviewsTotal', 'reviewCount'),
    rawSourceUrl: canonicalUrl,
  };
};

const SHOULD_BLOCK = new Set(['image', 'font', 'media', 'stylesheet']);

export const fetchNaverPlaceWithPlaywright = async (
  placeId: string,
  canonicalUrl: string,
): Promise<NaverPlaceDataType> => {
  const browser = await getBrowser();
  let ctx: BrowserContext | null = null;
  try {
    ctx = await browser.newContext({
      userAgent: MOBILE_UA,
      viewport: { width: 390, height: 844 },
      locale: 'ko-KR',
      isMobile: true,
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();

    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (SHOULD_BLOCK.has(type)) return route.abort();
      return route.continue();
    });

    const captured: CapturedGraphQL[] = [];
    page.on('response', async (res) => {
      const url = res.url();
      if (!url.includes('pcmap.place.naver.com') && !url.includes('place.map.naver.com')) return;
      const ct = res.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      try {
        const body = await res.json();
        captured.push({ url, body });
      } catch {
        // ignore non-JSON
      }
    });

    try {
      await page.goto(canonicalUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 });
      await page
        .waitForLoadState('networkidle', { timeout: 5_000 })
        .catch(() => undefined);
    } catch (e) {
      throw new PlaywrightFetchError(
        e instanceof Error ? `Navigation failed: ${e.message}` : 'Navigation failed',
      );
    }

    let placeNode: Record<string, unknown> | null = null;
    for (const cap of captured) {
      placeNode = findRestaurantNode(cap.body);
      if (placeNode && pickString(placeNode, 'name')) break;
    }

    if (!placeNode) {
      const apolloState = await page
        .evaluate<unknown>(() => (window as unknown as { __APOLLO_STATE__?: unknown }).__APOLLO_STATE__ ?? null)
        .catch(() => null);
      if (apolloState) placeNode = findRestaurantNode(apolloState);
    }

    if (!placeNode) {
      throw new PlaceParseError('Could not find place data in network responses');
    }

    return buildPlaceData(placeId, canonicalUrl, placeNode);
  } finally {
    if (ctx) await ctx.close().catch(() => undefined);
  }
};
