import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CrawlNaverPlaceInput,
  CrawlNaverPlaceResult,
  Routes,
} from '@repo/api-contract';
import { CrawlService } from './crawl.service.js';
import { closeBrowser } from './adapters/naver-place.playwright.adapter.js';

const crawlRoutes: FastifyPluginAsync = async (app) => {
  const service = new CrawlService();
  const typed = app.withTypeProvider<ZodTypeProvider>();

  app.addHook('onClose', async () => {
    await closeBrowser();
  });

  typed.post(Routes.Crawl.naverPlace, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: CrawlNaverPlaceInput,
      response: { 200: CrawlNaverPlaceResult },
    },
    handler: async (req) => {
      return service.crawlNaverPlace(req.body.url, req.user.userId);
    },
  });
};

export default crawlRoutes;
