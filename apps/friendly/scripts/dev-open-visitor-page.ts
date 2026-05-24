// Open the Naver visitor reviews page via a more natural navigation path,
// with playwright-extra + stealth applied to hide automation fingerprints.
//
// 흐름:
// 1) 레스토랑 홈 (/restaurant/{id}/home) 진입
// 2) 잠시 대기
// 3) 페이지 내 "리뷰" 탭 클릭 → /review/visitor 로 이동
// 4) 사용자가 창 닫을 때까지 대기
//
// stealth 가 navigator.webdriver, plugins, permissions, chrome.runtime 등을
// 일반 Chrome 처럼 위장 → 네이버 anti-bot 우회 가능한지 사람이 직접 확인.
//
// Run:
//   pnpm --filter friendly tsx scripts/dev-open-visitor-page.ts
//   pnpm --filter friendly tsx scripts/dev-open-visitor-page.ts <placeId>
//
// stealth 끄고 비교하려면:
//   DEV_OPEN_STEALTH=0 pnpm --filter friendly tsx scripts/dev-open-visitor-page.ts

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

const DEFAULT_PLACE_ID = '1968839024';
const PLACE_ID = process.argv[2] ?? DEFAULT_PLACE_ID;
const HOME_URL = `https://m.place.naver.com/restaurant/${PLACE_ID}/home`;
const REVIEW_URL = `https://m.place.naver.com/restaurant/${PLACE_ID}/review/visitor?reviewSort=recent`;

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const HOME_DWELL_MS = Number(process.env.DEV_OPEN_HOME_DWELL_MS ?? '2500');
const USE_STEALTH = process.env.DEV_OPEN_STEALTH !== '0';

if (USE_STEALTH) {
  chromium.use(StealthPlugin());
  console.log('[dev-open] stealth plugin enabled');
} else {
  console.log('[dev-open] stealth plugin DISABLED (DEV_OPEN_STEALTH=0)');
}

const main = async (): Promise<void> => {
  console.log(`[dev-open] placeId=${PLACE_ID}`);
  console.log(`[dev-open] 1) home → ${HOME_URL}`);
  console.log(`[dev-open] 2) click 리뷰 탭 → ${REVIEW_URL}`);

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    userAgent: MOBILE_UA,
    viewport: { width: 390, height: 844 },
    locale: 'ko-KR',
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  try {
    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    console.log('[dev-open] home loaded');
    await page
      .waitForLoadState('networkidle', { timeout: 5_000 })
      .catch(() => undefined);
  } catch (err) {
    console.error('[dev-open] home navigation failed:', err);
  }

  console.log(`[dev-open] waiting ${HOME_DWELL_MS}ms on home (dwell)`);
  await page.waitForTimeout(HOME_DWELL_MS);

  const candidates = [
    `a[href*="/restaurant/${PLACE_ID}/review/visitor"]`,
    'a[href*="/review/visitor"]',
    'a[role="tab"]:has-text("리뷰")',
    'a:has-text("리뷰")',
  ];

  let clicked = false;
  for (const sel of candidates) {
    const loc = page.locator(sel).first();
    const count = await loc.count().catch(() => 0);
    if (!count) continue;
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 2_000 });
      await loc.click({ timeout: 3_000 });
      console.log(`[dev-open] clicked "${sel}"`);
      clicked = true;
      break;
    } catch {
      // try next selector
    }
  }

  if (!clicked) {
    console.log(
      '[dev-open] 리뷰 탭 클릭 실패 — 직접 navigation 으로 fallback',
    );
    try {
      await page.goto(REVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    } catch (err) {
      console.error('[dev-open] fallback navigation failed:', err);
    }
  } else {
    await page
      .waitForURL(/\/review\/visitor/, { timeout: 10_000 })
      .catch(() => undefined);
  }

  console.log('[dev-open] 리뷰 페이지 도착 — 창 닫으면 종료됩니다');

  await new Promise<void>((resolve) => {
    page.on('close', resolve);
    ctx.on('close', resolve);
    browser.on('disconnected', resolve);
  });

  await browser.close().catch(() => undefined);
  console.log('[dev-open] done');
};

main().catch((err) => {
  console.error('[dev-open] failed:', err);
  process.exit(1);
});
