import {
  LLMCancelledError,
  LLMInvalidResponseError,
  LLMTimeoutError,
  LLMUpstreamError,
  type LLMCompleteOptions,
  type LLMCompleteResult,
  type LLMProvider,
} from './llm-provider.js';
import { ConcurrencyGate, type GateSnapshot } from '../concurrency-gate.js';

export interface OllamaCloudAdapterOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxConcurrent: number;
  // 계정(API 키) 단위 공유 게이트 — AdapterCache 가 레지스트리에서 주입.
  // purpose 게이트(maxConcurrent)를 통과한 뒤 이 게이트를 추가로 통과해야
  // 하므로, 같은 키를 쓰는 모든 purpose 의 합산 동시성이 계정 cap 을 넘지
  // 않는다. 미주입 시(테스트, ad-hoc 어댑터) purpose 게이트만 적용.
  accountGate?: ConcurrencyGate;
  // 호출 계측 훅 — 게이트 통과 직후(start)와 완료/실패 시(end) 호출된다.
  // 어댑터는 purpose 를 모르므로 라벨링은 주입자(AdapterCache) 몫.
  // 큐 대기 중 취소된 호출은 게이트를 통과하지 못해 이벤트가 없다 —
  // 대기열 상태는 게이트 스냅샷으로 관찰한다.
  onEvent?: (event: AdapterCallEvent) => void;
}

export interface AdapterCallStartEvent {
  type: 'start';
  callId: number;
  model: string;
  queueWaitMs: number;
}

export interface AdapterCallEndEvent {
  type: 'end';
  callId: number;
  model: string;
  status: 'ok' | 'error' | 'cancelled' | 'timeout';
  errorName: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number;
  // 429(동시성 한도) 백오프 재시도 횟수 — completeWithRetry 내부 루프.
  retries: number;
}

export type AdapterCallEvent = AdapterCallStartEvent | AdapterCallEndEvent;

// 프로세스 전역 단조 증가 — start/end 짝 맞추기용. 어댑터가 여러 개라도
// 충돌하지 않도록 모듈 레벨에 둔다.
let nextCallId = 1;

interface OllamaChatResponse {
  model?: string;
  message?: { role?: string; content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  done?: boolean;
  done_reason?: string;
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string; model?: string }>;
}

// Talks to Ollama's native /api/chat. Keeps the bulk of provider logic in
// one place: request shaping, error classification, and a two-tier FIFO
// concurrency gate: purpose 게이트(이 인스턴스 소유, maxConcurrent) →
// 계정 게이트(주입, 키 단위 공유). acquire 순서가 모든 호출자에서 동일하므로
// 교착 없음. 큐 대기 중 abort 되면 게이트가 대기열에서 즉시 이탈시킨다.
export class OllamaCloudAdapter implements LLMProvider {
  private readonly opts: OllamaCloudAdapterOptions;
  private readonly purposeGate: ConcurrencyGate;

  constructor(opts: OllamaCloudAdapterOptions) {
    this.opts = opts;
    this.purposeGate = new ConcurrencyGate(opts.maxConcurrent);
  }

  async complete(opts: LLMCompleteOptions): Promise<LLMCompleteResult> {
    const enqueuedAt = Date.now();
    await this.purposeGate.acquire(opts.signal);
    try {
      if (this.opts.accountGate) await this.opts.accountGate.acquire(opts.signal);
      try {
        return await this.completeInstrumented(opts, Date.now() - enqueuedAt);
      } finally {
        this.opts.accountGate?.release();
      }
    } finally {
      this.purposeGate.release();
    }
  }

  // 게이트 통과 후의 실제 호출 + 계측. 계측 훅이 던져도 호출 흐름을 깨지
  // 않도록 emit 은 항상 삼킨다.
  private async completeInstrumented(
    opts: LLMCompleteOptions,
    queueWaitMs: number,
  ): Promise<LLMCompleteResult> {
    const callId = nextCallId++;
    this.emit({ type: 'start', callId, model: opts.model, queueWaitMs });
    const startedAt = Date.now();
    const stats = { retries: 0 };
    try {
      const result = await this.completeWithRetry(opts, stats);
      this.emit({
        type: 'end',
        callId,
        model: result.model,
        status: 'ok',
        errorName: null,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        durationMs: Date.now() - startedAt,
        retries: stats.retries,
      });
      return result;
    } catch (e) {
      const status =
        e instanceof LLMCancelledError ? 'cancelled' : e instanceof LLMTimeoutError ? 'timeout' : 'error';
      this.emit({
        type: 'end',
        callId,
        model: opts.model,
        status,
        errorName: e instanceof Error ? e.name : null,
        promptTokens: null,
        completionTokens: null,
        durationMs: Date.now() - startedAt,
        retries: stats.retries,
      });
      throw e;
    }
  }

  private emit(event: AdapterCallEvent): void {
    try {
      this.opts.onEvent?.(event);
    } catch {
      // 계측은 관찰자 — 본 호출에 영향을 주면 안 된다.
    }
  }

  // 텔레메트리용 — purpose 게이트의 현재 상태.
  gateSnapshot(): GateSnapshot {
    return this.purposeGate.snapshot();
  }

