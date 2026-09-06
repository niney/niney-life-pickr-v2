import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  CreateSajuGPairInput,
  PublicSajuGShare,
  Routes,
  SajuGPairResult,
} from '@repo/api-contract';
import { SAJU_G_ELEMENTS, sajuGElementConnection } from '@repo/utils';
import { buildApp } from '../../app.js';
import { useSchemaDatabase } from '../../test-utils/schema-db.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { AdapterCache } from '../ai/adapter-cache.js';
import type { LLMCompleteOptions } from '../ai/adapters/llm-provider.js';
import { UsageQuotaService } from '../usage-quota/usage-quota.service.js';
import { calculateSajuGPair } from './saju-g-pair.engine.js';
import { basicSajuGPairReport, parseSajuGPairReport } from './saju-g-pair.prompts.js';
import { SajuGPairService } from './saju-g-pair.service.js';

const input = CreateSajuGPairInput.parse({
  first: { date: '1990-05-21' },
  second: { date: '1995-11-07' },
  relationship: 'friend',
  note: '둘이 대화하는 속도가 달라서 고민이에요.',
});
const chart = calculateSajuGPair(input);
describe('궁합의 결정적 근거', () => {
  it.each([
    ['wood', 'fire'],
    ['fire', 'earth'],
    ['earth', 'metal'],
    ['metal', 'water'],
    ['water', 'wood'],
  ] as const)('%s → %s 상생의 방향을 보존한다', (a, b) => {
    expect(sajuGElementConnection(a, b)).toBe('first-nurtures');
    expect(sajuGElementConnection(b, a)).toBe('second-nurtures');
  });
  it.each([
    ['wood', 'earth'],
    ['earth', 'water'],
    ['water', 'fire'],
    ['fire', 'metal'],
    ['metal', 'wood'],
  ] as const)('%s → %s 상극의 방향을 보존한다', (a, b) => {
    expect(sajuGElementConnection(a, b)).toBe('first-regulates');
    expect(sajuGElementConnection(b, a)).toBe('second-regulates');
  });
  it('동일 오행과 미확정을 구분한다', () => {
    for (const e of SAJU_G_ELEMENTS) expect(sajuGElementConnection(e, e)).toBe('same');
    expect(sajuGElementConnection(null, 'wood')).toBe('unknown');
    expect(sajuGElementConnection('wood', null)).toBe('unknown');
  });
  it('두 사람을 바꾸면 개인 명식과 서로 바라보는 관계도 바뀐다', () => {
    const swapped = calculateSajuGPair({ first: input.second, second: input.first });
    expect(swapped.first).toEqual(chart.second);
    expect(swapped.firstToSecond).toBe(chart.secondToFirst);
    expect(swapped.secondToFirst).toBe(chart.firstToSecond);
    expect(JSON.stringify(chart.facts)).not.toContain(input.first.date);
    expect(JSON.stringify(chart.facts)).not.toContain(input.note);
  });
  it('미확정 일간으로 상생·상극이나 십성을 만들지 않는다', () => {
    const uncertain = calculateSajuGPair({
      ...input,
      first: { ...input.first, dayBoundary: 'zi' },
    });
    expect(uncertain.first.dayMaster).toBeNull();
    expect(uncertain.connection).toBe('unknown');
    expect(uncertain.firstToSecond).toBeNull();
    expect(uncertain.secondToFirst).toBeNull();
    const report = basicSajuGPairReport(uncertain);
    expect(parseSajuGPairReport(JSON.stringify(report), uncertain)).not.toBeNull();
    expect(
      parseSajuGPairReport(
        JSON.stringify({ ...report, summary: '두 사람은 상생 관계예요.' }),
        uncertain,
      ),
    ).toBeNull();
  });
  it('없는 근거·점수·계산하지 않은 합·문단 복사를 거절한다', () => {
    const report = basicSajuGPairReport(chart);
    expect(parseSajuGPairReport(JSON.stringify(report), chart)).not.toBeNull();
    for (const summary of [
      '궁합은 99점입니다.',
      '두 사람은 육합입니다.',
      input.note,
      report.sections[0]!.text,
    ])
      expect(
        parseSajuGPairReport(JSON.stringify({ ...report, summary }), chart, input.note),
      ).toBeNull();
    expect(
      parseSajuGPairReport(
        JSON.stringify({
          ...report,
          sections: report.sections.map((s) => ({ ...s, evidenceIds: ['invented'] })),
        }),
        chart,
      ),
    ).toBeNull();
  });
});

