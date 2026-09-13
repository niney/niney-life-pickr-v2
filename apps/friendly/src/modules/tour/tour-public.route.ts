import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorResponseSchema, RestaurantTourStats, Routes, TourInsightsQuery, TourInsightsResult, TourPlanBody, TourPlanResult } from '@repo/api-contract';
import { RATE } from '../../plugins/rate-limit.js';
import { TourInsightsService } from './tour-insights.service.js';
import { getRestaurantTourStats } from './tour-public.service.js';

// 여행로그 공개 라우트(4~5차) — 맛집 상세 "여행자" 탭 집계, 인사이트(필터), 코스 추천. 인증 없음, 로컬 DB 뿐. 응답
// 스키마에 여행·방문·여행자 식별자가 없고 집단 분해는 소셜 억제(서비스). 매칭 없는 식당의 tour-stats 는 404.

const PlaceParams = z.object({ placeId: z.string().min(1).max(64) });

const tourPublicRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const insights = new TourInsightsService(app.prisma);

  typed.get(decodeURIComponent(Routes.Tour.publicRestaurantStats(':placeId')), {
    config: { rateLimit: RATE.tourRead },
    schema: {
      tags: ['tour'],
      params: PlaceParams,
      response: { 200: RestaurantTourStats, 404: ErrorResponseSchema },
    },
    handler: async (req) => {
      const stats = await getRestaurantTourStats(app.prisma, req.params.placeId);
      if (!stats) throw app.httpErrors.notFound('여행로그 통계가 없는 식당입니다');
      return stats;
    },
  });

  typed.get(Routes.Tour.publicInsights, {
    config: { rateLimit: RATE.tourRead },
    schema: { tags: ['tour'], querystring: TourInsightsQuery, response: { 200: TourInsightsResult } },
    handler: async (req) => insights.insights(req.query),
  });

  typed.post(Routes.Tour.publicPlan, {
    config: { rateLimit: RATE.tourRead },
    schema: { tags: ['tour'], body: TourPlanBody, response: { 200: TourPlanResult } },
    handler: async (req) => insights.plan(req.body),
  });
};

export default tourPublicRoutes;
