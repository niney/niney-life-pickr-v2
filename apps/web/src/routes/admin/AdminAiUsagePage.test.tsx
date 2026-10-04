import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { LlmTelemetryCallType, LlmTelemetrySnapshotType } from '@repo/api-contract';
import { LlmUsagePanel } from '~/components/admin/LlmUsagePanel';
import { server } from '~/test/msw';
import { AdminAiUsagePage } from './AdminAiUsagePage';

// AI 사용량 — 어드민 레이아웃의 플로팅 패널이 떠 있는 채로 이 페이지가 열린다. 둘이 같은
// 스트림·캐시·연결 상태를 쓰는지 본다(예전엔 EventSource 가 2개 열려 같은 스냅샷을 두 번 받았다).

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string, data: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) {
      fn({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

const zeroWindow = {
  requests: 0,
  errors: 0,
  promptTokens: 0,
  completionTokens: 0,
  avgDurationMs: null,
  maxDurationMs: null,
};

const snapshot = (over: Partial<LlmTelemetrySnapshotType> = {}): LlmTelemetrySnapshotType => ({
  startedAt: '2026-10-05T00:00:00.000Z',
  totals: {
    requests: 0,
    errors: 0,
    promptTokens: 0,
    completionTokens: 0,
    ok: 0,
    cancelled: 0,
    retries: 0,
  },
  byPurpose: [],
  byModel: [],
  windows: { m1: zeroWindow, m5: zeroWindow, h1: zeroWindow },
  active: [],
  recent: [],
  gates: { account: [], purposes: [] },
  ...over,
});

const call = (over: Partial<LlmTelemetryCallType> = {}): LlmTelemetryCallType => ({
  id: 1,
  purpose: 'chat',
  model: 'gpt-oss:20b',
  status: 'ok',
  errorName: null,
  promptTokens: 120,
  completionTokens: 30,
  queueWaitMs: 0,
  durationMs: 800,
  retries: 0,
  at: '2026-10-05T01:00:00.000Z',
  ...over,
});

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminAiUsagePage', () => {
  it('패널과 페이지가 함께 떠도 스트림은 하나이고, 스냅샷·연결 상태를 같이 쓴다', async () => {
    let restCalls = 0;
    server.use(
      http.get('/api/v1/admin/ai/telemetry', () => {
        restCalls += 1;
        return HttpResponse.json(snapshot());
      }),
    );
    const view = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/admin/ai-usage']}>
          <AdminAiUsagePage />
          <LlmUsagePanel />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // 빈 스냅샷 — 용도별·모델별·최근 호출 세 카드가 모두 빈 안내를 띄운다.
    expect(await screen.findAllByText('아직 호출이 없습니다.')).toHaveLength(3);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const es = FakeEventSource.instances[0]!;
    // 초기 스냅샷(REST)도 같은 쿼리 키라 한 번만.
    expect(restCalls).toBe(1);

    // 연결되면 페이지 머리의 점이 초록으로 — 스트림을 연 쪽이 어느 컴포넌트든 같이 본다.
    expect(screen.getByTitle('연결 끊김 — 재연결 중')).toBeInTheDocument();
    act(() => es.onopen?.());
    expect(screen.getByTitle('실시간 연결됨')).toBeInTheDocument();

    // 스냅샷 한 번에 페이지(최근 호출 표)와 패널(1분 토큰)이 함께 갱신된다.
    act(() =>
      es.emit(
        'snapshot',
        snapshot({
          totals: { requests: 1, errors: 0, promptTokens: 120, completionTokens: 30, ok: 1, cancelled: 0, retries: 0 },
          windows: { m1: { ...zeroWindow, requests: 1, promptTokens: 120, completionTokens: 30 }, m5: zeroWindow, h1: zeroWindow },
          recent: [call()],
        }),
      ),
    );
    expect(await screen.findByText('gpt-oss:20b')).toBeInTheDocument();
    expect(screen.getByText('150tok/1m')).toBeInTheDocument();

    // 새 호출이 앞에 끼어도 먼저 있던 줄은 그대로 남는다.
    act(() =>
      es.emit(
        'snapshot',
        snapshot({ recent: [call({ id: 2, model: 'kimi-k3', at: '2026-10-05T01:00:05.000Z' }), call()] }),
      ),
    );
    expect(await screen.findByText('kimi-k3')).toBeInTheDocument();
    expect(screen.getByText('gpt-oss:20b')).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(1);

    view.unmount();
    expect(es.closed).toBe(true);
  });
});
