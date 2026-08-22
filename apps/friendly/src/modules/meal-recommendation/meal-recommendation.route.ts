import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateMealRecommendationInput,
  ListMealRecommendationsQuery,
  ListMealRecommendationsResult,
  MealRecommendation,
  MealRecommendationContext,
  MealRecommendationFeedbackInput,
  Routes,
} from '@repo/api-contract';
import { env } from '../../config/env.js';
import { RATE } from '../../plugins/rate-limit.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import { mealQuota, recommendQuotaKey } from '../meal/meal-quota.js';
import { MealRecommendationError, MealRecommendationService } from './meal-recommendation.service.js';

// 다음 끼니 추천 — 로그인 사용자 본인 것만. 캐시(같은 날·끼니·프로필)는 LLM 을 부르지 않으므로
// 일일 한도도 소비하지 않는다(force 로 새로 부를 때만 센다).

const IdParams = z.object({ id: z.string().min(1).max(64) });

const kstToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

const mealRecommendationRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const aiConfig = new AiConfigService(app.prisma, buildLlmProviderEnv());
  const service = new MealRecommendationService(app.prisma, aiConfig, {
    logger: app.log,
    operationLog: app.operationLog,
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
      const userId = req.user.userId;
      // 캐시 히트는 LLM 을 안 부르므로 한도를 먼저 소비하지 않는다 — force 일 때만 센다.
      if (req.body.force && !mealQuota.consume(recommendQuotaKey(userId), env.MEAL_RECOMMEND_DAILY_LIMIT)) {
        throw app.httpErrors.tooManyRequests(
          `오늘 추천 한도(${env.MEAL_RECOMMEND_DAILY_LIMIT}회)를 모두 썼습니다. 내일 다시 시도해 주세요.`,
        );
      }
      const { recommendation, cached } = await service.create(userId, req.body, kstToday());
      // 새로 만든(=LLM 을 부를 수 있었던) 경우에만 한도를 센다.
      if (!cached && !req.body.force) {
        mealQuota.consume(recommendQuotaKey(userId), env.MEAL_RECOMMEND_DAILY_LIMIT);
      }
      return recommendation;
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
};

export default mealRecommendationRoutes;
