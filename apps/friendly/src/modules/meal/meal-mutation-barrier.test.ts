import { describe, expect, it } from 'vitest';
import { MealMutationBarrier } from './meal-mutation-barrier.js';

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
});
