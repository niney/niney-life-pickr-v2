import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ReviewClusterRunInput,
  ReviewClusterRunResult,
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

  // 공개 — 저장된 군집 조회(계산 없음, 인증 없음). 군집 없으면 ready=false.
  typed.get(Routes.ReviewClustering.publicClusters(':placeId'), {
    schema: { tags: ['public'], params: placeIdParams, response: { 200: ReviewClustersResult } },
    handler: async (req) => service.getPublicClusters(req.params.placeId),
  });
};

export default reviewClusteringRoutes;
