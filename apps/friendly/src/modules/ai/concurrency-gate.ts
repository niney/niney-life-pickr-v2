import { env } from '../../config/env.js';
import { LLMCancelledError } from './adapters/llm-provider.js';

// FIFO 동시성 게이트 — 어댑터 내부에 있던 게이트를 독립 클래스로 추출.
//
// 추출한 이유 두 가지:
//   1. 계정(API 키) 단위 공유 — purpose 별 어댑터가 각자 게이트를 가지면
//      chat/image/log-analysis 합산이 계정 한도를 넘는다. 게이트를 어댑터
//      밖에서 만들어 같은 키를 쓰는 모든 어댑터에 주입하면 합산이 cap 을
//      절대 못 넘고, 초과분은 FIFO 큐에서 순차 대기한다.
//   2. 설정 변경 생존 — 어댑터 캐시 키가 회전해도 게이트 인스턴스는
//      레지스트리에 남는다. setLimit 으로 한도를 바꾸면 신규 진입에만
//      즉시 적용되고 진행 중 요청은 자연 소진된다 (일시적 초과 없음).
//
// acquire 는 signal-aware: 큐 대기 중 호출자가 abort 하면 대기열에서 즉시
// 이탈하고 LLMCancelledError 로 reject 한다 — 취소된 요청이 슬롯을 잡았다
// 놓는 낭비를 막는다 (계정 게이트로 큐가 깊어질수록 중요).

export interface GateSnapshot {
  limit: number;
  inflight: number;
  queued: number;
  // 대기열 맨 앞 waiter 가 기다린 시간(ms). 비어 있으면 null.
  oldestWaitMs: number | null;
}

interface Waiter {
  grant: () => void;
  signal?: AbortSignal;
  onAbort?: () => void;
  enqueuedAt: number;
}

export class ConcurrencyGate {
  private limit: number;
  private inflight = 0;
  private readonly waiters: Waiter[] = [];

  constructor(limit: number) {
    this.limit = limit;
  }

  // 한도 변경. 줄이면 신규 진입만 막히고(진행 중은 그대로), 늘리면 대기
  // 중인 waiter 를 즉시 깨운다.
  setLimit(limit: number): void {
    this.limit = limit;
    this.drain();
  }

  acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new LLMCancelledError());
    if (this.inflight < this.limit && this.waiters.length === 0) {
      this.inflight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        grant: () => {
          this.inflight += 1;
          resolve();
        },
        signal,
        enqueuedAt: Date.now(),
      };
      if (signal) {
        const onAbort = () => {
          const idx = this.waiters.indexOf(waiter);
          if (idx >= 0) this.waiters.splice(idx, 1);
          reject(new LLMCancelledError());
        };
        waiter.onAbort = onAbort;
        signal.addEventListener('abort', onAbort, { once: true });
      }
      this.waiters.push(waiter);
    });
  }

  release(): void {
    this.inflight -= 1;
    this.drain();
  }

  snapshot(): GateSnapshot {
    const head = this.waiters[0];
    return {
      limit: this.limit,
      inflight: this.inflight,
      queued: this.waiters.length,
      oldestWaitMs: head ? Date.now() - head.enqueuedAt : null,
    };
  }

  private drain(): void {
    while (this.inflight < this.limit && this.waiters.length > 0) {
      const next = this.waiters.shift()!;
      if (next.signal && next.onAbort) {
        next.signal.removeEventListener('abort', next.onAbort);
      }
      next.grant();
    }
  }
}

// --- 계정(키) 단위 레지스트리 ----------------------------------------------
//
// 키 = apiKey|baseUrl. 같은 Ollama Cloud 계정을 쓰는 모든 어댑터(purpose
// 불문)가 게이트 하나를 공유한다. purpose 별로 다른 키를 등록했다면
// 자연스럽게 게이트도 분리 — "계정 단위 한도"라는 의미에 부합.
//
// cap 은 env.OLLAMA_CLOUD_MAX_CONCURRENT 고정 (변경 시 재시작). purpose 별
// maxConcurrent 는 어댑터 자체 게이트로 계속 동작하므로, 실효 동시성은
// min(purpose 한도, 계정 cap) 이다.
const MAX_GATES = 8;

export class AccountGateRegistry {
  private readonly gates = new Map<string, ConcurrencyGate>();

  constructor(private readonly limit: number) {}

  get(apiKey: string, baseUrl: string): ConcurrencyGate {
    const key = `${apiKey}|${baseUrl}`;
    const hit = this.gates.get(key);
    if (hit) return hit;
    const gate = new ConcurrencyGate(this.limit);
    if (this.gates.size >= MAX_GATES) {
      // 키 회전으로 죽은 엔트리가 쌓이는 것만 막는 안전벨트. 진행 중인
      // 요청은 게이트 참조를 직접 들고 있으므로 제거돼도 안전하다.
      const oldest = this.gates.keys().next().value;
      if (oldest !== undefined) this.gates.delete(oldest);
    }
    this.gates.set(key, gate);
    return gate;
  }

  // 텔레메트리용 — 키는 노출하지 않고 스냅샷만.
  snapshots(): GateSnapshot[] {
    return [...this.gates.values()].map((g) => g.snapshot());
  }
}

export const accountGateRegistry = new AccountGateRegistry(env.OLLAMA_CLOUD_MAX_CONCURRENT);
