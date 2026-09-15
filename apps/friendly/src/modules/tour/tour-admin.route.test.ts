import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TourAdminStatusType, TourMatchRunResultType, TourSeedListType } from '@repo/api-contract';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import sensiblePlugin from '../../plugins/sensible.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import tourAdminRoutes from './tour-admin.route.js';

// 여행로그 관리자 라우트 — 권한 경계(비로그인·일반 회원 차단), 상태, 시드 목록 필터(지역·상태·검색·페이지), 매칭 실행.
// 네이버 검색·등록·국세청 조회는 외부 호출이라 여기서 부르지 않는다(서비스 단위 테스트가 목으로 검증).

const STATUS_URL = '/api/v1/admin/tour/status';
const SEEDS_URL = '/api/v1/admin/tour/seeds';
const MATCH_URL = '/api/v1/admin/tour/match/run';

const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.register(tourAdminRoutes);
  await app.ready();
  await seedAuthUsers(app, [
    { id: 'admin-test', role: 'ADMIN' },
    { id: 'user-test', role: 'USER' },
  ]);
  return app;
};

const place = (id: string, name: string, over: Partial<{ typeShort: string; isJeju: boolean; nTravelers: number; lat: number; lng: number }> = {}) => ({
  id,
  name,
  typeCd: '11',
  typeShort: over.typeShort ?? '식당',
  isJeju: over.isJeju ?? true,
  isIsland: false,
  lat: over.lat ?? 33.4996,
  lng: over.lng ?? 126.5312,
  nVisits: 20,
  nTravelers: over.nTravelers ?? 10,
  nRated: 20,
  bayesScore: 4.3,
  spendPpMedian: 9000,
  nPhotos: 0,
  spendN: 5,
  nActivities: 20,
  nLodging: 0,
  roadAddr: '제주특별자치도 제주시 서사로 11',
  sigungu: '제주시',
  emd: '삼도이동',
});

