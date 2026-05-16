import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AutoDiscoverJobInput,
  AutoDiscoverJobSnapshot,
  Routes,
} from '@repo/api-contract';
import { AiConfigService } from '../ai/ai.config.service.js';
import { CanonicalService } from '../canonical/canonical.service.js';
import { CrawlService } from '../crawl/crawl.service.js';
import { jobRegistry } from '../crawl/job-registry.js';
import { ProposalService } from '../canonical/proposal.service.js';
import { RestaurantService } from '../restaurant/restaurant.service.js';
import { SummaryService } from '../summary/summary.service.js';
import { env } from '../../config/env.js';
import {
  autoDiscoverRegistry,
  type AutoDiscoverJobEvent,
} from './auto-discover-registry.js';
import { AutoDiscoverService } from './auto-discover.service.js';

const autoDiscoverRoutes: FastifyPluginAsync = async (app) => {
  const restaurants = new RestaurantService(app.prisma);
  const aiConfig = new AiConfigService(app.prisma, {
    apiKey: env.OLLAMA_CLOUD_API_KEY,
    baseUrl: env.OLLAMA_CLOUD_BASE_URL,
    timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
    maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
    defaultModel: env.OLLAMA_DEFAULT_MODEL,
  });
  const summaries = new SummaryService(app.prisma, aiConfig, { logger: app.log });
  const canonical = new CanonicalService(app.prisma);
  const proposals = new ProposalService(app.prisma, canonical);
  const crawl = new CrawlService(
    restaurants,
    summaries,
    jobRegistry,
    proposals,
    canonical,
  );
  const service = new AutoDiscoverService({
    restaurants,
    aiConfig,
    crawl,
    logger: app.log,
  });
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // POST — 잡 시작. per-actor 1잡 정책 (다이닝코드 bulk-save 와 다른 점: 검색·
  // 크롤 동시 부담이 커서 의도적으로 1개로 제한). 즉시 초기 snapshot 반환.
  typed.post(Routes.AutoDiscover.jobs, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: AutoDiscoverJobInput,
      response: { 200: AutoDiscoverJobSnapshot },
    },
    handler: async (req) => {
      const actorId = req.user.userId;
      const existing = autoDiscoverRegistry.findInFlightByActor(actorId);
      if (existing) {
        throw app.httpErrors.conflict(
          '이미 진행 중인 자동 발견 잡이 있습니다.',
        );
      }
      const { id } = autoDiscoverRegistry.create({
        actorId,
        input: req.body,
      });
      void service.runAutoDiscover(id, actorId).catch((e) => {
        app.log.error({ err: e, jobId: id }, '[auto-discover] runner crashed');
      });
      const snapshot = autoDiscoverRegistry.get(id, actorId);
      if (!snapshot) throw app.httpErrors.internalServerError('Failed to create job');
      return snapshot;
    },
  });

  // GET — 잡 스냅샷. 새로고침/재접속 직후 SSE 보다 먼저 호출.
  typed.get(Routes.AutoDiscover.job(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
      response: { 200: AutoDiscoverJobSnapshot },
    },
    handler: async (req) => {
      const snap = autoDiscoverRegistry.get(req.params.id, req.user.userId);
      if (!snap) throw app.httpErrors.notFound('Job not found');
      return snap;
    },
  });

  // DELETE — 잡 취소. 진행 중이던 그룹의 Naver 잡들은 abort 신호 받고 즉시 중단,
  // 다음 그룹들은 시작 전 skipped(cancelled). 204 idempotent.
  typed.delete(Routes.AutoDiscover.job(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
    },
    handler: async (req, reply) => {
      autoDiscoverRegistry.cancel(req.params.id, req.user.userId);
      return reply.code(204).send();
    },
  });

  // GET SSE — 잡 진행. menu-grouping/diningcode-bulk-save 패턴과 동일.
  // token query 인증.
  app.get(Routes.AutoDiscover.jobEvents(':id'), {
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

      const snapshot = autoDiscoverRegistry.get(params.id, userId);
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
      writeNamed('snapshot', snapshot);

      if (
        snapshot.state === 'done' ||
        snapshot.state === 'failed' ||
        snapshot.state === 'cancelled'
      ) {
        writeNamed('done', {
          jobId: snapshot.jobId,
          state: snapshot.state,
          finishedAt: snapshot.finishedAt ?? new Date().toISOString(),
        });
        reply.raw.end();
        return;
      }

      const onEvent = (event: AutoDiscoverJobEvent): void => {
        if (event.type === 'keyword') {
          writeNamed('keyword', {
            jobId: snapshot.jobId,
            keyword: event.keyword,
          });
        } else if (event.type === 'candidate') {
          writeNamed('candidate', {
            jobId: snapshot.jobId,
            candidate: event.candidate,
          });
        } else if (event.type === 'phase') {
          writeNamed('phase', {
            jobId: snapshot.jobId,
            phase: event.phase,
            newlyRegistered: event.newlyRegistered,
          });
        } else if (event.type === 'done') {
          writeNamed('done', {
            jobId: snapshot.jobId,
            state: event.state,
            finishedAt: event.finishedAt,
          });
        }
      };
      const unsubscribe = autoDiscoverRegistry.subscribe(
        params.id,
        userId,
        onEvent,
      );

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

export default autoDiscoverRoutes;
