import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ReviewAskResultType } from '@repo/api-contract';
import sensiblePlugin from '../../plugins/sensible.js';
import prismaPlugin from '../../plugins/prisma.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import { RestaurantService } from '../restaurant/restaurant.service.js';
import { ReviewSearchService, estimateCorpusBytes, normalizeAskQuery } from './review-search.service.js';
import { buildApp as buildFullApp } from '../../app.js';

// 공개 리뷰 질문(B-4)·질문 코퍼스 캐시(B-8). 임베딩·LLM 은 fetch 스텁으로 흉내 낸다(외부 호출 0).
// 스텁은 호출 수·동시 LLM 수를 세어 "같은 질문은 파이프라인을 다시 돌리지 않는다", "질문 경로 LLM
// 동시성은 4 이하" 를 검증한다.

const PLACE_PREFIX = 'rs-';
const stamp = () => `${PLACE_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const DIMS = 16;
const vecOf = (seed: number): number[] =>
  Array.from({ length: DIMS }, (_, i) => Math.round(Math.sin(seed * 13 + i) * 1e6) / 1e6);

interface StubState {
  embedCalls: number;
  chatCalls: number;
  chatInFlight: number;
  chatMaxInFlight: number;
  chatDelayMs: number;
  failAnswer: boolean;
}
const stub: StubState = {
  embedCalls: 0,
  chatCalls: 0,
  chatInFlight: 0,
  chatMaxInFlight: 0,
  chatDelayMs: 0,
  failAnswer: false,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fakeFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = String(input instanceof Request ? input.url : input);
  const body = JSON.parse(String(init?.body ?? '{}')) as {
    input?: string[];
    messages?: Array<{ content: string }>;
  };
  if (url.endsWith('/api/embed')) {
    stub.embedCalls += 1;
    return json({ embeddings: (body.input ?? []).map((_, i) => vecOf(i + 1)) });
  }
  if (url.endsWith('/api/chat')) {
    stub.chatCalls += 1;
    stub.chatInFlight += 1;
    stub.chatMaxInFlight = Math.max(stub.chatMaxInFlight, stub.chatInFlight);
    try {
      if (stub.chatDelayMs > 0) await new Promise((r) => setTimeout(r, stub.chatDelayMs));
      const prompt = body.messages?.[0]?.content ?? '';
      if (prompt.includes('관련도 높은 순으로')) return json({ message: { content: '{"ranking":[1,2,3]}' } });
      if (prompt.includes('사실 단위')) {
        return json({
          message: {
            content: JSON.stringify({
              claims: [{ text: '양이 많다', supported: true, span: '양이 많' }],
              revisedAnswer: '양이 많다는 평이 많아요 [1]',
            }),
          },
        });
      }
      if (stub.failAnswer) return json({ error: 'upstream' }, 503);
      return json({ message: { content: '{"answer":"양이 많다는 평이 많아요 [1]","confidence":"high"}' } });
    } finally {
      stub.chatInFlight -= 1;
    }
  }
  return json({ error: 'not stubbed' }, 404);
});

const fakeAiConfig = {
  getResolved: async () => ({ baseUrl: 'http://llm.test', apiKey: 'k', defaultModel: 'm' }),
} as unknown as AiConfigService;

const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(sensiblePlugin);
  await app.register(prismaPlugin);
  await app.ready();
  return app;
};

// 검색가능(임베딩 있는) 리뷰 n 건을 가진 네이버 가게.
const seedEnrichedPlace = async (app: FastifyInstance, n: number): Promise<{ placeId: string; restaurantId: string }> => {
  const placeId = stamp();
  const restaurants = new RestaurantService(app.prisma);
  const { id } = await restaurants.upsertRestaurantFromCrawl({
    placeId,
    name: `질문테스트-${placeId}`,
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
  for (let i = 0; i < n; i += 1) {
    const review = await app.prisma.visitorReview.create({
      data: {
        restaurantId: id,
        authorName: 'a',
        rating: 5,
        body: `리뷰 ${i} — 양이 정말 많고 맛있어요 ${'국물'.repeat(i % 3)}`,
        visitedAt: null,
        imageUrlsJson: '[]',
        contentHash: `${placeId}-${i}`,
      },
    });
    await app.prisma.reviewSummary.create({
      data: {
        reviewId: review.id,
        status: 'done',
        embeddingJson: JSON.stringify(vecOf(i + 1)),
        aspectsJson: '{"양":"pos"}',
        enrichVersion: 1,
      },
    });
  }
  return { placeId, restaurantId: id };
};

beforeEach(() => {
  Object.assign(stub, { embedCalls: 0, chatCalls: 0, chatInFlight: 0, chatMaxInFlight: 0, chatDelayMs: 0, failAnswer: false });
  fakeFetch.mockClear();
  vi.stubGlobal('fetch', fakeFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeAskQuery', () => {
  it('대소문자·공백·끝 문장부호 차이만 같은 질문으로 본다', () => {
    expect(normalizeAskQuery('  양 많아요?  ')).toBe('양 많아요');
    expect(normalizeAskQuery('양   많아요!!')).toBe('양 많아요');
    expect(normalizeAskQuery('Parking OK?')).toBe('parking ok');
    expect(normalizeAskQuery('양 많아요')).not.toBe(normalizeAskQuery('양 적어요'));
  });
});

describe('ReviewSearchService 공개 질문 (B-4) · 코퍼스 캐시 (B-8)', () => {
  let app: FastifyInstance;
  let place: { placeId: string; restaurantId: string };

  beforeAll(async () => {
    app = await buildApp();
    place = await seedEnrichedPlace(app, 12);
  });

  afterAll(async () => {
    await app.prisma.restaurant.deleteMany({ where: { placeId: { startsWith: PLACE_PREFIX } } });
    await app.close();
  });

  it('같은 질문은 답변을 재사용한다 — 두 번째는 임베딩·LLM·한도 소비 0', async () => {
    const svc = new ReviewSearchService(app.prisma, fakeAiConfig);
    const admit = vi.fn(async () => null);
    const first = await svc.askByPlaceId(place.placeId, '양 많아요?', { admit });
    expect(first?.confidence).toBe('high');
    expect(stub.chatCalls).toBe(3); // 리랭크 + 답변 + 검증
    expect(stub.embedCalls).toBe(1);

    const again = await svc.askByPlaceId(place.placeId, '  양 많아요  ', { admit });
    expect(again).toEqual(first);
    expect(stub.chatCalls).toBe(3);
    expect(stub.embedCalls).toBe(1);
    expect(admit).toHaveBeenCalledTimes(1);
  });

  it('동시에 들어온 같은 질문은 진행 중 결과에 합류한다(파이프라인·한도 1회)', async () => {
    const svc = new ReviewSearchService(app.prisma, fakeAiConfig);
    stub.chatDelayMs = 20;
    const admit = vi.fn(async () => null);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => svc.askByPlaceId(place.placeId, '주차 돼요?', { admit })),
    );
    expect(admit).toHaveBeenCalledTimes(1);
    expect(stub.chatCalls).toBe(3);
    for (const r of results) expect(r).toEqual(results[0]);
  });

  it('한도 거부는 그 응답으로 대신하고 캐시하지 않는다 — 다음 사람은 자기 한도로 돈다', async () => {
    const svc = new ReviewSearchService(app.prisma, fakeAiConfig);
    const denied: ReviewAskResultType = {
      answer: '오늘 질문할 수 있는 횟수를 모두 썼어요.',
      confidence: 'none',
      hyde: null,
      citations: [],
      verification: null,
    };
    const r1 = await svc.askByPlaceId(place.placeId, '웨이팅 길어요?', { admit: async () => denied });
    expect(r1).toEqual(denied);
    expect(stub.chatCalls).toBe(0);
    expect(stub.embedCalls).toBe(0);

    const r2 = await svc.askByPlaceId(place.placeId, '웨이팅 길어요?', { admit: async () => null });
    expect(r2?.confidence).toBe('high');
    expect(stub.chatCalls).toBe(3);
  });

  it('LLM 일시 실패로 답변이 빠진 결과는 캐시하지 않는다', async () => {
    const svc = new ReviewSearchService(app.prisma, fakeAiConfig);
    stub.failAnswer = true;
    const r1 = await svc.askByPlaceId(place.placeId, '가격 어때요?');
    expect(r1?.answer).toContain('답변 생성 실패');
    stub.failAnswer = false;
    const before = stub.chatCalls;
    const r2 = await svc.askByPlaceId(place.placeId, '가격 어때요?');
    expect(r2?.confidence).toBe('high');
    expect(stub.chatCalls).toBeGreaterThan(before);
  });

  it('질문 경로 LLM 동시 호출은 4 이하로 묶인다', async () => {
    const svc = new ReviewSearchService(app.prisma, fakeAiConfig);
    stub.chatDelayMs = 15;
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => svc.askByPlaceId(place.placeId, `질문 ${i} 맛 어때요`)),
    );
    expect(stub.chatCalls).toBe(30);
    expect(stub.chatMaxInFlight).toBeLessThanOrEqual(4);
    expect(stub.chatMaxInFlight).toBeGreaterThan(1);
  });

  it('코퍼스는 Float32 벡터로 들고 바이트 크기로 캐시를 잰다', async () => {
    const svc = new ReviewSearchService(app.prisma, fakeAiConfig);
    await svc.askByPlaceId(place.placeId, '분위기 좋아요?');
    const stats = svc.corpusCacheStats();
    expect(stats.entries).toBe(1);
    const corpus = (svc as unknown as { corpusCache: { get: (k: string) => { items: Array<{ vec: unknown }> } } })
      .corpusCache.get(place.restaurantId);
    expect(corpus.items[0]!.vec).toBeInstanceOf(Float32Array);
    expect(stats.bytes).toBe(estimateCorpusBytes(corpus as never));
    // 12건 × (벡터 64B + 본문 + 고정 오버헤드) — 0 이 아니고 MB 단위보다 훨씬 작다.
    expect(stats.bytes).toBeGreaterThan(12 * DIMS * 4);
    expect(stats.bytes).toBeLessThan(1024 * 1024);
  });

  it('enrich 0건 가게는 한도를 세지 않고 준비 안 됨으로 답한다', async () => {
    const svc = new ReviewSearchService(app.prisma, fakeAiConfig);
    const bare = await seedEnrichedPlace(app, 0);
    const admit = vi.fn(async () => null);
    const r = await svc.askByPlaceId(bare.placeId, '맛있어요?', { admit });
    expect(r?.confidence).toBe('none');
    expect(admit).not.toHaveBeenCalled();
  });
});

// 라우트 배선 — usage-quota 'review-ask' 한도가 캐시 미스에만 소비되고, 거부는 200 안내 답변.
describe('POST /restaurants/:placeId/qa — review-ask 한도', () => {
  let app: FastifyInstance;
  let place: { placeId: string; restaurantId: string };
  const guest = { 'x-guest-key': 'guest-key-rs-0001', 'cf-connecting-ip': '10.99.0.1' };

  beforeAll(async () => {
    app = await buildFullApp();
    await app.ready();
    place = await seedEnrichedPlace(app, 6);
    await app.usageQuota.updateSetting('review-ask', { guestPerDay: 1, ipPerDay: 100 });
  });

  afterAll(async () => {
    await app.prisma.usageQuotaCounter.deleteMany({ where: { feature: 'review-ask' } });
    await app.prisma.usageQuotaSetting.deleteMany({ where: { feature: 'review-ask' } });
    app.usageQuota.invalidate();
    await app.prisma.restaurant.deleteMany({ where: { placeId: { startsWith: PLACE_PREFIX } } });
    await app.close();
  });

  const ask = (query: string, headers: Record<string, string> = guest) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/restaurants/${place.placeId}/qa`,
      headers,
      payload: { query },
    });

  it('게스트 기기 일일 한도를 넘으면 200 + confidence none 안내, 다른 기기는 계속 된다', async () => {
    const first = await ask('국물 진해요?');
    expect(first.statusCode).toBe(200);
    expect((first.json() as ReviewAskResultType).answer).not.toContain('횟수를 모두');

    const second = await ask('면 쫄깃해요?');
    expect(second.statusCode).toBe(200);
    const denied = second.json() as ReviewAskResultType;
    expect(denied.confidence).toBe('none');
    expect(denied.answer).toContain('횟수를 모두');

    const otherDevice = await ask('면 쫄깃해요?', { 'x-guest-key': 'guest-key-rs-0002', 'cf-connecting-ip': '10.99.0.1' });
    expect((otherDevice.json() as ReviewAskResultType).answer).not.toContain('횟수를 모두');
    const used = await app.usageQuota.count('review-ask', 'guest', 'guest-key-rs-0001', app.usageQuota.today());
    expect(used).toBe(1);
  });
});
