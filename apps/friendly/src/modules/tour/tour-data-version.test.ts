import { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TourDensityResultType, TourInsightsResultType, TourLodgingResultType, TourPlanResultType, TourRegionsResultType } from '@repo/api-contract';
import { TOUR_DATASET_KEYS, tourSyncLayer } from '@repo/utils';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import prismaPlugin from '../../plugins/prisma.js';
import sensiblePlugin from '../../plugins/sensible.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { TourVersionedCache, tourDataVersion } from './tour-data-version.js';
import { TourInsightsService } from './tour-insights.service.js';
import { unloadTourTables } from './tour-master.service.js';
import tourPublicRoutes from './tour-public.route.js';

// 데이터 버전 — 공개 집계 캐시를 적재·제거(다른 프로세스)와 맞추는 장치. ① 버전에 묶인 캐시의 규칙 ② 버전 = 여행로그 네
// layer 의 가장 큰 이력 id ③ 버전을 집계보다 먼저 읽는다 ④ 떠 있는 라우트가 제거(unloadTourTables) 직후 곧바로 빈 결과를 낸다.
// 서비스별 "이력 행이 추가되면 곧바로 새 집계" 는 각 서비스 테스트에 있다.

describe('TourVersionedCache', () => {
  it('다른 버전으로 읽으면 담긴 것을 전부 버리고, 계산하는 사이에 버전이 바뀐 결과는 담지 않는다', () => {
    const cache = new TourVersionedCache<{ trips: number }>({ max: 10, ttl: 60_000 });
    expect(cache.get(0, 'a')).toBeUndefined();
    cache.set(0, 'a', { trips: 25 });
    cache.set(0, 'b', { trips: 5 });
    expect(cache.get(0, 'a')).toEqual({ trips: 25 });

    // 적재·제거로 버전이 올랐다 — 키가 달라도 전부 버린다.
    expect(cache.get(1, 'a')).toBeUndefined();
    expect(cache.get(1, 'b')).toBeUndefined();
    // 버전 0 에서 계산을 시작한 요청이 뒤늦게 담으려 해도 받지 않는다.
    cache.set(0, 'a', { trips: 25 });
    expect(cache.get(1, 'a')).toBeUndefined();
    cache.set(1, 'a', { trips: 26 });
    expect(cache.get(1, 'a')).toEqual({ trips: 26 });

    // 이력 행이 지워져 버전이 내려가도(수동 정리) 같은 규칙 — 그 버전으로 다시 채운다.
    expect(cache.get(0, 'a')).toBeUndefined();
    cache.set(0, 'a', { trips: 25 });
    expect(cache.get(0, 'a')).toEqual({ trips: 25 });
  });

  it('drop 은 담긴 것이 그 값일 때만 빼고, clear 는 버전을 그대로 둔 채 비운다', () => {
    const cache = new TourVersionedCache<object>({ max: 10, ttl: 60_000 });
    const mine = {};
    cache.set(0, 'a', mine);
    cache.drop('a', {});
    expect(cache.get(0, 'a')).toBe(mine);
    cache.drop('a', mine);
    expect(cache.get(0, 'a')).toBeUndefined();

    cache.set(0, 'a', mine);
    cache.clear();
    expect(cache.get(0, 'a')).toBeUndefined();
    cache.set(0, 'a', mine);
    expect(cache.get(0, 'a')).toBe(mine);
  });
});

