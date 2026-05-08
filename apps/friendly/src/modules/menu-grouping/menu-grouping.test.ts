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
import { AiConfigService } from '../ai/ai.config.service.js';
import { MenuGroupingService } from './menu-grouping.service.js';

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

const PLACE_PREFIX = 'mg-';
const stamp = (): string =>
  `${PLACE_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const fakeProvider = (
  reply: (prompt: string) => string,
): LLMProvider => ({
  complete: async ({ prompt }) => ({
    text: reply(prompt),
    model: 'fake-model',
    promptTokens: 10,
    completionTokens: 10,
  }),
});

interface SeededMention {
  name: string;
  nameNorm: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  traits?: string[];
}

const seedRestaurantWithMentions = async (
  app: FastifyInstance,
  mentions: SeededMention[],
  meta: { name?: string; category?: string | null } = {},
): Promise<{ placeId: string; restaurantId: string }> => {
  const placeId = stamp();
  const rest = await app.prisma.restaurant.create({
    data: {
      placeId,
      name: meta.name ?? '테스트 식당',
      category: meta.category ?? null,
      rawSourceUrl: 'https://x',
      snapshotJson: '{}',
    },
  });

  // 멘션을 만들려면 review + summary 가 필요. 한 review 에 여러 멘션을
  // 매달 수 있으므로 review 한 개 + summary 한 개 + 멘션 N 개로 단순화.
  const review = await app.prisma.visitorReview.create({
    data: {
      restaurantId: rest.id,
      authorName: 'a',
      rating: 5,
      body: 'b',
      visitedAt: null,
      imageUrlsJson: '[]',
      contentHash: stamp(),
    },
  });
  const summary = await app.prisma.reviewSummary.create({
    data: {
      reviewId: review.id,
      status: 'done',
      sentiment: 'positive',
    },
  });
  if (mentions.length > 0) {
    await app.prisma.menuMention.createMany({
      data: mentions.map((m) => ({
        summaryId: summary.id,
        restaurantId: rest.id,
        name: m.name,
        nameNorm: m.nameNorm,
        sentiment: m.sentiment,
        traitsJson: JSON.stringify(m.traits ?? []),
      })),
    });
  }
  return { placeId, restaurantId: rest.id };
};

describe('MenuGroupingService', () => {
  let app: FastifyInstance;
  let aiConfig: AiConfigService;

  beforeAll(async () => {
    app = await buildApp();
    aiConfig = new AiConfigService(app.prisma, {
      apiKey: '',
      baseUrl: '',
      timeoutMs: 1000,
      maxConcurrent: 1,
      defaultModel: '',
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

  it('groups variant menus into a canonical name and persists mappings', async () => {
    const { placeId } = await seedRestaurantWithMentions(app, [
      { name: '김치찌개', nameNorm: '김치찌개', sentiment: 'positive' },
      { name: '김치 찌개', nameNorm: '김치찌개', sentiment: 'positive' },
      { name: '묵은지김치찌개', nameNorm: '묵은지김치찌개', sentiment: 'negative' },
      { name: '차돌박이된장찌개', nameNorm: '차돌박이된장찌개', sentiment: 'positive' },
    ]);

    // bestNameByNorm 가 어떤 표기를 variant 로 고를지는 Prisma 의 groupBy
     // 반환 순서에 달려 있어 양쪽 다 매핑을 넣어둔다 (어느 쪽이 입력으로
     // 들어와도 같은 canonicalName 결정).
    const provider = fakeProvider(() =>
      JSON.stringify({
        '김치찌개': '김치찌개',
        '김치 찌개': '김치찌개',
        '묵은지김치찌개': '김치찌개',
        '차돌박이된장찌개': '차돌박이된장찌개',
      }),
    );
    const service = new MenuGroupingService(app.prisma, aiConfig, {
      resolveOverride: async () => ({ provider, model: 'override-model' }),
    });

    const run = await service.groupForRestaurant(placeId);
    expect(run.ok).toBe(true);
    // distinct nameNorm 3개 입력 → 같은 청크 안에서 모두 매핑.
    expect(run.inputCount).toBe(3);
    expect(run.mappedCount).toBe(3);
    // 김치찌개 그룹 + 차돌박이된장찌개 그룹.
    expect(run.groupCount).toBe(2);
    expect(run.model).toBe('override-model');

    const ranking = await service.getRanking(placeId, { sort: 'mentions', minMentions: 1 });
    expect(ranking.unmappedMenus).toEqual([]);
    expect(ranking.modelVersion).toBeGreaterThan(0);
    expect(ranking.items).toHaveLength(2);

    // canonicalKey 는 normalizeTerm('김치찌개') = '김치찌개'.
    const kim = ranking.items.find((i) => i.canonicalKey === '김치찌개')!;
    expect(kim).toBeDefined();
    expect(kim.mapped).toBe(true);
    expect(kim.canonicalName).toBe('김치찌개');
    // 김치찌개 + 김치 찌개 (positive) + 묵은지김치찌개 (negative) = 3 멘션.
    expect(kim.mentionCount).toBe(3);
    expect(kim.positive).toBe(2);
    expect(kim.negative).toBe(1);
    expect(kim.positiveRatio).toBeCloseTo(2 / 3);
    expect(kim.variants).toContain('김치찌개');
    expect(kim.variants).toContain('묵은지김치찌개');
  });

  it('falls back to nameNorm grouping when no canonical mappings exist', async () => {
    const { placeId } = await seedRestaurantWithMentions(app, [
      { name: '돈까스', nameNorm: '돈까스', sentiment: 'positive' },
      { name: '돈가스', nameNorm: '돈가스', sentiment: 'negative' },
    ]);

    const service = new MenuGroupingService(app.prisma, aiConfig, {
      resolveOverride: async () => null,
    });

    const ranking = await service.getRanking(placeId, { sort: 'mentions', minMentions: 1 });
    // 매핑 없음 — 각자 자기 자신이 그룹키, mapped=false.
    expect(ranking.items).toHaveLength(2);
    expect(ranking.items.every((i) => !i.mapped)).toBe(true);
    expect(ranking.unmappedMenus.sort()).toEqual(['돈가스', '돈까스']);
    expect(ranking.modelVersion).toBeNull();
    expect(ranking.groupedAt).toBeNull();
  });

  it('sorts by positiveRatio with null ratios pushed to the end', async () => {
    const { placeId } = await seedRestaurantWithMentions(app, [
      // positive 2 / negative 1 → 0.667
      { name: '김치찌개', nameNorm: '김치찌개', sentiment: 'positive' },
      { name: '김치찌개', nameNorm: '김치찌개', sentiment: 'positive' },
      { name: '김치찌개', nameNorm: '김치찌개', sentiment: 'negative' },
      // positive 1 / negative 0 → 1.0
      { name: '된장찌개', nameNorm: '된장찌개', sentiment: 'positive' },
      // neutral only → null ratio
      { name: '공깃밥', nameNorm: '공깃밥', sentiment: 'neutral' },
      { name: '공깃밥', nameNorm: '공깃밥', sentiment: 'neutral' },
    ]);

    const service = new MenuGroupingService(app.prisma, aiConfig, {
      resolveOverride: async () => null,
    });
    const ranking = await service.getRanking(placeId, { sort: 'positiveRatio', minMentions: 1 });
    expect(ranking.items.map((i) => i.canonicalName)).toEqual([
      '된장찌개',
      '김치찌개',
      '공깃밥',
    ]);
    expect(ranking.items[2].positiveRatio).toBeNull();
  });

  it('respects minMentions filter', async () => {
    const { placeId } = await seedRestaurantWithMentions(app, [
      { name: 'A', nameNorm: 'a', sentiment: 'positive' },
      { name: 'A', nameNorm: 'a', sentiment: 'positive' },
      { name: 'B', nameNorm: 'b', sentiment: 'positive' }, // mention=1, 필터 컷
    ]);
    const service = new MenuGroupingService(app.prisma, aiConfig, {
      resolveOverride: async () => null,
    });
    const ranking = await service.getRanking(placeId, { sort: 'mentions', minMentions: 2 });
    expect(ranking.items.map((i) => i.canonicalName)).toEqual(['A']);
  });

  it('aggregates topTraits across the bucket', async () => {
    const { placeId } = await seedRestaurantWithMentions(app, [
      { name: '김치찌개', nameNorm: '김치찌개', sentiment: 'positive', traits: ['진한', '얼큰한'] },
      { name: '김치찌개', nameNorm: '김치찌개', sentiment: 'positive', traits: ['진한'] },
      { name: '김치찌개', nameNorm: '김치찌개', sentiment: 'neutral', traits: ['얼큰한', '담백한'] },
    ]);
    const service = new MenuGroupingService(app.prisma, aiConfig, {
      resolveOverride: async () => null,
    });
    const ranking = await service.getRanking(placeId, { sort: 'mentions', minMentions: 1 });
    expect(ranking.items[0].topTraits).toEqual(['진한', '얼큰한', '담백한']);
  });

  it('attaches global comparison stats when MenuCanonical is linked', async () => {
    // 식당 A — 김치찌개 멘션 3개 (긍정 2 / 부정 1)
    const { placeId: placeA, restaurantId: ridA } = await seedRestaurantWithMentions(
      app,
      [
        { name: '김치찌개', nameNorm: '김치찌개', sentiment: 'positive' },
        { name: '김치찌개', nameNorm: '김치찌개', sentiment: 'positive' },
        { name: '김치찌개', nameNorm: '김치찌개', sentiment: 'negative' },
      ],
      { name: '식당 A' },
    );
    // 식당 B — 묵은지김치찌개 멘션 2개 (긍정 1 / 부정 1)
    const { restaurantId: ridB } = await seedRestaurantWithMentions(
      app,
      [
        { name: '묵은지김치찌개', nameNorm: '묵은지김치찌개', sentiment: 'positive' },
        { name: '묵은지김치찌개', nameNorm: '묵은지김치찌개', sentiment: 'negative' },
      ],
      { name: '식당 B' },
    );

    // MenuCanonical + GlobalMenuCanonical + Link 직접 시드 (LLM 우회).
    const mcA = await app.prisma.menuCanonical.create({
      data: {
        restaurantId: ridA,
        nameNorm: '김치찌개',
        canonicalName: '김치찌개',
        canonicalNorm: '김치찌개',
        version: 1,
        model: 'seed',
      },
    });
    const mcB = await app.prisma.menuCanonical.create({
      data: {
        restaurantId: ridB,
        nameNorm: '묵은지김치찌개',
        canonicalName: '김치찌개',
        canonicalNorm: '김치찌개',
        version: 1,
        model: 'seed',
      },
    });
    const global = await app.prisma.globalMenuCanonical.create({
      data: {
        globalKey: 'gk-test-김치찌개',
        displayName: '김치찌개',
        version: 1,
        model: 'seed',
      },
    });
    await app.prisma.globalMenuCanonicalLink.createMany({
      data: [
        {
          menuCanonicalId: mcA.id,
          restaurantId: ridA,
          localCanonicalNorm: '김치찌개',
          globalCanonicalId: global.id,
        },
        {
          menuCanonicalId: mcB.id,
          restaurantId: ridB,
          localCanonicalNorm: '김치찌개',
          globalCanonicalId: global.id,
        },
      ],
    });

    const service = new MenuGroupingService(app.prisma, aiConfig, {
      resolveOverride: async () => null,
    });
    const ranking = await service.getRanking(placeA, { sort: 'mentions', minMentions: 1 });
    const kim = ranking.items.find((i) => i.canonicalKey === '김치찌개');
    expect(kim).toBeDefined();
    // 자기 식당 통계.
    expect(kim!.mentionCount).toBe(3);
    expect(kim!.positive).toBe(2);
    expect(kim!.negative).toBe(1);
    // 글로벌 비교 — A + B 합산 (긍 3 / 부 2).
    expect(kim!.global).toBeDefined();
    expect(kim!.global!.globalKey).toBe('gk-test-김치찌개');
    expect(kim!.global!.totalMentions).toBe(5);
    expect(kim!.global!.positive).toBe(3);
    expect(kim!.global!.negative).toBe(2);
    expect(kim!.global!.restaurantCount).toBe(2);
    expect(kim!.global!.positiveRatio).toBeCloseTo(3 / 5);

    // 정리 — globalMenuCanonical 은 별도 테스트 cleanup 에 포함 안 되므로 명시 삭제.
    await app.prisma.globalMenuCanonical.delete({ where: { id: global.id } });
  });

  it('leaves global field null when MenuCanonical has no global link', async () => {
    const { placeId } = await seedRestaurantWithMentions(app, [
      { name: '돈까스', nameNorm: '돈까스', sentiment: 'positive' },
    ]);
    const service = new MenuGroupingService(app.prisma, aiConfig, {
      resolveOverride: async () => null,
    });
    const ranking = await service.getRanking(placeId, { sort: 'mentions', minMentions: 1 });
    expect(ranking.items[0].global).toBeNull();
  });

  it('reports restaurant status with distinct/mapped/unmapped counts', async () => {
    const { placeId } = await seedRestaurantWithMentions(app, [
      { name: '김치찌개', nameNorm: '김치찌개', sentiment: 'positive' },
      { name: '된장찌개', nameNorm: '된장찌개', sentiment: 'positive' },
    ]);

    // 한 nameNorm 만 매핑.
    const restaurant = await app.prisma.restaurant.findUniqueOrThrow({
      where: { placeId },
      select: { id: true },
    });
    await app.prisma.menuCanonical.create({
      data: {
        restaurantId: restaurant.id,
        nameNorm: '김치찌개',
        canonicalName: '김치찌개',
        canonicalNorm: '김치찌개',
        version: 1,
        model: 'fake',
      },
    });

    const service = new MenuGroupingService(app.prisma, aiConfig, {
      resolveOverride: async () => null,
    });
    const statuses = await service.getRestaurantsStatus();
    const row = statuses.find((s) => s.placeId === placeId);
    expect(row).toBeDefined();
    expect(row!.distinctMenus).toBe(2);
    expect(row!.mappedMenus).toBe(1);
    expect(row!.unmappedMenus).toBe(1);
    expect(row!.lastGroupedAt).not.toBeNull();
    expect(row!.storedVersion).toBe(1);
  });
});
