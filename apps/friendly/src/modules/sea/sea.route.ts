import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ErrorResponseSchema, Routes, SeaForecastQuery, SeaForecastResult, SeaTideQuery, SeaTideResult } from '@repo/api-contract';
import { env } from '../../config/env.js';
import { replyUpstreamError } from '../../lib/reply-upstream-error.js';
import { RATE } from '../../plugins/rate-limit.js';
import { SeaService } from './sea.service.js';

// 바다 예보 프록시(공개, 비로그인) — 국립해양조사원 생활해양예보지수 6종·조석예보·이안류. 502(업스트림 실패)/
// 503(키 미설정·인증·쿼터)은 라우트가 직접 응답(error-handler 가 5xx 를 500 으로 뭉개므로 — 날씨와 동일). 400 은 zod.
// 키: DATA_GO_KR_API_KEY(활용신청 8건). 캐시 미스 키(좌표·날짜)를 바꿔 가며 쿼터를 태우는 남용을 막기 위해
// 실시간 대중교통과 같은 분당 60 프리셋.

const seaRoutes: FastifyPluginAsync = async (app) => {
  const service = new SeaService({ serviceKey: env.DATA_GO_KR_API_KEY });
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // 활동별 지점 × 7일 지수 — ?activity.
  typed.get(Routes.Sea.forecast, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['sea'],
      summary: '활동별 생활해양예보지수(지점 × 7일) — 국립해양조사원 API 프록시, 1시간 캐시',
      description:
        'activity: beach 해수욕·surf 서핑·fishing 바다낚시(갯바위)·mudflat 갯벌체험·seaSplit 바닷길·seaTrip 바다여행. beach 는 6~9월에 해수욕장 이안류 최신 관측을 덧붙인다.',
      querystring: SeaForecastQuery,
      response: { 200: SeaForecastResult, 502: ErrorResponseSchema, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getForecast(req.query.activity);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '바다 예보 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // 가장 가까운 조석 예보지점의 하루 만조·간조 — ?lat&lng&date.
  typed.get(Routes.Sea.tide, {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['sea'],
      summary: '좌표에서 가장 가까운 조석 예보지점의 하루 만조·간조(물때) — 국립해양조사원, 12시간 캐시',
      description: 'lat·lng(WGS84)·date(YYYY-MM-DD) 모두 필수. 전국 조석 예보지점 166곳 중 최근접 지점을 서버가 고른다.',
      querystring: SeaTideQuery,
      response: { 200: SeaTideResult, 502: ErrorResponseSchema, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getTide(req.query.lat, req.query.lng, req.query.date);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '물때 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });
};

export default seaRoutes;
