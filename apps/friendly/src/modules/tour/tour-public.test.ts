import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  NaverPlaceDataType,
  RestaurantPublicDetailType,
  RestaurantPublicListResultType,
  RestaurantSmartPickResultType,
  RestaurantTourStatsType,
} from '@repo/api-contract';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import sensiblePlugin from '../../plugins/sensible.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import restaurantRoutes from '../restaurant/restaurant.route.js';
import { RestaurantService } from '../restaurant/restaurant.service.js';
import tourPublicRoutes from './tour-public.route.js';
import { aggregateTourStats, tokenizeMenuDetail, toTourSummary, travelerWeight } from './tour-public.service.js';

// 여행로그 공개 층(4차) — ① 공개 상세 tour 요약(매칭 없으면 null) ② 공개 목록 tour 필드·여행자 정렬 ③ /tour-stats:
// 식별자 없는 응답·소셀 억제(동반 5명 미만 제외)·전후 장소·주문 어절·매칭 없으면 404 ④ 골라주기 traveler/balanced 가
// 리뷰 분석 없는 매칭 가게를 후보에 넣는다. 격리 DB.

const FORBIDDEN_KEYS = /^(travelId|visitAreaId|travelerLabel|photoId|travel_id|visit_area_id|traveler_label|tourPlaceId)$/;
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

const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.register(restaurantRoutes);
  await app.register(tourPublicRoutes);
  await app.ready();
  return app;
};

const placeData = (placeId: string, name: string): NaverPlaceDataType => ({
  placeId,
  name,
  category: '한식',
  address: '제주 제주시',
  roadAddress: null,
  phone: null,
  businessHours: null,
  latitude: 33.5115,
  longitude: 126.52,
  imageUrls: [],
  rating: null,
  reviewCount: null,
  menus: [],
  reviewStats: null,
  blogReviews: [],
  visitorReviews: [],
  rawSourceUrl: `https://m.place.naver.com/restaurant/${placeId}`,
});

const tourPlace = (id: string, name: string, over: Partial<{ nTravelers: number; nVisits: number; nRated: number; bayesScore: number | null; spendN: number }> = {}) => ({
  id,
  name,
  typeCd: '11',
  typeShort: '식당',
  isJeju: true,
  isIsland: false,
  lat: 33.5115,
  lng: 126.52,
  nVisits: over.nVisits ?? 8,
  nTravelers: over.nTravelers ?? 8,
  nRated: over.nRated ?? 8,
  meanDgstfn: 4.5,
  bayesScore: over.bayesScore === undefined ? 4.4 : over.bayesScore,
  revisitRate: 0.25,
  stayMedian: 60,
  spendPpMedian: 10000,
  spendN: over.spendN ?? 4,
  topReasonNm: '온라인 평가',
  nPhotos: 0,
  nActivities: 8,
  nLodging: 0,
});

