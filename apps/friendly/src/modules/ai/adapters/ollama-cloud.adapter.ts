import {
  LLMCancelledError,
  LLMInvalidResponseError,
  LLMTimeoutError,
  LLMUpstreamError,
  type LLMCompleteOptions,
  type LLMCompleteResult,
  type LLMProvider,
} from './llm-provider.js';

export interface OllamaCloudAdapterOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxConcurrent: number;
}

interface OllamaChatResponse {
  model?: string;
  message?: { role?: string; content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  done?: boolean;
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string; model?: string }>;
}

// Talks to Ollama's native /api/chat. Keeps the bulk of provider logic in
// one place: request shaping, error classification, and a FIFO concurrency
// gate that throttles all callers sharing the adapter instance.
export class OllamaCloudAdapter implements LLMProvider {
  private readonly opts: OllamaCloudAdapterOptions;
  private inflight = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(opts: OllamaCloudAdapterOptions) {
    this.opts = opts;
  }

  async complete(opts: LLMCompleteOptions): Promise<LLMCompleteResult> {
    await this.acquire();
    try {
      return await this.doComplete(opts);
    } finally {
      this.release();
    }
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

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
    messages.push({ role: 'user', content: opts.prompt });

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
    };
  }

  // Concurrency gate: at most `maxConcurrent` calls past the gate. Waiters
  // resolve in FIFO order. Kept tiny on purpose — no external dep.
  private acquire(): Promise<void> {
    if (this.inflight < this.opts.maxConcurrent) {
      this.inflight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.inflight += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.inflight -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }
}

const isAbortError = (e: unknown): boolean => {
  if (e instanceof Error && e.name === 'AbortError') return true;
  if (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') {
    return true;
  }
  return false;
};
