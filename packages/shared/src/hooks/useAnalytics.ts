import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  GlobalMenuQueryType,
  GlobalMergeJobChunkProgressType,
  GlobalMergeJobSnapshotType,
  GlobalMergeJobStateType,
} from '@repo/api-contract';
import { ApiError } from '../api/client.js';
import {
  analyticsApi,
  buildGlobalMergeJobEventsUrl,
} from '../api/analytics.api.js';

export const useAnalyticsOverview = () =>
  useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: analyticsApi.overview,
  });

export const useGlobalMenus = (query: Partial<GlobalMenuQueryType> = {}) =>
  useQuery({
    queryKey: [
      'analytics',
      'global-menus',
      query.q ?? '',
      query.sort ?? 'mentions',
      query.minMentions ?? 5,
      query.limit ?? 50,
      !!query.includeUnlinked,
    ],
    queryFn: () => analyticsApi.globalMenus(query),
  });

export const useStartGlobalMerge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { full: boolean }) => analyticsApi.startGlobalMerge(input),
    onSuccess: (snap) => {
      qc.setQueryData(['analytics', 'global-merge-job', snap.jobId], snap);
    },
    onError: (e) => {
      // 409 = 이미 진행 중 — onSuccess 처럼 쓸 수 있게 caller 가 직접 처리.
      // 여기는 그냥 throw 유지.
      void e;
    },
  });
};

const isNotFound = (e: unknown): boolean =>
  e instanceof ApiError && e.statusCode === 404;

export const useGlobalMergeJob = (
  jobId: string | null,
): { data: GlobalMergeJobSnapshotType | null; isLoading: boolean; error: unknown } => {
  const qc = useQueryClient();
  const queryKey = ['analytics', 'global-merge-job', jobId];
  const queryRes = useQuery({
    queryKey,
    queryFn: async () => {
      if (!jobId) return null;
      try {
        return await analyticsApi.getGlobalMergeJob(jobId);
      } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
      }
    },
    enabled: !!jobId,
  });

  const esRef = useRef<EventSource | null>(null);
  const closedRef = useRef<boolean>(false);
  const retryRef = useRef<number>(0);

  useEffect(() => {
    if (!jobId) return undefined;
    closedRef.current = false;

    let cancelled = false;
    const reconnect: { id: ReturnType<typeof setTimeout> | null } = { id: null };

    const update = (
      patcher: (prev: GlobalMergeJobSnapshotType | null) => GlobalMergeJobSnapshotType | null,
    ): void => {
      qc.setQueryData<GlobalMergeJobSnapshotType | null>(queryKey, (prev) =>
        patcher(prev ?? null),
      );
    };

    const connect = async (): Promise<void> => {
      if (cancelled || closedRef.current) return;
      const url = await buildGlobalMergeJobEventsUrl(jobId);
      if (cancelled) return;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('snapshot', (e) => {
        try {
          const snap = JSON.parse((e as MessageEvent).data) as GlobalMergeJobSnapshotType;
          update(() => snap);
          retryRef.current = 0;
        } catch {
          // ignore
        }
      });

      es.addEventListener('chunk', (e) => {
        try {
          const payload = JSON.parse((e as MessageEvent).data) as {
            jobId: string;
            progress: GlobalMergeJobChunkProgressType;
          };
          update((prev) => {
            if (!prev) return prev;
            const doneChunks = prev.doneChunks + 1;
            const totalChunks = Math.max(prev.totalChunks, doneChunks);
            return { ...prev, doneChunks, totalChunks };
          });
          void payload;
        } catch {
          // ignore
        }
      });

      es.addEventListener('done', (e) => {
        try {
          const payload = JSON.parse((e as MessageEvent).data) as {
            jobId: string;
            state: GlobalMergeJobStateType;
            finalGroupCount: number;
            finishedAt: string;
          };
          update((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              state: payload.state,
              finalGroupCount: payload.finalGroupCount,
              finishedAt: payload.finishedAt,
            };
          });
          closedRef.current = true;
          es.close();
          // 글로벌 통계 / overview 캐시 무효화.
          qc.invalidateQueries({ queryKey: ['analytics', 'overview'] });
          qc.invalidateQueries({ queryKey: ['analytics', 'global-menus'] });
        } catch {
          // ignore
        }
      });

      es.onerror = () => {
        es.close();
        if (cancelled || closedRef.current) return;
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
      closedRef.current = true;
      if (reconnect.id) clearTimeout(reconnect.id);
      esRef.current?.close();
      esRef.current = null;
      retryRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return {
    data: (queryRes.data as GlobalMergeJobSnapshotType | null | undefined) ?? null,
    isLoading: queryRes.isLoading,
    error: queryRes.error,
  };
};
