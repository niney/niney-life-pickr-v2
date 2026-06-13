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
// cap 은 DB(웹 설정) 우선: 이 키로 해석된 purpose 한도(row ?? env)들의
// 최대값으로 setLimit 동기화한다. 어드민이 웹 설정에서 maxConcurrent 를
// 바꾸면 다음 호출의 resolve 시점에 계정 cap 과 패널 분모가 함께 따라간다
// — 로컬/운영 어디서든 "설정 화면의 값 = 패널의 값". env 값은 아직 아무
// purpose 도 resolve 되지 않은 부트스트랩 구간의 폴백일 뿐이다.
//
// max 인 이유: 합(sum)으로 하면 purpose 가 늘수록 계정 합산 cap 이 커져
// 원래 막으려던 "합산 초과"가 되살아난다. 각 purpose 한도는 "계정 슬롯을
// 최대 N 개까지 쓴다"는 뜻이므로, 계정 전체로는 그중 가장 큰 N 이 어드민이
// 이해하는 계정 한도다.
const MAX_GATES = 8;

export class AccountGateRegistry {
  private readonly gates = new Map<string, ConcurrencyGate>();
  // 키별 purpose → 해석된 한도. 게이트 cap = max(values). purpose row 삭제는
  // 다음 resolve 까지 반영이 늦을 수 있다 — 드문 운영 행위라 허용.
  private readonly purposeLimits = new Map<string, Map<string, number>>();

  constructor(private readonly fallbackLimit: number) {}

  get(apiKey: string, baseUrl: string, purpose: string, purposeLimit: number): ConcurrencyGate {
    const key = `${apiKey}|${baseUrl}`;
    let gate = this.gates.get(key);
    if (!gate) {
      gate = new ConcurrencyGate(this.fallbackLimit);
      if (this.gates.size >= MAX_GATES) {
        // 키 회전으로 죽은 엔트리가 쌓이는 것만 막는 안전벨트. 진행 중인
        // 요청은 게이트 참조를 직접 들고 있으므로 제거돼도 안전하다.
        const oldest = this.gates.keys().next().value;
        if (oldest !== undefined) {
          this.gates.delete(oldest);
          this.purposeLimits.delete(oldest);
        }
      }
      this.gates.set(key, gate);
    }
    let limits = this.purposeLimits.get(key);
    if (!limits) {
      limits = new Map();
      this.purposeLimits.set(key, limits);
    }
    limits.set(purpose, purposeLimit);
    gate.setLimit(Math.max(...limits.values()));
    return gate;
  }

  // 텔레메트리용 — 키는 노출하지 않고 스냅샷만.
  snapshots(): GateSnapshot[] {
    return [...this.gates.values()].map((g) => g.snapshot());
  }
}

export const accountGateRegistry = new AccountGateRegistry(env.OLLAMA_CLOUD_MAX_CONCURRENT);
