import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ErrorResponseSchema,
  HikingCourseDetail,
  HikingCourseParams,
  HikingImageParams,
  HikingMountainDetail,
  HikingMountainParams,
  HikingMountainsResult,
  Routes,
} from '@repo/api-contract';
import { replyUpstreamError } from '../../lib/reply-upstream-error.js';
import { RATE } from '../../plugins/rate-limit.js';
import { HIKING_IMAGE_DIR, hikingImageFileName } from './hiking-master.service.js';
import { HikingService } from './hiking.service.js';

// 등산 공개 라우트(비로그인) — 적재본(load:hiking) 읽기만, 업스트림 0콜. 미적재(503)·없는 산/코스(404)는 라우트가 직접
// 응답한다(error-handler 가 5xx 를 500 으로 뭉개므로 주차와 같은 replyUpstreamError 경로). 적재본은 배포 때만 바뀌어
// 산·코스 응답에 1시간 공개 캐시를 단다. 사진은 적재 때 받아 둔 사본(30일 immutable — 순번이 같으면 같은 사진).
// docs/PLAN-hiking.md

const DATA_CACHE_CONTROL = 'public, max-age=3600';
const IMAGE_CACHE_CONTROL = 'public, max-age=2592000, immutable';
const notFound = (message: string) => ({ statusCode: 404, error: 'Not Found', message });

const hikingRoutes: FastifyPluginAsync = async (app) => {
  const service = new HikingService(app.prisma);
  const imageDir = resolve(process.cwd(), HIKING_IMAGE_DIR);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.Hiking.mountains, {
    config: { rateLimit: RATE.hikingRead },
    schema: {
      tags: ['hiking'],
      summary: '100대 명산 목록 — 정상 좌표·높이·소재지 권역·코스 수·사진 순번(적재본, 미적재면 503)',
      description: '산 100개를 한 번에 준다(검색·권역 필터는 클라이언트). regions 는 시도 키(seoul·gyeonggi·gangwon …).',
      response: { 200: HikingMountainsResult, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        const out = await service.listMountains();
        reply.header('Cache-Control', DATA_CACHE_CONTROL);
        return out;
      } catch (e) {
        const sent = replyUpstreamError(req, reply, e, [503], '등산 산 목록 조회 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(decodeURIComponent(Routes.Hiking.mountain(':id')), {
    config: { rateLimit: RATE.hikingRead },
    schema: {
      tags: ['hiking'],
      summary: '명산 상세 — 소개·선정 이유·공식 코스 문구 + 코스 요약(선은 encoded polyline 조각), 없으면 404',
      description:
        'id 는 산림청 산 코드(9자리). 코스 pieces 는 조각별 encoded polyline(정밀도 1e5) — 조각 사이는 원본 기록이 끊긴 곳이다.',
      params: HikingMountainParams,
      response: { 200: HikingMountainDetail, 404: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      const out = await service.getMountain(req.params.id);
      if (!out) return reply.code(404).send(notFound('산을 찾을 수 없습니다.'));
      reply.header('Cache-Control', DATA_CACHE_CONTROL);
      return out;
    },
  });

  typed.get(decodeURIComponent(Routes.Hiking.course(':id')), {
    config: { rateLimit: RATE.hikingRead },
    schema: {
      tags: ['hiking'],
      summary: '코스 상세 — 고도 프로필(20m 간격)·노면 범위·코스 지점(정상·갈림길 이정표·화장실·위험 …), 없으면 404',
      description: 'id 는 `<산 코드>-<코스 번호>`. pois 는 코스 시작에서의 거리(atM) 순.',
      params: HikingCourseParams,
      response: { 200: HikingCourseDetail, 404: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      const out = await service.getCourse(req.params.id);
      if (!out) return reply.code(404).send(notFound('코스를 찾을 수 없습니다.'));
      reply.header('Cache-Control', DATA_CACHE_CONTROL);
      return out;
    },
  });

  typed.get(decodeURIComponent(Routes.Hiking.image(':id', ':no')), {
    config: { rateLimit: RATE.hikingRead },
    schema: {
      tags: ['hiking'],
      summary: '명산 사진(JPEG, 긴 변 960px) — 산림청 산정보 사진을 적재 때 받아 둔 사본, 없으면 404',
      params: HikingImageParams,
    },
    handler: async (req, reply) => {
      // stat 뒤 스트림을 여는 사이 파일이 바뀌면 스트림 오류가 500 으로 번진다 — 먼저 연다(파노라마와 같음).
      let fh;
      try {
        fh = await open(resolve(imageDir, hikingImageFileName(req.params.id, req.params.no)), 'r');
      } catch {
        return reply.code(404).send(notFound('사진이 없습니다.'));
      }
      return reply.header('Cache-Control', IMAGE_CACHE_CONTROL).header('Content-Type', 'image/jpeg').send(fh.createReadStream());
    },
  });
};

export default hikingRoutes;
