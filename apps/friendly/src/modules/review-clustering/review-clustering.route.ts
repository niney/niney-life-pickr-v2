import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ReviewClusterBgInput,
  ReviewClusterBgResult,
  ReviewClusterPendingResult,
  ReviewClusterRunInput,
  ReviewClusterRunResult,
  ReviewClusterStatusList,
  ReviewClusterStatusQuery,
  ReviewClustersResult,
  Routes,
} from '@repo/api-contract';

// review-clustering 라우트 — 어드민 군집화 실행(동기) + 공개 군집 조회(읽기 전용).
// 서비스는 app 전역 singleton(plugins/summaries.ts) — 요약 훅과 같은 인스턴스.
const reviewClusteringRoutes: FastifyPluginAsync = async (app) => {
  const service = app.reviewClustering;
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const guard = { onRequest: [app.authenticate, app.requireAdmin] };
  const tags = ['review-clustering'];
  const security = [{ bearerAuth: [] }];
  const placeIdParams = z.object({ placeId: z.string() });

  // 어드민 — 식당 단위 군집화 실행. 무거운 배치(Python+LLM)지만 동기 반환(어드민 대기 허용).
  typed.post(Routes.ReviewClustering.run, {
    ...guard,
    schema: { tags, security, body: ReviewClusterRunInput, response: { 200: ReviewClusterRunResult } },
    handler: async (req) => service.runForRestaurant(req.body.restaurantId),
  });

  // ── 상태 관리 (어드민) — enrich 상태 미러링 ──────────────────────────────────
  typed.get(Routes.ReviewClustering.status, {
    ...guard,
    schema: { tags, security, querystring: ReviewClusterStatusQuery, response: { 200: ReviewClusterStatusList } },
    handler: async (req) => service.clusterStatus(req.query),
  });

  // 단건 백그라운드 군집화(즉시 반환 — Python+LLM ~수십초가 HTTP 타임아웃 안 나게). 상태는 폴링.
  typed.post(Routes.ReviewClustering.bg, {
    ...guard,
    schema: { tags, security, body: ReviewClusterBgInput, response: { 200: ReviewClusterBgResult } },
    handler: async (req) => service.clusterInBackground(req.body.restaurantId),
  });

  // 군집화 가능하나 미군집인 식당 일괄 백그라운드(순차).
  typed.post(Routes.ReviewClustering.pending, {
    ...guard,
    schema: { tags, security, response: { 200: ReviewClusterPendingResult } },
    handler: async () => service.clusterAllEligibleInBackground(),
  });

  // 공개 — 저장된 군집 조회(계산 없음, 인증 없음). 군집 없으면 ready=false.
  typed.get(Routes.ReviewClustering.publicClusters(':placeId'), {
    schema: { tags: ['public'], params: placeIdParams, response: { 200: ReviewClustersResult } },
    handler: async (req) => service.getPublicClusters(req.params.placeId),
  });
};

export default reviewClusteringRoutes;
