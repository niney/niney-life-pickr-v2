import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { RecognizeMealInput, RecognizeMealResult, Routes } from '@repo/api-contract';
import { env } from '../../config/env.js';
import { RATE } from '../../plugins/rate-limit.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import { MealPhotoError } from '../meal/meal-photo.service.js';
import { MealDailyQuotaService } from '../meal/meal-daily-quota.service.js';
import { RestaurantService } from '../restaurant/restaurant.service.js';
import { MealRecognitionError, MealRecognitionService } from './meal-recognition.service.js';

// 사진 → 음식 인식(동기). 영수증 추출과 같은 요청/응답 모양이고, 결과는 저장하지 않는다.
// 비용 방어: 라우트 레이트리밋(연타) + per-user SQLite 일일 한도 + 계정 동시성 게이트.

const mealRecognitionRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  // aiConfig 는 autoload 순서에 의존하지 않게 직접 조립한다(plugins/summaries 보다 먼저 로드될 수 있다).
  const aiConfig = new AiConfigService(app.prisma, buildLlmProviderEnv());
  const restaurants = new RestaurantService(app.prisma);
  const dailyQuota = new MealDailyQuotaService(app.prisma);
  const service = new MealRecognitionService(app.prisma, aiConfig, {
    photos: app.mealPhotos,
    logger: app.log,
    operationLog: app.operationLog,
    consumeQuota: (userId) =>
      dailyQuota.consume(
        userId,
        new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }),
        'recognition',
        env.MEAL_RECOGNIZE_DAILY_LIMIT,
      ),
    placeHint: async (placeId) => {
      const meta = await restaurants.getPublicSeoMeta(placeId);
      if (!meta) return null;
      return { name: meta.name, menuNames: meta.menus.map((m) => m.name) };
    },
  });

  typed.post(Routes.Meal.recognize, {
    onRequest: [app.authenticate],
    config: { rateLimit: RATE.mealRecognize },
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      body: RecognizeMealInput,
      response: { 200: RecognizeMealResult },
    },
    handler: async (req) => {
      const userId = req.user.userId;
      try {
        return await service.recognize({
          userId,
          photoTokens: req.body.photoTokens,
          placeId: req.body.placeId ?? null,
          slot: req.body.slot ?? null,
        });
      } catch (e) {
        if (e instanceof MealRecognitionError) {
          if (e.code === 'quota') {
            throw app.httpErrors.tooManyRequests(
              `오늘 사진 인식 한도(${env.MEAL_RECOGNIZE_DAILY_LIMIT}회)를 모두 썼습니다. 직접 입력해 주세요.`,
            );
          }
          if (e.code === 'no_provider') throw app.httpErrors.serviceUnavailable(e.message);
          if (e.code === 'parse_failed') throw app.httpErrors.badGateway(e.message);
          throw app.httpErrors.badGateway(e.message);
        }
        if (e instanceof MealPhotoError) {
          if (e.code === 'not_found') throw app.httpErrors.notFound(e.message);
          if (e.code === 'forbidden') throw app.httpErrors.forbidden(e.message);
          throw app.httpErrors.badRequest(e.message);
        }
        throw e;
      }
    },
  });
};

export default mealRecognitionRoutes;
