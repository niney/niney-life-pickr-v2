import { describe, expect, it, vi } from 'vitest';
import { KeyedCache } from './keyed-cache.js';

const loaded = (value: string, bytes = 10) => ({ value, bytes });

describe('KeyedCache', () => {
  it('들고 있는 동안은 다시 만들지 않고, 같은 키 동시 요청은 한 번만 만든다', async () => {
    const cache = new KeyedCache<string>({ ttlMs: 1_000, maxBytes: 1_000 });
    let release!: () => void;
    const load = vi.fn(() => new Promise<{ value: string; bytes: number }>((r) => (release = () => r(loaded('a')))));
    const both = Promise.all([cache.get('k', load), cache.get('k', load)]);
    release();
    expect(await both).toEqual(['a', 'a']);
    expect(await cache.get('k', load)).toBe('a');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('만료 직후(ttl 안)는 지난 값을 바로 내고 뒤에서 한 번 다시 만들며, 더 오래되면 새 값을 기다린다', async () => {
    let now = 0;
    const cache = new KeyedCache<string>({ ttlMs: 1_000, maxBytes: 1_000, now: () => now });
    await cache.get('k', async () => loaded('v1'));
    now = 1_500;
    let release!: () => void;
    const load = vi.fn(() => new Promise<{ value: string; bytes: number }>((r) => (release = () => r(loaded('v2')))));
    expect(await cache.get('k', load)).toBe('v1');
    expect(await cache.get('k', load)).toBe('v1');
    expect(load).toHaveBeenCalledTimes(1);
    release();
    await vi.waitFor(async () => expect(await cache.get('k', load)).toBe('v2'));
    // v2 는 now=1_500 에 담겨 2_500 까지 새것, 3_500 까지 지난 값 — 그 뒤는 기다린다.
    now = 4_000;
    expect(await cache.get('k', async () => loaded('v3'))).toBe('v3');
  });

  it('없으면(null) 담지 않고, 뒤에서 다시 만들다 없어진 키는 지난 값도 버린다', async () => {
    let now = 0;
    const cache = new KeyedCache<string>({ ttlMs: 1_000, maxBytes: 1_000, now: () => now });
    const none = vi.fn(async () => null);
    expect(await cache.get('x', none)).toBeNull();
    expect(await cache.get('x', none)).toBeNull();
    expect(none).toHaveBeenCalledTimes(2);
    await cache.get('k', async () => loaded('v1'));
    now = 1_500;
    expect(await cache.get('k', none)).toBe('v1');
    await vi.waitFor(() => expect(none).toHaveBeenCalledTimes(3));
    expect(await cache.get('k', async () => loaded('v2'))).toBe('v2');
  });

  it('만들다 실패하면 그대로 던지고 담지 않으며, 뒤에서 갱신하다 실패하면 지난 값을 둔다', async () => {
    let now = 0;
    const cache = new KeyedCache<string>({ ttlMs: 1_000, maxBytes: 1_000, now: () => now });
    await expect(cache.get('k', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await cache.get('k', async () => loaded('v1'));
    now = 1_500;
    const failing = vi.fn(async () => Promise.reject(new Error('boom')));
    expect(await cache.get('k', failing)).toBe('v1');
    await vi.waitFor(() => expect(failing).toHaveBeenCalledTimes(1));
    await new Promise((r) => setImmediate(r));
    expect(await cache.get('k', failing)).toBe('v1');
  });

  it('invalidateAll 은 비우고, 그 전에 시작한 결과는 담지 않는다', async () => {
    const cache = new KeyedCache<string>({ ttlMs: 1_000, maxBytes: 1_000 });
    await cache.get('k', async () => loaded('v1'));
    let release!: () => void;
    const slow = new Promise<{ value: string; bytes: number }>((r) => (release = () => r(loaded('old'))));
    const k2 = cache.get('k2', () => slow);
    cache.invalidateAll();
    release();
    expect(await k2).toBe('old');
    const fresh = vi.fn(async () => loaded('new'));
    expect(await cache.get('k', fresh)).toBe('new');
    expect(await cache.get('k2', fresh)).toBe('new');
    expect(fresh).toHaveBeenCalledTimes(2);
  });

  it('크기 상한을 넘으면 오래 안 쓴 키부터 버린다', async () => {
    const cache = new KeyedCache<string>({ ttlMs: 60_000, maxBytes: 100 });
    await cache.get('a', async () => loaded('A', 60));
    await cache.get('b', async () => loaded('B', 60));
    const again = vi.fn(async () => loaded('A2', 60));
    expect(await cache.get('a', again)).toBe('A2');
    expect(again).toHaveBeenCalledTimes(1);
  });
});
