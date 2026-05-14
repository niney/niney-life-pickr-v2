// Standalone diagnostic for Catch Table (catchtable.co.kr).
// Goal: identify (a) which inline state blob the page ships in HTML
// (__NEXT_DATA__ / __APOLLO_STATE__ / __INITIAL_STATE__ / etc.) and
// (b) which JSON XHR endpoints feed shop meta, menus, reviews, slots.
//
// Run:
//   pnpm --filter friendly tsx scripts/dev-capture-catchtable.ts
// With a specific shop URL:
//   $env:URL = 'https://app.catchtable.co.kr/ct/shop/<shopId>'
//   pnpm --filter friendly tsx scripts/dev-capture-catchtable.ts
// Toggle UA:
//   $env:UA = 'desktop'  # default: mobile (Catch Table is mobile-first)
//   $env:HEADLESS = '0'  # see the browser

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../src/modules/crawl/__debug__/catchtable');

const TARGET_URL = process.env.URL ?? 'https://app.catchtable.co.kr/';
const UA_MODE = (process.env.UA ?? 'mobile').toLowerCase();
const HEADLESS = process.env.HEADLESS !== '0';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface Captured {
  url: string;
  method: string;
  status: number;
  reqHeaders: Record<string, string>;
  contentType: string;
  body: unknown;
}

// Cast a wide net for the first probe — narrow later once we know the shape.
const interesting = (u: string): boolean =>
  /catchtable|tablemanager|tablenjoy|ctcdn/i.test(u) &&
  !/\.(png|jpg|jpeg|gif|webp|svg|woff2?|ttf|css|mp4|m3u8|ico)(\?|$)/i.test(u);

const summarizeBody = (body: unknown, max = 1500): string => {
  const s = typeof body === 'string' ? body : JSON.stringify(body);
  if (!s) return '<empty>';
  if (s.length <= max) return s;
  return s.slice(0, max) + ` ... [+${s.length - max} chars]`;
};

const extractInlineBlobs = (html: string): Record<string, string> => {
  const blobs: Record<string, string> = {};
  const patterns: Array<[string, RegExp]> = [
    ['__NEXT_DATA__', /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/],
    ['__APOLLO_STATE__', /__APOLLO_STATE__\s*=\s*({[\s\S]*?})<\/script>/],
    ['__INITIAL_STATE__', /__INITIAL_STATE__\s*=\s*({[\s\S]*?})<\/script>/],
    ['__PRELOADED_STATE__', /__PRELOADED_STATE__\s*=\s*({[\s\S]*?})<\/script>/],
    ['window.__data', /window\.__data\s*=\s*({[\s\S]*?})<\/script>/],
  ];
  for (const [name, re] of patterns) {
    const m = html.match(re);
    if (m) blobs[name] = m[1].trim();
  }
  return blobs;
};

const main = async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  console.log(`[probe] target = ${TARGET_URL}`);
  console.log(`[probe] UA mode = ${UA_MODE}, headless = ${HEADLESS}`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext(
    UA_MODE === 'desktop'
      ? {
          userAgent: DESKTOP_UA,
          viewport: { width: 1280, height: 900 },
          locale: 'ko-KR',
        }
      : {
          userAgent: MOBILE_UA,
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
          locale: 'ko-KR',
        },
  );
  const page = await ctx.newPage();

  const captured: Captured[] = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (!interesting(u)) return;
    const ct = res.headers()['content-type'] ?? '';
    // Capture both JSON and HTML so we can spot SSR endpoints too.
    if (!/json|text\/html|javascript/i.test(ct)) return;
    let body: unknown = null;
    try {
      if (ct.includes('json')) body = await res.json();
      else body = (await res.text()).slice(0, 4000);
    } catch {
      return;
    }
    captured.push({
      url: u,
      method: res.request().method(),
      status: res.status(),
      reqHeaders: res.request().headers(),
      contentType: ct,
      body,
    });
  });

  page.on('pageerror', (e) => console.warn(`[pageerror] ${e.message}`));

  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(2_500);

  // Try a light scroll — review/menu sections often hydrate lazily.
  await page.mouse.wheel(0, 1500).catch(() => undefined);
  await page.waitForTimeout(1_500);
  await page.mouse.wheel(0, 3000).catch(() => undefined);
  await page.waitForTimeout(1_500);

  const html = await page.content();
  const inline = extractInlineBlobs(html);

  // Write the raw HTML + each inline blob for offline inspection.
  const htmlPath = resolve(OUT_DIR, `page-${stamp}.html`);
  await writeFile(htmlPath, html, 'utf8');
  console.log(`\n[probe] saved HTML -> ${htmlPath}`);

  for (const [name, content] of Object.entries(inline)) {
    const p = resolve(OUT_DIR, `${name}-${stamp}.json`);
    await writeFile(p, content, 'utf8');
    console.log(`[probe] saved inline ${name} (${content.length} chars) -> ${p}`);
  }
  if (Object.keys(inline).length === 0) {
    console.log(`[probe] no recognised inline state blob found in HTML`);
  }

  const networkPath = resolve(OUT_DIR, `network-${stamp}.json`);
  await writeFile(networkPath, JSON.stringify(captured, null, 2), 'utf8');
  console.log(`[probe] saved ${captured.length} network responses -> ${networkPath}`);

  console.log(`\n===== network summary (${captured.length} entries) =====`);
  for (const c of captured) {
    console.log(`${c.method} ${c.status} ${c.contentType.split(';')[0]} ${c.url}`);
  }

  console.log(`\n===== JSON bodies (first 1500 chars) =====`);
  for (const c of captured) {
    if (!c.contentType.includes('json')) continue;
    console.log(`\n--- ${c.method} ${c.url}`);
    console.log(summarizeBody(c.body));
  }

  await browser.close();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
