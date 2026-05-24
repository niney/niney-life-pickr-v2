// HTTP-only fixture grabber for visitor reviews — no Playwright.
// 목적: m.place.naver.com 의 visitor reviews 페이지 HTML 을 `fetch()` 한 번으로
// 받아 __debug__ 에 저장. 이후 cheerio 셀렉터 설계의 입력 자료.
//
// Run: pnpm --filter friendly tsx scripts/dev-fetch-visitor-html.ts
//      pnpm --filter friendly tsx scripts/dev-fetch-visitor-html.ts <placeId>
//
// Output:
//   __debug__/visitor-<placeId>-raw-<stamp>.html       원본 HTML
//   __debug__/visitor-<placeId>-apollo-<stamp>.json    추출된 __APOLLO_STATE__ (있으면)
//   __debug__/visitor-<placeId>-summary-<stamp>.json   진단 요약 (status, 길이, 차단 여부 등)

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PLACE_ID = '1968839024';
const PLACE_ID = process.argv[2] ?? DEFAULT_PLACE_ID;

const DEBUG_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/modules/crawl/__debug__',
);

const URL_STR = `https://m.place.naver.com/restaurant/${PLACE_ID}/review/visitor?reviewSort=recent`;

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const detectBlockPage = (html: string): { blocked: boolean; reason: string | null } => {
  const lower = html.toLowerCase();
  if (lower.includes('과도한 요청') || html.includes('과도한 요청')) {
    return { blocked: true, reason: '과도한 요청' };
  }
  if (html.includes('잠시 후 다시') || html.includes('잠시 후에 다시')) {
    return { blocked: true, reason: '잠시 후 다시' };
  }
  if (html.includes('비정상적인 접근') || html.includes('자동화된 접근')) {
    return { blocked: true, reason: '비정상 접근 차단' };
  }
  if (lower.includes('captcha') || lower.includes('recaptcha')) {
    return { blocked: true, reason: 'CAPTCHA' };
  }
  return { blocked: false, reason: null };
};

const extractApolloState = (html: string): unknown | null => {
  const m = html.match(
    /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\})\s*;[\s\S]*?<\/script>/,
  );
  if (!m || !m[1]) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
};

const probeReviewMarkup = (html: string): {
  liCount: number;
  hasReviewKeyword: boolean;
  sampleSnippets: string[];
} => {
  // 매우 러프한 휴리스틱 — fixture 보고 정확한 셀렉터 잡기 전 통계용.
  const liCount = (html.match(/<li[\s>]/g) ?? []).length;
  const hasReviewKeyword =
    html.includes('VisitorReview') ||
    html.includes('visitorReview') ||
    html.includes('"리뷰"') ||
    html.includes('리뷰 더보기');

  // body 같은 텍스트가 보이는 li 의 첫 N 개 발췌 (sniff 용)
  const liBlocks = html.match(/<li[\s\S]{0,2000}?<\/li>/g) ?? [];
  const sampleSnippets = liBlocks
    .filter(
      (s) =>
        /닉네임|작성자|평점|review|Review|visitor/i.test(s) ||
        /\d{4}\.\d{1,2}\.\d{1,2}/.test(s),
    )
    .slice(0, 3)
    .map((s) => s.slice(0, 400));

  return { liCount, hasReviewKeyword, sampleSnippets };
};

const main = async (): Promise<void> => {
  await mkdir(DEBUG_DIR, { recursive: true });

  console.log(`[dev-fetch] GET ${URL_STR}`);
  const start = Date.now();
  const res = await fetch(URL_STR, {
    headers: {
      'User-Agent': MOBILE_UA,
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      Referer: 'https://m.search.naver.com/',
    },
  });
  const html = await res.text();
  const elapsedMs = Date.now() - start;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rawPath = resolve(DEBUG_DIR, `visitor-${PLACE_ID}-raw-${stamp}.html`);
  await writeFile(rawPath, html, 'utf-8');

  const apolloState = extractApolloState(html);
  if (apolloState) {
    const apolloPath = resolve(
      DEBUG_DIR,
      `visitor-${PLACE_ID}-apollo-${stamp}.json`,
    );
    await writeFile(apolloPath, JSON.stringify(apolloState, null, 2), 'utf-8');
  }

  const block = detectBlockPage(html);
  const probe = probeReviewMarkup(html);

  const summary = {
    placeId: PLACE_ID,
    url: URL_STR,
    elapsedMs,
    status: res.status,
    contentLength: html.length,
    contentType: res.headers.get('content-type'),
    setCookieCount: res.headers.getSetCookie?.().length ?? 0,
    block,
    apolloState: {
      found: apolloState !== null,
      visitorReviewKeys: apolloState
        ? Object.keys(apolloState as Record<string, unknown>).filter(
            (k) => k.startsWith('VisitorReview:') || k.startsWith('Review:'),
          ).length
        : 0,
    },
    domProbe: probe,
  };
  const summaryPath = resolve(
    DEBUG_DIR,
    `visitor-${PLACE_ID}-summary-${stamp}.json`,
  );
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  console.log('\n[dev-fetch] summary:');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\n[dev-fetch] files written:');
  console.log(`  ${rawPath}`);
  if (apolloState) console.log(`  ${resolve(DEBUG_DIR, `visitor-${PLACE_ID}-apollo-${stamp}.json`)}`);
  console.log(`  ${summaryPath}`);

  if (block.blocked) {
    console.log(`\n[dev-fetch] ⚠ 차단 페이지로 보임 (${block.reason}). raw HTML 확인 필요.`);
  } else if (!apolloState && probe.liCount === 0) {
    console.log(
      '\n[dev-fetch] ⚠ Apollo state 도 없고 <li> 요소도 없음 — 페이지 구조 변경 가능성',
    );
  } else if (apolloState && summary.apolloState.visitorReviewKeys > 0) {
    console.log(
      `\n[dev-fetch] ✓ Apollo state 에 visitor review 키 ${summary.apolloState.visitorReviewKeys}개 발견 — JSON 경로 가능`,
    );
  } else {
    console.log('\n[dev-fetch] ✓ HTML 받음 — 셀렉터 설계 가능');
  }
};

main().catch((err) => {
  console.error('[dev-fetch] failed:', err);
  process.exit(1);
});
