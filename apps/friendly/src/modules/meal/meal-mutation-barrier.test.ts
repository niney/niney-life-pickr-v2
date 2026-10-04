import { describe, expect, it } from 'vitest';
import { MealDataGeneration, MealMutationBarrier } from './meal-mutation-barrier.js';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('MealMutationBarrier', () => {
  it('같은 사용자 작업은 FIFO이고 다른 사용자는 병렬로 진행한다', async () => {
    const barrier = new MealMutationBarrier();
    const firstEntered = deferred();
    const releaseFirst = deferred();
    const order: string[] = [];

    const first = barrier.runExclusive('same-user', async () => {
      order.push('first:start');
      firstEntered.resolve();
      await releaseFirst.promise;
      order.push('first:end');
    });
    await firstEntered.promise;

    const second = barrier.runExclusive('same-user', async () => {
      order.push('second');
    });
    const other = barrier.runExclusive('other-user', async () => {
      order.push('other');
    });
    await other;

    expect(order).toEqual(['first:start', 'other']);
    releaseFirst.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'other', 'first:end', 'second']);
    expect(barrier.pendingUserCount()).toBe(0);
  });

  it('작업이 실패해도 다음 작업과 사용자 키 정리를 막지 않는다', async () => {
    const barrier = new MealMutationBarrier();
    await expect(
      barrier.runExclusive('user', async () => {
        throw new Error('expected');
      }),
    ).rejects.toThrow('expected');

    await expect(barrier.runExclusive('user', async () => 'continued')).resolves.toBe('continued');
    expect(barrier.pendingUserCount()).toBe(0);
  });

  it('acquire 는 같은 FIFO 에서 잡고, release 를 부를 때까지 다음 작업을 막는다(여러 번 불러도 한 번)', async () => {
    const barrier = new MealMutationBarrier();
    const order: string[] = [];
    const release = await barrier.acquire('user');
    const next = barrier.runExclusive('user', async () => {
      order.push('next');
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual([]);
    release();
    release();
    await next;
    expect(order).toEqual(['next']);
    expect(barrier.pendingUserCount()).toBe(0);
  });
});

describe('MealDataGeneration', () => {
  it('전체 삭제는 두 범위를, 추천 전체 삭제는 추천 범위만 바꾼다', () => {
    const generation = new MealDataGeneration();
    const all0 = generation.read('u', 'all');
    const rec0 = generation.read('u', 'recommendations');
    generation.bump('u', 'recommendations');
    expect(generation.read('u', 'all')).toBe(all0);
    expect(generation.read('u', 'recommendations')).not.toBe(rec0);
    const rec1 = generation.read('u', 'recommendations');
    generation.bump('u', 'all');
    expect(generation.read('u', 'all')).not.toBe(all0);
    expect(generation.read('u', 'recommendations')).not.toBe(rec1);
    expect(generation.read('other', 'all')).toBe(0);
  });
});
