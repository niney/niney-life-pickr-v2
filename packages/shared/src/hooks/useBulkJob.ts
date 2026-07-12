import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BulkJobStateType } from '@repo/api-contract';
import { ApiError } from '../api/client.js';

// bulk-job 패밀리(api-contract makeBulkJobSchemas) 공통 SSE 구독 훅 —
// menu-grouping·다이닝코드/테이블링 일괄 저장이 문자 단위로 반복하던 구조를
// 집약했다. 도메인 차이는 전부 옵션(쿼리 키·스냅샷 GET·이벤트 URL·아이템
// 동일성 키·done 시 무효화 목록)으로 주입.
//
// 동작: jobId 를 받으면 곧바로 GET snapshot → SSE 구독. 메시지(snapshot/
// item/done)가 도착할 때마다 같은 캐시 키를 머지 업데이트.
// reconnect: EventSource 가 끊기면 1s → 2s → 4s → 최대 30s 백오프 재연결.
// 단 done/failed(잡 종료) 후에는 재연결하지 않는다.

// 도메인 스냅샷이 구조적으로 만족하는 최소 shape.
interface BulkJobSnapshotLike<TItem> {
  jobId: string;
  state: BulkJobStateType;
  finishedAt: string | null;
  doneCount: number;
  failedCount: number;
  skippedCount: number;
  items: TItem[];
}

interface UseBulkJobOptions<TSnap, TItem> {
  // jobId 를 포함한 완성 쿼리 키 (예: ['crawl', 'tabling-bulk-save', jobId]).
  queryKey: readonly unknown[];
  fetchSnapshot: (jobId: string) => Promise<TSnap>;
  buildEventsUrl: (jobId: string) => Promise<string>;
  // item 이벤트의 아이템을 스냅샷 배열에서 치환할 동일성 키 (placeId/vRid/idx).
  itemKey: (item: TItem) => string | number;
  // 404(서버 in-memory 레지스트리 만료) 시 호출 — stale jobId 로 SSE 재연결이
  // 무한 시도되지 않게 active job store 를 정리하는 용도.
  onNotFound?: () => void;
  // done 이벤트 후 무효화할 캐시 키들 (등록 배지/리스트/랭킹 등).
  invalidateOnDone: readonly (readonly unknown[])[];
}

export const useBulkJob = <
  TItem extends { state: string },
  TSnap extends BulkJobSnapshotLike<TItem>,
>(
  jobId: string | null,
  opts: UseBulkJobOptions<TSnap, TItem>,
): { data: TSnap | null; isLoading: boolean; error: unknown } => {
  const qc = useQueryClient();
  const { queryKey } = opts;

  // effect 는 jobId 에만 의존 — 옵션(콜사이트에서 렌더마다 새로 만들 수 있는
  // 인라인 함수/배열)은 ref 로 최신을 참조해 재구독 없이 따라가게 한다.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const queryRes = useQuery({
    queryKey,
    queryFn: async () => {
      if (!jobId) return null;
      try {
        return await optsRef.current.fetchSnapshot(jobId);
      } catch (e) {
        if (e instanceof ApiError && e.statusCode === 404) {
          optsRef.current.onNotFound?.();
          return null;
        }
        throw e;
      }
    },
    enabled: !!jobId,
  });

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<number>(0);
  const closedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!jobId) return undefined;
    closedRef.current = false;

    let cancelled = false;
    const reconnectTimer: { id: ReturnType<typeof setTimeout> | null } = { id: null };
    const key = optsRef.current.queryKey;

    const updateSnapshot = (patcher: (prev: TSnap | null) => TSnap | null): void => {
      qc.setQueryData<TSnap | null>(key, (prev) => patcher(prev ?? null));
    };

    const connect = async (): Promise<void> => {
      if (cancelled || closedRef.current) return;
      const url = await optsRef.current.buildEventsUrl(jobId);
      if (cancelled) return;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('snapshot', (e) => {
        try {
          const snap = JSON.parse((e as MessageEvent).data) as TSnap;
          updateSnapshot(() => snap);
          retryRef.current = 0;
        } catch {
          // ignore malformed
        }
      });

      es.addEventListener('item', (e) => {
        try {
          const payload = JSON.parse((e as MessageEvent).data) as {
            jobId: string;
            item: TItem;
          };
          const { itemKey } = optsRef.current;
          updateSnapshot((prev) => {
            if (!prev) return prev;
            const items = prev.items.map((it) =>
              itemKey(it) === itemKey(payload.item) ? payload.item : it,
            );
            const doneCount = items.filter((i) => i.state === 'done').length;
            const failedCount = items.filter((i) => i.state === 'failed').length;
            const skippedCount = items.filter((i) => i.state === 'skipped').length;
            return { ...prev, items, doneCount, failedCount, skippedCount };
          });
        } catch {
          // ignore
        }
      });

      es.addEventListener('done', (e) => {
        try {
          const payload = JSON.parse((e as MessageEvent).data) as {
            jobId: string;
            state: BulkJobStateType;
            finishedAt: string;
          };
          updateSnapshot((prev) => {
            if (!prev) return prev;
            return { ...prev, state: payload.state, finishedAt: payload.finishedAt };
          });
          // 잡 종료 — SSE 닫고 재연결 막은 뒤 도메인 캐시 무효화.
          closedRef.current = true;
          es.close();
          for (const k of optsRef.current.invalidateOnDone) {
            qc.invalidateQueries({ queryKey: k as unknown[] });
          }
        } catch {
          // ignore
        }
      });

      es.onerror = () => {
        es.close();
        if (cancelled || closedRef.current) return;
        const backoff = Math.min(30_000, 1000 * 2 ** retryRef.current);
        retryRef.current += 1;
        reconnectTimer.id = setTimeout(() => {
          void connect();
        }, backoff);
      };
    };

    void connect();

    return () => {
      cancelled = true;
      closedRef.current = true;
      if (reconnectTimer.id) clearTimeout(reconnectTimer.id);
      esRef.current?.close();
      esRef.current = null;
      retryRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return {
    data: (queryRes.data as TSnap | null | undefined) ?? null,
    isLoading: queryRes.isLoading,
    error: queryRes.error,
  };
};
