import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { NaverPlaceDataType, RestaurantSmartPickResultType } from '@repo/api-contract';
import sensiblePlugin from '../../plugins/sensible.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import restaurantRoutes from './restaurant.route.js';
import { RestaurantService } from './restaurant.service.js';

const buildTestApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.register(restaurantRoutes);
  await app.ready();
  return app;
};

// Per-file prefix — vitest 가 같은 dev.db 를 병렬로 쓰므로 파일 전용 접두사로
// 시딩·정리를 격리한다 (restaurant.test.ts 의 규칙).
const PLACE_PREFIX = 'rsp-';
const stamp = () =>
  `${PLACE_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const placeData = (overrides: Partial<NaverPlaceDataType> = {}): NaverPlaceDataType => ({
  placeId: stamp(),
  name: '픽 테스트 식당',
  category: '한식',
  address: '서울 강남구',
  roadAddress: null,
  phone: null,
  businessHours: null,
  latitude: null,
  longitude: null,
  imageUrls: [],
  rating: 4.2,
  reviewCount: 12,
  menus: [],
  reviewStats: null,
  blogReviews: [],
  visitorReviews: [],
  rawSourceUrl: 'https://m.place.naver.com/restaurant/x',
  ...overrides,
});

const PICK_URL = '/api/v1/restaurants/public/smart-pick';

describe('public smart-pick route', () => {
  let app: FastifyInstance;
  let service: RestaurantService;

  beforeAll(async () => {
    app = await buildTestApp();
    service = new RestaurantService(app.prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await app.prisma.restaurant.deleteMany({
      where: { placeId: { startsWith: PLACE_PREFIX } },
    });
  });

  // 식당 시딩 + 필요 시 done 분석 행 1개 부착.
  const seedRestaurant = async (
    opts: {
      analyzed?: { sentimentScore: number | null; satisfactionScore: number | null };
    } = {},
  ): Promise<{ id: string; placeId: string }> => {
    const data = placeData();
    const row = await service.upsertRestaurantFromCrawl(data);
    if (opts.analyzed) {
      const review = await app.prisma.visitorReview.create({
        data: {
          restaurantId: row.id,
          body: '분석용 리뷰',
          imageUrlsJson: '[]',
          contentHash: `${data.placeId}-hash`,
        },
      });
      await app.prisma.reviewSummary.create({
        data: {
          reviewId: review.id,
          status: 'done',
          sentimentScore: opts.analyzed.sentimentScore,
          satisfactionScore: opts.analyzed.satisfactionScore,
        },
      });
    }
    return { id: row.id, placeId: data.placeId };
  };

  const pick = async (payload: unknown) => {
    const res = await app.inject({ method: 'POST', url: PICK_URL, payload });
    return res;
  };

  it('미인증 POST → 200 (공개 라우트)', async () => {
    const res = await pick({});
    expect(res.statusCode).toBe(200);
    const body = res.json() as RestaurantSmartPickResultType;
    expect(body.strategy).toBe('balanced');
    expect(typeof body.candidates).toBe('number');
  });

  it('분석 done 후보만 뽑힌다 — 무분석 후보는 weight 0 으로 배제', async () => {
    const analyzed = await seedRestaurant({
      analyzed: { sentimentScore: 0.8, satisfactionScore: 5 },
    });
    const raw = await seedRestaurant();

    // 가중 랜덤이지만 무분석 후보는 배제되므로 결과는 결정적이다.
    for (let i = 0; i < 3; i += 1) {
      const res = await pick({ candidatePlaceIds: [analyzed.placeId, raw.placeId] });
      expect(res.statusCode).toBe(200);
      const body = res.json() as RestaurantSmartPickResultType;
      expect(body.candidates).toBe(2);
      expect(body.picked?.placeId).toBe(analyzed.placeId);
      expect(body.picked?.weight).toBeGreaterThan(0);
    }
  });

  it('candidatePlaceIds IN 필터 — 풀 밖의 분석된 식당은 뽑히지 않는다', async () => {
    await seedRestaurant({ analyzed: { sentimentScore: 0.9, satisfactionScore: 5 } });
    const inPool = await seedRestaurant({
      analyzed: { sentimentScore: 0.1, satisfactionScore: 3 },
    });

    const res = await pick({ candidatePlaceIds: [inPool.placeId] });
    const body = res.json() as RestaurantSmartPickResultType;
    expect(body.candidates).toBe(1);
    expect(body.picked?.placeId).toBe(inPool.placeId);
  });

  it('후보 전부 무분석 → picked null, candidates 는 후보 수', async () => {
    const a = await seedRestaurant();
    const b = await seedRestaurant();

    const res = await pick({ candidatePlaceIds: [a.placeId, b.placeId] });
    const body = res.json() as RestaurantSmartPickResultType;
    expect(body.picked).toBeNull();
    expect(body.candidates).toBe(2);
  });

  it('존재하지 않는 placeId 만 → picked null, candidates 0', async () => {
    const res = await pick({ candidatePlaceIds: [`${PLACE_PREFIX}ghost-1`] });
    const body = res.json() as RestaurantSmartPickResultType;
    expect(body.picked).toBeNull();
    expect(body.candidates).toBe(0);
  });

  it('입력 바운드 — 후보 201개 배열은 400', async () => {
    const res = await pick({
      candidatePlaceIds: Array.from({ length: 201 }, (_, i) => `${PLACE_PREFIX}x${i}`),
    });
    expect(res.statusCode).toBe(400);
  });

  it('strategy 지정 — satisfaction/positive 도 스키마 통과 + 응답에 반영', async () => {
    const seeded = await seedRestaurant({
      analyzed: { sentimentScore: 0.5, satisfactionScore: 4 },
    });
    const res = await pick({ candidatePlaceIds: [seeded.placeId], strategy: 'satisfaction' });
    const body = res.json() as RestaurantSmartPickResultType;
    expect(res.statusCode).toBe(200);
    expect(body.strategy).toBe('satisfaction');
    expect(body.picked?.placeId).toBe(seeded.placeId);
  });
});
