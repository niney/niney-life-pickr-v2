import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import type {
  BlogReviewType,
  CrawlStageType,
  MenuItemType,
  NaverPlaceDataType,
  RatingDistributionBucketType,
  ReviewStatsType,
  ReviewThemeKeywordType,
  VisitorReviewType,
} from '@repo/api-contract';

// Hooks let the caller observe progress without coupling to a transport
// (SSE, log, future websocket — same API). Optional everywhere so the
// adapter can still be called as a pure "fetch + return" function (tests,
// scripts).
export interface AdapterHooks {
  signal?: AbortSignal;
  onStage?: (stage: CrawlStageType) => void;
  onPartial?: (data: NaverPlaceDataType) => void;
  onVisitorProgress?: (count: number) => void;
  // Emitted once per "더보기" page after parsing the wire batch — the caller
  // can persist + summarize concurrently with the next click. Fire-and-forget:
  // the adapter does not await the callback. Initial Apollo-rendered reviews
  // (~20 from server-side render) are NOT delivered here; they're returned in
  // the final result instead so the caller can persist them once at the end
  // (the dedup is idempotent).
  onVisitorBatch?: (batch: VisitorReviewType[]) => void;
  // Update mode: caller-supplied set of keys for reviews already in the DB.
  // When a "더보기" wire batch contains 100% known reviews, we stop
  // paginating — Naver returns visitor reviews newest-first, so once we hit
  // a page made entirely of seen rows the rest is older than what we have.
  // Keys missing both id and contentHash are treated as new (conservative).
  existingReviewKeys?: ExistingReviewKeys;
}

export interface ExistingReviewKeys {
  externalIds: ReadonlySet<string>;
  contentHashes: ReadonlySet<string>;
}

export class CrawlCancelledError extends Error {
  constructor() {
    super('Crawl cancelled');
    this.name = 'CrawlCancelledError';
  }
}

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new CrawlCancelledError();
};

const DEBUG_CAPTURE = process.env.CRAWL_DEBUG_CAPTURE === '1';
const DEBUG_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../__debug__',
);

// Debug toggles for one-off experiments. Off by default.
const HEADLESS = process.env.CRAWL_HEADLESS !== '0';
const SLOW_MO = HEADLESS ? 0 : Number(process.env.CRAWL_SLOWMO ?? '250');
// Visitor reviews pagination — click "더보기" until it disappears or we hit
// the safety cap. Set to 0 to skip pagination (Apollo cache only — first ~20).
// 30 pages × ~10 reviews/page = ~300 reviews max, enough for almost any place.
const VISITOR_MAX_PAGES = Number(process.env.CRAWL_VISITOR_MAX_PAGES ?? '30');
// Inter-click delay to avoid Naver rate-limiting on rapid pagination.
const VISITOR_PAGE_DELAY_MS = Number(process.env.CRAWL_VISITOR_PAGE_DELAY_MS ?? '300');
// In headed mode, pause the visitor subpage before closing so a human can
// visually verify the "더보기" clicks landed. Headless mode never holds.
const VISITOR_HOLD_MS = HEADLESS
  ? 0
  : Number(process.env.CRAWL_HOLD_MS ?? '5000');

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

let browserPromise: Promise<Browser> | null = null;

const getBrowser = (): Promise<Browser> => {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO });
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

