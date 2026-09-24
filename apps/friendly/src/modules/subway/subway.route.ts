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
      summary: '수도권 전철역 이름 검색 — 로컬 역사마스터, 역명 그룹 최대 30개',
      description:
        'q 는 1~50자(NFC 정규화) 부분일치. 같은 물리 역의 호선들을 한 그룹으로 묶어 돌려주며, 각 호선의 stationId(lineId:역명)가 도착·시간표 등 다른 라우트의 입력이다.',
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
      summary: '좌표 기준 주변 전철역 — 로컬 역사마스터, 거리순 최대 30그룹',
      description: 'lat·lng(WGS84) 필수, radius 100~3000m(기본 1500). 업스트림을 호출하지 않는다.',
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
      summary: '노선 실시간 열차 위치 — 서울시 실시간 지하철 API 프록시, 15초 캐시',
      description: 'lineId 는 4자리 subwayId(예: 1002 = 2호선). 미등재 노선은 404.',
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
      summary: '노선 상세(구간별 정차역 순서·노선 형상) — 로컬 DB',
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
      summary: '역 실시간 열차 도착정보 — 서울시 실시간 지하철 API 프록시, 15초 캐시',
      description:
        'stationId 는 lineId:역명 형식이라 URL 인코딩해 넣는다. 같은 역명 그룹의 호선을 함께 조회하며, 실시간이라 업스트림 실패 시 stale 폴백 없이 502.',
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
      summary: '역 시간대별 혼잡도(1~8호선 30분 단위 통계) — 로컬 적재',
      description:
        'dayType 1 평일(기본)·2 토요일·3 휴일. 데이터가 없는 노선(9호선·광역·경전철)은 404 가 아니라 coverage:false 로 200.',
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
      summary: '두 역 간 지하철 경로 탐색 — 로컬 노선 그래프 최단경로',
      description:
        'from·to 는 stationId(lineId:역명). 연결 경로가 없으면 found:false 로 200, 없는 역은 404, 출발=도착은 400.',
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
      summary: '역 열차 시간표(1~9호선, 상·하행) — 서울 열린데이터광장, DB 30일 캐시',
      description:
        'dayType 1 평일(기본)·2 토요일·3 휴일. 1~9호선 외 노선은 coverage:false 로 200. 업스트림 실패 시 만료된 캐시가 있으면 stale 로 돌려준다.',
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
