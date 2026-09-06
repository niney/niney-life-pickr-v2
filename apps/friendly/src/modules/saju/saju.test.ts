import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type * as WebIndex from '../../lib/web-index.js';
import {
  CreateSajuReadingInput,
  SajuReadingResult,
  type SajuReadingResultType,
} from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { useSchemaDatabase } from '../../test-utils/schema-db.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { AdapterCache } from '../ai/adapter-cache.js';
import type { LLMCompleteOptions } from '../ai/adapters/llm-provider.js';
import { UsageQuotaService, USAGE_QUOTA_DEFAULTS } from '../usage-quota/usage-quota.service.js';
import { SajuService } from './saju.service.js';
import { calculateSaju } from './saju.engine.js';
import { basicSajuReport, parseSajuReport } from './saju.prompts.js';
import { renderSajuSharePng } from './saju-share-card.js';

vi.mock('../../lib/web-index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof WebIndex>()),
  loadWebIndex: async () => ({
    html: '<!doctype html><html><head><title>Life Pickr</title></head><body><div id="root"></div></body></html>',
  }),
}));

const input = CreateSajuReadingInput.parse({
  birth: { date: '1990-05-21', timeAccuracy: 'exact', time: '14:30' },
  note: '아무도 모르는 개인적인 질문',
});
const chart = calculateSaju(input);
describe('해석 출력의 근거 검사', () => {
  it('존재하지 않는 근거와 간지, 점수 출력을 거절한다', () => {
    const valid = basicSajuReport(chart);
    expect(
      parseSajuReport(JSON.stringify({ ...valid, headline: input.note }), chart, input.note),
    ).toBeNull();
    expect(parseSajuReport(JSON.stringify(valid), chart)).not.toBeNull();
    expect(
      parseSajuReport(
        JSON.stringify({
          ...valid,
          sections: valid.sections.map((s) => ({ ...s, evidenceIds: ['invented'] })),
        }),
        chart,
      ),
    ).toBeNull();
    expect(
      parseSajuReport(JSON.stringify({ ...valid, summary: '갑자 甲子 일주입니다.' }), chart),
    ).toBeNull();
    expect(
      parseSajuReport(JSON.stringify({ ...valid, summary: '성공 확률 99%입니다.' }), chart),
    ).toBeNull();
  });
  it('요약 복사·한글 간지·잘못된 일간을 거절한다', () => {
    const valid = basicSajuReport(chart);
    for (const summary of [
      valid.sections[0]!.text,
      '경자 일주를 바탕으로 살펴보세요.',
      '일간은 갑목으로 큰 나무를 닮았어요.',
      '갑목 일간은 큰 나무를 닮았어요.',
    ])
      expect(parseSajuReport(JSON.stringify({ ...valid, summary }), chart)).toBeNull();
    expect(
      parseSajuReport(
        JSON.stringify({ ...valid, summary: '기사를 읽고 느낀 점을 적어 보세요.' }),
        chart,
      ),
    ).not.toBeNull();
    const uncertain = calculateSaju(
      CreateSajuReadingInput.parse({ birth: { date: '1990-05-21', dayBoundary: 'zi' } }),
    );
    expect(uncertain.dayMaster).toBeNull();
    expect(
      parseSajuReport(
        JSON.stringify({
          ...basicSajuReport(uncertain),
          summary: '병화 일간의 표현을 살펴보세요.',
        }),
        uncertain,
      ),
    ).toBeNull();
  });
  it('오늘의 주제에는 타고난 기둥과 별개로 해당 날짜의 근거가 필요하다', () => {
    const daily = calculateSaju({ ...input, kind: 'daily' });
    const report = basicSajuReport(daily);
    expect(parseSajuReport(JSON.stringify(report), daily)).not.toBeNull();
    report.sections[0]!.evidenceIds = ['pillar-year'];
    expect(parseSajuReport(JSON.stringify(report), daily)).toBeNull();
  });
});

