import type {
  ReviewAskInputType,
  ReviewAskResultType,
  ReviewEnrichBgResultType,
  ReviewEnrichPendingResultType,
  ReviewEnrichStatusListType,
  ReviewEnrichStatusQueryType,
  ReviewQaReadyResultType,
  ReviewSearchEnrichResultType,
  ReviewSearchRestaurantsResultType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

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

  // ── enrich 상태 관리 (어드민) ──
  enrichStatus: (query: Partial<ReviewEnrichStatusQueryType> = {}) => {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
    const qs = params.toString();
    return apiFetch<ReviewEnrichStatusListType>(`${RS_PREFIX}/status${qs ? `?${qs}` : ''}`);
  },

  enrichBg: (restaurantId: string) =>
    apiFetch<ReviewEnrichBgResultType>(`${RS_PREFIX}/enrich-bg`, {
      method: 'POST',
      body: JSON.stringify({ restaurantId }),
    }),

  enrichPending: () =>
    apiFetch<ReviewEnrichPendingResultType>(`${RS_PREFIX}/enrich-pending`, { method: 'POST' }),

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

// enrich 진행률 SSE URL. EventSource 는 Authorization 헤더를 못 실으므로 ?token= 으로 인증
// (summary/crawl SSE 와 동일). baseUrl 포함 절대 URL 반환.
export const buildReviewEnrichEventsUrl = async (): Promise<string> => {
  const cfg = getApiConfig();
  const token = (await cfg.getToken?.()) ?? '';
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${cfg.baseUrl}${RS_PREFIX}/enrich-events${qs}`;
};
