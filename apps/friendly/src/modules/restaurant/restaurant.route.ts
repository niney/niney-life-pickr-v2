import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  MenuGroupRunResult,
  MenuRankingQuery,
  MenuRankingResult,
  RestaurantAnalyticsBackfillResult,
  RestaurantDeleteResult,
  RestaurantDetail,
  RestaurantInsights,
  RestaurantListResult,
  RestaurantPublicDetail,
  RestaurantPublicListQuery,
  RestaurantPublicListResult,
  RestaurantRankingQuery,
  RestaurantRankingResult,
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
import { MenuGroupingError, MenuGroupingService } from '../menu-grouping/menu-grouping.service.js';
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
  const summaries = new SummaryService(app.prisma, aiConfig, { logger: app.log });
  const grouping = new MenuGroupingService(app.prisma, aiConfig, { logger: app.log });
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // 공개 식당 랭킹 — 인증 불필요. 루트 페이지에서 게스트도 본다.
  typed.get(Routes.Restaurant.ranking, {
    schema: {
      tags: ['public'],
      querystring: RestaurantRankingQuery,
      response: { 200: RestaurantRankingResult },
    },
    handler: async (req) => service.getRanking(req.query),
  });

  // 공개 식당 리스트 — 맛집 지도 페이지가 호출. 좌표·대표 사진·AI 통계 한 번에.
  typed.get(Routes.Restaurant.publicList, {
    schema: {
      tags: ['public'],
      querystring: RestaurantPublicListQuery,
      response: { 200: RestaurantPublicListResult },
    },
    handler: async (req) => service.getPublicList(req.query),
  });

  // 공개 식당 상세 — 어드민 detail 의 운영 메타 (요약 진행 상태/에러/모델) 제거,
  // 분석된(done) 행만 평탄화. 분석 안 된 리뷰는 본문만 노출.
  typed.get(Routes.Restaurant.publicByPlaceId(':placeId'), {
    schema: {
      tags: ['public'],
      params: z.object({ placeId: z.string() }),
      response: { 200: RestaurantPublicDetail },
    },
    handler: async (req) => {
      const detail = await service.getPublicDetail(req.params.placeId);
      if (!detail) throw app.httpErrors.notFound('Restaurant not found');
      return detail;
    },
  });

  // 공개 식당 인사이트 — 어드민 라우트와 동일한 응답 스키마, 가드만 빠짐.
  typed.get(Routes.Restaurant.publicInsights(':placeId'), {
    schema: {
      tags: ['public'],
      params: z.object({ placeId: z.string() }),
      response: { 200: RestaurantInsights },
    },
    handler: async (req) => {
      const insights = await service.getInsights(req.params.placeId);
      if (!insights) throw app.httpErrors.notFound('Restaurant not found');
      return insights;
    },
  });

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

  typed.post(Routes.Restaurant.menusGroup(':placeId'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ placeId: z.string() }),
      response: { 200: MenuGroupRunResult },
    },
    handler: async (req) => {
      try {
        return await grouping.groupForRestaurant(req.params.placeId);
      } catch (e) {
        if (e instanceof MenuGroupingError) {
          if (e.code === 'restaurant_not_found') throw app.httpErrors.notFound(e.message);
          if (e.code === 'no_menus') throw app.httpErrors.conflict(e.message);
          if (e.code === 'no_provider') throw app.httpErrors.failedDependency(e.message);
        }
        throw e;
      }
    },
  });

  typed.get(Routes.Restaurant.menusRanking(':placeId'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ placeId: z.string() }),
      querystring: MenuRankingQuery,
      response: { 200: MenuRankingResult },
    },
    handler: async (req) => {
      try {
        return await grouping.getRanking(req.params.placeId, req.query);
      } catch (e) {
        if (e instanceof MenuGroupingError && e.code === 'restaurant_not_found') {
          throw app.httpErrors.notFound(e.message);
        }
        throw e;
      }
    },
  });

  typed.post(Routes.Restaurant.analyticsBackfill, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: RestaurantAnalyticsBackfillResult },
    },
    handler: async () => {
      const processed = await summaries.backfillAnalyticsFromExisting();
      return { ok: true as const, processed };
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
      const rawQuery = req.query as {
        token?: string;
        placeId?: string | string[];
        canonicalId?: string | string[];
      };

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

      // ?placeId=X 와 ?canonicalId=Y 둘 다 받아 union 으로 구독. placeId 는
      // Naver source 단일 행, canonicalId 는 그 가게에 묶인 모든 source 행.
      const toArr = (raw: string | string[] | undefined): string[] =>
        Array.isArray(raw)
          ? raw
          : typeof raw === 'string' && raw.length > 0
            ? [raw]
            : [];
      const placeIdsParam = toArr(rawQuery.placeId);
      const canonicalIdsParam = Array.from(new Set(toArr(rawQuery.canonicalId)));

      // canonicalId 들 → 묶인 Restaurant 모두 풀어서 (placeId 풀과 병합).
      // 같은 Restaurant 가 placeId/canonicalId 양쪽으로 들어와도 restaurantId
      // 키로 dedup.
      const canonicalRows = canonicalIdsParam.length
        ? await service.getRestaurantsByCanonicalIds(canonicalIdsParam)
        : [];

      const byRestaurantId = new Map<
        string,
        {
          canonicalId: string;
          restaurantId: string;
          source: string;
          sourceId: string;
          placeId: string | null;
          // 같은 행이 publish 받을 bus key. Naver=placeId, DC=dc:<vRid>.
          busKey: string;
        }
      >();
      for (const r of canonicalRows) {
        const busKey = r.source === 'naver' ? r.placeId ?? '' : `dc:${r.sourceId}`;
        if (!busKey) continue;
        byRestaurantId.set(r.restaurantId, { ...r, busKey });
      }
      // placeId 파라미터로 들어온 행은 별도 조회 — 이미 canonical 로 풀려 들어와
      // 있으면 skip.
      if (placeIdsParam.length > 0) {
        const placeRows = await app.prisma.restaurant.findMany({
          where: { placeId: { in: placeIdsParam } },
          select: {
            id: true,
            canonicalId: true,
            source: true,
            sourceId: true,
            placeId: true,
          },
        });
        for (const r of placeRows) {
          if (byRestaurantId.has(r.id)) continue;
          if (!r.placeId) continue;
          byRestaurantId.set(r.id, {
            canonicalId: r.canonicalId,
            restaurantId: r.id,
            source: r.source,
            sourceId: r.sourceId,
            placeId: r.placeId,
            busKey: r.placeId,
          });
        }
      }

      const subscriptions = [...byRestaurantId.values()];

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

      // 초기 snapshot — 구독자가 첫 진행 tick 까지 안 기다리고 바로 렌더 가능.
      for (const sub of subscriptions) {
        try {
          const snap = await service.getSummaryProgressByRestaurantId(sub.restaurantId);
          if (snap) {
            writeNamed('snapshot', {
              canonicalId: sub.canonicalId,
              restaurantId: sub.restaurantId,
              source: sub.source,
              sourceId: sub.sourceId,
              placeId: sub.placeId,
              ...snap,
            });
          }
        } catch {
          // ignore — 단일 행 에러가 스트림 전체를 죽이면 안 됨
        }
      }

      // restaurantId 단위 coalescing — 같은 가게에 progress signal 이 폭주해도
      // DB 한 번만 읽어 한 번만 push. review 이벤트는 페이로드가 이미 완전해서
      // coalescing 안 함.
      const pendingProgressPush = new Set<string>();
      const pushSnapshotNow = async (
        sub: (typeof subscriptions)[number],
      ): Promise<void> => {
        pendingProgressPush.delete(sub.restaurantId);
        try {
          const snap = await service.getSummaryProgressByRestaurantId(sub.restaurantId);
          if (snap) {
            writeNamed('snapshot', {
              canonicalId: sub.canonicalId,
              restaurantId: sub.restaurantId,
              source: sub.source,
              sourceId: sub.sourceId,
              placeId: sub.placeId,
              ...snap,
            });
          }
        } catch {
          // 일시적 DB 에러는 스트림 유지
        }
      };
      const makeOnSignal =
        (sub: (typeof subscriptions)[number]) =>
        (signal: SummarySignal): void => {
          if (signal.type === 'review') {
            writeNamed('review', {
              canonicalId: sub.canonicalId,
              restaurantId: sub.restaurantId,
              source: sub.source,
              sourceId: sub.sourceId,
              placeId: sub.placeId,
              ...signal,
            });
            return;
          }
          if (pendingProgressPush.has(sub.restaurantId)) return;
          pendingProgressPush.add(sub.restaurantId);
          setImmediate(() => {
            void pushSnapshotNow(sub);
          });
        };

      const unsubscribers = subscriptions.map((sub) =>
        summaryEventsBus.subscribe(sub.busKey, makeOnSignal(sub)),
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
