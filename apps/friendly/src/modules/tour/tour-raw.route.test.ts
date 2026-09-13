import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TourRawPhotosResultType, TourRawTripDetailType, TourRawTripsResultType, TourRawVisitsResultType } from '@repo/api-contract';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import sensiblePlugin from '../../plugins/sensible.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import tourRawRoutes from './tour-raw.route.js';
import { parseTourRawAllowlist } from './tour-raw.service.js';

// 여행로그 원본 열람 라우트(3차) — allowlist 경계(admin 이어도 밖이면 404), no-store·noindex 헤더, 장소별 방문(이전·다음
// 장소 이름)·포함 여행(일차 순서)·여행 타임라인(비공개 방문은 역할만)·사진 메타, 썸네일 파일(헤더·?token= 인증, 없는
// 파일·경로 조작 차단).

const BASE = '/api/v1/admin/tour';

const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  // allowlist 는 user id 또는 이메일 — admin-mail 은 id 가 아니라 이메일(seedAuthUsers 가 `${id}@seed.local` 로 만든다)로 든다.
  await app.register(tourRawRoutes, { allowlist: ['admin-raw', 'admin-mail@seed.local'] });
  await app.ready();
  await seedAuthUsers(app, [
    { id: 'admin-raw', role: 'ADMIN' },
    { id: 'admin-mail', role: 'ADMIN' },
    { id: 'admin-other', role: 'ADMIN' },
    { id: 'user-test', role: 'USER' },
  ]);
  return app;
};

const place = (id: string, name: string) => ({
  id,
  name,
  typeCd: '11',
  typeShort: '식당',
  isJeju: true,
  isIsland: false,
  lat: 33.4996,
  lng: 126.5312,
  nVisits: 2,
  nTravelers: 2,
  nRated: 2,
  nPhotos: 1,
  spendN: 1,
  nActivities: 2,
  nLodging: 0,
});
const visit = (travelId: string, visitAreaId: string, order: number, over: Record<string, unknown> = {}) => ({
  id: `${travelId}:${visitAreaId}`,
  travelId,
  visitAreaId,
  visitOrder: order,
  dayIndex: 1,
  visitDate: '2023-05-27',
  arrivalTs: `2023-05-27 ${String(9 + order).padStart(2, '0')}:00:00`,
  typeCd: '11',
  typeShort: '식당',
  isPrivate: false,
  isJeju: true,
  isIsland: false,
  nPhotos: 0,
  nActivities: 0,
  travelerLabel: '여행자 #0001',
  ...over,
});

