import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LRUCache } from 'lru-cache';
import { SajuShareImageFormat } from '@repo/api-contract';
import { defaultOgImage, getPublicOrigin, injectOg, loadWebIndex, type OgMeta } from '../../lib/web-index.js';
import { RATE } from '../../plugins/rate-limit.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import { SajuRecordsService } from './saju-records.service.js';
import { renderSajuShareCardPng } from './saju-share-card.js';
import { SajuError, SajuService } from './saju.service.js';

// 사주 공유 링크(/saju/s/:token)의 SNS 미리보기(OG) + 공유 이미지(/saju/s/:token/image.png).
// 타로(tarot-preview)와 같은 방식. `.route.ts` 가 아니라 app.ts 에서 명시 등록(/api/v1 밖 루트 경로).
// 운영(nginx): `location ^~ /saju/s/` 를 friendly 로 프록시해야 OG·이미지가 산다(docs/deploy-friendly.md).

const pngCache = new LRUCache<string, Buffer>({ max: 100 });

export async function registerSajuPreview(app: FastifyInstance): Promise<void> {
  const aiConfig = new AiConfigService(app.prisma, buildLlmProviderEnv());
  const service = new SajuService(app.prisma, aiConfig, { quota: app.usageQuota, logger: app.log });
  const records = new SajuRecordsService(app.prisma, service);

  const htmlHandler = async (req: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
    const loaded = await loadWebIndex();
    if (!('html' in loaded)) {
      app.log.error({ triedPaths: loaded.tried, cwd: process.cwd() }, 'saju-preview: index.html 을 찾지 못함 — WEB_INDEX_PATH 로 명시 지정 권장');
      return reply.code(500).type('text/plain; charset=utf-8').send('preview unavailable');
    }
    const origin = getPublicOrigin(req);
    const token = req.params.token;
    const pageUrl = `${origin}/saju/s/${encodeURIComponent(token)}`;
    const meta = await records.getSharePreviewMeta(token);
    const og: OgMeta = meta
      ? { title: meta.title, description: meta.description, url: pageUrl, image: `${origin}/saju/s/${encodeURIComponent(token)}/image.png` }
      : { title: 'Life Pickr 사주', description: '생년월일로 세운 사주팔자와 풀이를 확인해 보세요', url: pageUrl, image: defaultOgImage(origin) };
    return reply.code(200).type('text/html; charset=utf-8').header('cache-control', 'public, max-age=60').send(injectOg(loaded.html, og));
  };

  const imageHandler = async (req: FastifyRequest<{ Params: { token: string }; Querystring: { format?: string } }>, reply: FastifyReply) => {
    const token = req.params.token;
    const parsed = SajuShareImageFormat.safeParse(req.query.format ?? 'og');
    const format = parsed.success ? parsed.data : 'og';
    let shared;
    try {
      shared = await records.getShared(token);
    } catch (e) {
      if (!(e instanceof SajuError)) throw e;
      return reply.code(404).type('text/plain; charset=utf-8').send('not found');
    }
    try {
      const key = `${token}:${format}:${shared.includeBirth}`;
      let png = pngCache.get(key);
      if (!png) {
        png = await renderSajuShareCardPng(shared, format);
        pngCache.set(key, png);
      }
      return reply.code(200).type('image/png').header('cache-control', 'public, max-age=300').send(png);
    } catch (err) {
      app.log.error({ err, token, format }, 'saju share card 렌더 실패');
      return reply.code(500).type('text/plain; charset=utf-8').send('render error');
    }
  };

  app.get('/saju/s/:token', { config: { rateLimit: RATE.publicShare } }, htmlHandler);
  app.get('/saju/s/:token/image.png', { config: { rateLimit: RATE.publicShare } }, imageHandler);
}
