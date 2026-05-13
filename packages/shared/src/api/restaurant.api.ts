import {
  Routes,
  type RestaurantDeleteResultType,
  type RestaurantDetailType,
  type RestaurantInsightsType,
  type RestaurantListResultType,
  type RestaurantPublicDetailType,
  type RestaurantPublicListQueryType,
  type RestaurantPublicListResultType,
  type RestaurantRankingQueryType,
  type RestaurantRankingResultType,
  type RestaurantReanalyzeResultType,
  type RestaurantSummaryProgressType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

export const restaurantApi = {
  list: () => apiFetch<RestaurantListResultType>(Routes.Restaurant.list),

  ranking: (query: Partial<RestaurantRankingQueryType> = {}) => {
    const params = new URLSearchParams();
    if (query.sort) params.set('sort', query.sort);
    if (query.excludeNeutral !== undefined) {
      params.set('excludeNeutral', query.excludeNeutral ? 'true' : 'false');
    }
    if (query.minMentions !== undefined) params.set('minMentions', String(query.minMentions));
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.offset !== undefined) params.set('offset', String(query.offset));
    const qs = params.toString();
    return apiFetch<RestaurantRankingResultType>(
      `${Routes.Restaurant.ranking}${qs ? `?${qs}` : ''}`,
    );
  },

  // 공개 맛집 지도/리스트 페이지에서 호출. 토큰 있어도 그대로 동작 (공개 라우트).
  publicList: (query: Partial<RestaurantPublicListQueryType> = {}) => {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.category) params.set('category', query.category);
    if (query.bbox) params.set('bbox', query.bbox);
    if (query.sort) params.set('sort', query.sort);
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.offset !== undefined) params.set('offset', String(query.offset));
    const qs = params.toString();
    return apiFetch<RestaurantPublicListResultType>(
      `${Routes.Restaurant.publicList}${qs ? `?${qs}` : ''}`,
    );
  },

  publicByPlaceId: (placeId: string) =>
    apiFetch<RestaurantPublicDetailType>(Routes.Restaurant.publicByPlaceId(placeId)),

  publicInsights: (placeId: string) =>
    apiFetch<RestaurantInsightsType>(Routes.Restaurant.publicInsights(placeId)),

  getByPlaceId: (placeId: string) =>
    apiFetch<RestaurantDetailType>(Routes.Restaurant.byPlaceId(placeId)),

  getSummaryStatus: (placeId: string) =>
    apiFetch<RestaurantSummaryProgressType>(Routes.Restaurant.summaryStatus(placeId)),

  delete: (placeId: string) =>
    apiFetch<RestaurantDeleteResultType>(Routes.Restaurant.delete(placeId), {
      method: 'DELETE',
    }),

  reanalyze: (placeId: string) =>
    apiFetch<RestaurantReanalyzeResultType>(Routes.Restaurant.reanalyze(placeId), {
      method: 'POST',
    }),
};

// Build the SSE endpoint URL for live summary progress. EventSource can't
// carry the auth header, so we tack the JWT onto the query string (same
// pattern as the crawl jobEvents stream). The endpoint multiplexes any
// number of placeIds over a single connection.
export const buildSummaryEventsUrl = async (placeIds: string[]): Promise<string> => {
  const cfg = getApiConfig();
  const token = (await cfg.getToken?.()) ?? '';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  for (const pid of placeIds) params.append('placeId', pid);
  const qs = params.toString();
  const sep = qs ? '?' : '';
  return `${cfg.baseUrl}${Routes.Restaurant.summaryEvents}${sep}${qs}`;
};
