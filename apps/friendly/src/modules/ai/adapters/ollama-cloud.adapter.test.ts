import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LLMCancelledError,
  LLMInvalidResponseError,
  LLMTimeoutError,
  LLMUpstreamError,
} from './llm-provider.js';
import { OllamaCloudAdapter } from './ollama-cloud.adapter.js';

const okResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

const buildAdapter = (overrides: Partial<ConstructorParameters<typeof OllamaCloudAdapter>[0]> = {}) =>
  new OllamaCloudAdapter({
    apiKey: 'test-key',
    baseUrl: 'https://ollama.test',
    timeoutMs: 5_000,
    maxConcurrent: 5,
    ...overrides,
  });

describe('OllamaCloudAdapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('parses a normal response into LLMCompleteResult', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        model: 'gpt-oss:20b',
        message: { role: 'assistant', content: '안녕하세요!' },
        prompt_eval_count: 12,
        eval_count: 7,
        done: true,
        done_reason: 'stop',
      }),
    );

    const adapter = buildAdapter();
    const out = await adapter.complete({ prompt: '안녕', model: 'gpt-oss:20b' });

    expect(out).toEqual({
      text: '안녕하세요!',
      model: 'gpt-oss:20b',
      promptTokens: 12,
      completionTokens: 7,
      doneReason: 'stop',
    });
  });

  it('passes think through to the request body and reads done_reason length', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        model: 'gpt-oss:120b',
        message: { content: '' },
        done_reason: 'length',
      }),
    );

    const adapter = buildAdapter();
    const out = await adapter.complete({ prompt: 'x', model: 'gpt-oss:120b', think: 'low' });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.think).toBe('low');
    // 출력이 num_predict 에서 잘린 사례 — 진단 신호가 보존돼야 한다.
    expect(out.doneReason).toBe('length');
  });

  it('omits think from the body when not set', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ model: 'm', message: { content: 'x' } }));
    const adapter = buildAdapter();
    const out = await adapter.complete({ prompt: 'x', model: 'm' });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect('think' in body).toBe(false);
    expect(out.doneReason).toBeNull();
  });

  it('sends Authorization header and Ollama-shaped body', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({ model: 'm', message: { content: 'ok' } }),
    );

    const adapter = buildAdapter({ apiKey: 'sk-ollama-abc' });
    await adapter.complete({
      prompt: 'hi',
      systemPrompt: 'you are helpful',
      model: 'gpt-oss:20b',
      temperature: 0.4,
      maxTokens: 256,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://ollama.test/api/chat');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-ollama-abc');
    expect(headers['Content-Type']).toBe('application/json');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: 'gpt-oss:20b',
      stream: false,
      messages: [
        { role: 'system', content: 'you are helpful' },
        { role: 'user', content: 'hi' },
      ],
      options: { temperature: 0.4, num_predict: 256 },
    });
  });

  it('omits the system message when systemPrompt is missing', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ model: 'm', message: { content: 'x' } }));
    const adapter = buildAdapter();
    await adapter.complete({ prompt: 'hi', model: 'm' });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('throws LLMUpstreamError on 401', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('unauthorized', { status: 401 }),
    );
    const adapter = buildAdapter();
    await expect(adapter.complete({ prompt: 'x', model: 'm' })).rejects.toBeInstanceOf(
      LLMUpstreamError,
    );
  });

  it('throws LLMUpstreamError on 5xx with status preserved', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('boom', { status: 503 }),
    );
    const adapter = buildAdapter();
    await expect(adapter.complete({ prompt: 'x', model: 'm' })).rejects.toMatchObject({
      name: 'LLMUpstreamError',
      status: 503,
    });
  });

  it('throws LLMInvalidResponseError when message.content is missing', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ model: 'm' }));
    const adapter = buildAdapter();
    await expect(adapter.complete({ prompt: 'x', model: 'm' })).rejects.toBeInstanceOf(
      LLMInvalidResponseError,
    );
  });

  it('throws LLMCancelledError when an external signal aborts mid-flight', async () => {
    const ac = new AbortController();
    fetchMock.mockImplementationOnce(
      (_u, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );
    const adapter = buildAdapter();
    const p = adapter.complete({ prompt: 'x', model: 'm', signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toBeInstanceOf(LLMCancelledError);
  });

  it('throws LLMTimeoutError when its own timeout fires', async () => {
    fetchMock.mockImplementationOnce(
      (_u, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );
    const adapter = buildAdapter({ timeoutMs: 30 });
    await expect(
      adapter.complete({ prompt: 'x', model: 'm' }),
    ).rejects.toBeInstanceOf(LLMTimeoutError);
  });

  it('caps concurrent in-flight requests at maxConcurrent', async () => {
    let inflight = 0;
    let peak = 0;
    const release: Array<() => void> = [];

    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          inflight += 1;
          if (inflight > peak) peak = inflight;
          release.push(() => {
            inflight -= 1;
            resolve(okResponse({ model: 'm', message: { content: 'r' } }));
          });
        }),
    );

    const adapter = buildAdapter({ maxConcurrent: 3 });
    const promises = Array.from({ length: 7 }, (_, i) =>
      adapter.complete({ prompt: `p${i}`, model: 'm' }),
    );

    // Let microtasks run so the first wave reaches fetchMock.
    await new Promise((r) => setTimeout(r, 10));
    expect(peak).toBeLessThanOrEqual(3);

    // Drain — release in FIFO order.
    while (release.length > 0) {
      release.shift()!();
      await new Promise((r) => setTimeout(r, 5));
    }
    await Promise.all(promises);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('queue is FIFO — earlier callers acquire the slot first', async () => {
    const order: number[] = [];
    const release: Array<() => void> = [];

    fetchMock.mockImplementation(
      (_u, _init, ...rest) => {
        // mock signature uses 2 args; we capture call order via length
        return new Promise<Response>((resolve) => {
          const idx = release.length;
          order.push(idx);
          release.push(() => resolve(okResponse({ model: 'm', message: { content: `${idx}` } })));
        });
      },
    );

    const adapter = buildAdapter({ maxConcurrent: 1 });
    const p1 = adapter.complete({ prompt: 'a', model: 'm' });
    const p2 = adapter.complete({ prompt: 'b', model: 'm' });
    const p3 = adapter.complete({ prompt: 'c', model: 'm' });

    // Only the first call should have reached fetch yet.
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual([0]);

    release[0]!();
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual([0, 1]);

    release[1]!();
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual([0, 1, 2]);

    release[2]!();
    await Promise.all([p1, p2, p3]);
  });
});
