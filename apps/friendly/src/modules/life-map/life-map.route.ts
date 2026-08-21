import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ErrorResponseSchema,
  LifeMapDetailParams,
  LifeMapItem,
  LifeMapNearbyQuery,
  LifeMapNearbyResult,
  LifeMapPointsQuery,
  LifeMapPointsResult,
  LifeMapSearchQuery,
  LifeMapSearchResult,
  LifeMapStatusResult,
  Routes,
} from '@repo/api-contract';
import { env } from '../../config/env.js';
import { replyUpstreamError } from '../../lib/reply-upstream-error.js';
import { RATE } from '../../plugins/rate-limit.js';
import { MapSettingsService } from '../settings/map.service.js';
import { LifeMapSearchService } from './life-map-search.service.js';
import { LifeMapService } from './life-map.service.js';

// 일상지도 공개 라우트(비로그인) — 전국 CCTV·공중화장실. 로컬 DB 조회뿐이라 업스트림 에러는
// 없고, 미적재(503)·없는 항목(404)만 라우트가 직접 응답한다(전역 error-handler 는 5xx 를 500
// 으로 뭉개므로 대중교통과 같은 replyUpstreamError 경로).

const lifeMapRoutes: FastifyPluginAsync = async (app) => {
  const service = new LifeMapService({ prisma: app.prisma });
  // 지역 이동 검색 — vworld 키는 설정>지도(DB 우선 + env 폴백)에서 요청마다 읽는다(키 교체 즉시 반영).
  const mapSettings = new MapSettingsService(app.prisma, { apiKey: env.VWORLD_API_KEY, domains: env.VWORLD_DOMAINS });
  const searchService = new LifeMapSearchService({
    getKey: async () => (await mapSettings.getSecret('vworld')).apiKey,
  });
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.LifeMap.search, {
    config: { rateLimit: RATE.lifeMapSearch },
    schema: {
      tags: ['life-map'],
      querystring: LifeMapSearchQuery,
      response: { 200: LifeMapSearchResult, 502: ErrorResponseSchema, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await searchService.search(req.query.q, req.query.limit);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [502, 503], '일상지도 검색 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(Routes.LifeMap.status, {
    schema: {
      tags: ['life-map'],
      response: { 200: LifeMapStatusResult },
    },
    handler: async () => service.getStatus(),
  });

  // 뷰포트 조회 — 지도를 움직일 때마다(레이어당 1콜) 오므로 전용 프리셋으로 완만히 제한.
  typed.get(Routes.LifeMap.points, {
    config: { rateLimit: RATE.lifeMapRead },
    schema: {
      tags: ['life-map'],
      querystring: LifeMapPointsQuery,
      response: { 200: LifeMapPointsResult, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getPoints(req.query);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [503], '일상지도 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(Routes.LifeMap.nearby, {
    config: { rateLimit: RATE.lifeMapRead },
    schema: {
      tags: ['life-map'],
      querystring: LifeMapNearbyQuery,
      response: { 200: LifeMapNearbyResult, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getNearby(req.query);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [503], '일상지도 주변 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  // Routes.LifeMap.detail 은 인자를 encodeURIComponent 하므로 ':layer/:id' 플레이스홀더를
  // decode 해 등록한다(지하철 도착정보 라우트와 같은 패턴).
  typed.get(decodeURIComponent(Routes.LifeMap.detail(':layer', ':id')), {
    schema: {
      tags: ['life-map'],
      params: LifeMapDetailParams,
      response: { 200: LifeMapItem, 404: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getDetail(req.params.layer, req.params.id);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [404], '일상지도 상세 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });
};

export default lifeMapRoutes;
