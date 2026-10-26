import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ErrorResponseSchema,
  HikingAround,
  HikingConditions,
  HikingCourseDetail,
  HikingCourseParams,
  HikingImageParams,
  HikingMountainDetail,
  HikingMountainParams,
  HikingMountainsResult,
  HikingRecommendQuery,
  HikingRecommendResult,
  Routes,
} from '@repo/api-contract';
import { env } from '../../config/env.js';
import { replyUpstreamError } from '../../lib/reply-upstream-error.js';
import { RATE } from '../../plugins/rate-limit.js';
import { ForestFireService } from './forest-fire.service.js';
import { HikingAroundService } from './hiking-around.service.js';
import { HikingConditionsService } from './hiking-conditions.service.js';
import { HIKING_IMAGE_DIR, hikingImageFileName } from './hiking-master.service.js';
import { HikingRecommendError, HikingRecommendService } from './hiking-recommend.service.js';
import { HikingService } from './hiking.service.js';

// 등산 공개 라우트(비로그인) — 산·코스·주변·사진은 적재본(load:hiking)과 로컬 DB 읽기만, 업스트림 0콜. 미적재(503)·없는
// 산/코스(404)는 라우트가 직접 응답한다(error-handler 가 5xx 를 500 으로 뭉개므로 주차와 같은 replyUpstreamError 경로). 적재본은
// 배포 때만 바뀌어 산·코스·주변 응답에 1시간 공개 캐시를 단다. 사진은 적재 때 받아 둔 사본(30일 immutable).
// 오늘의 조건(conditions)·추천(recommend)만 업스트림을 캐시로 부르고(날씨·대기·산불), 항목별 실패는 200 안에서 낸다.
// docs/PLAN-hiking.md

const DATA_CACHE_CONTROL = 'public, max-age=3600';
// 조건은 서버 캐시(단기예보 다음 발표·산불 3시간·대기 매시)가 따로 있어 브라우저는 5분만.
const CONDITIONS_CACHE_CONTROL = 'public, max-age=300';
const IMAGE_CACHE_CONTROL = 'public, max-age=2592000, immutable';
const notFound = (message: string) => ({ statusCode: 404, error: 'Not Found', message });

