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
import { ReviewClusteringService } from './review-clustering.service.js';

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
      defaultModels: { chat: '', image: '', 'log-analysis': '' },
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
