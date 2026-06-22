import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ReviewAskInput,
  ReviewAskResult,
  ReviewPublicAskBody,
  ReviewQaReadyResult,
  ReviewSearchEnrichInput,
  ReviewSearchEnrichResult,
  ReviewSearchRestaurantsResult,
  Routes,
} from '@repo/api-contract';
import { ReviewSearchService } from './review-search.service.js';

// 공개 ask 는 비싼 LLM 호출 → IP 당 분당 제한(인메모리 고정창, settlement 패턴 차용).
const ASK_RATE_WINDOW_MS = 60_000;
const ASK_RATE_MAX = 15; // IP·분당 공개 질문 수
const askRateHits = new Map<string, { count: number; resetAt: number }>();
const isAskRateLimited = (ip: string, now: number): boolean => {
  if (askRateHits.size > 10_000) askRateHits.clear();
  const cur = askRateHits.get(ip);
  if (!cur || cur.resetAt <= now) {
    askRateHits.set(ip, { count: 1, resetAt: now + ASK_RATE_WINDOW_MS });
    return false;
  }
  cur.count += 1;
  return cur.count > ASK_RATE_MAX;
};

const reviewSearchRoutes: FastifyPluginAsync = async (app) => {
  const service = new ReviewSearchService(app.prisma, app.aiConfig);
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const guard = { onRequest: [app.authenticate, app.requireAdmin] };
  const tags = ['review-search'];
  const security = [{ bearerAuth: [] }];
  const placeIdParams = z.object({ placeId: z.string() });

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

  // ── 공개 QA (placeId 기반, 인증 없음) ──────────────────────────────────────
  // 준비 여부 — enrich 된 리뷰가 있는지. LLM 호출 없음 → 레이트리밋 불필요.
  typed.get(Routes.ReviewSearch.publicQaReady(':placeId'), {
    schema: { tags: ['public'], params: placeIdParams, response: { 200: ReviewQaReadyResult } },
    handler: async (req) => {
      const r = await service.qaReady(req.params.placeId);
      if (!r) throw app.httpErrors.notFound('식당을 찾을 수 없습니다.');
      return r;
    },
  });

  // 공개 질문 — 비싼 LLM 파이프라인 → IP 레이트리밋. enrich 안 된 식당은 graceful none.
  typed.post(Routes.ReviewSearch.publicAsk(':placeId'), {
    schema: { tags: ['public'], params: placeIdParams, body: ReviewPublicAskBody, response: { 200: ReviewAskResult } },
    handler: async (req) => {
      if (isAskRateLimited(req.ip, Date.now())) {
        throw app.httpErrors.tooManyRequests('질문이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
      }
      // 임베딩/LLM 일시 장애(예: 임베딩 엔드포인트 미도달)는 공개 사용자에게 500 대신 graceful 안내.
      let r;
      try {
        r = await service.askByPlaceId(req.params.placeId, req.body.query);
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
