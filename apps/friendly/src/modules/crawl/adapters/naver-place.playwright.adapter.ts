import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { MenuItemType, NaverPlaceDataType } from '@repo/api-contract';

const DEBUG_CAPTURE = process.env.CRAWL_DEBUG_CAPTURE === '1';
const DEBUG_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../__debug__',
);

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

const isRef = (v: unknown): v is { __ref: string } =>
  isObject(v) && typeof v['__ref'] === 'string';

const deref = (
  state: Record<string, unknown> | null,
  v: unknown,
): unknown => {
  if (state && isRef(v)) return state[v.__ref] ?? null;
  return v;
};

// Apollo cache encodes field arguments into the storage key (e.g.
// `images({"source":["starbucks"]})`). We don't know the exact arg shape so we
// match by prefix.
const findFieldByPrefix = (
  node: Record<string, unknown>,
  prefix: string,
): unknown => {
  for (const key of Object.keys(node)) {
    if (key === prefix || key.startsWith(`${prefix}(`)) return node[key];
  }
  return undefined;
};

const PLACE_TYPENAMES = new Set(['PlaceDetailBase', 'PlaceSummary', 'RestaurantSummary']);

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
    if (typeof typename === 'string' && PLACE_TYPENAMES.has(typename)) {
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

const collectImagesFromContainer = (
  state: Record<string, unknown> | null,
  container: unknown,
  out: string[],
  seen: Set<string>,
): void => {
  const resolved = deref(state, container);
  if (!resolved) return;
  // Plain URL string (e.g. Menu.images is `string[]`, not object[])
  if (typeof resolved === 'string') {
    if (/^https?:\/\//.test(resolved) && !seen.has(resolved)) {
      seen.add(resolved);
      out.push(resolved);
    }
    return;
  }
  if (Array.isArray(resolved)) {
    for (const item of resolved) collectImagesFromContainer(state, item, out, seen);
    return;
  }
  if (!isObject(resolved)) return;

  const u =
    (typeof resolved['origin'] === 'string' && resolved['origin']) ||
    (typeof resolved['url'] === 'string' && resolved['url']) ||
    (typeof resolved['imageUrl'] === 'string' && resolved['imageUrl']) ||
    (typeof resolved['src'] === 'string' && resolved['src']);
  if (typeof u === 'string' && /^https?:\/\//.test(u) && !seen.has(u)) {
    seen.add(u);
    out.push(u);
  }

  for (const value of Object.values(resolved)) {
    if (
      typeof value === 'string' ||
      Array.isArray(value) ||
      isRef(value) ||
      isObject(value)
    ) {
      collectImagesFromContainer(state, value, out, seen);
    }
  }
};

const IMAGE_FIELD_PREFIXES = ['images', 'cpImages', 'sasImages', 'menuImages'];

const harvestImagesFromContainer = (
  state: Record<string, unknown> | null,
  container: Record<string, unknown>,
  out: string[],
  seen: Set<string>,
): void => {
  for (const prefix of IMAGE_FIELD_PREFIXES) {
    for (const key of Object.keys(container)) {
      if (key !== prefix && !key.startsWith(`${prefix}(`)) continue;
      const resolved = deref(state, container[key]);
      if (isObject(resolved) && 'images' in resolved) {
        collectImagesFromContainer(state, resolved['images'], out, seen);
      } else {
        collectImagesFromContainer(state, resolved, out, seen);
      }
    }
  }
};

const extractImageUrls = (
  node: Record<string, unknown>,
  state: Record<string, unknown> | null,
  placeDetail: Record<string, unknown> | null,
): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();

  // 1. Direct keys on the node (legacy GraphQL responses)
  for (const k of ['images', 'imageUrls', 'photoList']) {
    if (k in node) collectImagesFromContainer(state, node[k], out, seen);
  }
  // 2. Apollo cache: ROOT_QUERY.placeDetail({...}) holds images({...}).images[]
  if (placeDetail) harvestImagesFromContainer(state, placeDetail, out, seen);
  // 3. Same prefix on PlaceDetailBase itself (rare but possible)
  if (out.length === 0) harvestImagesFromContainer(state, node, out, seen);
  // 4. Last resort — scan ROOT_QUERY direct keys
  if (out.length === 0 && state) {
    const root = state['ROOT_QUERY'];
    if (isObject(root)) harvestImagesFromContainer(state, root, out, seen);
  }

  return out.slice(0, 20);
};

