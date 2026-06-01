import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { env } from '../../config/env.js';
import { SettlementError, SettlementService } from './settlement.service.js';
import { renderSettlementCardPng } from './settlement-card.js';

// 정산 공유 링크의 SNS 미리보기(Open Graph) 처리.
//
// 웹은 순수 Vite SPA 라, 카카오톡·텔레그램 같은 크롤러가 JS 없이 index.html 을
// 긁으면 OG 태그가 전혀 없어 미리보기가 비어 보인다. 이 라우트가 정식 공유 경로
// `/share/settlements/:token` 과 별칭 `/s/:token` 을 가로채, 빌드된 index.html 의
// <head> 에 정산 요약(식당명·총액·인원수) OG 메타를 주입해 반환한다.
//
// 실제 사용자도 동일한 HTML 을 받고 그 위에서 SPA 가 평소대로 부팅된다(자산·그 외
// 경로는 nginx 정적 서빙 그대로). 풀 SSR 이 아니라 <head> 메타만 서버 주입.
//
// 프라이버시: 참가자 '이름'은 노출하지 않는다 — 크롤러 캐시에 박제되지 않도록
// 식당명 + 총액 + 인원수 까지만 담는다.

const __dirname = dirname(fileURLToPath(import.meta.url));

// 빌드된 웹 index.html 위치는 환경마다 다르다:
//  - dev: tsx 가 src 를 그대로 실행 → __dirname = apps/friendly/src/modules/settlement
//  - prod: tsup 이 번들 → share-preview 는 독립 파일이 아니라 app.js/chunk 에 합쳐져
//    __dirname = apps/friendly/dist (모듈 경로가 사라진다)
// 그래서 고정 상대경로 하나로는 둘 다 못 맞춘다. __dirname 과 cwd 에서 위로 올라가며
// `apps/web/dist/index.html` 과 `web/dist/index.html` 두 형태를 모두 후보로 만들어
// 처음 읽히는 것을 쓴다. WEB_INDEX_PATH 가 있으면 그것만 쓴다.
function candidateIndexPaths(): string[] {
  if (env.WEB_INDEX_PATH) return [resolve(env.WEB_INDEX_PATH)];
  const seen = new Set<string>();
  for (const base of [__dirname, process.cwd()]) {
    let cur = base;
    for (let i = 0; i < 7; i += 1) {
      seen.add(resolve(cur, 'apps/web/dist/index.html'));
      seen.add(resolve(cur, 'web/dist/index.html'));
      const up = dirname(cur);
      if (up === cur) break; // 루트 도달
      cur = up;
    }
  }
  return [...seen];
}

