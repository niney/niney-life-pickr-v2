import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MenuGroupingJobItemType,
  MenuGroupingJobSnapshotType,
  MenuGroupingJobStateType,
  MenuRankingQueryType,
  MenuRankingResultType,
} from '@repo/api-contract';
import { ApiError } from '../api/client.js';
import {
  buildGroupingJobEventsUrl,
  menuGroupingApi,
} from '../api/menu-grouping.api.js';

const isNotFound = (e: unknown): boolean =>
  e instanceof ApiError && e.statusCode === 404;

// 식당 메뉴 순위. placeId null 이면 비활성. 정렬·minMentions 가 바뀌면
// React Query 가 자동 refetch — fetch 하나가 가벼워서 부담 없음.
export const useMenuRanking = (
  placeId: string | null,
  query: Partial<MenuRankingQueryType> = {},
) =>
  useQuery({
    queryKey: ['menu-grouping', 'ranking', placeId, query.sort ?? 'mentions', query.minMentions ?? 1],
    queryFn: async () => {
      if (!placeId) return null;
      try {
        return await menuGroupingApi.getRanking(placeId, query);
      } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
      }
    },
    enabled: !!placeId,
  });

// 단일 식당 그룹핑 실행 (분류 버튼). 성공 시 ranking 캐시 무효화 → UI 자동 갱신.
export const useGroupForRestaurant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => menuGroupingApi.groupForRestaurant(placeId),
    onSuccess: (_data, placeId) => {
      qc.invalidateQueries({ queryKey: ['menu-grouping', 'ranking', placeId] });
      qc.invalidateQueries({ queryKey: ['menu-grouping', 'restaurants-status'] });
    },
  });
};

// 관리자 페이지 — 식당 정규화 상태 테이블. 잡 끝날 때마다 invalidate.
export const useGroupingRestaurantsStatus = () =>
  useQuery({
    queryKey: ['menu-grouping', 'restaurants-status'],
    queryFn: menuGroupingApi.getRestaurantsStatus,
  });

// batch 잡 시작.
export const useCreateGroupingJob = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeIds: string[]) =>
      menuGroupingApi.createGroupingJob({ placeIds }),
    onSuccess: (snap) => {
      // 잡 스냅샷 캐시에 미리 저장 — SSE 가 붙기 전에도 UI 가 즉시 표시.
      qc.setQueryData(['menu-grouping', 'job', snap.jobId], snap);
    },
  });
};

// 잡 상태 + 라이브 SSE 구독. jobId 받으면 곧바로 GET snapshot → 그 후 SSE 구독.
// SSE 메시지(item/done) 가 도착할 때마다 같은 캐시 키를 머지 업데이트.
//
// reconnect: EventSource 가 disconnect 되면 자동으로 1초 후 재연결.
// 백오프는 1s → 2s → 4s → 최대 30s. 단, 잡이 done/failed 면 재연결 안 함.
export const useGroupingJob = (
  jobId: string | null,
): { data: MenuGroupingJobSnapshotType | null; isLoading: boolean; error: unknown } => {
  const qc = useQueryClient();
  const queryKey = ['menu-grouping', 'job', jobId];
  const queryRes = useQuery({
    queryKey,
    queryFn: async () => {
      if (!jobId) return null;
      try {
        return await menuGroupingApi.getGroupingJob(jobId);
      } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
      }
    },
    enabled: !!jobId,
  });

  // SSE 구독.
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<number>(0);
  const closedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!jobId) return undefined;
    closedRef.current = false;

    let cancelled = false;
    const reconnectTimer: { id: ReturnType<typeof setTimeout> | null } = { id: null };

    const updateSnapshot = (
      patcher: (prev: MenuGroupingJobSnapshotType | null) => MenuGroupingJobSnapshotType | null,
    ): void => {
      qc.setQueryData<MenuGroupingJobSnapshotType | null>(queryKey, (prev) => patcher(prev ?? null));
    };

    const connect = async (): Promise<void> => {
      if (cancelled || closedRef.current) return;
      const url = await buildGroupingJobEventsUrl(jobId);
      if (cancelled) return;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('snapshot', (e) => {
        try {
          const snap = JSON.parse((e as MessageEvent).data) as MenuGroupingJobSnapshotType;
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
            item: MenuGroupingJobItemType;
          };
          updateSnapshot((prev) => {
            if (!prev) return prev;
            const items = prev.items.map((it) =>
              it.placeId === payload.item.placeId ? payload.item : it,
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
            state: MenuGroupingJobStateType;
            finishedAt: string;
          };
          updateSnapshot((prev) => {
            if (!prev) return prev;
            return { ...prev, state: payload.state, finishedAt: payload.finishedAt };
          });
          // 잡 끝났으니 SSE 닫고 재연결 막음 + 식당 status 캐시 무효화 (관리자 테이블 갱신).
          closedRef.current = true;
          es.close();
          qc.invalidateQueries({ queryKey: ['menu-grouping', 'restaurants-status'] });
          // 끝난 식당의 ranking 캐시도 일괄 무효화 — 어떤 placeId 들이 영향
          // 받았는지 정확히 모르므로 prefix 만 매치.
          qc.invalidateQueries({ queryKey: ['menu-grouping', 'ranking'] });
        } catch {
          // ignore
        }
      });

      es.onerror = () => {
        es.close();
        if (cancelled || closedRef.current) return;
        // 백오프 재연결.
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
    data: (queryRes.data as MenuGroupingJobSnapshotType | null | undefined) ?? null,
    isLoading: queryRes.isLoading,
    error: queryRes.error,
  };
};

// 사용처에서 `MenuRankingResultType` 노출 편의용.
export type { MenuRankingResultType };