describe('tour public — pure helpers', () => {
  it('요약은 평가·표본 하한 미만이면 값을 가린다', () => {
    const p = { ...tourPlace('P', 'x', { nRated: 2, nVisits: 3, spendN: 1 }), region: null, aliases: null, typeNm: null, poiId: null, roadAddr: null, lotAddr: null, sido: null, sigungu: null, emd: null, lodgingTypeNm: null, firstSeen: null, lastSeen: null, firstDayShare: null, searchText: null, meanRevisitInt: null, meanRcmdInt: null };
    const s = toTourSummary(p);
    expect(s).toMatchObject({ bayesScore: null, meanDgstfn: null, revisitRate: null, stayMedian: null, spendPpMedian: null, topReasonNm: null, nTravelers: 8 });
    expect(s.sourceNote).toContain('aihub.or.kr');
    expect(travelerWeight(4.4)).toBeCloseTo(0.85, 5);
    expect(travelerWeight(null)).toBeNull();
    expect(tokenizeMenuDetail('고사리육개장 2인분;몸국, 공기밥 /  녹두 빈대떡')).toEqual(['고사리육개장', '몸국', '공기밥', '녹두빈대떡']);
  });

  it('aggregateTourStats — 소셀 억제·시간대·전후 장소·어절·지출', () => {
    const place = { ...tourPlace('P', 'x'), region: null, aliases: null, typeNm: null, poiId: null, roadAddr: null, lotAddr: null, sido: null, sigungu: null, emd: null, lodgingTypeNm: null, firstSeen: null, lastSeen: null, firstDayShare: null, searchText: null, meanRevisitInt: null, meanRcmdInt: null };
    const visit = (i: number, accompany: string) => ({ travelId: `T${i}`, dgstfn: 5, rcmdInt: 4, revisitYn: i % 2 ? 'Y' : 'N', arrivalHour: 12, arrivalWeekday: 5, month: 6, stayMin: 60, dayIndex: 1, nights: 2, reasonNm: '온라인 평가', accompany, ageGrp: '30' });
    const s = aggregateTourStats({
      place,
      visits: [...Array.from({ length: 6 }, (_, i) => visit(i, '2인 여행(가족 외)')), visit(6, '나홀로 여행'), visit(7, '나홀로 여행')],
      activityDetails: ['고사리육개장;몸국', '고사리육개장', '몸국;사이다'],
      spend: [
        { amount: 20000, perPerson: 10000, payNum: 2, methodNm: '카드 일시불' },
        { amount: 30000, perPerson: 10000, payNum: 3, methodNm: '카드 일시불' },
        { amount: 10000, perPerson: 10000, payNum: 1, methodNm: '현금' },
      ],
      next: [
        { placeId: 'A', name: '제주공항', typeShort: '교통' },
        { placeId: 'A', name: '제주공항', typeShort: '교통' },
        { placeId: 'A', name: '제주공항', typeShort: '교통' },
        { placeId: 'B', name: '동문시장', typeShort: '상업' },
      ],
      prev: [],
      together: [
        { placeId: 'B', name: '동문시장', typeShort: '상업', travelers: 5 },
        { placeId: 'C', name: '함덕', typeShort: '자연', travelers: 2 },
      ],
      registered: new Map([['B', 'naver-B']]),
    });
    expect(s.satisfaction).toEqual([0, 0, 0, 0, 8]);
    expect(s.hours[12]).toBe(8);
    expect(s.weekdays[5]).toBe(8);
    expect(s.revisit).toEqual({ first: 4, again: 4 });
    expect(s.dayPosition).toEqual({ first: 8, mid: 0, last: 0 });
    expect(s.accompany).toEqual([{ label: '2인 여행(가족 외)', n: 6, mean: 5 }]);
    expect(s.ages).toEqual([{ label: '30대', n: 8, mean: 5 }]);
    expect(s.nextPlaces).toEqual([{ name: '제주공항', typeShort: '교통', n: 3, placeId: null }]);
    expect(s.togetherPlaces).toEqual([{ name: '동문시장', typeShort: '상업', n: 5, placeId: 'naver-B' }]);
    expect(s.menuTerms).toEqual([
      { label: '고사리육개장', n: 2 },
      { label: '몸국', n: 2 },
    ]);
    expect(s.spend).toMatchObject({ n: 3, medianPp: 10000, medianAmount: 20000, avgPayNum: 2, methods: [{ label: '카드 일시불', n: 2 }, { label: '현금', n: 1 }] });
    expect(scanKeys(s)).toEqual([]);
  });
});