const hikingRoutes: FastifyPluginAsync = async (app) => {
  const service = new HikingService(app.prisma);
  // 오늘의 조건 — 날씨·대기는 앱 싱글톤(각 화면과 캐시·쿼터 공유), 산불은 등산만 쓰므로 여기 하나.
  const conditions = new HikingConditionsService({
    prisma: app.prisma,
    weather: app.weather,
    air: app.airQuality,
    fire: new ForestFireService({ serviceKey: env.DATA_GO_KR_API_KEY }),
  });
  const around = new HikingAroundService(app.prisma);
  const recommend = new HikingRecommendService({ prisma: app.prisma, conditions });
  const imageDir = resolve(process.cwd(), HIKING_IMAGE_DIR);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.Hiking.recommend, {
    config: { rateLimit: RATE.hikingRecommend },
    schema: {
      tags: ['hiking'],
      summary: '오늘 어느 산 — 출발 위치·날짜·출발 시각·산행 시간·난이도·이동 수단으로 산·코스 추천(이유 문장·주의할 점), 미적재면 503',
      description:
        '100대 명산·전국 주요 봉우리 전 코스를 산행 시간 맞춤(short 3시간 안·half 반나절·day 하루)·난이도·거리(직선 × 1.3 도로, 대략 차로 시간)·해 지기 전 하산(일몰 − 예상 시간 − 30분)·이동 수단 접근(차는 들머리 근처 주차·원점회귀/왕복, 대중교통은 들머리·날머리 근처 정류장)·계절 키워드(산 소개)·100대 명산 가산으로 점수 매겨 산마다 가장 좋은 코스를 고르고, 상위 산만 오늘의 조건(날씨·산불·대기)을 받아 주의할 점까지 넣어 다시 매긴다. date 는 오늘·내일·모레(KST)만, lat/lng 를 빼면 거리를 보지 않는다.',
      querystring: HikingRecommendQuery,
      response: { 200: HikingRecommendResult, 400: ErrorResponseSchema, 503: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      try {
        const out = await recommend.recommend(req.query);
        reply.header('Cache-Control', CONDITIONS_CACHE_CONTROL);
        return out;
      } catch (e) {
        if (e instanceof HikingRecommendError && e.statusCode === 400) {
          return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: e.message });
        }
        const sent = replyUpstreamError(req, reply, e, [503], '등산 추천 실패');
        if (sent) return sent;
        throw e;
      }
    },
  });

  typed.get(Routes.Hiking.mountains, {
    config: { rateLimit: RATE.hikingRead },
    schema: {
      tags: ['hiking'],
      summary: '산 목록 — 100대 명산 + 전국 주요 봉우리(코스가 있는 곳), 정상 좌표·높이·소재지 권역·코스 수·사진 순번(적재본, 미적재면 503)',
      description:
        '100대 명산 + 코스가 있는 전국 주요 봉우리 전부(수천 곳)를 한 번에 준다(검색·권역·정렬은 클라이언트). kind 는 top100(100대 명산)·peak(전국 주요 봉우리), regions 는 시도 키(seoul·gyeonggi·gangwon …), peaks 는 100대 명산에 합친 봉우리 이름(검색용), park 는 정상이 든 국립공원 이름(행정안전부 산행안전지도 경계).',
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
      summary: '산 상세 — 소개·선정 이유·공식 코스 문구 + 코스 요약(선은 encoded polyline 조각, 국립공원 공식 코스 먼저) + 이어진 봉우리 + 국립공원 경계, 없으면 404',
      description:
        'id 는 산림청 산 코드(9자리, 100대 명산) 또는 봉우리 코드(10자리, 전국 주요 봉우리). 코스 pieces 는 조각별 encoded polyline(정밀도 1e5) — 조각 사이는 원본 기록이 끊긴 곳이다. 코스 source 가 peak 면 선·고도만 있는 자료다(지점은 근처 봉우리·등산 지점을 붙인 것). neighbors 는 정상이 서로의 코스 선 30m 안인 산. 코스 park 는 국립공원 공식 코스 문구(행정안전부 산행안전지도 원문 그대로 — source park 는 공식 탐방로 선이고 고도는 근처 GPX 에서 빌리거나 지형 고도(SRTM 30m) — park.elevationFrom, 같은 길 GPX 코스와 구간 순서가 반대면 park.reversed), parkArea 는 정상이 든 국립공원 경계(다각형마다 [바깥 고리, 구멍…] encoded polyline).',
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
      description: 'id 는 `<산 코드>-<코스 번호>` — 전국 주요 봉우리 코스는 100대 명산에 합쳐져도 `<봉우리 코드>-<번호>`, 국립공원 공식 코스는 `<산 코드>-<3000 + 공원 안 순번>`. pois 는 코스 시작에서의 거리(atM) 순(국립공원 탐방지원센터·대피소는 description 에 연락처).',
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

  typed.get(decodeURIComponent(Routes.Hiking.conditions(':id')), {
    config: { rateLimit: RATE.transitRealtime },
    schema: {
      tags: ['hiking'],
      summary: '코스 오늘의 조건 — 오늘·내일·모레 날씨(가장 높은 곳 추정 기온)·대기·산불위험예보·해 시각, 없으면 404',
      description:
        '들머리 격자의 기상청 단기예보(시각마다 topTmp = 들머리 고도 기준 100m 당 0.6°C 낮춘 추정), 가까운 대기 측정소 지금 값과 예보 권역 등급, 코스가 걸친 시군구의 산림청 산불위험예보(3시간 칸, 등급별 면적 %), 일출·일몰(계산)을 준다. 항목마다 따로 받아 하나가 실패하거나 늦으면 그 항목만 null 이고 errors 에 까닭이 실린다. 날짜·출발 시각에 따른 판단은 @repo/utils hikingConditions 규칙으로 클라이언트가 한다.',
      params: HikingCourseParams,
      response: { 200: HikingConditions, 404: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      const out = await conditions.get(req.params.id);
      if (!out) return reply.code(404).send(notFound('코스를 찾을 수 없습니다.'));
      reply.header('Cache-Control', CONDITIONS_CACHE_CONTROL);
      return out;
    },
  });

  typed.get(decodeURIComponent(Routes.Hiking.around(':id')), {
    config: { rateLimit: RATE.hikingRead },
    schema: {
      tags: ['hiking'],
      summary: '코스 주변 — 들머리(편도면 날머리도) 정류장·주차·화장실과 하산 후 맛집, 없으면 404',
      description:
        '등산 지점(GPX·등산트레킹의 교통·주차·화장실, 1km)을 먼저 놓고 버스 정류장(500m, 수도권)·지하철역(1.5km)·주차장(1.5km)·공중화장실(1km)을 더한다. 하산 후 맛집은 날머리(원점회귀·왕복은 들머리) 5km 안 크롤 맛집(refId = placeId)을, 없으면 2km 안 상가정보 음식점을 준다. 로컬 DB 만.',
      params: HikingCourseParams,
      response: { 200: HikingAround, 404: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      const out = await around.get(req.params.id);
      if (!out) return reply.code(404).send(notFound('코스를 찾을 수 없습니다.'));
      reply.header('Cache-Control', DATA_CACHE_CONTROL);
      return out;
    },
  });

  typed.get(decodeURIComponent(Routes.Hiking.gpx(':id')), {
    config: { rateLimit: RATE.hikingRead },
    schema: {
      tags: ['hiking'],
      summary: '코스 GPX 파일(GPX 1.1) — 다른 등산 앱·GPS 에 넣을 코스 선·고도·코스 지점, 없으면 404',
      description:
        '선은 코스 상세 pieces 와 같은 정리한 선(조각마다 trkseg), 고도는 고도 프로필을 선 길이 비율로 보간한 값(고도 없는 코스는 ele 없음), 코스 지점은 wpt(이름·분류·설명). metadata desc 에 원천 출처(국립공원 공식 탐방로는 공공누리 제3유형, 지형 고도는 SRTM)를 적는다. Content-Disposition 첨부 — 파일 이름은 `<산 이름> <코스 이름>.gpx`.',
      params: HikingCourseParams,
    },
    handler: async (req, reply) => {
      const out = await service.getCourseGpx(req.params.id, env.PUBLIC_ORIGIN);
      if (!out) return reply.code(404).send(notFound('코스를 찾을 수 없습니다.'));
      return reply
        .header('Cache-Control', DATA_CACHE_CONTROL)
        .header('Content-Type', 'application/gpx+xml; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="course.gpx"; filename*=UTF-8''${encodeURIComponent(out.fileName)}`)
        .send(out.gpx);
    },
  });

  typed.get(decodeURIComponent(Routes.Hiking.image(':id', ':no')), {
    config: { rateLimit: RATE.hikingRead },
    schema: {
      tags: ['hiking'],
      summary: '산 사진(JPEG, 긴 변 960px) — 산림청 산정보 사진을 적재 때 받아 둔 사본, 없으면 404',
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
