import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ErrorResponseSchema,
  Routes,
  SubwayArrivalsParams,
  SubwayArrivalsResult,
  SubwayCongestionParams,
  SubwayCongestionQuery,
  SubwayCongestionResult,
  SubwayLineDetailParams,
  SubwayLineDetailResult,
  SubwayNearbyQuery,
  SubwayNearbyResult,
  SubwayPathQuery,
  SubwayPathResult,
  SubwayPositionsParams,
  SubwayPositionsResult,
  SubwayStationSearchQuery,
  SubwayStationSearchResult,
  SubwayTimetableParams,
  SubwayTimetableQuery,
  SubwayTimetableResult,
} from '@repo/api-contract';
import { env } from '../../config/env.js';
import { replyUpstreamError } from '../../lib/reply-upstream-error.js';
import { RATE } from '../../plugins/rate-limit.js';
import { SubwayService } from './subway.service.js';

// error-handler 플러그인은 statusCode >= 500 을 일괄 500 으로 뭉개므로, 의미가
// 있는 502(업스트림 실패)/503(마스터 미적재·키 미설정·쿼터 소진)은 라우트가
// 직접 응답한다. 404(없는 역)는 error-handler 가 뭉개진 않지만 일관성을 위해
// 같은 statusCode 스위치로 처리한다. typed 라우트는 response schema 에 없는
// status 의 send() 를 타입 거부하므로 코드들을 공용 ErrorResponseSchema 로 등록.
// 응답+진단 로깅은 replyUpstreamError(lib) 단일 구현.
//
// 검색은 로컬 DB 단일 소스라 키가 불필요하지만, 도착정보는 실시간 swopenAPI 라
// serviceKey(SUBWAY_API_KEY)를 주입한다 — 빈 키면 도착 조회만 503(검색은 정상).
// autoload 가 `*.route.ts` 를 자동 등록한다.

const subwayRoutes: FastifyPluginAsync = async (app) => {
  const service = new SubwayService({
    prisma: app.prisma,
    serviceKey: env.SUBWAY_API_KEY,
    seoulKey: env.SEOUL_OPEN_API_KEY,
  });
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
        const sent = replyUpstreamError(req, reply, e, [502, 503], '지하철 역 검색 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 좌표 기반 주변 역 — 로컬 바운딩박스 조회(업스트림 0콜). 좌표 범위(WGS84
  // 한국)·radius 상한(3000m)은 zod 가 400. path param 이 없어 등록 경로 디코드
  // 불필요. 마스터 미적재만 503(그 외 로컬 조회라 502 없음).
  typed.get(Routes.Subway.stationsNearby, {
    schema: {
      tags: ['subway'],
      querystring: SubwayNearbyQuery,
      response: {
        200: SubwayNearbyResult,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getNearbyStations(req.query.lat, req.query.lng, req.query.radius);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [503], '지하철 주변 역 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 노선 실시간 열차 위치 — 도착과 같은 실시간 인프라(캐시·쿼터·in-flight) 공유.
  // 미등재 노선 404, 업스트림 실패 502, 키 미설정·쿼터 소진 503. lineId 4자리라
  // 인코딩 불필요.
  typed.get(Routes.Subway.linePositions(':lineId'), {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['subway'],
      params: SubwayPositionsParams,
      response: {
        200: SubwayPositionsResult,
        404: ErrorResponseSchema,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getLinePositions(req.params.lineId);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [404, 502, 503], '지하철 위치 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 노선 상세(호선 보기) — 로컬 순서 데이터 조립. lineId 는 4자리라 인코딩·디코드
  // 불필요. 순서 데이터 없는 노선 404, 그 외 로컬 조회라 502 없음.
  typed.get(Routes.Subway.lineDetail(':lineId'), {
    schema: {
      tags: ['subway'],
      params: SubwayLineDetailParams,
      response: {
        200: SubwayLineDetailResult,
        404: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getLineDetail(req.params.lineId);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [404, 503], '지하철 노선 조회 실패');
        if (sent) return sent;
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
    config: { rateLimit: RATE.transitRealtime },
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
        const sent = replyUpstreamError(req, reply, e, [404, 502, 503], '지하철 도착 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 역 시간대별 혼잡도(1~8호선 정적 통계) — 로컬 조회. stationId 인코딩이라 도착
  // 라우트와 동일하게 등록 경로만 디코드. 없는 역 404, 미적재 503, 미제공 노선은
  // coverage:false 로 200(404 아님). 로컬이라 502 없음.
  typed.get(decodeURIComponent(Routes.Subway.stationCongestion(':stationId')), {
    schema: {
      tags: ['subway'],
      params: SubwayCongestionParams,
      querystring: SubwayCongestionQuery,
      response: {
        200: SubwayCongestionResult,
        404: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getStationCongestion(req.params.stationId, req.query.dayType);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [404, 503], '지하철 혼잡도 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 경로 탐색(로컬 그래프 다익스트라) — ?from=&to=. path param 이 없어 디코드
  // 불필요(from/to 는 쿼리 값). 없는 역 404, 마스터/순서 미적재 503. 미연결은
  // found:false 로 200(로컬이라 502 없음). from==to 는 zod refine 이 400.
  typed.get(Routes.Subway.path, {
    schema: {
      tags: ['subway'],
      querystring: SubwayPathQuery,
      response: {
        200: SubwayPathResult,
        404: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getPath(req.query.from, req.query.to);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [404, 503], '지하철 경로 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 역 시간표(1~9호선) — (stationId, dayType) blob 30일 캐시. stationId 인코딩이라
  // 도착 라우트와 동일하게 등록 경로만 디코드. 없는 역 404, 업스트림 실패 502,
  // 키 미설정·쿼터 소진 503. 미제공 노선은 coverage:false 로 200(404 아님).
  typed.get(decodeURIComponent(Routes.Subway.stationTimetable(':stationId')), {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['subway'],
      params: SubwayTimetableParams,
      querystring: SubwayTimetableQuery,
      response: {
        200: SubwayTimetableResult,
        404: ErrorResponseSchema,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getStationTimetable(req.params.stationId, req.query.dayType);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [404, 502, 503], '지하철 시간표 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });
};

export default subwayRoutes;
