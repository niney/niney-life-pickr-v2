import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CatchtableSearchQuery,
  CatchtableSearchResponse,
  CatchtableShopData,
  CatchtableShopMenusResponse,
  CatchtableShopReviewOverviewResponse,
  CrawlJobListResult,
  CrawlNaverPlaceInput,
  CrawlSearchQuery,
  CrawlSearchResult,
  DiningcodeSearchQuery,
  DiningcodeSearchResponse,
  DiningcodeShopData,
  DiningcodeShopReviewsResponse,
  Routes,
  StartCrawlResult,
  type CrawlEventType,
} from '@repo/api-contract';
import { CrawlService } from './crawl.service.js';
import { jobRegistry } from './job-registry.js';
import { closeBrowser } from './adapters/naver-place.playwright.adapter.js';
import { closeCatchtableSearchBrowser } from './adapters/catchtable-search.playwright.adapter.js';
import { closeCatchtableShopBrowser } from './adapters/catchtable-shop.playwright.adapter.js';
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
  const summaries = new SummaryService(app.prisma, aiConfig, { logger: app.log });
  const service = new CrawlService(restaurants, summaries, jobRegistry);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  app.addHook('onClose', async () => {
    jobRegistry.abortAll();
    await Promise.all([
      closeBrowser(),
      closeCatchtableSearchBrowser(),
      closeCatchtableShopBrowser(),
    ]);
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

  // GET — keyword search via Naver PC map (Playwright). /admin/discover 페이지가
  // 등록 후보를 고를 때 사용. 빈 q 는 zod 가 거른다.
  typed.get(Routes.Crawl.search, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      querystring: CrawlSearchQuery,
      response: { 200: CrawlSearchResult },
    },
    handler: async (req) => service.searchPlaces(req.query.q, req.query.bbox),
  });

  // GET — 캐치테이블 키워드 검색. 어드민 /catchtable-test 페이지에서 "이런 키워드를
  // 넣으면 캐치테이블이 어떤 결과를 주는지" 를 직접 확인하는 용도. 동일한 응답을
  // 향후 등록 파이프라인에 흘릴 수도 있지만, 우선은 검증 페이지로 시작.
  typed.get(Routes.Crawl.catchtableSearch, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      querystring: CatchtableSearchQuery,
      response: { 200: CatchtableSearchResponse },
    },
    handler: async (req) => service.searchCatchtable(req.query),
  });

  // GET — 캐치테이블 가게 상세 (가벼운 미리보기). 검색 카드의 "상세 보기"
  // 가 호출하는 단발 동기 라우트. 운영 등록 파이프라인에 연결할 때는 SSE 잡으로
  // 승격될 수 있지만 현 단계는 검증 도구이므로 단순 GET.
  typed.get(Routes.Crawl.catchtableShop(':shopRef'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ shopRef: z.string().min(1).max(80) }),
      response: { 200: CatchtableShopData },
    },
    handler: async (req) => service.fetchCatchtableShopDetail(req.params.shopRef),
  });

  // GET — 가게 메뉴 (lazy). 상세 페이지에서 사용자가 "메뉴 불러오기" 클릭 시.
  typed.get(Routes.Crawl.catchtableShopMenus(':shopRef'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ shopRef: z.string().min(1).max(80) }),
      response: { 200: CatchtableShopMenusResponse },
    },
    handler: async (req) => service.fetchCatchtableShopMenus(req.params.shopRef),
  });

  // GET — 다이닝코드 키워드 검색. 어드민 /diningcode-test 페이지에서 "이 키워드로
  // 다이닝코드가 무엇을 돌려주는지" 검증하는 단발 동기 라우트. HTTP 직접 호출이라
  // Playwright 비용 없음.
  typed.get(Routes.Crawl.diningcodeSearch, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      querystring: DiningcodeSearchQuery,
      response: { 200: DiningcodeSearchResponse },
    },
    handler: async (req) => service.searchDiningcode(req.query),
  });

  // GET — 다이닝코드 가게 상세. 검색 카드의 "상세 보기" 가 호출하는 단발 동기
  // 라우트. POST /API/profile/ 한 방에 메뉴·사진·리뷰 첫 페이지·블로그·평점 분포
  // 가 모두 옴 — 별도 lazy 호출 없이 단일 GET 으로 끝.
  typed.get(Routes.Crawl.diningcodeShop(':vRid'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ vRid: z.string().min(1).max(80) }),
      response: { 200: DiningcodeShopData },
    },
    handler: async (req) => service.fetchDiningcodeShopDetail(req.params.vRid),
  });

  // GET — 다이닝코드 리뷰 페이지네이션. 상세 페이지의 "더 보기" 클릭 시.
  // ?page=N 으로 받아 review 섹션만 추려 가벼운 응답.
  typed.get(Routes.Crawl.diningcodeShopReviews(':vRid'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ vRid: z.string().min(1).max(80) }),
      querystring: z.object({
        page: z.coerce.number().int().min(1).max(200).optional(),
      }),
      response: { 200: DiningcodeShopReviewsResponse },
    },
    handler: async (req) =>
      service.fetchDiningcodeShopReviewsPage(
        req.params.vRid,
        req.query.page ?? 1,
      ),
  });

  // GET — 캐치테이블 AI 리뷰 종합 (한 줄 + 3~4 문장). 등록 검증 화면 핵심 정보.
  typed.get(Routes.Crawl.catchtableShopReviewOverview(':shopRef'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ shopRef: z.string().min(1).max(80) }),
      response: { 200: CatchtableShopReviewOverviewResponse },
    },
    handler: async (req) => service.fetchCatchtableShopReviewOverview(req.params.shopRef),
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
