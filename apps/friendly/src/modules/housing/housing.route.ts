import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ErrorResponseSchema,
  HousingComplexDetail,
  HousingComplexParams,
  HousingNearbyQuery,
  HousingNearbyResult,
  HousingPointsQuery,
  HousingPointsResult,
  HousingSearchQuery,
  HousingSearchResult,
  HousingStatusResult,
  HousingTradesQuery,
  HousingTradesResult,
  Routes,
} from '@repo/api-contract';
import { env } from '../../config/env.js';
import { replyUpstreamError } from '../../lib/reply-upstream-error.js';
import { RATE } from '../../plugins/rate-limit.js';
import { HousingRefreshScheduler } from './housing-refresh.service.js';
import { HousingService } from './housing.service.js';

// 집값 공개 라우트(비로그인) — 아파트 실거래가·단지. 로컬 DB 조회뿐이라 업스트림 에러는 없고, 미적재(503)·
// 없는 단지(404)만 라우트가 직접 응답한다(전역 error-handler 는 5xx 를 500 으로 뭉개므로 일상지도와 같은
// replyUpstreamError 경로). 거래 자동 갱신(월 스케줄러)은 이 플러그인이 기동·정지한다.

const housingRoutes: FastifyPluginAsync = async (app) => {
  const service = new HousingService({ prisma: app.prisma });
  const scheduler = new HousingRefreshScheduler({
    prisma: app.prisma,
    log: app.log,
    cron: env.HOUSING_REFRESH_CRON,
    months: env.HOUSING_REFRESH_MONTHS,
    serviceKey: env.DATA_GO_KR_API_KEY,
  });
  app.addHook('onReady', async () => {
    scheduler.start();
  });
  app.addHook('onClose', async () => {
    scheduler.stop();
  });
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.Housing.status, {
    schema: {
      tags: ['housing'],
      summary: '집값 데이터 적재 현황(단지·유형별 거래 건수·기간·적재 시각) — 로컬 DB',
      response: { 200: HousingStatusResult },
    },
    handler: async () => service.getStatus(),
  });

  // 뷰포트 조회 — 지도를 움직일 때마다 1콜. 일상지도와 같은 완만한 전용 프리셋.
  typed.get(Routes.Housing.points, {
    config: { rateLimit: RATE.housingRead },
    schema: {
      tags: ['housing'],
      summary: '지도 영역 안 아파트 단지 가격 배지 또는 집계 셀 — 로컬 실거래가 DB',
      description:
        'bbox 는 "minLng,minLat,maxLng,maxLat"(WGS84). zoom 13 이상이고 영역이 좁으면 단지별 점(최대 4,000개, 넘으면 truncated), 아니면 격자 집계 셀. dealType(trade·jeonse·monthly, 기본 trade)·band(all·b1~b4 전용면적 구간) 축으로 거른다. 가격 단위는 만원.',
      querystring: HousingPointsQuery,
      response: { 200: HousingPointsResult, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getPoints(req.query);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [503], '집값 지도 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(Routes.Housing.nearby, {
    config: { rateLimit: RATE.housingRead },
    schema: {
      tags: ['housing'],
      summary: '좌표 기준 주변 아파트 단지와 최근 거래가 — 로컬 실거래가 DB, 거리순',
      description:
        'lat·lng(WGS84) 필수, radius 기본 1km(최대 3km)·limit 기본 15(최대 30). dealType·band 축은 지도 조회와 같다.',
      querystring: HousingNearbyQuery,
      response: { 200: HousingNearbyResult, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getNearby(req.query);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [503], '집값 주변 단지 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(Routes.Housing.search, {
    config: { rateLimit: RATE.housingSearch },
    schema: {
      tags: ['housing'],
      summary: '아파트 단지명 검색(이전·별칭 이름 포함) — 로컬 DB, 세대수 큰 순',
      querystring: HousingSearchQuery,
      response: { 200: HousingSearchResult, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.search(req.query.q, req.query.limit);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [503], '집값 단지 검색 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // Routes.Housing.complex/trades 는 인자를 encodeURIComponent 하므로 ':id' 플레이스홀더를 decode 해 등록.
  typed.get(decodeURIComponent(Routes.Housing.complex(':id')), {
    schema: {
      tags: ['housing'],
      summary: '단지 상세(유형·면적별 거래 통계·공시가격·생활 인프라·침수 흔적) — 로컬 DB',
      params: HousingComplexParams,
      response: { 200: HousingComplexDetail, 404: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getComplex(req.params.id);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [404], '집값 단지 상세 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(decodeURIComponent(Routes.Housing.trades(':id')), {
    config: { rateLimit: RATE.housingRead },
    schema: {
      tags: ['housing'],
      summary: '단지 실거래 목록(최신 계약일 순, 페이지네이션) — 로컬 DB',
      description:
        'dealType·band 로 거르고 limit 기본 50(최대 100)·offset 으로 넘긴다. 해제된 거래는 기본 제외, includeCanceled=true 면 포함.',
      params: HousingComplexParams,
      querystring: HousingTradesQuery,
      response: { 200: HousingTradesResult, 404: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getTrades(req.params.id, req.query);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [404], '집값 거래 목록 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });
};

export default housingRoutes;
