import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateMealEntryInput,
  ListMealEntriesQuery,
  ListMealEntriesResult,
  MealCalendarQuery,
  MealCalendarResult,
  MealEntry,
  MealPreference,
  MealStatsQuery,
  RecentMealItemQuery,
  RecentMealItemResult,
  MealStatsResult,
  Routes,
  UpdateMealEntryInput,
  UpdateMealPreferenceInput,
  UploadMealPhotoResult,
} from '@repo/api-contract';
import { RATE } from '../../plugins/rate-limit.js';
import { MealPhotoError, isValidMealPhotoToken } from './meal-photo.service.js';
import { MealPreferenceService } from './meal-preference.service.js';
import { MealService, MealServiceError } from './meal.service.js';
import { MealStatsService } from './meal-stats.service.js';

// 식단 기록·사진·달력·통계·선호 — 전부 로그인 사용자 본인 것만(userId 스코프). 공개 표면 없음.
// 사진 저장 서비스는 plugins/meal.ts 가 decorate 한 전역 인스턴스(app.mealPhotos) — 고아 정리
// cron 과 같은 인스턴스를 공유한다.

const IdParams = z.object({ id: z.string().min(1).max(64) });
const TokenParams = z.object({ token: z.string().min(1).max(64) });

const mealRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const photos = app.mealPhotos;
  const meals = new MealService(app.prisma, { photos });
  const stats = new MealStatsService(app.prisma);
  const preferences = new MealPreferenceService(app.prisma);

  const throwAsHttp = (e: unknown): never => {
    if (e instanceof MealServiceError) {
      if (e.code === 'not_found') throw app.httpErrors.notFound(e.message);
      if (e.code === 'photo_not_found') throw app.httpErrors.notFound(e.message);
      throw app.httpErrors.badRequest(e.message);
    }
    if (e instanceof MealPhotoError) {
      if (e.code === 'not_found') throw app.httpErrors.notFound(e.message);
      if (e.code === 'forbidden') throw app.httpErrors.forbidden(e.message);
      if (e.code === 'quota') throw app.httpErrors.conflict(e.message);
      throw app.httpErrors.badRequest(e.message);
    }
    throw e;
  };

  // ── 기록 ────────────────────────────────────────────────────────────
  typed.get(Routes.Meal.entries, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      querystring: ListMealEntriesQuery,
      response: { 200: ListMealEntriesResult },
    },
    handler: async (req) => meals.list(req.user.userId, req.query),
  });

  typed.post(Routes.Meal.entries, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      body: CreateMealEntryInput,
      response: { 201: MealEntry },
    },
    handler: async (req, reply) => {
      try {
        const entry = await meals.create(req.user.userId, req.body);
        return reply.code(201).send(entry);
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  // 달력·통계는 :id 보다 먼저 등록해야 'calendar'/'stats' 가 id 로 잡히지 않는다.
  typed.get(Routes.Meal.calendar, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      querystring: MealCalendarQuery,
      response: { 200: MealCalendarResult },
    },
    handler: async (req) => {
      try {
        return await meals.calendar(req.user.userId, req.query.month);
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  // 수동 입력 보조 — 이 음식을 지난번에 어떻게 먹었나(양·분류·그때 사진).
  typed.get(Routes.Meal.recentItem, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      querystring: RecentMealItemQuery,
      response: { 200: RecentMealItemResult },
    },
    handler: async (req) => meals.findRecentItem(req.user.userId, req.query.name),
  });

  typed.get(Routes.Meal.stats, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      querystring: MealStatsQuery,
      response: { 200: MealStatsResult },
    },
    handler: async (req) => {
      if (req.query.from > req.query.to) {
        throw app.httpErrors.badRequest('from 이 to 보다 뒤입니다.');
      }
      // '오늘'은 서버 시간대(Asia/Seoul 배포)를 기준으로 잡는다 — 연속 일수 계산에만 쓰인다.
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
      return stats.stats(req.user.userId, req.query.from, req.query.to, today);
    },
  });

  typed.get(Routes.Meal.entry(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      response: { 200: MealEntry },
    },
    handler: async (req) => {
      try {
        return await meals.get(req.user.userId, req.params.id);
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  typed.patch(Routes.Meal.entry(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      body: UpdateMealEntryInput,
      response: { 200: MealEntry },
    },
    handler: async (req) => {
      try {
        return await meals.update(req.user.userId, req.params.id, req.body);
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  typed.delete(Routes.Meal.entry(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      params: IdParams,
      response: { 204: z.null() },
    },
    handler: async (req, reply) => {
      try {
        await meals.remove(req.user.userId, req.params.id);
        return reply.code(204).send(null);
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  // ── 사진 ────────────────────────────────────────────────────────────
  // multipart 는 zod body schema 와 호환되지 않아 typed 가 아닌 일반 app.post.
  app.post(Routes.Meal.photos, {
    onRequest: [app.authenticate],
    config: { rateLimit: RATE.mealPhotoUpload },
    schema: { tags: ['meal'], security: [{ bearerAuth: [] }] },
    handler: async (req) => {
      const file = await req.file();
      if (!file) throw app.httpErrors.badRequest('파일이 필요합니다.');
      const buffer = await file.toBuffer();
      if (file.file.truncated) throw app.httpErrors.payloadTooLarge('파일이 너무 큽니다.');
      try {
        return UploadMealPhotoResult.parse(await photos.store(req.user.userId, buffer));
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  // 원본/썸네일 — JWT 필요(공개 URL 아님). binary 라 typed 가 아닌 일반 라우트.
  const servePhoto = (variant: 'full' | 'thumb') => async (
    req: { user: { userId: string }; params: unknown },
    reply: { code: (n: number) => { send: (b: unknown) => unknown }; header: (k: string, v: string) => unknown; send: (b: unknown) => unknown },
  ): Promise<unknown> => {
    const { token } = req.params as { token: string };
    if (!isValidMealPhotoToken(token)) throw app.httpErrors.badRequest('토큰 형식이 올바르지 않습니다.');
    try {
      const buf = await photos.read(req.user.userId, token, variant);
      reply.header('Content-Type', 'image/jpeg');
      // private — 사용자별 사진이라 공용 캐시에 담기면 안 된다.
      reply.header('Cache-Control', 'private, max-age=3600');
      return reply.send(buf);
    } catch (e) {
      return throwAsHttp(e);
    }
  };

  app.get(Routes.Meal.photo(':token'), {
    onRequest: [app.authenticate],
    schema: { tags: ['meal'], security: [{ bearerAuth: [] }], params: TokenParams },
    handler: servePhoto('full') as never,
  });

  app.get(Routes.Meal.photoThumb(':token'), {
    onRequest: [app.authenticate],
    schema: { tags: ['meal'], security: [{ bearerAuth: [] }], params: TokenParams },
    handler: servePhoto('thumb') as never,
  });

  // 지난 기록의 사진을 이번 기록용으로 복제 — 원본을 지워도 새 기록이 멀쩡하도록 참조가 아닌 복사.
  typed.post(Routes.Meal.photoCopy(':token'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      params: TokenParams,
      response: { 201: UploadMealPhotoResult },
    },
    handler: async (req, reply) => {
      try {
        return reply.code(201).send(await photos.copy(req.user.userId, req.params.token));
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  typed.delete(Routes.Meal.photo(':token'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      params: TokenParams,
      response: { 204: z.null() },
    },
    handler: async (req, reply) => {
      try {
        await photos.remove(req.user.userId, req.params.token);
        return reply.code(204).send(null);
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  // ── 선호 설정 ───────────────────────────────────────────────────────
  typed.get(Routes.Meal.preference, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      response: { 200: MealPreference },
    },
    handler: async (req) => preferences.get(req.user.userId),
  });

  typed.put(Routes.Meal.preference, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      security: [{ bearerAuth: [] }],
      body: UpdateMealPreferenceInput,
      response: { 200: MealPreference },
    },
    handler: async (req) => preferences.update(req.user.userId, req.body),
  });
};

export default mealRoutes;
