import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  BusArrivalsParams,
  BusArrivalsResult,
  BusNearbyQuery,
  BusNearbyResult,
  BusPositionsParams,
  BusPositionsQuery,
  BusPositionsResult,
  BusRouteDetailParams,
  BusRouteDetailResult,
  BusStationSearchQuery,
  BusStationSearchResult,
  ErrorResponseSchema,
  Routes,
} from '@repo/api-contract';
import { env } from '../../config/env.js';
import { replyUpstreamError } from '../../lib/reply-upstream-error.js';
import { RATE } from '../../plugins/rate-limit.js';
import { BusService } from './bus.service.js';

// error-handler 플러그인은 statusCode >= 500 을 일괄 500 으로 뭉개므로, 의미가
// 있는 502(업스트림 실패)/503(키 미설정·인증 실패·쿼터 소진)는 라우트가 직접
// 응답한다. typed 라우트는 response schema 에 없는 status 의 send() 를 타입
// 거부하므로 두 코드를 공용 ErrorResponseSchema 로 등록(로컬 중복 정의 금지).
// 응답+진단 로깅은 replyUpstreamError(lib) 단일 구현.

const busRoutes: FastifyPluginAsync = async (app) => {
  const service = new BusService(app.prisma, { serviceKey: env.DATA_GO_KR_API_KEY });
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
        const sent = replyUpstreamError(req, reply, e, [502, 503], '버스 정류장 검색 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 좌표 기반 주변 정류장 — 좌표 범위(WGS84 한국)·radius 상한(1000m)은 zod 가
  // 400 으로 거절. 셀 단위 DB 30일 캐시가 지도 자동 조회를 흡수한다.
  typed.get(Routes.Bus.stationsNearby, {
    schema: {
      tags: ['bus'],
      querystring: BusNearbyQuery,
      response: {
        200: BusNearbyResult,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getNearbyStations(req.query.lat, req.query.lng, req.query.radius);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '주변 정류장 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 정류소 실시간 도착정보 — 무캐싱 프록시. params 검증 실패(비숫자·arsId '0')
  // 의 400 은 zod 밸리데이터가 자동 응답 — 기존 파라미터 라우트들과 동일하게
  // response 에 등록하지 않는다.
  typed.get(Routes.Bus.stationArrivals(':arsId'), {
    config: { rateLimit: RATE.transitRealtime },
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
        const sent = replyUpstreamError(req, reply, e, [502, 503], '버스 도착정보 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 노선 실시간 버스 위치 — startOrd/endOrd 지정 시 구간(도착정보 staOrd
  // 윈도우), 둘 다 생략 시 노선 전체 차량. 페어 검증은 querystring zod 가 담당.
  typed.get(Routes.Bus.busPositions(':busRouteId'), {
    config: { rateLimit: RATE.transitRealtime },
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
        const sent = replyUpstreamError(req, reply, e, [502, 503], '버스 위치 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 노선 상세(형상+경유 정류소+기본정보) 합본 — busRouteInfo 3콜을 서버가 한 번에
  // 수집해 DB 30일 캐싱. 비숫자 busRouteId 는 zod 가 400. 502/503 은 직접 응답.
  typed.get(Routes.Bus.routeDetail(':busRouteId'), {
    schema: {
      tags: ['bus'],
      params: BusRouteDetailParams,
      response: {
        200: BusRouteDetailResult,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getRouteDetail(req.params.busRouteId);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '버스 노선 상세 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });
};

export default busRoutes;