// index.html 은 배포마다 해시 자산명이 바뀌므로 프로세스 수명 동안만 캐시한다.
// pm2 reload 로 재기동되면 자연히 비워진다. 읽기 실패는 캐시하지 않는다.
// 실패 시 시도한 경로 전부를 반환해 호출부가 로그로 남긴다.
let cachedIndex: string | null = null;
async function loadIndex(): Promise<{ html: string } | { tried: string[] }> {
  if (cachedIndex) return { html: cachedIndex };
  const tried = candidateIndexPaths();
  for (const p of tried) {
    try {
      cachedIndex = await readFile(p, 'utf8');
      return { html: cachedIndex };
    } catch {
      // 다음 후보로
    }
  }
  return { tried };
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

// 1234567 → "1,234,567" (원 단위 정수). ICU 의존 없이 천단위 콤마만.
function formatWon(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

interface OgMeta {
  title: string;
  description: string;
  url: string;
  image: string;
}

function buildMetaTags(og: OgMeta): string {
  const t = escapeHtml(og.title);
  const d = escapeHtml(og.description);
  const u = escapeHtml(og.url);
  const img = escapeHtml(og.image);
  // og:image 크기는 의도적으로 생략 — 브랜드 이미지를 교체해도 메타가 어긋나지
  // 않도록 크롤러가 직접 감지하게 둔다. 고정 배너 확정 시 width/height 추가 권장.
  return [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Life Pickr" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta name="description" content="${d}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
  ].join('\n    ');
}

// 기존 <title> 교체 + </head> 앞에 OG 메타 삽입.
function injectOg(html: string, og: OgMeta): string {
  const withTitle = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(og.title)}</title>`,
  );
  return withTitle.replace('</head>', `    ${buildMetaTags(og)}\n  </head>`);
}

export async function registerSharePreview(app: FastifyInstance): Promise<void> {
  const service = new SettlementService(app.prisma);

  const handler = async (
    req: FastifyRequest<{ Params: { token: string } }>,
    reply: FastifyReply,
  ) => {
    const loaded = await loadIndex();
    if (!('html' in loaded)) {
      // index.html 을 어느 후보 경로에서도 못 읽음(dist 미빌드/경로 오설정).
      // 시도한 경로를 전부 남겨 운영에서 바로 진단할 수 있게 한다.
      app.log.error(
        { triedPaths: loaded.tried, cwd: process.cwd() },
        'share-preview: index.html 을 찾지 못함 — WEB_INDEX_PATH 로 명시 지정 권장',
      );
      return reply.code(500).type('text/plain; charset=utf-8').send('preview unavailable');
    }
    const html = loaded.html;

    const { token } = req.params;
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
    const host = req.headers.host ?? 'ninelife.kr';
    const origin = `${proto}://${host}`;
    const pageUrl = `${origin}${req.url.split('?')[0]}`;
    const fallbackImage = env.OG_IMAGE_PATH.startsWith('http')
      ? env.OG_IMAGE_PATH
      : `${origin}${env.OG_IMAGE_PATH}`;

    let og: OgMeta;
    try {
      const s = await service.getBySharedToken(token);
      // 정산이 살아있으면 og:image 를 '정산표' 동적 이미지로 — 링크만 붙여도
      // 카카오톡/텔레그램 미리보기에 정산표 매트릭스가 바로 뜬다.
      //
      // 프라이버시: 카드에는 참가자 이름이 들어간다. 공유 페이지를 열면 어차피
      // 같은 명단이 그대로 보이고, 모든 공유 링크는 최대 30일 내 만료(만료 후
      // 이미지 라우트는 404 → 크롤러가 기본 이미지로 폴백)되므로 동일한 노출
      // 범위로 본다. 더 보수적으로 가려면 OG_IMAGE_PATH 기본 이미지로 되돌리면 됨.
      og = {
        title: `${s.restaurantName} 정산`,
        description: `총 ${formatWon(s.grandTotal)}원 · ${s.participants.length}명`,
        url: pageUrl,
        image: `${origin}/share/settlements/${encodeURIComponent(token)}/image.png`,
      };
    } catch (e) {
      if (!(e instanceof SettlementError)) throw e;
      // 만료/없는 토큰 — 일반 OG 로 폴백. SPA 가 자체 에러 화면을 띄운다.
      og = {
        title: 'Life Pickr 정산',
        description: '정산 내역을 확인해보세요',
        url: pageUrl,
        image: fallbackImage,
      };
    }

    return reply
      .code(200)
      .type('text/html; charset=utf-8')
      .header('cache-control', 'no-cache')
      .send(injectOg(html, og));
  };

  // 정산 요약 카드 PNG — 메신저에 '이미지로 보내기' 버튼 + og:image 가 소비.
  // 토큰 기반 공개 라우트(공유 페이지와 동일한 노출 범위). 만료/없음 → 404.
  const imageHandler = async (
    req: FastifyRequest<{ Params: { token: string } }>,
    reply: FastifyReply,
  ) => {
    const { token } = req.params;
    let session;
    try {
      session = await service.getBySharedToken(token);
    } catch (e) {
      if (!(e instanceof SettlementError)) throw e;
      return reply.code(404).type('text/plain; charset=utf-8').send('not found');
    }
    try {
      const png = await renderSettlementCardPng(session);
      return reply
        .code(200)
        .type('image/png')
        // 편집은 드물고 크롤러 신선도엔 5분이면 충분. editedAt 기반 ETag 까지는
        // 가지 않는다(메신저는 자체적으로 OG 이미지를 더 길게 캐시).
        .header('cache-control', 'public, max-age=300')
        .send(png);
    } catch (err) {
      app.log.error({ err, token }, 'settlement card 렌더 실패');
      return reply.code(500).type('text/plain; charset=utf-8').send('render error');
    }
  };

  app.get('/share/settlements/:token', handler);
  app.get('/s/:token', handler);
  app.get('/share/settlements/:token/image.png', imageHandler);
  app.get('/s/:token/image.png', imageHandler);
}
