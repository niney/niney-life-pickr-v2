// Standalone diagnostic for visitor-review wire capture.
// Goal: open the test page, click "더보기" once, dump every JSON response
// body to __debug__/after.json (matching the user-provided visitor.json shape:
// an array of GraphQL response bodies). __debug__/after-meta.json holds
// url/method/status for each captured response so we can identify which
// endpoint actually carries the visitor reviews.
//
// Run: pnpm --filter friendly tsx scripts/dev-capture-visitor.ts

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

const PLACE_ID = '1968839024';
const URL = `https://m.place.naver.com/restaurant/${PLACE_ID}/review/visitor?reviewSort=recent`;

const DEBUG_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/modules/crawl/__debug__',
);

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

interface Captured {
  url: string;
  method: string;
  status: number;
  body: unknown;
}

const main = async () => {
  await mkdir(DEBUG_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 250 });
  const ctx = await browser.newContext({
    userAgent: MOBILE_UA,
    viewport: { width: 390, height: 844 },
    locale: 'ko-KR',
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // Block heavy resources but DO NOT filter by host on the response listener —
  // we want to see every JSON response so we can identify the visitor-reviews
  // endpoint.
  await page.route('**/*', (route) => {
    const t = route.request().resourceType();
    if (t === 'image' || t === 'font' || t === 'media') return route.abort();
    return route.continue();
  });

  const captured: Captured[] = [];
  page.on('response', async (res) => {
    const ct = res.headers()['content-type'] ?? '';
    if (!ct.includes('json')) return;
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      return;
    }
    if (body == null) return;
    captured.push({
      url: res.url(),
      method: res.request().method(),
      status: res.status(),
      body,
    });
  });

  console.log(`[dev-capture] navigating ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 7_000 }).catch(() => undefined);

  const beforeCount = captured.length;
  console.log(`[dev-capture] page loaded — ${beforeCount} JSON responses so far`);

  // Push to bottom so the pager 더보기 renders.
  await page
    .evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    .catch(() => undefined);
  await page.waitForTimeout(800);

  const candidates = [
    'a[role="button"]:has-text("리뷰 더보기")',
    'button:has-text("리뷰 더보기")',
    'a[role="button"]:has-text("더보기")',
    'button:has-text("더보기")',
  ];

  // Promise that resolves when a likely visitor-reviews response lands.
  // Wide net on purpose — graphql, anything mentioning visitor in url, etc.
  const waitMore = page
    .waitForResponse(
      (res) =>
        /visitor.*review/i.test(res.url()) ||
        res.url().includes('/graphql') ||
        res.url().includes('place.naver.com/api'),
      { timeout: 7_000 },
    )
    .catch(() => null);

  let clicked = false;
  for (const sel of candidates) {
    const matches = page.locator(sel);
    const count = await matches.count().catch(() => 0);
    if (!count) continue;
    console.log(`[dev-capture] selector "${sel}" → ${count} matches`);
    const target = matches.last();
    try {
      await target.scrollIntoViewIfNeeded({ timeout: 2_000 });
      await target.click({ timeout: 3_000 });
      clicked = true;
      console.log(`[dev-capture] clicked "${sel}" (last)`);
      break;
    } catch {
      try {
        await target.evaluate((el) => (el as HTMLElement).click());
        clicked = true;
        console.log(`[dev-capture] clicked "${sel}" (last, JS dispatch)`);
        break;
      } catch {
        // try next
      }
    }
  }

  if (!clicked) console.log('[dev-capture] no 더보기 selector matched');

  await waitMore;
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  // small extra grace period — Naver sometimes flushes responses just after networkidle
  await page.waitForTimeout(1_000);

  console.log(
    `[dev-capture] total captured: ${captured.length} (before click=${beforeCount}, after=${captured.length - beforeCount})`,
  );

  // Naver GraphQL responses come as a batch array even when there's only one
  // operation. visitor.json (the reference) holds the unwrapped objects, so we
  // flatten arrays here and keep only the operations that carry visitorReviews.
  const isVisitorReviewsResponse = (b: unknown): boolean => {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return false;
    const data = (b as Record<string, unknown>)['data'];
    return (
      data !== null &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      'visitorReviews' in (data as Record<string, unknown>)
    );
  };
  const bodies = captured.flatMap((c) => {
    const b = c.body;
    return Array.isArray(b) ? b.filter(isVisitorReviewsResponse) : isVisitorReviewsResponse(b) ? [b] : [];
  });
  const meta = captured.map((c) => ({ url: c.url, method: c.method, status: c.status }));

  const afterPath = resolve(DEBUG_DIR, 'after.json');
  const metaPath = resolve(DEBUG_DIR, 'after-meta.json');
  await writeFile(afterPath, JSON.stringify(bodies, null, 2), 'utf-8');
  await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  console.log(`[dev-capture] wrote ${afterPath}`);
  console.log(`[dev-capture] wrote ${metaPath}`);

  // Quick summary: which captured bodies look like visitor reviews?
  const looksLikeVisitor = captured
    .map((c, i) => ({ i, c }))
    .filter(({ c }) => {
      const b = c.body;
      if (!b || typeof b !== 'object') return false;
      const s = JSON.stringify(b);
      return s.includes('visitorReviews') || s.includes('VisitorReview');
    });
  console.log(
    `[dev-capture] ${looksLikeVisitor.length} responses mention visitorReviews:`,
    looksLikeVisitor.map(({ i, c }) => `[${i}] ${c.method} ${c.url}`),
  );

  // E2E parser check — mirrors parseVisitorReviewsFromCaptured in the adapter.
  // If this returns >0 reviews, the adapter pipeline (filter + parser) is
  // proven correct end-to-end without needing dev:api.
  const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  const cleanText = (s: string) => s.replace(/\s+/g, ' ').trim();
  const pickString = (obj: Record<string, unknown>, ...keys: string[]) => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim().length) return v;
    }
    return null;
  };
  const pickNumber = (obj: Record<string, unknown>, ...keys: string[]) => {
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
  const buildReview = (raw: unknown) => {
    if (!isObject(raw)) return null;
    const body = pickString(raw, 'body', 'content', 'reviewBody', 'visitorReviewBody');
    if (!body) return null;
    let authorName = pickString(raw, 'authorName', 'nickname', 'userName');
    if (!authorName && isObject(raw['author'])) {
      authorName = pickString(raw['author'], 'nickname', 'name', 'userName');
    }
    return {
      authorName,
      rating: pickNumber(raw, 'rating', 'score', 'visitorReviewScore'),
      body: cleanText(body).slice(0, 500),
      visitedAt: pickString(raw, 'visited', 'visitedAt', 'visitDate', 'createdAt', 'created'),
    };
  };
  const parseReviews = (bodiesIn: unknown[]) => {
    const out: ReturnType<typeof buildReview>[] = [];
    const seenIds = new Set<string>();
    const visitItems = (items: unknown[]) => {
      for (const raw of items) {
        const r = buildReview(raw);
        if (!r) continue;
        const id = isObject(raw) ? (raw['id'] ?? raw['reviewId']) : null;
        if (typeof id === 'string') {
          if (seenIds.has(id)) continue;
          seenIds.add(id);
        }
        out.push(r);
      }
    };
    const walk = (b: unknown): void => {
      if (!isObject(b)) return;
      const data = b['data'];
      if (!isObject(data)) return;
      for (const v of Object.values(data)) {
        if (!isObject(v)) continue;
        const items = v['items'] ?? v['reviews'] ?? v['list'];
        if (Array.isArray(items)) {
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
    for (const b of bodiesIn) {
      if (Array.isArray(b)) for (const x of b) walk(x);
      else walk(b);
    }
    return out;
  };
  const parsed = parseReviews(bodies);
  console.log(`[dev-capture] parser produced ${parsed.length} VisitorReview records`);
  if (parsed.length > 0) {
    console.log('[dev-capture] sample [0]:', parsed[0]);
  }

  await page.waitForTimeout(2_000);
  await ctx.close();
  await browser.close();
};

main().catch((err) => {
  console.error('[dev-capture] failed:', err);
  process.exit(1);
});
