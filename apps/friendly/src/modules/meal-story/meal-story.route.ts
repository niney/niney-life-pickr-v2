import { createReadStream } from 'node:fs';
import { extname } from 'node:path';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  MealStory,
  MealStoryFoodResult,
  MealStoryImageParams,
  MealStoryListResult,
  MealStorySlugParams,
  Routes,
} from '@repo/api-contract';
import { RATE } from '../../plugins/rate-limit.js';
import { OPTIONAL_BEARER } from '../../plugins/swagger.js';
import { mealStoryStore } from './meal-story.instance.js';
import { MealStoryFoodError, ensureMealStoryFood, mealStoryFoodIds } from './meal-story.service.js';

// 건강식단 스토리 — 누구나 보는 손수 만든 콘텐츠. 원고는 서버 파일(content/meal-stories)이라 쓰기 API 는 없고,
// [이 레시피로 기록]만 로그인해 레시피를 카탈로그 음식으로 맞춘다. 초안은 관리자에게만 보인다.

const IMAGE_TYPE: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const mealStoryRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const store = mealStoryStore(app.log);
  const isAdmin = async (req: FastifyRequest): Promise<boolean> =>
    (await app.resolveOptionalUser(req))?.role === 'ADMIN';

  typed.get(Routes.MealStory.list, {
    config: { rateLimit: RATE.mealStoryRead },
    schema: {
      tags: ['meal-story'],
      summary: '건강식단 스토리 목록 — 게시한 것, 게시일 최근 순',
      description: '선택 인증 — 관리자면 초안(status draft)도 함께 준다.',
      security: OPTIONAL_BEARER,
      response: { 200: MealStoryListResult },
    },
    handler: async (req) => {
      const items = await store.list({ includeDrafts: await isAdmin(req) });
      const foods = await mealStoryFoodIds(
        app.prisma,
        items.filter((s) => s.story.recipe).map((s) => s.script.slug),
      );
      return { items: items.map((s) => ({ ...s.listItem, recipeFoodId: foods.get(s.script.slug) ?? null })) };
    },
  });

  typed.get(Routes.MealStory.detail(':slug'), {
    config: { rateLimit: RATE.mealStoryRead },
    schema: {
      tags: ['meal-story'],
      summary: '건강식단 스토리 한 편 — 장면·레시피·출처(숫자는 서버가 계산한 값)',
      description:
        '선택 인증 — 초안은 관리자만, 없거나 볼 수 없으면 404. 장면 숫자(figure)는 섭취기준·식약처 식품 표준데이터·레시피 ' +
        '합계로 서버가 계산하고, 내 기록 값(figure.my)은 value 가 null 이라 화면이 /meals/stats/nutrients 로 채운다.',
      security: OPTIONAL_BEARER,
      params: MealStorySlugParams,
      response: { 200: MealStory },
    },
    handler: async (req) => {
      const loaded = await store.get(req.params.slug, { includeDrafts: await isAdmin(req) });
      if (!loaded) throw app.httpErrors.notFound('스토리를 찾을 수 없습니다');
      return loaded.story;
    },
  });

  typed.get(Routes.MealStory.image(':slug', ':file'), {
    config: { rateLimit: RATE.mealStoryImage },
    schema: {
      tags: ['meal-story'],
      summary: '건강식단 스토리 사진',
      description: '인증 없음(<img> 가 바로 부른다). ?v=(수정 시각)가 붙은 주소는 1년 캐시, 없으면 1시간.',
      params: MealStoryImageParams,
    },
    handler: async (req, reply) => {
      const { slug, file } = req.params;
      const path = await store.imagePath(slug, file);
      const type = IMAGE_TYPE[extname(file).toLowerCase()];
      if (!path || !type) throw app.httpErrors.notFound('사진을 찾을 수 없습니다');
      const versioned = typeof (req.query as { v?: unknown }).v === 'string';
      return reply
        .type(type)
        .header('cache-control', versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600')
        .send(createReadStream(path));
    },
  });

  typed.post(Routes.MealStory.food(':slug'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal-story'],
      summary: '이 레시피로 기록 — 스토리 레시피를 카탈로그 음식으로 맞추고 그 id 를 준다',
      description:
        '처음 부르면 음식(source manual)을 만들고, 원고 숫자가 바뀌었으면 고친다. 새 기록 화면이 이 foodId 로 항목을 ' +
        '채워 스토리와 같은 1인분 영양이 기록된다. 레시피가 없는 스토리는 404.',
      security: [{ bearerAuth: [] }],
      params: MealStorySlugParams,
      response: { 200: MealStoryFoodResult },
    },
    handler: async (req) => {
      const loaded = await store.get(req.params.slug, { includeDrafts: req.user.role === 'ADMIN' });
      if (!loaded) throw app.httpErrors.notFound('스토리를 찾을 수 없습니다');
      try {
        return await ensureMealStoryFood(app.prisma, loaded);
      } catch (e) {
        if (!(e instanceof MealStoryFoodError)) throw e;
        if (e.code === 'no_recipe') throw app.httpErrors.notFound(e.message);
        throw app.httpErrors.conflict(e.message);
      }
    },
  });
};

export default mealStoryRoutes;
