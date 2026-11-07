import { describe, expect, it, vi } from 'vitest';
import { HikingRecommendService } from './hiking-recommend.service.js';

// 추천 색인 수명 — 같은 산 적재본이면 TTL 이 지나도 이전 색인으로 바로 답하고 뒤에서 다시 만든다(예전엔 다시 만드는
// 동안 모든 추천이 기다렸다). 적재본이 바뀌면 새 색인을 기다린다. DB 없이 색인 빌드만 가짜로 바꿔 시점을 쥔다.

const HOUR_MS = 3_600_000;

const setup = () => {
  let syncId = 1;
  let nowMs = Date.parse('2026-11-07T00:00:00Z');
  const svc = new HikingRecommendService({
    prisma: { hikingSync: { findFirst: async () => ({ id: syncId }) } } as never,
    conditions: { get: async () => null, hasFreshWeather: () => false } as never,
    now: () => new Date(nowMs),
  });
  const internals = svc as unknown as { mountains(): Promise<unknown[]>; build(): Promise<unknown[]> };
  const build = vi.spyOn(internals, 'build');
  return {
    mountains: () => internals.mountains(),
    build,
    advance: (ms: number) => {
      nowMs += ms;
    },
    reload: () => {
      syncId += 1;
    },
  };
};

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('HikingRecommendService 추천 색인', () => {
  it('TTL 이 지나도 같은 적재본이면 이전 색인으로 바로 답하고, 뒤에서 다시 만든 색인을 다음부터 쓴다', async () => {
    const t = setup();
    const old = ['old'];
    t.build.mockResolvedValueOnce(old);
    expect(await t.mountains()).toBe(old);

    const next = deferred<unknown[]>();
    t.build.mockReturnValueOnce(next.promise);
    t.advance(6 * HOUR_MS + 1);
    expect(await t.mountains()).toBe(old); // 다시 만드는 중이어도 기다리지 않는다
    expect(await t.mountains()).toBe(old);
    expect(t.build).toHaveBeenCalledTimes(2); // 뒤에서 한 번만

    const fresh = ['fresh'];
    next.resolve(fresh);
    await vi.waitFor(async () => expect(await t.mountains()).toBe(fresh));
    expect(t.build).toHaveBeenCalledTimes(2);
  });

  it('뒤에서 다시 만들다 실패하면 이전 색인을 계속 쓰고 다음 요청이 다시 시도한다', async () => {
    const t = setup();
    const old = ['old'];
    t.build.mockResolvedValueOnce(old);
    await t.mountains();
    t.advance(6 * HOUR_MS + 1);
    t.build.mockRejectedValueOnce(new Error('db busy'));
    expect(await t.mountains()).toBe(old);
    await vi.waitFor(() => expect(t.build).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 0));
    t.build.mockResolvedValueOnce(['again']);
    expect(await t.mountains()).toBe(old);
    await vi.waitFor(async () => expect(await t.mountains()).toEqual(['again']));
  });

  it('산 적재본이 바뀌면 새 색인이 만들어질 때까지 기다린다(옛 색인은 지워진 코스를 가리킬 수 있다)', async () => {
    const t = setup();
    t.build.mockResolvedValueOnce(['old']);
    await t.mountains();
    t.reload();
    const fresh = ['fresh'];
    t.build.mockResolvedValueOnce(fresh);
    expect(await t.mountains()).toBe(fresh);
  });
});
