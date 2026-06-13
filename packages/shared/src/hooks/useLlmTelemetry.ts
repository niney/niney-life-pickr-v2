import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LlmTelemetrySnapshotType } from '@repo/api-contract';
import { aiApi, buildAiTelemetryStreamUrl } from '../api/ai.api.js';

const QUERY_KEY = ['ai', 'telemetry'] as const;

// LLM 사용량 실시간 구독 — 초기 스냅샷은 REST 로, 이후는 SSE 가 React Query
// 캐시를 덮어쓴다. 같은 화면에 패널과 페이지가 동시에 떠도 캐시를 공유하므로
// EventSource 는 호출한 컴포넌트 수만큼 생긴다 — 어드민에선 패널 1곳에서만
// enabled 로 구독하고 페이지는 캐시만 읽는 식으로 쓰거나, 둘 다 구독해도
// 서버 부담은 SSE 커넥션 2개 수준이라 허용 범위.
export const useLlmTelemetry = (
  enabled = true,
): {
  data: LlmTelemetrySnapshotType | null;
  connected: boolean;
  isLoading: boolean;
} => {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: aiApi.telemetry,
    enabled,
    // SSE 가 진실원 — REST 재요청으로 덮어쓰지 않게 stale 처리 끔.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const reconnect: { id: ReturnType<typeof setTimeout> | null } = { id: null };

    const connect = async (): Promise<void> => {
      if (cancelled) return;
      const url = await buildAiTelemetryStreamUrl();
      if (cancelled) return;
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
      };

      es.addEventListener('snapshot', (e) => {
        try {
          const snap = JSON.parse((e as MessageEvent).data) as LlmTelemetrySnapshotType;
          qc.setQueryData(QUERY_KEY, snap);
        } catch {
          // ignore
        }
      });

      es.onerror = () => {
        es.close();
        setConnected(false);
        if (cancelled) return;
        const backoff = Math.min(30_000, 1000 * 2 ** retryRef.current);
        retryRef.current += 1;
        reconnect.id = setTimeout(() => {
          void connect();
        }, backoff);
      };
    };

    void connect();

    return () => {
      cancelled = true;
      if (reconnect.id) clearTimeout(reconnect.id);
      esRef.current?.close();
      esRef.current = null;
      retryRef.current = 0;
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    data: (query.data as LlmTelemetrySnapshotType | undefined) ?? null,
    connected,
    isLoading: query.isLoading,
  };
};
