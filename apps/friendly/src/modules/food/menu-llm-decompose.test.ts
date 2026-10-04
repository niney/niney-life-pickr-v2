import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { AdapterCache } from '../ai/adapter-cache.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import { FailureBackoff, MENU_FAILURE_BACKOFF_MS } from './menu-failure-backoff.js';
import {
  MENU_LLM_DECOMPOSE_VERSION,
  MenuLlmDecomposeService,
  decideDecomposition,
  parseDecomposeOutput,
} from './menu-llm-decompose.service.js';

describe('menu-llm-decompose', () => {
  it('JSON 을 파싱하고, low·null·너무 적거나 많은 구성·기호 섞인 구성은 채택하지 않는다', () => {
    expect(parseDecomposeOutput('```json\n{"components":["삼겹살","목살"],"confidence":"high","reason":"돼지모듬"}\n```')).toEqual({
      components: ['삼겹살', '목살'],
      confidence: 'high',
      reason: '돼지모듬',
    });
    expect(parseDecomposeOutput('{"components":null,"confidence":"bad"}')).toBeNull();
    expect(decideDecomposition({ components: ['삼겹살', '목살'], confidence: 'low', reason: null })).toBeNull();
    expect(decideDecomposition({ components: null, confidence: 'high', reason: null })).toBeNull();
    expect(decideDecomposition({ components: ['삼겹살'], confidence: 'high', reason: null })).toEqual(['삼겹살']);
    expect(decideDecomposition({ components: ['삼겹살', '목살'], confidence: 'medium', reason: null })).toBeNull();
    // 범주어는 빠진다 — 남는 게 없으면 null.
    expect(decideDecomposition({ components: ['고기', '와인'], confidence: 'high', reason: null })).toEqual(['와인']);
    expect(decideDecomposition({ components: ['고기', '음료'], confidence: 'high', reason: null })).toBeNull();
    expect(decideDecomposition({ components: ['삼겹살 200g', '목살', '항정살', '목 살'], confidence: 'high', reason: null })).toEqual([
      '목살',
      '항정살',
    ]);
  });

  it('응답 해석 실패는 간격 동안 "분해 없음"으로 보고, 세 번 쌓이면 포기를 저장한다', async () => {
    const store = new Map<string, { nameNorm: string; componentsJson: string; version: number }>();
    const prisma = {
      menuLlmDecomposition: {
        findMany: async ({ where }: { where: { nameNorm: { in: string[] }; version: { gte: number } } }) =>
          [...store.values()].filter((r) => where.nameNorm.in.includes(r.nameNorm) && r.version >= where.version.gte),
        upsert: async ({ where, create }: { where: { nameNorm: string }; create: { componentsJson: string; version: number } }) => {
          store.set(where.nameNorm, { nameNorm: where.nameNorm, componentsJson: create.componentsJson, version: create.version });
          return {};
        },
      },
    } as unknown as PrismaClient;
    let calls = 0;
    const provider: LLMProvider = {
      complete: async () => {
        calls += 1;
        return { text: '모르겠다', model: 'm', promptTokens: null, completionTokens: null };
      },
    };
    let clock = 1_000_000;
    const svc = new MenuLlmDecomposeService(
      prisma,
      { getResolved: async () => ({ defaultModel: 'm' }) } as unknown as AiConfigService,
      { cache: { get: () => provider } as unknown as AdapterCache, failures: new FailureBackoff({ now: () => clock }) },
    );

    await svc.decomposeMany(['커플세트']);
    expect(calls).toBe(1);
    expect((await svc.lookupCached(['커플세트'])).get('커플세트')).toBeNull();
    await svc.decomposeMany(['커플세트']);
    expect(calls).toBe(1);
    for (let i = 0; i < 2; i += 1) {
      clock += MENU_FAILURE_BACKOFF_MS + 1;
      await svc.decomposeMany(['커플세트']);
    }
    expect(calls).toBe(3);
    expect(store.get('커플세트')).toMatchObject({ componentsJson: '[]', version: MENU_LLM_DECOMPOSE_VERSION });
  });
});
