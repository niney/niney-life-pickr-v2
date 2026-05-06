import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LLMInvalidResponseError,
  LLMTimeoutError,
  LLMUpstreamError,
  type LLMCompleteOptions,
  type LLMCompleteResult,
  type LLMProvider,
} from './adapters/llm-provider.js';
import { AiService } from './ai.service.js';
import type { ResolvedProviderConfig } from './ai.config.service.js';

const RESOLVED: ResolvedProviderConfig = {
  provider: 'ollama-cloud',
  apiKey: 'k',
  baseUrl: 'https://x',
  timeoutMs: 1_000,
  maxConcurrent: 5,
  defaultModel: '',
  enabled: true,
};

class FakeProvider implements LLMProvider {
  calls: LLMCompleteOptions[] = [];
  next: ((opts: LLMCompleteOptions) => Promise<LLMCompleteResult>) | null = null;

  async complete(opts: LLMCompleteOptions): Promise<LLMCompleteResult> {
    this.calls.push(opts);
    if (this.next) return this.next(opts);
    return {
      text: `echo:${opts.prompt}`,
      model: opts.model,
      promptTokens: opts.prompt.length,
      completionTokens: 1,
    };
  }
}

const buildConfigStub = (resolved: ResolvedProviderConfig | null = RESOLVED) => ({
  getResolved: vi.fn(async () => resolved),
});

describe('AiService.complete', () => {
  let provider: FakeProvider;
  let config: ReturnType<typeof buildConfigStub>;
  let service: AiService;

  beforeEach(() => {
    provider = new FakeProvider();
    config = buildConfigStub();
    service = new AiService(provider, config as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('forwards model id verbatim and returns ok result', async () => {
    const out = await service.complete(
      { prompt: '안녕', model: 'gpt-oss:20b' },
      'actor-1',
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.text).toBe('echo:안녕');
    expect(out.model).toBe('gpt-oss:20b');
    expect(provider.calls[0]!.model).toBe('gpt-oss:20b');
    expect(provider.calls[0]!.systemPrompt).toBeUndefined();
  });

  it('forwards systemPrompt/temperature/maxTokens to provider', async () => {
    await service.complete(
      {
        prompt: 'p',
        model: 'm1',
        systemPrompt: 'sys',
        temperature: 0.7,
        maxTokens: 200,
      },
      'a',
    );
    expect(provider.calls[0]).toMatchObject({
      systemPrompt: 'sys',
      temperature: 0.7,
      maxTokens: 200,
    });
  });

  it('returns provider_unavailable when getResolved returns null', async () => {
    config = buildConfigStub(null);
    service = new AiService(provider, config as never);
    const out = await service.complete({ prompt: 'p', model: 'm1' }, 'a');
    expect(out).toMatchObject({ ok: false, error: 'no_api_key' });
  });

  it('classifies LLMTimeoutError → timeout', async () => {
    provider.next = async () => {
      throw new LLMTimeoutError();
    };
    const out = await service.complete({ prompt: 'p', model: 'm1' }, 'a');
    expect(out).toMatchObject({ ok: false, error: 'timeout' });
  });

  it('classifies LLMUpstreamError → upstream_failed', async () => {
    provider.next = async () => {
      throw new LLMUpstreamError(503, 'down');
    };
    const out = await service.complete({ prompt: 'p', model: 'm1' }, 'a');
    expect(out).toMatchObject({ ok: false, error: 'upstream_failed' });
  });

  it('classifies LLMInvalidResponseError → invalid_response', async () => {
    provider.next = async () => {
      throw new LLMInvalidResponseError();
    };
    const out = await service.complete({ prompt: 'p', model: 'm1' }, 'a');
    expect(out).toMatchObject({ ok: false, error: 'invalid_response' });
  });

  it('per-actor rate limit blocks the second call within the window', async () => {
    await service.complete({ prompt: 'a', model: 'm1' }, 'actor-x');
    const second = await service.complete({ prompt: 'b', model: 'm1' }, 'actor-x');
    expect(second).toMatchObject({ ok: false, error: 'rate_limited' });
  });

  it('per-actor rate limit does not affect a different actor', async () => {
    await service.complete({ prompt: 'a', model: 'm1' }, 'actor-x');
    const otherActor = await service.complete({ prompt: 'b', model: 'm1' }, 'actor-y');
    expect(otherActor.ok).toBe(true);
  });
});

describe('AiService.completeBatch', () => {
  let provider: FakeProvider;
  let config: ReturnType<typeof buildConfigStub>;
  let service: AiService;

  beforeEach(() => {
    provider = new FakeProvider();
    config = buildConfigStub();
    service = new AiService(provider, config as never);
  });

  it('runs all items via Promise.allSettled and preserves clientId', async () => {
    const out = await service.completeBatch(
      {
        items: [
          { prompt: 'a', model: 'm1', clientId: 'c-a' },
          { prompt: 'b', model: 'm2', clientId: 'c-b' },
        ],
      },
      'actor-1',
    );
    expect(out.results).toHaveLength(2);
    const a = out.results.find((r) => r.clientId === 'c-a')!;
    const b = out.results.find((r) => r.clientId === 'c-b')!;
    expect(a).toMatchObject({ ok: true, text: 'echo:a', model: 'm1' });
    expect(b).toMatchObject({ ok: true, text: 'echo:b', model: 'm2' });
  });

  it('returns partial failure (some ok, some error)', async () => {
    let n = 0;
    provider.next = async (opts) => {
      n += 1;
      if (n === 2) throw new LLMUpstreamError(500, 'fail');
      return {
        text: `echo:${opts.prompt}`,
        model: opts.model,
        promptTokens: 0,
        completionTokens: 0,
      };
    };
    const out = await service.completeBatch(
      {
        items: [
          { prompt: 'a', model: 'm1', clientId: '1' },
          { prompt: 'b', model: 'm1', clientId: '2' },
          { prompt: 'c', model: 'm1', clientId: '3' },
        ],
      },
      'actor-1',
    );
    const byId = (id: string) => out.results.find((r) => r.clientId === id)!;
    expect(byId('1').ok).toBe(true);
    expect(byId('2')).toMatchObject({ ok: false, error: 'upstream_failed' });
    expect(byId('3').ok).toBe(true);
  });

  it('returns no_api_key for the entire batch when getResolved is null', async () => {
    config = buildConfigStub(null);
    service = new AiService(provider, config as never);
    const out = await service.completeBatch(
      { items: [{ prompt: 'a', model: 'm1' }] },
      'a',
    );
    expect(out.results[0]).toMatchObject({ ok: false, error: 'no_api_key' });
  });

  it('rate limit applies once per batch (does not block items inside)', async () => {
    const out = await service.completeBatch(
      {
        items: [
          { prompt: 'a', model: 'm1' },
          { prompt: 'b', model: 'm1' },
        ],
      },
      'actor-batch',
    );
    expect(out.results.every((r) => r.ok)).toBe(true);
    // Same actor again immediately → second batch rate-limited.
    const second = await service.completeBatch(
      { items: [{ prompt: 'c', model: 'm1' }] },
      'actor-batch',
    );
    expect(second.results[0]).toMatchObject({ ok: false, error: 'rate_limited' });
  });
});
