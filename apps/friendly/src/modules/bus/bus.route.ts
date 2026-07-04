import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  BusArrivalsParams,
  BusArrivalsResult,
  BusPositionsParams,
  BusPositionsQuery,
  BusPositionsResult,
  BusStationSearchQuery,
  BusStationSearchResult,
  ErrorResponseSchema,
  Routes,
} from '@repo/api-contract';
import { env } from '../../config/env.js';
import { BusService } from './bus.service.js';

// error-handler 플러그인은 statusCode >= 500 을 일괄 500 으로 뭉개므로, 의미가
// 있는 502(업스트림 실패)/503(키 미설정·인증 실패·쿼터 소진)는 라우트가 직접
// 응답한다. typed 라우트는 response schema 에 없는 status 의 send() 를 타입
// 거부하므로 두 코드를 공용 ErrorResponseSchema 로 등록(로컬 중복 정의 금지).

const busRoutes: FastifyPluginAsync = async (app) => {
  const service = new BusService(app.prisma, { serviceKey: env.BUS_API_KEY });
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // 공개 라우트 — 맛집 공개 지도와 동일 정책(비로그인 허용). onRequest 없음.
  typed.get(Routes.Bus.stationSearch, {
    schema: {
      tags: ['bus'],
      querystring: BusStationSearchQuery,
      response: {
        200: BusStationSearchResult,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.searchStations(req.query.q, req.query.force);
      } catch (e) {
        const sc = e instanceof Error ? (e as { statusCode?: unknown }).statusCode : null;
        if (sc === 502 || sc === 503) {
          return reply.code(sc).send({
            statusCode: sc,
            error: sc === 503 ? 'Service Unavailable' : 'Bad Gateway',
            message: e instanceof Error ? e.message : '버스 API 호출 실패',
          });
        }
        throw e;
      }
    },
  });

  // 정류소 실시간 도착정보 — 무캐싱 프록시. params 검증 실패(비숫자·arsId '0')
  // 의 400 은 zod 밸리데이터가 자동 응답 — 기존 파라미터 라우트들과 동일하게
  // response 에 등록하지 않는다.
  typed.get(Routes.Bus.stationArrivals(':arsId'), {
    schema: {
      tags: ['bus'],
      params: BusArrivalsParams,
      response: {
        200: BusArrivalsResult,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getArrivals(req.params.arsId);
      } catch (e) {
        const sc = e instanceof Error ? (e as { statusCode?: unknown }).statusCode : null;
        if (sc === 502 || sc === 503) {
          return reply.code(sc).send({
            statusCode: sc,
            error: sc === 503 ? 'Service Unavailable' : 'Bad Gateway',
            message: e instanceof Error ? e.message : '버스 API 호출 실패',
          });
        }
        throw e;
      }
    },
  });

  // 노선 구간 실시간 버스 위치 — startOrd/endOrd 는 도착정보 staOrd 윈도우.
  typed.get(Routes.Bus.busPositions(':busRouteId'), {
    schema: {
      tags: ['bus'],
      params: BusPositionsParams,
      querystring: BusPositionsQuery,
      response: {
        200: BusPositionsResult,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getPositions(
          req.params.busRouteId,
          req.query.startOrd,
          req.query.endOrd,
        );
      } catch (e) {
        const sc = e instanceof Error ? (e as { statusCode?: unknown }).statusCode : null;
        if (sc === 502 || sc === 503) {
          return reply.code(sc).send({
            statusCode: sc,
            error: sc === 503 ? 'Service Unavailable' : 'Bad Gateway',
            message: e instanceof Error ? e.message : '버스 API 호출 실패',
          });
        }
        throw e;
      }
    },
  });
};

export default busRoutes;
