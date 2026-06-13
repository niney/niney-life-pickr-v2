import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type {
  TablingPlaceDataType,
  TablingShopDataType,
  TablingShopReviewType,
} from '@repo/api-contract';
import sensiblePlugin from '../../plugins/sensible.js';
import prismaPlugin from '../../plugins/prisma.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import { RestaurantService } from '../restaurant/restaurant.service.js';

// 테이블링 영속화·머지 building block 테스트. dev.db 공유 — 생성한 행 id 를
// 추적해 afterEach 에서 직접 삭제(canonical 까지). 충돌 회피용으로 idx 는 높은
// 범위, place objectId 는 파일 prefix 를 쓴다.

const buildTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(prismaPlugin);
  await app.ready();
  return app;
};

// 실데이터(idx ~5만대)와 충돌하지 않게 높은 범위. objectId 도 'ffff' prefix.
let idxSeq = 80_000_000 + Math.floor(Date.now() % 1_000_000);
const nextIdx = (): number => idxSeq++;
let oidSeq = 0;
const nextOid = (): string =>
  `ffff${(Date.now() % 1e12).toString(16)}${(oidSeq++).toString().padStart(4, '0')}`;

const shop = (idx: number, over: Partial<TablingShopDataType> = {}): TablingShopDataType => ({
  idx,
  name: '테스트가게',
  excerpt: null,
  description: null,
  category: '아시아식',
  address: '서울 마포구 독막로9길 8',
  roadAddress: '서울 마포구 독막로9길 8',
  jibunAddress: '서울 마포구 서교동 402-6',
  addressDetail: '2F',
  phone: '0226312109',
  lat: 1.1,
  lng: 2.1,
  rating: 4.5,
  ratings: [{ category: 'TASTE', points: 5 }],
  reviewTotalCount: 17,
  favoriteCount: 5,
  statusLabel: '영업중',
  images: ['https://image.tabling.co.kr/prod/x.jpg'],
  menuCategories: [],
  businessDays: [],
  flags: {
    useWaiting: true,
    useRemoteWaiting: false,
    useReservation: true,
    useTakeOut: false,
    useOnSiteOrder: false,
  },
  waitingCount: 0,
  reviewsFirstPage: { totalCount: 17, imageReviewCount: 0, list: [] },
  rawSourceUrl: `https://www.tabling.co.kr/restaurant/${idx}`,
  fetchedAt: '2026-06-13T00:00:00.000Z',
  elapsedMs: 100,
  source: 'http',
  ...over,
});

const place = (oid: string, over: Partial<TablingPlaceDataType> = {}): TablingPlaceDataType => ({
  objectId: oid,
  name: '미입점가게',
  address: '제주 제주시 서사로 11',
  lat: 1.1,
  lng: 2.1,
  cuisines: ['한식', '해장국'],
  rating: 4.4,
  reviewCount: 260,
  images: [],
  description: null,
  rawSourceUrl: `https://www.tabling.co.kr/place/${oid}`,
  fetchedAt: '2026-06-13T00:00:00.000Z',
  source: 'jsonld',
  ...over,
});

const review = (over: Partial<TablingShopReviewType> = {}): TablingShopReviewType => ({
  idx: '699af7b33c0ba9cb785b0ed8',
  cursorId: null,
  nickname: 'DR****',
  reviewDate: '2026-06-01',
  rating: 5,
  contents: '맛있어요',
  imageUrls: ['https://img/a.jpg'],
  menuOrders: ['버터난'],
  likeCount: 0,
  reply: null,
  isBlinded: false,
  summaryText: null,
  ...over,
});

