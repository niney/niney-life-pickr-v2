import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LRUCache } from 'lru-cache';
import { TarotShareImageFormat } from '@repo/api-contract';
import { defaultOgImage, getPublicOrigin, injectOg, loadWebIndex, type OgMeta } from '../../lib/web-index.js';
import { RATE } from '../../plugins/rate-limit.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import { renderTarotShareCardPng } from './tarot-share-card.js';
import { TarotError, TarotService } from './tarot.service.js';

// 타로 공유 링크(/tarot/s/:token)의 SNS 미리보기(OG) + 공유 이미지(/tarot/s/:token/image.png).
// vote-preview 와 같은 방식: 봇은 head 메타만 읽고, 사람은 같은 HTML 위에서 SPA 가 부팅된다.
// `.route.ts` 가 아니라 autoload 대상이 아니다 — /api/v1 밖 루트 경로라 app.ts 에서 명시 등록.
//
// 운영(nginx): `location ^~ /tarot/s/` 를 friendly 로 프록시해야 OG·이미지가 산다. `^~` 가
// 없으면 `.png` 정규식 location 이 이미지 요청을 가로채 404(docs/deploy-friendly.md).

// (token, format) 캐시 — satori+resvg 는 동기 네이티브 렌더라 요청마다 이벤트 루프를 잡는다.
// 공유 행은 불변이라 토큰만으로 충분. PNG 수십~수백 KB, 100개면 넉넉.
const pngCache = new LRUCache<string, Buffer>({ max: 100 });

export async function registerTarotPreview(app: FastifyInstance): Promise<void> {
  const aiConfig = new AiConfigService(app.prisma, buildLlmProviderEnv());
  const service = new TarotService(app.prisma, aiConfig, { quota: app.usageQuota, logger: app.log });

  const htmlHandler = async (req: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    const loaded = await loadWebIndex();
    if (!('html' in loaded)) {
      app.log.error(
        { triedPaths: loaded.tried, cwd: process.cwd() },
        'tarot-preview: index.html 을 찾지 못함 — WEB_INDEX_PATH 로 명시 지정 권장',
      );
      return reply.code(500).type('text/plain; charset=utf-8').send('preview unavailable');
    }
    const origin = getPublicOrigin(req);
    const token = req.params.token;
    const pageUrl = `${origin}/tarot/s/${encodeURIComponent(token)}`;
    const meta = await service.getSharePreviewMeta(token);
    const og: OgMeta = meta
      ? {
          title: `[타로] ${meta.keyword} · ${meta.spreadName}`,
          description: `${meta.cardNames.join(' · ')} — ${meta.summary}`.slice(0, 160),
          url: pageUrl,
          image: `${origin}/tarot/s/${encodeURIComponent(token)}/image.png`,
        }
      : {
          title: 'Life Pickr 타로',
          description: '카드가 골라 준 오늘의 답을 확인해 보세요',
          url: pageUrl,
          image: defaultOgImage(origin),
        };
    return reply
      .code(200)
      .type('text/html; charset=utf-8')
      .header('cache-control', 'public, max-age=60')
      .send(injectOg(loaded.html, og));
  };

  const imageHandler = async (
    req: FastifyRequest<{ Params: { token: string }; Querystring: { format?: string } }>,
    reply: FastifyReply,
  ) => {
    const token = req.params.token;
    const parsedFormat = TarotShareImageFormat.safeParse(req.query.format ?? 'og');
    const format = parsedFormat.success ? parsedFormat.data : 'og';
    let shared;
    try {
      shared = await service.getShared(token);
    } catch (e) {
      if (!(e instanceof TarotError)) throw e;
      return reply.code(404).type('text/plain; charset=utf-8').send('not found');
    }
    try {
      const key = `${token}:${format}`;
      let png = pngCache.get(key);
      if (!png) {
        png = await renderTarotShareCardPng(shared, format);
        pngCache.set(key, png);
      }
      return reply.code(200).type('image/png').header('cache-control', 'public, max-age=300').send(png);
    } catch (err) {
      app.log.error({ err, token, format }, 'tarot share card 렌더 실패');
      return reply.code(500).type('text/plain; charset=utf-8').send('render error');
    }
  };

  app.get('/tarot/s/:token', { config: { rateLimit: RATE.publicShare } }, htmlHandler);
  app.get('/tarot/s/:token/image.png', { config: { rateLimit: RATE.publicShare } }, imageHandler);
}
