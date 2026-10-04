import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { acquireLlmTelemetryStream, isLlmTelemetryConnected } from './useLlmTelemetry.js';

// LLM 텔레메트리 스트림 공유의 계약을 고정한다:
//  - 구독자가 몇이든 QueryClient 하나에 EventSource 는 하나 (어드민은 플로팅 패널 +
//    사용량 페이지가 동시에 구독한다 — 예전엔 훅마다 스트림을 열어 같은 스냅샷을 두 번 받았다)
//  - 마지막 구독이 풀릴 때 닫고, 다시 구독하면 새로 연다
//  - 끊기면 백오프로 재연결하되 구독이 없으면 다시 열지 않는다

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, Array<(e: { data: string }) => void>>();
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: { data: string }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string, data: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) fn({ data: JSON.stringify(data) });
  }
}

const KEY = ['ai', 'telemetry'];
// 스트림 URL 을 만드는 동안(토큰 조회 await) 한 박자 걸린다.
const settle = (): Promise<void> => vi.advanceTimersByTimeAsync(0).then(() => undefined);

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('acquireLlmTelemetryStream', () => {
  it('두 곳에서 구독해도 스트림은 하나이고, 마지막 구독이 풀릴 때 닫는다', async () => {
    const qc = new QueryClient();
    const releasePanel = acquireLlmTelemetryStream(qc);
    const releasePage = acquireLlmTelemetryStream(qc);
    await settle();

    expect(FakeEventSource.instances).toHaveLength(1);
    const es = FakeEventSource.instances[0]!;
    expect(es.url).toBe('/api/v1/admin/ai/telemetry/stream');
    expect(isLlmTelemetryConnected(qc)).toBe(false);

    es.onopen?.();
    expect(isLlmTelemetryConnected(qc)).toBe(true);

    // 스냅샷은 캐시에 그대로 들어간다(두 구독자가 같은 캐시를 읽는다).
    es.emit('snapshot', { startedAt: '2026-10-05T00:00:00.000Z', recent: [] });
    expect(qc.getQueryData(KEY)).toEqual({ startedAt: '2026-10-05T00:00:00.000Z', recent: [] });

    // 페이지를 떠나도 패널이 남아 있으면 스트림은 그대로.
    releasePage();
    expect(es.closed).toBe(false);
    expect(isLlmTelemetryConnected(qc)).toBe(true);

    releasePanel();
    expect(es.closed).toBe(true);
    expect(isLlmTelemetryConnected(qc)).toBe(false);
  });

  it('같은 해제를 두 번 불러도 한 번만 센다', async () => {
    const qc = new QueryClient();
    const releaseA = acquireLlmTelemetryStream(qc);
    const releaseB = acquireLlmTelemetryStream(qc);
    await settle();
    const es = FakeEventSource.instances[0]!;

    releaseA();
    releaseA();
    expect(es.closed).toBe(false);

    releaseB();
    expect(es.closed).toBe(true);
  });

  it('모두 풀린 뒤 다시 구독하면 새 스트림을 연다', async () => {
    const qc = new QueryClient();
    acquireLlmTelemetryStream(qc)();
    await settle();
    // URL 을 기다리는 사이에 풀렸으므로 첫 구독은 스트림을 열지 않았다.
    expect(FakeEventSource.instances).toHaveLength(0);

    const release = acquireLlmTelemetryStream(qc);
    await settle();
    expect(FakeEventSource.instances).toHaveLength(1);
    release();
    expect(FakeEventSource.instances[0]!.closed).toBe(true);

    const releaseAgain = acquireLlmTelemetryStream(qc);
    await settle();
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1]!.closed).toBe(false);
    releaseAgain();
  });

  it('끊기면 1초 뒤 다시 열고, 그 사이 구독이 다 풀리면 다시 열지 않는다', async () => {
    const qc = new QueryClient();
    const release = acquireLlmTelemetryStream(qc);
    await settle();
    const first = FakeEventSource.instances[0]!;
    first.onopen?.();

    first.onerror?.();
    expect(first.closed).toBe(true);
    expect(isLlmTelemetryConnected(qc)).toBe(false);
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeEventSource.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeEventSource.instances).toHaveLength(2);

    // 두 번째도 끊긴 뒤(2초 백오프 대기 중) 구독이 풀리면 타이머가 취소된다.
    FakeEventSource.instances[1]!.onerror?.();
    release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('QueryClient 가 다르면 스트림도 따로다', async () => {
    const qcA = new QueryClient();
    const qcB = new QueryClient();
    const releaseA = acquireLlmTelemetryStream(qcA);
    const releaseB = acquireLlmTelemetryStream(qcB);
    await settle();
    expect(FakeEventSource.instances).toHaveLength(2);

    FakeEventSource.instances[0]!.onopen?.();
    expect(isLlmTelemetryConnected(qcA)).toBe(true);
    expect(isLlmTelemetryConnected(qcB)).toBe(false);

    releaseA();
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
    expect(FakeEventSource.instances[1]!.closed).toBe(false);
    releaseB();
  });
});