const normalizeImageUrl = (raw: string): string => {
  // Force https — Naver image CDN supports https, and http causes mixed-content
  // problems on https admin pages. The thumbnail anchor (e.g. `#900x676`) is
  // harmless to keep but stripped for cleaner storage.
  return raw.replace(/^http:\/\//i, 'https://').replace(/#[^/]*$/, '');
};

// Defensive: if the recursive image walker ever resolves into a review/blog
// node (cross-typed Apollo refs), bail out so post URLs and blog photos don't
// pollute menu/visitor-review image lists.
const REVIEW_TYPENAME_RE = /(?:Review|^Blog|BlogPost)/i;
const isReviewTypename = (resolved: Record<string, unknown>): boolean => {
  const tn = resolved['__typename'];
  return typeof tn === 'string' && REVIEW_TYPENAME_RE.test(tn);
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
    if (/^https?:\/\//.test(resolved)) {
      const u = normalizeImageUrl(resolved);
      if (!seen.has(u)) { seen.add(u); out.push(u); }
    }
    return;
  }
  if (Array.isArray(resolved)) {
    for (const item of resolved) collectImagesFromContainer(state, item, out, seen);
    return;
  }
  if (!isObject(resolved)) return;
  // Hard stop at review/blog subtrees — `images(...)` containers occasionally
  // splice in adjacent BlogReview/FsasReview entries whose `url` fields are
  // post URLs, not image URLs.
  if (isReviewTypename(resolved)) return;

  const u =
    (typeof resolved['origin'] === 'string' && resolved['origin']) ||
    (typeof resolved['url'] === 'string' && resolved['url']) ||
    (typeof resolved['imageUrl'] === 'string' && resolved['imageUrl']) ||
    (typeof resolved['src'] === 'string' && resolved['src']) ||
    (typeof resolved['thumbnail'] === 'string' && resolved['thumbnail']);
  if (typeof u === 'string' && /^https?:\/\//.test(u)) {
    const norm = normalizeImageUrl(u);
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
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

const pushImageUrl = (raw: unknown, out: string[], seen: Set<string>): void => {
  if (typeof raw !== 'string' || !/^https?:\/\//.test(raw)) return;
  const norm = normalizeImageUrl(raw);
  if (seen.has(norm)) return;
  seen.add(norm);
  out.push(norm);
};

const extractImageUrls = (
  node: Record<string, unknown>,
  state: Record<string, unknown> | null,
  placeDetail: Record<string, unknown> | null,
): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();

  // Targeted extraction — only the two known canonical paths on placeDetail.
  // Avoids cpImages / fsasReviews / sasImages where blog and ad photos hide.
  //   1. placeDetail.images(...).images[].origin   ← official place gallery
  //   2. placeDetail.panoramaThumbnail(...).url    ← street/exterior panorama
  if (placeDetail) {
    for (const key of Object.keys(placeDetail)) {
      if (key === 'images' || key.startsWith('images(')) {
        const wrapper = deref(state, placeDetail[key]);
        const list = isObject(wrapper) ? wrapper['images'] : null;
        const items = Array.isArray(list) ? list : [];
        for (const item of items) {
          const obj = deref(state, item);
          if (!isObject(obj)) continue;
          pushImageUrl(obj['origin'], out, seen);
        }
      } else if (key === 'panoramaThumbnail' || key.startsWith('panoramaThumbnail(')) {
        const obj = deref(state, placeDetail[key]);
        if (isObject(obj)) pushImageUrl(obj['url'], out, seen);
      }
    }
  }

  // Fallback for legacy GraphQL shapes that put a flat list directly on the
  // place node (no Apollo placeDetail wrapper).
  if (out.length === 0) {
    for (const k of ['images', 'imageUrls', 'photoList']) {
      const raw = node[k];
      if (Array.isArray(raw)) {
        for (const item of raw) {
          if (typeof item === 'string') {
            pushImageUrl(item, out, seen);
          } else {
            const obj = deref(state, item);
            if (isObject(obj)) pushImageUrl(obj['origin'] ?? obj['url'] ?? obj['imageUrl'], out, seen);
          }
        }
      }
    }
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

const extractReviewStats = (
  state: Record<string, unknown> | null,
  placeDetail: Record<string, unknown> | null,
  placeId: string,
): ReviewStatsType | null => {
  if (!state) return null;
  // Direct normalized entry has the richest data
  let result = state[`VisitorReviewStatsResult:${placeId}`];
  if (isRef(result)) result = state[result.__ref] ?? null;
  if (!isObject(result) && placeDetail) {
    const v = deref(state, placeDetail['visitorReviewStats']);
    if (isObject(v)) result = v;
  }
  if (!isObject(result)) return null;

  const review = deref(state, result['review']);
  const analysis = deref(state, result['analysis']);

  const themeKeywords: ReviewThemeKeywordType[] = [];
  if (isObject(analysis) && Array.isArray(analysis['themes'])) {
    for (const t of analysis['themes']) {
      const obj = deref(state, t);
      if (!isObject(obj)) continue;
      const code = pickString(obj, 'code');
      const label = pickString(obj, 'label');
      const count = pickNumber(obj, 'count');
      if (code && label && count !== null) {
        themeKeywords.push({ code, label, count });
      }
    }
  }

  const ratingDistribution: RatingDistributionBucketType[] = [];
  if (isObject(review) && Array.isArray(review['scores'])) {
    for (const s of review['scores']) {
      const obj = deref(state, s);
      if (!isObject(obj)) continue;
      const count = pickNumber(obj, 'count');
      if (count === null) continue;
      ratingDistribution.push({
        score: pickNumber(obj, 'score'),
        count,
      });
    }
  }

  return {
    averageRating: isObject(review) ? pickNumber(review, 'avgRating') : null,
    totalCount: isObject(review) ? pickNumber(review, 'totalCount') : null,
    textReviewCount: pickNumber(result, 'visitorReviewsTextReviewTotal'),
    imageReviewCount: isObject(review) ? pickNumber(review, 'imageReviewCount') : null,
    authorCount: isObject(review) ? pickNumber(review, 'authorCount') : null,
    themeKeywords,
    ratingDistribution,
  };
};

const cleanText = (s: string): string => s.replace(/\s+/g, ' ').trim();

const buildBlogReview = (
  state: Record<string, unknown> | null,
  raw: unknown,
): BlogReviewType | null => {
  const obj = deref(state, raw);
  if (!isObject(obj)) return null;
  const url = pickString(obj, 'url');
  const title = pickString(obj, 'title');
  if (!url || !title) return null;

  const rawContents = pickString(obj, 'contents', 'description', 'content');
  const excerpt = rawContents ? cleanText(rawContents).slice(0, 200) : null;

  const thumbnailUrls: string[] = [];
  const seenThumbs = new Set<string>();
  const pushThumb = (u: string) => {
    const norm = normalizeImageUrl(u);
    if (!seenThumbs.has(norm)) { seenThumbs.add(norm); thumbnailUrls.push(norm); }
  };
  const thumbList = obj['thumbnailUrlList'];
  if (Array.isArray(thumbList)) {
    for (const u of thumbList) {
      if (typeof u === 'string' && /^https?:\/\//.test(u)) pushThumb(u);
    }
  }
  const single = pickString(obj, 'thumbnailUrl');
  if (single) {
    const norm = normalizeImageUrl(single);
    if (!seenThumbs.has(norm)) { seenThumbs.add(norm); thumbnailUrls.unshift(norm); }
  }

  return {
    type: pickString(obj, 'type', 'typeName') ?? 'unknown',
    title,
    excerpt,
    url,
    thumbnailUrls: thumbnailUrls.slice(0, 10),
    date: pickString(obj, 'date', 'createdString', 'createdAt'),
    authorName: pickString(obj, 'name', 'authorName', 'nickname'),
  };
};

const extractBlogReviews = (
  state: Record<string, unknown> | null,
  placeDetail: Record<string, unknown> | null,
): BlogReviewType[] => {
  if (!state) return [];
  const out: BlogReviewType[] = [];
  const seenUrls = new Set<string>();
  const push = (raw: unknown) => {
    const r = buildBlogReview(state, raw);
    if (!r || seenUrls.has(r.url)) return;
    seenUrls.add(r.url);
    out.push(r);
  };

  // 1. ROOT_QUERY.placeDetail(...).fsasReviews(...).items[]
  if (placeDetail) {
    for (const key of Object.keys(placeDetail)) {
      if (!key.startsWith('fsasReviews(') && key !== 'fsasReviews') continue;
      const resolved = deref(state, placeDetail[key]);
      if (isObject(resolved) && Array.isArray(resolved['items'])) {
        for (const it of resolved['items']) push(it);
      }
    }
  }
  // 2. Fallback: direct FsasReview: cache entries
  if (out.length === 0) {
    for (const key of Object.keys(state)) {
      if (key.startsWith('FsasReview:')) push(state[key]);
    }
  }

  return out.slice(0, 30);
};

const collectVisitorReviewImageUrls = (
  state: Record<string, unknown> | null,
  obj: Record<string, unknown>,
): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of ['media', 'images', 'photos', 'reviewMedia', 'mediaList']) {
    if (key in obj) collectImagesFromContainer(state, obj[key], out, seen);
  }
  // Direct top-level thumbnail string on the review itself
  if (out.length === 0 && typeof obj['thumbnail'] === 'string') {
    collectImagesFromContainer(state, obj['thumbnail'], out, seen);
  }
  return out.slice(0, 6);
};

const buildVisitorReview = (
  state: Record<string, unknown> | null,
  raw: unknown,
): VisitorReviewType | null => {
  const obj = deref(state, raw);
  if (!isObject(obj)) return null;
  const body = pickString(obj, 'body', 'content', 'reviewBody', 'visitorReviewBody');
  if (!body) return null;

  // author can be on the review or on a nested author/visitor object
  let authorName: string | null = pickString(obj, 'authorName', 'nickname', 'userName');
  if (!authorName) {
    const author = deref(state, obj['author'] ?? obj['visitor']);
    if (isObject(author)) {
      authorName = pickString(author, 'nickname', 'name', 'userName');
    }
  }

  return {
    authorName,
    rating: pickNumber(obj, 'rating', 'score', 'visitorReviewScore'),
    body: cleanText(body).slice(0, 500),
    visitedAt: pickString(obj, 'visited', 'visitedAt', 'visitDate', 'createdAt', 'created'),
    imageUrls: collectVisitorReviewImageUrls(state, obj),
  };
};

// Pull a stable id from a review record — Apollo cache keys, raw graphql
// items, and the buildVisitorReview output all expose this differently. Used
// for cross-source dedupe (wire vs Apollo state).
const reviewId = (raw: unknown): string | null => {
  if (!isObject(raw)) return null;
  const id = raw['id'] ?? raw['reviewId'];
  return typeof id === 'string' ? id : null;
};

// SHA-1 of authorName + body. Mirrors restaurant.service.contentHashOf —
// kept as a local copy so the adapter has no dependency on the persistence
// layer (data flows adapter → service, never the reverse).
const contentHashOfReview = (review: VisitorReviewType): string =>
  createHash('sha1').update(`${review.authorName ?? ''} ${review.body}`).digest('hex');

const extractVisitorReviewsFromState = (
  state: Record<string, unknown>,
  placeId: string,
  alreadySeenIds?: Set<string>,
): VisitorReviewType[] => {
  const out: VisitorReviewType[] = [];
  const seenIds = alreadySeenIds ?? new Set<string>();
  const seenBodies = new Set<string>();
  const push = (raw: unknown) => {
    const r = buildVisitorReview(state, raw);
    if (!r) return;
    const id = reviewId(raw);
    if (id) {
      if (seenIds.has(id)) return;
      seenIds.add(id);
    } else {
      // Body-based fallback — only for items without an id, since short
      // reviews ("굿", "맛있어요") would otherwise collapse multiple distinct
      // authors into one entry.
      const k = r.body.slice(0, 50);
      if (seenBodies.has(k)) return;
      seenBodies.add(k);
    }
    out.push({ ...r, externalId: id });
  };

  // 1. Direct normalized entries — typename guess: VisitorReview / Review
  for (const key of Object.keys(state)) {
    if (
      key.startsWith('VisitorReview:') ||
      key.startsWith('Review:') ||
      key.startsWith(`VisitorReview:${placeId}`)
    ) {
      push(state[key]);
    }
  }

  // 2. ROOT_QUERY scan for any field that looks like a visitor reviews list
  if (out.length === 0) {
    const root = state['ROOT_QUERY'];
    if (isObject(root)) {
      for (const key of Object.keys(root)) {
        if (!/visitor.*review|reviews?\(/i.test(key)) continue;
        const resolved = deref(state, root[key]);
        const items = isObject(resolved)
          ? (resolved['items'] ?? resolved['reviews'] ?? resolved['list'])
          : Array.isArray(resolved)
            ? resolved
            : null;
        if (Array.isArray(items)) for (const it of items) push(it);
      }
    }
  }

  return out.slice(0, 200);
};

// Visitor reviews come from POST /graphql responses whose `data.visitorReviews`
// holds the items. Naver's SPA does NOT writeQuery new pages back into Apollo
// cache after "더보기", so __APOLLO_STATE__ stays at the initial-render set; we
// harvest wire responses for the paginated batches and merge with Apollo for
// the initially-rendered ones.
const parseVisitorReviewsFromCaptured = (
  captured: unknown[],
  alreadySeenIds?: Set<string>,
): VisitorReviewType[] => {
  const out: VisitorReviewType[] = [];
  const seenIds = alreadySeenIds ?? new Set<string>();
  const seenBodies = new Set<string>();

  const visitItems = (items: unknown[]) => {
    for (const raw of items) {
      const r = buildVisitorReview(null, raw);
      if (!r) continue;
      const id = isObject(raw) ? (raw['id'] ?? raw['reviewId']) : null;
      const externalId = typeof id === 'string' ? id : null;
      if (externalId) {
        if (seenIds.has(externalId)) continue;
        seenIds.add(externalId);
      } else {
        const k = r.body.slice(0, 50);
        if (seenBodies.has(k)) continue;
        seenBodies.add(k);
      }
      out.push({ ...r, externalId });
    }
  };

  // Response can be a single body or a batch array. Walk visitorReviews
  // wherever it appears under `data`.
  const walk = (body: unknown): void => {
    if (!isObject(body)) return;
    const data = body['data'];
    if (!isObject(data)) return;
    for (const v of Object.values(data)) {
      if (!isObject(v)) continue;
      const items = v['items'] ?? v['reviews'] ?? v['list'];
      if (Array.isArray(items)) {
        // Heuristic: only keep arrays that look like visitor reviews — items
        // should have a body/content field. Other queries may also expose
        // `items` (e.g. menus) so we filter.
        const looksLikeReview = items.some(
          (x) =>
            isObject(x) &&
            (typeof x['body'] === 'string' ||
              typeof x['content'] === 'string' ||
              typeof x['reviewBody'] === 'string'),
        );
        if (looksLikeReview) visitItems(items);
      }
    }
  };

  for (const body of captured) {
    if (Array.isArray(body)) for (const b of body) walk(b);
    else walk(body);
  }
  return out;
};

const fetchVisitorReviewsViaSubpage = async (
  ctx: BrowserContext,
  placeId: string,
  hooks?: AdapterHooks,
): Promise<VisitorReviewType[]> => {
  const url = `https://m.place.naver.com/restaurant/${placeId}/review/visitor`;
  const page = await ctx.newPage();
  try {
    // In headed debug mode, keep CSS/fonts so the page is visually intact for the
    // human watching; otherwise stay aggressive with abort to keep latency low.
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      const block = HEADLESS
        ? SHOULD_BLOCK.has(type)
        : type === 'media';
      return block ? route.abort() : route.continue();
    });

    // Intercept any JSON response from Naver place hosts — wider than just
    // /graphql because visitor reviews may come from other paths/methods.
    // Each item carries its url so we can post-filter and diagnose.
    interface CapturedResponse { url: string; method: string; body: unknown }
    const captured: CapturedResponse[] = [];
    page.on('response', async (res) => {
      const u = res.url();
      // The visitor-reviews "더보기" pager hits api.place.naver.com/graphql.
      // Other Naver place hosts may also serve JSON we want — keep them.
      if (
        !u.includes('api.place.naver.com/graphql') &&
        !u.includes('pcmap.place.naver.com') &&
        !u.includes('place.naver.com/api') &&
        !u.includes('m.place.naver.com/graphql')
      ) {
        return;
      }
      const ct = res.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        return;
      }
      if (body) captured.push({ url: u, method: res.request().method(), body });
    });

    hooks?.onStage?.('loading_visitor');
    throwIfAborted(hooks?.signal);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10_000 });
      await page
        .waitForLoadState('networkidle', { timeout: 5_000 })
        .catch(() => undefined);
    } catch {
      return [];
    }
    throwIfAborted(hooks?.signal);

    const snapshotApolloState = (): Promise<unknown> =>
      page
        .evaluate<unknown>(
          () =>
            (globalThis as unknown as { __APOLLO_STATE__?: unknown })
              .__APOLLO_STATE__ ?? null,
        )
        .catch(() => null);

    const dumpApolloState = async (
      label: 'after' | 'single',
      apolloState: unknown,
    ): Promise<void> => {
      if (!DEBUG_CAPTURE) return;
      await mkdir(DEBUG_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (apolloState) {
        const file = join(DEBUG_DIR, `visitor-${placeId}-${label}-${stamp}.json`);
        await writeFile(
          file,
          JSON.stringify(
            { placeId, url, label, capturedCount: captured.length, captured, apolloState },
            null,
            2,
          ),
          'utf-8',
        );
        // eslint-disable-next-line no-console
        console.log(
          `[crawl-debug] visitor reviews (${label}, captured=${captured.length}) → ${file}`,
        );
      }
      // Bodies-only dump alongside — flatten GraphQL batch arrays and keep
      // only the operations that carry data.visitorReviews. Matches the user-
      // provided visitor.json shape (one entry per visitor-reviews response).
      const isVisitorReviewsResponse = (b: unknown): boolean =>
        isObject(b) && isObject(b['data']) && 'visitorReviews' in b['data'];
      const visitorBodies = captured.flatMap((c) => {
        const b = c.body;
        return Array.isArray(b)
          ? b.filter(isVisitorReviewsResponse)
          : isVisitorReviewsResponse(b)
            ? [b]
            : [];
      });
      const bodiesFile = join(DEBUG_DIR, `visitor-${placeId}-${label}-bodies-${stamp}.json`);
      await writeFile(bodiesFile, JSON.stringify(visitorBodies, null, 2), 'utf-8');
    };

    let apolloState: unknown;
    // Naver uses both inline "펼쳐서 더보기" (expand a single review body)
    // and a pager more-button. Try multiple selectors; prefer the LAST match
    // because the pager sits below all the inline expand buttons.
    const candidates = [
      'a[role="button"]:has-text("리뷰 더보기")',
      'button:has-text("리뷰 더보기")',
      'a[role="button"]:has-text("더보기")',
      'button:has-text("더보기")',
    ];

    const findMoreButton = async () => {
      for (const sel of candidates) {
        const matches = page.locator(sel);
        const count = await matches.count().catch(() => 0);
        if (count > 0) return { sel, target: matches.last() };
      }
      return null;
    };

    if (VISITOR_MAX_PAGES > 0) {
      hooks?.onStage?.('paginating_visitor');
      // Click "더보기" until it disappears or we hit the safety cap. Each
      // click triggers a POST /graphql; we wait for that response before the
      // next click so we never race ahead of pagination.
      //
      // `pageBatchSeenIds` is the cumulative dedup set used when slicing
      // newly-arrived wire responses page-by-page. Distinct from the merge
      // step's `seenIds` (which combines Apollo + wire) — that one runs
      // once at the end with its own state.
      const pageBatchSeenIds = new Set<string>();
      let pages = 0;
      let consecutiveFailures = 0;
      while (pages < VISITOR_MAX_PAGES) {
        throwIfAborted(hooks?.signal);
        await page
          .evaluate(() => window.scrollTo(0, document.body.scrollHeight))
          .catch(() => undefined);
        await page.waitForTimeout(200);

        const more = await findMoreButton();
        if (!more) {
          // eslint-disable-next-line no-console
          console.log(
            `[crawl-debug] visitor pagination done — no "더보기" after ${pages} click(s)`,
          );
          break;
        }

        // Pre-arm response wait so we don't miss the wire.
        const beforeCaptured = captured.length;
        const wireWait = page
          .waitForResponse(
            (res) =>
              res.url().includes('api.place.naver.com/graphql') &&
              res.request().method() === 'POST',
            { timeout: 7_000 },
          )
          .catch(() => null);

        let clicked = false;
        try {
          await more.target.scrollIntoViewIfNeeded({ timeout: 2_000 });
          await more.target.click({ timeout: 3_000 });
          clicked = true;
        } catch {
          try {
            await more.target.evaluate((el) => (el as HTMLElement).click());
            clicked = true;
          } catch {
            // unable to click — bail out
          }
        }

        if (!clicked) {
          // eslint-disable-next-line no-console
          console.log(`[crawl-debug] visitor pagination: click failed at page ${pages + 1}, stopping`);
          break;
        }

        await wireWait;
        await page.waitForTimeout(VISITOR_PAGE_DELAY_MS);

        const newResponses = captured.length - beforeCaptured;
        pages += 1;
        if (newResponses === 0) {
          consecutiveFailures += 1;
          // eslint-disable-next-line no-console
          console.log(
            `[crawl-debug] visitor page ${pages}: no new response (consecutive=${consecutiveFailures})`,
          );
          if (consecutiveFailures >= 2) break;
        } else {
          consecutiveFailures = 0;
        }

        // Emit a running count after each successful page. We compute it
        // optimistically from wire responses we've already captured plus
        // Apollo's initial set — Apollo cache won't reflect "더보기" pages
        // (Naver SPA doesn't writeQuery), so wire is what grows.
        if (hooks?.onVisitorProgress) {
          const probeIds = new Set<string>();
          const wireSoFar = parseVisitorReviewsFromCaptured(
            captured.map((c) => c.body),
            probeIds,
          );
          hooks.onVisitorProgress(wireSoFar.length);
        }

        // Parse only the responses that arrived from this click and emit
        // them as a discrete batch. The persistence layer can write them to
        // the DB and kick off AI summarization while the next click is in
        // flight — the whole point of the partial-save design.
        if (newResponses > 0 && (hooks?.onVisitorBatch || hooks?.existingReviewKeys)) {
          const newWireBodies = captured.slice(beforeCaptured).map((c) => c.body);
          const newBatch = parseVisitorReviewsFromCaptured(
            newWireBodies,
            pageBatchSeenIds,
          );
          if (newBatch.length > 0) {
            hooks?.onVisitorBatch?.(newBatch);

            // Update mode: if the batch we just got is 100% reviews we've
            // already stored, the rest of pagination is older still — bail.
            const known = hooks?.existingReviewKeys;
            if (known) {
              const allKnown = newBatch.every((r) => {
                if (r.externalId && known.externalIds.has(r.externalId)) return true;
                return known.contentHashes.has(contentHashOfReview(r));
              });
              if (allKnown) {
                // eslint-disable-next-line no-console
                console.log(
                  `[crawl-debug] update mode: page ${pages} entirely known — stop paginating`,
                );
                break;
              }
            }
          }
        }
      }
      if (pages >= VISITOR_MAX_PAGES) {
        // eslint-disable-next-line no-console
        console.log(
          `[crawl-debug] visitor pagination capped at CRAWL_VISITOR_MAX_PAGES=${VISITOR_MAX_PAGES}`,
        );
      }

      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    }

    apolloState = await snapshotApolloState();
    await dumpApolloState(VISITOR_MAX_PAGES > 0 ? 'after' : 'single', apolloState);

    if (VISITOR_HOLD_MS > 0) {
      // eslint-disable-next-line no-console
      console.log(`[crawl-debug] holding visitor page for ${VISITOR_HOLD_MS}ms`);
      await page.waitForTimeout(VISITOR_HOLD_MS);
    }

    // Merge: Apollo cache holds the initially-rendered page (server-side
    // hydrated, ~20 reviews), wire responses hold subsequent "더보기" pages.
    // Apollo first so its ids prime the dedup set, then wire fills in the
    // pages that didn't writeQuery back.
    const seenIds = new Set<string>();
    const fromApollo = isObject(apolloState)
      ? extractVisitorReviewsFromState(apolloState, placeId, seenIds)
      : [];
    const fromWire = parseVisitorReviewsFromCaptured(
      captured.map((c) => c.body),
      seenIds,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[crawl-debug] visitor reviews — apollo=${fromApollo.length}, wire=${fromWire.length}, captured=${captured.length}`,
    );
    if (fromApollo.length === 0 && fromWire.length === 0 && captured.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[crawl-debug] captured ${captured.length} responses but none looked like visitor reviews. Sample urls:`,
        captured.slice(0, 5).map((c) => `${c.method} ${c.url}`),
      );
    }
    return [...fromApollo, ...fromWire].slice(0, 200);
  } finally {
    await page.close().catch(() => undefined);
  }
};

