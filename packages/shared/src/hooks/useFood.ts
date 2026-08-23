import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FoodAdminCreateInputType,
  FoodAdminUpdateInputType,
  FoodImportConfigInputType,
  FoodImportProgressEventType,
  FoodImportRunInputType,
  FoodImportRunType,
  FoodMergeConflictActionType,
} from '@repo/api-contract';
import {
  buildFoodImportRunEventsUrl,
  foodApi,
  type FoodAdminListInput,
  type FoodMergeConflictListInput,
  type FoodRecognitionQualityInput,
  type FoodRestaurantsInput,
} from '../api/food.api.js';

// 쿼리 키 루트 ['food', ...] — 어드민 목록은 ['food','admin',...], 통계는 ['food','stats'],
// 적재 잡은 ['food','import',...]. 편집/적재 완료 시 이 접두사들로 무효화한다.

// ── 사용자 자동완성 ───────────────────────────────────────────────────────────
// q 가 비어 있으면 호출하지 않는다(서버 min(1)). 타이핑 중 이전 결과를 유지해 목록이
// 깜빡이지 않게 keepPreviousData, 같은 q 재입력은 60초 캐시.
export const useFoodSearch = (q: string, opts: { limit?: number; enabled?: boolean } = {}) => {
  const trimmed = q.trim();
  return useQuery({
    queryKey: ['food', 'search', trimmed, opts.limit ?? null],
    queryFn: () => foodApi.search(trimmed, opts.limit),
    enabled: (opts.enabled ?? true) && trimmed.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
};

// 좌표가 있으면 반경 안 거리순, 없으면 수집 근거·평점순. foodId가 비어 있을 때는
// 서버의 min(1) params 검증에 걸리지 않게 호출을 막는다.
export const useFoodRestaurants = (
  foodId: string,
  input: FoodRestaurantsInput = {},
  opts: { enabled?: boolean } = {},
) =>
  useQuery({
    queryKey: ['food', 'restaurants', foodId, input],
    queryFn: () => foodApi.restaurants(foodId, input),
    enabled: (opts.enabled ?? true) && foodId.trim().length > 0,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

// ── 어드민 카탈로그 ──────────────────────────────────────────────────────────
export const useFoodAdminList = (query: FoodAdminListInput = {}) =>
  useQuery({
    queryKey: ['food', 'admin', 'list', query],
    queryFn: () => foodApi.adminList(query),
    placeholderData: keepPreviousData,
  });

export const useFoodAdminStats = () =>
  useQuery({
    queryKey: ['food', 'stats'],
    queryFn: foodApi.adminStats,
  });

export const useFoodMergeConflicts = (input: FoodMergeConflictListInput = {}) =>
  useQuery({
    queryKey: ['food', 'admin', 'merge-conflicts', input],
    queryFn: () => foodApi.adminMergeConflicts(input),
    placeholderData: keepPreviousData,
  });

export const useResolveFoodMergeConflict = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: FoodMergeConflictActionType }) =>
      foodApi.resolveMergeConflict(id, { action }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['food', 'admin', 'merge-conflicts'] });
      void qc.invalidateQueries({ queryKey: ['food', 'admin', 'list'] });
      void qc.invalidateQueries({ queryKey: ['food', 'stats'] });
    },
  });
};

export const useFoodRecognitionQuality = (input: FoodRecognitionQualityInput = {}) =>
  useQuery({
    queryKey: ['food', 'admin', 'recognition-quality', input],
    queryFn: () => foodApi.adminRecognitionQuality(input),
    staleTime: 5 * 60_000,
  });

const invalidateCatalog = (qc: ReturnType<typeof useQueryClient>): void => {
  void qc.invalidateQueries({ queryKey: ['food', 'admin'] });
  void qc.invalidateQueries({ queryKey: ['food', 'stats'] });
};

export const useCreateFoodItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FoodAdminCreateInputType) => foodApi.adminCreate(input),
    onSuccess: () => invalidateCatalog(qc),
  });
};

