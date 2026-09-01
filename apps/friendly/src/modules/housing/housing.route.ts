import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ErrorResponseSchema,
  HousingComplexDetail,
  HousingComplexParams,
  HousingNearbyQuery,
  HousingNearbyResult,
  HousingPointsQuery,
  HousingPointsResult,
  HousingSearchQuery,
  HousingSearchResult,
  HousingStatusResult,
  HousingTradesQuery,
  HousingTradesResult,
  Routes,
} from '@repo/api-contract';
import { env } from '../../config/env.js';
import { replyUpstreamError } from '../../lib/reply-upstream-error.js';
import { RATE } from '../../plugins/rate-limit.js';
import { HousingRefreshScheduler } from './housing-refresh.service.js';
import { HousingService } from './housing.service.js';

// 집값 공개 라우트(비로그인) — 아파트 실거래가·단지. 로컬 DB 조회뿐이라 업스트림 에러는 없고, 미적재(503)·
// 없는 단지(404)만 라우트가 직접 응답한다(전역 error-handler 는 5xx 를 500 으로 뭉개므로 일상지도와 같은
// replyUpstreamError 경로). 거래 자동 갱신(월 스케줄러)은 이 플러그인이 기동·정지한다.

const housingRoutes: FastifyPluginAsync = async (app) => {
  const service = new HousingService({ prisma: app.prisma });
  const scheduler = new HousingRefreshScheduler({
    prisma: app.prisma,
    log: app.log,
    cron: env.HOUSING_REFRESH_CRON,
    months: env.HOUSING_REFRESH_MONTHS,
    serviceKey: env.RTMS_API_KEY || env.BUS_API_KEY,
  });
  app.addHook('onReady', async () => {
    scheduler.start();
  });
  app.addHook('onClose', async () => {
    scheduler.stop();
  });
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.Housing.status, {
    schema: { tags: ['housing'], response: { 200: HousingStatusResult } },
    handler: async () => service.getStatus(),
  });

  // 뷰포트 조회 — 지도를 움직일 때마다 1콜. 일상지도와 같은 완만한 전용 프리셋.
  typed.get(Routes.Housing.points, {
    config: { rateLimit: RATE.housingRead },
    schema: {
      tags: ['housing'],
      querystring: HousingPointsQuery,
      response: { 200: HousingPointsResult, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getPoints(req.query);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [503], '집값 지도 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(Routes.Housing.nearby, {
    config: { rateLimit: RATE.housingRead },
    schema: {
      tags: ['housing'],
      querystring: HousingNearbyQuery,
      response: { 200: HousingNearbyResult, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getNearby(req.query);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [503], '집값 주변 단지 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(Routes.Housing.search, {
    config: { rateLimit: RATE.housingSearch },
    schema: {
      tags: ['housing'],
      querystring: HousingSearchQuery,
      response: { 200: HousingSearchResult, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.search(req.query.q, req.query.limit);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [503], '집값 단지 검색 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // Routes.Housing.complex/trades 는 인자를 encodeURIComponent 하므로 ':id' 플레이스홀더를 decode 해 등록.
  typed.get(decodeURIComponent(Routes.Housing.complex(':id')), {
    schema: {
      tags: ['housing'],
      params: HousingComplexParams,
      response: { 200: HousingComplexDetail, 404: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getComplex(req.params.id);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [404], '집값 단지 상세 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(decodeURIComponent(Routes.Housing.trades(':id')), {
    config: { rateLimit: RATE.housingRead },
    schema: {
      tags: ['housing'],
      params: HousingComplexParams,
      querystring: HousingTradesQuery,
      response: { 200: HousingTradesResult, 404: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getTrades(req.params.id, req.query);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [404], '집값 거래 목록 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });
};

export default housingRoutes;
