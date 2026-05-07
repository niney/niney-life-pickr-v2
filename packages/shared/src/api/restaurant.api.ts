import {
  Routes,
  type RestaurantDeleteResultType,
  type RestaurantDetailType,
  type RestaurantListResultType,
  type RestaurantSummaryProgressType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

export const restaurantApi = {
  list: () => apiFetch<RestaurantListResultType>(Routes.Restaurant.list),

  getByPlaceId: (placeId: string) =>
    apiFetch<RestaurantDetailType>(Routes.Restaurant.byPlaceId(placeId)),

  getSummaryStatus: (placeId: string) =>
    apiFetch<RestaurantSummaryProgressType>(Routes.Restaurant.summaryStatus(placeId)),

  delete: (placeId: string) =>
    apiFetch<RestaurantDeleteResultType>(Routes.Restaurant.delete(placeId), {
      method: 'DELETE',
    }),
};

// Build the SSE endpoint URL for live summary progress. EventSource can't
// carry the auth header, so we tack the JWT onto the query string (same
// pattern as the crawl jobEvents stream).
export const buildSummaryEventsUrl = async (placeId: string): Promise<string> => {
  const cfg = getApiConfig();
  const token = (await cfg.getToken?.()) ?? '';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  const qs = params.toString();
  const sep = qs ? '?' : '';
  return `${cfg.baseUrl}${Routes.Restaurant.summaryEvents(placeId)}${sep}${qs}`;
};
