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
import type { OperationLogService } from '../logs/operation-log.service.js';
import { MenuGroupingService, pickCanonicalName } from './menu-grouping.service.js';

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

// 프롬프트의 "메뉴 목록" 번호 라인에서 이름들을 복원 — 가짜 LLM 이
// 인덱스-그룹 출력을 만들 때 사용.
const namesFromPrompt = (prompt: string): string[] =>
  prompt
    .split('\n')
    .filter((l) => /^\d+\. /.test(l))
    .map((l) => l.replace(/^\d+\. /, ''));

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
  const name = meta.name ?? '테스트 식당';
  const rest = await app.prisma.restaurant.create({
    data: {
      source: 'naver',
      sourceId: placeId,
      placeId,
      name,
      category: meta.category ?? null,
      rawSourceUrl: 'https://x',
      snapshotJson: '{}',
      canonical: { create: { name, primaryCategory: meta.category ?? null } },
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

  it('groups variant menus into a canonical name and persists mappings', async () => {
    const { placeId } = await seedRestaurantWithMentions(app, [
      // '김치찌개' 표기를 2번 넣어 bestNameByNorm 의 대표 표기 선택을
      // groupBy 순서와 무관하게 고정한다 (count 2 > 1).
      { name: '김치찌개', nameNorm: '김치찌개', sentiment: 'positive' },
      { name: '김치찌개', nameNorm: '김치찌개', sentiment: 'positive' },
      { name: '김치 찌개', nameNorm: '김치찌개', sentiment: 'positive' },
      { name: '묵은지김치찌개', nameNorm: '묵은지김치찌개', sentiment: 'negative' },
      { name: '차돌박이된장찌개', nameNorm: '차돌박이된장찌개', sentiment: 'positive' },
    ]);

    // 인덱스-그룹 계약: 김치찌개 계열 표기들의 번호만 한 묶음으로 출력.
    // (1단계 청크 콜과 대표 머지 콜 모두 같은 로직으로 응답 — 머지 콜에선
    // 매칭이 1개뿐이라 빈 groups 가 된다.)
    const provider = fakeProvider((prompt) => {
      const names = namesFromPrompt(prompt);
      const idx = names
        .map((n, i) => [n, i] as const)
        .filter(([n]) => n.replace(/\s+/g, '').includes('김치찌개'))
        .map(([, i]) => i);
      return JSON.stringify({ groups: idx.length >= 2 ? [idx] : [] });
    });
    const service = new MenuGroupingService(app.prisma, aiConfig, {
      resolveOverride: async () => ({ provider, model: 'override-model' }),
    });

    const run = await service.groupForRestaurant(placeId);
    expect(run.ok).toBe(true);
    // distinct nameNorm 3개 입력 → 김치찌개+묵은지김치찌개 병합.
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
    // canonical 은 코드가 결정 — 멤버 중 최단 표기인 '김치찌개'.
    const kim = ranking.items.find((i) => i.canonicalKey === '김치찌개')!;
    expect(kim).toBeDefined();
    expect(kim.mapped).toBe(true);
    expect(kim.canonicalName).toBe('김치찌개');
    // 김치찌개×2 + 김치 찌개 (positive) + 묵은지김치찌개 (negative) = 4 멘션.
    expect(kim.mentionCount).toBe(4);
    expect(kim.positive).toBe(3);
    expect(kim.negative).toBe(1);
    expect(kim.positiveRatio).toBeCloseTo(3 / 4);
    expect(kim.variants).toContain('김치찌개');
    expect(kim.variants).toContain('묵은지김치찌개');
  });

  it('merges groups across chunk boundaries via the representative merge round', async () => {
    // 서로 비유사한 6개 → 유사도 패킹이 전부 singleton 블록 → 3+3 청크.
    const { placeId, restaurantId } = await seedRestaurantWithMentions(app, [
      { name: '감자탕', nameNorm: '감자탕', sentiment: 'positive' },
      { name: '뼈해장국', nameNorm: '뼈해장국', sentiment: 'positive' },
      { name: '김치찌개', nameNorm: '김치찌개', sentiment: 'positive' },
      { name: '된장찌개', nameNorm: '된장찌개', sentiment: 'positive' },
      { name: '비빔밥', nameNorm: '비빔밥', sentiment: 'positive' },
      { name: '물냉면', nameNorm: '물냉면', sentiment: 'positive' },
    ]);

    // 1단계 콜(3개씩)은 병합 없음 → 대표 6개가 한 머지 콜에 모이고,
    // 거기서 감자탕·뼈해장국을 병합 — 청크 경계를 넘는 병합의 실증.
    let callCount = 0;
    const provider: LLMProvider = {
      complete: async ({ prompt }) => {
        callCount += 1;
        const names = namesFromPrompt(prompt);
        let groups: number[][] = [];
        if (names.length === 6) {
          groups = [[names.indexOf('감자탕'), names.indexOf('뼈해장국')]];
        }
        return {
          text: JSON.stringify({ groups }),
          model: 'fake-model',
          promptTokens: 10,
          completionTokens: 10,
        };
      },
    };
    const service = new MenuGroupingService(app.prisma, aiConfig, {
      resolveOverride: async () => ({ provider, model: 'override-model' }),
      chunkSize: 3,
    });

    const run = await service.groupForRestaurant(placeId);
    expect(run.ok).toBe(true);
    expect(run.inputCount).toBe(6);
    expect(run.mappedCount).toBe(6);
    // 감자탕+뼈해장국 병합 → 5그룹.
    expect(run.groupCount).toBe(5);
    // 청크 2콜 + 머지 1콜 — 머지가 단일 콜(전수 비교)이면 추가 라운드 없음.
    expect(callCount).toBe(3);

    // canonical 은 최단 표기 규칙 — 뼈해장국이 감자탕으로 매핑.
    const row = await app.prisma.menuCanonical.findFirst({
      where: { restaurantId, nameNorm: '뼈해장국' },
    });
    expect(row).toBeDefined();
    expect(row!.canonicalName).toBe('감자탕');
    expect(row!.version).toBe(run.version);
  });

  it('retries a failed chunk by splitting in half and keeps partial results', async () => {
    // 같은 계열 4개 → 한 블록 → 한 청크. 1차 콜이 깨진 응답이면 이분할
    // 재시도 — 앞 절반은 병합 성공, 뒤 절반은 병합 없음.
    const { placeId } = await seedRestaurantWithMentions(app, [
      { name: '돈까스', nameNorm: '돈까스', sentiment: 'positive' },
      { name: '돈까스정식', nameNorm: '돈까스정식', sentiment: 'positive' },
      { name: '돈까스세트', nameNorm: '돈까스세트', sentiment: 'positive' },
      { name: '돈까스스페셜', nameNorm: '돈까스스페셜', sentiment: 'positive' },
    ]);

    // 콜 순서는 결정적: 청크(4개) → 앞 절반(2개) → 뒤 절반(2개) → 머지.
    const replies = [
      'completely broken response without braces',
      JSON.stringify({ groups: [[0, 1]] }),
      JSON.stringify({ groups: [] }),
      JSON.stringify({ groups: [] }),
    ];
    let callCount = 0;
    const provider: LLMProvider = {
      complete: async () => {
        const text = replies[Math.min(callCount, replies.length - 1)]!;
        callCount += 1;
        return { text, model: 'fake-model', promptTokens: 10, completionTokens: 10 };
      },
    };
    const service = new MenuGroupingService(app.prisma, aiConfig, {
      resolveOverride: async () => ({ provider, model: 'override-model' }),
    });

    const run = await service.groupForRestaurant(placeId);
    expect(run.ok).toBe(true);
    expect(run.inputCount).toBe(4);
    expect(run.mappedCount).toBe(4);
    // 앞 절반의 2개만 병합 → 3그룹. 실패가 전체 identity 로 번지지 않는다.
    expect(run.groupCount).toBe(3);
    expect(callCount).toBe(4);
  });

  it('escalates the run to all_chunks_failed when every LLM call fails', async () => {
    const { placeId } = await seedRestaurantWithMentions(app, [
      { name: '마라탕', nameNorm: '마라탕', sentiment: 'positive' },
      { name: '마라샹궈', nameNorm: '마라샹궈', sentiment: 'positive' },
    ]);

    let callCount = 0;
    const provider: LLMProvider = {
      complete: async () => {
        callCount += 1;
        return { text: 'garbage', model: 'fake-model', promptTokens: 10, completionTokens: 10 };
      },
    };
    // run 승격을 관찰하기 위한 최소 가짜 oplog — finishRun 입력만 수집.
    const finishCalls: { status: string; errorCode?: string; meta?: Record<string, unknown> }[] =
      [];
    const oplog = {
      startRun: async () => 'run-1',
      log: () => {},
      finishRun: async (
        _id: string,
        input: { status: string; errorCode?: string; meta?: Record<string, unknown> },
      ) => {
        finishCalls.push(input);
      },
    } as unknown as OperationLogService;

    const service = new MenuGroupingService(app.prisma, aiConfig, {
      resolveOverride: async () => ({ provider, model: 'override-model' }),
      operationLog: oplog,
    });

    const run = await service.groupForRestaurant(placeId);
    // 비즈니스 결과는 유지 — 전부 identity (2개 → 2그룹).
    expect(run.ok).toBe(true);
    expect(run.groupCount).toBe(2);
    // 청크 1콜(2개라 이분할 불가) + 머지 1콜 = 2콜 모두 실패.
    expect(callCount).toBe(2);
    // run 은 실패로 승격 — finish 는 정확히 한 번.
    expect(finishCalls).toHaveLength(1);
    expect(finishCalls[0]!.status).toBe('failed');
    expect(finishCalls[0]!.errorCode).toBe('all_chunks_failed');
    expect(finishCalls[0]!.meta).toMatchObject({ llmCalls: 2, failedCalls: 2 });
  });

  it('picks canonical deterministically — shortest, then mention count, then lexicographic', () => {
    const counts = new Map<string, number>([
      ['김치찌개', 1],
      ['된장찌개', 5],
      ['묵은지김치찌개', 9],
    ]);
    // 최단 우선 — 빈도가 더 높아도 긴 표기는 밀린다.
    expect(pickCanonicalName(['묵은지김치찌개', '김치찌개'], counts)).toBe('김치찌개');
    // 길이 동률 → 빈도.
    expect(pickCanonicalName(['김치찌개', '된장찌개'], counts)).toBe('된장찌개');
    // 길이·빈도 동률 → 사전순.
    expect(pickCanonicalName(['나물밥', '가지밥'], new Map())).toBe('가지밥');
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
    const result = await service.getRestaurantsStatus({
      sort: 'unmapped',
      page: 1,
      pageSize: 50,
    });
    const row = result.items.find((s) => s.placeId === placeId);
    expect(row).toBeDefined();
    expect(row!.distinctMenus).toBe(2);
    expect(row!.mappedMenus).toBe(1);
    expect(row!.unmappedMenus).toBe(1);
    expect(row!.lastGroupedAt).not.toBeNull();
    expect(row!.storedVersion).toBe(1);
    // 응답 메타 — 페이저/UI 표시에 사용.
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    // 이 식당은 unmappedMenus=1 이라 attention 대상.
    expect(result.attentionCount).toBeGreaterThanOrEqual(1);
  });

  it('paginates, filters by q, and reports stable attentionCount', async () => {
    // 3개 식당 시드 — 모두 unmapped 있음(=attention 대상). 이름 다르게.
    const a = await seedRestaurantWithMentions(
      app,
      [{ name: 'A메뉴', nameNorm: 'a메뉴', sentiment: 'positive' }],
      { name: '알파식당' },
    );
    const b = await seedRestaurantWithMentions(
      app,
      [{ name: 'B메뉴', nameNorm: 'b메뉴', sentiment: 'positive' }],
      { name: '베타식당' },
    );
    const c = await seedRestaurantWithMentions(
      app,
      [{ name: 'C메뉴', nameNorm: 'c메뉴', sentiment: 'positive' }],
      { name: '감마식당' },
    );

    const service = new MenuGroupingService(app.prisma, aiConfig, {
      resolveOverride: async () => null,
    });

    // pageSize=2 로 자르면 첫 페이지 2개, 두 번째 페이지 1개.
    const page1 = await service.getRestaurantsStatus({
      sort: 'name',
      page: 1,
      pageSize: 2,
    });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBeGreaterThanOrEqual(3);
    expect(page1.attentionCount).toBeGreaterThanOrEqual(3);
    const page2 = await service.getRestaurantsStatus({
      sort: 'name',
      page: 2,
      pageSize: 2,
    });
    expect(page2.items.length).toBeGreaterThanOrEqual(1);
    // page 가 바뀌어도 attentionCount 는 동일(전체 기준).
    expect(page2.attentionCount).toBe(page1.attentionCount);

    // q 필터 — 이름 부분일치.
    const filtered = await service.getRestaurantsStatus({
      q: '알파',
      sort: 'name',
      page: 1,
      pageSize: 50,
    });
    expect(filtered.items.map((r) => r.placeId)).toEqual([a.placeId]);
    expect(filtered.total).toBe(1);
    // q 필터에도 불구하고 attentionCount 는 여전히 전체 기준.
    expect(filtered.attentionCount).toBe(page1.attentionCount);

    // attention=true 면 attention 대상만(여기선 3개 모두).
    const att = await service.getRestaurantsStatus({
      attention: true,
      sort: 'name',
      page: 1,
      pageSize: 50,
    });
    expect(att.total).toBe(page1.attentionCount);

    void b;
    void c;
  });
});
