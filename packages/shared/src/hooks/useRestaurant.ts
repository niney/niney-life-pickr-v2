import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../api/client.js';
import { restaurantApi } from '../api/restaurant.api.js';

const isNotFound = (e: unknown): boolean =>
  e instanceof ApiError && e.statusCode === 404;

// Crawled-restaurant list. Query is mostly static — invalidate from the
// restaurants page after a crawl completes (or after recrawl/update kicks
// off, since the row stays present but counts change).
export const useRestaurantList = () =>
  useQuery({
    queryKey: ['restaurant', 'list'],
    queryFn: restaurantApi.list,
  });

// `placeId` may be null when the user hasn't started a crawl yet — keeps
// callers from having to gate the hook conditionally. Returns 404s as
// `data: undefined` (the restaurant simply isn't crawled yet) rather than
// surfacing the ApiError.
export const useRestaurantByPlaceId = (placeId: string | null) =>
  useQuery({
    queryKey: ['restaurant', placeId],
    queryFn: async () => {
      if (!placeId) return null;
      try {
        return await restaurantApi.getByPlaceId(placeId);
      } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
      }
    },
    enabled: !!placeId,
  });

// Polls the summary progress endpoint while there is in-flight work
// (pending+running > 0). Once the queue drains, polling stops automatically.
// `enabled=false` when no placeId — same gating pattern as the detail hook.
export const useRestaurantSummaryStatus = (placeId: string | null) =>
  useQuery({
    queryKey: ['restaurant', placeId, 'summary-status'],
    queryFn: async () => {
      if (!placeId) return null;
      try {
        return await restaurantApi.getSummaryStatus(placeId);
      } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
      }
    },
    enabled: !!placeId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return data.pending + data.running > 0 ? 3000 : false;
    },
  });
