import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ErrorResponseSchema,
  Routes,
  SubwayArrivalsParams,
  SubwayArrivalsResult,
  SubwayStationSearchQuery,
  SubwayStationSearchResult,
} from '@repo/api-contract';
import { env } from '../../config/env.js';
import { SubwayService } from './subway.service.js';

// error-handler 플러그인은 statusCode >= 500 을 일괄 500 으로 뭉개므로, 의미가
// 있는 502(업스트림 실패)/503(마스터 미적재·키 미설정·쿼터 소진)은 라우트가
// 직접 응답한다. 404(없는 역)는 error-handler 가 뭉개진 않지만 일관성을 위해
// 같은 statusCode 스위치로 처리한다. typed 라우트는 response schema 에 없는
// status 의 send() 를 타입 거부하므로 코드들을 공용 ErrorResponseSchema 로 등록.
//
// 검색은 로컬 DB 단일 소스라 키가 불필요하지만, 도착정보는 실시간 swopenAPI 라
// serviceKey(SUBWAY_API_KEY)를 주입한다 — 빈 키면 도착 조회만 503(검색은 정상).
// autoload 가 `*.route.ts` 를 자동 등록한다.

const subwayRoutes: FastifyPluginAsync = async (app) => {
  const service = new SubwayService({ prisma: app.prisma, serviceKey: env.SUBWAY_API_KEY });
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // 공개 라우트 — 버스 검색과 동일 정책(비로그인 허용).
  typed.get(Routes.Subway.stationSearch, {
    schema: {
      tags: ['subway'],
      querystring: SubwayStationSearchQuery,
      response: {
        200: SubwayStationSearchResult,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.searchStations(req.query.q);
      } catch (e) {
        const sc = e instanceof Error ? (e as { statusCode?: unknown }).statusCode : null;
        if (sc === 502 || sc === 503) {
          return reply.code(sc).send({
            statusCode: sc,
            error: sc === 503 ? 'Service Unavailable' : 'Bad Gateway',
            message: e instanceof Error ? e.message : '지하철 API 호출 실패',
          });
        }
        throw e;
      }
    },
  });

  // 역 실시간 도착정보 — stationId(`${lineId}:${name}`)로 역명 그룹을 재구성해
  // 조회. 없는 역 404, 업스트림 실패 502, 키 미설정·쿼터 소진 503.
  //
  // Routes.Subway.stationArrivals 는 인자를 encodeURIComponent 한다(stationId 에
  // 콜론·한글이 있어 클라이언트 인코딩용). 그대로 ':stationId' 를 넣으면
  // '%3AstationId' 가 되어 fastify 파라미터 패턴이 깨지므로, 등록 경로만 디코드해
  // ':stationId' 로 되돌린다(경로 구조는 여전히 Routes 단일 소스에서 파생).
  typed.get(decodeURIComponent(Routes.Subway.stationArrivals(':stationId')), {
    schema: {
      tags: ['subway'],
      params: SubwayArrivalsParams,
      response: {
        200: SubwayArrivalsResult,
        404: ErrorResponseSchema,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getStationArrivals(req.params.stationId);
      } catch (e) {
        const sc = e instanceof Error ? (e as { statusCode?: unknown }).statusCode : null;
        if (sc === 404 || sc === 502 || sc === 503) {
          return reply.code(sc).send({
            statusCode: sc,
            error:
              sc === 404 ? 'Not Found' : sc === 503 ? 'Service Unavailable' : 'Bad Gateway',
            message: e instanceof Error ? e.message : '지하철 도착 조회 실패',
          });
        }
        throw e;
      }
    },
  });
};

export default subwayRoutes;