const formatBusinessHourEntry = (
  state: Record<string, unknown> | null,
  entry: Record<string, unknown>,
): string | null => {
  const day =
    pickString(entry, 'day', 'dayOfWeek', 'businessDay', 'date', 'displayDay') ?? '';
  const isClosed =
    entry['isDayOff'] === true ||
    entry['isClosed'] === true ||
    pickString(entry, 'description')?.includes('휴무');

  if (isClosed) return `${day} 휴무`.trim();

  // Naver shape: businessHours is a nested {start, end} object (StartEndTime)
  const nested = deref(state, entry['businessHours']);
  if (isObject(nested)) {
    const start = pickString(nested, 'start', 'startTime', 'openTime');
    const end = pickString(nested, 'end', 'endTime', 'closeTime');
    if (start && end) return `${day} ${start}-${end}`.trim();
  }

  // Legacy flat shape
  const flatStart = pickString(entry, 'businessStartTime', 'startTime', 'openTime');
  const flatEnd = pickString(entry, 'businessEndTime', 'endTime', 'closeTime');
  if (flatStart && flatEnd) return `${day} ${flatStart}-${flatEnd}`.trim();

  const desc = pickString(entry, 'description', 'displayName', 'displayText');
  if (desc) return `${day} ${desc}`.trim();

  return null;
};

const serializeBusinessHourContainer = (
  state: Record<string, unknown> | null,
  resolved: unknown,
): string | null => {
  if (!resolved) return null;

  // Naver shape: newBusinessHours(...) is an array of NewBusinessHour
  // wrappers (usually one — `name: "기본"`). Each wrapper has the real
  // weekday array under `.businessHours[]` of WorkingHoursInfo.
  const lines: string[] = [];
  let freeTextFallback: string | null = null;

  const consumeWeekdayArray = (arr: unknown[]) => {
    for (const item of arr) {
      const obj = deref(state, item);
      if (!isObject(obj)) continue;
      const formatted = formatBusinessHourEntry(state, obj);
      if (formatted) lines.push(formatted);
    }
  };

  const containers: unknown[] = Array.isArray(resolved) ? resolved : [resolved];
  for (const c of containers) {
    const obj = deref(state, c);
    if (!isObject(obj)) {
      if (Array.isArray(obj)) consumeWeekdayArray(obj as unknown[]);
      continue;
    }
    // NewBusinessHour wrapper → dig into its inner .businessHours[]
    const inner = obj['businessHours'];
    if (Array.isArray(inner)) {
      consumeWeekdayArray(inner);
      if (!freeTextFallback) {
        freeTextFallback = pickString(obj, 'freeText', 'description');
      }
      continue;
    }
    // Direct WorkingHoursInfo (no wrapper)
    const formatted = formatBusinessHourEntry(state, obj);
    if (formatted) lines.push(formatted);
  }

  if (lines.length) return lines.join('; ');
  if (freeTextFallback) return freeTextFallback;
  if (isObject(resolved)) {
    return pickString(resolved, 'freeText', 'description');
  }
  return null;
};

