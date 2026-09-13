import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  Routes,
  TourAdminStatus,
  TourBizCheckBody,
  TourBizCheckResult,
  TourMatchRunResult,
  TourSeedDiscoverResult,
  TourSeedList,
  TourSeedQuery,
  TourSeedRegisterBody,
  TourSeedRegisterResult,
} from '@repo/api-contract';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env.js';
import { CanonicalService } from '../canonical/canonical.service.js';
import { ProposalService } from '../canonical/proposal.service.js';
import { CrawlService } from '../crawl/crawl.service.js';
import { jobRegistry } from '../crawl/job-registry.js';
import { RestaurantService } from '../restaurant/restaurant.service.js';
import { TourAdminService, TourPlaceNotFoundError } from './tour-admin.service.js';

// 여행로그 관리자 라우트(2차) — 전부 admin. 상태·시드 목록은 로컬 DB 만, 후보 찾기·등록은 크롤 서비스(지연 생성 —
// 테스트 앱이 summaries/operationLog 플러그인 없이 상태·목록만 검증할 수 있게). 원본 행을 내는 라우트는 없다.

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../../../..');
const DEFAULT_EXPORT_DIR = resolve(REPO_ROOT, 'data/open/tour/lp-2023');

const PlaceParams = z.object({ placeId: z.string().min(1).max(40) });
const SECURITY = [{ bearerAuth: [] }];

const tourAdminRoutes: FastifyPluginAsync = async (app) => {
  const restaurants = new RestaurantService(app.prisma);
  let crawl: CrawlService | null = null;
  const service = new TourAdminService({
    prisma: app.prisma,
    restaurants,
    crawl: () => {
      if (!crawl) {
        const canonical = new CanonicalService(app.prisma);
        crawl = new CrawlService(restaurants, app.summaries, jobRegistry, new ProposalService(app.prisma, canonical), canonical, app.operationLog);
      }
      return crawl;
    },
    jobRegistry,
    serviceKey: () => env.DATA_GO_KR_API_KEY,
    exportDir: () => DEFAULT_EXPORT_DIR,
  });
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const adminOnly = [app.authenticate, app.requireAdmin];

  typed.get(Routes.Tour.adminStatus, {
    onRequest: adminOnly,
    schema: { tags: ['admin'], security: SECURITY, response: { 200: TourAdminStatus } },
    handler: async () => service.status(),
  });

  typed.get(Routes.Tour.adminSeeds, {
    onRequest: adminOnly,
    schema: { tags: ['admin'], security: SECURITY, querystring: TourSeedQuery, response: { 200: TourSeedList } },
    handler: async (req) => service.listSeeds(req.query),
  });

  typed.post(Routes.Tour.adminSeedDiscover(':placeId'), {
    onRequest: adminOnly,
    schema: { tags: ['admin'], security: SECURITY, params: PlaceParams, response: { 200: TourSeedDiscoverResult } },
    handler: async (req) => {
      try {
        return await service.discover(req.params.placeId);
      } catch (e) {
        if (e instanceof TourPlaceNotFoundError) throw app.httpErrors.notFound('여행로그 장소가 없습니다');
        throw e;
      }
    },
  });

  typed.post(Routes.Tour.adminSeedRegister(':placeId'), {
    onRequest: adminOnly,
    schema: { tags: ['admin'], security: SECURITY, params: PlaceParams, body: TourSeedRegisterBody, response: { 200: TourSeedRegisterResult } },
    handler: async (req) => {
      try {
        return await service.register(req.params.placeId, req.body.rawSourceUrl, req.user.userId);
      } catch (e) {
        if (e instanceof TourPlaceNotFoundError) throw app.httpErrors.notFound('여행로그 장소가 없습니다');
        throw e;
      }
    },
  });

  typed.post(Routes.Tour.adminMatchRun, {
    onRequest: adminOnly,
    schema: { tags: ['admin'], security: SECURITY, response: { 200: TourMatchRunResult } },
    handler: async () => service.runMatch(),
  });

  typed.post(Routes.Tour.adminBizStatusRun, {
    onRequest: adminOnly,
    schema: { tags: ['admin'], security: SECURITY, body: TourBizCheckBody, response: { 200: TourBizCheckResult } },
    handler: async (req) => service.runBizCheck(req.body),
  });
};

export default tourAdminRoutes;
