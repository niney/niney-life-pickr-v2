import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Routes,
  ScheduleConfig,
  ScheduleConfigInput,
  SchedulePreviewInput,
  SchedulePreviewResult,
  ScheduleRun,
  ScheduleRunList,
} from '@repo/api-contract';
import { scheduleRegistry, type ScheduleEvent } from './schedule-registry.js';

const scheduleRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  // plugins/schedule.ts 에서 decorate 한 전역 인스턴스 — 부팅 cron tick 과 공유.
  const service = app.schedule;

  // 설정 조회 — 현재 cron/enabled + 다음 실행 시각.
  typed.get(Routes.Schedule.config, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: ScheduleConfig },
    },
    handler: async () => service.getConfig(),
  });

  // 설정 변경 — enabled/cronExpr/timezone. 잘못된 cron 은 400.
  typed.put(Routes.Schedule.config, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: ScheduleConfigInput,
      response: { 200: ScheduleConfig },
    },
    handler: async (req) => {
      try {
        return await service.updateConfig(req.body);
      } catch (e) {
        throw app.httpErrors.badRequest(
          e instanceof Error ? e.message : 'Invalid schedule config',
        );
      }
    },
  });

  // 지금 실행 — cron tick 을 기다리지 않고 즉시(manual). 이미 진행 중이면
  // service 가 skipped run 을 돌려준다(overlap 방지).
  typed.post(Routes.Schedule.run, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: ScheduleRun },
    },
    handler: async () => service.runScheduled('manual'),
  });

  // 실행 이력 + 진행 중 run id.
  typed.get(Routes.Schedule.runs, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: ScheduleRunList },
    },
    handler: async () => service.listRuns(),
  });

  // cron 식 검증 + 다음 실행 시각 미리보기 — 저장 전 입력 검증용.
  typed.post(Routes.Schedule.preview, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: SchedulePreviewInput,
      response: { 200: SchedulePreviewResult },
    },
    handler: async (req) => service.preview(req.body.cronExpr, req.body.timezone),
  });

  // 진행 SSE — token query param 인증(EventSource 가 헤더 못 보냄). 진행 중인
  // run 이 없으면 마지막 스냅샷만 흘리고 닫는다. global-merge SSE 와 같은 패턴.
  app.get(Routes.Schedule.runEvents, {
    schema: { tags: ['admin'] },
    handler: async (req, reply) => {
      const rawQuery = req.query as { token?: string };

      let role: 'USER' | 'ADMIN' | null = null;
      try {
        await req.jwtVerify();
        role = req.user.role;
      } catch {
        if (typeof rawQuery.token === 'string' && rawQuery.token.length > 0) {
          try {
            const payload = app.jwt.verify(rawQuery.token) as {
              userId: string;
              role: 'USER' | 'ADMIN';
            };
            role = payload.role;
          } catch {
            // ignore
          }
        }
      }
      if (role !== 'ADMIN') {
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
      // 초기 스냅샷 — 진행 중이거나 직전에 끝난 run. 없으면 null.
      writeNamed('snapshot', scheduleRegistry.inflightSnapshot());

      const runId = scheduleRegistry.runningRunId();
      if (!runId) {
        // 진행 중인 run 이 없으면 더 흘릴 게 없다.
        reply.raw.end();
        return;
      }

      const onEvent = (event: ScheduleEvent): void => {
        if (event.type === 'progress') {
          writeNamed('progress', event);
        } else if (event.type === 'done') {
          writeNamed('done', event);
          reply.raw.end();
        }
      };
      const unsubscribe = scheduleRegistry.subscribe(runId, onEvent);

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

export default scheduleRoutes;
