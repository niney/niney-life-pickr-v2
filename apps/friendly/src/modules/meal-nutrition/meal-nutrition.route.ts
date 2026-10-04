import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CreateMealNutritionAdviceInput,
  LatestMealNutritionAdviceResult,
  MealNutritionAdvice,
  MealNutritionAnalysis,
  MealNutritionQuery,
  Routes,
} from '@repo/api-contract';
import { env } from '../../config/env.js';
import { RATE } from '../../plugins/rate-limit.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import { MealDailyQuotaService } from '../meal/meal-daily-quota.service.js';
import {
  MealNutritionAdviceError,
  MealNutritionAdviceService,
} from './meal-nutrition-advice.service.js';
import { MealNutritionService } from './meal-nutrition.service.js';

// 영양소 점검·영양제 조언 — 로그인 사용자 본인 기록만. 점검은 LLM 없이 계산만, 조언은 텍스트 LLM 1콜
// (같은 날·같은 점검 결과면 저장된 조언을 다시 줘 일일 한도를 쓰지 않는다).

const kstToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

const mealNutritionRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const aiConfig = new AiConfigService(app.prisma, buildLlmProviderEnv());
  const dailyQuota = new MealDailyQuotaService(app.prisma);
  const nutrition = new MealNutritionService(app.prisma);
  const advice = new MealNutritionAdviceService(app.prisma, aiConfig, {
    logger: app.log,
    operationLog: app.operationLog,
    nutrition,
    consumeQuota: (userId) =>
      dailyQuota.consume(userId, kstToday(), 'supplement', env.MEAL_SUPPLEMENT_DAILY_LIMIT),
  });

  typed.get(Routes.Meal.nutrition, {
    onRequest: [app.authenticate],
    config: { rateLimit: RATE.mealNutrition },
    schema: {
      tags: ['meal'],
      summary: '영양소 점검 — 최근 N일 식단 기록의 하루 평균을 한국인 영양소 섭취기준(2020)과 비교',
      description:
        'days(7~28, 기본 14)일 중 두 끼 이상 기록한 날의 평균을 낸다. 성별·출생연도(식단 설정)가 없으면 ' +
        '30-49세 남녀 중 낮은 기준으로 본다. 4일 미만이면 status=insufficient. 진단이 아니라 기록으로 본 추정이다. ' +
        'LLM 을 쓰지 않으며 일일 한도와 무관하다.',
      security: [{ bearerAuth: [] }],
      querystring: MealNutritionQuery,
      response: { 200: MealNutritionAnalysis },
    },
    handler: async (req) => nutrition.analyze(req.user.userId, kstToday(), req.query.days),
  });

  typed.get(Routes.Meal.nutritionAdvice, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '내 최근 영양제 조언 — 없으면 advice=null',
      security: [{ bearerAuth: [] }],
      response: { 200: LatestMealNutritionAdviceResult },
    },
    handler: async (req) => ({ advice: await advice.latest(req.user.userId) }),
  });

  typed.post(Routes.Meal.nutritionAdvice, {
    onRequest: [app.authenticate],
    config: { rateLimit: RATE.mealSupplement },
    schema: {
      tags: ['meal'],
      summary: '영양제 조언 생성 — 부족한 영양소를 음식·영양제(성분·형태)로 채우는 법, 텍스트 LLM 1콜',
      description:
        '영양소 점검 결과에서 열량을 채워 봐도 모자란 영양소만 조언한다(제품명 없음). 같은 날·같은 점검 결과면 ' +
        '저장된 조언을 주고 force=true 면 새로 만든다. 새로 만들 때마다 일일 한도(MEAL_SUPPLEMENT_DAILY_LIMIT, ' +
        '기본 10회)를 1회 차감하며 초과 시 429. 기록이 모자라거나 조언할 영양소가 없으면 LLM 없이 답한다. ' +
        'LLM 이 없거나 실패하면 서버 문장만으로 쓴 조언(status=fallback)을 돌려준다. 만드는 동안 식단 데이터를 ' +
        '전체 삭제하면 결과를 저장하지 않고 409.',
      security: [{ bearerAuth: [] }],
      body: CreateMealNutritionAdviceInput,
      response: { 200: MealNutritionAdvice },
    },
    handler: async (req) => {
      try {
        const { advice: result } = await advice.create(req.user.userId, req.body, kstToday());
        return result;
      } catch (e) {
        if (e instanceof MealNutritionAdviceError && e.code === 'quota') {
          throw app.httpErrors.tooManyRequests(
            `오늘 영양제 조언 한도(${env.MEAL_SUPPLEMENT_DAILY_LIMIT}회)를 모두 썼습니다. 내일 다시 시도해 주세요.`,
          );
        }
        // 계산 중 식단 데이터가 전체 삭제돼 결과를 버렸다.
        if (e instanceof MealNutritionAdviceError && e.code === 'conflict') {
          throw app.httpErrors.conflict(e.message);
        }
        throw e;
      }
    },
  });
};

export default mealNutritionRoutes;
