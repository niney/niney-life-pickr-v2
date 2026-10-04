import { afterEach, afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import sensiblePlugin from '../../plugins/sensible.js';
import prismaPlugin from '../../plugins/prisma.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { RestaurantService } from '../restaurant/restaurant.service.js';
import { ReviewSearchService } from '../review-search/review-search.service.js';
import { ReviewClusteringService, buildClusterComputePayload } from './review-clustering.service.js';

const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(prismaPlugin);
  await app.ready();
  return app;
};

// Per-file prefix — see restaurant.test.ts for why this matters.
const PLACE_PREFIX = 'tc-';
const stamp = () =>
  `${PLACE_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

describe('ReviewClustering auto-chain', () => {
  let app: FastifyInstance;
  let restaurantService: RestaurantService;
  let aiConfig: AiConfigService;

  beforeAll(async () => {
    app = await buildApp();
    restaurantService = new RestaurantService(app.prisma);
    aiConfig = new AiConfigService(app.prisma, {
      apiKey: '',
      baseUrl: '',
      timeoutMs: 1000,
      maxConcurrent: 1,
      defaultModels: {
        chat: '',
        image: '',
        'log-analysis': '',
        'meal-photo': '',
        'meal-recommend': '',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await app.prisma.restaurant.deleteMany({
      where: { placeId: { startsWith: PLACE_PREFIX } },
    });
  });

  const seed = async (name: string): Promise<{ restaurantId: string }> => {
    const placeId = stamp();
    const { id } = await restaurantService.upsertRestaurantFromCrawl({
      placeId,
      name,
      category: null,
      address: null,
      roadAddress: null,
      phone: null,
      businessHours: null,
      latitude: null,
      longitude: null,
      imageUrls: [],
      rating: null,
      reviewCount: null,
      menus: [],
      reviewStats: null,
      blogReviews: [],
      visitorReviews: [],
      rawSourceUrl: 'https://x',
    });
    await restaurantService.persistReviewBatch(id, [
      {
        authorName: 'a',
        rating: 5,
        body: '리뷰 본문',
        visitedAt: null,
        imageUrls: [],
        externalId: `ext-${stamp()}`,
      },
    ]);
    return { restaurantId: id };
  };

  // 자동 군집화가 "대기"로 영영 남던 회귀 — 군집화는 enrich 완료 이벤트에 배선된다
  // (plugins/summaries.ts 와 동일 배선). enrich 가 no-op(대상 0건)이어도 완료 이벤트가
  // 반드시 발생해 군집 시도가 이어지고, 스킵 사유가 lastReason 으로 남는지 검증.
  it('chains clustering after enrich completes and records skip reason', async () => {
    const name = `클러스터체인검증-${stamp()}`;
    const { restaurantId } = await seed(name);
    const reviewSearch = new ReviewSearchService(app.prisma, aiConfig);
    const clustering = new ReviewClusteringService(app.prisma, aiConfig);

    // plugins/summaries.ts 의 배선을 그대로 재현.
    const chained = new Promise<void>((resolve, reject) => {
      reviewSearch.onEnrichProgress((e) => {
        if (!e.done) return;
        void clustering.ensureClusteredByRestaurantId(e.restaurantId).then(resolve, reject);
      });
    });

    await reviewSearch.ensureEnrichedByRestaurantId(restaurantId);
    await chained;

    const status = await clustering.clusterStatus({ q: name, page: 1, pageSize: 10 });
    expect(status.items).toHaveLength(1);
    const item = status.items[0]!;
    expect(item.clustered).toBe(false);
    expect(item.inProgress).toBe(false);
    // 군집 시도가 실제로 돌았고(대기 아님) 원인이 노출된다 — 임베딩 없는 리뷰뿐이라 스킵.
    expect(item.lastReason).toContain('리뷰 부족');
  });
});

// B-7 — Python 입력을 임베딩 원문 이어 붙이기로 만든다(파싱→재직렬화 제거). 예전 방식
// (JSON.stringify(파싱한 문서))과 바이트가 같아야 스크립트를 안 바꿔도 된다.
describe('cluster compute payload (B-7)', () => {
  const vec = (seed: number, dims = 64): number[] =>
    Array.from({ length: dims }, (_, i) => {
      const x = Math.sin(seed * 31 + i * 7) * (i % 5 === 0 ? 1e-7 : 0.123456789);
      return i % 9 === 0 ? -x : x;
    });

  it('원문 이어 붙이기가 예전 JSON.stringify 페이로드와 같은 바이트를 만든다', () => {
    const docs = Array.from({ length: 25 }, (_, i) => {
      const v = vec(i);
      return {
        reviewId: `rv-${i}`,
        body: `맛있어요 "따옴표" \\ 역슬래시\n줄바꿈 ${i} 🍜`,
        // 저장소에는 JSON.stringify(number[]) 원문이 들어 있다(review-search enrich).
        vecJson: JSON.stringify(v),
        vec: v,
        aspects: (i % 2 ? { 맛: 'pos', 가격: 'neg' } : {}) as Record<string, string>,
      };
    });
    const before = JSON.stringify({
      minClusterSize: 8,
      aspectWeight: 0.5,
      docs: docs.map((d) => ({ reviewId: d.reviewId, body: d.body, vec: d.vec, aspects: d.aspects })),
    });
    expect(buildClusterComputePayload(docs, 8, 0.5)).toBe(before);
    expect(buildClusterComputePayload([], 8, 0)).toBe(JSON.stringify({ minClusterSize: 8, aspectWeight: 0, docs: [] }));
  });
});

describe('ReviewClustering loadDocs (B-7)', () => {
  let app: FastifyInstance;
  let restaurantService: RestaurantService;

  beforeAll(async () => {
    app = await buildApp();
    restaurantService = new RestaurantService(app.prisma);
  });

  afterAll(async () => {
    await app.prisma.restaurant.deleteMany({ where: { placeId: { startsWith: PLACE_PREFIX } } });
    await app.close();
  });

  it('빈 벡터(\'[]\')는 파싱 없이 코퍼스에서 뺀다', async () => {
    const placeId = stamp();
    const { id } = await restaurantService.upsertRestaurantFromCrawl({
      placeId,
      name: `군집페이로드-${placeId}`,
      category: null,
      address: null,
      roadAddress: null,
      phone: null,
      businessHours: null,
      latitude: null,
      longitude: null,
      imageUrls: [],
      rating: null,
      reviewCount: null,
      menus: [],
      reviewStats: null,
      blogReviews: [],
      visitorReviews: [],
      rawSourceUrl: 'https://x',
    });
    const embeddings = ['[0.1,-0.2,3e-7]', '[]', '[0.5,0.25,-1]'];
    for (const [i, embeddingJson] of embeddings.entries()) {
      const review = await app.prisma.visitorReview.create({
        data: {
          restaurantId: id,
          authorName: 'a',
          rating: 5,
          body: `서로 다른 리뷰 본문 ${i} 맛있다`,
          visitedAt: null,
          imageUrlsJson: '[]',
          contentHash: `${placeId}-${i}`,
        },
      });
      await app.prisma.reviewSummary.create({
        data: { reviewId: review.id, status: 'done', embeddingJson, aspectsJson: '{"맛":"pos"}' },
      });
    }
    const aiConfig = {} as AiConfigService;
    const clustering = new ReviewClusteringService(app.prisma, aiConfig);
    const run = await clustering.runForRestaurant(id);
    // 검색가능 3행 중 빈 벡터 1행 제외 → 문서 2건(최소 30건 미만이라 계산 전 스킵 — Python 미호출).
    expect(run.skipped).toBe(true);
    expect(run.total).toBe(2);
  });
});