describe('사주 서비스·라우트 (새 임시 DB)', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof useSchemaDatabase>;
  let service: SajuService;
  let token: string;
  let otherToken: string;
  let calls: LLMCompleteOptions[];
  let fail = false;
  const guest = { userId: null, guestKey: 'saju-test-guest-1', ip: '127.0.0.1' };
  const member = { userId: 'saju-member', guestKey: null, ip: '127.0.0.1' };
  beforeAll(async () => {
    db = useSchemaDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'saju-member', role: 'USER' },
      { id: 'saju-other', role: 'USER' },
    ]);
    token = app.jwt.sign({ userId: 'saju-member', email: 'a@seed.local', role: 'USER' });
    otherToken = app.jwt.sign({ userId: 'saju-other', email: 'b@seed.local', role: 'USER' });
    await app.prisma.llmProviderConfig.create({
      data: { provider: 'ollama-cloud', purpose: 'saju', apiKey: '', enabled: false },
    });
  }, 30_000);
  afterAll(async () => {
    await app?.close();
    db?.restore();
  });
  beforeEach(async () => {
    await app.prisma.sajuReading.deleteMany();
    await app.prisma.sajuShare.deleteMany();
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
            text: JSON.stringify(basicSajuReport(chart)),
            model: opts.model,
            promptTokens: 1,
            completionTokens: 1,
          };
        },
      }),
    } as unknown as AdapterCache;
    service = new SajuService(app.prisma, ai, {
      quota: new UsageQuotaService(app.prisma, { settingsTtlMs: 0 }),
      cache,
    });
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
        where: { feature: 'saju-reading', scope: 'global' },
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
    expect(await app.prisma.sajuReading.count()).toBe(0);
    const saved = await service.save(result.receipt!, member);
    expect(saved.readingId).toBeTruthy();
    expect(await app.prisma.sajuReading.count()).toBe(1);
    await expect(service.getMine('saju-other', saved.readingId!)).rejects.toThrow();
    await expect(
      service.save(result.receipt!, { ...member, userId: 'saju-other' }),
    ).rejects.toThrow();
    await service.save(result.receipt!, member);
    expect(await app.prisma.sajuReading.count()).toBe(1);
    expect((await service.createReading(input, member)).readingId).toBe(saved.readingId);
  });
  it('공유는 서버 결과만 쓰고 개인정보·AI 본문을 제외하며 취소할 수 있다', async () => {
    const result = await service.createReading(input, guest);
    await expect(
      service.createShare(
        { receipt: result.receipt! },
        { ...guest, guestKey: 'saju-test-guest-2' },
      ),
    ).rejects.toThrow();
    const shared = await service.createShare({ receipt: result.receipt! }, guest);
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
      data: { ...USAGE_QUOTA_DEFAULTS['saju-reading'], feature: 'saju-reading', enabled: false },
    });
    expect(
      await service.createReading(input, { ...guest, guestKey: 'different-guest' }),
    ).toMatchObject({ source: 'basic', fallbackReason: 'quota' });
  });
  it('공유 PNG는 실제로 렌더링된다', async () => {
    const result = await service.createReading(input, guest);
    const share = await service.createShare({ receipt: result.receipt! }, guest);
    const image = await renderSajuSharePng(await service.getShared(share.token));
    expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(image.length).toBeGreaterThan(10_000);
  });
  it('HTTP 계산·회원 저장·다른 회원 접근·공유 취소', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const birth = await app.inject({ method: 'POST', url: '/api/v1/saju/chart', payload: input });
    expect(birth.statusCode).toBe(200);
    const reading = await app.inject({
      method: 'POST',
      url: '/api/v1/saju/readings',
      headers,
      payload: input,
    });
    expect(reading.statusCode, reading.body).toBe(200);
    const r: SajuReadingResultType = SajuReadingResult.parse(reading.json());
    expect(r.source).toBe('basic');
    const saved = await app.inject({
      method: 'POST',
      url: '/api/v1/saju/me/readings',
      headers,
      payload: { receipt: r.receipt },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const id = saved.json().readingId;
    expect(
      (
        await app.inject({
          url: `/api/v1/saju/me/readings/${id}`,
          headers: { authorization: `Bearer ${otherToken}` },
        })
      ).statusCode,
    ).toBe(404);
    expect((await app.inject({ url: '/api/v1/saju/me/readings' })).statusCode).toBe(401);
    const shared = await app.inject({
      method: 'POST',
      url: '/api/v1/saju/shares',
      headers,
      payload: { readingId: id },
    });
    expect(shared.statusCode).toBe(200);
    const { token: publicToken, revokeToken } = shared.json();
    const image = await app.inject({ url: `/api/v1/saju/shares/${publicToken}/image.png` });
    expect(image.statusCode).toBe(200);
    expect(image.headers['cross-origin-resource-policy']).toBe('cross-origin');
    const preview = await app.inject({ url: `/saju/s/${publicToken}` });
    expect(preview.statusCode).toBe(200);
    expect(preview.body).toContain('property="og:image"');
    expect(preview.body).not.toContain(input.birth.date);
    expect(preview.body).not.toContain(input.note);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/saju/shares/${publicToken}`,
          payload: { revokeToken },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ url: `/api/v1/saju/shares/${publicToken}/image.png` })).statusCode,
    ).toBe(404);
    const removedPreview = await app.inject({ url: `/saju/s/${publicToken}` });
    expect(removedPreview.statusCode).toBe(404);
    expect(removedPreview.body).not.toContain(r.report.headline);
  });
});
