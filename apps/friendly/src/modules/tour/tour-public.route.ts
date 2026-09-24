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
    schema: {
      tags: ['tour'],
      summary: '여행자 방문 밀도 격자(0.02°) — 여행 5건 미만 칸 제외, bbox 선택',
      querystring: TourDensityQuery,
      response: { 200: TourDensityResult },
    },
    handler: async (req) => regions.density(req.query),
  });
  typed.get(Routes.Tour.publicLodging, {
    config: { rateLimit: RATE.tourRead },
    schema: {
      tags: ['tour'],
      summary: '여행 숙소 유형별 통계 — 결제액·1박 추정·예약률·만족도, 지역·연령 등 필터',
      querystring: TourInsightsQuery,
      response: { 200: TourLodgingResult },
    },
    handler: async (req) => regions.lodging(req.query),
  });
  typed.get(Routes.Tour.publicRegions, {
    config: { rateLimit: RATE.tourRead },
    schema: {
      tags: ['tour'],
      summary: '여행 지역 비교 — 시군구(제주는 제주시·서귀포·부속섬) 집단·읍면동 상위 통계',
      querystring: TourInsightsQuery,
      response: { 200: TourRegionsResult },
    },
    handler: async (req) => regions.regions(req.query),
  });

  typed.get(decodeURIComponent(Routes.Tour.publicRestaurantStats(':placeId')), {
    config: { rateLimit: RATE.tourRead },
    schema: {
      tags: ['tour'],
      summary: '맛집 여행자 방문 통계("여행자" 탭) — 집계만, 여행로그 매칭 없는 식당은 404',
      description:
        'AI 허브 여행로그(2023년 4~9월 여행자 표본) 가공 집계. 응답에 여행·방문·여행자 식별자는 없고, ' +
        '동반·연령 집단은 5건 미만이면 빠지고, 평점·지출은 표본 3건 미만·재방문율·체류는 방문 5건 미만이면 null 이다.',
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
    schema: {
      tags: ['tour'],
      summary: '여행 인사이트 집계 — 지역·연령·성별·동반·월·박수 필터, 여행 20건 미만이면 insufficient',
      querystring: TourInsightsQuery,
      response: { 200: TourInsightsResult },
    },
    handler: async (req) => insights.insights(req.query),
  });

  typed.post(Routes.Tour.publicPlan, {
    config: { rateLimit: RATE.tourRead },
    schema: {
      tags: ['tour'],
      summary: '비슷한 여행자 기반 코스 추천 — 조건 부족 시 월→성별→박수→연령 순 완화',
      body: TourPlanBody,
      response: { 200: TourPlanResult },
    },
    handler: async (req) => insights.plan(req.body),
  });
};

export default tourPublicRoutes;
