import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ErrorResponseSchema,
  RestaurantTourStats,
  Routes,
  TourDensityQuery,
  TourDensityResult,
  TourInsightsQuery,
  TourInsightsResult,
  TourLodgingResult,
  TourPlanBody,
  TourPlanResult,
  TourRegionsResult,
} from '@repo/api-contract';
import { RATE } from '../../plugins/rate-limit.js';
import { TourInsightsService } from './tour-insights.service.js';
import { TourPlanService } from './tour-plan.service.js';
import { getRestaurantTourStats } from './tour-public.service.js';
import { TourRegionService } from './tour-region.service.js';

// 여행로그 공개 라우트(4~6차·10~14차) — 맛집 상세 "여행자" 탭 집계, 인사이트(필터), 코스 추천(+일정표), 밀도 격자·숙소·지역 비교. 인증 없음,
// 로컬 DB 뿐. 응답 스키마에 여행·방문·여행자 식별자가 없고 집단 분해는 소셀 억제(서비스). 매칭 없는 식당의 tour-stats 는 404.
//
// GET 응답은 사용자와 무관하고 재적재 때만 바뀐다 → 성공 응답에만 공개 캐시 헤더(브라우저·Cloudflare 가 같은 URL 반복을 흡수 —
// 서버 집계 캐시 앞의 2차 방어선, PLAN-perf-2 D-10). 등록 맛집 링크가 길어야 5분 늦게 바뀐다. POST(코스 추천)는 엣지 캐시 대상이 아니다.
// 적재·제거 뒤 서버 집계는 곧바로 바뀌지만(tour-data-version.ts) 클라이언트가 이미 받은 사본은 길어야 5분 남는다.
const PUBLIC_CACHE_CONTROL = 'public, max-age=300';

const PlaceParams = z.object({ placeId: z.string().min(1).max(64) });

const tourPublicRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const insights = new TourInsightsService(app.prisma);
  const plans = new TourPlanService(app.prisma);
  const regions = new TourRegionService(app.prisma);

  // 6차 — 일상지도 배경 레이어(격자) / 인사이트 페이지 숙소·지역 비교 섹션.
  typed.get(Routes.Tour.publicDensity, {
    config: { rateLimit: RATE.tourRead },
    schema: {
      tags: ['tour'],
      summary: '여행자 방문 밀도 격자(0.02°) — 여행 5건 미만 칸 제외, bbox 선택(bbox 와 겹치는 칸만, 칸 값은 칸 전체 기준)',
      querystring: TourDensityQuery,
      response: { 200: TourDensityResult },
    },
    handler: async (req, reply) => {
      const out = await regions.density(req.query);
      reply.header('cache-control', PUBLIC_CACHE_CONTROL);
      return out;
    },
  });
  typed.get(Routes.Tour.publicLodging, {
    config: { rateLimit: RATE.tourRead },
    schema: {
      tags: ['tour'],
      summary: '여행 숙소 유형별 통계 — 결제액·1박 추정·예약률·만족도, 지역·연령 등 필터',
      querystring: TourInsightsQuery,
      response: { 200: TourLodgingResult },
    },
    handler: async (req, reply) => {
      const out = await regions.lodging(req.query);
      reply.header('cache-control', PUBLIC_CACHE_CONTROL);
      return out;
    },
  });
  typed.get(Routes.Tour.publicRegions, {
    config: { rateLimit: RATE.tourRead },
    schema: {
      tags: ['tour'],
      summary: '여행 지역 비교 — 시군구(제주는 제주시·서귀포·부속섬) 집단·읍면동 상위 통계',
      querystring: TourInsightsQuery,
      response: { 200: TourRegionsResult },
    },
    handler: async (req, reply) => {
      const out = await regions.regions(req.query);
      reply.header('cache-control', PUBLIC_CACHE_CONTROL);
      return out;
    },
  });

  typed.get(decodeURIComponent(Routes.Tour.publicRestaurantStats(':placeId')), {
    config: { rateLimit: RATE.tourRead },
    schema: {
      tags: ['tour'],
      summary: '맛집 여행자 방문 통계("여행자" 탭) — 집계만, 여행로그 매칭 없는 식당은 404',
      description:
        'AI 허브 여행로그(2023년 4~9월 여행자 표본) 가공 집계. 응답에 여행·방문·여행자 식별자는 없고, ' +
        '동반·연령 집단은 5건 미만이면 빠지고, 평점·지출은 표본 3건 미만·재방문율·체류는 방문 5건 미만이면 null 이다.',
      params: PlaceParams,
      response: { 200: RestaurantTourStats, 404: ErrorResponseSchema },
    },
    handler: async (req, reply) => {
      const stats = await getRestaurantTourStats(app.prisma, req.params.placeId);
      if (!stats) throw app.httpErrors.notFound('여행로그 통계가 없는 식당입니다');
      reply.header('cache-control', PUBLIC_CACHE_CONTROL);
      return stats;
    },
  });

  typed.get(Routes.Tour.publicInsights, {
    config: { rateLimit: RATE.tourRead },
    schema: {
      tags: ['tour'],
      summary: '여행 인사이트 집계 — 지역·연령·성별·동반·월·박수 필터, 여행 20건 미만이면 insufficient',
      querystring: TourInsightsQuery,
      response: { 200: TourInsightsResult },
    },
    handler: async (req, reply) => {
      const out = await insights.insights(req.query);
      reply.header('cache-control', PUBLIC_CACHE_CONTROL);
      return out;
    },
  });

  typed.post(Routes.Tour.publicPlan, {
    config: { rateLimit: RATE.tourRead },
    schema: {
      tags: ['tour'],
      summary: "비슷한 여행자 기반 코스 추천 — 추천 장소 + 일정표('전체' 를 뺀 모든 지역), 조건 부족 시 월→성별→박수→연령 순 완화",
      description:
        'AI 허브 여행로그(2023년 4~9월 여행자 표본) 가공 집계. 장소는 지역 표본 전체에서 여행 5건·평가 3건 이상인 곳만 나오고 ' +
        '(n·mean 도 지역 전체 기준), 조건이 같은 "비슷한 여행" 은 정렬 가중치로만 쓴다 — similarN·lift 는 비슷한 여행 5건 이상이 간 곳에만 채워진다. ' +
        '국세청 조회에서 폐업·휴업으로 확인된 곳은 뺀다(excludedClosed). regionTrips 는 조건과 무관하게 그 지역에 적재된 여행 수로, ' +
        '0 이면 이 서버에 그 지역 여행로그가 없어 조건을 바꿔도 결과가 비어 있다(조건이 좁아 matchedTrips 가 적은 것과 구분). itinerary 는 지역을 골랐을 때 채워지며(region=all 은 null, 후보가 모자란 지역도 null), ' +
        '흔한 하루 흐름(식사 자리와 볼거리 자리의 순서)에 추천 장소를 끼워 넣어 합성한 예시다(개별 여행의 동선이 아니다). 일수는 nights + 1(최대 5일), ' +
        '제주 밖의 지역은 일정 전체를 거점 동네 주변(지역별 거점 반경 15~40km 안)에서 짠다 — itinerary.base 가 그 동네이고, stayArea 를 주면 그곳이, ' +
        'must 를 주면 그 장소의 동네가 거점이 된다. 식당 표본이 얇은 동네는 식사 자리를 볼거리로 채워 식당이 없는 날이 있다. ' +
        'itinerary.weatherPlaceId 는 이 일정의 날씨를 볼 예보 지점(거점에서 가장 가까운 시·군·구)이다. ' +
        '이동 분·거리는 직선거리 기준 추정이고 장소 좌표는 응답에 없다. ' +
        '선택 입력: pace(하루에 들르는 곳 수 가감) · focus(유형 묶음 가중 — 목록 순위에도 반영) · transport(대중교통이면 버스 구간 기록의 이동 분과 좁은 하루 권역) · ' +
        'stayArea(응답 areas[].label 중 하나 — 가까운 동네를 앞세우고 fromStayMin·toStayMin 을 채운다) · must/avoid(꼭 넣을 곳·일정에서 뺄 곳, ' +
        '이름(+읍면동)으로 가리킨다. 못 넣은 꼭 갈 곳은 itinerary.unplaced) · wetDays(비 오는 일차 번호 — 그날은 야외 유형을 낮추고 실내에 가까운 유형을 ' +
        '앞세운다. 서버는 날씨를 조회하지 않으니 호출하는 쪽이 itinerary.weatherPlaceId 지점의 /weather/forecast·/weather/mid 로 골라 보낸다 — ' +
        '제주 밖은 일정을 한 번 받아야 지점을 알 수 있다). ' +
        '다양화(14차): fame(추천 점수에서 여행 수의 몫 — famous √n(기본) · mixed n^¼ · hidden 여행 수를 보지 않음, 목록 순위에도 반영) · ' +
        'purposes(여행 목적, 최대 3 — 그 목적의 여행이 평균보다 더 간 곳을 세게 앞세우고 그런 곳에 purposeFit 을 단다) · ' +
        'variant(다른 코스 보기, 0~99 — 0 은 점수가 가장 높은 코스, 다른 번호는 상위권 장소로 바꿔 짠 코스이고 같은 번호는 같은 결과). ' +
        '표본이 모자라 풀린 조건(relaxed)도 버리지 않고 그 조건 하나만 같은 여행의 선호를 순위에 곱한다.',
      body: TourPlanBody,
      response: { 200: TourPlanResult },
    },
    handler: async (req) => plans.plan(req.body),
  });
};

export default tourPublicRoutes;