describe('tour raw routes', () => {
  let isolated: IsolatedDatabase;
  let app: FastifyInstance;
  let thumbs: string;
  let rawAuth: { authorization: string };
  let otherAuth: { authorization: string };
  let rawToken: string;
  const prevThumbs = process.env.TOUR_THUMBS_DIR;

  beforeAll(async () => {
    thumbs = mkdtempSync(join(tmpdir(), 'tour-thumbs-'));
    mkdirSync(join(thumbs, 's'));
    writeFileSync(join(thumbs, 's', 'ph1.webp'), Buffer.from('RIFF0000WEBPVP8 '));
    process.env.TOUR_THUMBS_DIR = thumbs;
    isolated = await useIsolatedDatabase();
    app = await buildApp();
    rawToken = app.jwt.sign({ userId: 'admin-raw', email: 'r@x.com', role: 'ADMIN' });
    rawAuth = { authorization: `Bearer ${rawToken}` };
    otherAuth = { authorization: `Bearer ${app.jwt.sign({ userId: 'admin-other', email: 'o@x.com', role: 'ADMIN' })}` };

    const p = app.prisma;
    await p.tourPlace.createMany({ data: [place('P1', '우진해장국'), place('P-air', '제주국제공항'), place('P-beach', '함덕해수욕장')] });
    await p.tourTrip.create({
      data: { id: 'T1', travelerLabel: '여행자 #0001', startDate: '2023-05-27', endDate: '2023-05-28', nights: 1, month: 5, gender: '여', ageGrp: '30', accompany: '2인 여행(가족 외)', nVisits: 4, nPublic: 3, nJeju: 3, nIsland: 0, nPhotos: 1, nActivities: 2, hasGps: false, spendTotal: 50000 },
    });
    await p.tourVisit.createMany({
      data: [
        visit('T1', 'A0', 1, { typeCd: '21', typeShort: '집', isPrivate: true, privateRole: '출발지', isJeju: false, nextPlaceId: 'P-air' }),
        visit('T1', 'A1', 2, { placeId: 'P-air', name: '제주국제공항', typeShort: '교통', prevPlaceId: null, nextPlaceId: 'P1' }),
        visit('T1', 'A2', 3, { placeId: 'P1', name: '우진해장국', dgstfn: 5, stayMin: 60, reasonNm: '온라인 평가', spendPp: 10000, prevPlaceId: 'P-air', nextPlaceId: 'P-beach', nActivities: 2 }),
        visit('T1', 'A3', 4, { placeId: 'P-beach', name: '함덕해수욕장', typeShort: '자연', prevPlaceId: 'P1' }),
        visit('T2', 'B1', 1, { placeId: 'P1', name: '우진해장국', dgstfn: 4, stayMin: 30, travelerLabel: '여행자 #0002', visitDate: '2023-06-01' }),
      ],
    });
    await p.tourActivity.createMany({
      data: [
        { travelId: 'T1', visitAreaId: 'A2', placeId: 'P1', isPrivate: false, typeCd: '1', typeNm: '취식', seq: 1, detail: '고사리육개장;몸국', isJeju: true },
        { travelId: 'T1', visitAreaId: 'A2', placeId: 'P1', isPrivate: false, typeCd: '2', typeNm: '쇼핑', seq: 2, detail: null, isJeju: true },
      ],
    });
    await p.tourSpend.createMany({
      data: [
        { id: 1, travelId: 'T1', category: '활동', categoryCd: 'activity', visitAreaId: 'A2', placeId: 'P1', storeNm: '우진해장국', brno: '1234567890', item: '고사리육개장', amount: 20000, payNum: 2, perPerson: 10000, methodNm: '카드 일시불' },
        { id: 2, travelId: 'T1', category: '숙박', categoryCd: 'lodge', subtypeNm: '펜션', amount: 120000, payNum: 2, perPerson: 60000 },
      ],
    });
    await p.tourPhoto.createMany({
      data: [
        { id: 'ph1', travelId: 'T1', visitAreaId: 'A2', placeId: 'P1', takenTs: '2023-05-27 11:20:00', hasThumb: true, hasCaption: false, isJeju: true, source: 'train' },
        { id: 'ph-nothumb', travelId: 'T1', visitAreaId: 'A2', placeId: 'P1', hasThumb: false, hasCaption: false, isJeju: true, source: 'train' },
      ],
    });
    await p.tourDaySequence.createMany({
      data: [
        { id: 'T1:1', travelId: 'T1', dayIndex: 1, visitDate: '2023-05-27', nStops: 3, typeSeq: '교통>식당>자연', placeSeq: '제주국제공항 > 우진해장국 > 함덕해수욕장', isJejuDay: true, isLastDay: false },
        { id: 'T1:2', travelId: 'T1', dayIndex: 2, visitDate: '2023-05-28', nStops: 1, typeSeq: '교통', isJejuDay: true, isLastDay: true },
      ],
    });
    await p.tourCompanion.create({ data: { travelId: 'T1', seq: 1, relNm: '친구', genderNm: '여', ageNm: '30대' } });
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
    rmSync(thumbs, { recursive: true, force: true });
    if (prevThumbs === undefined) delete process.env.TOUR_THUMBS_DIR;
    else process.env.TOUR_THUMBS_DIR = prevThumbs;
  });

  it('allowlist 파싱 — 쉼표·공백·빈 항목', () => {
    expect([...parseTourRawAllowlist(' a, b ,,c ')]).toEqual(['a', 'b', 'c']);
    expect(parseTourRawAllowlist(undefined).size).toBe(0);
  });

  it('비로그인 401 · 일반 회원 403 · allowlist 밖 admin 404 · 사진도 404', async () => {
    expect((await app.inject({ method: 'GET', url: `${BASE}/places/P1/visits` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `${BASE}/places/P1/visits`, headers: { authorization: `Bearer ${app.jwt.sign({ userId: 'user-test', email: 'u@x.com', role: 'USER' })}` } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `${BASE}/places/P1/visits`, headers: otherAuth })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `${BASE}/trips/T1`, headers: otherAuth })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `${BASE}/photos/ph1/s`, headers: otherAuth })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `${BASE}/photos/ph1/s` })).statusCode).toBe(404);
  });

  it('이메일 allowlist — 토큰의 이메일(대소문자 무시)로 방문 200, 사진은 DB 이메일 조회로 ?token= 200', async () => {
    const mailToken = app.jwt.sign({ userId: 'admin-mail', email: 'Admin-Mail@seed.local', role: 'ADMIN' });
    const mailAuth = { authorization: `Bearer ${mailToken}` };
    expect((await app.inject({ method: 'GET', url: `${BASE}/places/P1/visits`, headers: mailAuth })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `${BASE}/trips/T1`, headers: mailAuth })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `${BASE}/photos/ph1/s?token=${encodeURIComponent(mailToken)}` })).statusCode).toBe(200);
  });

  it('방문 목록 — no-store·noindex 헤더, 최신순, 이전·다음 장소 이름', async () => {
    const res = await app.inject({ method: 'GET', url: `${BASE}/places/P1/visits`, headers: rawAuth });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    const body = res.json() as TourRawVisitsResultType;
    expect(body.total).toBe(2);
    expect(body.items.map((v) => v.travelId)).toEqual(['T2', 'T1']);
    expect(body.items[1]).toMatchObject({ dgstfn: 5, stayMin: 60, reasonNm: '온라인 평가', spendPp: 10000, prevPlaceName: '제주국제공항', nextPlaceName: '함덕해수욕장', travelerLabel: '여행자 #0001' });
    expect((await app.inject({ method: 'GET', url: `${BASE}/places/NOPE/visits`, headers: rawAuth })).statusCode).toBe(404);
  });

  it('주문 원문·영수증·사진 메타(썸네일 있는 것만)', async () => {
    const acts = (await app.inject({ method: 'GET', url: `${BASE}/places/P1/activities`, headers: rawAuth })).json() as { total: number; items: Array<{ detail: string | null }> };
    expect(acts.total).toBe(2);
    expect(acts.items.map((a) => a.detail)).toContain('고사리육개장;몸국');
    const spend = (await app.inject({ method: 'GET', url: `${BASE}/places/P1/spend`, headers: rawAuth })).json() as { total: number; items: Array<{ brno: string | null; perPerson: number | null }> };
    expect(spend.total).toBe(1);
    expect(spend.items[0]).toMatchObject({ brno: '1234567890', perPerson: 10000 });
    const photos = (await app.inject({ method: 'GET', url: `${BASE}/places/P1/photos`, headers: rawAuth })).json() as TourRawPhotosResultType;
    expect(photos.total).toBe(1);
    expect(photos.items[0]!.id).toBe('ph1');
    expect(photos.sizes).toEqual(['s']);
  });

  it('포함 여행(일차 순서) → 타임라인(비공개 방문은 역할만, 활동·소비·사진 id, 숙박 소비 별도)', async () => {
    const trips = (await app.inject({ method: 'GET', url: `${BASE}/places/P1/trips`, headers: rawAuth })).json() as TourRawTripsResultType;
    expect(trips.total).toBe(2);
    const t1 = trips.items.find((t) => t.travelId === 'T1')!;
    expect(t1).toMatchObject({ travelerLabel: '여행자 #0001', nights: 1, accompany: '2인 여행(가족 외)' });
    expect(t1.days.map((d) => d.typeSeq)).toEqual(['교통>식당>자연', '교통']);

    const res = await app.inject({ method: 'GET', url: `${BASE}/trips/T1`, headers: rawAuth });
    expect(res.statusCode).toBe(200);
    const d = res.json() as TourRawTripDetailType;
    expect(d.companions).toEqual([{ relNm: '친구', genderNm: '여', ageNm: '30대', situationNm: null }]);
    expect(d.visits.map((v) => v.visitOrder)).toEqual([1, 2, 3, 4]);
    expect(d.visits[0]).toMatchObject({ isPrivate: true, privateRole: '출발지', name: null, placeId: null });
    expect(d.visits[2]).toMatchObject({ name: '우진해장국', dgstfn: 5, photoIds: ['ph1'] });
    expect(d.visits[2]!.activities).toEqual([
      { typeNm: '취식', detail: '고사리육개장;몸국' },
      { typeNm: '쇼핑', detail: null },
    ]);
    expect(d.visits[2]!.spend).toEqual([{ storeNm: '우진해장국', item: '고사리육개장', amount: 20000, payNum: 2, methodNm: '카드 일시불' }]);
    expect(d.otherSpend).toEqual([{ category: '숙박', subtypeNm: '펜션', item: null, amount: 120000, payNum: 2, methodNm: null, dayIndex: null }]);
    expect((await app.inject({ method: 'GET', url: `${BASE}/trips/NOPE`, headers: rawAuth })).statusCode).toBe(404);
  });

  it('썸네일 파일 — 헤더 또는 ?token= 인증, image/webp + no-store, 없는 파일·크기·경로 조작은 404/400', async () => {
    const byHeader = await app.inject({ method: 'GET', url: `${BASE}/photos/ph1/s`, headers: rawAuth });
    expect(byHeader.statusCode).toBe(200);
    expect(byHeader.headers['content-type']).toContain('image/webp');
    expect(byHeader.headers['cache-control']).toBe('private, no-store');
    expect(byHeader.rawPayload.subarray(0, 4).toString()).toBe('RIFF');

    const byToken = await app.inject({ method: 'GET', url: `${BASE}/photos/ph1/s?token=${encodeURIComponent(rawToken)}` });
    expect(byToken.statusCode).toBe(200);

    expect((await app.inject({ method: 'GET', url: `${BASE}/photos/ph1/m`, headers: rawAuth })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `${BASE}/photos/ph-none/s`, headers: rawAuth })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `${BASE}/photos/ph1/xl`, headers: rawAuth })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `${BASE}/photos/${encodeURIComponent('../s/ph1')}/s`, headers: rawAuth })).statusCode).toBe(400);
  });
});
