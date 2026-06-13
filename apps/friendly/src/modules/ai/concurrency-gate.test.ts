import { describe, expect, it } from 'vitest';
import { AccountGateRegistry, ConcurrencyGate } from './concurrency-gate.js';
import { LLMCancelledError } from './adapters/llm-provider.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('ConcurrencyGate', () => {
  it('caps inflight at limit and grants FIFO', async () => {
    const gate = new ConcurrencyGate(2);
    const order: number[] = [];

    await gate.acquire();
    await gate.acquire();
    expect(gate.snapshot()).toMatchObject({ inflight: 2, queued: 0 });

    const p3 = gate.acquire().then(() => order.push(3));
    const p4 = gate.acquire().then(() => order.push(4));
    await tick();
    expect(order).toEqual([]);
    expect(gate.snapshot().queued).toBe(2);

    gate.release();
    await p3;
    expect(order).toEqual([3]);

    gate.release();
    await p4;
    expect(order).toEqual([3, 4]);
  });

  it('rejects immediately when signal is already aborted', async () => {
    const gate = new ConcurrencyGate(1);
    const ac = new AbortController();
    ac.abort();
    await expect(gate.acquire(ac.signal)).rejects.toBeInstanceOf(LLMCancelledError);
    expect(gate.snapshot().inflight).toBe(0);
  });

  it('removes a queued waiter when its signal aborts — slot never consumed', async () => {
    const gate = new ConcurrencyGate(1);
    await gate.acquire();

    const ac = new AbortController();
    const cancelled = gate.acquire(ac.signal);
    const survivor = gate.acquire();
    await tick();
    expect(gate.snapshot().queued).toBe(2);

    ac.abort();
    await expect(cancelled).rejects.toBeInstanceOf(LLMCancelledError);
    expect(gate.snapshot().queued).toBe(1);

    // 취소된 waiter 를 건너뛰고 다음 waiter 가 슬롯을 받는다.
    gate.release();
    await survivor;
    expect(gate.snapshot()).toMatchObject({ inflight: 1, queued: 0 });
  });

  it('setLimit raise wakes queued waiters; lower only blocks new entries', async () => {
    const gate = new ConcurrencyGate(1);
    await gate.acquire();
    let granted = false;
    const waiting = gate.acquire().then(() => {
      granted = true;
    });
    await tick();
    expect(granted).toBe(false);

    gate.setLimit(2);
    await waiting;
    expect(granted).toBe(true);
    expect(gate.snapshot()).toMatchObject({ limit: 2, inflight: 2 });

    // 한도를 줄여도 진행 중 요청은 그대로 — 신규만 대기.
    gate.setLimit(1);
    let third = false;
    const p3 = gate.acquire().then(() => {
      third = true;
    });
    await tick();
    expect(third).toBe(false);

    gate.release();
    await tick();
    expect(third).toBe(false); // inflight 1 == limit 1, 아직 못 들어감
    gate.release();
    await p3;
    expect(third).toBe(true);
  });

  it('reports oldestWaitMs for the queue head', async () => {
    const gate = new ConcurrencyGate(1);
    await gate.acquire();
    const p = gate.acquire();
    await new Promise((r) => setTimeout(r, 20));
    const snap = gate.snapshot();
    expect(snap.oldestWaitMs).not.toBeNull();
    expect(snap.oldestWaitMs!).toBeGreaterThanOrEqual(10);
    gate.release();
    await p;
  });
});

describe('AccountGateRegistry', () => {
  it('returns the same gate for the same apiKey|baseUrl', () => {
    const reg = new AccountGateRegistry(5);
    const a = reg.get('key-1', 'https://ollama.com', 'chat', 5);
    const b = reg.get('key-1', 'https://ollama.com', 'image', 5);
    const c = reg.get('key-2', 'https://ollama.com', 'chat', 5);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('shares one gate across purposes — combined inflight never exceeds the cap', async () => {
    const reg = new AccountGateRegistry(2);
    // chat / image 가 같은 키를 쓰는 상황을 모사.
    const chatGate = reg.get('k', 'u', 'chat', 2);
    const imageGate = reg.get('k', 'u', 'image', 2);

    await chatGate.acquire();
    await imageGate.acquire();
    let granted = false;
    const p = chatGate.acquire().then(() => {
      granted = true;
    });
    await tick();
    expect(granted).toBe(false); // 합산 2 == cap 2 → 대기

    imageGate.release();
    await p;
    expect(granted).toBe(true);
  });

  it('syncs the account cap to the max of resolved purpose limits (DB-first)', () => {
    // env(fallback)=15 여도 웹 설정(DB)이 chat=1 이면 계정 cap 도 1 —
    // 패널 분모가 설정 화면과 일치해야 한다.
    const reg = new AccountGateRegistry(15);
    const gate = reg.get('k', 'u', 'chat', 1);
    expect(gate.snapshot().limit).toBe(1);

    // 다른 purpose 가 더 큰 한도로 resolve 되면 max 로 올라간다.
    reg.get('k', 'u', 'image', 3);
    expect(gate.snapshot().limit).toBe(3);

    // 같은 purpose 의 한도 변경(웹 설정 수정)은 즉시 재계산.
    reg.get('k', 'u', 'image', 2);
    expect(gate.snapshot().limit).toBe(2);

    // 다른 키는 독립 — 폴백에서 시작해 자기 purpose 한도로 동기화.
    const other = reg.get('k2', 'u', 'chat', 7);
    expect(other.snapshot().limit).toBe(7);
    expect(gate.snapshot().limit).toBe(2);
  });
});