const extractBusinessHours = (
  node: Record<string, unknown>,
  state: Record<string, unknown> | null,
  placeDetail: Record<string, unknown> | null,
): string | null => {
  const flat = pickString(node, 'businessHours');
  if (flat) return flat;

  const candidates: unknown[] = [];
  // Most reliable: ROOT_QUERY.placeDetail(...).newBusinessHours(...)
  if (placeDetail) {
    for (const key of Object.keys(placeDetail)) {
      if (key.startsWith('newBusinessHours(') || key === 'newBusinessHours') {
        candidates.push(placeDetail[key]);
      }
    }
  }
  // Same prefix on the place node itself
  const onNode = findFieldByPrefix(node, 'newBusinessHours');
  if (onNode !== undefined) candidates.push(onNode);
  // ROOT_QUERY direct fallback
  if (state) {
    const root = state['ROOT_QUERY'];
    if (isObject(root)) {
      for (const key of Object.keys(root)) {
        if (key.startsWith('newBusinessHours(')) candidates.push(root[key]);
      }
    }
  }

  for (const c of candidates) {
    const line = serializeBusinessHourContainer(state, deref(state, c));
    if (line) return line;
  }
  return null;
};

const collectMenuImageUrls = (
  state: Record<string, unknown> | null,
  raw: unknown,
): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  collectImagesFromContainer(state, raw, out, seen);
  return out.slice(0, 6);
};

const buildMenuItem = (
  state: Record<string, unknown> | null,
  raw: unknown,
): MenuItemType | null => {
  const obj = deref(state, raw);
  if (!isObject(obj)) return null;
  const name = pickString(obj, 'name', 'menuName');
  if (!name) return null;
  const recommend =
    typeof obj['recommend'] === 'boolean'
      ? (obj['recommend'] as boolean)
      : typeof obj['isRecommend'] === 'boolean'
        ? (obj['isRecommend'] as boolean)
        : null;
  return {
    name,
    price: pickString(obj, 'price', 'priceText', 'menuPrice'),
    description: pickString(obj, 'description', 'desc'),
    recommend,
    imageUrls: collectMenuImageUrls(state, obj['images'] ?? obj['imageUrls']),
  };
};

const extractMenus = (
  placeId: string,
  state: Record<string, unknown> | null,
  placeDetail: Record<string, unknown> | null,
): MenuItemType[] => {
  if (!state) return [];
  const seenNames = new Set<string>();
  const out: MenuItemType[] = [];

  const push = (raw: unknown) => {
    const item = buildMenuItem(state, raw);
    if (!item) return;
    const dedupKey = `${item.name}|${item.price ?? ''}`;
    if (seenNames.has(dedupKey)) return;
    seenNames.add(dedupKey);
    out.push(item);
  };

  // 1. Direct normalized cache entries: `Menu:{placeId}_<i>`
  for (const key of Object.keys(state)) {
    if (key.startsWith(`Menu:${placeId}_`) || key.startsWith(`Menu:${placeId}-`)) {
      push(state[key]);
    }
  }

  // 2. ROOT_QUERY.placeDetail({...}).menus({...}) array of refs/objects
  if (placeDetail) {
    for (const key of Object.keys(placeDetail)) {
      if (key !== 'menus' && !key.startsWith('menus(')) continue;
      const resolved = deref(state, placeDetail[key]);
      if (Array.isArray(resolved)) {
        for (const m of resolved) push(m);
      } else if (isObject(resolved)) {
        const inner = resolved['menus'] ?? resolved['items'];
        if (Array.isArray(inner)) for (const m of inner) push(m);
      }
    }
  }

  return out.slice(0, 100);
};

