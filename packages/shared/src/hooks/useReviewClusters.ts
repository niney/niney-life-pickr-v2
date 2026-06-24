import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReviewClusterStatusQueryType } from '@repo/api-contract';
import { reviewClusteringApi } from '../api/review-clustering.api.js';

// 공개 군집 조회 — 저장된 결과 읽기(계산 없음). 상세 "분석" 탭 진입 시 활성화.
export const useRestaurantClusters = (placeId: string, enabled = true) =>
  useQuery({
    queryKey: ['review-clusters', placeId],
    queryFn: () => reviewClusteringApi.publicClusters(placeId),
    enabled: enabled && !!placeId,
    staleTime: 5 * 60_000,
  });

// 어드민 군집화 실행(단건 동기) — 성공 시 공개 군집 캐시 무효화.
export const useRunClustering = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (restaurantId: string) => reviewClusteringApi.run(restaurantId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['review-clusters'] });
    },
  });
};

// ── 어드민 군집 상태 관리 (enrich 상태 미러링) ──
// 진행 중 식당이 있으면 폴링(SSE 대신 — 군집 작업은 짧음).
export const useClusterStatus = (query: Partial<ReviewClusterStatusQueryType> = {}) =>
  useQuery({
    queryKey: ['review-clustering', 'status', query.q ?? '', query.page ?? 1, query.pageSize ?? 30],
    queryFn: () => reviewClusteringApi.status(query),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.items.some((i) => i.inProgress) ? 5000 : false),
  });

export const useClusterBg = () =>
  useMutation({ mutationFn: (restaurantId: string) => reviewClusteringApi.clusterBg(restaurantId) });

export const useClusterPending = () =>
  useMutation({ mutationFn: () => reviewClusteringApi.clusterPending() });
