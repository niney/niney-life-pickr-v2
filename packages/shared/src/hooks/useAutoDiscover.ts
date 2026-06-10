import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AutoDiscoverCandidateType,
  AutoDiscoverJobInputType,
  AutoDiscoverJobSnapshotType,
  AutoDiscoverJobStateType,
  AutoDiscoverKeywordType,
  AutoDiscoverPhaseType,
} from '@repo/api-contract';
import { ApiError } from '../api/client.js';
import {
  autoDiscoverApi,
  buildAutoDiscoverEventsUrl,
} from '../api/autoDiscover.api.js';
import { useActiveAutoDiscoverJobStore } from '../stores/activeAutoDiscoverJobStore.js';

// 잡 시작 — 성공 시 activeStore 에 jobId 박고 캐시에 초기 snapshot 저장.
export const useStartAutoDiscover = () => {
  const qc = useQueryClient();
  const setActive = useActiveAutoDiscoverJobStore((s) => s.setJobId);
  return useMutation({
    mutationFn: (input: AutoDiscoverJobInputType) =>
      autoDiscoverApi.start(input),
    onSuccess: (snap) => {
      qc.setQueryData(['auto-discover', 'job', snap.jobId], snap);
      setActive(snap.jobId);
    },
  });
};

// 잡 취소 (DELETE). 응답 없음.
export const useCancelAutoDiscover = () =>
  useMutation({
    mutationFn: (jobId: string) => autoDiscoverApi.cancel(jobId),
  });

// 후보 리스트 확인 후 등록 시작 (POST confirm). phase 전환은 SSE 로 들어온다.
export const useConfirmAutoDiscover = () =>
  useMutation({
    mutationFn: (jobId: string) => autoDiscoverApi.confirm(jobId),
  });

// 잡 상태 + 라이브 SSE 구독. useDiningcodeBulkSaveJob 패턴과 동일 — 종료되면
// EventSource 닫고 재연결 막음 + 후속 캐시 무효화.
export const useAutoDiscoverJob = (
  jobId: string | null,
): {
  data: AutoDiscoverJobSnapshotType | null;
  isLoading: boolean;
  error: unknown;
} => {
  const qc = useQueryClient();
  const clearActive = useActiveAutoDiscoverJobStore((s) => s.clear);
  const queryKey = ['auto-discover', 'job', jobId];

  const queryRes = useQuery({
    queryKey,
    queryFn: async () => {
      if (!jobId) return null;
      try {
        return await autoDiscoverApi.get(jobId);
      } catch (e) {
        if (e instanceof ApiError && e.statusCode === 404) {
          clearActive();
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
    const reconnectTimer: { id: ReturnType<typeof setTimeout> | null } = {
      id: null,
    };

    const updateSnapshot = (
      patcher: (
        prev: AutoDiscoverJobSnapshotType | null,
      ) => AutoDiscoverJobSnapshotType | null,
    ): void => {
      qc.setQueryData<AutoDiscoverJobSnapshotType | null>(queryKey, (prev) =>
        patcher(prev ?? null),
      );
    };

    const connect = async (): Promise<void> => {
      if (cancelled || closedRef.current) return;
      const url = await buildAutoDiscoverEventsUrl(jobId);
      if (cancelled) return;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('snapshot', (e) => {
        try {
          const snap = JSON.parse(
            (e as MessageEvent).data,
          ) as AutoDiscoverJobSnapshotType;
          updateSnapshot(() => snap);
          retryRef.current = 0;
        } catch {
          // ignore
        }
      });

      es.addEventListener('keyword', (e) => {
        try {
          const payload = JSON.parse((e as MessageEvent).data) as {
            jobId: string;
            keyword: AutoDiscoverKeywordType;
          };
          updateSnapshot((prev) => {
            if (!prev) return prev;
            const idx = prev.keywords.findIndex(
              (k) => k.keyword === payload.keyword.keyword,
            );
            let keywords: AutoDiscoverKeywordType[];
            if (idx >= 0) {
              keywords = prev.keywords.slice();
              keywords[idx] = payload.keyword;
            } else {
              keywords = [...prev.keywords, payload.keyword];
            }
            return { ...prev, keywords };
          });
        } catch {
          // ignore
        }
      });

      es.addEventListener('candidate', (e) => {
        try {
          const payload = JSON.parse((e as MessageEvent).data) as {
            jobId: string;
            candidate: AutoDiscoverCandidateType;
          };
          updateSnapshot((prev) => {
            if (!prev) return prev;
            const idx = prev.candidates.findIndex(
              (c) => c.placeId === payload.candidate.placeId,
            );
            let candidates: AutoDiscoverCandidateType[];
            if (idx >= 0) {
              candidates = prev.candidates.slice();
              candidates[idx] = payload.candidate;
            } else {
              candidates = [...prev.candidates, payload.candidate];
            }
            // 후보 done 카운트 — 상태에서는 newlyRegistered 가 phase 이벤트로
            // 들어오지만, candidate 이벤트만 받은 시점에도 빠르게 반영되도록
            // 클라이언트가 자체 계산.
            const newlyRegistered = candidates.filter(
              (c) => c.state === 'done',
            ).length;
            return { ...prev, candidates, newlyRegistered };
          });
        } catch {
          // ignore
        }
      });

      es.addEventListener('phase', (e) => {
        try {
          const payload = JSON.parse((e as MessageEvent).data) as {
            jobId: string;
            phase: AutoDiscoverPhaseType;
            newlyRegistered: number;
          };
          updateSnapshot((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              phase: payload.phase,
              newlyRegistered: payload.newlyRegistered,
            };
          });
        } catch {
          // ignore
        }
      });

      es.addEventListener('done', (e) => {
        try {
          const payload = JSON.parse((e as MessageEvent).data) as {
            jobId: string;
            state: AutoDiscoverJobStateType;
            finishedAt: string;
          };
          updateSnapshot((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              state: payload.state,
              phase: 'done',
              finishedAt: payload.finishedAt,
            };
          });
          closedRef.current = true;
          es.close();
          // 새로 등록된 가게가 생겼으니 어드민 발견/등록 캐시 무효화.
          qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
          qc.invalidateQueries({ queryKey: ['restaurant', 'public', 'list'] });
          qc.invalidateQueries({ queryKey: ['canonical', 'proposals'] });
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
    data:
      (queryRes.data as AutoDiscoverJobSnapshotType | null | undefined) ?? null,
    isLoading: queryRes.isLoading,
    error: queryRes.error,
  };
};
