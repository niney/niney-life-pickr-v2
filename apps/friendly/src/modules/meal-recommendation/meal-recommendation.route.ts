import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateMealRecommendationInput,
  ListMealRecommendationsQuery,
  ListMealRecommendationsResult,
  MealRecommendation,
  MealRecommendationContext,
  MealRecommendationEvent,
  MealRecommendationEventInput,
  MealRecommendationFeedbackInput,
  Routes,
} from '@repo/api-contract';
import { env } from '../../config/env.js';
import { latLngToKmaGrid } from '@repo/utils';
import { RATE } from '../../plugins/rate-limit.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import { MealDailyQuotaService } from '../meal/meal-daily-quota.service.js';
import { WeatherService } from '../weather/weather.service.js';
import { MealRecommendationError, MealRecommendationService } from './meal-recommendation.service.js';

// 다음 끼니 추천 — 로그인 사용자 본인 것만. 캐시(같은 날·끼니·프로필)는 일일 한도를 소비하지
// 않고, 일반/force 모두 cache miss 가 확정되면 서비스가 LLM 경로 전에 한 번 차감한다.

const IdParams = z.object({ id: z.string().min(1).max(64) });

const kstToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

const mealRecommendationRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const aiConfig = new AiConfigService(app.prisma, buildLlmProviderEnv());
  // 날씨는 선택 보강 — 키가 없거나 업스트림이 죽어도 추천은 계절 추정으로 나온다.
  const weather = new WeatherService({ serviceKey: env.DATA_GO_KR_API_KEY });
  const dailyQuota = new MealDailyQuotaService(app.prisma);
  const service = new MealRecommendationService(app.prisma, aiConfig, {
    logger: app.log,
    operationLog: app.operationLog,
    consumeQuota: (userId) =>
      dailyQuota.consume(userId, kstToday(), 'recommendation', env.MEAL_RECOMMEND_DAILY_LIMIT),
    weather: async (lat, lng) => {
      const { nx, ny } = latLngToKmaGrid(lat, lng);
      const res = await weather.getNowcast(nx, ny);
      const now = res.now;
      if (!now) return null;
      // PTY: 0 없음 / 1 비 / 2 비·눈 / 3 눈 / 5 빗방울 / 6 빗방울·눈날림 / 7 눈날림.
      return { tempC: now.t1h, rain: now.pty !== null ? now.pty > 0 : null };
    },
  });

  typed.get(Routes.Meal.recommendationContext, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      response: { 200: MealRecommendationContext },
    },
    handler: async (req) => service.context(req.user.userId, kstToday()),
  });

  typed.get(Routes.Meal.recommendations, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      querystring: ListMealRecommendationsQuery,
      response: { 200: ListMealRecommendationsResult },
    },
    handler: async (req) => ({ items: await service.list(req.user.userId, req.query.limit) }),
  });

  typed.post(Routes.Meal.recommendations, {
    onRequest: [app.authenticate],
    config: { rateLimit: RATE.mealRecommend },
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      body: CreateMealRecommendationInput,
      response: { 200: MealRecommendation },
    },
    handler: async (req) => {
      try {
        const { recommendation } = await service.create(req.user.userId, req.body, kstToday());
        return recommendation;
      } catch (e) {
        if (e instanceof MealRecommendationError) {
          if (e.code === 'quota') {
            throw app.httpErrors.tooManyRequests(
              `오늘 추천 한도(${env.MEAL_RECOMMEND_DAILY_LIMIT}회)를 모두 썼습니다. 내일 다시 시도해 주세요.`,
            );
          }
          if (e.code === 'not_found') throw app.httpErrors.notFound(e.message);
          throw app.httpErrors.badRequest(e.message);
        }
        throw e;
      }
    },
  });

  typed.post(Routes.Meal.recommendationFeedback(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      body: MealRecommendationFeedbackInput,
      response: { 200: MealRecommendation },
    },
    handler: async (req) => {
      try {
        return await service.feedback(req.user.userId, req.params.id, req.body);
      } catch (e) {
        if (e instanceof MealRecommendationError) {
          if (e.code === 'not_found') throw app.httpErrors.notFound(e.message);
          throw app.httpErrors.badRequest(e.message);
        }
        throw e;
      }
    },
  });

  typed.post(Routes.Meal.recommendationEvents(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      body: MealRecommendationEventInput,
      response: { 200: MealRecommendationEvent },
    },
    handler: async (req) => {
      try {
        return await service.recordEvent(req.user.userId, req.params.id, req.body);
      } catch (e) {
        if (e instanceof MealRecommendationError) {
          if (e.code === 'not_found') throw app.httpErrors.notFound(e.message);
          throw app.httpErrors.badRequest(e.message);
        }
        throw e;
      }
    },
  });
};

export default mealRecommendationRoutes;
