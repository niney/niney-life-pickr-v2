import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  REVIEW_ASK_GUEST_KEY_HEADER,
  ReviewAskInput,
  ReviewAskResult,
  ReviewEnrichBgInput,
  ReviewEnrichBgResult,
  ReviewEnrichPendingResult,
  ReviewEnrichStatusList,
  ReviewEnrichStatusQuery,
  ReviewPublicAskBody,
  ReviewQaReadyResult,
  ReviewSearchEnrichInput,
  ReviewSearchEnrichResult,
  ReviewSearchRestaurantsResult,
  Routes,
  type ReviewAskResultType,
} from '@repo/api-contract';
import { clientKey } from '../../plugins/rate-limit.js';
import { OPTIONAL_BEARER } from '../../plugins/swagger.js';
import type { UsageQuotaActor, UsageQuotaDenyReason } from '../usage-quota/usage-quota.service.js';

// 공개 질문 한도 — 타로식 게스트 기기·IP·전역 일일 + IP 분당(어드민 "설정 > 사용량 한도"에서 조정).
const REVIEW_ASK_FEATURE = 'review-ask' as const;
// 기기 영속 UUID(shared guestKeyStore). 형식 밖이면 없는 것으로 — IP 로 대체된다(타로와 같은 규칙).
const GUEST_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

// 한도 거부는 오류 대신 안내 답변(200)으로 — 기존 '준비 안 됨·일시 장애' 와 같은 계약이라 웹·앱이
// 그대로 답변 카드에 보여 준다.
const quotaDeniedAnswer = (reason: UsageQuotaDenyReason | null): ReviewAskResultType => ({
  answer:
    reason === 'disabled'
      ? '지금은 리뷰 질문을 쓸 수 없어요.'
      : reason === 'global_budget' || reason === 'guest_cutoff'
        ? '오늘은 질문이 많아 답변을 잠시 멈췄어요. 내일 다시 물어봐 주세요.'
        : '오늘 질문할 수 있는 횟수를 모두 썼어요. 내일 다시 물어봐 주세요.',
  confidence: 'none',
  hyde: null,
  citations: [],
  verification: null,
});

