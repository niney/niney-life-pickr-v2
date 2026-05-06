import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CrawlJobListResult,
  CrawlNaverPlaceInput,
  Routes,
  StartCrawlResult,
  type CrawlEventType,
} from '@repo/api-contract';
import { CrawlService } from './crawl.service.js';
import { jobRegistry } from './job-registry.js';
import { closeBrowser } from './adapters/naver-place.playwright.adapter.js';
import { RestaurantService } from '../restaurant/restaurant.service.js';
import { SummaryService } from '../summary/summary.service.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { env } from '../../config/env.js';

// SSE wire format. EventSource auto-reconnects with a `last-event-id`
// header; we also accept `?afterSeq=` for explicit replay (e.g., a fresh
// EventSource instance after navigating away).
const writeSseEvent = (reply: FastifyReply, event: CrawlEventType): void => {
  const lines = [
    `id: ${event.seq}`,
    `event: ${event.type}`,
    `data: ${JSON.stringify(event)}`,
    '',
    '',
  ];
  reply.raw.write(lines.join('\n'));
};

const writeSseComment = (reply: FastifyReply, comment: string): void => {
  reply.raw.write(`: ${comment}\n\n`);
};

const parseAfterSeq = (req: FastifyRequest): number => {
  const header = req.headers['last-event-id'];
  if (typeof header === 'string') {
    const n = Number(header);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const q = (req.query as { afterSeq?: string } | undefined)?.afterSeq;
  if (typeof q === 'string') {
    const n = Number(q);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
};

const crawlRoutes: FastifyPluginAsync = async (app) => {
  const restaurants = new RestaurantService(app.prisma);
  const aiConfig = new AiConfigService(app.prisma, {
    apiKey: env.OLLAMA_CLOUD_API_KEY,
    baseUrl: env.OLLAMA_CLOUD_BASE_URL,
    timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
    maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
    defaultModel: env.OLLAMA_DEFAULT_MODEL,
  });
  const summaries = new SummaryService(app.prisma, aiConfig);
  const service = new CrawlService(restaurants, summaries, jobRegistry);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  app.addHook('onClose', async () => {
    jobRegistry.abortAll();
    await closeBrowser();
  });

  // POST — start a new crawl job (returns jobId immediately). Errors that
  // can be classified up-front (rate_limit, unsupported_url) are returned
  // as { ok: false, error } at HTTP 200 so the client can show them inline.
  typed.post(Routes.Crawl.naverPlace, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: CrawlNaverPlaceInput,
      response: { 200: StartCrawlResult },
    },
    handler: async (req) =>
      service.startCrawl(req.body.url, req.user.userId, req.body.mode),
  });

  // GET — list jobs for the current user (running + recently finished).
  typed.get(Routes.Crawl.jobs, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: CrawlJobListResult },
    },
    handler: async (req) => ({ jobs: jobRegistry.list(req.user.userId) }),
  });

  // DELETE — cancel a running job. Idempotent for the consumer: 204 either
  // way, since "already finished" is the same observable outcome as
  // "cancelled successfully".
  typed.delete(`${Routes.Crawl.jobs}/:id`, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
    },
    handler: async (req, reply) => {
      service.cancel(req.params.id, req.user.userId);
      return reply.code(204).send();
    },
  });

  // GET SSE — stream progress events. EventSource can't carry custom
  // headers, so we accept ?token=<jwt> and verify it here. Header auth still
  // works (curl, scripts). Either way the principal must own the job.
  app.get(`${Routes.Crawl.jobs}/:id/events`, {
    schema: {
      tags: ['admin'],
      // No response schema — Fastify must not try to serialize the stream.
    },
    handler: async (req, reply) => {
      const params = req.params as { id: string };
      const query = req.query as { token?: string; afterSeq?: string };

      // Resolve the principal: header (jwtVerify) first, then ?token=.
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

      const job = jobRegistry.get(params.id);
      if (!job) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Job not found or expired',
        });
      }
      if (job.actorId !== userId) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Not your job',
        });
      }

      const afterSeq = parseAfterSeq(req);

      // Already-finished job: if the client has caught up to the latest seq
      // (i.e. it's a reconnect after we sent the terminal event), respond
      // 204 so EventSource stops auto-reconnecting per the SSE spec.
      // Otherwise, open the stream just long enough to replay missing
      // events (including the terminal one) then close.
      if (job.status !== 'running') {
        const lastSeq = job.events.length
          ? job.events[job.events.length - 1]!.seq
          : 0;
        if (afterSeq >= lastSeq) {
          return reply.code(204).send();
        }
      }

      // Take over the response. From here, Fastify won't touch reply.
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Disable proxy buffering (nginx) so events flush immediately.
        'X-Accel-Buffering': 'no',
      });
      writeSseComment(reply, 'connected');

      // 1. Replay past events the client hasn't seen yet.
      for (const ev of job.events) {
        if (ev.seq > afterSeq) writeSseEvent(reply, ev);
      }

      // 2. If the job is already finished, the replay above included the
      // terminal event; close immediately. Subsequent reconnect attempts
      // hit the 204 short-circuit above.
      if (job.status !== 'running') {
        reply.raw.end();
        return;
      }

      // 3. Subscribe live. Heartbeat every 15s to keep the connection from
      // dying behind idle proxies and to surface client disconnects fast.
      const unsubscribe = jobRegistry.subscribe(params.id, (ev) => {
        try {
          writeSseEvent(reply, ev);
          // Terminal event — close the stream so the client's EventSource
          // doesn't keep reconnecting forever after the job finishes.
          if (ev.type === 'done' || ev.type === 'error') {
            reply.raw.end();
          }
        } catch {
          // raw.write can throw if the socket already ended.
        }
      });

      const heartbeat = setInterval(() => {
        try {
          writeSseComment(reply, 'hb');
        } catch {
          // ignore
        }
      }, 15_000);
      heartbeat.unref?.();

      // Client disconnect → unsubscribe ONLY. The job keeps running so the
      // user can navigate back and re-attach. Cancellation is an explicit
      // DELETE. This is the resumability requirement made flesh.
      const onClose = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      req.raw.on('close', onClose);
    },
  });
};

export default crawlRoutes;
