import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { LlmTelemetrySnapshotType } from '@repo/api-contract';
import { aiApi, buildAiTelemetryStreamUrl } from '../api/ai.api.js';

const QUERY_KEY = ['ai', 'telemetry'] as const;

// ── 공유 스트림 ─────────────────────────────────────────────────────
// QueryClient 하나에 EventSource 하나. 구독자(훅을 부른 컴포넌트) 수를 세어 첫
// 구독에 열고 마지막 해제에 닫는다. 어드민은 플로팅 패널이 항상 떠 있고 사용량
// 페이지가 그 위에 얹히는데, 훅마다 스트림을 열면 같은 스냅샷을 초당 두 번 받아
// 캐시를 두 번 덮어쓰고 두 화면을 두 번씩 다시 그린다.
interface TelemetryStream {
  subscribers: number;
  connected: boolean;
  // connected 가 바뀔 때 깨울 훅들 (useSyncExternalStore 구독자).
  listeners: Set<() => void>;
  stop: (() => void) | null;
}

const streams = new WeakMap<QueryClient, TelemetryStream>();

const streamOf = (qc: QueryClient): TelemetryStream => {
  let stream = streams.get(qc);
  if (!stream) {
    stream = { subscribers: 0, connected: false, listeners: new Set(), stop: null };
    streams.set(qc, stream);
  }
  return stream;
};

// 스트림을 열고 "닫기" 함수를 돌려준다. 끊기면 1s → 2s → … 최대 30s 백오프 재연결.
const openStream = (qc: QueryClient, stream: TelemetryStream): (() => void) => {
  let cancelled = false;
  let es: EventSource | null = null;
  let retry = 0;
  let reconnectId: ReturnType<typeof setTimeout> | null = null;

  const setConnected = (next: boolean): void => {
    if (stream.connected === next) return;
    stream.connected = next;
    for (const notify of [...stream.listeners]) notify();
  };

  const connect = async (): Promise<void> => {
    if (cancelled) return;
    const url = await buildAiTelemetryStreamUrl();
    if (cancelled) return;
    const source = new EventSource(url);
    es = source;

    source.onopen = () => {
      retry = 0;
      setConnected(true);
    };

    source.addEventListener('snapshot', (e) => {
      try {
        const snap = JSON.parse((e as MessageEvent).data) as LlmTelemetrySnapshotType;
        qc.setQueryData(QUERY_KEY, snap);
      } catch {
        // ignore
      }
    });

    source.onerror = () => {
      source.close();
      setConnected(false);
      if (cancelled) return;
      const backoff = Math.min(30_000, 1000 * 2 ** retry);
      retry += 1;
      reconnectId = setTimeout(() => {
        void connect();
      }, backoff);
    };
  };

  void connect();

  return () => {
    cancelled = true;
    if (reconnectId) clearTimeout(reconnectId);
    es?.close();
    es = null;
    setConnected(false);
  };
};

// 구독 1건을 등록하고 해제 함수를 돌려준다(같은 해제를 두 번 불러도 한 번만 센다).
// 훅의 코어 — 테스트가 "스트림은 하나, 마지막 해제에 닫힘" 계약을 직접 고정한다.
export const acquireLlmTelemetryStream = (qc: QueryClient): (() => void) => {
  const stream = streamOf(qc);
  stream.subscribers += 1;
  if (stream.subscribers === 1) stream.stop = openStream(qc, stream);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    stream.subscribers -= 1;
    if (stream.subscribers === 0) {
      stream.stop?.();
      stream.stop = null;
    }
  };
};

export const isLlmTelemetryConnected = (qc: QueryClient): boolean =>
  streams.get(qc)?.connected ?? false;

// LLM 사용량 실시간 구독 — 초기 스냅샷은 REST 로, 이후는 SSE 가 React Query
// 캐시를 덮어쓴다. 패널과 페이지가 동시에 떠 있어도 캐시·스트림·연결 상태를
// 함께 쓰므로 EventSource 는 하나뿐이다.
export const useLlmTelemetry = (
  enabled = true,
): {
  data: LlmTelemetrySnapshotType | null;
  connected: boolean;
  isLoading: boolean;
} => {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: aiApi.telemetry,
    enabled,
    // SSE 가 진실원 — REST 재요청으로 덮어쓰지 않게 stale 처리 끔.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!enabled) return undefined;
    return acquireLlmTelemetryStream(qc);
  }, [enabled, qc]);

  const subscribe = useCallback(
    (onChange: () => void) => {
      const { listeners } = streamOf(qc);
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    [qc],
  );
  // 구독하지 않는 호출(enabled=false)은 예전처럼 연결 안 됨으로 본다.
  const getConnected = useCallback(() => enabled && isLlmTelemetryConnected(qc), [enabled, qc]);
  const connected = useSyncExternalStore(subscribe, getConnected, () => false);

  return {
    data: (query.data as LlmTelemetrySnapshotType | undefined) ?? null,
    connected,
    isLoading: query.isLoading,
  };
};
