import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  RestaurantFavoriteParams,
  RestaurantFavoriteUpsertBody,
  RestaurantFavoritesResult,
  RestaurantFavoritesSyncBody,
  Routes,
} from '@repo/api-contract';
import {
  RestaurantFavoriteError,
  RestaurantFavoriteService,
} from './restaurant-favorite.service.js';

const R = Routes.Restaurant;

const throwAsHttp = (app: FastifyInstance, e: RestaurantFavoriteError): never => {
  switch (e.code) {
    case 'limit_exceeded':
    default:
      throw app.httpErrors.badRequest(e.message);
  }
};

// /restaurants/favorites — 로그인 사용자의 서버 저장분. 인증 필수(공개 식당
// 라우트들과 달리 즐겨찾기만 소유자 스코프). PUT/DELETE/sync 응답 = 변경 후
// 전체 목록 (bus-favorite 와 동일 계약).
const restaurantFavoriteRoutes: FastifyPluginAsync = async (app) => {
  const service = new RestaurantFavoriteService(app.prisma);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(R.favorites, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['restaurant-favorite'],
      security: [{ bearerAuth: [] }],
      response: { 200: RestaurantFavoritesResult },
    },
    handler: async (req) => service.list(req.user.userId),
  });

  typed.put(R.favorite(':placeId'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['restaurant-favorite'],
      security: [{ bearerAuth: [] }],
      params: RestaurantFavoriteParams,
      body: RestaurantFavoriteUpsertBody,
      response: { 200: RestaurantFavoritesResult },
    },
    handler: async (req) => {
      try {
        return await service.upsert(req.user.userId, req.params.placeId, req.body);
      } catch (e) {
        if (e instanceof RestaurantFavoriteError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  typed.delete(R.favorite(':placeId'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['restaurant-favorite'],
      security: [{ bearerAuth: [] }],
      params: RestaurantFavoriteParams,
      response: { 200: RestaurantFavoritesResult },
    },
    handler: async (req) => service.remove(req.user.userId, req.params.placeId),
  });

  typed.post(R.favoritesSync, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['restaurant-favorite'],
      security: [{ bearerAuth: [] }],
      body: RestaurantFavoritesSyncBody,
      response: { 200: RestaurantFavoritesResult },
    },
    handler: async (req) => service.sync(req.user.userId, req.body),
  });
};

export default restaurantFavoriteRoutes;
