import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'playwright';
import { LazyBrowser } from './lazy-browser.js';

// Chromium 수명주기(A-7) — 실제 Playwright 없이 가짜 브라우저로 launch 실패 재시도·크래시 후
// 재생성·idle 종료·사용 중 보호를 고정한다.

class FakeBrowser extends EventEmitter {
  closed = false;
  async close(): Promise<void> {
    this.closed = true;
    this.emit('disconnected');
  }
  crash(): void {
    this.emit('disconnected');
  }
}

const asBrowser = (b: FakeBrowser): Browser => b as unknown as Browser;

afterEach(() => {
  vi.useRealTimers();
});

describe('LazyBrowser', () => {
  it('첫 get 때만 launch 하고 같은 브라우저를 재사용한다', async () => {
    const launch = vi.fn(async () => asBrowser(new FakeBrowser()));
    const holder = new LazyBrowser({ launch });
    expect(launch).not.toHaveBeenCalled();
    const [a, b] = await Promise.all([holder.get(), holder.get()]);
    expect(a).toBe(b);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('launch 실패를 캐시하지 않는다 — 다음 호출이 다시 띄운다', async () => {
    const ok = new FakeBrowser();
    const launch = vi
      .fn<() => Promise<Browser>>()
      .mockRejectedValueOnce(new Error('launch failed'))
      .mockResolvedValueOnce(asBrowser(ok));
    const holder = new LazyBrowser({ launch });
    await expect(holder.get()).rejects.toThrow('launch failed');
    // reset 은 rejection 처리 후(마이크로태스크) 일어난다.
    await Promise.resolve();
    expect(await holder.get()).toBe(asBrowser(ok));
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('브라우저가 끊기면(크래시) 버리고 다음 호출이 새로 띄운다 — 파생 상태도 비운다', async () => {
    const first = new FakeBrowser();
    const second = new FakeBrowser();
    const launch = vi
      .fn<() => Promise<Browser>>()
      .mockResolvedValueOnce(asBrowser(first))
      .mockResolvedValueOnce(asBrowser(second));
    const onReset = vi.fn();
    const holder = new LazyBrowser({ launch, onReset });
    expect(await holder.get()).toBe(asBrowser(first));
    first.crash();
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(holder.isRunning()).toBe(false);
    expect(await holder.get()).toBe(asBrowser(second));
  });

  it('close 는 참조를 먼저 끊는다 — 닫는 동안 들어온 호출은 새 브라우저를 받는다', async () => {
    const first = new FakeBrowser();
    const second = new FakeBrowser();
    const launch = vi
      .fn<() => Promise<Browser>>()
      .mockResolvedValueOnce(asBrowser(first))
      .mockResolvedValueOnce(asBrowser(second));
    const holder = new LazyBrowser({ launch });
    await holder.get();
    const closing = holder.close();
    const next = holder.get();
    await closing;
    expect(first.closed).toBe(true);
    expect(await next).toBe(asBrowser(second));
    // 닫힌 첫 브라우저의 disconnected 가 새 브라우저 참조를 지우지 않는다.
    expect(holder.isRunning()).toBe(true);
  });

  it('idle 종료 — 마지막 use 뒤 idleMs 가 지나면 닫고, 사용 중에는 닫지 않는다', async () => {
    vi.useFakeTimers();
    const browsers: FakeBrowser[] = [];
    const launch = vi.fn(async () => {
      const b = new FakeBrowser();
      browsers.push(b);
      return asBrowser(b);
    });
    const holder = new LazyBrowser({ launch, idleMs: 1_000 });

    // 사용 중(긴 작업) — idle 시간이 지나도 닫히지 않는다.
    let release!: () => void;
    const longJob = holder.use(async () => {
      await holder.get();
      await new Promise<void>((r) => {
        release = r;
      });
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(browsers[0]?.closed).toBe(false);

    release();
    await longJob;
    await vi.advanceTimersByTimeAsync(999);
    expect(browsers[0]?.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(browsers[0]?.closed).toBe(true);
    expect(holder.isRunning()).toBe(false);

    // 닫힌 뒤 다시 쓰면 새로 띄운다.
    await holder.use(() => holder.get());
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('use 안에서 get 을 안 부르면(입력 검증 실패 등) launch 하지 않는다', async () => {
    const launch = vi.fn(async () => asBrowser(new FakeBrowser()));
    const holder = new LazyBrowser({ launch, idleMs: 1_000 });
    await expect(
      holder.use(async () => {
        throw new Error('shopRef is empty');
      }),
    ).rejects.toThrow('shopRef is empty');
    expect(launch).not.toHaveBeenCalled();
  });
});
