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
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { SummaryEventsBus } from './summary-events-bus.js';
import {
  SummaryService,
  cleanupStaleReviewSummaries,
  rescheduleStaleSummaries,
  summaryChannelKey,
} from './summary.service.js';

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

  // 어댑터가 JSON 객체 형태로 응답한다고 가정한 헬퍼. 코드펜스를 섞어
  // 보내도 파서가 첫 `{` ~ 마지막 `}`만 잘라내는지를 함께 확인한다.
  const analysisJson = (summary: string) =>
    '```json\n' +
    JSON.stringify({
      summary,
      sentiment: 'positive',
      sentimentScore: 0.8,
      satisfactionScore: 5,
      menus: [{ name: '김치찌개', sentiment: 'positive', traits: ['얼큰한'] }],
      tips: ['예약 권장'],
      keywords: ['아늑함', '친절'],
    }) +
    '\n```';

  it('marks all rows as done with parsed analysis on success', async () => {
    const { placeId, reviewIds } = await seed(['리뷰 본문 1', '리뷰 본문 2']);
    const provider = fakeProvider(async (_model, prompt) => ({
      text: analysisJson(`요약: ${prompt.slice(0, 8)}`),
      model: 'test-model',
      promptTokens: 10,
      completionTokens: 5,
    }));
    const aiConfig = new AiConfigService(app.prisma, {
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
      expect(r.sentiment).toBe('positive');
      expect(r.sentimentScore).toBeCloseTo(0.8);
      expect(r.satisfactionScore).toBe(5);
      expect(r.analysisVersion).toBe(4);
      expect(JSON.parse(r.menusJson ?? '[]')).toEqual([
        { name: '김치찌개', sentiment: 'positive', traits: ['얼큰한'] },
      ]);
      expect(JSON.parse(r.tipsJson ?? '[]')).toEqual(['예약 권장']);
      expect(JSON.parse(r.keywordsJson ?? '[]')).toEqual(['아늑함', '친절']);
    }
  });

  it('extracts JSON even when LLM wraps it in <think> reasoning and prose', async () => {
    const { placeId, reviewIds } = await seed(['리뷰 본문']);
    const wrapped =
      '<think>이건 긍정적인 리뷰 같다. {잡설} 점수는 대략...</think>\n' +
      '다음은 분석 결과입니다:\n' +
      '```json\n' +
      JSON.stringify({
        summary: '맛있고 친절',
        sentiment: 'positive',
        sentimentScore: 0.9,
        satisfactionScore: 5,
        menus: [{ name: '파스타', sentiment: 'positive' }],
        tips: [],
        keywords: ['친절'],
      }) +
      '\n```\n이상입니다.';
    const provider = fakeProvider(async () => ({
      text: wrapped,
      model: 'm',
      promptTokens: 10,
      completionTokens: 10,
    }));
    const aiConfig = new AiConfigService(app.prisma, {
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
    const service = new SummaryService(app.prisma, aiConfig, {
      resolveOverride: async () => ({ provider, model: 'm' }),
    });

    await service.runForTests(placeId, reviewIds);

    const row = await app.prisma.reviewSummary.findUnique({
      where: { reviewId: reviewIds[0]! },
    });
    expect(row?.status).toBe('done');
    expect(row?.sentiment).toBe('positive');
    expect(row?.text).toBe('맛있고 친절');
  });

  it('retries failed reviews and succeeds within the retry budget', async () => {
    const { placeId, reviewIds } = await seed(['리뷰']);
    let calls = 0;
    const provider = fakeProvider(async () => {
      calls += 1;
      if (calls < 3) {
        // 처음 두 번은 형태가 깨진 응답 → parseAnalysis 가 null 반환.
        return { text: '잘못된 응답', model: 'm', promptTokens: 1, completionTokens: 1 };
      }
      return {
        text: analysisJson('성공'),
        model: 'm',
        promptTokens: 1,
        completionTokens: 1,
      };
    });
    const aiConfig = new AiConfigService(app.prisma, {
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
    const service = new SummaryService(app.prisma, aiConfig, {
      resolveOverride: async () => ({ provider, model: 'm' }),
    });

    await service.runForTests(placeId, reviewIds);

    expect(calls).toBe(3);
    const row = await app.prisma.reviewSummary.findUnique({
      where: { reviewId: reviewIds[0]! },
    });
    expect(row?.status).toBe('done');
    expect(row?.text).toBe('성공');
    expect(row?.errorCode).toBeNull();
  });

  it('marks rows as failed with parse_failed when LLM returns invalid JSON', async () => {
    const { placeId, reviewIds } = await seed(['리뷰']);
    const provider = fakeProvider(async () => ({
      text: '죄송하지만 분석할 수 없습니다.',
      model: 'm',
      promptTokens: 1,
      completionTokens: 1,
    }));
    const aiConfig = new AiConfigService(app.prisma, {
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
    const service = new SummaryService(app.prisma, aiConfig, {
      resolveOverride: async () => ({ provider, model: 'm' }),
    });

    await service.runForTests(placeId, reviewIds);

    const row = await app.prisma.reviewSummary.findUnique({
      where: { reviewId: reviewIds[0]! },
    });
    expect(row?.status).toBe('failed');
    expect(row?.errorCode).toBe('parse_failed');
    expect(row?.text).toBeNull();
    expect(row?.sentiment).toBeNull();
  });

  it('records failures per row without aborting siblings', async () => {
    const { placeId, reviewIds } = await seed(['ok', 'will fail', 'ok2']);
    const provider = fakeProvider(async (_model, prompt) => {
      if (prompt.includes('will fail')) throw new LLMUpstreamError(500, 'boom');
      return {
        text: analysisJson(`요약 ${prompt.slice(0, 8)}`),
        model: 'm',
        promptTokens: 1,
        completionTokens: 1,
      };
    });
    const aiConfig = new AiConfigService(app.prisma, {
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
      text: analysisJson(`요약 ${prompt.slice(0, 8)}`),
      model: 'm',
      promptTokens: 1,
      completionTokens: 1,
    }));
    const aiConfig = new AiConfigService(app.prisma, {
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
      defaultModels: {
        chat: '',
        image: '',
        'log-analysis': '',
        'meal-photo': '',
        'meal-recommend': '',
      },
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

// 부팅 정리는 DB 전역의 queued/pending/running 을 전부 failed(server_restart) 로 바꾼다. 실 dev.db
// 에서 돌리면 개발 서버에서 요약을 기다리던 행(예: AI 키 없이 크롤한 가게의 pending 전부)까지 뒤집고,
// 그런 행이 있으면 건수 단언도 깨진다 — 빈 DB 로 격리한다.
describe('cleanupStaleReviewSummaries', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let restaurantService: RestaurantService;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp();
    restaurantService = new RestaurantService(app.prisma);
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  const seed = async (reviewBodies: string[]): Promise<{ reviewIds: string[] }> => {
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
    return { reviewIds: newReviews.map((r) => r.id) };
  };

  it('marks pending/running rows as failed with server_restart errorCode, leaves done/failed untouched', async () => {
    const { reviewIds } = await seed(['a', 'b', 'c', 'd']);
    const [rPending, rRunning, rDone, rFailed] = reviewIds as [string, string, string, string];

    await app.prisma.reviewSummary.create({
      data: { reviewId: rPending, status: 'pending', startedAt: new Date() },
    });
    await app.prisma.reviewSummary.create({
      data: { reviewId: rRunning, status: 'running', startedAt: new Date() },
    });
    await app.prisma.reviewSummary.create({
      data: {
        reviewId: rDone,
        status: 'done',
        text: 'done text',
        finishedAt: new Date(),
      },
    });
    await app.prisma.reviewSummary.create({
      data: {
        reviewId: rFailed,
        status: 'failed',
        errorCode: 'parse_failed',
        errorMessage: 'prev failure',
        finishedAt: new Date(),
      },
    });

    const count = await cleanupStaleReviewSummaries(app.prisma);
    expect(count).toBe(2);

    const after = await app.prisma.reviewSummary.findMany({
      where: { reviewId: { in: reviewIds } },
    });
    const byId = new Map(after.map((r) => [r.reviewId, r]));

    expect(byId.get(rPending)?.status).toBe('failed');
    expect(byId.get(rPending)?.errorCode).toBe('server_restart');
    expect(byId.get(rPending)?.finishedAt).not.toBeNull();
    expect(byId.get(rRunning)?.status).toBe('failed');
    expect(byId.get(rRunning)?.errorCode).toBe('server_restart');
    expect(byId.get(rDone)?.status).toBe('done');
    expect(byId.get(rDone)?.text).toBe('done text');
    expect(byId.get(rFailed)?.status).toBe('failed');
    expect(byId.get(rFailed)?.errorCode).toBe('parse_failed');
  });

  it('returns 0 when nothing is stale', async () => {
    const count = await cleanupStaleReviewSummaries(app.prisma);
    expect(count).toBe(0);
  });
});

describe('summaryChannelKey', () => {
  it('출처별 채널 키 — 네이버 placeId, 다이닝코드 dc:, 테이블링 tb:', () => {
    expect(summaryChannelKey({ source: 'naver', sourceId: '123', placeId: '123' })).toBe('123');
    expect(summaryChannelKey({ source: 'diningcode', sourceId: 'vRid1', placeId: null })).toBe(
      'dc:vRid1',
    );
    expect(summaryChannelKey({ source: 'tabling', sourceId: '3749', placeId: null })).toBe(
      'tb:3749',
    );
  });
});

describe('SummaryService — 가게(canonical) 단위 요약 운영', () => {
  let app: FastifyInstance;
  // 새 canonical·요약 행이 dev.db 에 남지 않게 빈 DB 로 격리한다(부팅 정리 테스트가
  // dev.db 의 pending/running 행 0 을 전제로 한다).
  let isolated: IsolatedDatabase;
  const PREFIX = 'ts-canon-';
  const uid = () => `${PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  const noProviderService = (bus: SummaryEventsBus) =>
    new SummaryService(
      app.prisma,
      new AiConfigService(app.prisma, {
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
      }),
      // provider 없음 — 큐에 오른 행은 pending 으로 남고 LLM 은 부르지 않는다.
      { resolveOverride: async () => null, bus },
    );

  // 네이버 행 + 같은 canonical 의 다이닝코드·테이블링 형제. 채널 키도 같이 돌려준다.
  const seedCanonical = async () => {
    const placeId = uid();
    const naver = await app.prisma.restaurant.create({
      data: {
        source: 'naver',
        sourceId: placeId,
        placeId,
        name: '요약 운영집',
        rawSourceUrl: 'https://m.place.naver.com/x',
        snapshotJson: '{}',
        canonical: { create: { name: '요약 운영집' } },
      },
      select: { id: true, canonicalId: true },
    });
    const sibling = async (source: 'diningcode' | 'tabling') => {
      const sourceId = uid();
      const row = await app.prisma.restaurant.create({
        data: {
          source,
          sourceId,
          name: `요약 운영집(${source})`,
          rawSourceUrl: 'https://example.com',
          snapshotJson: '{}',
          canonicalId: naver.canonicalId,
        },
        select: { id: true },
      });
      return { id: row.id, sourceId };
    };
    const dc = await sibling('diningcode');
    const tb = await sibling('tabling');
    return {
      placeId,
      canonicalId: naver.canonicalId,
      naverId: naver.id,
      dcId: dc.id,
      tbId: tb.id,
      keys: { naver: placeId, dc: `dc:${dc.sourceId}`, tb: `tb:${tb.sourceId}` },
    };
  };

  const seedReview = async (restaurantId: string, status: string | null): Promise<string> => {
    const v = await app.prisma.visitorReview.create({
      data: {
        restaurantId,
        authorName: 'a',
        rating: 5,
        body: `리뷰 ${uid()}`,
        visitedAt: null,
        imageUrlsJson: '[]',
        videosJson: '[]',
        contentHash: uid(),
      },
      select: { id: true },
    });
    if (status) {
      await app.prisma.reviewSummary.create({ data: { reviewId: v.id, status } });
    }
    return v.id;
  };

  const statusOf = async (reviewIds: string[]) => {
    const rows = await app.prisma.reviewSummary.findMany({
      where: { reviewId: { in: reviewIds } },
      select: { reviewId: true, status: true },
    });
    return new Map(rows.map((r) => [r.reviewId, r.status]));
  };

  // 큐 적재·체인은 fire-and-forget — 조건이 설 때까지 짧게 기다린다.
  const waitUntil = async (check: () => Promise<boolean>, timeoutMs = 5_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('waitUntil timeout');
  };

  const recordBus = (bus: SummaryEventsBus, keys: string[]) => {
    const fired = new Set<string>();
    const unsubs = keys.map((k) => bus.subscribe(k, () => fired.add(k)));
    return { fired, stop: () => unsubs.forEach((u) => u()) };
  };

  it('중지는 모든 출처의 queued/pending 을 cancelled 로 — 뒤이어 온 다른 출처 적재도 막고, 재개가 모두 풀어 준다', async () => {
    const c = await seedCanonical();
    const nQueued = await seedReview(c.naverId, 'queued');
    const nDone = await seedReview(c.naverId, 'done');
    const dPending = await seedReview(c.dcId, 'pending');
    const tQueued = await seedReview(c.tbId, 'queued');
    const tRunning = await seedReview(c.tbId, 'running');
    const bus = new SummaryEventsBus();
    const rec = recordBus(bus, [c.keys.naver, c.keys.dc, c.keys.tb]);
    const service = noProviderService(bus);

    expect(await service.cancelSummaryForPlace(c.placeId)).toBe(3);
    let st = await statusOf([nQueued, nDone, dPending, tQueued, tRunning]);
    expect(st.get(nQueued)).toBe('cancelled');
    expect(st.get(dPending)).toBe('cancelled');
    expect(st.get(tQueued)).toBe('cancelled');
    // running·done 은 손대지 않는다.
    expect(st.get(tRunning)).toBe('running');
    expect(st.get(nDone)).toBe('done');
    // 세 채널 모두에 진행 신호.
    expect([...rec.fired].sort()).toEqual([c.keys.dc, c.keys.naver, c.keys.tb].sort());

    // 중지 표식은 출처 채널마다 — 다이닝코드 재수집으로 새 리뷰가 적재돼도 cancelled 로 박힌다.
    const dNew = await seedReview(c.dcId, null);
    service.queueSummariesForReviews(c.keys.dc, [dNew]);
    await waitUntil(async () => (await statusOf([dNew])).get(dNew) === 'cancelled');

    // 재개 — 모든 출처의 cancelled(4건)를 다시 큐잉. provider 가 없어 pending 에서 멈춘다.
    expect(await service.resumeSummaryForPlace(c.placeId)).toBe(4);
    const resumed = [nQueued, dPending, tQueued, dNew];
    await waitUntil(async () => {
      const now = await statusOf(resumed);
      return resumed.every((id) => now.get(id) === 'pending');
    });
    st = await statusOf([tRunning, nDone]);
    expect(st.get(tRunning)).toBe('running');
    expect(st.get(nDone)).toBe('done');
    rec.stop();
  });

  it('재분석(backfill)은 모든 출처의 failed·cancelled 를 큐잉하고 합계를 돌려준다', async () => {
    const c = await seedCanonical();
    const nFailed = await seedReview(c.naverId, 'failed');
    const dFailed = await seedReview(c.dcId, 'failed');
    const tCancelled = await seedReview(c.tbId, 'cancelled');
    const tRunning = await seedReview(c.tbId, 'running');
    const service = noProviderService(new SummaryEventsBus());

    expect(await service.backfillForRestaurant(c.placeId)).toBe(3);
    const targets = [nFailed, dFailed, tCancelled];
    await waitUntil(async () => {
      const now = await statusOf(targets);
      return targets.every((id) => now.get(id) === 'pending');
    });
    expect((await statusOf([tRunning])).get(tRunning)).toBe('running');
    expect(await service.backfillForRestaurant(`${PREFIX}unknown`)).toBe(0);
  });

  it('단건 재요약 — 테이블링 리뷰는 tb: 채널로 큐잉되고 canonicalId 를 돌려준다', async () => {
    const c = await seedCanonical();
    const tDone = await seedReview(c.tbId, 'done');
    const bus = new SummaryEventsBus();
    const rec = recordBus(bus, [c.keys.tb, `dc:${c.keys.tb.slice(3)}`]);
    const service = noProviderService(bus);

    const res = await service.resummarizeReview(tDone, 'model-x');
    expect(res).toEqual({ placeId: null, canonicalId: c.canonicalId });
    await waitUntil(async () => (await statusOf([tDone])).get(tDone) === 'pending');
    expect([...rec.fired]).toEqual([c.keys.tb]);
    rec.stop();

    expect(await service.resummarizeReview('no-such-review', 'model-x')).toEqual({
      placeId: null,
      canonicalId: null,
    });
  });

  it('부팅 재큐잉은 크롤 적재와 같은 채널 키(dc:·tb:)를 쓴다', async () => {
    const c = await seedCanonical();
    const ids = {
      naver: await seedReview(c.naverId, null),
      dc: await seedReview(c.dcId, null),
      tb: await seedReview(c.tbId, null),
    };
    await app.prisma.reviewSummary.createMany({
      data: Object.values(ids).map((reviewId) => ({
        reviewId,
        status: 'failed',
        errorCode: 'server_restart',
      })),
    });
    const queued = new Map<string, string[]>();
    const result = await rescheduleStaleSummaries(app.prisma, {
      queueSummariesForReviews: (key, reviewIds) => {
        queued.set(key, reviewIds);
      },
    });
    expect(result).toEqual({ keys: 3, reviews: 3 });
    expect(queued.get(c.keys.naver)).toEqual([ids.naver]);
    expect(queued.get(c.keys.dc)).toEqual([ids.dc]);
    expect(queued.get(c.keys.tb)).toEqual([ids.tb]);
  });
});
