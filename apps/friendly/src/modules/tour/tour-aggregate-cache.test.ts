import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { TOUR_COLD_CONCURRENCY, TourAggregateCache } from './tour-aggregate-cache.js';

// 여행로그 공개 집계 캐시 관문(PLAN-perf-2 D-2) — ① 같은 키 동시 요청은 계산 1번(in-flight 합류) ② 서로 다른 키의 콜드 계산은
// 프로세스 공용 게이트로 동시 TOUR_COLD_CONCURRENCY 개까지 ③ 데이터 버전(LifeMasterSync tour 계열 최신 id — 요청마다 읽는다)이
// 바뀌면 다음 요청부터 재계산 ④ 실패는 캐시하지 않음. DB 없이 가짜 prisma(버전 조회만)로 본다.

const fakePrisma = (state: { version: number; calls: number }): PrismaClient =>
  ({
    lifeMasterSync: {
      aggregate: async () => {
        state.calls += 1;
        return { _max: { id: state.version } };
      },
    },
  }) as unknown as PrismaClient;

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('TourAggregateCache', () => {
  it('같은 키 동시 요청은 계산 하나에 합류하고, 끝난 뒤엔 캐시에서 낸다', async () => {
    const cache = new TourAggregateCache<{ v: number }>(fakePrisma({ version: 1, calls: 0 }), { max: 10 });
    let computed = 0;
    const gate = deferred<void>();
    const compute = async () => {
      computed += 1;
      await gate.promise;
      return { v: 42 };
    };
    const pending = [cache.get('k', compute), cache.get('k', compute), cache.get('k', compute)];
    await flush();
    gate.resolve();
    const out = await Promise.all(pending);
    expect(computed).toBe(1);
    expect(out.every((x) => x === out[0])).toBe(true);
    expect(await cache.get('k', compute)).toBe(out[0]);
    expect(computed).toBe(1);
  });

  it('서로 다른 키의 콜드 계산은 공용 게이트로 동시 TOUR_COLD_CONCURRENCY 개까지만 돈다(캐시 인스턴스가 달라도)', async () => {
    const a = new TourAggregateCache<{ k: string }>(fakePrisma({ version: 1, calls: 0 }), { max: 10 });
    const b = new TourAggregateCache<{ k: string }>(fakePrisma({ version: 1, calls: 0 }), { max: 10 });
    let active = 0;
    let peak = 0;
    const gates = new Map<string, ReturnType<typeof deferred<void>>>();
    const compute = (k: string) => async () => {
      active += 1;
      peak = Math.max(peak, active);
      const g = deferred<void>();
      gates.set(k, g);
      await g.promise;
      active -= 1;
      return { k };
    };
    const keys = ['k1', 'k2', 'k3', 'k4', 'k5'];
    const pending = keys.map((k, i) => (i % 2 === 0 ? a : b).get(k, compute(k)));
    await flush();
    expect(active).toBe(TOUR_COLD_CONCURRENCY);
    // 도는 것을 하나씩 풀면 대기열이 차례로 들어온다 — 어느 시점에도 게이트 한도를 넘지 않는다.
    for (let round = 0; round < keys.length; round++) {
      const [k, g] = gates.entries().next().value!;
      gates.delete(k);
      g.resolve();
      await flush();
      expect(active).toBeLessThanOrEqual(TOUR_COLD_CONCURRENCY);
    }
    expect((await Promise.all(pending)).map((x) => x.k)).toEqual(keys);
    expect(peak).toBe(TOUR_COLD_CONCURRENCY);
  });

  it('데이터 버전(적재·제거 이력)이 바뀌면 다음 요청부터 다시 계산한다 — 버전은 메모하지 않고 요청마다 읽는다', async () => {
    const state = { version: 1, calls: 0 };
    const cache = new TourAggregateCache<{ v: number }>(fakePrisma(state), { max: 10 });
    let computed = 0;
    const compute = async () => ({ v: ++computed });
    expect((await cache.get('k', compute)).v).toBe(1);
    expect((await cache.get('k', compute)).v).toBe(1);
    expect(state.calls).toBe(2);

    // 적재·제거(새 이력) — 바로 다음 요청부터 새로 집계하고, 그다음은 다시 캐시.
    state.version = 2;
    expect((await cache.get('k', compute)).v).toBe(2);
    expect((await cache.get('k', compute)).v).toBe(2);
    expect(computed).toBe(2);
  });

  it('실패한 계산은 캐시하지 않고 다음 요청이 다시 계산한다', async () => {
    const cache = new TourAggregateCache<{ v: number }>(fakePrisma({ version: 1, calls: 0 }), { max: 10 });
    let n = 0;
    const compute = async () => {
      n += 1;
      if (n === 1) throw new Error('boom');
      return { v: n };
    };
    await expect(cache.get('k', compute)).rejects.toThrow('boom');
    expect((await cache.get('k', compute)).v).toBe(2);
  });
});
