/**
 * 프로세스 안 동시 실행 상한(세마포어) — FIFO 대기열, 대기열 길이·대기 시간 상한.
 *
 * 무거운 작업(백업·복원, 이미지 디코드, 백그라운드 LLM 체인)이 동시에 겹쳐 메모리·CPU 피크가 곱해지는 것을
 * 막는다. 대기열이 가득 찼거나 timeoutMs 안에 자리를 못 잡으면 GateBusyError 로 거절해 요청이 끝없이
 * 쌓이지 않게 한다. release 는 여러 번 불러도 한 번만 반영된다.
 */
export class GateBusyError extends Error {
  readonly code = 'busy' as const;

  constructor(message = '처리 대기열이 가득 찼습니다.') {
    super(message);
    this.name = 'GateBusyError';
  }
}

interface Waiter {
  grant: (release: () => void) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

export class AsyncGate {
  private running = 0;
  private readonly waiters: Waiter[] = [];

  constructor(
    readonly limit: number,
    private readonly opts: { maxQueue?: number } = {},
  ) {}

  get active(): number {
    return this.running;
  }

  get queued(): number {
    return this.waiters.length;
  }

  /** 바로 잡을 수 있을 때만 release 를 준다(대기열에 들어가지 않는다). */
  tryAcquire(): (() => void) | null {
    if (this.running >= this.limit) return null;
    this.running += 1;
    return this.releaser();
  }

  acquire(timeoutMs?: number): Promise<() => void> {
    const now = this.tryAcquire();
    if (now) return Promise.resolve(now);
    if (this.opts.maxQueue !== undefined && this.waiters.length >= this.opts.maxQueue) {
      return Promise.reject(new GateBusyError());
    }
    return new Promise<() => void>((resolve, reject) => {
      const waiter: Waiter = { grant: resolve, timer: null };
      if (timeoutMs !== undefined) {
        waiter.timer = setTimeout(() => {
          const at = this.waiters.indexOf(waiter);
          if (at >= 0) this.waiters.splice(at, 1);
          reject(new GateBusyError());
        }, timeoutMs);
        waiter.timer.unref?.();
      }
      this.waiters.push(waiter);
    });
  }

  async run<T>(task: () => Promise<T>, timeoutMs?: number): Promise<T> {
    const release = await this.acquire(timeoutMs);
    try {
      return await task();
    } finally {
      release();
    }
  }

  private releaser(): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const next = this.waiters.shift();
      if (next) {
        // 자리를 그대로 넘긴다(running 은 그대로) — 대기 순서가 새로 온 tryAcquire 에 밀리지 않는다.
        if (next.timer) clearTimeout(next.timer);
        next.grant(this.releaser());
        return;
      }
      this.running -= 1;
    };
  }
}
