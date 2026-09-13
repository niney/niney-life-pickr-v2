import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ErrorResponseSchema,
  RestaurantTourStats,
  Routes,
  TourDensityQuery,
  TourDensityResult,
  TourInsightsQuery,
  TourInsightsResult,
  TourLodgingResult,
  TourPlanBody,
  TourPlanResult,
  TourRegionsResult,
} from '@repo/api-contract';
import { RATE } from '../../plugins/rate-limit.js';
import { TourInsightsService } from './tour-insights.service.js';
import { getRestaurantTourStats } from './tour-public.service.js';
import { TourRegionService } from './tour-region.service.js';

// 여행로그 공개 라우트(4~6차) — 맛집 상세 "여행자" 탭 집계, 인사이트(필터), 코스 추천, 밀도 격자·숙소·지역 비교. 인증 없음,
// 로컬 DB 뿐. 응답 스키마에 여행·방문·여행자 식별자가 없고 집단 분해는 소셀 억제(서비스). 매칭 없는 식당의 tour-stats 는 404.

const PlaceParams = z.object({ placeId: z.string().min(1).max(64) });

const tourPublicRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const insights = new TourInsightsService(app.prisma);
  const regions = new TourRegionService(app.prisma);

  // 6차 — 일상지도 배경 레이어(격자) / 인사이트 페이지 숙소·지역 비교 섹션.
  typed.get(Routes.Tour.publicDensity, {
    config: { rateLimit: RATE.tourRead },
    schema: { tags: ['tour'], querystring: TourDensityQuery, response: { 200: TourDensityResult } },
    handler: async (req) => regions.density(req.query),
  });
  typed.get(Routes.Tour.publicLodging, {
    config: { rateLimit: RATE.tourRead },
    schema: { tags: ['tour'], querystring: TourInsightsQuery, response: { 200: TourLodgingResult } },
    handler: async (req) => regions.lodging(req.query),
  });
  typed.get(Routes.Tour.publicRegions, {
    config: { rateLimit: RATE.tourRead },
    schema: { tags: ['tour'], querystring: TourInsightsQuery, response: { 200: TourRegionsResult } },
    handler: async (req) => regions.regions(req.query),
  });

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
