import { createReadStream } from 'node:fs';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  Routes,
  TourRawActivitiesResult,
  TourRawPageQuery,
  TourRawPhotosResult,
  TourRawSpendResult,
  TourRawTripDetail,
  TourRawTripsResult,
  TourRawVisitsResult,
} from '@repo/api-contract';
import { env } from '../../config/env.js';
import { TOUR_PHOTO_SIZES, TourRawService, parseTourRawAllowlist } from './tour-raw.service.js';

// 여행로그 원본 열람 라우트(3차) — admin 이면서 TOUR_RAW_USER_IDS allowlist(user id 또는 이메일, 쉼표)에 든 사용자만. 밖이면
// 존재를 알리지 않게 404. 운영자가 이메일을 적는 게 자연스러워 둘 다 받는다(이메일은 대소문자 무시).
// 응답은 전부 private·no-store·noindex(플러그인 스코프 onSend 훅 — 이 파일의 라우트에만 걸린다). 사진은 <img> 가 헤더를 못
// 싣는 문제로 SSE 와 같은 ?token= 도 받는다(resolveSseAdmin). 원본 재배포·국외 반출 금지 — docs/PLAN-tour-log.md.

export interface TourRawRouteOptions {
  // 테스트용 — 비우면 env.TOUR_RAW_USER_IDS.
  allowlist?: string[];
}

const PlaceParams = z.object({ placeId: z.string().min(1).max(40) });
const TripParams = z.object({ travelId: z.string().min(1).max(40) });
const PhotoParams = z.object({ photoId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), size: z.enum(TOUR_PHOTO_SIZES) });
const PhotoQuery = z.object({ token: z.string().optional() });
const SECURITY = [{ bearerAuth: [] }];

const tourRawRoutes: FastifyPluginAsync<TourRawRouteOptions> = async (app, opts) => {
  const allowlist = opts.allowlist ? new Set(opts.allowlist) : parseTourRawAllowlist(env.TOUR_RAW_USER_IDS);
  const service = new TourRawService(app.prisma);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  const isAllowed = (userId: string, email: string | null | undefined): boolean =>
    allowlist.has(userId) || (!!email && (allowlist.has(email) || allowlist.has(email.toLowerCase())));
  const requireTourRaw = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isAllowed(req.user.userId, req.user.email)) return reply.notFound('Not found');
  };
  const guarded = [app.authenticate, app.requireAdmin, requireTourRaw];

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('Cache-Control', 'private, no-store');
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    return payload;
  });

  const ensurePlace = async (placeId: string): Promise<void> => {
    if (!(await service.placeExists(placeId))) throw app.httpErrors.notFound('여행로그 장소가 없습니다');
  };

  typed.get(decodeURIComponent(Routes.Tour.adminPlaceVisits(':placeId')), {
    onRequest: guarded,
    schema: { tags: ['admin'], security: SECURITY, params: PlaceParams, querystring: TourRawPageQuery, response: { 200: TourRawVisitsResult } },
    handler: async (req) => {
      await ensurePlace(req.params.placeId);
      return service.listVisits(req.params.placeId, req.query);
    },
  });

  typed.get(decodeURIComponent(Routes.Tour.adminPlaceActivities(':placeId')), {
    onRequest: guarded,
    schema: { tags: ['admin'], security: SECURITY, params: PlaceParams, querystring: TourRawPageQuery, response: { 200: TourRawActivitiesResult } },
    handler: async (req) => {
      await ensurePlace(req.params.placeId);
      return service.listActivities(req.params.placeId, req.query);
    },
  });

  typed.get(decodeURIComponent(Routes.Tour.adminPlaceSpend(':placeId')), {
    onRequest: guarded,
    schema: { tags: ['admin'], security: SECURITY, params: PlaceParams, querystring: TourRawPageQuery, response: { 200: TourRawSpendResult } },
    handler: async (req) => {
      await ensurePlace(req.params.placeId);
      return service.listSpend(req.params.placeId, req.query);
    },
  });

  typed.get(decodeURIComponent(Routes.Tour.adminPlacePhotos(':placeId')), {
    onRequest: guarded,
    schema: { tags: ['admin'], security: SECURITY, params: PlaceParams, querystring: TourRawPageQuery, response: { 200: TourRawPhotosResult } },
    handler: async (req) => {
      await ensurePlace(req.params.placeId);
      return service.listPhotos(req.params.placeId, req.query);
    },
  });

  typed.get(decodeURIComponent(Routes.Tour.adminPlaceTrips(':placeId')), {
    onRequest: guarded,
    schema: { tags: ['admin'], security: SECURITY, params: PlaceParams, querystring: TourRawPageQuery, response: { 200: TourRawTripsResult } },
    handler: async (req) => {
      await ensurePlace(req.params.placeId);
      return service.listTrips(req.params.placeId, req.query);
    },
  });

  typed.get(decodeURIComponent(Routes.Tour.adminTrip(':travelId')), {
    onRequest: guarded,
    schema: { tags: ['admin'], security: SECURITY, params: TripParams, response: { 200: TourRawTripDetail } },
    handler: async (req) => {
      const trip = await service.getTrip(req.params.travelId);
      if (!trip) throw app.httpErrors.notFound('여행이 없습니다');
      return trip;
    },
  });

  // 썸네일 파일 — Authorization 헤더 또는 ?token= (둘 다 tokenVersion·role 확인). allowlist 밖·없는 파일은 404.
  // 빌더는 인자를 인코딩하므로(LifeMap.detail 과 같은 규약) 등록부에서 :param 을 되돌린다.
  typed.get(decodeURIComponent(Routes.Tour.adminPhoto(':photoId', ':size')), {
    schema: { tags: ['admin'], security: SECURITY, params: PhotoParams, querystring: PhotoQuery },
    handler: async (req, reply) => {
      const admin = await app.resolveSseAdmin(req);
      if (!admin) return reply.notFound('Not found');
      // resolveSseAdmin 은 id·role 만 준다 — 이메일 allowlist 는 DB 에서 한 번 더 본다(allowlist 라우트뿐이라 부담 없음).
      const email = allowlist.has(admin.userId) ? null : (await app.prisma.user.findUnique({ where: { id: admin.userId }, select: { email: true } }))?.email;
      if (!isAllowed(admin.userId, email)) return reply.notFound('Not found');
      const path = await service.photoPath(req.params.photoId, req.params.size);
      if (!path) return reply.notFound('Not found');
      return reply.type('image/webp').send(createReadStream(path));
    },
  });
};

export default tourRawRoutes;
