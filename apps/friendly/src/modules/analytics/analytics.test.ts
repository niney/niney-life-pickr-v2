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
import { AnalyticsError, AnalyticsService } from './analytics.service.js';

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

// 다른 테스트와 격리되도록 prefix 분리 — afterEach 에서 placeId prefix 매치로
// 청소한다.
const PLACE_PREFIX = 'an-';
const stamp = (): string =>
  `${PLACE_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface FakeProviderTrace {
  calls: { systemPrompt: string; prompt: string }[];
}

const fakeProvider = (
  reply: (prompt: string, callIndex: number) => string | Record<string, unknown>,
  trace: FakeProviderTrace = { calls: [] },
): { provider: LLMProvider; trace: FakeProviderTrace } => ({
  provider: {
    complete: async ({ prompt, systemPrompt }) => {
      const idx = trace.calls.length;
      trace.calls.push({ systemPrompt: systemPrompt ?? '', prompt });
      const result = reply(prompt, idx);
      return {
        text: typeof result === 'string' ? result : JSON.stringify(result),
        model: 'fake-model',
        promptTokens: 10,
        completionTokens: 10,
      };
    },
  },
  trace,
});

interface SeedMenu {
  name: string;
  nameNorm: string;
  // 식당 내 그룹핑 결과 — MenuCanonical 행을 직접 만들기 위함.
  canonicalName: string;
  canonicalNorm: string;
  // 통계 검증을 위해 멘션 sentiment 도 같이 시드.
  mentions: { sentiment: 'positive' | 'negative' | 'neutral' }[];
}

interface SeededRestaurant {
  placeId: string;
  restaurantId: string;
  menuCanonicalIds: Map<string, string>; // canonicalNorm → menuCanonical.id
}

const seedRestaurant = async (
  app: FastifyInstance,
  menus: SeedMenu[],
  meta: { name?: string; category?: string | null } = {},
): Promise<SeededRestaurant> => {
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

  // MenuCanonical (식당별 그룹) 시드.
  const canonicalIds = new Map<string, string>();
  for (const m of menus) {
    const created = await app.prisma.menuCanonical.create({
      data: {
        restaurantId: rest.id,
        nameNorm: m.nameNorm,
        canonicalName: m.canonicalName,
        canonicalNorm: m.canonicalNorm,
        version: 1,
        model: 'seed',
      },
      select: { id: true },
    });
    canonicalIds.set(m.canonicalNorm, created.id);
  }

  // MenuMention 도 같이 시드 — getGlobalMenus 의 멘션 카운트 검증용.
  const mentionRows = menus.flatMap((m) =>
    m.mentions.map((mn) => ({
      summaryId: summary.id,
      restaurantId: rest.id,
      name: m.name,
      nameNorm: m.nameNorm,
      sentiment: mn.sentiment,
      traitsJson: '[]',
    })),
  );
  if (mentionRows.length > 0) {
    await app.prisma.menuMention.createMany({ data: mentionRows });
  }

  return { placeId, restaurantId: rest.id, menuCanonicalIds: canonicalIds };
};

describe('AnalyticsService.runGlobalMerge', () => {
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
    // 글로벌 머지가 테이블 전체를 갈아엎으므로 Restaurant onDelete:Cascade 로
    // MenuCanonical 까지 정리되지만 GlobalMenuCanonical 은 식당과 무관하다.
    // 다음 테스트가 깨끗한 상태에서 시작하도록 명시적 청소.
    await app.prisma.globalMenuCanonical.deleteMany({});
  });

  it('two-pass merge: pass1 keeps variant→canonical, pass2 collapses cross-chunk conflicts', async () => {
    // 식당 두 개에서 distinct canonical 이 4개 — 입력은 한 청크 안에 들어간다
    // (chunk size 60). 따라서 pass1 청크 1번 + pass2 한 번 = 2 LLM 호출.
    await seedRestaurant(app, [
      {
        name: '김치찌개',
        nameNorm: '김치찌개',
        canonicalName: '김치찌개',
        canonicalNorm: '김치찌개',
        mentions: [{ sentiment: 'positive' }, { sentiment: 'positive' }],
      },
      {
        name: '차돌박이된장찌개',
        nameNorm: '차돌박이된장찌개',
        canonicalName: '차돌박이된장찌개',
        canonicalNorm: '차돌박이된장찌개',
        mentions: [{ sentiment: 'negative' }],
      },
    ]);
    await seedRestaurant(app, [
      {
        name: '묵은지 김치찌개',
        nameNorm: '묵은지김치찌개',
        canonicalName: '묵은지 김치찌개',
        canonicalNorm: '묵은지김치찌개',
        mentions: [{ sentiment: 'positive' }],
      },
      {
        name: '돈까스',
        nameNorm: '돈까스',
        canonicalName: '돈까스',
        canonicalNorm: '돈까스',
        mentions: [{ sentiment: 'positive' }],
      },
    ]);

    const { provider, trace } = fakeProvider((_p, idx) => {
      if (idx === 0) {
        // pass1 — LLM 이 묵은지 김치찌개를 별도 그룹으로 분류 (실수 상정).
        return {
          김치찌개: '김치찌개',
          차돌박이된장찌개: '차돌박이된장찌개',
          '묵은지 김치찌개': '묵은지 김치찌개',
          돈까스: '돈까스',
        };
      }
      // pass2 — pass1 의 distinct canonical 들 사이에서 충돌 해소.
      // 묵은지를 김치찌개로 흡수.
      return {
        김치찌개: '김치찌개',
        차돌박이된장찌개: '차돌박이된장찌개',
        '묵은지 김치찌개': '김치찌개',
        돈까스: '돈까스',
      };
    });

    const service = new AnalyticsService(app.prisma, aiConfig, {
      resolveOverride: async () => ({ provider, model: 'override-model' }),
    });

    const result = await service.runGlobalMerge({ full: true });
    // dev.db 에 다른 환경에서 만든 잔재가 있을 수 있어 절대값 대신 하한 비교.
    // 우리가 시드한 distinct nameNorm 4개는 입력에 반드시 포함된다.
    expect(result.inputCount).toBeGreaterThanOrEqual(4);
    expect(trace.calls.length).toBeGreaterThanOrEqual(2);
    // 모든 호출의 system prompt 가 머지 프롬프트.
    expect(trace.calls[0].systemPrompt).toContain('식당 가로지르기');

    // 자기 시드의 globalKey 들이 모두 존재하는지 — 잔재 키와 별개로.
    const wantedKeys = ['김치찌개', '차돌박이된장찌개', '돈까스'];
    const globals = await app.prisma.globalMenuCanonical.findMany({
      where: { globalKey: { in: wantedKeys } },
    });
    expect(globals.map((g) => g.globalKey).sort()).toEqual(wantedKeys.slice().sort());

    // Link 검증 — pass2 가 묵은지를 김치찌개로 흡수했는지 확인.
    const links = await app.prisma.globalMenuCanonicalLink.findMany({
      where: { menuCanonical: { canonicalNorm: { in: ['묵은지김치찌개', '김치찌개'] } } },
      include: {
        global: { select: { globalKey: true } },
        menuCanonical: { select: { canonicalNorm: true } },
      },
    });
    const muekUnji = links.find((l) => l.menuCanonical.canonicalNorm === '묵은지김치찌개');
    expect(muekUnji?.global.globalKey).toBe('김치찌개');
    const kim = links.find((l) => l.menuCanonical.canonicalNorm === '김치찌개');
    expect(kim?.global.globalKey).toBe('김치찌개');
  });

  it('falls back to identity when LLM omits a key', async () => {
    await seedRestaurant(app, [
      {
        name: '돈까스',
        nameNorm: '돈까스',
        canonicalName: '돈까스',
        canonicalNorm: '돈까스',
        mentions: [{ sentiment: 'positive' }],
      },
      {
        name: '치즈돈까스',
        nameNorm: '치즈돈까스',
        canonicalName: '치즈돈까스',
        canonicalNorm: '치즈돈까스',
        mentions: [{ sentiment: 'neutral' }],
      },
    ]);

    // LLM 이 '치즈돈까스' 만 응답하고 '돈까스' 키를 빼먹음.
    const { provider } = fakeProvider(() => ({ 치즈돈까스: '치즈돈까스' }));
    const service = new AnalyticsService(app.prisma, aiConfig, {
      resolveOverride: async () => ({ provider, model: 'm' }),
    });

    await service.runGlobalMerge({ full: true });
    // 누락 입력은 자기 자신을 canonical 로 — 두 그룹 모두 살아있어야 한다.
    const globals = await app.prisma.globalMenuCanonical.findMany({
      where: { globalKey: { in: ['돈까스', '치즈돈까스'] } },
    });
    expect(globals.map((g) => g.globalKey).sort()).toEqual(['돈까스', '치즈돈까스']);
  });

  it('throws no_provider when LLM is not configured', async () => {
    await seedRestaurant(app, [
      {
        name: '김치찌개',
        nameNorm: '김치찌개',
        canonicalName: '김치찌개',
        canonicalNorm: '김치찌개',
        mentions: [{ sentiment: 'positive' }],
      },
    ]);
    const service = new AnalyticsService(app.prisma, aiConfig, {
      resolveOverride: async () => null,
    });
    await expect(service.runGlobalMerge({ full: true })).rejects.toBeInstanceOf(
      AnalyticsError,
    );
  });

  it('emits chunk progress callbacks for both passes', async () => {
    await seedRestaurant(app, [
      {
        name: 'A',
        nameNorm: 'a',
        canonicalName: 'A',
        canonicalNorm: 'a',
        mentions: [{ sentiment: 'positive' }],
      },
      {
        name: 'B',
        nameNorm: 'b',
        canonicalName: 'B',
        canonicalNorm: 'b',
        mentions: [{ sentiment: 'positive' }],
      },
    ]);
    const { provider } = fakeProvider(() => ({ A: 'A', B: 'B' }));
    const service = new AnalyticsService(app.prisma, aiConfig, {
      resolveOverride: async () => ({ provider, model: 'm' }),
    });

    const chunks: { pass: number; chunkIndex: number; chunkTotal: number }[] = [];
    await service.runGlobalMerge(
      { full: true },
      {
        onChunk: (info) =>
          chunks.push({
            pass: info.pass,
            chunkIndex: info.chunkIndex,
            chunkTotal: info.chunkTotal,
          }),
      },
    );
    // pass1 1청크 + pass2 1청크.
    expect(chunks.map((c) => c.pass)).toEqual([1, 2]);
  });
});

describe('AnalyticsService.getGlobalMenus / getOverview', () => {
  let app: FastifyInstance;
  let aiConfig: AiConfigService;
  let service: AnalyticsService;

  beforeAll(async () => {
    app = await buildApp();
    aiConfig = new AiConfigService(app.prisma, {
      apiKey: '',
      baseUrl: '',
      timeoutMs: 1000,
      maxConcurrent: 1,
      defaultModel: '',
    });
    // resolveOverride: null — runGlobalMerge 는 이 describe 에서 호출 안 함.
    service = new AnalyticsService(app.prisma, aiConfig, {
      resolveOverride: async () => null,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await app.prisma.restaurant.deleteMany({
      where: { placeId: { startsWith: PLACE_PREFIX } },
    });
    await app.prisma.globalMenuCanonical.deleteMany({});
  });

  // 두 식당의 같은 캐논(김치찌개) 을 글로벌 한 그룹으로 직접 연결 + 통계 검증.
  // runGlobalMerge 를 거치지 않고 GlobalMenuCanonical / Link 를 손으로 만든다 —
  // 통계 함수를 LLM 의존 없이 단독 검증.
  it('aggregates linked menus across restaurants with topRestaurants', async () => {
    const r1 = await seedRestaurant(
      app,
      [
        {
          name: '김치찌개',
          nameNorm: '김치찌개',
          canonicalName: '김치찌개',
          canonicalNorm: '김치찌개',
          mentions: [
            { sentiment: 'positive' },
            { sentiment: 'positive' },
            { sentiment: 'negative' },
          ],
        },
      ],
      { name: 'A 식당' },
    );
    const r2 = await seedRestaurant(
      app,
      [
        {
          name: '묵은지김치찌개',
          nameNorm: '묵은지김치찌개',
          canonicalName: '묵은지김치찌개',
          canonicalNorm: '묵은지김치찌개',
          mentions: [{ sentiment: 'positive' }],
        },
      ],
      { name: 'B 식당' },
    );

    // 글로벌 그룹 + 두 식당 각각 링크.
    const global = await app.prisma.globalMenuCanonical.create({
      data: {
        globalKey: '김치찌개',
        displayName: '김치찌개',
        version: 1,
        model: 'fake',
      },
    });
    await app.prisma.globalMenuCanonicalLink.create({
      data: {
        menuCanonicalId: r1.menuCanonicalIds.get('김치찌개')!,
        restaurantId: r1.restaurantId,
        localCanonicalNorm: '김치찌개',
        globalCanonicalId: global.id,
      },
    });
    await app.prisma.globalMenuCanonicalLink.create({
      data: {
        menuCanonicalId: r2.menuCanonicalIds.get('묵은지김치찌개')!,
        restaurantId: r2.restaurantId,
        localCanonicalNorm: '묵은지김치찌개',
        globalCanonicalId: global.id,
      },
    });

    const result = await service.getGlobalMenus({
      sort: 'mentions',
      minMentions: 1,
      limit: 200,
      includeUnlinked: false,
    });
    const item = result.items.find((i) => i.globalKey === '김치찌개');
    expect(item).toBeDefined();
    // A: pos=2 neg=1 (3) + B: pos=1 (1) = 4
    expect(item!.totalMentions).toBe(4);
    expect(item!.positive).toBe(3);
    expect(item!.negative).toBe(1);
    expect(item!.restaurantCount).toBe(2);
    expect(item!.positiveRatio).toBeCloseTo(3 / 4);

    // topRestaurants — A 식당이 멘션 더 많아 첫 번째.
    const topA = item!.topRestaurants.find((r) => r.name === 'A 식당');
    const topB = item!.topRestaurants.find((r) => r.name === 'B 식당');
    expect(topA?.mentionCount).toBe(3);
    expect(topB?.mentionCount).toBe(1);
  });

  it('includes unlinked menu canonicals when includeUnlinked=true', async () => {
    await seedRestaurant(app, [
      {
        name: '돈까스',
        nameNorm: '돈까스',
        canonicalName: '돈까스',
        canonicalNorm: '돈까스',
        mentions: [{ sentiment: 'positive' }, { sentiment: 'positive' }],
      },
    ]);
    // 글로벌 매핑 없음.

    const linkedOnly = await service.getGlobalMenus({
      sort: 'mentions',
      minMentions: 1,
      limit: 200,
      includeUnlinked: false,
    });
    // 자기 시드의 돈까스는 글로벌 매핑이 없으므로 linked-only 결과에 안 보여야 함.
    const linkedDonkatsu = linkedOnly.items.find(
      (i) => i.displayName === '돈까스' && i.globalKey === '돈까스',
    );
    expect(linkedDonkatsu).toBeUndefined();

    const withUnlinked = await service.getGlobalMenus({
      sort: 'mentions',
      minMentions: 1,
      limit: 200,
      includeUnlinked: true,
    });
    const unlinkedDonkatsu = withUnlinked.items.find(
      (i) => i.displayName === '돈까스' && i.globalKey.startsWith('unlinked:'),
    );
    expect(unlinkedDonkatsu).toBeDefined();
    expect(unlinkedDonkatsu!.totalMentions).toBe(2);
  });

  it('filters by minMentions and q substring search', async () => {
    await seedRestaurant(app, [
      {
        name: '김치찌개',
        nameNorm: '김치찌개',
        canonicalName: '김치찌개',
        canonicalNorm: '김치찌개',
        mentions: [{ sentiment: 'positive' }, { sentiment: 'positive' }, { sentiment: 'positive' }],
      },
      {
        name: '된장찌개',
        nameNorm: '된장찌개',
        canonicalName: '된장찌개',
        canonicalNorm: '된장찌개',
        mentions: [{ sentiment: 'positive' }],
      },
    ]);

    const result = await service.getGlobalMenus({
      q: '김치찌개',
      sort: 'mentions',
      minMentions: 2,
      limit: 200,
      includeUnlinked: true,
    });
    // 자기 시드 김치찌개가 결과에 있고, 자기 시드 된장찌개는 minMentions=2 로 필터됨.
    const kim = result.items.find((i) => i.displayName === '김치찌개');
    expect(kim).toBeDefined();
    expect(kim!.totalMentions).toBeGreaterThanOrEqual(3);
    const dwen = result.items.find((i) => i.displayName === '된장찌개');
    expect(dwen).toBeUndefined();
  });

  it('overview reports counters', async () => {
    await seedRestaurant(app, [
      {
        name: '김치찌개',
        nameNorm: '김치찌개',
        canonicalName: '김치찌개',
        canonicalNorm: '김치찌개',
        mentions: [{ sentiment: 'positive' }],
      },
    ]);
    const overview = await service.getOverview();
    expect(overview.restaurantCount).toBeGreaterThanOrEqual(1);
    expect(overview.perRestaurantGroupCount).toBeGreaterThanOrEqual(1);
    // afterEach 가 globalMenuCanonical 비우니 globalGroupCount 는 0.
    expect(overview.globalGroupCount).toBe(0);
    expect(overview.globalLinkedCount).toBe(0);
    expect(overview.lastGlobalMergeAt).toBeNull();
  });
});
