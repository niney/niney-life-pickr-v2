import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ErrorResponseSchema,
  EvNearbyQuery,
  EvNearbyResult,
  EvPointsQuery,
  EvPointsResult,
  EvStationDetail,
  EvStationDetailParams,
  ParkingAirportsResult,
  ParkingLotDetail,
  ParkingLotDetailParams,
  ParkingLotNearbyResult,
  ParkingLotPointsQuery,
  ParkingLotPointsResult,
  ParkingNearbyQuery,
  ParkingStatusResult,
  RestaurantParkingReviews,
  Routes,
} from '@repo/api-contract';
import { env, isTest } from '../../config/env.js';
import { replyUpstreamError } from '../../lib/reply-upstream-error.js';
import { RATE } from '../../plugins/rate-limit.js';
import { EvService } from './ev.service.js';
import { EvStatusPoller } from './ev-status.service.js';
import { ParkingLiveService } from './parking-live.service.js';
import { ParkingService } from './parking.service.js';

// 주차 공개 라우트(비로그인) — 주차장·충전소는 로컬 DB, 실시간(서울 시영·공항)은 서버 폴러 메모리를 읽는다(요청 경로의
// 업스트림 0콜). 미적재(503)·없는 항목(404)은 라우트가 직접 응답(error-handler 가 5xx 를 500 으로 뭉개므로 일상지도와 같은
// replyUpstreamError 경로). 폴러: 주차 실시간 PARKING_LIVE_CRON(5분)·충전기 상태 EV_STATUS_CRON(10분) — listen 할 때만, 테스트에선 끈다.
// docs/PLAN-parking.md

const PlaceParams = z.object({ placeId: z.string().min(1).max(64) });

