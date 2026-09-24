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
      summary: '버스 즐겨찾기 전체 목록(정류장·정류장×노선) — 등록순',
      security: [{ bearerAuth: [] }],
      response: { 200: BusFavoritesResult },
    },
    handler: async (req) => service.list(req.user.userId),
  });

  typed.put(B.favoriteStation(':stId'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['bus-favorite'],
      summary: '즐겨찾기 정류장 추가·갱신 — 종류별 최대 100개, 변경 후 전체 목록 반환',
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
      summary: '즐겨찾기 정류장 삭제 — 멱등, 변경 후 전체 목록 반환',
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
      summary: '즐겨찾기 노선(정류장×노선) 추가·갱신 — 종류별 최대 100개, 변경 후 전체 목록 반환',
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
      summary: '즐겨찾기 노선(정류장×노선) 삭제 — 멱등, 변경 후 전체 목록 반환',
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
      summary: '게스트 즐겨찾기 병합(sync) — 서버에 없는 항목만 추가, 전체 목록 반환',
      description:
        '로그인 직후 로컬 저장분을 올리는 용도. 이미 있는 항목은 서버 값을 유지하고, 상한(종류별 100개)을 넘는 항목은 에러 없이 건너뛴다. 같은 body 재호출은 멱등.',
      security: [{ bearerAuth: [] }],
      body: BusFavoritesSyncBody,
      response: { 200: BusFavoritesResult },
    },
    handler: async (req) => service.sync(req.user.userId, req.body),
  });
};

export default busFavoriteRoutes;