const buildPlaceData = (
  placeId: string,
  canonicalUrl: string,
  node: Record<string, unknown>,
  state: Record<string, unknown> | null,
  placeDetail: Record<string, unknown> | null,
): NaverPlaceDataType => {
  const coordinates = isObject(node['coordinate']) ? node['coordinate'] : node;
  return {
    placeId,
    name: pickString(node, 'name') ?? '',
    category: pickString(node, 'category', 'categoryName'),
    address: pickString(node, 'address', 'fullAddress'),
    roadAddress: pickString(node, 'roadAddress'),
    phone: pickString(node, 'virtualPhone', 'phone', 'tel'),
    businessHours: extractBusinessHours(node, state, placeDetail),
    latitude: pickNumber(coordinates, 'y', 'lat', 'latitude'),
    longitude: pickNumber(coordinates, 'x', 'lng', 'longitude'),
    imageUrls: extractImageUrls(node, state, placeDetail),
    rating: pickNumber(node, 'visitorReviewsScore', 'rating', 'reviewScore'),
    reviewCount: pickNumber(node, 'visitorReviewsTotal', 'reviewCount'),
    menus: extractMenus(placeId, state, placeDetail),
    rawSourceUrl: canonicalUrl,
  };
};

const findPlaceNodeInApolloState = (
  state: Record<string, unknown>,
  placeId: string,
): Record<string, unknown> | null => {
  for (const key of [
    `PlaceDetailBase:${placeId}`,
    `PlaceSummary:${placeId}`,
    `RestaurantSummary:${placeId}`,
    `Restaurant:${placeId}`,
  ]) {
    const v = state[key];
    if (isObject(v)) return v;
  }
  return findRestaurantNode(state);
};

const findPlaceDetailContainer = (
  state: Record<string, unknown> | null,
  placeId: string,
): Record<string, unknown> | null => {
  if (!state) return null;
  const root = state['ROOT_QUERY'];
  if (!isObject(root)) return null;
  // Prefer the key whose argument JSON contains our placeId
  for (const key of Object.keys(root)) {
    if (key.startsWith('placeDetail(') && key.includes(`"id":"${placeId}"`)) {
      const v = deref(state, root[key]);
      if (isObject(v)) return v;
    }
  }
  // Fallback to any placeDetail( entry
  for (const key of Object.keys(root)) {
    if (key.startsWith('placeDetail(')) {
      const v = deref(state, root[key]);
      if (isObject(v)) return v;
    }
  }
  return null;
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

    const apolloState = await page
      .evaluate<unknown>(
        () =>
          (globalThis as unknown as { __APOLLO_STATE__?: unknown })
            .__APOLLO_STATE__ ?? null,
      )
      .catch(() => null);
    const apolloStateObj = isObject(apolloState) ? apolloState : null;

    if (DEBUG_CAPTURE) {
      await mkdir(DEBUG_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = join(DEBUG_DIR, `place-${placeId}-${stamp}.json`);
      await writeFile(
        file,
        JSON.stringify(
          {
            placeId,
            canonicalUrl,
            capturedCount: captured.length,
            captured: captured.map((c) => ({ url: c.url, body: c.body })),
            apolloState,
          },
          null,
          2,
        ),
        'utf-8',
      );
      console.log(`[crawl-debug] dumped ${captured.length} captures to ${file}`);
    }

    // Strategy 1: Apollo cache direct lookup (most reliable for m.place.naver.com)
    let placeNode: Record<string, unknown> | null = null;
    if (apolloStateObj) {
      placeNode = findPlaceNodeInApolloState(apolloStateObj, placeId);
    }

    // Strategy 2: Walk captured GraphQL responses
    if (!placeNode || !pickString(placeNode, 'name')) {
      for (const cap of captured) {
        const candidate = findRestaurantNode(cap.body);
        if (candidate && pickString(candidate, 'name')) {
          placeNode = candidate;
          break;
        }
      }
    }

    if (!placeNode) {
      throw new PlaceParseError('Could not find place data in Apollo cache or network responses');
    }

    const placeDetailContainer = findPlaceDetailContainer(apolloStateObj, placeId);
    return buildPlaceData(
      placeId,
      canonicalUrl,
      placeNode,
      apolloStateObj,
      placeDetailContainer,
    );
  } finally {
    if (ctx) await ctx.close().catch(() => undefined);
  }
};