export const useUpdateFoodItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FoodAdminUpdateInputType }) =>
      foodApi.adminUpdate(id, input),
    onSuccess: () => invalidateCatalog(qc),
  });
};

// ── 적재 잡 ─────────────────────────────────────────────────────────────────
export const useFoodImportConfig = () =>
  useQuery({
    queryKey: ['food', 'import', 'config'],
    queryFn: foodApi.getImportConfig,
  });

export const useUpdateFoodImportConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FoodImportConfigInputType) => foodApi.updateImportConfig(input),
    onSuccess: (cfg) => {
      qc.setQueryData(['food', 'import', 'config'], cfg);
    },
  });
};

// 지금 실행 — 인자 없이(저장된 설정) 또는 이번 회차 오버라이드(소스/분류)로.
export const useRunFoodImportNow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input?: FoodImportRunInputType) => foodApi.runImportNow(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['food', 'import', 'runs'] });
      void qc.invalidateQueries({ queryKey: ['food', 'import', 'config'] });
    },
  });
};

export const useFoodImportRuns = () =>
  useQuery({
    queryKey: ['food', 'import', 'runs'],
    queryFn: foodApi.listImportRuns,
  });

// 저장 전 cron 미리보기 — schedule/random-crawl 과 동일 패턴.
export const useFoodImportPreview = (cronExpr: string, timezone: string, enabled: boolean) =>
  useQuery({
    queryKey: ['food', 'import', 'preview', cronExpr, timezone],
    queryFn: () => foodApi.previewImport({ cronExpr, timezone }),
    enabled: enabled && cronExpr.trim().length > 0,
  });

// 진행 중 run 의 SSE 구독 — 수집/정규화/반영/분류 단계를 live 로. snapshot 이 running 이면
// 그 값으로 초기 progress 를 만들고, done 에서 캐시(이력·설정·카탈로그·통계)를 무효화한다.
// 끊기면 지수 백오프(최대 30초)로 재접속. enabled 가 꺼지면 닫고 progress 를 비운다.
export const useFoodImportRunEvents = (
  enabled: boolean,
): { progress: FoodImportProgressEventType | null } => {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<FoodImportProgressEventType | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      setProgress(null);
      return undefined;
    }
    let cancelled = false;
    let closed = false;
    let retry = 0;
    let reconnectId: ReturnType<typeof setTimeout> | null = null;

    const finish = (): void => {
      closed = true;
      setProgress(null);
      void qc.invalidateQueries({ queryKey: ['food', 'import', 'runs'] });
      void qc.invalidateQueries({ queryKey: ['food', 'import', 'config'] });
      void qc.invalidateQueries({ queryKey: ['food', 'admin'] });
      void qc.invalidateQueries({ queryKey: ['food', 'stats'] });
    };

    const connect = async (): Promise<void> => {
      if (cancelled || closed) return;
      const url = await buildFoodImportRunEventsUrl();
      if (cancelled) return;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('snapshot', (e) => {
        try {
          const snap = JSON.parse((e as MessageEvent).data) as FoodImportRunType | null;
          if (snap && snap.status === 'running') {
            setProgress({
              type: 'progress',
              runId: snap.runId,
              phase: snap.phase ?? 'fetching',
              source: null,
              processed: snap.progress?.processed ?? 0,
              total: snap.progress?.total ?? null,
              message: null,
            });
          }
          retry = 0;
        } catch {
          // ignore
        }
      });

      es.addEventListener('progress', (e) => {
        try {
          setProgress(JSON.parse((e as MessageEvent).data) as FoodImportProgressEventType);
          retry = 0;
        } catch {
          // ignore
        }
      });

      es.addEventListener('done', () => {
        es.close();
        finish();
      });

      es.onerror = () => {
        es.close();
        if (cancelled || closed) return;
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
      closed = true;
      if (reconnectId) clearTimeout(reconnectId);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [enabled, qc]);

  return { progress };
};