describe('tour admin routes', () => {
  let isolated: IsolatedDatabase;
  let app: FastifyInstance;
  let adminAuth: { authorization: string };
  let userAuth: { authorization: string };

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp();
    adminAuth = { authorization: `Bearer ${app.jwt.sign({ userId: 'admin-test', email: 'a@x.com', role: 'ADMIN' })}` };
    userAuth = { authorization: `Bearer ${app.jwt.sign({ userId: 'user-test', email: 'u@x.com', role: 'USER' })}` };
    await app.prisma.tourPlace.createMany({
      data: [
        place('P-ujin', '우진해장국', { nTravelers: 110 }),
        place('P-jamae', '자매국수', { nTravelers: 57, lat: 33.4985, lng: 126.4591 }),
        place('P-few', '동네식당', { nTravelers: 2 }),
        place('P-seoul', '서울식당', { isJeju: false, nTravelers: 30 }),
        place('P-nature', '함덕해수욕장', { typeShort: '자연', nTravelers: 200 }),
      ],
    });
    await app.prisma.canonicalRestaurant.create({ data: { id: 'C-ujin', name: '우진해장국', latitude: 33.4997, longitude: 126.5312 } });
    await app.prisma.restaurant.create({
      data: { source: 'naver', sourceId: 'n-ujin', placeId: 'n-ujin', canonicalId: 'C-ujin', name: '우진해장국', rawSourceUrl: 'https://m.place.naver.com/restaurant/1', snapshotJson: '{}' },
    });
    await app.prisma.tourPlaceBizStatus.create({ data: { placeId: 'P-jamae', brno: '2222222222', bStt: '폐업자', endDt: '2024-03-01', checkedAt: new Date('2026-09-13T00:00:00Z') } });
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('비로그인 401, 일반 회원 403 — :placeId 라우트(발굴·등록)도 등록돼 있다', async () => {
    expect((await app.inject({ method: 'GET', url: STATUS_URL })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: STATUS_URL, headers: userAuth })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: SEEDS_URL, headers: userAuth })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: MATCH_URL, headers: userAuth })).statusCode).toBe(403);
    // 빌더가 인코딩한 ':placeId' 를 등록부에서 되돌리지 않으면 404 가 난다 — 권한 단계(403)까지 닿는지로 고정.
    expect((await app.inject({ method: 'POST', url: `${SEEDS_URL}/P-ujin/discover`, headers: userAuth })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `${SEEDS_URL}/P-ujin/register`, headers: userAuth, payload: { rawSourceUrl: 'https://m.place.naver.com/restaurant/1' } })).statusCode).toBe(403);
  });

  it('상태 — 적재 이력이 없으면 loaded=false 이지만 표 건수·시드 수는 보인다', async () => {
    const res = await app.inject({ method: 'GET', url: STATUS_URL, headers: adminAuth });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TourAdminStatusType;
    expect(body.loaded).toBe(false);
    expect(body.counts.places).toBe(5);
    // 시드는 데이터셋 무관 전체 식당류 — 서울식당(30명, 비제주)이 포함돼 3곳 → 4곳, 5명↑ 3곳.
    expect(body.seeds).toMatchObject({ restaurants: 4, t5: 3, t3: 3, unmatchedT5: 3 });
    expect(body.match).toMatchObject({ matched: 0, missing: 0, candidates: 1 });
    expect(body.biz).toMatchObject({ checked: 1, closed: 1 });
  });

  it('매칭 실행 → 시드 목록 필터(미매칭·매칭됨·폐업·검색·지역·페이지)', async () => {
    const run = await app.inject({ method: 'POST', url: MATCH_URL, headers: adminAuth });
    expect(run.statusCode).toBe(200);
    expect(run.json() as TourMatchRunResultType).toMatchObject({ scanned: 1, created: 1 });

    const all = (await app.inject({ method: 'GET', url: `${SEEDS_URL}?status=all&minTravelers=5`, headers: adminAuth })).json() as TourSeedListType;
    expect(all.total).toBe(2);
    expect(all.items.map((i) => i.placeId)).toEqual(['P-ujin', 'P-jamae']);
    expect(all.items[0]!.match).toMatchObject({ canonicalId: 'C-ujin', naverPlaceId: 'n-ujin', restaurantName: '우진해장국', status: 'matched' });
    expect(all.items[1]!.match).toBeNull();
    expect(all.items[1]!.biz).toMatchObject({ bStt: '폐업자', endDt: '2024-03-01', brno: '2222222222' });

    const unmatched = (await app.inject({ method: 'GET', url: `${SEEDS_URL}?status=unmatched`, headers: adminAuth })).json() as TourSeedListType;
    expect(unmatched.items.map((i) => i.placeId)).toEqual(['P-jamae']);
    const matched = (await app.inject({ method: 'GET', url: `${SEEDS_URL}?status=matched`, headers: adminAuth })).json() as TourSeedListType;
    expect(matched.items.map((i) => i.placeId)).toEqual(['P-ujin']);
    const closed = (await app.inject({ method: 'GET', url: `${SEEDS_URL}?status=closed`, headers: adminAuth })).json() as TourSeedListType;
    expect(closed.items.map((i) => i.placeId)).toEqual(['P-jamae']);
    const q = (await app.inject({ method: 'GET', url: `${SEEDS_URL}?q=${encodeURIComponent('국수')}`, headers: adminAuth })).json() as TourSeedListType;
    expect(q.items.map((i) => i.placeId)).toEqual(['P-jamae']);
    const region = (await app.inject({ method: 'GET', url: `${SEEDS_URL}?region=all&minTravelers=1`, headers: adminAuth })).json() as TourSeedListType;
    expect(region.total).toBe(4);
    const page = (await app.inject({ method: 'GET', url: `${SEEDS_URL}?region=all&minTravelers=1&limit=2&offset=2`, headers: adminAuth })).json() as TourSeedListType;
    expect(page.items).toHaveLength(2);
    expect(page).toMatchObject({ total: 4, limit: 2, offset: 2 });

    expect((await app.inject({ method: 'GET', url: `${SEEDS_URL}?limit=500`, headers: adminAuth })).statusCode).toBe(400);
  });
});
