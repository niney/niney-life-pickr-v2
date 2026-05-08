import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  RestaurantDeleteResult,
  RestaurantDetail,
  RestaurantInsights,
  RestaurantListResult,
  RestaurantReanalyzeResult,
  RestaurantSmartPickInput,
  RestaurantSmartPickResult,
  RestaurantSummaryProgress,
  Routes,
} from '@repo/api-contract';
import { RestaurantService } from './restaurant.service.js';
import { jobRegistry } from '../crawl/job-registry.js';
import {
  summaryEventsBus,
  type SummarySignal,
} from '../summary/summary-events-bus.js';
import { SummaryService } from '../summary/summary.service.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { env } from '../../config/env.js';

const restaurantRoutes: FastifyPluginAsync = async (app) => {
  const service = new RestaurantService(app.prisma);
  const aiConfig = new AiConfigService(app.prisma, {
    apiKey: env.OLLAMA_CLOUD_API_KEY,
    baseUrl: env.OLLAMA_CLOUD_BASE_URL,
    timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
    maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
    defaultModel: env.OLLAMA_DEFAULT_MODEL,
  });
  const summaries = new SummaryService(app.prisma, aiConfig);
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

  typed.post(Routes.Restaurant.reanalyze(':placeId'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ placeId: z.string() }),
      response: { 200: RestaurantReanalyzeResult },
    },
    handler: async (req) => {
      // 큐잉만 하고 즉시 반환 — 진행 상황은 기존 SSE(summary-events)로 본다.
      const queued = await summaries.backfillForRestaurant(req.params.placeId);
      return { ok: true as const, queued };
    },
  });

  typed.get(Routes.Restaurant.insights(':placeId'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ placeId: z.string() }),
      response: { 200: RestaurantInsights },
    },
    handler: async (req) => {
      const insights = await service.getInsights(req.params.placeId);
      if (!insights) throw app.httpErrors.notFound('Restaurant not crawled yet');
      return insights;
    },
  });

  typed.post(Routes.Restaurant.smartPick, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: RestaurantSmartPickInput,
      response: { 200: RestaurantSmartPickResult },
    },
    handler: async (req) => service.smartPick(req.body),
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

  // Multiplexed SSE — accepts ?placeId=A&placeId=B&… and pushes summary
  // events for every requested placeId over a single connection. Keeps the
  // browser well under its HTTP/1.1 6-per-origin SSE cap when many crawls
  // are running. Each event payload carries placeId so the client can demux.
  app.get(Routes.Restaurant.summaryEvents, {
    schema: { tags: ['admin'] },
    handler: async (req, reply) => {
      const rawQuery = req.query as { token?: string; placeId?: string | string[] };

      let userId: string | null = null;
      let role: 'USER' | 'ADMIN' | null = null;
      try {
        await req.jwtVerify();
        userId = req.user.userId;
        role = req.user.role;
      } catch {
        if (typeof rawQuery.token === 'string' && rawQuery.token.length > 0) {
          try {
            const payload = app.jwt.verify(rawQuery.token) as {
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

      // Normalize placeId param to an array. Fastify's default query parser
      // gives a string for ?placeId=X and an array for ?placeId=X&placeId=Y.
      const placeIdsRaw = rawQuery.placeId;
      const placeIds = Array.isArray(placeIdsRaw)
        ? placeIdsRaw
        : typeof placeIdsRaw === 'string' && placeIdsRaw.length > 0
          ? [placeIdsRaw]
          : [];
      // Dedupe while preserving order.
      const uniquePlaceIds = Array.from(new Set(placeIds));

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

      // Initial snapshot for every requested placeId so subscribers don't
      // have to wait for the next progress tick to render. Skips ones that
      // don't exist (the row may have been deleted between client subscribe
      // and server connect — silently dropped, not 404).
      for (const pid of uniquePlaceIds) {
        try {
          const snap = await service.getSummaryProgress(pid);
          if (snap) writeNamed('snapshot', { placeId: pid, ...snap });
        } catch {
          // ignore — bad placeId shouldn't kill the stream
        }
      }

      // One coalescing slot per placeId so a flurry of progress signals on
      // one restaurant collapses into a single DB read + push. Reviews skip
      // coalescing — their payload is already complete.
      const pendingProgressPush = new Set<string>();
      const pushSnapshotNow = async (placeId: string): Promise<void> => {
        pendingProgressPush.delete(placeId);
        try {
          const snap = await service.getSummaryProgress(placeId);
          if (snap) writeNamed('snapshot', { placeId, ...snap });
        } catch {
          // keep the stream open — transient DB errors shouldn't drop it
        }
      };
      const makeOnSignal =
        (placeId: string) =>
        (signal: SummarySignal): void => {
          if (signal.type === 'review') {
            writeNamed('review', { placeId, ...signal });
            return;
          }
          if (pendingProgressPush.has(placeId)) return;
          pendingProgressPush.add(placeId);
          setImmediate(() => {
            void pushSnapshotNow(placeId);
          });
        };

      const unsubscribers = uniquePlaceIds.map((pid) =>
        summaryEventsBus.subscribe(pid, makeOnSignal(pid)),
      );

      const heartbeat = setInterval(() => writeComment('hb'), 15_000);
      heartbeat.unref?.();

      const cleanup = (): void => {
        clearInterval(heartbeat);
        for (const u of unsubscribers) u();
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
