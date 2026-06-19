import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  RandomCrawlConfig,
  RandomCrawlConfigInput,
  RandomCrawlPreviewInput,
  RandomCrawlPreviewResult,
  RandomCrawlRun,
  RandomCrawlRunList,
  RegionDongList,
  RegionDongQuery,
  RegionTree,
  Routes,
} from '@repo/api-contract';
import {
  randomCrawlRegistry,
  type RandomCrawlEvent,
} from './random-crawl-registry.js';

const randomCrawlRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  // plugins/random-crawl.ts 가 decorate 한 전역 인스턴스 — 부팅 cron tick·
  // 텔레그램 폴러와 같은 인스턴스를 공유한다.
  const service = app.randomCrawl;

  // 설정 조회.
  typed.get(Routes.RandomCrawl.config, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: RandomCrawlConfig },
    },
    handler: async () => service.getConfig(),
  });

  // 설정 변경 — 잘못된 cron 은 400.
  typed.put(Routes.RandomCrawl.config, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: RandomCrawlConfigInput,
      response: { 200: RandomCrawlConfig },
    },
    handler: async (req) => {
      try {
        return await service.updateConfig(req.body);
      } catch (e) {
        throw app.httpErrors.badRequest(
          e instanceof Error ? e.message : 'Invalid random-crawl config',
        );
      }
    },
  });

  // 지금 실행 — 즉시(manual). 이미 진행 중이면 skipped run 을 돌려준다.
  typed.post(Routes.RandomCrawl.run, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: RandomCrawlRun },
    },
    handler: async () => service.runScheduled('manual'),
  });

  // 실행 이력 + 진행 중 run id.
  typed.get(Routes.RandomCrawl.runs, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: RandomCrawlRunList },
    },
    handler: async () => service.listRuns(),
  });

  // cron 식 검증 + 다음 실행 시각 미리보기.
  typed.post(Routes.RandomCrawl.preview, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: RandomCrawlPreviewInput,
      response: { 200: RandomCrawlPreviewResult },
    },
    handler: async (req) => service.preview(req.body.cronExpr, req.body.timezone),
  });

  // 지역 옵션 — 전체 시도→시군구 트리(동 제외).
  typed.get(Routes.RandomCrawl.regions, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: RegionTree },
    },
    handler: async () => service.getRegionTree(),
  });

  // 특정 시군구의 동 목록.
  typed.get(Routes.RandomCrawl.regionDongs, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      querystring: RegionDongQuery,
      response: { 200: RegionDongList },
    },
    handler: async (req) => service.getRegionDongs(req.query.sido, req.query.sigungu),
  });

  // 진행 SSE — token query param 인증(EventSource 가 헤더 못 보냄). schedule
  // run-events 와 같은 패턴. awaiting_selection 대기 중에도 진행 중으로 본다.
  app.get(Routes.RandomCrawl.runEvents, {
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
      writeNamed('snapshot', randomCrawlRegistry.snapshot());

      const runId = randomCrawlRegistry.runningRunId();
      if (!runId) {
        reply.raw.end();
        return;
      }

      const onEvent = (event: RandomCrawlEvent): void => {
        if (event.type === 'progress') {
          writeNamed('progress', event);
        } else if (event.type === 'done') {
          writeNamed('done', event);
          reply.raw.end();
        }
      };
      const unsubscribe = randomCrawlRegistry.subscribe(runId, onEvent);

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

export default randomCrawlRoutes;
