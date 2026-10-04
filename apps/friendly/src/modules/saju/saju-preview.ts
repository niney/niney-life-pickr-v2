import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SajuShareImageFormat } from '@repo/api-contract';
import { MB, SharePngCache, ShareRenderBusyError } from '../../lib/share-render.js';
import { defaultOgImage, getPublicOrigin, injectOg, loadWebIndex, type OgMeta } from '../../lib/web-index.js';
import { RATE } from '../../plugins/rate-limit.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import { SajuRecordsService } from './saju-records.service.js';
import { renderSajuShareCardPng } from './saju-share-card.js';
import { SajuError, SajuService } from './saju.service.js';

// 사주 공유 링크(/saju-c/s/:token)의 SNS 미리보기(OG) + 공유 이미지(/saju-c/s/:token/image.png).
// 타로(tarot-preview)와 같은 방식. `.route.ts` 가 아니라 app.ts 에서 명시 등록(/api/v1 밖 루트 경로).
// 운영(nginx): `location ^~ /saju-c/s/` 를 friendly 로 프록시해야 OG·이미지가 산다(docs/deploy-friendly.md).

// (token, format, 생년월일 공개) PNG 캐시 — 바이트 상한(story 0.6MB·og 0.25MB 라 토큰 7개 안팎) + 1시간.
const pngCache = new SharePngCache({ maxBytes: 6 * MB, ttlMs: 60 * 60_000 });

// og:image 버전(v) — 생년월일 공개 플래그(타로의 질문 공개와 같은 방식). 붙은 주소만 하루 캐시, 없으면 5분.
const imageVersion = (includeBirth: boolean): string => (includeBirth ? 'b1' : 'b0');
const LONG_CACHE = 'public, max-age=86400';
const SHORT_CACHE = 'public, max-age=300';

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
    const pageUrl = `${origin}/saju-c/s/${encodeURIComponent(token)}`;
    const meta = await records.getSharePreviewMeta(token);
    const og: OgMeta = meta
      ? {
          title: meta.title,
          description: meta.description,
          url: pageUrl,
          image: `${origin}/saju-c/s/${encodeURIComponent(token)}/image.png?v=${imageVersion(meta.includeBirth)}`,
        }
      : { title: 'Life Pickr 사주(C)', description: '생년월일로 세운 사주팔자와 풀이를 확인해 보세요', url: pageUrl, image: defaultOgImage(origin) };
    return reply.code(200).type('text/html; charset=utf-8').header('cache-control', 'public, max-age=60').send(injectOg(loaded.html, og));
  };

  const imageHandler = async (req: FastifyRequest<{ Params: { token: string }; Querystring: { format?: string; v?: string } }>, reply: FastifyReply) => {
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
      const version = imageVersion(shared.includeBirth);
      const png = await pngCache.get(`${token}:${format}:${version}`, () => renderSajuShareCardPng(shared, format));
      return reply
        .code(200)
        .type('image/png')
        .header('cache-control', req.query.v === version ? LONG_CACHE : SHORT_CACHE)
        .send(png);
    } catch (err) {
      if (err instanceof ShareRenderBusyError) {
        return reply.code(503).header('retry-after', '5').header('cache-control', 'no-store').type('text/plain; charset=utf-8').send('busy');
      }
      app.log.error({ err, token, format }, 'saju share card 렌더 실패');
      return reply.code(500).type('text/plain; charset=utf-8').send('render error');
    }
  };

  app.get('/saju-c/s/:token', { config: { rateLimit: RATE.publicShare } }, htmlHandler);
  app.get('/saju-c/s/:token/image.png', { config: { rateLimit: RATE.publicShare } }, imageHandler);
}