  // Ollama Cloud는 로컬 게이트 통과 후에도 자체 한도로 거부할 수 있다
  // (HTTP 429 또는 본문에 "too many concurrent requests"). 같은 슬롯을
  // 잡은 채 짧은 백오프 후 재시도한다 — release 하지 않으므로 동시성이
  // 늘지 않고, 일시적 한도 초과는 자동 회복된다.
  private async completeWithRetry(
    opts: LLMCompleteOptions,
    stats: { retries: number },
  ): Promise<LLMCompleteResult> {
    const maxRetries = 3;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0) {
        stats.retries = attempt;
        const base = Math.min(2000, 200 * 2 ** (attempt - 1));
        const jitter = Math.random() * 200;
        await new Promise((r) => setTimeout(r, base + jitter));
      }
      try {
        return await this.doComplete(opts);
      } catch (e) {
        if (!isConcurrencyLimit(e)) throw e;
        lastErr = e;
      }
    }
    throw lastErr ?? new LLMUpstreamError(429, 'too many concurrent requests');
  }

  async listModels(): Promise<string[]> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.opts.timeoutMs);
    try {
      const res = await fetch(`${this.opts.baseUrl}/api/tags`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.opts.apiKey}` },
        signal: ac.signal,
      });
      if (!res.ok) {
        throw new LLMUpstreamError(res.status, await res.text().catch(() => res.statusText));
      }
      const json = (await res.json().catch(() => null)) as OllamaTagsResponse | null;
      if (!json?.models || !Array.isArray(json.models)) {
        throw new LLMInvalidResponseError();
      }
      // The field is `model` on Ollama Cloud, `name` on local Ollama —
      // accept either so the same adapter works against both.
      return json.models
        .map((m) => m.model ?? m.name)
        .filter((s): s is string => typeof s === 'string' && s.length > 0);
    } finally {
      clearTimeout(timer);
    }
  }

  private async doComplete(opts: LLMCompleteOptions): Promise<LLMCompleteResult> {
    if (opts.signal?.aborted) throw new LLMCancelledError();

    // Ollama 의 vision 메시지는 content 외에 images 배열을 함께 받는다.
    // base64 문자열 (data: 접두 없이) 만 허용 — 변환 책임은 호출자.
    interface OllamaMessage {
      role: 'system' | 'user';
      content: string;
      images?: string[];
    }
    const messages: OllamaMessage[] = [];
    if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
    const userMessage: OllamaMessage = { role: 'user', content: opts.prompt };
    if (opts.images && opts.images.length > 0) {
      userMessage.images = opts.images;
    }
    messages.push(userMessage);

    const ollamaOptions: Record<string, number> = {};
    if (typeof opts.temperature === 'number') ollamaOptions.temperature = opts.temperature;
    if (typeof opts.maxTokens === 'number') ollamaOptions.num_predict = opts.maxTokens;
    if (typeof opts.numCtx === 'number') ollamaOptions.num_ctx = opts.numCtx;

    const body: Record<string, unknown> = {
      model: opts.model,
      stream: false,
      messages,
      ...(Object.keys(ollamaOptions).length > 0 ? { options: ollamaOptions } : {}),
    };
    // format 은 options 가 아니라 최상위 필드. 'json' 문자열이거나 JSON
    // Schema 객체. 구조화 출력은 모델 토큰 샘플링 단계에서 스키마를
    // 강제하므로 parse 실패율을 크게 낮춘다.
    if (opts.format !== undefined) {
      body.format = opts.format;
    }
    // think 도 최상위 필드 — thinking 미지원 모델에 보내면 Ollama 가
    // 거부하므로 설정 책임은 호출자에게 있다 (llm-provider.ts 참고).
    if (opts.think !== undefined) {
      body.think = opts.think;
    }

    // Combine two cancellation sources into one AbortController so fetch
    // sees a single signal. We track which source fired so the catch block
    // can pick the right error type.
    const ac = new AbortController();
    let timedOut = false;
    const onCallerAbort = () => ac.abort();
    opts.signal?.addEventListener('abort', onCallerAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, this.opts.timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${this.opts.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (e) {
      if (isAbortError(e)) {
        // Caller-initiated abort wins over our own timeout when both fire.
        if (opts.signal?.aborted) throw new LLMCancelledError();
        if (timedOut) throw new LLMTimeoutError();
        throw new LLMCancelledError();
      }
      throw new LLMUpstreamError(
        0,
        e instanceof Error ? e.message : 'fetch failed',
      );
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onCallerAbort);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LLMUpstreamError(res.status, text || res.statusText);
    }

    const json = (await res.json().catch(() => null)) as OllamaChatResponse | null;
    const content = json?.message?.content;
    if (!json || typeof content !== 'string') {
      throw new LLMInvalidResponseError();
    }

    return {
      text: content,
      model: json.model ?? opts.model,
      promptTokens: typeof json.prompt_eval_count === 'number' ? json.prompt_eval_count : null,
      completionTokens: typeof json.eval_count === 'number' ? json.eval_count : null,
      doneReason: typeof json.done_reason === 'string' ? json.done_reason : null,
    };
  }

}

const isAbortError = (e: unknown): boolean => {
  if (e instanceof Error && e.name === 'AbortError') return true;
  if (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') {
    return true;
  }
  return false;
};

// Ollama Cloud의 동시성 제한 시그널. status 429 또는 본문 메시지로 옴.
// "too many concurrent requests" / "rate limit" 둘 다 매칭.
const isConcurrencyLimit = (e: unknown): boolean => {
  if (!(e instanceof LLMUpstreamError)) return false;
  if (e.status === 429) return true;
  return /too many concurrent|rate.?limit/i.test(e.message);
};
