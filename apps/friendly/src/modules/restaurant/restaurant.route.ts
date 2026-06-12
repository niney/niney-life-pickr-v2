import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CrawlJobLogsQuery,
  CrawlJobLogsResult,
  MenuGroupRunResult,
  MenuRankingQuery,
  MenuRankingResult,
  RestaurantAnalyticsBackfillResult,
  RestaurantCancelSummaryResult,
  RestaurantCategoryTreeResult,
  RestaurantDeleteResult,
  RestaurantDetail,
  RestaurantInsights,
  RestaurantListQuery,
  RestaurantListResult,
  RestaurantPublicDetail,
  RestaurantPublicListQuery,
  RestaurantPublicListResult,
  RestaurantPublicReviewsQuery,
  RestaurantPublicReviewsResult,
  RestaurantRankingQuery,
  RestaurantRankingResult,
  RestaurantReanalyzeResult,
  RestaurantResumeSummaryResult,
  ReviewResummarizeInput,
  ReviewResummarizeResult,
  RestaurantSmartPickInput,
  RestaurantSmartPickResult,
  RestaurantSummaryProgress,
  Routes,
  type CrawlJobLogEntryType,
  type CrawlLogLevelType,
} from '@repo/api-contract';
import { RestaurantService } from './restaurant.service.js';
import { jobRegistry } from '../crawl/job-registry.js';
import {
  summaryEventsBus,
  type SummarySignal,
} from '../summary/summary-events-bus.js';
import { MenuGroupingError, MenuGroupingService } from '../menu-grouping/menu-grouping.service.js';

