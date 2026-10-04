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
import { WeatherServiceError } from './weather.service.js';

// 기상청 날씨 프록시(공개, 비로그인) — 단기예보 4개 + 중기예보 4개 오퍼레이션을 5개
// 읽기 엔드포인트로. 502(업스트림 실패)/503(키 미설정·인증·쿼터·쿨다운)은 라우트가 직접
// 응답(error-handler 가 5xx 를 500 으로 뭉개므로 — 대기정보와 동일). 400 은 zod + 중기
// 구역·지점 화이트리스트(서비스).
//
// 키: DATA_GO_KR_API_KEY(data.go.kr 계정 공용 — 15084084·15059468 활용신청만 추가). 비면 503.
// 서비스는 app.weather 싱글톤(plugins/weather.ts) — 식단 추천과 캐시·쿼터를 공유한다.
// 캐시 미스 키(격자·구역)를 바꿔 가며 쿼터를 태우는 남용을 막기 위해 실시간 대중교통과
// 같은 분당 60 프리셋.

// 서비스의 입력 거절(중기 화이트리스트)은 400 으로 — replyUpstreamError 는 5xx 전용 라벨이라 따로 둔다.
const asBadRequest = (e: unknown, badRequest: (msg: string) => Error): unknown =>
  e instanceof WeatherServiceError && e.statusCode === 400 ? badRequest(e.message) : e;

const weatherRoutes: FastifyPluginAsync = async (app) => {
  const service = app.weather;
  // AWS 보강(기상청 API허브) — 키가 비어 있으면 enabled=false 로 응답(503 아님, 선택 기능).
  const aws = new AwsService({ authKey: env.KMA_APIHUB_KEY });
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // AWS 방재기상관측 매분 자료 — ?lat&lng[&radius&limit]. 가장 가까운 관측소의 지금 값.
  typed.get(Routes.Weather.aws, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['weather'],
      summary: '좌표 기준 가까운 AWS 관측소의 매분 관측값 — 기상청 API허브, 2분 캐시',
      description:
        'lat·lng(WGS84) 필수, radius 기본 15km(최대 50km)·limit 기본 3(최대 10). KMA_APIHUB_KEY 가 없으면 503 이 아니라 enabled:false 빈 결과로 200.',
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
      summary: '초단기실황 + 초단기예보(격자) — 기상청 단기예보 API 프록시, 다음 발표까지 캐시',
      description:
        'nx·ny 는 기상청 동네예보 격자 좌표(위경도 아님). 새 발표분이 아직 없으면 직전 발표분으로 1회 폴백하고 fallback 플래그를 세운다.',
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
      summary: '단기예보(격자, 시간별·일별) — 기상청 단기예보 API 프록시, 다음 발표까지 캐시',
      description: 'nx·ny 는 기상청 동네예보 격자 좌표(위경도 아님). 새 발표분이 없으면 직전 발표분으로 1회 폴백한다.',
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
      summary: '현재 발표 슬롯의 예보 버전(초단기실황·초단기예보·단기예보) — 기상청 API 프록시',
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
      summary: '중기예보(육상 날씨·기온·전망 문구) — 기상청 중기예보 API 프록시, 다음 발표까지 캐시',
      description:
        'land 는 중기육상예보 구역 코드, ta 는 중기기온 지점 코드(예: 11B00000·11B10101), stn 은 중기전망 지점번호(생략 시 전망 제외). 발표분이 비면 직전 발표분으로 폴백한다. 구역·지점은 서비스 지점표에 있는 짝만 받는다(ta 는 land 구역 소속, stn 은 그 구역의 전망 지점 또는 108 전국) — 그 밖은 400.',
      querystring: WeatherMidQuery,
      response: { 200: WeatherMidResult, 502: ErrorResponseSchema, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getMid(req.query.land, req.query.ta, req.query.stn);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '중기예보 조회 실패');
        if (sent) return sent;
        throw asBadRequest(e, (m) => app.httpErrors.badRequest(m));
      }
    },
  });

  // 중기해상 — ?regId.
  typed.get(Routes.Weather.midSea, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['weather'],
      summary: '중기해상예보(해역별 날씨·파고) — 기상청 중기예보 API 프록시, 다음 발표까지 캐시',
      description: 'regId 는 중기해상예보 해역 코드 12곳(12A10000 서해북부 … 12G00000 연해주)만 받는다 — 그 밖은 400.',
      querystring: WeatherMidSeaQuery,
      response: { 200: WeatherMidSeaResult, 502: ErrorResponseSchema, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getMidSea(req.query.regId);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '중기해상예보 조회 실패');
        if (sent) return sent;
        throw asBadRequest(e, (m) => app.httpErrors.badRequest(m));
      }
    },
  });
};

export default weatherRoutes;
