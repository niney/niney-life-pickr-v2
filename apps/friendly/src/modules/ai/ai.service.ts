import type {
  AiCompleteBatchInputType,
  AiCompleteBatchResultItemType,
  AiCompleteBatchResultType,
  AiCompleteInputType,
  AiCompleteResultType,
  AiErrorCodeType,
} from '@repo/api-contract';
import {
  LLMCancelledError,
  LLMInvalidResponseError,
  LLMTimeoutError,
  LLMUpstreamError,
  type LLMProvider,
} from './adapters/llm-provider.js';
import type { AiConfigService, ResolvedProviderConfig } from './ai.config.service.js';

const RATE_LIMIT_WINDOW_MS = 1_000;

// Orchestrates LLM calls. Talks to a provider-agnostic LLMProvider, resolves
// model aliases, classifies errors into wire-friendly codes, and applies a
// per-actor rate limit. Concurrency is the adapter's job (FIFO gate); this
// service runs batch items via Promise.allSettled so partial failures don't
// abort the whole batch.
export class AiService {
  private readonly lastCallByActor = new Map<string, number>();

  constructor(
    private readonly provider: LLMProvider,
    private readonly config: AiConfigService,
  ) {}

  async complete(input: AiCompleteInputType, actorId: string): Promise<AiCompleteResultType> {
    if (this.isRateLimited(actorId)) {
      return rateLimitedResult();
    }
    const resolved = await this.config.getResolved('ollama-cloud');
    if (!resolved) return noApiKeyResult();

    return this.runOne(input, resolved);
  }

  async completeBatch(
    input: AiCompleteBatchInputType,
    actorId: string,
  ): Promise<AiCompleteBatchResultType> {
    if (this.isRateLimited(actorId)) {
      return {
        results: input.items.map((it) => ({
          ok: false,
          clientId: it.clientId,
          error: 'rate_limited',
          message: '잠시 후 다시 시도해 주세요.',
        })),
      };
    }

    const resolved = await this.config.getResolved('ollama-cloud');
    if (!resolved) {
      return {
        results: input.items.map((it) => ({
          ok: false,
          clientId: it.clientId,
          error: 'no_api_key',
          message: 'API 키가 설정되지 않았습니다.',
        })),
      };
    }

    // allSettled — partial failures must not abort the batch. Adapter's
    // own concurrency gate throttles fan-out across all in-flight callers.
    const settled = await Promise.allSettled(
      input.items.map((it) => this.runOne(it, resolved)),
    );

    const results: AiCompleteBatchResultItemType[] = settled.map((r, idx) => {
      const clientId = input.items[idx]!.clientId;
      // runOne never throws — it always resolves to a discriminated result.
      // Defense-in-depth: if a future change leaks an exception, we still
      // produce a coherent batch entry.
      if (r.status === 'rejected') {
        return {
          ok: false,
          clientId,
          ...classifyError(r.reason),
        };
      }
      const v = r.value;
      if (v.ok) return { ...v, clientId };
      return { ...v, clientId };
    });

    return { results };
  }

  private async runOne(
    input: AiCompleteInputType,
    resolved: ResolvedProviderConfig,
  ): Promise<AiCompleteResultType> {
    const startedAt = Date.now();
    try {
      const out = await this.provider.complete({
        prompt: input.prompt,
        systemPrompt: input.systemPrompt,
        model: input.model,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      });
      return {
        ok: true,
        text: out.text,
        model: out.model,
        durationMs: Date.now() - startedAt,
        tokens: {
          promptTokens: out.promptTokens,
          completionTokens: out.completionTokens,
        },
      };
    } catch (e) {
      return { ok: false, ...classifyError(e) };
    }
  }

  private isRateLimited(actorId: string): boolean {
    const now = Date.now();
    const last = this.lastCallByActor.get(actorId) ?? 0;
    if (now - last < RATE_LIMIT_WINDOW_MS) return true;
    this.lastCallByActor.set(actorId, now);
    return false;
  }
}

export const classifyError = (e: unknown): { error: AiErrorCodeType; message: string } => {
  if (e instanceof LLMTimeoutError) {
    return { error: 'timeout', message: '요청 시간이 초과되었습니다.' };
  }
  if (e instanceof LLMCancelledError) {
    return { error: 'provider_unavailable', message: '요청이 취소되었습니다.' };
  }
  if (e instanceof LLMUpstreamError) {
    return { error: 'upstream_failed', message: e.message };
  }
  if (e instanceof LLMInvalidResponseError) {
    return { error: 'invalid_response', message: e.message };
  }
  return {
    error: 'provider_unavailable',
    message: e instanceof Error ? e.message : 'unknown error',
  };
};

const rateLimitedResult = (): AiCompleteResultType => ({
  ok: false,
  error: 'rate_limited',
  message: '잠시 후 다시 시도해 주세요.',
});

const noApiKeyResult = (): AiCompleteResultType => ({
  ok: false,
  error: 'no_api_key',
  message: 'API 키가 설정되지 않았습니다.',
});
