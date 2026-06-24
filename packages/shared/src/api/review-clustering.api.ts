import type { ReviewClusterRunResultType, ReviewClustersResultType } from '@repo/api-contract';
import { apiFetch } from './client.js';

// 경로는 하드코딩 — Routes 네임스페이스가 vite esbuild prebundle 에서 드롭될 수 있어
// review-search.api.ts 관례를 따른다.
const RC_PREFIX = '/api/v1/admin/review-clustering';
const PUBLIC_PREFIX = '/api/v1/restaurants'; // 공개 군집 조회(placeId 기반)

export const reviewClusteringApi = {
  // 어드민 — 식당 단위 군집화 실행(동기, 무거운 배치).
  run: (restaurantId: string) =>
    apiFetch<ReviewClusterRunResultType>(`${RC_PREFIX}/run`, {
      method: 'POST',
      body: JSON.stringify({ restaurantId }),
    }),

  // 공개 — 저장된 군집 조회(인증 없음).
  publicClusters: (placeId: string) =>
    apiFetch<ReviewClustersResultType>(`${PUBLIC_PREFIX}/${encodeURIComponent(placeId)}/clusters`),
};