const buildPlaceData = (
  placeId: string,
  canonicalUrl: string,
  node: Record<string, unknown>,
  state: Record<string, unknown> | null,
  placeDetail: Record<string, unknown> | null,
  visitorReviews: VisitorReviewType[] | null,
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
    reviewStats: extractReviewStats(state, placeDetail, placeId),
    blogReviews: extractBlogReviews(state, placeDetail),
    visitorReviews: visitorReviews ?? [],
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
  hooks?: AdapterHooks,
): Promise<NaverPlaceDataType> => {
  hooks?.onStage?.('launching');
  throwIfAborted(hooks?.signal);
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

    hooks?.onStage?.('loading_main');
    throwIfAborted(hooks?.signal);
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
    throwIfAborted(hooks?.signal);
    hooks?.onStage?.('parsing_main');

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

    // Emit a partial snapshot — main page parsed, visitor reviews still
    // pending. Lets the UI render the place card immediately while visitor
    // pagination (which can take minutes) streams in.
    if (hooks?.onPartial) {
      hooks.onPartial(
        buildPlaceData(
          placeId,
          canonicalUrl,
          placeNode,
          apolloStateObj,
          placeDetailContainer,
          [],
        ),
      );
    }

    throwIfAborted(hooks?.signal);
    // Fetch visitor reviews from the dedicated subpage (best-effort — tolerate
    // failure, but propagate cancellation).
    let visitorReviews: VisitorReviewType[] = [];
    try {
      visitorReviews = await fetchVisitorReviewsViaSubpage(ctx, placeId, hooks);
    } catch (e) {
      if (e instanceof CrawlCancelledError) throw e;
      visitorReviews = [];
    }

    hooks?.onStage?.('finalizing');
    return buildPlaceData(
      placeId,
      canonicalUrl,
      placeNode,
      apolloStateObj,
      placeDetailContainer,
      visitorReviews,
    );
  } finally {
    if (ctx) await ctx.close().catch(() => undefined);
  }
};
