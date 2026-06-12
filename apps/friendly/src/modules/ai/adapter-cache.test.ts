import { describe, expect, it } from 'vitest';
import { AdapterCache } from './adapter-cache.js';
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
  defaultModel: '',
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
    for (let i = 1; i <= 8; i += 1) {
      cache.get(resolved({ apiKey: `k${i}` }));
    }
    // 상한(8) 초과로 가장 오래된 k0 이 제거됨 — 다시 요청하면 새 인스턴스.
    expect(cache.get(resolved({ apiKey: 'k0' }))).not.toBe(first);
    // 마지막으로 넣은 k8 은 살아있다.
    const k8 = cache.get(resolved({ apiKey: 'k8' }));
    expect(cache.get(resolved({ apiKey: 'k8' }))).toBe(k8);
  });
});
