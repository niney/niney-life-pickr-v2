import { describe, expect, it } from 'vitest';
import { AdapterCache } from './adapter-cache.js';
import { AccountGateRegistry } from './concurrency-gate.js';
import { llmTelemetry } from './llm-telemetry.js';
import type { ResolvedProviderConfig } from './ai.config.service.js';

const resolved = (
  overrides: Partial<ResolvedProviderConfig> = {},
): ResolvedProviderConfig => ({
  provider: 'ollama-cloud',
  purpose: 'chat',
  apiKey: 'k',
  baseUrl: 'https://x',
  timeoutMs: 1_000,
  maxConcurrent: 5,
  defaultModels: {
    chat: '',
    image: '',
    'log-analysis': '',
    'meal-photo': '',
    'meal-recommend': '',
  },
  enabled: true,
  ...overrides,
});

describe('AdapterCache', () => {
  it('returns the same adapter instance for an identical config', () => {
    const cache = new AdapterCache();
    const a = cache.get(resolved());
    const b = cache.get(resolved());
    expect(a).toBe(b);
  });

  it('keeps adapters for different purposes alive simultaneously', () => {
    // 단일 슬롯이었을 때의 회귀 — chat/image/log-analysis 가 번갈아 get 하면
    // 서로 밀어내서 매번 새 어댑터(=새 FIFO 게이트)가 생겼다.
    const cache = new AdapterCache();
    const chat = cache.get(resolved({ purpose: 'chat' }));
    const image = cache.get(resolved({ purpose: 'image' }));
    const logs = cache.get(resolved({ purpose: 'log-analysis' }));
    expect(chat).not.toBe(image);
    expect(image).not.toBe(logs);
    // 다른 용도를 거친 뒤에도 기존 인스턴스가 유지된다.
    expect(cache.get(resolved({ purpose: 'chat' }))).toBe(chat);
    expect(cache.get(resolved({ purpose: 'image' }))).toBe(image);
    expect(cache.get(resolved({ purpose: 'log-analysis' }))).toBe(logs);
  });

  it('creates a new adapter when any key component changes', () => {
    const cache = new AdapterCache();
    const a = cache.get(resolved());
    const b = cache.get(resolved({ apiKey: 'rotated' }));
    expect(a).not.toBe(b);
  });

  it('evicts the oldest entry beyond the cap', () => {
    const cache = new AdapterCache();
    const first = cache.get(resolved({ apiKey: 'k0' }));
    for (let i = 1; i <= 16; i += 1) {
      cache.get(resolved({ apiKey: `k${i}` }));
    }
    // 상한(16) 초과로 가장 오래된 k0 이 제거됨 — 다시 요청하면 새 인스턴스.
    expect(cache.get(resolved({ apiKey: 'k0' }))).not.toBe(first);
    // 마지막으로 넣은 k16 은 살아있다.
    const k16 = cache.get(resolved({ apiKey: 'k16' }));
    expect(cache.get(resolved({ apiKey: 'k16' }))).toBe(k16);
  });

  it('용도 9개를 모두 써도 서로 밀어내지 않는다', () => {
    const cache = new AdapterCache();
    const purposes = [
      'chat',
      'image',
      'log-analysis',
      'meal-photo',
      'meal-recommend',
      'meal-supplement',
      'tarot',
      'saju',
      'saju-g',
    ] as const;
    const first = purposes.map((purpose) => cache.get(resolved({ purpose })));
    purposes.forEach((purpose, i) => expect(cache.get(resolved({ purpose }))).toBe(first[i]));
  });
});

describe('AdapterCache 갈래(lane)', () => {
  it('같은 용도의 갈래는 용도 게이트를 따로 두고, 계정 게이트·한도는 같이 쓴다', () => {
    const registry = new AccountGateRegistry(1);
    const cache = new AdapterCache(registry);
    const bulk = cache.get(resolved({ maxConcurrent: 3 }));
    const qa = cache.get(resolved({ maxConcurrent: 3 }), { lane: 'review-qa' });
    expect(qa).not.toBe(bulk);
    expect(cache.get(resolved({ maxConcurrent: 3 }), { lane: 'review-qa' })).toBe(qa);
    // 계정(키) 게이트는 하나 — 갈래가 늘어도 계정 cap 은 용도 한도의 최대(3) 그대로.
    expect(registry.snapshots()).toHaveLength(1);
    expect(registry.snapshots()[0]!.limit).toBe(3);
    // 사용량 패널에는 'chat:review-qa' 로 따로 보인다.
    const gates = llmTelemetry.snapshot().gates.purposes.map((g) => g.purpose);
    expect(gates).toEqual(expect.arrayContaining(['chat', 'chat:review-qa']));
  });
});
