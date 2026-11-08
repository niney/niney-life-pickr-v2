import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  MEAL_STATS_MAX_DAYS,
  MealSkip,
  MealSkipsQuery,
  MealSkipsResult,
  Routes,
} from '@repo/api-contract';
import { daysBetween } from '@repo/utils';
import { MealSkipError, MealSkipService } from './meal-skip.service.js';

// 끼니 '안 먹음' 표시 — 로그인 사용자 본인 것만. 빈 칸이 '안 적음'인지 '안 먹음'인지 가려, 영양소 점검·통계의 하루 평균이
// 한 끼만 먹은 날도 평균에 넣는다. /meals/:id 보다 정적 경로가 먼저 잡힌다(find-my-way 는 정적 경로가 매개변수보다 우선).

const kstToday = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

const mealSkipRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const skips = new MealSkipService(app.prisma);

  typed.get(Routes.Meal.skips, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '끼니 안 먹음 표시 목록 — 기간(from~to) 안의 날짜·끼니',
      description: `기간은 from~to(포함) 최대 ${MEAL_STATS_MAX_DAYS}일 — 넘으면 400. 날짜·끼니 순.`,
      security: [{ bearerAuth: [] }],
      querystring: MealSkipsQuery,
      response: { 200: MealSkipsResult },
    },
    handler: async (req) => {
      const { from, to } = req.query;
      if (from > to) throw app.httpErrors.badRequest('from 이 to 보다 뒤입니다.');
      const span = daysBetween(from, to);
      if (span === null || span + 1 > MEAL_STATS_MAX_DAYS) {
        throw app.httpErrors.badRequest(`기간은 최대 ${MEAL_STATS_MAX_DAYS}일입니다.`);
      }
      return { skips: await skips.list(req.user.userId, from, to) };
    },
  });

  typed.put(Routes.Meal.skips, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '끼니 안 먹음 표시 — 그 날 그 끼니를 먹지 않았다고 남긴다(이미 있으면 그대로)',
      description:
        '아침·점심·저녁만. 앞으로 올 날은 400, 그 날·끼니에 이미 기록이 있으면 409(기록이 이긴다). 나중에 같은 날·끼니를 ' +
        '기록하면 표시는 지워진다. 영양소 점검·통계는 두 끼 이상 기록한 날과, 한 끼만 기록하고 남은 아침·점심·저녁을 모두 ' +
        '이 표시로 채운 날을 하루 평균에 넣는다.',
      security: [{ bearerAuth: [] }],
      body: MealSkip,
      response: { 200: MealSkip },
    },
    handler: async (req) => {
      try {
        return await skips.set(req.user.userId, req.body, kstToday());
      } catch (e) {
        if (e instanceof MealSkipError && e.code === 'recorded') throw app.httpErrors.conflict(e.message);
        if (e instanceof MealSkipError) throw app.httpErrors.badRequest(e.message);
        throw e;
      }
    },
  });

  typed.delete(Routes.Meal.skips, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '끼니 안 먹음 표시 지우기(없으면 그대로)',
      security: [{ bearerAuth: [] }],
      querystring: MealSkip,
    },
    handler: async (req, reply) => {
      await skips.clear(req.user.userId, req.query);
      return reply.code(204).send();
    },
  });
};

export default mealSkipRoutes;