describe('tour public routes (격리 DB)', () => {
  let isolated: IsolatedDatabase;
  let app: FastifyInstance;
  const MATCHED = 'tp-matched-1';
  const UNMATCHED = 'tp-unmatched-1';

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp();
    const service = new RestaurantService(app.prisma);
    const a = await service.upsertRestaurantFromCrawl(placeData(MATCHED, '우진해장국'));
    await service.upsertRestaurantFromCrawl(placeData(UNMATCHED, '분석없는집'));
    const canonicalId = (await service.getCanonicalIdForRestaurant(a.id))!;
    const p = app.prisma;
    await p.tourPlace.createMany({ data: [tourPlace('P1', '우진해장국', { nTravelers: 8, nVisits: 8 }), tourPlace('P-air', '제주국제공항')] });
    await p.restaurantTourMatch.create({ data: { canonicalId, tourPlaceId: 'P1', placeName: '우진해장국', typeShort: '식당', distM: 20, nameScore: 1, status: 'matched', matchedAt: new Date(), lastSeenAt: new Date() } });
    await p.tourVisit.createMany({
      data: Array.from({ length: 8 }, (_, i) => ({
        id: `T${i}:V1`,
        travelId: `T${i}`,
        visitAreaId: 'V1',
        visitOrder: 2,
        dayIndex: 1,
        visitDate: '2023-06-01',
        typeCd: '11',
        typeShort: '식당',
        isPrivate: false,
        placeId: 'P1',
        name: '우진해장국',
        isJeju: true,
        isIsland: false,
        dgstfn: 5,
        rcmdInt: 5,
        revisitYn: 'N',
        arrivalHour: 9,
        arrivalWeekday: 3,
        month: 6,
        stayMin: 60,
        nights: 2,
        reasonNm: '온라인 평가',
        accompany: i < 6 ? '2인 여행(가족 외)' : '나홀로 여행',
        ageGrp: '30',
        nPhotos: 0,
        nActivities: 1,
        travelerLabel: `여행자 #${i}`,
      })),
    });
    await p.tourActivity.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({ travelId: `T${i}`, visitAreaId: 'V1', placeId: 'P1', isPrivate: false, typeCd: '1', typeNm: '취식', seq: 1, detail: '고사리육개장;몸국', isJeju: true })),
    });
    await p.tourSpend.createMany({
      data: Array.from({ length: 4 }, (_, i) => ({ id: i + 1, travelId: `T${i}`, category: '활동', categoryCd: 'activity', visitAreaId: 'V1', placeId: 'P1', amount: 20000, payNum: 2, perPerson: 10000, methodNm: '카드 일시불' })),
    });
    await p.tourTransition.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({ travelId: `T${i}`, dayIndex: 1, fromVisitId: 'V1', toVisitId: 'V2', fromPlaceId: 'P1', toPlaceId: 'P-air', fromName: '우진해장국', toName: '제주국제공항', fromType: '식당', toType: '교통', sameDay: true, viaPrivate: false, bothJeju: true })),
    });
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('공개 상세 — 매칭된 식당은 tour 요약, 아니면 null. 응답에 식별자 없음', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/restaurants/public/${MATCHED}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RestaurantPublicDetailType;
    expect(body.tour).toMatchObject({ nTravelers: 8, nVisits: 8, bayesScore: 4.4, revisitRate: 0.25, spendPpMedian: 10000 });
    expect(body.tour!.sourceNote).toContain('aihub.or.kr');
    expect(scanKeys(body.tour)).toEqual([]);
    const other = (await app.inject({ method: 'GET', url: `/api/v1/restaurants/public/${UNMATCHED}` })).json() as RestaurantPublicDetailType;
    expect(other.tour).toBeNull();
  });

  it('공개 목록 — tour 필드 + 여행자 정렬(매칭 없는 행은 뒤로)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/restaurants/public?sort=tourTravelers' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RestaurantPublicListResultType;
    const ids = body.items.map((i) => i.placeId);
    expect(ids.indexOf(MATCHED)).toBeLessThan(ids.indexOf(UNMATCHED));
    expect(body.items.find((i) => i.placeId === MATCHED)!.tour).toMatchObject({ nTravelers: 8, bayesScore: 4.4 });
    expect(body.items.find((i) => i.placeId === UNMATCHED)!.tour).toBeNull();
    expect((await app.inject({ method: 'GET', url: '/api/v1/restaurants/public?sort=tourScore' })).statusCode).toBe(200);
  });

  it('tour-stats — 집계만(식별자 없음), 동반 5명 미만 제외, 전후 장소·어절·지출; 매칭 없으면 404', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/restaurants/public/${MATCHED}/tour-stats` });
    expect(res.statusCode).toBe(200);
    const s = res.json() as RestaurantTourStatsType;
    expect(scanKeys(s)).toEqual([]);
    expect(s.summary.nTravelers).toBe(8);
    expect(s.satisfaction).toEqual([0, 0, 0, 0, 8]);
    expect(s.hours[9]).toBe(8);
    expect(s.accompany).toEqual([{ label: '2인 여행(가족 외)', n: 6, mean: 5 }]);
    expect(s.nextPlaces).toEqual([{ name: '제주국제공항', typeShort: '교통', n: 3, placeId: null }]);
    expect(s.menuTerms).toEqual([
      { label: '고사리육개장', n: 3 },
      { label: '몸국', n: 3 },
    ]);
    expect(s.spend).toMatchObject({ n: 4, medianPp: 10000, medianAmount: 20000, avgPayNum: 2 });
    expect((await app.inject({ method: 'GET', url: `/api/v1/restaurants/public/${UNMATCHED}/tour-stats` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/v1/restaurants/public/nope/tour-stats' })).statusCode).toBe(404);
  });

  it('골라주기 — traveler 는 여행자 점수만, balanced 도 리뷰 분석 없는 매칭 가게를 후보에 넣는다', async () => {
    const pick = async (strategy: string) =>
      (await app.inject({ method: 'POST', url: '/api/v1/restaurants/public/smart-pick', payload: { candidatePlaceIds: [MATCHED, UNMATCHED], strategy } })).json() as RestaurantSmartPickResultType;
    for (const strategy of ['traveler', 'balanced']) {
      const r = await pick(strategy);
      expect(r.strategy).toBe(strategy);
      expect(r.candidates).toBe(2);
      expect(r.picked?.placeId).toBe(MATCHED);
      expect(r.picked?.avgTravelerScore).toBe(4.4);
      expect(r.picked?.weight).toBeCloseTo(0.85, 5);
    }
    // satisfaction 전략은 리뷰 분석이 없으면 여전히 null.
    expect((await pick('satisfaction')).picked).toBeNull();
    expect((await app.inject({ method: 'POST', url: '/api/v1/restaurants/public/smart-pick', payload: { strategy: 'nope' } })).statusCode).toBe(400);
  });
});