const reviewSearchRoutes: FastifyPluginAsync = async (app) => {
  const service = app.reviewSearch; // app 전역 singleton(plugins/summaries.ts) — 요약 훅과 동일 인스턴스
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const guard = { onRequest: [app.authenticate, app.requireAdmin] };
  const tags = ['review-search'];
  const security = [{ bearerAuth: [] }];
  const placeIdParams = z.object({ placeId: z.string() });

  const askActorOf = async (req: FastifyRequest): Promise<UsageQuotaActor> => {
    const user = await app.resolveOptionalUser(req);
    const raw = req.headers[REVIEW_ASK_GUEST_KEY_HEADER];
    const guestKey = typeof raw === 'string' && GUEST_KEY_RE.test(raw) ? raw : null;
    return { userId: user?.userId ?? null, guestKey, ip: clientKey(req) };
  };

  // 부팅 헬스체크 — 임베딩 엔드포인트(로컬/사이드카 Ollama) 미도달이면 경고만(서버는 계속 —
  // review-search 만 동작 불가). 운영 배포에서 OLLAMA_EMBED_BASE_URL 오설정을 즉시 발견. 테스트 제외.
  if (process.env.NODE_ENV !== 'test') {
    void service.embedHealth().then((h) => {
      if (h.ok) app.log.info(`[review-search] 임베딩 OK — ${h.baseUrl} (${h.model}, dim ${h.dim})`);
      else app.log.warn(`[review-search] 임베딩 미도달 — 검색/질문 불가: ${h.error}`);
    });
  }

  typed.get(Routes.ReviewSearch.restaurants, {
    ...guard,
    schema: { tags, security, response: { 200: ReviewSearchRestaurantsResult } },
    handler: async () => ({ restaurants: await service.listRestaurants() }),
  });

  typed.post(Routes.ReviewSearch.enrich, {
    ...guard,
    schema: { tags, security, body: ReviewSearchEnrichInput, response: { 200: ReviewSearchEnrichResult } },
    handler: async (req) => service.ensureEnriched(req.body.restaurantId),
  });

  typed.post(Routes.ReviewSearch.ask, {
    ...guard,
    schema: { tags, security, body: ReviewAskInput, response: { 200: ReviewAskResult } },
    handler: async (req) => service.ask(req.body.restaurantId, req.body.query),
  });

  // ── enrich 상태 관리 (어드민) ──────────────────────────────────────────────
  typed.get(Routes.ReviewSearch.status, {
    ...guard,
    schema: { tags, security, querystring: ReviewEnrichStatusQuery, response: { 200: ReviewEnrichStatusList } },
    handler: async (req) => service.enrichStatus(req.query),
  });

  // 백그라운드 enrich(즉시 반환 — 무거운 enrich 가 HTTP 타임아웃 안 나게). 상태는 status 폴링.
  typed.post(Routes.ReviewSearch.enrichBg, {
    ...guard,
    schema: { tags, security, body: ReviewEnrichBgInput, response: { 200: ReviewEnrichBgResult } },
    handler: async (req) => service.enrichInBackground(req.body.restaurantId),
  });

  typed.post(Routes.ReviewSearch.enrichPending, {
    ...guard,
    schema: { tags, security, response: { 200: ReviewEnrichPendingResult } },
    handler: async () => service.enrichAllPendingInBackground(),
  });

  // enrich 진행률 SSE — EventSource 는 Authorization 헤더를 못 실으므로 ?token= 폴백 인증
  // (crawl/summary SSE 와 동일 패턴). 전체 enrich 진행 이벤트를 한 연결로 멀티플렉스.
  app.get(Routes.ReviewSearch.enrichEvents, { schema: { tags } }, async (req, reply) => {
    let role: string | null = null;
    try {
      await req.jwtVerify();
      role = req.user.role;
    } catch {
      const token = (req.query as { token?: string }).token;
      if (token) {
        try {
          role = (app.jwt.verify(token) as { role?: string }).role ?? null;
        } catch {
          /* 토큰 무효 — 아래서 401 */
        }
      }
    }
    if (role !== 'ADMIN') {
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing token' });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const unsubscribe = service.onEnrichProgress((e) => {
      try {
        reply.raw.write(`event: progress\ndata: ${JSON.stringify(e)}\n\n`);
      } catch {
        /* write 실패 시 close 핸들러가 정리 */
      }
    });
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': hb\n\n');
      } catch {
        /* ignore */
      }
    }, 15_000);
    heartbeat.unref?.();

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // ── 공개 QA (placeId 기반, 인증 없음) ──────────────────────────────────────
  // 준비 여부 — enrich 된 리뷰가 있는지. LLM 호출 없음 → 레이트리밋 불필요.
  typed.get(Routes.ReviewSearch.publicQaReady(':placeId'), {
    schema: {
      tags: ['public'],
      summary: '맛집 리뷰 Q&A 준비 여부 — 검색 가능(임베딩 완료) 리뷰 수, LLM 호출 없음',
      params: placeIdParams,
      response: { 200: ReviewQaReadyResult },
    },
    handler: async (req) => {
      const r = await service.qaReady(req.params.placeId);
      if (!r) throw app.httpErrors.notFound('식당을 찾을 수 없습니다.');
      return r;
    },
  });

  // 공개 질문 — 비싼 LLM 파이프라인 → IP 분당 + 일일 한도(usage-quota 'review-ask'). 같은 질문은
  // 답변 캐시·진행 중 합류로 한도를 소비하지 않는다. enrich 안 된 식당은 graceful none.
  typed.post(Routes.ReviewSearch.publicAsk(':placeId'), {
    config: {
      rateLimit: {
        max: async () => (await app.usageQuota.getSetting(REVIEW_ASK_FEATURE)).ipPerMinute,
        timeWindow: '1 minute',
      },
    },
    schema: {
      tags: ['public'],
      summary: '맛집 리뷰 기반 질문 답변(RAG) — 근거 리뷰 인용, 선택 인증, 같은 질문 20분 캐시, 일일 한도',
      description:
        '질의 임베딩 + BM25 하이브리드 검색 → LLM 리랭크 → 답변 생성 → 근거 대조 검증 순으로 처리한다(캐시 미스 1건 = 임베딩 1 + LLM 최대 3콜). ' +
        '같은 가게·같은 질문(대소문자·공백·끝 문장부호 무시)은 리뷰 분석이 그대로인 동안 20분간 같은 답변을 재사용하며 한도를 소비하지 않는다. ' +
        '게스트는 x-guest-key(영숫자·_·- 8~64자) 기기 키와 IP 로 일일 한도를 세고(없으면 IP), 회원(Bearer)은 전역 일일 예산만 적용된다. ' +
        '한도 초과·리뷰 분석 미준비·일시 장애면 오류 대신 confidence "none" 안내문을 200 으로 돌려준다.',
      security: OPTIONAL_BEARER,
      params: placeIdParams,
      body: ReviewPublicAskBody,
      response: { 200: ReviewAskResult },
    },
    handler: async (req) => {
      const actor = await askActorOf(req);
      // 임베딩/LLM 일시 장애(예: 임베딩 엔드포인트 미도달)는 공개 사용자에게 500 대신 graceful 안내.
      let r;
      try {
        r = await service.askByPlaceId(req.params.placeId, req.body.query, {
          // 캐시 미스로 파이프라인을 실제로 돌릴 때만 한도를 센다.
          admit: async () => {
            const d = await app.usageQuota.consume(REVIEW_ASK_FEATURE, actor);
            return d.allowed ? null : quotaDeniedAnswer(d.reason);
          },
        });
      } catch (e) {
        app.log.error({ err: e }, '[review-search] 공개 질문 처리 실패');
        return {
          answer: '일시적으로 답변을 만들 수 없어요. 잠시 후 다시 시도해 주세요.',
          confidence: 'none' as const,
          hyde: null,
          citations: [],
          verification: null,
        };
      }
      if (!r) throw app.httpErrors.notFound('식당을 찾을 수 없습니다.');
      return r;
    },
  });
};

export default reviewSearchRoutes;
