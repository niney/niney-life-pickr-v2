import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TourInsightsResultType } from '@repo/api-contract';
import { tourSyncLayer } from '@repo/utils';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import prismaPlugin from '../../plugins/prisma.js';
import sensiblePlugin from '../../plugins/sensible.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { TourInsightsService } from './tour-insights.service.js';
import tourPublicRoutes from './tour-public.route.js';

// 여행로그 인사이트(5차) — 격리 DB 에 여행 25건(주 세그먼트 20 + 소수 5)을 심고 ① 필터 없는 집계 ② 소수
// 세그먼트 필터(20건 미만 → insufficient, 5명 셀은 남음) ③ 빈 결과 ④ 적재 이력(데이터 버전)이 바뀌면 캐시를 버림
// ⑤ 라우트 응답에 식별자 없음 ⑥ 동반 허용 목록·공개 캐시 헤더 ⑦ 등록 맛집 링크는 캐시와 별개로 응답 때(PLAN-perf-2 D-2·D-10).
// 코스 추천은 tour-plan.service.test.ts(10차에 분리).

const FORBIDDEN_KEYS = /^(travelId|visitAreaId|travelerLabel|photoId|tourPlaceId)$/;
const scanKeys = (v: unknown, path: string[] = [], out: string[] = []): string[] => {
  if (Array.isArray(v)) v.forEach((x, i) => scanKeys(x, [...path, String(i)], out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.test(k)) out.push([...path, k].join('.'));
      scanKeys(x, [...path, k], out);
    }
  }
  return out;
};

const MAIN = { ageGrp: '30', gender: '여', accompany: '2인 여행(가족 외)', nights: 2, month: 6 };
const MINOR = { ageGrp: '50', gender: '남', accompany: '나홀로 여행', nights: 1, month: 8 };

