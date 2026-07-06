import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ErrorResponseSchema,
  Routes,
  SubwayStationSearchQuery,
  SubwayStationSearchResult,
} from '@repo/api-contract';
import { SubwayService } from './subway.service.js';

// error-handler 플러그인은 statusCode >= 500 을 일괄 500 으로 뭉개므로, 의미가
// 있는 502(업스트림 실패 — 2차~ 도착 라우트에서)/503(마스터 미적재)은 라우트가
// 직접 응답한다. typed 라우트는 response schema 에 없는 status 의 send() 를
// 타입 거부하므로 두 코드를 공용 ErrorResponseSchema 로 등록(로컬 중복 정의 금지).
//
// 검색은 로컬 DB 단일 소스라 업스트림 키가 불필요 — bus 와 달리 serviceKey 를
// 주입하지 않는다. autoload 가 `*.route.ts` 를 자동 등록하고, 경로 프리픽스는
// 라우트 문자열(Routes.Subway.stationSearch)에 이미 들어 있다.

const subwayRoutes: FastifyPluginAsync = async (app) => {
  const service = new SubwayService({ prisma: app.prisma });
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // 공개 라우트 — 버스 검색과 동일 정책(비로그인 허용). onRequest 없음.
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
};

export default subwayRoutes;
