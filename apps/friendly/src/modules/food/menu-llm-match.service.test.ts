import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { AdapterCache } from '../ai/adapter-cache.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import {
  MenuLlmMatchService,
  decideLlmMatch,
  parseLlmMatchOutput,
} from './menu-llm-match.service.js';
import { MENU_LLM_MATCH_VERSION } from './menu-llm-match.prompts.js';
import { FailureBackoff, MENU_FAILURE_BACKOFF_MS } from './menu-failure-backoff.js';

describe('parseLlmMatchOutput', () => {
  it('JSON 을 풀고 "null" 문자열·빈 값은 null 로', () => {
    expect(parseLlmMatchOutput('{"choice":"짜장면","canonical":"null","confidence":"HIGH","reason":" 동일 "}')).toEqual({
      choice: '짜장면',
      canonical: null,
      confidence: 'high',
      reason: '동일',
    });
    expect(parseLlmMatchOutput('설명 뒤 {"choice":null,"confidence":"weird"} 끝')).toEqual({
      choice: null,
      canonical: null,
      confidence: null,
      reason: null,
    });
    expect(parseLlmMatchOutput('not json')).toBeNull();
  });
});

describe('decideLlmMatch', () => {
  const rows = [{ name: '짜장면' }, { name: '간자장' }];
  const lookup = (n: string) => (n === '돼지고기덮밥' ? { name: '돼지고기덮밥' } : null);

  it('후보 선택은 high 신뢰도일 때만 채택', () => {
    expect(decideLlmMatch({ choice: '짜장면', canonical: null, confidence: 'high', reason: null }, rows, lookup)?.name).toBe('짜장면');
    expect(decideLlmMatch({ choice: '짜장면', canonical: null, confidence: 'medium', reason: null }, rows, lookup)).toBeNull();
  });

  it('후보 밖 선택은 무시하고, 표준명이 카탈로그와 맞으면 medium 까지 채택', () => {
    expect(decideLlmMatch({ choice: '만든이름', canonical: '돼지고기덮밥', confidence: 'high', reason: null }, rows, lookup)?.name).toBe('돼지고기덮밥');
    expect(decideLlmMatch({ choice: null, canonical: '돼지고기덮밥', confidence: 'medium', reason: null }, rows, lookup)?.name).toBe('돼지고기덮밥');
    // 후보가 없어(choice null) low 를 준 경우는 표준명 정확 일치를 받는다.
    expect(decideLlmMatch({ choice: null, canonical: '돼지고기덮밥', confidence: 'low', reason: null }, rows, lookup)?.name).toBe('돼지고기덮밥');
    // 후보를 골랐는데 low 면 표준명도 믿지 않는다.
    expect(decideLlmMatch({ choice: '간자장', canonical: '돼지고기덮밥', confidence: 'low', reason: null }, rows, lookup)).toBeNull();
    expect(decideLlmMatch({ choice: null, canonical: '없는음식', confidence: 'high', reason: null }, rows, lookup)).toBeNull();
  });
});

// DB·provider 없이 — 필요한 Prisma 메서드와 provider 만 흉내낸다.
const makeFakes = () => {
  const catalog = [
    { id: 'f1', name: '짜장면', nameNorm: '짜장면', aliasNormsJson: '["자장면"]', kcalPer100g: 150, nutritionFrom: null, active: true },
    { id: 'f2', name: '돼지고기덮밥', nameNorm: '돼지고기덮밥', aliasNormsJson: '[]', kcalPer100g: 130, nutritionFrom: null, active: true },
  ];
  const store = new Map<string, { nameNorm: string; foodId: string | null; canonical: string | null; version: number }>();
  const calls: string[] = [];
  const prisma = {
    menuLlmMatch: {
      findMany: async ({ where }: { where: { nameNorm: { in: string[] }; version: { gte: number } } }) =>
        [...store.values()].filter((r) => where.nameNorm.in.includes(r.nameNorm) && r.version >= where.version.gte),
      upsert: async ({ where, create }: { where: { nameNorm: string }; create: { foodId: string | null; canonical: string | null; version: number } }) => {
        store.set(where.nameNorm, { nameNorm: where.nameNorm, foodId: create.foodId, canonical: create.canonical, version: create.version });
        return {};
      },
    },
    foodItem: {
      findMany: async ({ where }: { where: { id?: { in: string[] } } }) =>
        where.id ? catalog.filter((c) => where.id!.in.includes(c.id)) : catalog,
    },
  } as unknown as PrismaClient;
  const provider: LLMProvider = {
    complete: async ({ prompt }) => {
      calls.push(prompt);
      if (prompt.includes('메뉴명: 북경간짜장')) {
        return { text: '{"choice":"짜장면","canonical":"짜장면","confidence":"high","reason":"동일"}', model: 'm', promptTokens: null, completionTokens: null };
      }
      if (prompt.includes('메뉴명: 부타동')) {
        return { text: '{"choice":null,"canonical":"돼지고기덮밥","confidence":"medium","reason":"일본식 덮밥"}', model: 'm', promptTokens: null, completionTokens: null };
      }
      return { text: '{"choice":null,"canonical":null,"confidence":"low","reason":"모름"}', model: 'm', promptTokens: null, completionTokens: null };
    },
  };
  const aiConfig = {
    getResolved: async () => ({ apiKey: 'k', baseUrl: 'u', timeoutMs: 1000, maxConcurrent: 2, defaultModel: 'gpt-oss:120b' }),
  } as unknown as AiConfigService;
  const cache = { get: () => provider } as unknown as AdapterCache;
  return { prisma, aiConfig, cache, calls, store };
};

