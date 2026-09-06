import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type * as WebIndex from '../../lib/web-index.js';
import {
  CreateSajuGReadingInput,
  Routes,
  SajuGReadingResult,
  type SajuGReadingResultType,
} from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { useSchemaDatabase } from '../../test-utils/schema-db.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { AdapterCache } from '../ai/adapter-cache.js';
import type { LLMCompleteOptions } from '../ai/adapters/llm-provider.js';
import { UsageQuotaService, USAGE_QUOTA_DEFAULTS } from '../usage-quota/usage-quota.service.js';
import { SajuGService, SajuGShareUnavailable } from './saju-g.service.js';
import { calculateSajuG } from './saju-g.engine.js';
import { basicSajuGReport, parseSajuGReport } from './saju-g.prompts.js';
import { renderSajuGSharePng } from './saju-g-share-card.js';

vi.mock('../../lib/web-index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof WebIndex>()),
  loadWebIndex: async () => ({
    html: '<!doctype html><html><head><title>Life Pickr</title></head><body><div id="root"></div></body></html>',
  }),
}));

const input = CreateSajuGReadingInput.parse({
  birth: { date: '1990-05-21', timeAccuracy: 'exact', time: '14:30' },
  note: '아무도 모르는 개인적인 질문',
});
const chart = calculateSajuG(input);
describe('해석 출력의 근거 검사', () => {
  it('생활 장면의 누락·순서·근거·복제와 잘못된 일간을 거절한다', () => {
    const valid = basicSajuGReport(chart);
    expect(valid.lifeScenes).toHaveLength(3);
    expect(parseSajuGReport(JSON.stringify({ ...valid, lifeScenes: undefined }), chart)).toBeNull();
    expect(
      parseSajuGReport(
        JSON.stringify({ ...valid, lifeScenes: [...valid.lifeScenes!].reverse() }),
        chart,
      ),
    ).toBeNull();
    for (const patch of [
      { evidenceIds: ['invented'] },
      { text: valid.summary },
      { action: '일간은 갑목으로 큰 나무예요.' },
      { question: '성공 확률 99%인 선택을 할까요?' },
      { text: '편재의 흐름으로 새로운 인연을 만나기 좋은 시기이니 나가 보세요.' },
    ]) {
      expect(
        parseSajuGReport(
          JSON.stringify({
            ...valid,
            lifeScenes: valid.lifeScenes!.map((s, i) => (i === 0 ? { ...s, ...patch } : s)),
          }),
          chart,
        ),
      ).toBeNull();
    }
    expect(
      parseSajuGReport(
        JSON.stringify({
          ...valid,
          lifeScenes: valid.lifeScenes!.map((s) => ({
            ...s,
            text: `${s.id}의 장면이에요. 주변을 돌보는 정성을 자신의 생활과 휴식에도 꾸준히 나누어 보세요.`,
          })),
        }),
        chart,
      ),
    ).toBeNull();
  });
  it('존재하지 않는 근거와 간지, 점수 출력을 거절한다', () => {
    const valid = basicSajuGReport(chart);
    expect(
      parseSajuGReport(JSON.stringify({ ...valid, headline: input.note }), chart, input.note),
    ).toBeNull();
    expect(parseSajuGReport(JSON.stringify(valid), chart)).not.toBeNull();
    expect(
      parseSajuGReport(
        JSON.stringify({
          ...valid,
          sections: valid.sections.map((s) => ({ ...s, evidenceIds: ['invented'] })),
        }),
        chart,
      ),
    ).toBeNull();
    expect(
      parseSajuGReport(JSON.stringify({ ...valid, summary: '갑자 甲子 일주입니다.' }), chart),
    ).toBeNull();
    expect(
      parseSajuGReport(JSON.stringify({ ...valid, summary: '성공 확률 99%입니다.' }), chart),
    ).toBeNull();
  });
  it('요약 복사·한글 간지·잘못된 일간을 거절한다', () => {
    const valid = basicSajuGReport(chart);
    for (const summary of [
      valid.sections[0]!.text,
      '경자 일주를 바탕으로 살펴보세요.',
      '일간은 갑목으로 큰 나무를 닮았어요.',
      '갑목 일간은 큰 나무를 닮았어요.',
    ])
      expect(parseSajuGReport(JSON.stringify({ ...valid, summary }), chart)).toBeNull();
    expect(
      parseSajuGReport(
        JSON.stringify({ ...valid, summary: '기사를 읽고 느낀 점을 적어 보세요.' }),
        chart,
      ),
    ).not.toBeNull();
    const uncertain = calculateSajuG(
      CreateSajuGReadingInput.parse({ birth: { date: '1990-05-21', dayBoundary: 'zi' } }),
    );
    expect(uncertain.dayMaster).toBeNull();
    const uncertainReport = basicSajuGReport(uncertain);
    expect(parseSajuGReport(JSON.stringify(uncertainReport), uncertain)).not.toBeNull();
    expect(
      parseSajuGReport(
        JSON.stringify({
          ...uncertainReport,
          lifeScenes: uncertainReport.lifeScenes!.map((scene) => ({
            ...scene,
            evidenceIds: ['pillar-year'],
          })),
        }),
        uncertain,
      ),
    ).toBeNull();
    expect(
      parseSajuGReport(
        JSON.stringify({
          ...basicSajuGReport(uncertain),
          summary: '병화 일간의 표현을 살펴보세요.',
        }),
        uncertain,
      ),
    ).toBeNull();
  });
  it('오늘의 주제에는 타고난 기둥과 별개로 해당 날짜의 근거가 필요하다', () => {
    const daily = calculateSajuG({ ...input, kind: 'daily' });
    const report = basicSajuGReport(daily);
    expect(parseSajuGReport(JSON.stringify(report), daily)).not.toBeNull();
    report.sections[0]!.evidenceIds = ['pillar-year'];
    expect(parseSajuGReport(JSON.stringify(report), daily)).toBeNull();
  });
});

