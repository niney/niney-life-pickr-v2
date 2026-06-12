import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  MenuGroupingJobInput,
  MenuGroupingJobSnapshot,
  MenuGroupingRestaurantStatusList,
  MenuGroupingRestaurantStatusQuery,
  Routes,
} from '@repo/api-contract';
import { AiConfigService } from '../ai/ai.config.service.js';
import { env } from '../../config/env.js';
import { MenuGroupingError, MenuGroupingService } from './menu-grouping.service.js';
import {
  groupingJobRegistry,
  type GroupingJobEvent,
} from './grouping-job-registry.js';
import { MENU_GROUPING_VERSION } from './menu-grouping.prompts.js';

const menuGroupingRoutes: FastifyPluginAsync = async (app) => {
  const aiConfig = new AiConfigService(app.prisma, {
    apiKey: env.OLLAMA_CLOUD_API_KEY,
    baseUrl: env.OLLAMA_CLOUD_BASE_URL,
    timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
    maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
    defaultModel: env.OLLAMA_DEFAULT_MODEL,
  });
  const grouping = new MenuGroupingService(app.prisma, aiConfig, {
    logger: app.log,
    // 범용 작업 로그 — 식당별 그룹핑 1회 = OperationRun 1개.
    operationLog: app.operationLog,
  });
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.Analytics.restaurantsStatus, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      querystring: MenuGroupingRestaurantStatusQuery,
      response: { 200: MenuGroupingRestaurantStatusList },
    },
    handler: async (req) => {
      const result = await grouping.getRestaurantsStatus(req.query);
      return {
        currentVersion: MENU_GROUPING_VERSION,
        ...result,
      };
    },
  });

  typed.post(Routes.Analytics.groupingJobs, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: MenuGroupingJobInput,
      response: { 200: MenuGroupingJobSnapshot },
    },
    handler: async (req) => {
      const actorId = req.user.userId;
      const { id } = groupingJobRegistry.create({ actorId, placeIds: req.body.placeIds });
      // 즉시 백그라운드 실행 — 응답은 초기 스냅샷.
      void runJob(id, req.body.placeIds, grouping, app.log).catch((e) => {
        app.log.error({ err: e, jobId: id }, '[menu-grouping] job runner crashed');
      });
      const snapshot = groupingJobRegistry.get(id, actorId);
      if (!snapshot) throw app.httpErrors.internalServerError('Failed to create job');
      return snapshot;
    },
  });

  typed.get(Routes.Analytics.groupingJob(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
      response: { 200: MenuGroupingJobSnapshot },
    },
    handler: async (req) => {
      const snap = groupingJobRegistry.get(req.params.id, req.user.userId);
      if (!snap) throw app.httpErrors.notFound('Job not found');
      return snap;
    },
  });

  // SSE — token query param 으로 인증 (EventSource 가 헤더 못 보내므로 summary-events
  // 와 같은 패턴 사용).
  app.get(Routes.Analytics.groupingJobEvents(':id'), {
    schema: { tags: ['admin'] },
    handler: async (req, reply) => {
      const params = req.params as { id: string };
      const rawQuery = req.query as { token?: string };

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

      const snapshot = groupingJobRegistry.get(params.id, userId);
      if (!snapshot) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Job not found',
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
      // 초기 스냅샷 — 재접속 시 현재 진행 상태 복구.
      writeNamed('snapshot', snapshot);

      // 이미 끝난 잡이면 done event 만 흘리고 닫음.
      if (snapshot.state === 'done' || snapshot.state === 'failed') {
        writeNamed('done', {
          jobId: snapshot.jobId,
          state: snapshot.state,
          finishedAt: snapshot.finishedAt ?? new Date().toISOString(),
        });
        reply.raw.end();
        return;
      }

      const onEvent = (event: GroupingJobEvent): void => {
        if (event.type === 'item') {
          writeNamed('item', { jobId: snapshot.jobId, item: event.item });
        } else if (event.type === 'done') {
          writeNamed('done', {
            jobId: snapshot.jobId,
            state: event.state,
            finishedAt: event.finishedAt,
          });
        }
      };
      const unsubscribe = groupingJobRegistry.subscribe(params.id, userId, onEvent);

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

// 백그라운드 잡 실행기. 식당 한 개씩 순차 처리 (LLM 어댑터의 동시성 게이트가
// 어차피 직렬화하므로 병렬 시도해도 이득이 없고, SSE event 순서가 직관적).
async function runJob(
  jobId: string,
  placeIds: string[],
  service: MenuGroupingService,
  log: { warn: (...a: unknown[]) => void; info: (...a: unknown[]) => void },
): Promise<void> {
  groupingJobRegistry.markRunning(jobId);
  const abortSignal = groupingJobRegistry.abortSignal(jobId);

  for (const placeId of placeIds) {
    if (abortSignal?.aborted) {
      groupingJobRegistry.finishItem(jobId, placeId, {
        skipped: true,
        reason: 'job cancelled before this restaurant started',
      });
      continue;
    }
    groupingJobRegistry.markItemStart(jobId, placeId);
    try {
      // 벌크 잡의 레지스트리 jobId 를 OperationRun.jobId 로 — 어드민 로그
      // 화면에서 같은 잡의 식당별 run 들을 묶어 볼 수 있게.
      const result = await service.groupForRestaurant(placeId, { jobId, trigger: 'manual' });
      groupingJobRegistry.finishItem(jobId, placeId, {
        ok: true,
        inputCount: result.inputCount,
        groupCount: result.groupCount,
        mappedCount: result.mappedCount,
      });
    } catch (e) {
      if (e instanceof MenuGroupingError) {
        if (e.code === 'no_menus') {
          groupingJobRegistry.finishItem(jobId, placeId, {
            skipped: true,
            reason: e.message,
          });
        } else {
          groupingJobRegistry.finishItem(jobId, placeId, {
            ok: false,
            errorCode: e.code,
            errorMessage: e.message,
          });
        }
      } else {
        const message = e instanceof Error ? e.message : String(e);
        log.warn({ jobId, placeId, message }, '[menu-grouping] job item failed');
        groupingJobRegistry.finishItem(jobId, placeId, {
          ok: false,
          errorCode: 'unknown',
          errorMessage: message,
        });
      }
    }
  }
  groupingJobRegistry.markFinished(jobId);
}

export default menuGroupingRoutes;
