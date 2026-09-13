import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TourDensityResultType, TourLodgingResultType, TourRegionsResultType } from '@repo/api-contract';
import { TOUR_DENSITY_CELL_DEG } from '@repo/utils';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import prismaPlugin from '../../plugins/prisma.js';
import sensiblePlugin from '../../plugins/sensible.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import tourPublicRoutes from './tour-public.route.js';
import { TourRegionService } from './tour-region.service.js';

// 6차 밀도·숙소·지역 비교 — 격리 DB 에 여행 28건(주 세그먼트 20 · 부속섬 5 · 억제 대상 3)을 심고 ① 격자(여행 5건 미만 칸
// 제외, kind=restaurant, bbox) ② 숙소 유형별 1박 추정·예약률·만족도 ③ 3집단 + 읍면동 ④ 라우트 200/400 + 응답 키 스캔.

const FORBIDDEN_KEYS = /^(travelId|visitAreaId|travelerLabel|photoId|tourPlaceId|placeId)$/;
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

const cellOf = (lng: number, lat: number) => ({ x: Math.floor(lng / TOUR_DENSITY_CELL_DEG), y: Math.floor(lat / TOUR_DENSITY_CELL_DEG) });
// 칸: A 식당(제주시 삼도이동) · B 자연(서귀포시 안덕면) · C 식당(우도 — 부속섬) · D 억제(여행 3건).
const A = { lng: 126.521, lat: 33.513 };
const B = { lng: 126.331, lat: 33.251 };
const C = { lng: 126.951, lat: 33.501 };
const D = { lng: 126.421, lat: 33.451 };

const MAIN = { ageGrp: '30', gender: '여', accompany: '2인 여행(가족 외)', nights: 2, month: 6 };
const MINOR = { ageGrp: '50', gender: '남', accompany: '나홀로 여행', nights: 1, month: 8 };