describe('MenuLlmMatchService', () => {
  it('캐시에 없는 이름만 묻고, 부정 결과까지 저장해 다시 묻지 않는다', async () => {
    const f = makeFakes();
    const svc = new MenuLlmMatchService(f.prisma, f.aiConfig, { model: 'gemma4:31b', cache: f.cache });

    const first = await svc.matchMany(['북경간짜장', '부타동', '소주', '북경간짜장']);
    expect(first.get('북경간짜장')).toEqual({
      hit: { foodId: 'f1', foodName: '짜장면', kcalPer100g: 150, nutritionFrom: null },
      canonical: '짜장면',
    });
    expect(first.get('부타동')?.hit?.foodId).toBe('f2');
    expect(first.get('소주')).toEqual({ hit: null, canonical: null });
    expect(f.calls).toHaveLength(3);
    expect(f.store.get('소주')).toEqual({ nameNorm: '소주', foodId: null, canonical: null, version: MENU_LLM_MATCH_VERSION });

    const cached = await svc.lookupCached(['북경간짜장', '소주', '새이름']);
    expect(cached.get('북경간짜장')?.hit?.foodName).toBe('짜장면');
    expect(cached.has('소주')).toBe(true);
    expect(cached.get('소주')).toEqual({ hit: null, canonical: null });
    expect(cached.has('새이름')).toBe(false);

    const second = await svc.matchMany(['북경간짜장', '소주']);
    expect(second.size).toBe(0);
    expect(f.calls).toHaveLength(3);
  });

  it('provider 가 없으면 묻지 않는다', async () => {
    const f = makeFakes();
    const svc = new MenuLlmMatchService(
      f.prisma,
      { getResolved: async () => null } as unknown as AiConfigService,
      { cache: f.cache },
    );
    expect((await svc.matchMany(['북경간짜장'])).size).toBe(0);
    expect(f.calls).toHaveLength(0);
  });

  it('응답 해석 실패는 재시도 간격 동안 "매칭 없음"으로 보고, 세 번 쌓이면 포기를 저장한다', async () => {
    const f = makeFakes();
    let clock = 1_000_000;
    let calls = 0;
    const broken: LLMProvider = {
      complete: async () => {
        calls += 1;
        return { text: '이건 JSON 이 아니다', model: 'm', promptTokens: null, completionTokens: null };
      },
    };
    const svc = new MenuLlmMatchService(f.prisma, f.aiConfig, {
      cache: { get: () => broken } as unknown as AdapterCache,
      failures: new FailureBackoff({ now: () => clock }),
    });

    expect((await svc.matchMany(['깨지는메뉴'])).size).toBe(0);
    expect(calls).toBe(1);
    // 간격 안에서는 다시 묻지 않고, 공개 응답이 대기(llmPending)로 남지 않게 "매칭 없음"으로 준다.
    expect((await svc.lookupCached(['깨지는메뉴'])).get('깨지는메뉴')).toEqual({ hit: null, canonical: null });
    await svc.matchMany(['깨지는메뉴']);
    expect(calls).toBe(1);
    expect(f.store.has('깨지는메뉴')).toBe(false);

    clock += MENU_FAILURE_BACKOFF_MS + 1;
    await svc.matchMany(['깨지는메뉴']);
    expect(calls).toBe(2);
    expect(f.store.has('깨지는메뉴')).toBe(false);

    clock += MENU_FAILURE_BACKOFF_MS + 1;
    await svc.matchMany(['깨지는메뉴']);
    expect(calls).toBe(3);
    // 세 번째 해석 실패 — 부정 결과(포기)로 저장해 이후 영구히 묻지 않는다.
    expect(f.store.get('깨지는메뉴')).toMatchObject({ foodId: null, canonical: null, version: MENU_LLM_MATCH_VERSION });
    clock += MENU_FAILURE_BACKOFF_MS + 1;
    await svc.matchMany(['깨지는메뉴']);
    expect(calls).toBe(3);
  });

  it('업스트림 장애는 간격만 두고 포기하지 않는다', async () => {
    const f = makeFakes();
    let clock = 1_000_000;
    let calls = 0;
    const down: LLMProvider = {
      complete: async () => {
        calls += 1;
        throw new Error('upstream 503');
      },
    };
    const svc = new MenuLlmMatchService(f.prisma, f.aiConfig, {
      cache: { get: () => down } as unknown as AdapterCache,
      failures: new FailureBackoff({ now: () => clock }),
    });
    for (let i = 0; i < 4; i += 1) {
      await svc.matchMany(['장애메뉴']);
      await svc.matchMany(['장애메뉴']); // 간격 안 — 다시 묻지 않는다
      clock += MENU_FAILURE_BACKOFF_MS + 1;
    }
    expect(calls).toBe(4);
    expect(f.store.has('장애메뉴')).toBe(false);
  });
});
