import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  RestaurantDeleteResult,
  RestaurantDetail,
  RestaurantListResult,
  RestaurantSummaryProgress,
  Routes,
} from '@repo/api-contract';
import { RestaurantService } from './restaurant.service.js';
import { jobRegistry } from '../crawl/job-registry.js';

const restaurantRoutes: FastifyPluginAsync = async (app) => {
  const service = new RestaurantService(app.prisma);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.Restaurant.list, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: RestaurantListResult },
    },
    handler: async () => ({ items: await service.list() }),
  });

  typed.get(Routes.Restaurant.byPlaceId(':placeId'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ placeId: z.string() }),
      response: { 200: RestaurantDetail },
    },
    handler: async (req, reply) => {
      const detail = await service.getDetailByPlaceId(req.params.placeId);
      if (!detail) throw app.httpErrors.notFound('Restaurant not crawled yet');
      return detail;
    },
  });

  typed.delete(Routes.Restaurant.delete(':placeId'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ placeId: z.string() }),
      response: { 200: RestaurantDeleteResult },
    },
    handler: async (req) => {
      // Block deletion while a crawl is targeting this place — cascade
      // delete + concurrent INSERT would race on the FK.
      const inFlight = jobRegistry.findInFlightByPlace(req.user.userId, req.params.placeId);
      if (inFlight) {
        throw app.httpErrors.conflict('Crawl in progress for this restaurant');
      }
      const result = await service.deleteByPlaceId(req.params.placeId);
      if (!result) throw app.httpErrors.notFound('Restaurant not found');
      return { ok: true as const, deletedReviewCount: result.deletedReviewCount };
    },
  });

  typed.get(Routes.Restaurant.summaryStatus(':placeId'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ placeId: z.string() }),
      response: { 200: RestaurantSummaryProgress },
    },
    handler: async (req, reply) => {
      const progress = await service.getSummaryProgress(req.params.placeId);
      if (!progress) throw app.httpErrors.notFound('Restaurant not crawled yet');
      return progress;
    },
  });
};

export default restaurantRoutes;