describe('tour insights (격리 DB)', () => {
  let isolated: IsolatedDatabase;
  let app: FastifyInstance;
  let service: TourInsightsService;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    const fastify = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    fastify.setValidatorCompiler(validatorCompiler);
    fastify.setSerializerCompiler(serializerCompiler);
    await fastify.register(sensiblePlugin);
    await fastify.register(errorHandlerPlugin);
    await fastify.register(prismaPlugin);
    await fastify.register(tourPublicRoutes);
    await fastify.ready();
    app = fastify;
    service = new TourInsightsService(app.prisma);
    const p = app.prisma;

    const trips = [
      ...Array.from({ length: 20 }, (_, i) => ({ id: `T${i}`, ...MAIN })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `S${i}`, ...MINOR })),
    ];
    await p.tourTrip.createMany({
      data: trips.map((t) => ({
        id: t.id,
        travelerLabel: t.id,
        startDate: '2023-06-01',
        endDate: '2023-06-03',
        nights: t.nights,
        month: t.month,
        gender: t.gender,
        ageGrp: t.ageGrp,
        accompany: t.accompany,
        residenceSido: t.id.startsWith('T') ? '서울특별시' : '부산광역시',
        nVisits: 3,
        nPublic: 2,
        nJeju: 2,
        nIsland: 0,
        nPhotos: 0,
        nActivities: 0,
        hasGps: false,
        spendTotal: 120000,
      })),
    });
    await p.tourPlace.createMany({
      data: [
        { id: 'P1', name: '우진해장국', typeCd: '11', typeShort: '식당', isJeju: true, isIsland: false, sigungu: '제주시', emd: '삼도이동', nVisits: 20, nTravelers: 20, nRated: 20, nPhotos: 0, spendN: 0, nActivities: 0, nLodging: 0 },
        { id: 'P2', name: '함덕해수욕장', typeCd: '1', typeShort: '자연', isJeju: true, isIsland: false, sigungu: '제주시', emd: '조천읍', nVisits: 20, nTravelers: 20, nRated: 20, nPhotos: 0, spendN: 0, nActivities: 0, nLodging: 0 },
        { id: 'P3', name: '올래국수', typeCd: '11', typeShort: '식당', isJeju: true, isIsland: false, sigungu: '제주시', emd: '연동', nVisits: 5, nTravelers: 5, nRated: 5, nPhotos: 0, spendN: 0, nActivities: 0, nLodging: 0 },
        { id: 'P-air', name: '제주국제공항', typeCd: '9', typeShort: '교통', isJeju: true, isIsland: false, sigungu: '제주시', emd: '용담2동', nVisits: 25, nTravelers: 25, nRated: 25, nPhotos: 0, spendN: 0, nActivities: 0, nLodging: 0 },
      ],
    });
    const visit = (t: { id: string } & typeof MAIN, order: number, placeId: string, name: string, typeShort: string, dgstfn: number, emd: string) => ({
      id: `${t.id}:${order}`,
      travelId: t.id,
      visitAreaId: String(order),
      visitOrder: order,
      dayIndex: 1,
      visitDate: '2023-06-01',
      typeCd: '11',
      typeShort,
      isPrivate: false,
      placeId,
      name,
      sigungu: '제주시',
      emd,
      isJeju: true,
      isIsland: false,
      dgstfn,
      arrivalHour: typeShort === '식당' ? 12 : 15,
      stayMin: 60,
      spendPp: typeShort === '식당' ? 10000 : null,
      reasonNm: '온라인 평가',
      nPhotos: 0,
      nActivities: 0,
      gender: t.gender,
      ageGrp: t.ageGrp,
      accompany: t.accompany,
      nights: t.nights,
      month: t.month,
    });
    const visits = trips.flatMap((t) =>
      t.id.startsWith('T')
        ? [visit(t, 1, 'P-air', '제주국제공항', '교통', 5, '용담2동'), visit(t, 2, 'P1', '우진해장국', '식당', 5, '삼도이동'), visit(t, 3, 'P2', '함덕해수욕장', '자연', 4, '조천읍')]
        : [visit(t, 1, 'P-air', '제주국제공항', '교통', 5, '용담2동'), visit(t, 2, 'P3', '올래국수', '식당', 4, '연동')],
    );
    await p.tourVisit.createMany({ data: visits });
    await p.tourTransition.createMany({
      data: trips.flatMap((t) =>
        t.id.startsWith('T')
          ? [
              { travelId: t.id, dayIndex: 1, fromVisitId: '1', toVisitId: '2', fromPlaceId: 'P-air', toPlaceId: 'P1', fromName: '제주국제공항', toName: '우진해장국', fromType: '교통', toType: '식당', mvmnNm: '렌터카', travelMin: 30, sameDay: true, viaPrivate: false, bothJeju: true, ...t },
              { travelId: t.id, dayIndex: 1, fromVisitId: '2', toVisitId: '3', fromPlaceId: 'P1', toPlaceId: 'P2', fromName: '우진해장국', toName: '함덕해수욕장', fromType: '식당', toType: '자연', mvmnNm: '렌터카', travelMin: 40, sameDay: true, viaPrivate: false, bothJeju: true, ...t },
            ]
          : [{ travelId: t.id, dayIndex: 1, fromVisitId: '1', toVisitId: '2', fromPlaceId: 'P-air', toPlaceId: 'P3', fromName: '제주국제공항', toName: '올래국수', fromType: '교통', toType: '식당', mvmnNm: '택시', travelMin: 20, sameDay: true, viaPrivate: false, bothJeju: true, ...t }],
      ).map(({ id: _id, ...row }) => row),
    });
    await p.tourDaySequence.createMany({
      data: trips.map((t) => ({ id: `${t.id}:1`, travelId: t.id, dayIndex: 1, nStops: 3, typeSeq: t.id.startsWith('T') ? '교통>식당>자연' : '교통>식당>숙소', isJejuDay: true, isLastDay: false, gender: t.gender, ageGrp: t.ageGrp, accompany: t.accompany, nights: t.nights, month: t.month })),
    });
    await p.tourSpend.createMany({
      data: trips.flatMap((t, i) => [
        { id: i * 2 + 1, travelId: t.id, category: '활동', categoryCd: 'activity', amount: 20000, payNum: 2, perPerson: 10000, gender: t.gender, ageGrp: t.ageGrp, accompany: t.accompany, nights: t.nights, month: t.month },
        { id: i * 2 + 2, travelId: t.id, category: '숙박', categoryCd: 'lodge', amount: 100000, payNum: 2, perPerson: 50000, gender: t.gender, ageGrp: t.ageGrp, accompany: t.accompany, nights: t.nights, month: t.month },
      ]),
    });
    // P1 은 등록된 맛집(네이버 placeId 'n-ujin').
    await p.canonicalRestaurant.create({ data: { id: 'C-ujin', name: '우진해장국', latitude: 33.51, longitude: 126.52 } });
    await p.restaurant.create({ data: { source: 'naver', sourceId: 'n-ujin', placeId: 'n-ujin', canonicalId: 'C-ujin', name: '우진해장국', rawSourceUrl: 'https://m.place.naver.com/restaurant/1', snapshotJson: '{}' } });
    await p.restaurantTourMatch.create({ data: { canonicalId: 'C-ujin', tourPlaceId: 'P1', placeName: '우진해장국', typeShort: '식당', distM: 10, nameScore: 1, status: 'matched', matchedAt: new Date(), lastSeenAt: new Date() } });
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('필터 없음 — 규모·분포·전이·템플릿·지출·공항 다음(등록 맛집 링크)', async () => {
    const d = await service.insights({ region: 'jeju' });
    expect(d.insufficient).toBe(false);
    expect(d.scale).toMatchObject({ trips: 25, visits: 70, places: 4, restaurants: 2, spendMedian: 120000 });
    expect(d.nights).toEqual([
      { label: '1박', n: 5 },
      { label: '2박', n: 20 },
    ]);
    expect(d.months).toEqual([
      { label: '6월', n: 20 },
      { label: '8월', n: 5 },
    ]);
    expect(d.accompany).toEqual([
      { label: '2인 여행(가족 외)', n: 20, mean: 4.67 },
      { label: '나홀로 여행', n: 5, mean: 4.5 },
    ]);
    expect(d.hourType.find((h) => h.type === '식당')!.hours[12]).toBe(25);
    expect(d.typeSat.find((t) => t.type === '식당')).toMatchObject({ n: 25, mean: 4.8, stayMedian: 60, spendPpMedian: 10000 });
    expect(d.transitions.find((t) => t.from === '식당' && t.to === '자연')!.n).toBe(20);
    expect(d.templates[0]).toEqual({ label: '교통>식당>자연', n: 20 });
    expect(d.emd[0]).toMatchObject({ emd: '용담2동', n: 25 });
    expect(d.spendComposition.map((c) => c.category)).toEqual(['숙박', '활동']);
    expect(d.tripSpend).toEqual({ p10: 120000, median: 120000, p90: 120000 });
    expect(d.mvmn[0]).toMatchObject({ label: '렌터카', n: 40, medianMin: 35 });
    expect(d.airportNext).toEqual([
      { name: '우진해장국', typeShort: '', n: 20, placeId: 'n-ujin' },
      { name: '올래국수', typeShort: '', n: 5, placeId: null },
    ]);
    expect(d.residence).toEqual([
      { label: '서울특별시', n: 20 },
      { label: '부산광역시', n: 5 },
    ]);
    expect(d.ageGender).toEqual([
      { ageGrp: '30', gender: '여', n: 20 },
      { ageGrp: '50', gender: '남', n: 5 },
    ]);
    expect(scanKeys(d)).toEqual([]);
  });

  it('소수 세그먼트 필터 — 20건 미만이면 insufficient, 5명 셀은 남고 캐시는 필터별', async () => {
    const d = await service.insights({ region: 'jeju', ageGrp: '50' });
    expect(d).toMatchObject({ insufficient: true, filters: { ageGrp: '50', gender: null } });
    expect(d.scale.trips).toBe(5);
    expect(d.accompany).toEqual([{ label: '나홀로 여행', n: 5, mean: 4.5 }]);
    expect(d.typeSat.find((t) => t.type === '식당')).toMatchObject({ n: 5, mean: 4 });
    expect(d.templates).toEqual([{ label: '교통>식당>숙소', n: 5 }]);

    const none = await service.insights({ region: 'jeju', gender: '남', nights: 4 });
    expect(none.scale.trips).toBe(0);
    expect(none.insufficient).toBe(true);
    expect(none.nights).toEqual([]);
    expect(none.tripSpend).toBeNull();
  });

  it('데이터 버전 — 적재 이력 행이 추가되면 같은 인스턴스가 곧바로 새로 집계한다(이력 없이 고친 표는 TTL 대로)', async () => {
    const p = app.prisma;
    // 캐시를 데운다(필터 키 둘).
    expect((await service.insights({ region: 'jeju' })).scale.trips).toBe(25);
    expect((await service.insights({ region: 'jeju', ageGrp: '50' })).scale.trips).toBe(5);
    await p.tourTrip.create({
      data: { id: 'N0', travelerLabel: 'N0', startDate: '2023-08-01', endDate: '2023-08-02', ...MINOR, nVisits: 0, nPublic: 0, nJeju: 1, nIsland: 0, nPhotos: 0, nActivities: 0, hasGps: false },
    });
    try {
      // 이력 행이 없으면 버전이 그대로 — 캐시된 집계가 나온다.
      expect((await service.insights({ region: 'jeju' })).scale.trips).toBe(25);
      // load:tour·unload:tour(다른 프로세스)가 데이터와 같은 트랜잭션에서 남기는 이력 행 — 버전이 올라 캐시 전체가 버려진다.
      await p.lifeMasterSync.create({ data: { layer: tourSyncLayer('jeju'), count: 4 } });
      const d = await service.insights({ region: 'jeju' });
      expect(d.scale.trips).toBe(26);
      expect(d.nights).toEqual([
        { label: '1박', n: 6 },
        { label: '2박', n: 20 },
      ]);
      expect((await service.insights({ region: 'jeju', ageGrp: '50' })).scale.trips).toBe(6);
    } finally {
      await p.tourTrip.delete({ where: { id: 'N0' } });
      await p.lifeMasterSync.deleteMany();
      service.invalidate();
    }
  });

  it('라우트 — GET insights 200, 잘못된 필터 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tour/public/insights?ageGrp=30&nights=2' });
    expect(res.statusCode).toBe(200);
    const d = res.json() as TourInsightsResultType;
    expect(d.scale.trips).toBe(20);
    expect(scanKeys(d)).toEqual([]);
    expect((await app.inject({ method: 'GET', url: '/api/v1/tour/public/insights?ageGrp=70' })).statusCode).toBe(400);
  });

  it('라우트 — 동반은 허용 목록만(임의 문자열 400), 공개 캐시 헤더는 GET 성공 응답에만(POST·400 은 없음)', async () => {
    const bad = await app.inject({ method: 'GET', url: `/api/v1/tour/public/insights?accompany=${encodeURIComponent('친구랑 여행')}` });
    expect(bad.statusCode).toBe(400);
    expect(bad.headers['cache-control']).toBeUndefined();
    expect((await app.inject({ method: 'POST', url: '/api/v1/tour/public/plan', payload: { accompany: '친구랑 여행' } })).statusCode).toBe(400);

    const ok = await app.inject({ method: 'GET', url: `/api/v1/tour/public/insights?accompany=${encodeURIComponent('나홀로 여행')}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toBe('public, max-age=300');
    expect((ok.json() as TourInsightsResultType).scale.trips).toBe(5);
    const plan = await app.inject({ method: 'POST', url: '/api/v1/tour/public/plan', payload: { ageGrp: '30' } });
    expect(plan.statusCode).toBe(200);
    expect(plan.headers['cache-control']).toBeUndefined();
  });

  it('등록 맛집 링크는 응답 때 붙인다 — 매칭이 새로 생기면 캐시된 집계에도 바로 보인다', async () => {
    const before = await service.insights({ region: 'jeju' });
    expect(before.airportNext.find((x) => x.name === '올래국수')!.placeId).toBeNull();
    // 올래국수(P3)를 등록 맛집으로(네이버 placeId 'n-olle').
    await app.prisma.canonicalRestaurant.create({ data: { id: 'C-olle', name: '올래국수', latitude: 33.49, longitude: 126.49 } });
    await app.prisma.restaurant.create({ data: { source: 'naver', sourceId: 'n-olle', placeId: 'n-olle', canonicalId: 'C-olle', name: '올래국수', rawSourceUrl: 'https://m.place.naver.com/restaurant/2', snapshotJson: '{}' } });
    await app.prisma.restaurantTourMatch.create({ data: { canonicalId: 'C-olle', tourPlaceId: 'P3', placeName: '올래국수', typeShort: '식당', distM: 10, nameScore: 1, status: 'matched', matchedAt: new Date(), lastSeenAt: new Date() } });

    const after = await service.insights({ region: 'jeju' });
    expect(after.airportNext.find((x) => x.name === '올래국수')!.placeId).toBe('n-olle');
    // 집계는 다시 하지 않았다(같은 캐시 객체).
    expect(after.scale).toBe(before.scale);
  });

});
