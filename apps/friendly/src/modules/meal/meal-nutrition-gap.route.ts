import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  FoodAdminMealNutritionEstimateInput,
  FoodAdminMealNutritionEstimateResult,
  FoodAdminMealNutritionGapsResult,
  Routes,
} from '@repo/api-contract';
import { listMealNutritionGaps } from './meal-nutrition-gap.js';

// 어드민 > 음식 카탈로그 "열량 빈 식단 이름" — 목록과 추정 다시 돌리기. 추정기는 식단 저장과 같은 인스턴스
// (plugins/meal 의 mealNutritionEstimator — 백그라운드 자리를 같이 쓴다).

const GAP_LIMIT = 100;

const mealNutritionGapRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.Food.adminMealNutritionGaps, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: FoodAdminMealNutritionGapsResult },
    },
    handler: async () => listMealNutritionGaps(app.prisma, GAP_LIMIT),
  });

  // 캐시로 채울 수 있는 건 바로 채우고, 아직 안 물어본 이름은 LLM·웹에 물으러 백그라운드로 보낸다.
  // 어휘(별칭·1인분 중량)를 고친 뒤 눌러도 된다 — 다만 어휘는 10분 캐시라 그 뒤에 반영된다.
  typed.post(Routes.Food.adminMealNutritionGapsEstimate, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: FoodAdminMealNutritionEstimateInput,
      response: { 200: FoodAdminMealNutritionEstimateResult },
    },
    handler: async (req) => {
      const filled = await app.mealNutritionEstimator.fillMissingItems(req.body.names);
      const scheduled = app.mealNutritionEstimator.schedule(req.body.names);
      return { filled, scheduled };
    },
  });
};

export default mealNutritionGapRoutes;