describe('tabling persistence + matching', () => {
  let app: FastifyInstance;
  let service: RestaurantService;
  const createdRestaurantIds: string[] = [];

  const track = (id: string): string => {
    createdRestaurantIds.push(id);
    return id;
  };

  beforeAll(async () => {
    app = await buildTestApp();
    service = new RestaurantService(app.prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    if (createdRestaurantIds.length === 0) return;
    const rows = await app.prisma.restaurant.findMany({
      where: { id: { in: createdRestaurantIds } },
      select: { canonicalId: true },
    });
    const canonicalIds = [...new Set(rows.map((r) => r.canonicalId))];
    await app.prisma.restaurant.deleteMany({
      where: { id: { in: createdRestaurantIds } },
    });
    await app.prisma.canonicalRestaurant.deleteMany({
      where: { id: { in: canonicalIds } },
    });
    createdRestaurantIds.length = 0;
  });

  it('upsertRestaurantFromTabling: creates (source=tabling, sourceId=idx) + canonical with coords; idempotent', async () => {
    const idx = nextIdx();
    const a = track((await service.upsertRestaurantFromTabling(shop(idx, { name: 'A' }))).id);
    const b = (await service.upsertRestaurantFromTabling(shop(idx, { name: 'B' }))).id;
    expect(a).toBe(b); // 같은 (source, sourceId) → 같은 행 upsert.

    const row = await app.prisma.restaurant.findUnique({
      where: { id: a },
      select: {
        source: true,
        sourceId: true,
        placeId: true,
        name: true,
        canonical: { select: { latitude: true, longitude: true, name: true } },
      },
    });
    expect(row?.source).toBe('tabling');
    expect(row?.sourceId).toBe(String(idx));
    expect(row?.placeId).toBeNull();
    expect(row?.name).toBe('B'); // 두 번째 호출이 갱신.
    expect(row?.canonical.latitude).toBeCloseTo(1.1);
    expect(row?.canonical.longitude).toBeCloseTo(2.1);
  });

  it('upsertRestaurantFromTabling: snapshotJson excludes reviewsFirstPage', async () => {
    const idx = nextIdx();
    const id = track((await service.upsertRestaurantFromTabling(shop(idx))).id);
    const row = await app.prisma.restaurant.findUnique({ where: { id } });
    const snap = JSON.parse(row!.snapshotJson) as Record<string, unknown>;
    expect(snap.reviewsFirstPage).toBeUndefined();
    expect(snap.name).toBe('테스트가게');
  });

  it('upsertRestaurantFromTablingPlace: sourceId is place:<objectId> prefixed', async () => {
    const oid = nextOid();
    const id = track((await service.upsertRestaurantFromTablingPlace(place(oid))).id);
    const row = await app.prisma.restaurant.findUnique({
      where: { id },
      select: { source: true, sourceId: true, category: true },
    });
    expect(row?.source).toBe('tabling');
    expect(row?.sourceId).toBe(`place:${oid}`);
    expect(row?.category).toBe('한식'); // cuisines[0].
  });

  it('mapTablingReviewToRaw: externalId tb:rv:<idx>, body from contents', () => {
    const raw = RestaurantService.mapTablingReviewToRaw(
      review({ idx: 'abc123', contents: '굿', nickname: '닉' }),
    );
    expect(raw.externalId).toBe('tb:rv:abc123');
    expect(raw.authorName).toBe('닉');
    expect(raw.body).toBe('굿');
    expect(raw.imageUrls).toEqual(['https://img/a.jpg']);
    expect(raw.videos).toEqual([]);
    // contents 가 null 이면 body 는 빈 문자열.
    expect(RestaurantService.mapTablingReviewToRaw(review({ contents: null })).body).toBe('');
  });

  it('findRegisteredTablingByIdxs: returns registered partner idxs only', async () => {
    const idx = nextIdx();
    const missing = nextIdx();
    const id = track((await service.upsertRestaurantFromTabling(shop(idx))).id);
    const res = await service.findRegisteredTablingByIdxs([idx, missing]);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ idx, restaurantId: id });
  });

  it('findCanonicalAutoMatchCandidates: returns a nearby canonical and excludes self', async () => {
    // 한적한 좌표(실데이터 없음)에 두 가게를 가깝게(±0.007° 박스 안) 생성.
    const lat = 1.234567;
    const lng = 2.345678;
    const idA = track((await service.upsertRestaurantFromTabling(shop(nextIdx(), { lat, lng, name: 'A' }))).id);
    const idB = track(
      (await service.upsertRestaurantFromTabling(shop(nextIdx(), { lat: lat + 0.001, lng: lng + 0.001, name: 'B' }))).id,
    );
    const canonA = await service.getCanonicalIdForRestaurant(idA);
    const canonB = await service.getCanonicalIdForRestaurant(idB);
    expect(canonA).toBeTruthy();

    const cands = await service.findCanonicalAutoMatchCandidates(canonA!, lat, lng);
    const ids = cands.map((c) => c.id);
    expect(ids).toContain(canonB);
    expect(ids).not.toContain(canonA);
    const b = cands.find((c) => c.id === canonB);
    expect(b?.sources).toContain('tabling');
  });
});