const SEG = { ageGrp: '30', gender: '여', accompany: '나홀로 여행', nights: 0, month: 6 };
const TRIP_IDS = Array.from({ length: 6 }, (_, i) => `V${i}`);
const tripRow = (id: string) => ({ id, travelerLabel: id, startDate: '2023-06-01', endDate: '2023-06-01', ...SEG, nVisits: 2, nPublic: 2, nJeju: 2, nIsland: 0, nPhotos: 0, nActivities: 0, hasGps: false, spendTotal: 100000 });
const PLACES = [
  { id: 'VP-meal', name: '검증식당', typeShort: '식당', lat: 33.5115, lng: 126.52, emd: '삼도이동', bayes: 4.5, hour: 12, dgstfn: 5 },
  { id: 'VP-sight', name: '검증해변', typeShort: '자연', lat: 33.516, lng: 126.512, emd: '용담이동', bayes: 4.4, hour: 14, dgstfn: 4 },
];

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('여행로그 데이터 버전 (격리 DB)', () => {
  let isolated: IsolatedDatabase;
  let app: FastifyInstance;

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
    const p = app.prisma;

    // 제주 당일 여행 6건 — 저마다 식당 → 해변 하루, 숙박 결제 1건. 집단 하한(여행 5건)을 넘겨 다섯 라우트가 모두 무언가를 낸다.
    await p.tourTrip.createMany({ data: TRIP_IDS.map(tripRow) });
    await p.tourPlace.createMany({
      data: PLACES.map((x) => ({ id: x.id, name: x.name, typeCd: '0', typeShort: x.typeShort, lat: x.lat, lng: x.lng, sigungu: '제주시', emd: x.emd, isJeju: true, isIsland: false, nVisits: 6, nTravelers: 6, nRated: 6, meanDgstfn: x.bayes, bayesScore: x.bayes, stayMedian: 60, nPhotos: 0, spendN: 0, nActivities: 0, nLodging: 0 })),
    });
    await p.tourVisit.createMany({
      data: TRIP_IDS.flatMap((id) =>
        PLACES.map((x, i) => ({ id: `${id}:${i + 1}`, travelId: id, visitAreaId: String(i + 1), visitOrder: i + 1, dayIndex: 1, visitDate: '2023-06-01', typeCd: '0', typeShort: x.typeShort, isPrivate: false, placeId: x.id, name: x.name, lat: x.lat, lng: x.lng, sigungu: '제주시', emd: x.emd, isJeju: true, isIsland: false, dgstfn: x.dgstfn, arrivalHour: x.hour, stayMin: 60, nPhotos: 0, nActivities: 0, ...SEG })),
      ),
    });
    await p.tourSpend.createMany({
      data: TRIP_IDS.map((id) => ({ travelId: id, category: '숙박', categoryCd: 'lodge', subtypeNm: '호텔', amount: 100000, payNum: 1, perPerson: 100000, rsvtYn: 'Y', ...SEG })),
    });
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('tourDataVersion — 여행로그 네 layer 의 가장 큰 이력 id. 다른 layer 는 세지 않고, 이력이 없으면 0', async () => {
    const p = app.prisma;
    try {
      expect(await tourDataVersion(p)).toBe(0);
      await p.lifeMasterSync.createMany({ data: ['store', 'cctv', 'tourist'].map((layer) => ({ layer, count: 1 })) });
      expect(await tourDataVersion(p)).toBe(0);

      let last = 0;
      for (const key of TOUR_DATASET_KEYS) {
        const row = await p.lifeMasterSync.create({ data: { layer: tourSyncLayer(key), count: 1 } });
        const version = await tourDataVersion(p);
        expect(version).toBe(row.id);
        expect(version).toBeGreaterThan(last);
        last = version;
      }
      // 뒤이어 다른 layer 가 적재돼도 여행로그 버전은 그대로.
      await p.lifeMasterSync.create({ data: { layer: 'hospital', count: 1 } });
      expect(await tourDataVersion(p)).toBe(last);
    } finally {
      await p.lifeMasterSync.deleteMany();
    }
  });

  it('버전을 집계보다 먼저 읽는다 — 집계하는 사이에 적재가 커밋돼도 옛 결과가 새 버전의 캐시로 남지 않는다', async () => {
    const p = app.prisma;
    const reached = deferred();
    const release = deferred();
    let hold = true;
    // 여행 표를 이미 읽은 뒤 결과를 쥐고 있는 클라이언트 — "옛 데이터를 읽었고 집계는 아직 안 끝난" 요청을 만든다.
    const slow = p.$extends({
      query: {
        tourTrip: {
          async findMany({ args, query }) {
            const rows = await query(args);
            if (hold) {
              reached.resolve();
              await release.promise;
            }
            return rows;
          },
        },
      },
    }) as unknown as PrismaClient;
    const service = new TourInsightsService(slow);
    const inFlight = service.insights({ region: 'jeju' });
    await reached.promise;
    try {
      // 그 사이에 (다른 프로세스의) 적재가 커밋된다 — 여행 1건 + 이력 행.
      await p.tourTrip.create({ data: tripRow('V-late') });
      await p.lifeMasterSync.create({ data: { layer: tourSyncLayer('jeju'), count: PLACES.length } });
      hold = false;
      release.resolve();
      // 먼저 시작한 요청은 읽어 둔 옛 여행(6건)으로 끝난다.
      expect((await inFlight).scale.trips).toBe(6);
      // 다음 요청은 새 버전을 읽고 새로 집계한다(버전을 집계 뒤에 읽었다면 위의 6건이 새 버전으로 담겨 여기서도 6).
      expect((await service.insights({ region: 'jeju' })).scale.trips).toBe(7);
    } finally {
      hold = false;
      release.resolve();
      await inFlight.catch(() => undefined);
      await p.tourTrip.deleteMany({ where: { id: 'V-late' } });
      await p.lifeMasterSync.deleteMany();
    }
  });

  // 픽스처를 비우므로 이 파일의 마지막 테스트로 둔다.
  it('제거(unload:tour) 직후 — 떠 있는 라우트가 TTL 을 기다리지 않고 곧바로 빈 결과를 낸다', async () => {
    const get = async <T>(url: string): Promise<T> => {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      return res.json() as T;
    };
    const plan = async (): Promise<TourPlanResultType> => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/tour/public/plan', payload: {} });
      expect(res.statusCode).toBe(200);
      return res.json() as TourPlanResultType;
    };
    const read = async () => ({
      insights: await get<TourInsightsResultType>('/api/v1/tour/public/insights'),
      density: await get<TourDensityResultType>('/api/v1/tour/public/density?kind=all'),
      lodging: await get<TourLodgingResultType>('/api/v1/tour/public/lodging'),
      regions: await get<TourRegionsResultType>('/api/v1/tour/public/regions'),
      plan: await plan(),
    });

    // 캐시를 데운다 — 라우트가 쥔 서비스 인스턴스(운영에서 떠 있는 API 와 같은 것)가 집계·프로필을 담는다.
    const before = await read();
    expect(before.insights.scale).toMatchObject({ trips: 6, visits: 12 });
    expect(before.density.total.visits).toBe(12);
    expect(before.lodging).toMatchObject({ total: { trips: 6, withLodging: 6 }, types: [{ label: '호텔', trips: 6 }] });
    expect(before.regions.groups).toMatchObject([{ key: 'jeju-si', trips: 6, visits: 12 }]);
    expect(before.plan).toMatchObject({ regionTrips: 6, matchedTrips: 6 });
    expect(before.plan.places.map((x) => x.name)).toEqual(['검증식당', '검증해변']);
    expect(before.plan.itinerary!.days.flatMap((d) => d.stops.map((s) => s.name)).sort()).toEqual(['검증식당', '검증해변']);

    // unload:tour 는 다른 프로세스 — 다른 연결로 흉내 낸다. 서비스의 invalidate() 는 부르지 않는다.
    const other = new PrismaClient();
    try {
      await unloadTourTables(other);
    } finally {
      await other.$disconnect();
    }

    const after = await read();
    expect(after.insights).toMatchObject({ insufficient: true, scale: { trips: 0, visits: 0, places: 0 }, nights: [], typeSat: [], emd: [] });
    expect(after.density).toMatchObject({ cells: [], total: { cells: 0, visits: 0 } });
    expect(after.lodging).toMatchObject({ insufficient: true, total: { trips: 0, withLodging: 0 }, types: [] });
    expect(after.regions).toMatchObject({ insufficient: true, groups: [], emd: [] });
    expect(after.plan).toMatchObject({ regionTrips: 0, matchedTrips: 0, places: [], templates: [], itinerary: null, areas: [] });
  });
});
