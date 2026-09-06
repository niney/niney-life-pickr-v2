import type { FastifyInstance } from 'fastify';
import { PublicSajuGShare, Routes, SajuGShareToken } from '@repo/api-contract';
import { defaultOgImage, getPublicOrigin, injectOg, loadWebIndex } from '../../lib/web-index.js';
import { RATE } from '../../plugins/rate-limit.js';

// 공개 허용 필드만 OG에 넣는다. 삭제된 공유는 캐시한 문구를 되살리지 않는다.
export async function registerSajuGPreview(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { token: string } }>(
    Routes.SajuG.sharePage(':token'),
    { config: { rateLimit: RATE.publicShare } },
    async (req, reply) => {
      const loaded = await loadWebIndex();
      if (!('html' in loaded))
        return reply.code(503).type('text/plain').send('preview unavailable');
      const token = req.params.token;
      const row = SajuGShareToken.safeParse(token).success
        ? await app.prisma.sajuGShare.findUnique({ where: { token }, select: { publicJson: true } })
        : null;
      const shared = row ? PublicSajuGShare.parse(JSON.parse(row.publicJson)) : null;
      const origin = getPublicOrigin(req);
      const html = injectOg(loaded.html, {
        title: shared
          ? `${shared.title} · ${shared.pair ? '우리의' : '나의'} 오행 지도 · 사주(G)`
          : 'Life Pickr 사주(G)',
        description: shared?.description ?? '공유가 취소되었거나 존재하지 않는 지도예요.',
        url: `${origin}${Routes.SajuG.sharePage(token)}`,
        image: shared ? `${origin}${Routes.SajuG.shareImage(token)}` : defaultOgImage(origin),
      });
      return reply
        .code(shared ? 200 : 404)
        .type('text/html; charset=utf-8')
        .header('cache-control', 'no-store')
        .send(html);
    },
  );
}
