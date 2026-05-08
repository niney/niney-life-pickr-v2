import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  RestaurantDetailType,
  RestaurantListResultType,
  RestaurantSummaryProgressType,
} from '@repo/api-contract';
import { ApiError } from '../api/client.js';
import { restaurantApi } from '../api/restaurant.api.js';
import { summarySseManager } from './summarySseManager.js';

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

// Live summary progress over SSE. One persistent connection per placeId;
// the server pushes a new snapshot every time a row's status flips. No
// client-side polling — when the queue is idle the connection just sits
// there with 15s heartbeats. Pass null to detach.
//
// Returns `data` shaped like the polling hook used to so call sites don't
// have to change. `data` is null until the first snapshot arrives.
// Passive subscription for many placeIds at once — used by the list page so
// every visible row's badges stay live, not just the ones with an active
// crawl panel mounted. Side-effect only; the singleton SSE manager keeps
// this to a single underlying connection regardless of count.
export const useRestaurantListSummaryEvents = (placeIds: string[]): void => {
  const qc = useQueryClient();
  // Stable string key so the effect doesn't re-run when the array identity
  // changes but its contents don't (React Query refetch returning a new
  // items[] with the same placeIds is the common case).
  const key = placeIds.join(',');
  useEffect(() => {
    if (placeIds.length === 0) return undefined;
    const unsubs = placeIds.map((placeId) =>
      summarySseManager.subscribe(placeId, {
        onSnapshot: (snap) => {
          qc.setQueryData<RestaurantListResultType | undefined>(
            ['restaurant', 'list'],
            (prev) => {
              if (!prev) return prev;
              const items = prev.items.map((item) =>
                item.placeId === placeId
                  ? {
                      ...item,
                      totalReviews: snap.totalReviews,
                      summaryPending: snap.pending,
                      summaryRunning: snap.running,
                      summaryDone: snap.done,
                      summaryFailed: snap.failed,
                    }
                  : item,
              );
              return { ...prev, items };
            },
          );
        },
        onReview: () => {
          // List view doesn't render per-review text; ignore the per-row
          // payload here — the snapshot bump that follows already updates
          // the row's count badges, which is all we render.
        },
      }),
    );
    return () => {
      for (const u of unsubs) u();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, qc]);
};

export const useRestaurantSummaryEvents = (
  placeId: string | null,
): { data: RestaurantSummaryProgressType | null } => {
  const [data, setData] = useState<RestaurantSummaryProgressType | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    setData(null);
    if (!placeId) return undefined;
    return summarySseManager.subscribe(placeId, {
      onSnapshot: (snap) => {
        setData(snap);
        // Patch the list cache so the matching row's "진행/완료" badges stay
        // in sync as summaries finish. Without this, the list only refreshes
        // on crawl `done`, leaving stale running counts when summaries
        // continue past the crawl finish.
        qc.setQueryData<RestaurantListResultType | undefined>(
          ['restaurant', 'list'],
          (prev) => {
            if (!prev) return prev;
            const items = prev.items.map((item) =>
              item.placeId === placeId
                ? {
                    ...item,
                    totalReviews: snap.totalReviews,
                    summaryPending: snap.pending,
                    summaryRunning: snap.running,
                    summaryDone: snap.done,
                    summaryFailed: snap.failed,
                  }
                : item,
            );
            return { ...prev, items };
          },
        );
      },
      onReview: (ev) => {
        // Per-row patch — merge the new summary directly into the detail
        // cache. Without this we'd have to invalidate the whole detail query
        // (which carries every review body) every time one summary lands.
        qc.setQueryData<RestaurantDetailType | null>(
          ['restaurant', placeId],
          (prev) => {
            if (!prev) return prev;
            const reviews = prev.reviews.map((r) =>
              r.id === ev.reviewId
                ? {
                    ...r,
                    summary: {
                      status: ev.status,
                      text: ev.text,
                      model: ev.model,
                      errorCode: ev.errorCode,
                      errorMessage: ev.errorMessage,
                      startedAt: r.summary?.startedAt ?? null,
                      finishedAt: ev.finishedAt,
                      sentiment: ev.sentiment,
                      sentimentScore: ev.sentimentScore,
                      satisfactionScore: ev.satisfactionScore,
                      menus: ev.menus,
                      tips: ev.tips,
                      keywords: ev.keywords,
                    },
                  }
                : r,
            );
            return { ...prev, reviews };
          },
        );
      },
    });
  }, [placeId, qc]);

  return { data };
};

// Hard-delete a restaurant by placeId. On success the list query is
// invalidated and the cached detail/summary entries for that placeId are
// removed so the row vanishes immediately.
export const useDeleteRestaurant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => restaurantApi.delete(placeId),
    onSuccess: (_data, placeId) => {
      qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
      qc.removeQueries({ queryKey: ['restaurant', placeId] });
    },
  });
};
