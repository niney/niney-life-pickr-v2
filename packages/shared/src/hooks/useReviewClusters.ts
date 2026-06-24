import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reviewClusteringApi } from '../api/review-clustering.api.js';

// 공개 군집 조회 — 저장된 결과 읽기(계산 없음). 상세 "분석" 탭 진입 시 활성화.
export const useRestaurantClusters = (placeId: string, enabled = true) =>
  useQuery({
    queryKey: ['review-clusters', placeId],
    queryFn: () => reviewClusteringApi.publicClusters(placeId),
    enabled: enabled && !!placeId,
    staleTime: 5 * 60_000,
  });

// 어드민 군집화 실행 — 성공 시 해당 식당 공개 군집 캐시 무효화(있다면).
export const useRunClustering = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (restaurantId: string) => reviewClusteringApi.run(restaurantId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['review-clusters'] });
    },
  });
};
