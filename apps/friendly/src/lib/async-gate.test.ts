import { describe, expect, it } from 'vitest';
import { AsyncGate, GateBusyError } from './async-gate.js';

describe('AsyncGate', () => {
  it('상한까지만 동시에 돌리고 나머지는 FIFO 로 넘겨받는다', async () => {
    const gate = new AsyncGate(2);
    const order: string[] = [];
    const releases: Array<() => void> = [];
    const take = async (name: string): Promise<void> => {
      const release = await gate.acquire();
      order.push(name);
      releases.push(release);
    };
    await Promise.all([take('a'), take('b')]);
    const waiting = [take('c'), take('d')];
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(['a', 'b']);
    expect(gate.active).toBe(2);
    expect(gate.queued).toBe(2);

    releases[0]!();
    releases[0]!(); // 두 번 풀어도 한 번만 반영된다
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(['a', 'b', 'c']);
    expect(gate.active).toBe(2);
    releases[1]!();
    await Promise.all(waiting);
    expect(order).toEqual(['a', 'b', 'c', 'd']);
    releases[2]!();
    releases[3]!();
    expect(gate.active).toBe(0);
    expect(gate.queued).toBe(0);
  });

  it('대기열이 가득하거나 대기 시간을 넘기면 GateBusyError 로 거절한다', async () => {
    const gate = new AsyncGate(1, { maxQueue: 1 });
    const release = await gate.acquire();
    const queued = gate.acquire();
    await expect(gate.acquire()).rejects.toBeInstanceOf(GateBusyError);
    expect(gate.tryAcquire()).toBeNull();

    const timed = new AsyncGate(1);
    const held = await timed.acquire();
    await expect(timed.acquire(20)).rejects.toBeInstanceOf(GateBusyError);
    expect(timed.queued).toBe(0); // 시간 초과한 대기자는 대기열에서 빠진다
    held();
    expect(timed.active).toBe(0);

    release();
    const second = await queued;
    second();
    expect(gate.active).toBe(0);
  });

  it('run 은 작업이 실패해도 자리를 돌려준다', async () => {
    const gate = new AsyncGate(1);
    await expect(gate.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(gate.active).toBe(0);
    await expect(gate.run(async () => 7)).resolves.toBe(7);
  });
});
