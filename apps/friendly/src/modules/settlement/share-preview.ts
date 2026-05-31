import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { env } from '../../config/env.js';
import { SettlementError, SettlementService } from './settlement.service.js';

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

// 빌드 산출물 기준: dist/modules/settlement/share-preview.js → apps/web/dist/index.html.
// dev(tsx, src/...) 와 prod(dist/...) 모두 friendly 루트로부터 같은 깊이라 동일하게 동작.
const DEFAULT_INDEX_PATH = resolve(__dirname, '../../../../web/dist/index.html');

function indexPath(): string {
  return env.WEB_INDEX_PATH ? resolve(env.WEB_INDEX_PATH) : DEFAULT_INDEX_PATH;
}

// index.html 은 배포마다 해시 자산명이 바뀌므로 프로세스 수명 동안만 캐시한다.
// pm2 reload 로 재기동되면 자연히 비워진다. 읽기 실패는 캐시하지 않는다.
let cachedIndex: string | null = null;
async function loadIndex(): Promise<string | null> {
  if (cachedIndex) return cachedIndex;
  try {
    cachedIndex = await readFile(indexPath(), 'utf8');
    return cachedIndex;
  } catch {
    return null;
  }
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
    const html = await loadIndex();
    if (!html) {
      // index.html 을 못 읽음(dev 환경이라 dist 미빌드, 경로 오설정 등).
      app.log.warn(`share-preview: index.html 읽기 실패 — ${indexPath()}`);
      return reply.code(500).type('text/plain; charset=utf-8').send('preview unavailable');
    }

    const { token } = req.params;
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
    const host = req.headers.host ?? 'ninelife.kr';
    const origin = `${proto}://${host}`;
    const pageUrl = `${origin}${req.url.split('?')[0]}`;
    const image = env.OG_IMAGE_PATH.startsWith('http')
      ? env.OG_IMAGE_PATH
      : `${origin}${env.OG_IMAGE_PATH}`;

    let og: OgMeta;
    try {
      const s = await service.getBySharedToken(token);
      og = {
        title: `${s.restaurantName} 정산`,
        description: `총 ${formatWon(s.grandTotal)}원 · ${s.participants.length}명`,
        url: pageUrl,
        image,
      };
    } catch (e) {
      if (!(e instanceof SettlementError)) throw e;
      // 만료/없는 토큰 — 일반 OG 로 폴백. SPA 가 자체 에러 화면을 띄운다.
      og = {
        title: 'Life Pickr 정산',
        description: '정산 내역을 확인해보세요',
        url: pageUrl,
        image,
      };
    }

    return reply
      .code(200)
      .type('text/html; charset=utf-8')
      .header('cache-control', 'no-cache')
      .send(injectOg(html, og));
  };

  app.get('/share/settlements/:token', handler);
  app.get('/s/:token', handler);
}