describe('사주 서비스·라우트 (새 임시 DB)', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof useSchemaDatabase>;
  let service: SajuGService;
  let makeService: (shareToken?: () => string) => SajuGService;
  let token: string;
  let otherToken: string;
  let calls: LLMCompleteOptions[];
  let fail = false;
  const guest = { userId: null, guestKey: 'saju-g-test-guest-1', ip: '127.0.0.1' };
  const member = { userId: 'saju-g-member', guestKey: null, ip: '127.0.0.1' };
  beforeAll(async () => {
    db = useSchemaDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'saju-g-member', role: 'USER' },
      { id: 'saju-g-other', role: 'USER' },
    ]);
    token = app.jwt.sign({ userId: 'saju-g-member', email: 'a@seed.local', role: 'USER' });
    otherToken = app.jwt.sign({ userId: 'saju-g-other', email: 'b@seed.local', role: 'USER' });
    await app.prisma.llmProviderConfig.create({
      data: { provider: 'ollama-cloud', purpose: 'saju-g', apiKey: '', enabled: false },
    });
  }, 30_000);
  afterAll(async () => {
    await app?.close();
    db?.restore();
  });
  afterEach(() => vi.restoreAllMocks());
  beforeEach(async () => {
    await app.prisma.sajuGReading.deleteMany();
    await app.prisma.sajuGShare.deleteMany();
    await app.prisma.usageQuotaCounter.deleteMany();
    await app.prisma.usageQuotaSetting.deleteMany();
    calls = [];
    fail = false;
    const ai = {
      getResolved: async () => ({ defaultModel: 'kimi-k3' }),
    } as unknown as AiConfigService;
    const cache = {
      get: () => ({
        complete: async (opts: LLMCompleteOptions) => {
          calls.push(opts);
          if (fail) throw new Error('provider private error');
          await new Promise((resolve) => setTimeout(resolve, 5));
          return {
            text: JSON.stringify(basicSajuGReport(chart)),
            model: opts.model,
            promptTokens: 1,
            completionTokens: 1,
          };
        },
      }),
    } as unknown as AdapterCache;
    makeService = (shareToken) =>
      new SajuGService(app.prisma, ai, {
        quota: new UsageQuotaService(app.prisma, { settingsTtlMs: 0 }),
        cache,
        shareToken,
      });
    service = makeService();
  });
  it('같은 게스트의 동시 요청은 합류하고 한도도 한 번만 소비한다', async () => {
    const [a, b] = await Promise.all([
      service.createReading(input, guest),
      service.createReading(input, guest),
    ]);
    expect(a.source).toBe('ai');
    expect(a.report).toEqual(b.report);
    expect(calls).toHaveLength(1);
    expect(
      await app.prisma.usageQuotaCounter.findFirst({
        where: { feature: 'saju-g-reading', scope: 'global' },
      }),
    ).toMatchObject({ count: 1 });
    const again = await service.createReading(input, guest);
    expect(again.report).toEqual(a.report);
    expect(calls).toHaveLength(1);
    const prompt = JSON.parse(calls[0]!.prompt);
    expect(prompt.facts.filter((f: { id: string }) => f.id.startsWith('element-'))).toHaveLength(5);
    expect(
      prompt.facts
        .filter((f: { id: string }) => f.id.startsWith('element-'))
        .every((f: { description: string }) => !/\d+개/.test(f.description)),
    ).toBe(true);
    expect(calls[0]!.prompt).not.toContain(input.birth.date);
    expect(calls[0]!.prompt).not.toContain(input.birth.time!);
  });
  it('서버는 저장 버튼 전에는 출생정보를 DB에 남기지 않는다', async () => {
    const result = await service.createReading(input, member);
    expect(await app.prisma.sajuGReading.count()).toBe(0);
    const saved = await service.save(result.receipt!, member);
    expect(saved.readingId).toBeTruthy();
    expect(await app.prisma.sajuGReading.count()).toBe(1);
    await expect(service.getMine('saju-g-other', saved.readingId!)).rejects.toThrow();
    await expect(
      service.save(result.receipt!, { ...member, userId: 'saju-g-other' }),
    ).rejects.toThrow();
    await service.save(result.receipt!, member);
    expect(await app.prisma.sajuGReading.count()).toBe(1);
    expect((await service.createReading(input, member)).readingId).toBe(saved.readingId);
  });
  it('공유는 서버 결과만 쓰고 개인정보·AI 본문을 제외하며 취소할 수 있다', async () => {
    const result = await service.createReading(input, guest);
    await expect(
      service.createShare(
        { receipt: result.receipt! },
        { ...guest, guestKey: 'saju-g-test-guest-2' },
      ),
    ).rejects.toThrow();
    const shared = await service.createShare({ receipt: result.receipt! }, guest);
    expect(shared.token).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(shared.revokeToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(result.receipt).toHaveLength(32);
    const json = JSON.stringify(await service.getShared(shared.token));
    for (const privateValue of [
      input.birth.date,
      input.birth.time!,
      input.note,
      result.report.practice,
    ])
      expect(json).not.toContain(privateValue);
    await expect(service.revokeShare(shared.token, 'x'.repeat(32))).rejects.toThrow();
    await service.revokeShare(shared.token, shared.revokeToken);
    await expect(service.getShared(shared.token)).rejects.toThrow();
  });
  it('저장 결과를 삭제하면 연결한 공유도 함께 지운다', async () => {
    const result = await service.createReading(input, member);
    const otherTab = await service.createReading(input, member);
    const saved = await service.save(result.receipt!, member);
    const shared = await service.createShare({ readingId: saved.readingId! }, member);
    await service.deleteMine(member.userId, saved.readingId!);
    await expect(service.getShared(shared.token)).rejects.toThrow();
    await expect(service.save(otherTab.receipt!, member)).rejects.toThrow();
    await expect(service.createShare({ receipt: result.receipt! }, member)).rejects.toThrow();
    expect((await service.createReading(input, member)).readingId).toBeNull();
  });
  it('이전 32자리 공유의 조회·PNG·OG·취소가 계속 동작한다', async () => {
    const share = await service.createShare({ birth: input.birth }, guest);
    const legacyToken = 'L'.repeat(32);
    expect(legacyToken).toHaveLength(32);
    await app.prisma.sajuGShare.update({
      where: { token: share.token },
      data: { token: legacyToken },
    });
    const result = await app.inject({ url: Routes.SajuG.shared(legacyToken) });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual(await service.getShared(legacyToken));
    expect((await app.inject({ url: Routes.SajuG.shareImage(legacyToken) })).statusCode).toBe(200);
    const preview = await app.inject({ url: Routes.SajuG.sharePage(legacyToken) });
    expect(preview.statusCode).toBe(200);
    expect(preview.body).toContain(Routes.SajuG.shareImage(legacyToken));
    const removed = await app.inject({
      method: 'DELETE',
      url: Routes.SajuG.shared(legacyToken),
      payload: { revokeToken: share.revokeToken },
    });
    expect(removed.statusCode).toBe(204);
    expect((await app.inject({ url: Routes.SajuG.shared(legacyToken) })).statusCode).toBe(404);
    expect((await app.inject({ url: Routes.SajuG.shareImage(legacyToken) })).statusCode).toBe(404);
    expect((await app.inject({ url: Routes.SajuG.sharePage(legacyToken) })).statusCode).toBe(404);
  });
  it('DB 저장 순간의 공유 ID 충돌은 새 ID로 재시도한다', async () => {
    const earlier = await service.createShare({ birth: input.birth }, guest);
    const earlierRow = await app.prisma.sajuGShare.findUnique({ where: { token: earlier.token } });
    const generate = vi.fn().mockReturnValueOnce(earlier.token).mockReturnValue('fresh00001');
    const share = await makeService(generate).createShare({ birth: input.birth }, guest);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(share.token).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(share.token).toBe('fresh00001');
    expect(await app.prisma.sajuGShare.findUnique({ where: { token: earlier.token } })).toEqual(
      earlierRow,
    );
    expect(await app.prisma.sajuGShare.count()).toBe(2);
  });
  it('충돌이 반복되어도 5번까지만 시도하고 재시도 가능한 오류를 반환한다', async () => {
    const earlier = await service.createShare({ birth: input.birth }, guest);
    const generate = vi.fn(() => earlier.token);
    await expect(
      makeService(generate).createShare({ birth: input.birth }, guest),
    ).rejects.toBeInstanceOf(SajuGShareUnavailable);
    expect(generate).toHaveBeenCalledTimes(5);
    expect(await app.prisma.sajuGShare.count()).toBe(1);
    vi.spyOn(SajuGService.prototype, 'createShare').mockRejectedValue(new SajuGShareUnavailable());
    const response = await app.inject({
      method: 'POST',
      url: Routes.SajuG.shares,
      payload: { birth: input.birth },
    });
    expect(response.statusCode, response.body).toBe(503);
    expect(response.json().message).toContain('다시 시도');
    expect(await app.prisma.sajuGShare.count()).toBe(1);
  });
  it('ID 충돌 이외의 DB 오류를 반복 재시도하지 않는다', async () => {
    await app.prisma.$executeRawUnsafe(
      "CREATE TRIGGER share_insert_failure BEFORE INSERT ON saju_g_shares BEGIN SELECT RAISE(ABORT, 'database unavailable'); END",
    );
    const generate = vi.fn(() => 'fresh00001');
    try {
      await expect(
        makeService(generate).createShare({ birth: input.birth }, guest),
      ).rejects.toThrow();
      expect(generate).toHaveBeenCalledTimes(1);
    } finally {
      await app.prisma.$executeRawUnsafe('DROP TRIGGER share_insert_failure');
    }
  });
  it('기기에 보관한 출생정보는 생성 영수증 없이 다시 계산해 공유할 수 있다', async () => {
    const share = await service.createShare({ birth: input.birth }, guest);
    const result = await service.getShared(share.token);
    expect(result.elements).toEqual(chart.elements);
    expect(JSON.stringify(result)).not.toContain(input.birth.date);
    expect(calls).toHaveLength(0);
  });
  it('기본 풀이를 저장해도 장애가 끝나면 AI 풀이를 다시 받을 수 있다', async () => {
    fail = true;
    const basic = await service.createReading(input, member);
    await service.save(basic.receipt!, member);
    fail = false;
    expect(await service.createReading(input, member)).toMatchObject({
      source: 'ai',
      fallbackReason: null,
    });
    expect(calls).toHaveLength(2);
  });
  it('AI 장애·한도 초과에도 명식과 기본 설명은 제공한다', async () => {
    fail = true;
    expect(await service.createReading(input, guest)).toMatchObject({
      source: 'basic',
      fallbackReason: 'unavailable',
    });
    await app.prisma.usageQuotaSetting.create({
      data: {
        ...USAGE_QUOTA_DEFAULTS['saju-g-reading'],
        feature: 'saju-g-reading',
        enabled: false,
      },
    });
    expect(
      await service.createReading(input, { ...guest, guestKey: 'different-guest' }),
    ).toMatchObject({ source: 'basic', fallbackReason: 'quota' });
  });
  it('공유 PNG는 실제로 렌더링된다', async () => {
    const result = await service.createReading(input, guest);
    const share = await service.createShare({ receipt: result.receipt! }, guest);
    const image = await renderSajuGSharePng(await service.getShared(share.token));
    expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(image.length).toBeGreaterThan(10_000);
  });
  it('HTTP 계산·회원 저장·다른 회원 접근·공유 취소', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const birth = await app.inject({ method: 'POST', url: '/api/v1/saju-g/chart', payload: input });
    expect(birth.statusCode).toBe(200);
    const reading = await app.inject({
      method: 'POST',
      url: '/api/v1/saju-g/readings',
      headers,
      payload: input,
    });
    expect(reading.statusCode, reading.body).toBe(200);
    const r: SajuGReadingResultType = SajuGReadingResult.parse(reading.json());
    expect(r.source).toBe('basic');
    const saved = await app.inject({
      method: 'POST',
      url: '/api/v1/saju-g/me/readings',
      headers,
      payload: { receipt: r.receipt },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const id = saved.json().readingId;
    expect(
      (
        await app.inject({
          url: `/api/v1/saju-g/me/readings/${id}`,
          headers: { authorization: `Bearer ${otherToken}` },
        })
      ).statusCode,
    ).toBe(404);
    expect((await app.inject({ url: '/api/v1/saju-g/me/readings' })).statusCode).toBe(401);
    const shared = await app.inject({
      method: 'POST',
      url: '/api/v1/saju-g/shares',
      headers,
      payload: { readingId: id },
    });
    expect(shared.statusCode).toBe(200);
    const { token: publicToken, revokeToken } = shared.json();
    const image = await app.inject({ url: `/api/v1/saju-g/shares/${publicToken}/image.png` });
    expect(image.statusCode).toBe(200);
    expect(image.headers['cross-origin-resource-policy']).toBe('cross-origin');
    const preview = await app.inject({ url: `/saju-g/s/${publicToken}` });
    expect(preview.statusCode).toBe(200);
    expect(preview.body).toContain('property="og:image"');
    expect(preview.body).not.toContain(input.birth.date);
    expect(preview.body).not.toContain(input.note);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/saju-g/shares/${publicToken}`,
          payload: { revokeToken },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ url: `/api/v1/saju-g/shares/${publicToken}/image.png` })).statusCode,
    ).toBe(404);
    const removedPreview = await app.inject({ url: `/saju-g/s/${publicToken}` });
    expect(removedPreview.statusCode).toBe(404);
    expect(removedPreview.body).not.toContain(r.report.headline);
  });
});
