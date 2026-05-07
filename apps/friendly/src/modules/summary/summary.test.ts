import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import sensiblePlugin from '../../plugins/sensible.js';
import jwtPlugin from '../../plugins/jwt.js';
import prismaPlugin from '../../plugins/prisma.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import { LLMUpstreamError } from '../ai/adapters/llm-provider.js';
import { AiConfigService } from '../ai/ai.config.service.js';
import { RestaurantService } from '../restaurant/restaurant.service.js';
import { SummaryService } from './summary.service.js';

const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(jwtPlugin);
  await app.register(prismaPlugin);
  await app.ready();
  return app;
};

// Per-file prefix — see restaurant.test.ts for why this matters.
const PLACE_PREFIX = 'ts-';
const stamp = () =>
  `${PLACE_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const fakeProvider = (
  fn: (model: string, prompt: string) => Promise<{ text: string; model: string; promptTokens: number | null; completionTokens: number | null }>,
): LLMProvider => ({
  complete: async ({ model, prompt }) => fn(model, prompt),
});

describe('SummaryService', () => {
  let app: FastifyInstance;
  let restaurantService: RestaurantService;

  beforeAll(async () => {
    app = await buildApp();
    restaurantService = new RestaurantService(app.prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await app.prisma.restaurant.deleteMany({
      where: { placeId: { startsWith: PLACE_PREFIX } },
    });
  });

  const seed = async (
    reviewBodies: string[],
  ): Promise<{ placeId: string; reviewIds: string[] }> => {
    const placeId = stamp();
    const { id: rid } = await restaurantService.upsertRestaurantFromCrawl({
      placeId,
      name: 'x',
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
    const { newReviews } = await restaurantService.persistReviewBatch(
      rid,
      reviewBodies.map((b, i) => ({
        authorName: `author-${i}`,
        rating: 5,
        body: b,
        visitedAt: null,
        imageUrls: [],
        externalId: `ext-${i}-${stamp()}`,
      })),
    );
    return { placeId, reviewIds: newReviews.map((r) => r.id) };
  };

  it('marks all rows as done with text on success', async () => {
    const { placeId, reviewIds } = await seed(['리뷰 본문 1', '리뷰 본문 2']);
    const provider = fakeProvider(async (model, prompt) => ({
      text: `요약(${model}): ${prompt.slice(0, 8)}`,
      model: 'test-model',
      promptTokens: 10,
      completionTokens: 5,
    }));
    const aiConfig = new AiConfigService(app.prisma, {
      apiKey: '',
      baseUrl: '',
      timeoutMs: 1000,
      maxConcurrent: 1,
      defaultModel: '',
    });
    const service = new SummaryService(app.prisma, aiConfig, {
      resolveOverride: async () => ({ provider, model: 'override-model' }),
    });

    await service.runForTests(placeId, reviewIds);

    const rows = await app.prisma.reviewSummary.findMany({
      where: { reviewId: { in: reviewIds } },
    });
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.status).toBe('done');
      expect(r.text).toContain('요약');
      expect(r.model).toBe('test-model');
      expect(r.finishedAt).not.toBeNull();
      expect(r.errorCode).toBeNull();
    }
  });

  it('records failures per row without aborting siblings', async () => {
    const { placeId, reviewIds } = await seed(['ok', 'will fail', 'ok2']);
    const provider = fakeProvider(async (_model, prompt) => {
      if (prompt.includes('will fail')) throw new LLMUpstreamError(500, 'boom');
      return { text: `요약 ${prompt}`, model: 'm', promptTokens: 1, completionTokens: 1 };
    });
    const aiConfig = new AiConfigService(app.prisma, {
      apiKey: '',
      baseUrl: '',
      timeoutMs: 1000,
      maxConcurrent: 1,
      defaultModel: '',
    });
    const service = new SummaryService(app.prisma, aiConfig, {
      resolveOverride: async () => ({ provider, model: 'override-model' }),
    });

    await service.runForTests(placeId, reviewIds);

    const rows = await app.prisma.reviewSummary.findMany({
      where: { reviewId: { in: reviewIds } },
      include: { review: { select: { body: true } } },
    });
    expect(rows).toHaveLength(3);
    const failed = rows.find((r) => r.review.body === 'will fail');
    expect(failed?.status).toBe('failed');
    expect(failed?.errorCode).toBe('upstream_failed');
    expect(failed?.errorMessage).toBe('boom');
    const succeeded = rows.filter((r) => r.review.body !== 'will fail');
    for (const r of succeeded) expect(r.status).toBe('done');
  });

  it('publishes bus events on status transitions', async () => {
    const { placeId, reviewIds } = await seed(['리뷰 A', '리뷰 B']);
    const { SummaryEventsBus } = await import('./summary-events-bus.js');
    const bus = new SummaryEventsBus();
    const fired: string[] = [];
    const unsub = bus.subscribe(placeId, () => fired.push(placeId));

    const provider = fakeProvider(async (_model, prompt) => ({
      text: `요약 ${prompt}`,
      model: 'm',
      promptTokens: 1,
      completionTokens: 1,
    }));
    const aiConfig = new AiConfigService(app.prisma, {
      apiKey: '',
      baseUrl: '',
      timeoutMs: 1000,
      maxConcurrent: 1,
      defaultModel: '',
    });
    const service = new SummaryService(app.prisma, aiConfig, {
      resolveOverride: async () => ({ provider, model: 'm' }),
      bus,
    });

    await service.runForTests(placeId, reviewIds);
    unsub();

    // At minimum we expect publishes for: pending upsert, running flip,
    // chunk-done. Order matters less than presence and count > 0.
    expect(fired.length).toBeGreaterThanOrEqual(3);
    expect(fired.every((p) => p === placeId)).toBe(true);
  });

  it('leaves rows pending when no provider/model is configured', async () => {
    const { placeId, reviewIds } = await seed(['x']);
    const aiConfig = new AiConfigService(app.prisma, {
      apiKey: '',
      baseUrl: '',
      timeoutMs: 1000,
      maxConcurrent: 1,
      defaultModel: '',
    });
    const service = new SummaryService(app.prisma, aiConfig, {
      resolveOverride: async () => null,
    });

    await service.runForTests(placeId, reviewIds);

    const row = await app.prisma.reviewSummary.findUnique({
      where: { reviewId: reviewIds[0]! },
    });
    expect(row?.status).toBe('pending');
    expect(row?.text).toBeNull();
  });
});
