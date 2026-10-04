import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramService, nextRetryDelayMs } from './telegram.service.js';

// 모의 fetch 로만 — 실제 텔레그램 API 호출 없음.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const jsonRes = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

// 신호가 끊을 때까지 매달리는 응답(롱폴·반쯤 끊긴 연결 흉내).
const hang = (init?: RequestInit) =>
  new Promise<Response>((_res, rej) => {
    const signal = init?.signal;
    if (signal?.aborted) return rej(signal.reason);
    signal?.addEventListener('abort', () => rej(signal.reason));
  });

const callbackUpdate = (id: number) => ({
  update_id: id,
  callback_query: { id: `cb${id}`, data: `rc:run:${id}`, message: { message_id: id, chat: { id: 1 } } },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('nextRetryDelayMs', () => {
  it('2초에서 두 배씩, 최대 60초', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map((n) => nextRetryDelayMs(n))).toEqual([
      2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000,
    ]);
  });
});

describe('TelegramService 폴링', () => {
  it('getUpdates 가 계속 실패하면 재시도 간격이 지수로 늘어난다(2초 고정 아님)', async () => {
    const at: number[] = [];
    const t0 = Date.now();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        at.push(Date.now() - t0);
        throw new TypeError('fetch failed');
      }),
    );
    const tg = new TelegramService({
      botToken: '1:x',
      chatId: '1',
      timing: { retryBaseMs: 20, retryMaxMs: 80 },
    });
    tg.startPolling();
    await sleep(400);
    tg.stopPolling();
    const gaps = at.slice(1).map((v, i) => v - at[i]!);
    // 20 → 40 → 80 → 80(상한) …
    expect(gaps[0]).toBeGreaterThanOrEqual(15);
    expect(gaps[1]).toBeGreaterThanOrEqual(35);
    expect(gaps[2]).toBeGreaterThanOrEqual(70);
    expect(Math.max(...gaps)).toBeLessThan(160);
  });

  it('응답 없는 롱폴은 (대기 + 여유) 뒤 스스로 끊고 다시 시도한다', async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        signals.push(init!.signal!);
        return hang(init);
      }),
    );
    const tg = new TelegramService({
      botToken: '1:x',
      chatId: '1',
      timing: { pollTimeoutSec: 0, pollGraceMs: 30, retryBaseMs: 10, retryMaxMs: 10 },
    });
    tg.startPolling();
    await sleep(200);
    tg.stopPolling();
    // 타임아웃으로 끊긴 뒤 재시도가 이어졌다 — stop 이 아니라 자체 상한이 첫 요청을 끝냈다.
    expect(signals.length).toBeGreaterThanOrEqual(2);
    expect(signals[0]!.aborted).toBe(true);
  });

  it('핸들러를 기다리지 않고 다음 업데이트를 받고, 핸들러끼리는 도착 순서대로 하나씩 돈다', async () => {
    let call = 0;
    const getUpdatesAt: number[] = [];
    const t0 = Date.now();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        getUpdatesAt.push(Date.now() - t0);
        call += 1;
        if (call === 1) return jsonRes({ ok: true, result: [callbackUpdate(1), callbackUpdate(2)] });
        return hang(init);
      }),
    );
    const tg = new TelegramService({ botToken: '1:x', chatId: '1' });
    const events: string[] = [];
    tg.onCallback(async (cb) => {
      events.push(`start ${cb.data}`);
      await sleep(80);
      events.push(`end ${cb.data}`);
    });
    tg.startPolling();
    await sleep(40);
    // 첫 핸들러가 아직 도는 중인데 두 번째 롱폴이 이미 나갔다.
    expect(getUpdatesAt.length).toBe(2);
    expect(events).toEqual(['start rc:run:1']);
    await sleep(250);
    tg.stopPolling();
    expect(events).toEqual(['start rc:run:1', 'end rc:run:1', 'start rc:run:2', 'end rc:run:2']);
  });

  it('핸들러 오류가 다음 핸들러를 막지 않는다', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        call += 1;
        if (call === 1) return jsonRes({ ok: true, result: [callbackUpdate(1), callbackUpdate(2)] });
        return hang(init);
      }),
    );
    const warn = vi.fn();
    const error = vi.fn();
    const tg = new TelegramService({
      botToken: '1:x',
      chatId: '1',
      logger: { warn, error, info: vi.fn(), debug: vi.fn() } as never,
    });
    const seen: string[] = [];
    tg.onCallback(async (cb) => {
      seen.push(cb.data);
      if (cb.data.endsWith(':1')) throw new Error('boom');
    });
    tg.startPolling();
    await sleep(50);
    tg.stopPolling();
    expect(seen).toEqual(['rc:run:1', 'rc:run:2']);
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe('TelegramService 송신', () => {
  it('송신이 응답 없이 매달리면 상한 뒤 null 로 끝난다(회차를 막지 않는다)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => hang(init)),
    );
    const warn = vi.fn();
    const tg = new TelegramService({
      botToken: '1:x',
      chatId: '1',
      logger: { warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() } as never,
      timing: { sendTimeoutMs: 40 },
    });
    const t0 = Date.now();
    await expect(tg.sendCandidates({ text: 'hi', buttons: [] })).resolves.toBeNull();
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(warn).toHaveBeenCalled();
  });
});