describe('tour density / lodging / regions (격리 DB)', () => {
  let isolated: IsolatedDatabase;
  let app: FastifyInstance;
  let service: TourRegionService;

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
    service = new TourRegionService(app.prisma);
    const p = app.prisma;

    const trips = [
      ...Array.from({ length: 20 }, (_, i) => ({ id: `T${i}`, ...MAIN })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `S${i}`, ...MINOR })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `X${i}`, ...MAIN })),
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
        nVisits: 3,
        nPublic: 3,
        nJeju: 3,
        nIsland: 0,
        nPhotos: 0,
        nActivities: 0,
        hasGps: false,
      })),
    });
    type Trip = (typeof trips)[number];
    const visit = (t: Trip, order: number, o: { name: string; typeShort: string; dgstfn: number; sigungu: string; emd: string; isIsland?: boolean; at: { lng: number; lat: number }; lodgingTypeNm?: string; stayMin?: number; spendPp?: number }) => ({
      id: `${t.id}:${order}`,
      travelId: t.id,
      visitAreaId: String(order),
      visitOrder: order,
      visitDate: '2023-06-01',
      typeCd: '11',
      typeShort: o.typeShort,
      isPrivate: false,
      placeId: `P-${o.name}`,
      name: o.name,
      lat: o.at.lat,
      lng: o.at.lng,
      sigungu: o.sigungu,
      emd: o.emd,
      isJeju: true,
      isIsland: o.isIsland ?? false,
      dgstfn: o.dgstfn,
      lodgingTypeNm: o.lodgingTypeNm ?? null,
      stayMin: o.stayMin ?? 60,
      spendPp: o.spendPp ?? null,
      nPhotos: 0,
      nActivities: 0,
      gender: t.gender,
      ageGrp: t.ageGrp,
      accompany: t.accompany,
      nights: t.nights,
      month: t.month,
    });
    await p.tourVisit.createMany({
      data: trips.flatMap((t) =>
        t.id.startsWith('T')
          ? [
              visit(t, 1, { name: '우진해장국', typeShort: '식당', dgstfn: 5, sigungu: '제주시', emd: '삼도이동', at: A, spendPp: 10000, stayMin: 50 }),
              visit(t, 2, { name: '산방산', typeShort: '자연', dgstfn: 4, sigungu: '서귀포시', emd: '안덕면', at: B, stayMin: 90 }),
              visit(t, 3, { name: '제주호텔', typeShort: '숙소', dgstfn: 4, sigungu: '제주시', emd: '연동', at: A, lodgingTypeNm: '호텔' }),
            ]
          : t.id.startsWith('S')
            ? [
                visit(t, 1, { name: '우도땅콩', typeShort: '식당', dgstfn: 4, sigungu: '제주시', emd: '우도면', isIsland: true, at: C, spendPp: 8000 }),
                visit(t, 2, { name: '펜션', typeShort: '숙소', dgstfn: 5, sigungu: '제주시', emd: '우도면', isIsland: true, at: C, lodgingTypeNm: '펜션' }),
              ]
            : [visit(t, 1, { name: '억제칸', typeShort: '자연', dgstfn: 3, sigungu: '제주시', emd: '애월읍', at: D })],
      ),
    });
    // 숙박 결제 — 주 20건: 호텔 20만 원(2박, 예약 Y) → 1박 10만 · 1인 10만. 소수 5건: 펜션 15만(1박, 예약 N) + 금액 0 행(무시).
    await p.tourSpend.createMany({
      data: trips.flatMap((t, i) =>
        t.id.startsWith('T')
          ? [{ id: i * 10 + 1, travelId: t.id, category: '숙박', categoryCd: 'lodge', subtypeNm: '호텔', amount: 200000, payNum: 2, perPerson: 100000, rsvtYn: 'Y', gender: t.gender, ageGrp: t.ageGrp, accompany: t.accompany, nights: t.nights, month: t.month }]
          : t.id.startsWith('S')
            ? [
                { id: i * 10 + 1, travelId: t.id, category: '숙박', categoryCd: 'lodge', subtypeNm: '펜션', amount: 150000, payNum: 1, perPerson: 150000, rsvtYn: 'N', gender: t.gender, ageGrp: t.ageGrp, accompany: t.accompany, nights: t.nights, month: t.month },
                { id: i * 10 + 2, travelId: t.id, category: '숙박', categoryCd: 'lodge', subtypeNm: '펜션', amount: 0, payNum: 1, perPerson: 0, rsvtYn: 'N', gender: t.gender, ageGrp: t.ageGrp, accompany: t.accompany, nights: t.nights, month: t.month },
              ]
            : [],
      ),
    });
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('밀도 격자 — 여행 5건 미만 칸 제외, kind=restaurant 는 식당만, bbox 로 자른다', async () => {
    const all = await service.density({ kind: 'all' });
    expect(all.cellDeg).toBe(TOUR_DENSITY_CELL_DEG);
    const a = cellOf(A.lng, A.lat);
    const b = cellOf(B.lng, B.lat);
    const c = cellOf(C.lng, C.lat);
    expect(all.cells).toEqual([
      { ...a, n: 40, travelers: 20 },
      { ...b, n: 20, travelers: 20 },
      { ...c, n: 10, travelers: 5 },
    ]);
    expect(all.total).toEqual({ cells: 3, visits: 70 });
    expect(all.breaks).toHaveLength(4);
    expect(scanKeys(all)).toEqual([]);

    const rest = await service.density({ kind: 'restaurant' });
    expect(rest.cells).toEqual([
      { ...a, n: 20, travelers: 20 },
      { ...c, n: 5, travelers: 5 },
    ]);

    const boxed = await service.density({ kind: 'all', bbox: '126.3,33.2,126.4,33.3' });
    expect(boxed.cells).toEqual([{ ...b, n: 20, travelers: 20 }]);
  });

  it('숙소 — 유형별 결제·1박 추정·1인·예약률·만족도, 필터, 여행 5건 미만 유형 제외', async () => {
    const d = await service.lodging({ region: 'jeju' });
    expect(d.insufficient).toBe(false);
    expect(d.total).toEqual({ trips: 28, withLodging: 25, rsvtRate: 0.67 });
    expect(d.types).toEqual([
      { label: '호텔', n: 20, trips: 20, amountMedian: 200000, nightlyMedian: 100000, perPersonMedian: 100000, rsvtRate: 1, visits: 20, mean: 4 },
      { label: '펜션', n: 5, trips: 5, amountMedian: 150000, nightlyMedian: 150000, perPersonMedian: 150000, rsvtRate: 0, visits: 5, mean: 5 },
    ]);
    const minor = await service.lodging({ region: 'jeju', ageGrp: '50' });
    expect(minor.insufficient).toBe(true);
    expect(minor.types.map((t) => t.label)).toEqual(['펜션']);
    expect(scanKeys(d)).toEqual([]);
  });

  it('지역 비교 — 제주시·서귀포시·부속섬 3집단 + 읍면동(5건 이상)', async () => {
    const d = await service.regions({ region: 'jeju' });
    expect(d.insufficient).toBe(false);
    expect(d.groups.map((g) => [g.key, g.trips, g.visits, g.share, g.mean, g.restaurants, g.restaurantMean, g.stayMedian, g.spendPpMedian])).toEqual([
      ['jeju-si', 23, 43, 0.589, 4.4, 20, 5, 60, 10000],
      ['seogwipo', 20, 20, 0.274, 4, 0, null, 90, null],
      ['island', 5, 10, 0.137, 4.5, 5, 4, 60, 8000],
    ]);
    expect(d.groups[0]!.topTypes).toEqual([
      { label: '숙소', n: 20 },
      { label: '식당', n: 20 },
      { label: '자연', n: 3 },
    ].filter((x) => x.n >= 5));
    expect(d.groups[0]!.topEmd).toEqual([
      { label: '삼도이동', n: 20 },
      { label: '연동', n: 20 },
    ]);
    expect(d.emd.map((e) => [e.emd, e.island, e.n, e.restaurants])).toEqual([
      ['삼도이동', false, 20, 20],
      ['안덕면', false, 20, 0],
      ['연동', false, 20, 0],
      ['우도면', true, 10, 5],
    ]);
    expect(scanKeys(d)).toEqual([]);
  });

  it('라우트 — density/lodging/regions 200, 잘못된 kind 400', async () => {
    const den = await app.inject({ method: 'GET', url: '/api/v1/tour/public/density?kind=restaurant' });
    expect(den.statusCode).toBe(200);
    expect((den.json() as TourDensityResultType).cells).toHaveLength(2);
    expect((await app.inject({ method: 'GET', url: '/api/v1/tour/public/density?kind=hotel' })).statusCode).toBe(400);

    const lod = await app.inject({ method: 'GET', url: '/api/v1/tour/public/lodging?ageGrp=30' });
    expect(lod.statusCode).toBe(200);
    expect((lod.json() as TourLodgingResultType).types[0]!.label).toBe('호텔');

    const reg = await app.inject({ method: 'GET', url: '/api/v1/tour/public/regions' });
    expect(reg.statusCode).toBe(200);
    const body = reg.json() as TourRegionsResultType;
    expect(body.groups).toHaveLength(3);
    expect(scanKeys(body)).toEqual([]);
  });
});
