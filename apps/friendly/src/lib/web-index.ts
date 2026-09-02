import type { FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { env } from '../config/env.js';
import { escapeHtml } from './html.js';

// 공유 링크 SNS 미리보기(OG) 공용 헬퍼 — 빌드된 웹 index.html 로드 + <head> 메타 주입.
// settlement/share-preview.ts·vote/vote-preview.ts 가 각자 들고 있던 것을 타로부터 공용으로
// 쓴다(기존 둘은 건드리지 않음). 순수 SPA 라 크롤러(JS 미실행)가 index.html 을 긁으면 OG 가
// 비어 있으므로, 공유 경로만 Fastify 가 받아 메타를 넣은 같은 HTML 을 내려주고 그 위에서 SPA 가
// 부팅된다.

const __dirname = dirname(fileURLToPath(import.meta.url));

// dev(tsx, src 실행)와 prod(tsup 번들, dist)의 __dirname 이 달라 위로 올라가며 두 형태를 모두
// 후보로 만든다. WEB_INDEX_PATH 가 있으면 그것만.
export function candidateWebIndexPaths(): string[] {
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

// 웹 정적 자산 루트(카드 이미지 등) 후보 — dist 가 있으면 dist, 없으면(dev) public.
export function candidateWebAssetRoots(): string[] {
  const seen = new Set<string>();
  for (const base of [__dirname, process.cwd()]) {
    let cur = base;
    for (let i = 0; i < 7; i += 1) {
      seen.add(resolve(cur, 'apps/web/dist'));
      seen.add(resolve(cur, 'web/dist'));
      seen.add(resolve(cur, 'apps/web/public'));
      seen.add(resolve(cur, 'web/public'));
      const up = dirname(cur);
      if (up === cur) break;
      cur = up;
    }
  }
  return [...seen];
}

// 프로세스 수명 동안 1회 캐시(재배포 후 pm2 reload 로 갱신). 실패는 캐시하지 않고 시도 경로를 돌려준다.
let cachedIndex: string | null = null;
export async function loadWebIndex(): Promise<{ html: string } | { tried: string[] }> {
  if (cachedIndex) return { html: cachedIndex };
  const tried = candidateWebIndexPaths();
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

export interface OgMeta {
  title: string;
  description: string;
  url: string;
  image: string;
}

export function buildOgMetaTags(og: OgMeta): string {
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

// 기존 <title> 교체 + </head> 앞에 OG 메타 삽입.
export function injectOg(html: string, og: OgMeta): string {
  const withTitle = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(og.title)}</title>`);
  return withTitle.replace('</head>', `    ${buildOgMetaTags(og)}\n  </head>`);
}

// 공개 URL 기준 origin — PUBLIC_ORIGIN 고정(Cloudflare/nginx Host 변형에 흔들리지 않게).
export function getPublicOrigin(req: FastifyRequest): string {
  if (env.PUBLIC_ORIGIN) return env.PUBLIC_ORIGIN.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  const host = req.headers.host ?? 'ninelife.kr';
  return `${proto}://${host}`;
}

export function defaultOgImage(origin: string): string {
  return env.OG_IMAGE_PATH.startsWith('http') ? env.OG_IMAGE_PATH : `${origin}${env.OG_IMAGE_PATH}`;
}