const parkingRoutes: FastifyPluginAsync = async (app) => {
  const live = new ParkingLiveService({
    prisma: app.prisma,
    log: app.log,
    cron: isTest ? '' : env.PARKING_LIVE_CRON,
    seoulKey: env.SEOUL_OPEN_API_KEY,
    dataGoKrKey: env.DATA_GO_KR_API_KEY,
  });
  const evPoller = new EvStatusPoller({
    prisma: app.prisma,
    log: app.log,
    cron: isTest ? '' : env.EV_STATUS_CRON,
    serviceKey: env.DATA_GO_KR_API_KEY,
  });
  const service = new ParkingService({ prisma: app.prisma, live });
  const ev = new EvService({ prisma: app.prisma });
  // 폴러는 실제로 포트를 열 때만(onListen) — export:openapi 처럼 app.ready() 만 하는 스크립트·inject 테스트에서 업스트림을
  // 부르지 않게.
  app.addHook('onListen', async () => {
    live.start();
    evPoller.start();
  });
  app.addHook('onClose', async () => {
    live.stop();
    evPoller.stop();
  });
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.Parking.status, {
    schema: {
      tags: ['parking'],
      summary: '주차 적재·실시간 폴링 상태(주차장·충전소 건수, 마지막 폴링 시각)',
      response: { 200: ParkingStatusResult },
    },
    handler: async () => service.getStatus(),
  });

  typed.get(Routes.Parking.lotPoints, {
    config: { rateLimit: RATE.parkingRead },
    schema: {
      tags: ['parking'],
      summary: '지도 영역 안 주차장 지점 또는 집계 셀 — 로컬 DB + 실시간 단계',
      description:
        'bbox 는 "minLng,minLat,maxLng,maxLat"(WGS84). zoom 13 이상이고 영역이 좁으면 개별 점(최대 3,000개, 넘으면 truncated), 아니면 격자 집계 셀. ' +
        'publicOnly·freeOnly·liveOnly(=1) 필터. 점의 level 은 실시간 연계(서울 시영) 주차장의 여유·보통·혼잡·만차, 없으면 null.',
      querystring: ParkingLotPointsQuery,
      response: { 200: ParkingLotPointsResult, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getPoints(req.query);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [503], '주차장 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(Routes.Parking.lotNearby, {
    config: { rateLimit: RATE.parkingRead },
    schema: {
      tags: ['parking'],
      summary: '좌표 기준 주변 주차장 — 거리순, 요금·운영시간·실시간 포함',
      description: 'lat·lng(WGS84) 필수, radius 기본 1km(최대 3km)·limit 기본 15(최대 30). 필터는 points 와 같다.',
      querystring: ParkingNearbyQuery,
      response: { 200: ParkingLotNearbyResult, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getNearby(req.query);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [503], '주변 주차장 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(decodeURIComponent(Routes.Parking.lotDetail(':id')), {
    config: { rateLimit: RATE.parkingRead },
    schema: {
      tags: ['parking'],
      summary: '주차장 상세 — 요금·운영시간·실시간·오늘 요일의 평소 혼잡도(이력), 없으면 404',
      params: ParkingLotDetailParams,
      response: { 200: ParkingLotDetail, 404: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await service.getDetail(req.params.id);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [404], '주차장 상세 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(Routes.Parking.evPoints, {
    config: { rateLimit: RATE.parkingRead },
    schema: {
      tags: ['parking'],
      summary: '지도 영역 안 전기차 충전소 지점 또는 집계 셀 — 로컬 DB(충전기 상태는 10분 폴러 반영)',
      description:
        'bbox·zoom 규약은 주차장과 같고 개별 점 임계 줌은 15. fastOnly(급속)·freeParkingOnly(주차료 무료)·availableOnly(사용 가능 1기 이상)·openOnly(이용자 제한 없음) 필터.',
      querystring: EvPointsQuery,
      response: { 200: EvPointsResult, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await ev.getPoints(req.query);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [503], '충전소 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(Routes.Parking.evNearby, {
    config: { rateLimit: RATE.parkingRead },
    schema: {
      tags: ['parking'],
      summary: '좌표 기준 주변 전기차 충전소 — 거리순, 사용 가능·충전 중 대수 포함',
      querystring: EvNearbyQuery,
      response: { 200: EvNearbyResult, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await ev.getNearby(req.query);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [503], '주변 충전소 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(decodeURIComponent(Routes.Parking.evDetail(':id')), {
    config: { rateLimit: RATE.parkingRead },
    schema: {
      tags: ['parking'],
      summary: '전기차 충전소 상세 — 충전기별 타입·용량·상태, 없으면 404',
      params: EvStationDetailParams,
      response: { 200: EvStationDetail, 404: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        return await ev.getDetail(req.params.id);
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [404], '충전소 상세 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(Routes.Parking.airports, {
    config: { rateLimit: RATE.parkingRead },
    schema: {
      tags: ['parking'],
      summary: '공항 주차장 실시간 — 한국공항공사 13개 공항 + 인천공항, 5분 폴링',
      description: '서버 폴러가 받은 최신 값(요청 경로 업스트림 0콜). 아직 못 받았으면 fetchedAt null·lots 빈 배열, 최근 폴링 실패면 stale=true(이전 값).',
      response: { 200: ParkingAirportsResult },
    },
    handler: async () => service.getAirports(),
  });

  typed.get(decodeURIComponent(Routes.Parking.restaurantReviews(':placeId')), {
    config: { rateLimit: RATE.parkingRead },
    schema: {
      tags: ['parking'],
      summary: '맛집 리뷰의 주차 평가 — 분석된 리뷰의 "주차" 관점 긍·부정·중립 건수와 주차 팁(가는 법 탭)',
      params: PlaceParams,
      response: { 200: RestaurantParkingReviews, 404: ErrorResponseSchema },
    },
    handler: async (req) => {
      const out = await service.getRestaurantReviews(req.params.placeId);
      if (!out) throw app.httpErrors.notFound('식당을 찾을 수 없습니다');
      return out;
    },
  });
};

export default parkingRoutes;
