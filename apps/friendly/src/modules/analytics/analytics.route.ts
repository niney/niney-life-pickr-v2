import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AnalyticsOverview,
  CategoryTreeResult,
  GlobalMenuQuery,
  GlobalMenuResult,
  GlobalMergeJobInput,
  GlobalMergeJobSnapshot,
  Routes,
} from '@repo/api-contract';
import { AnalyticsError, type AnalyticsService } from './analytics.service.js';
import { GLOBAL_MERGE_VERSION } from './global-merge.prompts.js';
import {
  globalMergeJobRegistry,
  type GlobalMergeJobEvent,
} from './global-merge-job-registry.js';

// 스케줄 머지가 진행 중일 때 어드민 머지 잡을 실패로 닫는 사유.
const BUSY_MESSAGE = '다른 글로벌 머지(스케줄 자동 실행)가 진행 중입니다 — 끝난 뒤 다시 실행하세요.';

const analyticsRoutes: FastifyPluginAsync = async (app) => {
  // 스케줄러와 같은 인스턴스(plugins/schedule.ts 가 decorate, 플러그인이 라우트보다 먼저 로드됨) —
  // 머지 상호배제·통계 캐시를 공유한다. operationLog 도 그쪽에서 주입돼 run 이 기록된다.
  const service = app.analytics;
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.Analytics.overview, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: AnalyticsOverview },
    },
    handler: async () => service.getOverview(),
  });

  typed.get(Routes.Analytics.categoryTree, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: CategoryTreeResult },
    },
    handler: async () => ({
      currentVersion: GLOBAL_MERGE_VERSION,
      roots: await service.getCategoryTree(),
    }),
  });

  typed.get(Routes.Analytics.globalMenus, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      querystring: GlobalMenuQuery,
      response: { 200: GlobalMenuResult },
    },
    handler: async (req) => service.getGlobalMenus(req.query),
  });

  typed.post(Routes.Analytics.globalMergeJobs, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: GlobalMergeJobInput,
      response: { 200: GlobalMergeJobSnapshot, 409: GlobalMergeJobSnapshot },
    },
    handler: async (req, reply) => {
      const actorId = req.user.userId;
      // 동시에 둘 이상 못 돌게 — 진행 중이면 그 id 의 스냅샷을 409 로.
      const inflight = globalMergeJobRegistry.inflightJobId();
      if (inflight) {
        const snap = globalMergeJobRegistry.get(inflight, actorId);
        if (snap) {
          return reply.code(409).send(snap);
        }
      }
      const id = globalMergeJobRegistry.create({ actorId });
      void runGlobalMerge(id, req.body.full, service, app.log).catch((e) => {
        app.log.error({ err: e, jobId: id }, '[global-merge] job runner crashed');
      });
      const snap = globalMergeJobRegistry.get(id, actorId);
      if (!snap) throw app.httpErrors.internalServerError('Failed to create job');
      return snap;
    },
  });

  typed.get(Routes.Analytics.globalMergeJob(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
      response: { 200: GlobalMergeJobSnapshot },
    },
    handler: async (req) => {
      const snap = globalMergeJobRegistry.get(req.params.id, req.user.userId);
      if (!snap) throw app.httpErrors.notFound('Job not found');
      return snap;
    },
  });

  app.get(Routes.Analytics.globalMergeJobEvents(':id'), {
    schema: { tags: ['admin'] },
    handler: async (req, reply) => {
      const params = req.params as { id: string };

      const admin = await app.resolveSseAdmin(req);
      if (!admin) {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Invalid or missing token',
        });
      }
      const userId = admin.userId;

      const snapshot = globalMergeJobRegistry.get(params.id, userId);
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
          // ignore
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
      writeNamed('snapshot', snapshot);

      if (snapshot.state === 'done' || snapshot.state === 'failed') {
        writeNamed('done', {
          jobId: snapshot.jobId,
          state: snapshot.state,
          finalGroupCount: snapshot.finalGroupCount,
          finishedAt: snapshot.finishedAt ?? new Date().toISOString(),
        });
        reply.raw.end();
        return;
      }

      const onEvent = (event: GlobalMergeJobEvent): void => {
        if (event.type === 'chunk') {
          writeNamed('chunk', { jobId: snapshot.jobId, progress: event.progress });
        } else if (event.type === 'done') {
          writeNamed('done', {
            jobId: snapshot.jobId,
            state: event.state,
            finalGroupCount: event.finalGroupCount,
            finishedAt: event.finishedAt,
          });
        }
      };
      const unsubscribe = globalMergeJobRegistry.subscribe(params.id, userId, onEvent);

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

async function runGlobalMerge(
  jobId: string,
  full: boolean,
  service: AnalyticsService,
  log: { warn: (...a: unknown[]) => void; info: (...a: unknown[]) => void; error: (...a: unknown[]) => void },
): Promise<void> {
  // markRunning 은 inputCount 와 totalChunks 를 모를 때 호출되므로 placeholder.
  // service 가 실제 카운트 알게 되면 onChunk 첫 호출 때 보정됨 (totalChunks 는
  // recordChunk 가 doneChunks 를 늘릴 때 자동 max 처리).
  globalMergeJobRegistry.markRunning(jobId, 0, 0);
  try {
    // jobId 전달은 OperationRun.jobId 기록용 — 레지스트리/SSE 흐름과 무관.
    const result = await service.runGlobalMerge(
      { full, jobId },
      {
        onChunk: (info) => {
          globalMergeJobRegistry.recordChunk(jobId, info);
        },
      },
    );
    if (result.busy) {
      // 빈 결과를 done(0개)으로 보이면 머지가 된 줄 안다 — 사유와 함께 실패로 닫는다.
      globalMergeJobRegistry.markFailed(jobId, 'busy', BUSY_MESSAGE);
      return;
    }
    globalMergeJobRegistry.markDone(jobId, result.finalGroupCount);
  } catch (e) {
    if (e instanceof AnalyticsError) {
      globalMergeJobRegistry.markFailed(jobId, e.code, e.message);
      return;
    }
    const message = e instanceof Error ? e.message : String(e);
    log.error({ jobId, message }, '[global-merge] job failed');
    globalMergeJobRegistry.markFailed(jobId, 'unknown', message);
  }
}

export default analyticsRoutes;