describe('프로필·궁합 API와 개인정보 경계', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof useSchemaDatabase>;
  let token: string;
  let other: string;
  const auth = () => ({ authorization: `Bearer ${token}` });
  beforeAll(async () => {
    db = useSchemaDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'pair-a', role: 'USER' },
      { id: 'pair-b', role: 'USER' },
    ]);
    token = app.jwt.sign({ userId: 'pair-a', email: 'a@seed.local', role: 'USER' });
    other = app.jwt.sign({ userId: 'pair-b', email: 'b@seed.local', role: 'USER' });
    await app.prisma.llmProviderConfig.create({
      data: { provider: 'ollama-cloud', purpose: 'saju-g', apiKey: '', enabled: false },
    });
  }, 30_000);
  afterAll(async () => {
    await app?.close();
    db?.restore();
  });
  beforeEach(async () => {
    await app.prisma.sajuGProfile.deleteMany();
    await app.prisma.sajuGShare.deleteMany();
    await app.prisma.usageQuotaCounter.deleteMany();
    await app.prisma.usageQuotaSetting.deleteMany();
  });
  it('프로필 생성·조회·수정·삭제와 계정 소유권을 검증한다', async () => {
    expect((await app.inject({ method: 'GET', url: Routes.SajuG.profiles })).statusCode).toBe(401);
    const created = await app.inject({
      method: 'POST',
      url: Routes.SajuG.profiles,
      headers: auth(),
      payload: { name: '내 별명', birth: input.first },
    });
    expect(created.statusCode).toBe(200);
    const p = created.json();
    expect(p.name).toBe('내 별명');
    expect(p.revision).toBe(1);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: Routes.SajuG.profiles,
          headers: { authorization: `Bearer ${other}` },
        })
      ).json().items,
    ).toEqual([]);
    const update = { name: '수정한 별명', birth: input.second, revision: 1 };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: Routes.SajuG.profile(p.id),
          headers: { authorization: `Bearer ${other}` },
          payload: update,
        })
      ).statusCode,
    ).toBe(404);
    const changed = await app.inject({
      method: 'PUT',
      url: Routes.SajuG.profile(p.id),
      headers: auth(),
      payload: update,
    });
    expect(changed.json().revision).toBe(2);
    expect(changed.json().birth.date).toBe(input.second.date);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: Routes.SajuG.profile(p.id),
          headers: auth(),
          payload: update,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: Routes.SajuG.profile(p.id),
          headers: { authorization: `Bearer ${other}` },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: Routes.SajuG.profile(p.id), headers: auth() }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: Routes.SajuG.profiles, headers: auth() })).json()
        .items,
    ).toEqual([]);
  });
  it('없는 날짜·윤달은 프로필에도 저장하지 않는다', async () => {
    for (const birth of [
      { date: '1990-02-30' },
      { date: '2023-03-01', calendar: 'lunar', leapMonth: true },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: Routes.SajuG.profiles,
        headers: auth(),
        payload: { name: '검증', birth },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(await app.prisma.sajuGProfile.count()).toBe(0);
  });
  it('프로필 상한을 넘으면 기존 항목을 보존한다', async () => {
    await app.prisma.sajuGProfile.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        userId: 'pair-a',
        name: `사람 ${i}`,
        birthJson: JSON.stringify(input.first),
      })),
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: Routes.SajuG.profiles,
          headers: auth(),
          payload: { name: '초과', birth: input.first },
        })
      ).statusCode,
    ).toBe(400);
    expect(await app.prisma.sajuGProfile.count()).toBe(20);
  });
  it('궁합 기본 풀이와 공개 공유·PNG·취소를 검증한다', async () => {
    const reading = await app.inject({
      method: 'POST',
      url: Routes.SajuG.pairReading,
      payload: input,
    });
    expect(reading.statusCode).toBe(200);
    expect(SajuGPairResult.parse(reading.json()).source).toBe('basic');
    const share = (
      await app.inject({
        method: 'POST',
        url: Routes.SajuG.shares,
        payload: { pair: { first: input.first, second: input.second } },
      })
    ).json();
    const response = await app.inject({ method: 'GET', url: Routes.SajuG.shared(share.token) });
    const shared = PublicSajuGShare.parse(response.json());
    expect(shared.pair).toBeDefined();
    for (const forbidden of [
      input.first.date,
      input.second.date,
      input.note,
      'birth',
      'solarDate',
      'firstToSecond',
    ])
      expect(response.body).not.toContain(forbidden);
    const png = await app.inject({ method: 'GET', url: Routes.SajuG.shareImage(share.token) });
    expect(png.statusCode).toBe(200);
    expect(png.rawPayload.readUInt32BE(16)).toBe(1080);
    expect(png.rawPayload.readUInt32BE(20)).toBe(1440);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: Routes.SajuG.shared(share.token),
          payload: { revokeToken: 'x'.repeat(32) },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: Routes.SajuG.shared(share.token),
          payload: { revokeToken: share.revokeToken },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: Routes.SajuG.shared(share.token) })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: Routes.SajuG.shareImage(share.token) })).statusCode,
    ).toBe(404);
  });
  it('같은 소유자의 동시 요청만 합류하고 실패 뒤 즉시 재시도한다', async () => {
    let fail = true;
    const complete = vi.fn(async (options: LLMCompleteOptions) => {
      if (fail) throw new Error('provider detail');
      await new Promise((resolve) => setTimeout(resolve, 5));
      const prompt = JSON.parse(options.prompt);
      expect(prompt.relationship).toBe('친구');
      expect(options.prompt).not.toContain(input.first.date);
      return {
        text: JSON.stringify(basicSajuGPairReport(chart)),
        model: options.model,
        promptTokens: 1,
        completionTokens: 1,
      };
    });
    const service = new SajuGPairService(
      { getResolved: async () => ({ defaultModel: 'kimi-k3' }) } as unknown as AiConfigService,
      {
        quota: new UsageQuotaService(app.prisma),
        cache: { get: () => ({ complete }) } as unknown as AdapterCache,
      },
    );
    const actor = { userId: null, guestKey: 'pair-test-guest', ip: '127.0.0.1' };
    expect((await service.create(input, actor)).source).toBe('basic');
    fail = false;
    const results = await Promise.all([service.create(input, actor), service.create(input, actor)]);
    expect(results.every((v) => v.source === 'ai')).toBe(true);
    expect(complete).toHaveBeenCalledTimes(2);
    await service.create(input, actor);
    expect(complete).toHaveBeenCalledTimes(2);
    await service.create(input, { ...actor, guestKey: 'another-test-guest' });
    expect(complete).toHaveBeenCalledTimes(3);
  });
});
