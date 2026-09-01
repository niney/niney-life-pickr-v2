import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ErrorResponseSchema,
  Routes,
  WeatherAwsQuery,
  WeatherAwsResult,
  WeatherForecastResult,
  WeatherGridQuery,
  WeatherMidQuery,
  WeatherMidResult,
  WeatherMidSeaQuery,
  WeatherMidSeaResult,
  WeatherNowcastResult,
  WeatherVersionsResult,
} from '@repo/api-contract';
import { env } from '../../config/env.js';
import { replyUpstreamError } from '../../lib/reply-upstream-error.js';
import { RATE } from '../../plugins/rate-limit.js';
import { AwsService } from './aws.service.js';
import { WeatherService } from './weather.service.js';

// 기상청 날씨 프록시(공개, 비로그인) — 단기예보 4개 + 중기예보 4개 오퍼레이션을 5개
// 읽기 엔드포인트로. 502(업스트림 실패)/503(키 미설정·인증·쿼터)은 라우트가 직접
// 응답(error-handler 가 5xx 를 500 으로 뭉개므로 — 대기정보와 동일). 400 은 zod.
//
// 키: DATA_GO_KR_API_KEY(data.go.kr 계정 공용 — 15084084·15059468 활용신청만 추가). 비면 503.
// 캐시 미스 키(격자·구역)를 바꿔 가며 쿼터를 태우는 남용을 막기 위해 실시간 대중교통과
// 같은 분당 60 프리셋.

const weatherRoutes: FastifyPluginAsync = async (app) => {
  const service = new WeatherService({ serviceKey: env.DATA_GO_KR_API_KEY });
  // AWS 보강(기상청 API허브) — 키가 비어 있으면 enabled=false 로 응답(503 아님, 선택 기능).
  const aws = new AwsService({ authKey: env.KMA_APIHUB_KEY });
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // AWS 방재기상관측 매분 자료 — ?lat&lng[&radius&limit]. 가장 가까운 관측소의 지금 값.
  typed.get(Routes.Weather.aws, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['weather'],
      querystring: WeatherAwsQuery,
      response: { 200: WeatherAwsResult, 502: ErrorResponseSchema, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await aws.getNearby(req.query.lat, req.query.lng, req.query.radius, req.query.limit);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], 'AWS 관측 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 초단기실황 + 초단기예보 — ?nx&ny.
  typed.get(Routes.Weather.nowcast, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['weather'],
      querystring: WeatherGridQuery,
      response: { 200: WeatherNowcastResult, 502: ErrorResponseSchema, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getNowcast(req.query.nx, req.query.ny);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '날씨 실황 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 단기예보 — ?nx&ny.
  typed.get(Routes.Weather.forecast, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['weather'],
      querystring: WeatherGridQuery,
      response: { 200: WeatherForecastResult, 502: ErrorResponseSchema, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getForecast(req.query.nx, req.query.ny);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '단기예보 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 예보 버전(ODAM/VSRT/SHRT).
  typed.get(Routes.Weather.versions, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['weather'],
      response: { 200: WeatherVersionsResult, 502: ErrorResponseSchema, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getVersions();
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '예보 버전 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 중기육상 + 중기기온 + 중기전망 — ?land&ta[&stn].
  typed.get(Routes.Weather.mid, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['weather'],
      querystring: WeatherMidQuery,
      response: { 200: WeatherMidResult, 502: ErrorResponseSchema, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getMid(req.query.land, req.query.ta, req.query.stn);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '중기예보 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 중기해상 — ?regId.
  typed.get(Routes.Weather.midSea, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['weather'],
      querystring: WeatherMidSeaQuery,
      response: { 200: WeatherMidSeaResult, 502: ErrorResponseSchema, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getMidSea(req.query.regId);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '중기해상예보 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });
};

export default weatherRoutes;
