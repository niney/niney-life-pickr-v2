import type { FastifyInstance } from 'fastify';
import { PublicSajuShare, Routes } from '@repo/api-contract';
import { defaultOgImage, getPublicOrigin, injectOg, loadWebIndex } from '../../lib/web-index.js';
import { RATE } from '../../plugins/rate-limit.js';

// 공개 허용 필드만 OG에 넣는다. 삭제된 공유는 캐시한 문구를 되살리지 않는다.
export async function registerSajuPreview(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { token: string } }>(
    Routes.Saju.sharePage(':token'),
    { config: { rateLimit: RATE.publicShare } },
    async (req, reply) => {
      const loaded = await loadWebIndex();
      if (!('html' in loaded))
        return reply.code(503).type('text/plain').send('preview unavailable');
      const token = req.params.token;
      const row = /^[A-Za-z0-9_-]{32}$/.test(token)
        ? await app.prisma.sajuShare.findUnique({ where: { token }, select: { publicJson: true } })
        : null;
      const shared = row ? PublicSajuShare.parse(JSON.parse(row.publicJson)) : null;
      const origin = getPublicOrigin(req);
      const html = injectOg(loaded.html, {
        title: shared ? `${shared.title} · 나의 오행 지도` : 'Life Pickr 사주',
        description: shared?.description ?? '공유가 취소되었거나 존재하지 않는 지도예요.',
        url: `${origin}${Routes.Saju.sharePage(token)}`,
        image: shared ? `${origin}${Routes.Saju.shareImage(token)}` : defaultOgImage(origin),
      });
      return reply
        .code(shared ? 200 : 404)
        .type('text/html; charset=utf-8')
        .header('cache-control', 'no-store')
        .send(html);
    },
  );
}
