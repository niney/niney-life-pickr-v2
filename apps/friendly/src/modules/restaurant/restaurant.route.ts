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
import { summaryEventsBus } from '../summary/summary-events-bus.js';

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

  // SSE — push summary progress snapshots whenever a row's status flips.
  // EventSource can't carry custom headers, so we accept ?token=<jwt> and
  // verify it inline (mirrors crawl SSE auth).
  app.get(Routes.Restaurant.summaryEvents(':placeId'), {
    schema: { tags: ['admin'] },
    handler: async (req, reply) => {
      const params = req.params as { placeId: string };
      const query = req.query as { token?: string };

      let userId: string | null = null;
      let role: 'USER' | 'ADMIN' | null = null;
      try {
        await req.jwtVerify();
        userId = req.user.userId;
        role = req.user.role;
      } catch {
        if (typeof query.token === 'string' && query.token.length > 0) {
          try {
            const payload = app.jwt.verify(query.token) as {
              userId: string;
              role: 'USER' | 'ADMIN';
            };
            userId = payload.userId;
            role = payload.role;
          } catch {
            // fall through
          }
        }
      }
      if (!userId || role !== 'ADMIN') {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid or missing token',
        });
      }

      // Validate the restaurant exists once up-front so a bad placeId
      // returns 404 instead of opening an empty stream.
      const initial = await service.getSummaryProgress(params.placeId);
      if (!initial) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Restaurant not crawled yet',
        });
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const writeNamed = (name: string, data: unknown): void => {
        try {
          reply.raw.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch {
          // socket already gone; the close handler will clean up
        }
      };
      const writeComment = (c: string): void => {
        try {
          reply.raw.write(`: ${c}\n\n`);
        } catch {
          // ignore
        }
      };

      writeComment('connected');
      writeNamed('snapshot', initial);

      // Coalesce bursts of progress signals: many row flips within a tick
      // get collapsed into one DB read + one SSE push. Avoids hammering the
      // DB when a chunk of summaries finishes simultaneously. Per-review
      // signals bypass coalescing — they carry their own payload and the
      // client merges them straight into its cache.
      let pendingProgressPush = false;
      const pushSnapshotNow = async (): Promise<void> => {
        pendingProgressPush = false;
        try {
          const snap = await service.getSummaryProgress(params.placeId);
          if (snap) writeNamed('snapshot', snap);
        } catch {
          // ignore — keep the stream open; transient DB errors shouldn't kill it
        }
      };
      const onSignal = (signal: { type: string }): void => {
        if (signal.type === 'review') {
          writeNamed('review', signal);
          return;
        }
        if (pendingProgressPush) return;
        pendingProgressPush = true;
        setImmediate(() => {
          void pushSnapshotNow();
        });
      };

      const unsubscribe = summaryEventsBus.subscribe(params.placeId, onSignal);

      const heartbeat = setInterval(() => writeComment('hb'), 15_000);
      heartbeat.unref?.();

      const cleanup = (): void => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          reply.raw.end();
        } catch {
          // ignore
        }
      };
      req.raw.on('close', cleanup);
    },
  });
};


export default restaurantRoutes;
