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
  CrawlJobLogsQuery,
  CrawlJobLogsResult,
  CrawlNaverPlaceInput,
  CrawlSearchQuery,
  CrawlSearchResult,
  DiningcodeBulkSaveJobInput,
  DiningcodeBulkSaveJobSnapshot,
  DiningcodeRegisteredQuery,
  DiningcodeRegisteredResult,
  DiningcodeSearchQuery,
  DiningcodeSearchResponse,
  DiningcodeShopData,
  DiningcodeShopReviewsResponse,
  SaveDiningcodeShopResult,
  SaveTablingShopResult,
  SaveTablingPlaceResult,
  TablingSearchQuery,
  TablingSearchResponse,
  TablingShopData,
  TablingShopReviewsResponse,
  TablingRegisteredQuery,
  TablingRegisteredResult,
  TablingDiscoverQuery,
  TablingDiscoverResult,
  Routes,
  StartCrawlResult,
  type CrawlEventType,
  type CrawlJobLogEntryType,
  type CrawlLogLevelType,
} from '@repo/api-contract';
import { CrawlService } from './crawl.service.js';
import { jobRegistry } from './job-registry.js';
import {
  diningcodeBulkSaveRegistry,
  type BulkSaveJobEvent,
} from './diningcode-bulk-save-registry.js';
import { closeBrowser } from './adapters/naver-place.playwright.adapter.js';
import { closeCatchtableSearchBrowser } from './adapters/catchtable-search.playwright.adapter.js';
import { closeCatchtableShopBrowser } from './adapters/catchtable-shop.playwright.adapter.js';
import { RestaurantService } from '../restaurant/restaurant.service.js';
import { CanonicalService } from '../canonical/canonical.service.js';
import { ProposalService } from '../canonical/proposal.service.js';

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
  // summaries 는 plugins/summaries.ts, operationLog 는 plugins/logs.ts 가 만든
  // app 전역 singleton. 두 라우트(crawl/restaurant) 가 같은 chain map ·
  // cancelledPlaces 를 공유하고, 로그 SSE seq 는 단일 카운터를 유지한다.
  const summaries = app.summaries;
  const operationLog = app.operationLog;
  const canonical = new CanonicalService(app.prisma);
  const proposals = new ProposalService(app.prisma, canonical);
  const service = new CrawlService(
    restaurants,
    summaries,
    jobRegistry,
    proposals,
    canonical,
    operationLog,
  );
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

  // POST — 다이닝코드 가게를 DB 에 저장 + 모든 리뷰 페이지 끌어와 persist +
  // AI 분석 큐잉. 응답은 동기 — 페이지 fetch 가 끝나야 200 떨어진다. 평균 가게당
  // 수 초. AI 분석은 백그라운드.
  typed.post(Routes.Crawl.diningcodeShopSave(':vRid'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ vRid: z.string().min(1).max(80) }),
      response: { 200: SaveDiningcodeShopResult },
    },
    handler: async (req) => service.saveDiningcodeShop(req.params.vRid),
  });

  // GET — 정식 /admin/diningcode 페이지의 등록 배지 조회. vRid 콤마 분리.
  // 결과에 없는 vRid 는 미등록.
  typed.get(Routes.Crawl.diningcodeRegistered, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      querystring: DiningcodeRegisteredQuery,
      response: { 200: DiningcodeRegisteredResult },
    },
    handler: async (req) => {
      const ids = req.query.ids
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const items = await restaurants.findRegisteredDiningcodeByVRids(ids);
      return { items };
    },
  });

  // ── 테이블링 (mobile-v2-api.tabling.co.kr 무인증 REST) ────────────────────
  // GET — 테이블링 키워드 검색. POST /v1/search/restaurants/map 정규화. 사이트맵
  // 전수열거와 별개로 키워드로 partner idx 를 바로 찾는다. 검색 카드의 idx 를
  // 눌러 상세 조회·저장으로 이어진다. ?q=&cursor=&pageSize=&sort=.
  typed.get(Routes.Crawl.tablingSearch, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      querystring: TablingSearchQuery,
      response: { 200: TablingSearchResponse },
    },
    handler: async (req) => service.searchTabling(req.query),
  });

  // GET — 가게 상세. /v1/restaurant/:idx + /menu + /review 합본. 검색 카드의
  // "상세 보기" 가 호출. 단발 동기.
  typed.get(Routes.Crawl.tablingShop(':idx'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ idx: z.coerce.number().int().positive() }),
      response: { 200: TablingShopData },
    },
    handler: async (req) => service.fetchTablingShopDetail(req.params.idx),
  });

  // GET — 리뷰 커서 페이지네이션. ?cursor=<응답 nextCursor>.
  typed.get(Routes.Crawl.tablingShopReviews(':idx'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ idx: z.coerce.number().int().positive() }),
      querystring: z.object({ cursor: z.string().optional() }),
      response: { 200: TablingShopReviewsResponse },
    },
    handler: async (req) =>
      service.fetchTablingShopReviewsPage(req.params.idx, req.query.cursor ?? null),
  });

  // POST — 가게를 DB 저장(+리뷰 persist + AI 큐 + 좌표 기반 로컬 canonical
  // 자동매칭). 동기 — 리뷰 페이지 fetch 가 끝나야 200.
  typed.post(Routes.Crawl.tablingShopSave(':idx'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ idx: z.coerce.number().int().positive() }),
      response: { 200: SaveTablingShopResult },
    },
    handler: async (req) => service.saveTablingShop(req.params.idx),
  });

  // POST — 미입점 place(JSON-LD 얕은 티어) 저장 + 자동매칭.
  typed.post(Routes.Crawl.tablingPlaceSave(':objectId'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ objectId: z.string().regex(/^[a-f0-9]{24}$/) }),
      response: { 200: SaveTablingPlaceResult },
    },
    handler: async (req) => service.saveTablingPlace(req.params.objectId),
  });

  // GET — 등록됨 배지용. ids=콤마 분리 숫자 idx. 결과에 없으면 미등록.
  typed.get(Routes.Crawl.tablingRegistered, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      querystring: TablingRegisteredQuery,
      response: { 200: TablingRegisteredResult },
    },
    handler: async (req) => {
      const idxs = req.query.ids
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      const items = await restaurants.findRegisteredTablingByIdxs(idxs);
      return { items };
    },
  });

  // GET — 사이트맵 기반 발견. tier=shop(partner idx) | place(미입점 objectId,
  // page 1~5). 검색 API 가 없어 사이트맵이 전수 발견 백본.
  typed.get(Routes.Crawl.tablingDiscover, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      querystring: TablingDiscoverQuery,
      response: { 200: TablingDiscoverResult },
    },
    handler: async (req) => service.discoverTabling(req.query),
  });

  // POST — 일괄 저장 잡 시작. body.vRids 만 받고 actor 단위로 한 번에 1개 잡만
  // (단순화 — 동시 여러 잡이 다이닝코드 부담을 키우므로). 잡 자체는 백그라운드.
  typed.post(Routes.Crawl.diningcodeBulkSaveJobs, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: DiningcodeBulkSaveJobInput,
      response: { 200: DiningcodeBulkSaveJobSnapshot },
    },
    handler: async (req) => {
      const actorId = req.user.userId;
      // 중복 vRid 제거 — 클라이언트가 잘못 보냈을 때 같은 가게를 두 번 처리하지 않게.
      const vRids = Array.from(new Set(req.body.vRids));
      const { id } = diningcodeBulkSaveRegistry.create({ actorId, vRids });
      void service.runDiningcodeBulkSave(id, vRids).catch((e) => {
        app.log.error({ err: e, jobId: id }, '[diningcode-bulk-save] runner crashed');
      });
      const snapshot = diningcodeBulkSaveRegistry.get(id, actorId);
      if (!snapshot) throw app.httpErrors.internalServerError('Failed to create job');
      return snapshot;
    },
  });

  // GET — 잡 스냅샷 (재접속/새로고침 직후 SSE 보다 먼저 호출).
  typed.get(Routes.Crawl.diningcodeBulkSaveJob(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
      response: { 200: DiningcodeBulkSaveJobSnapshot },
    },
    handler: async (req) => {
      const snap = diningcodeBulkSaveRegistry.get(req.params.id, req.user.userId);
      if (!snap) throw app.httpErrors.notFound('Job not found');
      return snap;
    },
  });

  // DELETE — 잡 취소. 진행 중이던 한 vRid 의 fetch 는 끝까지 기다리고(어댑터
  // abort 미지원), 이후 vRid 들은 skipped 로 마무리.
  typed.delete(Routes.Crawl.diningcodeBulkSaveJob(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
    },
    handler: async (req, reply) => {
      diningcodeBulkSaveRegistry.cancel(req.params.id, req.user.userId);
      return reply.code(204).send();
    },
  });

  // GET SSE — 잡 진행. menu-grouping 패턴과 동일 (snapshot/item/done event).
  // token query 인증.
  app.get(Routes.Crawl.diningcodeBulkSaveJobEvents(':id'), {
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

      const snapshot = diningcodeBulkSaveRegistry.get(params.id, userId);
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

      if (snapshot.state === 'done' || snapshot.state === 'failed') {
        writeNamed('done', {
          jobId: snapshot.jobId,
          state: snapshot.state,
          finishedAt: snapshot.finishedAt ?? new Date().toISOString(),
        });
        reply.raw.end();
        return;
      }

      const onEvent = (event: BulkSaveJobEvent): void => {
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
      const unsubscribe = diningcodeBulkSaveRegistry.subscribe(
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

  // GET — 잡 단위 영속 로그 조회. SSE 의 실시간 'log' 이벤트와 동일한 데이터를
  // DB 에서 읽어온다. 잡 종료 후 패널 재진입 시 fallback 으로 쓰이고, 실시간
  // 누적분과 합쳐서 표시된다.
  // 저장소는 operation_logs 로 전환됨 — 레거시 crawl_job_logs 행은 백필로
  // 원본 id 그대로 복사돼 있어 cursor(행 id) 의미가 유지된다. 응답 계약
  // (CrawlJobLogEntry: jobId non-null, level 3종)은 feature/level 필터가 보장.
  // cursor 는 마지막 entry 의 id — createdAt 동률 회피용. 응답 items 는
  // 최신순(createdAt DESC). 잡 소유자 검증은 jobRegistry.get 으로.
  typed.get(`${Routes.Crawl.jobs}/:id/logs`, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
      querystring: CrawlJobLogsQuery,
      response: { 200: CrawlJobLogsResult },
    },
    handler: async (req) => {
      const job = jobRegistry.get(req.params.id);
      // 잡 메모리 registry 는 finishedAt 후 일정 시간만 보관. 만료된 잡이라도
      // DB 로그는 남아있을 수 있으므로 registry 미스이면 소유자 검증을 건너뛰고
      // 로그만 가져온다 — 같은 actor 가 자기 잡 로그만 조회한다는 보장이 약해지지만
      // jobId 가 cuid 라 추측 불가. 보강이 필요하면 OperationRun.meta 의 actorId 로.
      if (job && job.actorId !== req.user.userId) {
        throw app.httpErrors.forbidden('Not your job');
      }

      const limit = req.query.limit ?? 100;
      const level = req.query.level as CrawlLogLevelType | undefined;
      const stage = req.query.stage;
      const cursor = req.query.cursor;

      // (createdAt DESC, id DESC) 정렬 + (createdAt,id) < (cursor.createdAt,cursor.id)
      // cuid 는 사전순으로 단조 증가하지 않아 (id < cursor.id) 단독 비교는 부정확.
      // 그러나 같은 ms 안의 충돌은 드물고, 잘못 짚어도 누락이 아니라 중복일 뿐이라
      // 단순화를 위해 createdAt 만으로 페이지네이션, 동률은 id 로 보조 정렬.
      const cursorRow = cursor
        ? await app.prisma.operationLog.findUnique({
            where: { id: cursor },
            select: { createdAt: true, id: true },
          })
        : null;

      const rows = await app.prisma.operationLog.findMany({
        where: {
          jobId: req.params.id,
          // 레거시 응답 계약 보호 — crawl/summary 외 feature 혼입 방지,
          // debug(레거시에 없던 레벨) 제외로 CrawlLogLevel 3종 유지.
          feature: { in: ['crawl', 'summary'] },
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
        // where jobId = :id 이므로 항상 non-null — 타입 좁히기용 fallback.
        jobId: r.jobId ?? req.params.id,
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
