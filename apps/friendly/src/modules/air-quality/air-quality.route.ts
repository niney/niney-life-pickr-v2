import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AirBadStationsResult,
  AirForecastQuery,
  AirForecastResult,
  AirNearbyQuery,
  AirNearbyResult,
  AirSidoParams,
  AirSidoRealtimeResult,
  AirStationHistoryParams,
  AirStationHistoryQuery,
  AirStationHistoryResult,
  AirStationSearchQuery,
  AirStationSearchResult,
  AirStationsResult,
  AirWeeklyForecastQuery,
  AirWeeklyForecastResult,
  ErrorResponseSchema,
  Routes,
} from '@repo/api-contract';
import { env } from '../../config/env.js';
import { replyUpstreamError } from '../../lib/reply-upstream-error.js';
import { RATE } from '../../plugins/rate-limit.js';
import { AirQualityService } from './air-quality.service.js';

// 에어코리아 대기오염정보 프록시(공개, 비로그인) — 업스트림 5개 오퍼레이션 1:1.
// error-handler 플러그인은 statusCode >= 500 을 일괄 500 으로 뭉개므로, 의미 있는
// 502(업스트림 실패)/503(키 미설정·인증·쿼터 소진)은 라우트가 직접 응답한다
// (버스/지하철과 동일 — replyUpstreamError 단일 구현). 400 은 zod 가 자동 응답.
//
// 키: DATA_GO_KR_API_KEY(data.go.kr 계정 공용 — 15073861 활용신청만 추가, env.ts 주석). 비면 503.
//
// 모두 서버 캐시(측정 10분·예보 20~60분)를 얹은 읽기 전용이지만, 캐시 미스 키
// (측정소명·날짜)를 바꿔 가며 쿼터를 태우는 남용을 막기 위해 실시간 대중교통과 같은
// 분당 60 프리셋을 건다. autoload 가 `*.route.ts` 를 자동 등록한다.

const airQualityRoutes: FastifyPluginAsync = async (app) => {
  const service = new AirQualityService({
    serviceKey: env.DATA_GO_KR_API_KEY,
  });
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // 시도별 실시간 측정정보 — 한글 경로 세그먼트라 Routes 빌더가 인코딩하므로 등록
  // 시엔 되돌린다(':sidoName' 자체는 인코딩 영향이 없지만 지하철과 같은 관례).
  typed.get(decodeURIComponent(Routes.AirQuality.sidoRealtime(':sidoName')), {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['air-quality'],
      summary: '시도별 실시간 대기오염 측정값 — 에어코리아 프록시, 10분 캐시',
      description:
        'sidoName 은 시도 약칭(서울·경기·전남광주 등)이며 "전국" 이면 전체. 업스트림 전국 조회 1콜을 캐시해 두고 요청 시도로 걸러 돌려준다(포함 매칭).',
      params: AirSidoParams,
      response: {
        200: AirSidoRealtimeResult,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getSidoRealtime(req.params.sidoName);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '대기정보 시도별 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 측정소별 실시간 측정정보(시계열) — ?term=DAILY|MONTH|3MONTH.
  typed.get(decodeURIComponent(Routes.AirQuality.stationHistory(':stationName')), {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['air-quality'],
      summary: '측정소별 대기오염 시계열(24시간·1개월·3개월) — 에어코리아 프록시, 10분 캐시',
      description:
        'term=DAILY(기본)는 최근 24시간 시간별 원본, MONTH·3MONTH 는 서버가 일평균으로 접는다. latest 에 가장 최근 시간 행(등급 포함)을 싣는다.',
      params: AirStationHistoryParams,
      querystring: AirStationHistoryQuery,
      response: {
        200: AirStationHistoryResult,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getStationHistory(req.params.stationName, req.query.term);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '대기정보 측정소 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 통합대기환경지수 나쁨 이상 측정소.
  typed.get(Routes.AirQuality.badStations, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['air-quality'],
      summary: '통합대기환경지수 나쁨 이상 측정소 목록 — 에어코리아 프록시, 10분 캐시',
      response: {
        200: AirBadStationsResult,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getBadStations();
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '대기정보 나쁨 측정소 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 대기질 예보통보 — ?date=YYYY-MM-DD(기본 오늘→전일 폴백).
  typed.get(Routes.AirQuality.forecast, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['air-quality'],
      summary: '대기질 예보통보(PM10·PM2.5·O3) — 에어코리아 프록시, 20분 캐시',
      description:
        'date(YYYY-MM-DD) 생략 시 KST 오늘이며, 당일 발표분이 아직 없으면 전일 발표분으로 1회 폴백한다. 명시한 date 는 폴백하지 않는다.',
      querystring: AirForecastQuery,
      response: {
        200: AirForecastResult,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getForecast(req.query.date);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '대기질 예보 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // ── 측정소 정보(측정소정보 API 15073877) — 좌표·주소·측정항목 ──────────
  // 전국 목록(24시간 캐시). 활용신청 전이면 503(인증 30) — 메시지에 코드가 실려
  // FE 가 신청 안내를 띄운다.
  typed.get(Routes.AirQuality.stations, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['air-quality'],
      summary: '전국 대기 측정소 목록(좌표·주소·측정항목) — 에어코리아 측정소정보, 24시간 캐시',
      response: {
        200: AirStationsResult,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getStations();
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '대기 측정소 목록 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 좌표 기반 내 주변 측정소 — 캐시 목록 거리 계산 + 현재 측정값 조인. 좌표 범위·
  // radius/limit 상한은 zod 가 400.
  typed.get(Routes.AirQuality.stationsNearby, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['air-quality'],
      summary: '좌표 기준 가까운 대기 측정소와 현재 측정값 — 거리순',
      description:
        'lat·lng(WGS84) 필수, radius 기본 10km(최대 50km)·limit 기본 5(최대 20). 캐시된 측정소 목록으로 거리를 계산하고 전국 실시간 측정값을 측정소명으로 붙인다(실시간 실패 시 measure null).',
      querystring: AirNearbyQuery,
      response: {
        200: AirNearbyResult,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getNearbyStations(
          req.query.lat,
          req.query.lng,
          req.query.radius,
          req.query.limit,
        );
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '대기 주변 측정소 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 측정소명/주소 검색 — 캐시 목록 로컬 검색(업스트림 0콜).
  typed.get(Routes.AirQuality.stationSearch, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['air-quality'],
      summary: '대기 측정소 이름·주소 검색 — 캐시 목록 로컬 검색, 상위 30건',
      querystring: AirStationSearchQuery,
      response: {
        200: AirStationSearchResult,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.searchStations(req.query.q);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '대기 측정소 검색 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 초미세먼지 주간예보 — ?date=발표일(기본 오늘→전일 폴백).
  typed.get(Routes.AirQuality.weeklyForecast, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['air-quality'],
      summary: '초미세먼지 주간예보(권역별 등급) — 에어코리아 프록시, 60분 캐시',
      description: 'date(발표일) 생략 시 KST 오늘이며, 오후 발표 전이면 전일 발표분으로 폴백한다.',
      querystring: AirWeeklyForecastQuery,
      response: {
        200: AirWeeklyForecastResult,
        502: ErrorResponseSchema,
        503: ErrorResponseSchema,
      },
    },
    handler: async (req, reply) => {
      try {
        return await service.getWeeklyForecast(req.query.date);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '초미세먼지 주간예보 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });
};

export default airQualityRoutes;
