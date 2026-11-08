import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CreateMealNutritionAdviceInput,
  LatestMealNutritionAdviceResult,
  MealNutritionAdvice,
  MEAL_STATS_MAX_DAYS,
  MealNutritionAnalysis,
  MealNutritionQuery,
  MealStatsNutrientsResult,
  MealStatsNutritionResult,
  MealStatsQuery,
  Routes,
  type MealStatsQueryType,
} from '@repo/api-contract';
import { daysBetween } from '@repo/utils';
import { env } from '../../config/env.js';
import { RATE } from '../../plugins/rate-limit.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../ai/llm-provider-env.js';
import { MealDailyQuotaService } from '../meal/meal-daily-quota.service.js';
import {
  MealNutritionAdviceError,
  MealNutritionAdviceService,
} from './meal-nutrition-advice.service.js';
import { MealNutritionGroupsService } from './meal-nutrition-groups.js';
import { MealNutritionStatsService } from './meal-nutrition-stats.js';
import { MealNutritionService } from './meal-nutrition.service.js';

// 영양소 점검·영양제 조언 — 로그인 사용자 본인 기록만. 점검은 LLM 없이 계산만, 조언은 텍스트 LLM 1콜
// (같은 날·같은 점검 결과면 저장된 조언을 다시 줘 일일 한도를 쓰지 않는다).

const kstToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

const mealNutritionRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const aiConfig = new AiConfigService(app.prisma, buildLlmProviderEnv());
  const dailyQuota = new MealDailyQuotaService(app.prisma);
  // 영양 기준 음식(plugins/meal) — 비타민·무기질이 없는 행·이름을 표준 음식의 열량당 영양소로 계산한다.
  const nutrition = new MealNutritionService(app.prisma, { refs: app.foodNutrientRefs });
  const groups = new MealNutritionGroupsService(app.prisma, nutrition);
  const stats = new MealNutritionStatsService(app.prisma, nutrition);
  // 통계 기간 — from ≤ to, 최대 MEAL_STATS_MAX_DAYS 일(묶음별 몫·영양소별 하루 평균이 같은 규칙).
  const checkStatsRange = ({ from, to }: MealStatsQueryType): void => {
    if (from > to) throw app.httpErrors.badRequest('from 이 to 보다 뒤입니다.');
    const span = daysBetween(from, to);
    if (span === null || span + 1 > MEAL_STATS_MAX_DAYS) {
      throw app.httpErrors.badRequest(`통계 기간은 최대 ${MEAL_STATS_MAX_DAYS}일입니다.`);
    }
  };
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

  typed.get(Routes.Meal.statsNutrition, {
    onRequest: [app.authenticate],
    config: { rateLimit: RATE.mealNutrition },
    schema: {
      tags: ['meal'],
      summary: '통계 — 묶음(조리 형태·주재료·요리 계통)별 영양 몫: 이 기간 먹은 열량·탄단지·나트륨·비타민·무기질 중 그 묶음 몫',
      description:
        `기간은 from~to(포함) 최대 ${MEAL_STATS_MAX_DAYS}일 — 넘으면 400. 반찬도 그 묶음에 들어 몫을 다 더하면 100%다(mainCount 만 ` +
        '주식을 센다). 비타민·무기질은 영양소 점검과 같은 계산(먹은 열량 × 기준 행의 열량당 영양소), 탄수화물·지방은 카탈로그 ' +
        '1인분의 열량당 비율로 어림한다. highlights 는 열량 몫보다 크게 채운 비타민·무기질(최대 3). LLM 없음.',
      security: [{ bearerAuth: [] }],
      querystring: MealStatsQuery,
      response: { 200: MealStatsNutritionResult },
    },
    handler: async (req) => {
      checkStatsRange(req.query);
      return groups.groups(req.user.userId, req.query.from, req.query.to);
    },
  });

  typed.get(Routes.Meal.statsNutrients, {
    onRequest: [app.authenticate],
    config: { rateLimit: RATE.mealNutrition },
    schema: {
      tags: ['meal'],
      summary: '통계 — 영양소별 하루 평균·날마다 흐름·많이 준 음식(고른 기간을 영양 탭과 같은 셈·기준으로)',
      description:
        `기간은 from~to(포함) 최대 ${MEAL_STATS_MAX_DAYS}일 — 넘으면 400. 하루 평균과 판정(status)은 영양소 점검을 이 기간에 ` +
        '그대로 돌린 값이다(두 끼 이상 기록한 날만, 2020 한국인 영양소 섭취기준, 그런 날이 4일 미만이면 status=insufficient). ' +
        '점검에 없는 탄수화물·당류·지방·포화지방·콜레스테롤은 카탈로그(1인분·100g당) 값으로 어림하고 판정 없이 열량 중 비율' +
        '(energyShare)과 에너지적정비율(energyRange)을 준다. daily 는 dates 와 같은 순서의 그날 합계(한 끼만 기록한 날도 값을 ' +
        '준다 — meals 가 2 미만이면 평균에서 빠진 날), topFoods 는 기간의 모든 기록에서 그 영양소를 많이 준 음식(최대 5). LLM 없음.',
      security: [{ bearerAuth: [] }],
      querystring: MealStatsQuery,
      response: { 200: MealStatsNutrientsResult },
    },
    handler: async (req) => {
      checkStatsRange(req.query);
      return stats.nutrients(req.user.userId, req.query.from, req.query.to, kstToday());
    },
  });

  typed.get(Routes.Meal.nutritionAdvice, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '내 최근 영양제 조언 — 없으면 advice=null, 지금 점검과 판정이 달라졌으면 stale=true',
      description:
        '조언 방식(프롬프트 버전)이 바뀌었거나, 조언과 같은 기간을 오늘 다시 점검한 판정(영양소별 부족·조금 부족·' +
        '기록 더 필요 여부)이 조언 때와 다르면 stale=true — 화면은 다시 받기를 권한다. 숫자만 조금 달라진 것은 보지 않는다.',
      security: [{ bearerAuth: [] }],
      response: { 200: LatestMealNutritionAdviceResult },
    },
    handler: async (req) => advice.latest(req.user.userId, kstToday()),
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
