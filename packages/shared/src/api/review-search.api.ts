import type {
  ReviewAskInputType,
  ReviewAskResultType,
  ReviewQaReadyResultType,
  ReviewSearchEnrichResultType,
  ReviewSearchRestaurantsResultType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

// 경로는 하드코딩 — `Routes.ReviewSearch` 네임스페이스는 vite esbuild prebundle
// 에서 드롭될 수 있어(ai.api.ts 관례) 직접 둔다.
const RS_PREFIX = '/api/v1/admin/review-search';
const PUBLIC_PREFIX = '/api/v1/restaurants'; // 공개 QA (placeId 기반)

export const reviewSearchApi = {
  restaurants: () => apiFetch<ReviewSearchRestaurantsResultType>(`${RS_PREFIX}/restaurants`),

  enrich: (restaurantId: string) =>
    apiFetch<ReviewSearchEnrichResultType>(`${RS_PREFIX}/enrich`, {
      method: 'POST',
      body: JSON.stringify({ restaurantId }),
    }),

  ask: (input: ReviewAskInputType) =>
    apiFetch<ReviewAskResultType>(`${RS_PREFIX}/ask`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // ── 공개 QA (placeId 기반, 인증 없음) ──
  publicQaReady: (placeId: string) =>
    apiFetch<ReviewQaReadyResultType>(`${PUBLIC_PREFIX}/${encodeURIComponent(placeId)}/qa/ready`),

  publicAsk: (placeId: string, query: string) =>
    apiFetch<ReviewAskResultType>(`${PUBLIC_PREFIX}/${encodeURIComponent(placeId)}/qa`, {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),
};
