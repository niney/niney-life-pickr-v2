import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  BusFavoriteRouteParams,
  BusFavoriteRouteUpsertBody,
  BusFavoriteStationParams,
  BusFavoriteStationUpsertBody,
  BusFavoritesResult,
  BusFavoritesSyncBody,
  Routes,
} from '@repo/api-contract';
import { BusFavoriteError, BusFavoriteService } from './bus-favorite.service.js';

const B = Routes.Bus;

const throwAsHttp = (app: FastifyInstance, e: BusFavoriteError): never => {
  switch (e.code) {
    case 'limit_exceeded':
    default:
      throw app.httpErrors.badRequest(e.message);
  }
};

// /bus/favorites — 로그인 사용자의 서버 저장분. 인증 필수(다른 버스 라우트는
// 공개지만 즐겨찾기만 소유자 스코프). PUT/DELETE/sync 응답 = 변경 후 전체 목록.
const busFavoriteRoutes: FastifyPluginAsync = async (app) => {
  const service = new BusFavoriteService(app.prisma);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(B.favorites, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['bus-favorite'],
      security: [{ bearerAuth: [] }],
      response: { 200: BusFavoritesResult },
    },
    handler: async (req) => service.list(req.user.userId),
  });

  typed.put(B.favoriteStation(':stId'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['bus-favorite'],
      security: [{ bearerAuth: [] }],
      params: BusFavoriteStationParams,
      body: BusFavoriteStationUpsertBody,
      response: { 200: BusFavoritesResult },
    },
    handler: async (req) => {
      try {
        return await service.upsertStation(req.user.userId, req.params.stId, req.body);
      } catch (e) {
        if (e instanceof BusFavoriteError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  typed.delete(B.favoriteStation(':stId'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['bus-favorite'],
      security: [{ bearerAuth: [] }],
      params: BusFavoriteStationParams,
      response: { 200: BusFavoritesResult },
    },
    handler: async (req) => service.deleteStation(req.user.userId, req.params.stId),
  });

  typed.put(B.favoriteRoute(':stId', ':busRouteId'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['bus-favorite'],
      security: [{ bearerAuth: [] }],
      params: BusFavoriteRouteParams,
      body: BusFavoriteRouteUpsertBody,
      response: { 200: BusFavoritesResult },
    },
    handler: async (req) => {
      try {
        return await service.upsertRoute(
          req.user.userId,
          req.params.stId,
          req.params.busRouteId,
          req.body,
        );
      } catch (e) {
        if (e instanceof BusFavoriteError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  typed.delete(B.favoriteRoute(':stId', ':busRouteId'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['bus-favorite'],
      security: [{ bearerAuth: [] }],
      params: BusFavoriteRouteParams,
      response: { 200: BusFavoritesResult },
    },
    handler: async (req) =>
      service.deleteRoute(req.user.userId, req.params.stId, req.params.busRouteId),
  });

  typed.post(B.favoritesSync, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['bus-favorite'],
      security: [{ bearerAuth: [] }],
      body: BusFavoritesSyncBody,
      response: { 200: BusFavoritesResult },
    },
    handler: async (req) => service.sync(req.user.userId, req.body),
  });
};

export default busFavoriteRoutes;
