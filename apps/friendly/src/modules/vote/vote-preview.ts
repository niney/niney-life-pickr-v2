import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { env } from '../../config/env.js';
import { escapeHtml } from '../../lib/html.js';
import { VoteService } from './vote.service.js';

// 투표 공유 링크(/vote/:token)의 SNS 미리보기(Open Graph) 처리 — settlement
// share-preview 의 경량 복제(PNG 렌더·사진 수집·미리보기 캐시 없음, 기본 OG
// 이미지 사용). 크롤러/브라우저 분기 없이 같은 HTML: 봇은 head 메타만 읽고,
// 사람은 그 위에서 SPA 가 부팅된다.
//
// `.route.ts` 가 아니라 autoload 대상이 아니다 — /api/v1 prefix 밖 origin 루트
// 경로라 app.ts 에서 registerVotePreview(app) 로 명시 등록한다.
//
// 운영(nginx) 주의: `location ^~ /vote/` 로 friendly 에 프록시해야 OG 가 산다.
// 규칙이 없으면 nginx 가 정적 index.html 을 그대로 서빙 — SPA 는 정상 동작하고
// OG 미리보기만 빠진다(docs/deploy-friendly.md 참조).

const __dirname = dirname(fileURLToPath(import.meta.url));

// share-preview.ts 의 candidateIndexPaths 와 동일 근거 — dev(tsx src 실행)와
// prod(tsup 번들) 의 __dirname 이 달라 상향 탐색으로 둘 다 커버한다.
function candidateIndexPaths(): string[] {
  if (env.WEB_INDEX_PATH) return [resolve(env.WEB_INDEX_PATH)];
  const seen = new Set<string>();
  for (const base of [__dirname, process.cwd()]) {
    let cur = base;
    for (let i = 0; i < 7; i += 1) {
      seen.add(resolve(cur, 'apps/web/dist/index.html'));
      seen.add(resolve(cur, 'web/dist/index.html'));
      const up = dirname(cur);
      if (up === cur) break;
      cur = up;
    }
  }
  return [...seen];
}

// 프로세스 수명 동안 1회 캐시(share-preview 와 동일) — 재배포 후 pm2 reload 필수.
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

function injectOg(html: string, og: OgMeta): string {
  const withTitle = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(og.title)}</title>`,
  );
  return withTitle.replace('</head>', `    ${buildMetaTags(og)}\n  </head>`);
}

function getPublicOrigin(req: FastifyRequest): string {
  if (env.PUBLIC_ORIGIN) return env.PUBLIC_ORIGIN.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  const host = req.headers.host ?? 'ninelife.kr';
  return `${proto}://${host}`;
}

export async function registerVotePreview(app: FastifyInstance): Promise<void> {
  const service = new VoteService(app.prisma);

  const handler = async (
    req: FastifyRequest<{ Params: { token: string } }>,
    reply: FastifyReply,
  ) => {
    const loaded = await loadIndex();
    if (!('html' in loaded)) {
      app.log.error(
        { triedPaths: loaded.tried, cwd: process.cwd() },
        'vote-preview: index.html 을 찾지 못함 — WEB_INDEX_PATH 로 명시 지정 권장',
      );
      return reply.code(500).type('text/plain; charset=utf-8').send('preview unavailable');
    }

    const origin = getPublicOrigin(req);
    const pageUrl = `${origin}${req.url.split('?')[0]}`;
    const image = env.OG_IMAGE_PATH.startsWith('http')
      ? env.OG_IMAGE_PATH
      : `${origin}${env.OG_IMAGE_PATH}`;

    // 만료/없는 토큰(그리고 /vote/new 의 token='new')은 일반 OG 폴백 — SPA 가
    // 자체 화면(에러 또는 생성 페이지)을 띄운다.
    const meta = await service.getPreviewMeta(req.params.token);
    const og: OgMeta = meta
      ? {
          title: `[투표] ${meta.title}`,
          description: `후보 ${meta.optionCount}곳 · 지금 투표하세요`,
          url: pageUrl,
          image,
        }
      : {
          title: 'Life Pickr 투표',
          description: '우리 뭐 먹을까? 링크로 함께 투표하세요',
          url: pageUrl,
          image,
        };

    return reply
      .code(200)
      .type('text/html; charset=utf-8')
      .header('cache-control', 'public, max-age=60')
      .send(injectOg(loaded.html, og));
  };

  app.get('/vote/:token', handler);
}