// OperationLog.meta 는 JSON 직렬화 문자열. 깨진 행이 있어도 응답을 막지 말고
// null 로 떨궈서 나머지 로그가 보이도록.
const safeParseJsonObject = (raw: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(raw) as unknown;
    return typeof v === 'object' && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const restaurantRoutes: FastifyPluginAsync = async (app) => {
  const service = new RestaurantService(app.prisma);
  // summaries / aiConfig 는 plugins/summaries.ts 의 app 전역 singleton.
  const summaries = app.summaries;
  const aiConfig = app.aiConfig;
  const grouping = new MenuGroupingService(app.prisma, aiConfig, {
    logger: app.log,
    operationLog: app.operationLog,
  });
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

  // 공개 식당 방문자 리뷰 페이지네이션. detail 응답엔 reviewsFirstPage(10) 만
  // 동봉되고 나머지는 여기서 가져옴. offset/limit + sentiment/sort 쿼리.
  typed.get(Routes.Restaurant.publicReviews(':placeId'), {
    schema: {
      tags: ['public'],
      params: z.object({ placeId: z.string() }),
      querystring: RestaurantPublicReviewsQuery,
      response: { 200: RestaurantPublicReviewsResult },
    },
    handler: async (req) => {
      const result = await service.getPublicReviews(req.params.placeId, req.query);
      if (!result) throw app.httpErrors.notFound('Restaurant not found');
      return result;
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

  // 공개 식당 메뉴 카테고리 트리 — 분석 탭에서 언급 메뉴를 계층으로 본다.
  typed.get(Routes.Restaurant.publicCategoryTree(':placeId'), {
    schema: {
      tags: ['public'],
      params: z.object({ placeId: z.string() }),
      response: { 200: RestaurantCategoryTreeResult },
    },
    handler: async (req) => {
      const roots = await service.getCategoryTree(req.params.placeId);
      if (roots === null) throw app.httpErrors.notFound('Restaurant not found');
      return { roots };
    },
  });

  typed.get(Routes.Restaurant.list, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      querystring: RestaurantListQuery,
      response: { 200: RestaurantListResult },
    },
    handler: async (req) => service.list(req.query),
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

  // 어드민이 "이 가게 요약 중지" 누름. queued/pending 행을 'cancelled' 로
  // 마킹 + cancelledPlaces 등록 → chain 의 다음 청크가 진입 직전에 자기 자
  // 신을 종료한다. 진행 중인 청크는 끝까지 흘러가 done/failed 로 자연 마감.
  typed.post(Routes.Restaurant.cancelSummary(':placeId'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ placeId: z.string() }),
      response: { 200: RestaurantCancelSummaryResult },
    },
    handler: async (req) => {
      const cancelled = await summaries.cancelSummaryForPlace(req.params.placeId);
      return { ok: true as const, cancelled };
    },
  });

  // 어드민이 "요약 재개" 누름. 직전 중지로 'cancelled' 상태가 된 행만 골라
  // 'queued' 로 되돌리고 chain 에 다시 등록한다. failed 행은 손대지 않으므로
  // reanalyze 와 의도가 명확히 나뉜다.
  typed.post(Routes.Restaurant.resumeSummary(':placeId'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ placeId: z.string() }),
      response: { 200: RestaurantResumeSummaryResult },
    },
    handler: async (req) => {
      const resumed = await summaries.resumeSummaryForPlace(req.params.placeId);
      return { ok: true as const, resumed };
    },
  });

  // 단건 리뷰를 어드민이 고른 모델로 다시 요약. 모델은 1회성 — 전역
  // defaultModel 은 안 바뀐다. 큐잉만 하고 즉시 반환하며 진행/결과는 기존
  // summary-events SSE 로 흘러온다. placeId 를 돌려줘 클라가 SSE 구독 키로 쓴다.
  typed.post(Routes.Restaurant.reviewResummarize(':reviewId'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ reviewId: z.string() }),
      body: ReviewResummarizeInput,
      response: { 200: ReviewResummarizeResult },
    },
    handler: async (req) => {
      const { placeId } = await summaries.resummarizeReview(
        req.params.reviewId,
        req.body.model,
      );
      return { ok: true as const, placeId };
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

  // placeId 단위 누적 크롤 로그. 한 가게의 모든 잡(과거 재크롤 포함)이 한
  // 흐름으로 보임. 응답은 최신순(createdAt DESC) — UI 가 표시 시 뒤집을지
  // 결정. 잡 자체는 in-memory 라 서버 재시작 후 잡 메타는 사라져도 로그는
  // subjectId(=placeId) 컬럼으로 계속 추적 가능.
  // 저장소는 operation_logs 로 전환됨 — 레거시 행은 백필로 원본 id 그대로
  // 복사돼 cursor(행 id) 의미 유지. feature/jobId/level 필터로 레거시 응답
  // 계약(CrawlJobLogEntry: jobId non-null, level 3종)을 보장하고 menu-grouping
  // 등 다른 feature 로그의 혼입을 막는다.
  typed.get(Routes.Restaurant.crawlLogs(':placeId'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ placeId: z.string() }),
      querystring: CrawlJobLogsQuery,
      response: { 200: CrawlJobLogsResult },
    },
    handler: async (req) => {
      const limit = req.query.limit ?? 100;
      const level = req.query.level as CrawlLogLevelType | undefined;
      const stage = req.query.stage;
      const cursor = req.query.cursor;

      // (createdAt DESC, id DESC) — 동률 회피용 id 부보조 정렬. cursor 는
      // 마지막 entry 의 id 로 직전 페이지의 (createdAt,id) 보다 작은 것만.
      const cursorRow = cursor
        ? await app.prisma.operationLog.findUnique({
            where: { id: cursor },
            select: { createdAt: true, id: true },
          })
        : null;

      const rows = await app.prisma.operationLog.findMany({
        where: {
          subjectId: req.params.placeId,
          feature: { in: ['crawl', 'summary'] },
          jobId: { not: null },
          ...(level ? { level } : { level: { not: 'debug' } }),
          ...(stage ? { stage } : {}),
          ...(cursorRow
            ? {
                OR: [
                  { createdAt: { lt: cursorRow.createdAt } },
                  {
                    createdAt: cursorRow.createdAt,
                    id: { lt: cursorRow.id },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });

      const hasMore = rows.length > limit;
      const sliced = hasMore ? rows.slice(0, limit) : rows;
      const items: CrawlJobLogEntryType[] = sliced.map((r) => ({
        id: r.id,
        // where jobId != null 이므로 항상 non-null — 타입 좁히기용 fallback.
        jobId: r.jobId ?? '',
        placeId: r.subjectId,
        stage: r.stage,
        level: r.level as CrawlLogLevelType,
        message: r.message,
        meta: r.meta ? safeParseJsonObject(r.meta) : null,
        createdAt: r.createdAt.toISOString(),
      }));
      const nextCursor = hasMore ? sliced[sliced.length - 1]!.id : null;
      return { items, nextCursor };
    },
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
          if (signal.type === 'log') {
            // 잡 단계별 로그 — placeId 단위로 흘려보낸 로그를 같은 SSE 채널로
            // 그대로 전달. 어드민 패널이 잡 종료 후에도 요약 단계 로그를 받을
            // 수 있게 (크롤 SSE 는 done 이벤트로 닫힘).
            writeNamed('log', {
              canonicalId: sub.canonicalId,
              restaurantId: sub.restaurantId,
              source: sub.source,
              sourceId: sub.sourceId,
              placeId: sub.placeId,
              type: 'log' as const,
              jobId: signal.jobId,
              level: signal.level,
              stage: signal.stage,
              message: signal.message,
              meta: signal.meta,
              seq: signal.seq,
              at: signal.at,
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

      // 명시적 named heartbeat — SSE comment(`: hb`)는 클라이언트 EventSource
      // 콜백으로 노출되지 않아 idle 감지에 못 쓴다. 5초 주기는 reverse proxy
      // idle 정리(보통 30~60s)보다 충분히 짧고, 클라이언트의 15s idle timeout
      // 과 3:1 비율로 한두 번 누락은 흡수하면서 3회 연속 누락이면 죽음으로
      // 판단 가능한 지점.
      const heartbeat = setInterval(
        () => writeNamed('heartbeat', { at: new Date().toISOString() }),
        5_000,
      );
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
