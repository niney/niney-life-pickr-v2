import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LLMCancelledError,
  LLMInvalidResponseError,
  LLMTimeoutError,
  LLMUpstreamError,
} from './llm-provider.js';
import { OllamaCloudAdapter } from './ollama-cloud.adapter.js';
import { ConcurrencyGate } from '../concurrency-gate.js';

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

  it('호출이 timeoutMs 를 주면 어댑터 기본 대신 그 시간을 쓴다(추론을 켠 호출이 기본 60초에서 끊기지 않게)', async () => {
    const hanging = (_u: unknown, init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    // 기본 5초 어댑터라도 호출이 30ms 를 주면 30ms 에 끊긴다.
    fetchMock.mockImplementationOnce(hanging);
    const started = Date.now();
    await expect(
      buildAdapter({ timeoutMs: 5_000 }).complete({ prompt: 'x', model: 'm', timeoutMs: 30 }),
    ).rejects.toBeInstanceOf(LLMTimeoutError);
    expect(Date.now() - started).toBeLessThan(2_000);
    // 기본 30ms 어댑터라도 호출이 더 긴 시간을 주면 그 안에 온 응답을 받는다.
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) =>
          setTimeout(
            () => resolve(new Response(JSON.stringify({ message: { content: 'ok' }, done_reason: 'stop' }), { status: 200 })),
            80,
          ),
        ),
    );
    await expect(
      buildAdapter({ timeoutMs: 30 }).complete({ prompt: 'x', model: 'm', timeoutMs: 2_000 }),
    ).resolves.toMatchObject({ text: 'ok' });
  });

  it('본문이 오다 멈추면 본문 읽기도 자기 타임아웃에 끊긴다(LLMTimeoutError)', async () => {
    fetchMock.mockImplementationOnce(async (_u, init: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"message":')); // 헤더와 본문 일부만 오고 멈춘다
          init.signal?.addEventListener('abort', () =>
            controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const adapter = buildAdapter({ timeoutMs: 50 });
    const started = Date.now();
    await expect(adapter.complete({ prompt: 'x', model: 'm' })).rejects.toBeInstanceOf(LLMTimeoutError);
    expect(Date.now() - started).toBeLessThan(2_000);
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

  it('account gate caps combined inflight across adapters sharing a key', async () => {
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

    // chat / image 어댑터가 같은 계정 게이트(cap 2)를 공유하는 상황.
    // purpose 한도는 각 3 — 계정 게이트가 없다면 합산 peak 가 6까지 간다.
    const accountGate = new ConcurrencyGate(2);
    const chat = buildAdapter({ maxConcurrent: 3, accountGate });
    const image = buildAdapter({ maxConcurrent: 3, accountGate });

    const promises = [
      ...Array.from({ length: 4 }, (_, i) => chat.complete({ prompt: `c${i}`, model: 'm' })),
      ...Array.from({ length: 4 }, (_, i) => image.complete({ prompt: `i${i}`, model: 'm' })),
    ];

    await new Promise((r) => setTimeout(r, 10));
    expect(peak).toBeLessThanOrEqual(2);

    while (release.length > 0) {
      release.shift()!();
      await new Promise((r) => setTimeout(r, 5));
    }
    await Promise.all(promises);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('abort while queued rejects with LLMCancelledError and never reaches fetch', async () => {
    const release: Array<() => void> = [];
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release.push(() => resolve(okResponse({ model: 'm', message: { content: 'r' } })));
        }),
    );

    const adapter = buildAdapter({ maxConcurrent: 1 });
    const first = adapter.complete({ prompt: 'a', model: 'm' });
    await new Promise((r) => setTimeout(r, 5));

    const ac = new AbortController();
    const queued = adapter.complete({ prompt: 'b', model: 'm', signal: ac.signal });
    ac.abort();
    await expect(queued).rejects.toBeInstanceOf(LLMCancelledError);

    // 취소된 호출은 fetch 까지 가지 않는다 — 첫 호출의 1건뿐.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release[0]!();
    await first;
  });
});
