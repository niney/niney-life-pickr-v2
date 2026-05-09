// Standalone diagnostic to identify the unofficial Naver search endpoint that
// powers map.naver.com PC search. We open the search results page, capture
// every JSON response, and print URL + sample body so the call shape (path,
// params, headers) can be replicated server-side.
//
// Run: pnpm --filter friendly tsx scripts/dev-capture-search.ts

import { chromium } from 'playwright';

const QUERY = process.env.QUERY ?? '강남역 맛집';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface Captured {
  url: string;
  method: string;
  status: number;
  reqHeaders: Record<string, string>;
  body: unknown;
}

const interesting = (u: string): boolean =>
  /naver\.com/.test(u) &&
  /(allSearch|instance|search|graphql|place\/list|restaurant)/i.test(u);

const summarizeBody = (body: unknown): string => {
  const s = JSON.stringify(body);
  if (s.length <= 1500) return s;
  return s.slice(0, 1500) + ` ... [+${s.length - 1500} chars]`;
};

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: DESKTOP_UA,
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
  });
  const page = await ctx.newPage();

  const captured: Captured[] = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (!interesting(u)) return;
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
      url: u,
      method: res.request().method(),
      status: res.status(),
      reqHeaders: res.request().headers(),
      body,
    });
  });

  const target = `https://map.naver.com/p/search/${encodeURIComponent(QUERY)}`;
  console.log(`[probe] navigating ${target}`);
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page
    .waitForLoadState('networkidle', { timeout: 15_000 })
    .catch(() => undefined);
  // Late XHRs (suggest, refine) often arrive after networkidle settles
  await page.waitForTimeout(2_500);

  console.log(`\n[probe] captured ${captured.length} JSON responses\n`);
  for (const c of captured) {
    console.log(`===== ${c.method} ${c.url}`);
    console.log(`status=${c.status}`);
    const hSlim = {
      referer: c.reqHeaders['referer'],
      'user-agent': c.reqHeaders['user-agent'],
      cookie: c.reqHeaders['cookie'] ? '<present>' : undefined,
      authorization: c.reqHeaders['authorization'],
      accept: c.reqHeaders['accept'],
    };
    console.log(`reqHeaders: ${JSON.stringify(hSlim)}`);
    console.log(summarizeBody(c.body));
    console.log('');
  }

  await browser.close();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
