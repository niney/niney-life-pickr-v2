import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Routes,
  SubwayFavoriteLineParams,
  SubwayFavoriteLineUpsertBody,
  SubwayFavoriteStationParams,
  SubwayFavoriteStationUpsertBody,
  SubwayFavoritesResult,
  SubwayFavoritesSyncBody,
} from '@repo/api-contract';
import { SubwayFavoriteError, SubwayFavoriteService } from './subway-favorite.service.js';

const S = Routes.Subway;

// Routes.Subway.favoriteStation/favoriteLine 는 stationId 를 encodeURIComponent
// 한다(콜론·한글). 라우트 등록엔 ':stationId' 파라미터 패턴이 필요하므로 도착
// 라우트와 동일하게 등록 경로만 디코드해 복원한다(경로 구조는 Routes 단일 소스).
const STATION_PATH = decodeURIComponent(S.favoriteStation(':stationId'));
const LINE_PATH = decodeURIComponent(S.favoriteLine(':stationId', ':lineId'));

const throwAsHttp = (app: FastifyInstance, e: SubwayFavoriteError): never => {
  switch (e.code) {
    case 'limit_exceeded':
    default:
      throw app.httpErrors.badRequest(e.message);
  }
};

// /subway/favorites — 로그인 사용자의 서버 저장분. 인증 필수(다른 지하철 라우트는
// 공개지만 즐겨찾기만 소유자 스코프). PUT/DELETE/sync 응답 = 변경 후 전체 목록.
const subwayFavoriteRoutes: FastifyPluginAsync = async (app) => {
  const service = new SubwayFavoriteService(app.prisma);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(S.favorites, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['subway-favorite'],
      security: [{ bearerAuth: [] }],
      response: { 200: SubwayFavoritesResult },
    },
    handler: async (req) => service.list(req.user.userId),
  });

  typed.put(STATION_PATH, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['subway-favorite'],
      security: [{ bearerAuth: [] }],
      params: SubwayFavoriteStationParams,
      body: SubwayFavoriteStationUpsertBody,
      response: { 200: SubwayFavoritesResult },
    },
    handler: async (req) => {
      try {
        return await service.upsertStation(req.user.userId, req.params.stationId, req.body);
      } catch (e) {
        if (e instanceof SubwayFavoriteError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  typed.delete(STATION_PATH, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['subway-favorite'],
      security: [{ bearerAuth: [] }],
      params: SubwayFavoriteStationParams,
      response: { 200: SubwayFavoritesResult },
    },
    handler: async (req) => service.deleteStation(req.user.userId, req.params.stationId),
  });

  typed.put(LINE_PATH, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['subway-favorite'],
      security: [{ bearerAuth: [] }],
      params: SubwayFavoriteLineParams,
      body: SubwayFavoriteLineUpsertBody,
      response: { 200: SubwayFavoritesResult },
    },
    handler: async (req) => {
      try {
        return await service.upsertLine(
          req.user.userId,
          req.params.stationId,
          req.params.lineId,
          req.body,
        );
      } catch (e) {
        if (e instanceof SubwayFavoriteError) return throwAsHttp(app, e);
        throw e;
      }
    },
  });

  typed.delete(LINE_PATH, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['subway-favorite'],
      security: [{ bearerAuth: [] }],
      params: SubwayFavoriteLineParams,
      response: { 200: SubwayFavoritesResult },
    },
    handler: async (req) =>
      service.deleteLine(req.user.userId, req.params.stationId, req.params.lineId),
  });

  typed.post(S.favoritesSync, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['subway-favorite'],
      security: [{ bearerAuth: [] }],
      body: SubwayFavoritesSyncBody,
      response: { 200: SubwayFavoritesResult },
    },
    handler: async (req) => service.sync(req.user.userId, req.body),
  });
};

export default subwayFavoriteRoutes;
