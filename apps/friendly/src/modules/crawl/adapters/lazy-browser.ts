import type { Browser } from 'playwright';

// Playwright 어댑터 3종(네이버·캐치테이블 검색·상세)이 공유하는 Chromium 수명주기.
//
// - 지연 실행: 첫 사용 때 launch 한다. 어댑터는 playwright 를 launch 안에서만 동적
//   import 하므로, 크롤을 한 번도 안 하는 프로세스는 부팅 메모리에 playwright 를 싣지 않는다.
// - 실패·끊김 복구: launch 실패나 크래시(disconnected)를 캐시하지 않는다 — 예전에는 한 번
//   실패한 Promise 를 계속 돌려줘 재시작 전까지 모든 크롤이 실패했다.
// - idle 종료(선택): 마지막 사용 뒤 idleMs 동안 다시 안 쓰이면 닫는다. 진행 중인 use() 가
//   있으면 닫지 않는다.
export interface LazyBrowserOptions {
  launch: () => Promise<Browser>;
  // 0/미지정이면 idle 종료 안 함.
  idleMs?: number;
  // 브라우저를 버릴 때(닫기·끊김·launch 실패) 함께 버릴 파생 상태 — 워밍한 컨텍스트 등.
  onReset?: () => void;
}

export class LazyBrowser {
  private browserPromise: Promise<Browser> | null = null;
  private active = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: LazyBrowserOptions) {}

  // 현재 브라우저 — 없거나 끊겼으면 새로 띄운다.
  get(): Promise<Browser> {
    if (this.browserPromise) return this.browserPromise;
    const launching = this.opts.launch().then((browser) => {
      browser.on('disconnected', () => {
        if (this.browserPromise === launching) this.reset();
      });
      return browser;
    });
    // 실패한 launch 는 다음 호출이 다시 시도하게 비운다(호출자는 원래 Promise 로 실패를 받는다).
    launching.catch(() => {
      if (this.browserPromise === launching) this.reset();
    });
    this.browserPromise = launching;
    return launching;
  }

  // 사용 구간 — 안에서 쓰는 동안은 idle 종료가 끼어들지 않고, 끝나면 idle 타이머를 다시 건다.
  // 브라우저는 fn 이 get() 을 부를 때 띄운다(입력 검증에서 끝나는 호출은 launch 하지 않게).
  async use<T>(fn: () => Promise<T>): Promise<T> {
    this.active += 1;
    this.clearIdleTimer();
    try {
      return await fn();
    } finally {
      this.active -= 1;
      this.armIdleTimer();
    }
  }

  // 참조를 먼저 끊고 닫는다 — 닫는 동안 들어온 호출은 새 브라우저를 띄운다.
  async close(): Promise<void> {
    this.clearIdleTimer();
    const pending = this.browserPromise;
    if (!pending) return;
    this.reset();
    const browser = await pending.catch(() => null);
    await browser?.close().catch(() => undefined);
  }

  isRunning(): boolean {
    return this.browserPromise !== null;
  }

  private reset(): void {
    this.browserPromise = null;
    this.opts.onReset?.();
  }

  private armIdleTimer(): void {
    const idleMs = this.opts.idleMs ?? 0;
    if (idleMs <= 0 || this.active > 0 || !this.browserPromise) return;
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.active === 0) void this.close();
    }, idleMs);
    this.idleTimer.unref?.();
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}
