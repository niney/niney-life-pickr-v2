import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  FoodAdminCreateInput,
  FoodAdminListQuery,
  FoodAdminListResult,
  FoodAdminStats,
  FoodAdminUpdateInput,
  FoodRecognitionQualityQuery,
  FoodRecognitionQualityResult,
  FoodImportConfig,
  FoodImportConfigInput,
  FoodImportPreviewInput,
  FoodImportPreviewResult,
  FoodImportRun,
  FoodImportRunInput,
  FoodImportRunList,
  FoodItem,
  FoodRestaurantsQuery,
  FoodRestaurantsResult,
  FoodSearchQuery,
  FoodSearchResult,
  Routes,
} from '@repo/api-contract';
import { RATE } from '../../plugins/rate-limit.js';
import { foodImportRegistry, type FoodImportEvent } from './food-import-registry.js';
import { FoodRecognitionQualityService } from './food-recognition-quality.service.js';
import { FoodService, FoodServiceError } from './food.service.js';

// 음식 카탈로그(food) — 사용자 자동완성 1개 + 어드민(카탈로그 편집·적재 잡). 적재 서비스는
// plugins/food-import.ts 가 decorate 한 전역 인스턴스(app.foodImport) — 부팅 cron tick 과 공유.

const IdParams = z.object({ id: z.string().min(1).max(64) });

const throwAsHttp = (app: Parameters<FastifyPluginAsync>[0], e: unknown): never => {
  if (e instanceof FoodServiceError) {
    if (e.code === 'not_found') throw app.httpErrors.notFound(e.message);
    if (e.code === 'duplicate_name') throw app.httpErrors.conflict(e.message);
    throw app.httpErrors.badRequest(e.message);
  }
  throw e;
};

const foodRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const food = new FoodService(app.prisma);
  const recognitionQuality = new FoodRecognitionQualityService(app.prisma);
  const importer = app.foodImport;

  // ── 사용자: 자동완성 ──────────────────────────────────────────────────
  typed.get(Routes.Food.search, {
    onRequest: [app.authenticate],
    config: { rateLimit: RATE.foodSearch },
    schema: {
      tags: ['food'],
      security: [{ bearerAuth: [] }],
      querystring: FoodSearchQuery,
      response: { 200: FoodSearchResult },
    },
    handler: async (req) => ({ items: await food.search(req.query.q, req.query.limit) }),
  });

  // ── 어드민: 카탈로그 ──────────────────────────────────────────────────
  // 수집된 메뉴·리뷰 기반 역검색이며 실시간 판매 여부를 보장하지 않는다.
  // 응답 notice/evidence에 같은 제한을 기계 판독 가능하게 담는다.
  typed.get(Routes.Food.restaurants(':id'), {
    onRequest: [app.authenticate],
    config: { rateLimit: RATE.foodRestaurants },
    schema: {
      tags: ['food'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      querystring: FoodRestaurantsQuery,
      response: { 200: FoodRestaurantsResult },
    },
    handler: async (req) => {
      try {
        return await food.restaurants(req.params.id, req.query);
      } catch (e) {
        return throwAsHttp(app, e);
      }
    },
  });

  typed.get(Routes.Food.adminItems, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      querystring: FoodAdminListQuery,
      response: { 200: FoodAdminListResult },
    },
    handler: async (req) => food.adminList(req.query),
  });

  typed.post(Routes.Food.adminItems, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: FoodAdminCreateInput,
      response: { 201: FoodItem },
    },
    handler: async (req, reply) => {
      try {
        const item = await food.adminCreate(req.body);
        return reply.code(201).send(item);
      } catch (e) {
        return throwAsHttp(app, e);
      }
    },
  });

  typed.patch(Routes.Food.adminItem(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      body: FoodAdminUpdateInput,
      response: { 200: FoodItem },
    },
    handler: async (req) => {
      try {
        return await food.adminUpdate(req.params.id, req.body);
      } catch (e) {
        return throwAsHttp(app, e);
      }
    },
  });

  typed.get(Routes.Food.adminStats, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: FoodAdminStats },
    },
    handler: async () => food.adminStats(),
  });

  typed.get(Routes.Food.adminRecognitionQuality, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      querystring: FoodRecognitionQualityQuery,
      response: { 200: FoodRecognitionQualityResult },
    },
    handler: async (req) => recognitionQuality.aggregate(req.query.days),
  });

  // ── 어드민: 적재 잡 ───────────────────────────────────────────────────
  typed.get(Routes.Food.importConfig, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: FoodImportConfig },
    },
    handler: async () => importer.getConfig(),
  });

  typed.put(Routes.Food.importConfig, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: FoodImportConfigInput,
      response: { 200: FoodImportConfig },
    },
    handler: async (req) => {
      try {
        return await importer.updateConfig(req.body);
      } catch (e) {
        throw app.httpErrors.badRequest(
          e instanceof Error ? e.message : 'Invalid food-import config',
        );
      }
    },
  });

  // 지금 실행 — 진행 중이면 skipped run 을 돌려준다. 실제 작업은 백그라운드로 계속되고 응답은
  // 회차가 끝난 뒤 온다(소스 4개 전량이면 수십 초~수 분) — UI 는 SSE 로 진행을 본다.
  typed.post(Routes.Food.importRun, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: FoodImportRunInput.optional(),
      response: { 200: FoodImportRun },
    },
    handler: async (req) => importer.runScheduled('manual', req.body ?? {}),
  });

  typed.get(Routes.Food.importRuns, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: FoodImportRunList },
    },
    handler: async () => importer.listRuns(),
  });

  typed.post(Routes.Food.importPreview, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: FoodImportPreviewInput,
      response: { 200: FoodImportPreviewResult },
    },
    handler: async (req) => importer.preview(req.body.cronExpr, req.body.timezone),
  });

  // 진행 SSE — random-crawl run-events 와 같은 패턴(토큰 query 인증, snapshot → progress/done).
  app.get(Routes.Food.importRunEvents, {
    schema: { tags: ['admin'] },
    handler: async (req, reply) => {
      const admin = await app.resolveSseAdmin(req);
      if (!admin || admin.role !== 'ADMIN') {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid or missing token',
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
          // socket already gone
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
      writeNamed('snapshot', foodImportRegistry.snapshot());

      const runId = foodImportRegistry.runningRunId();
      if (!runId) {
        reply.raw.end();
        return;
      }

      const onEvent = (event: FoodImportEvent): void => {
        if (event.type === 'progress') {
          writeNamed('progress', event);
        } else if (event.type === 'done') {
          writeNamed('done', event);
          reply.raw.end();
        }
      };
      const unsubscribe = foodImportRegistry.subscribe(runId, onEvent);

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

export default foodRoutes;
