import { useEffect, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  RestaurantDetailType,
  RestaurantListResultType,
  RestaurantPublicListQueryType,
  RestaurantPublicListResultType,
  RestaurantRankingQueryType,
  RestaurantSourceSummaryType,
  RestaurantSummaryProgressType,
  RestaurantSummarySnapshotEventType,
} from '@repo/api-contract';
import { recomputeCanonicalAggregates } from '@repo/api-contract';
import { ApiError } from '../api/client.js';
import { restaurantApi } from '../api/restaurant.api.js';
import { summarySseManager } from './summarySseManager.js';

const isNotFound = (e: unknown): boolean =>
  e instanceof ApiError && e.statusCode === 404;

// SSE summary snapshot 이 도착했을 때 어드민 list (`['restaurant', 'list']`)
// 와 공개 list (`['restaurant', 'public', 'list', ...]`) 양쪽 캐시의 해당 행을
// 동일 필드 셋으로 패치한다. 공개 list 의 queryKey 는 URL 파라미터마다 달라
// 여러 인스턴스가 동시에 캐시에 살아 있을 수 있어 setQueriesData 로 prefix
// 매칭한다.
// SSE snapshot 이 도착했을 때 어드민 list / 공개 list 캐시를 patch.
//   - 어드민 list: canonicalId 로 행 찾고, restaurantId 로 그 행의 source 갱신.
//   - 공개 list: placeId 가 있을 때만(=Naver) 매칭해서 갱신.
const patchSummaryInListCaches = (
  qc: QueryClient,
  snap: RestaurantSummarySnapshotEventType,
): void => {
  qc.setQueryData<RestaurantListResultType | undefined>(
    ['restaurant', 'list'],
    (prev) => {
      if (!prev) return prev;
      const items = prev.items.map((item) => {
        if (item.canonicalId !== snap.canonicalId) return item;
        const idx = item.sources.findIndex((s) => s.restaurantId === snap.restaurantId);
        if (idx === -1) return item;
        const updatedSource: RestaurantSourceSummaryType = {
          ...item.sources[idx]!,
          totalReviews: snap.totalReviews,
          summaryPending: snap.pending,
          summaryRunning: snap.running,
          summaryDone: snap.done,
          summaryFailed: snap.failed,
        };
        const sources = item.sources.map((s, i) => (i === idx ? updatedSource : s));
        return { ...item, sources, ...recomputeCanonicalAggregates(sources) };
      });
      return { ...prev, items };
    },
  );
  // 공개 list 는 placeId 가 key — DC 행은 공개 list 에 안 노출되므로 skip.
  if (snap.placeId === null) return;
  const placeId = snap.placeId;
  qc.setQueriesData<RestaurantPublicListResultType | undefined>(
    { queryKey: ['restaurant', 'public', 'list'] },
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
};

// Crawled-restaurant list. Query is mostly static — invalidate from the
// restaurants page after a crawl completes (or after recrawl/update kicks
// off, since the row stays present but counts change).
export const useRestaurantList = () =>
  useQuery({
    queryKey: ['restaurant', 'list'],
    queryFn: restaurantApi.list,
  });

// 공개 랭킹 — 비로그인/게스트도 호출. 토글 변경 시 깜빡임 방지를 위해
// placeholderData 로 이전 결과 유지. 서버 60s TTL 과 정렬을 맞춰 staleTime
// 30s — 토글이 자주 바뀌어도 분당 두 번 정도만 fetch.
export const useRestaurantRanking = (query: Partial<RestaurantRankingQueryType> = {}) =>
  useQuery({
    queryKey: [
      'restaurant',
      'ranking',
      query.sort ?? 'positive',
      !!query.excludeNeutral,
      query.minMentions ?? 5,
      query.limit ?? 20,
      query.offset ?? 0,
    ],
    queryFn: () => restaurantApi.ranking(query),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

// 공개 맛집 지도 페이지가 호출하는 리스트. URL 동기화 패턴이라 query 가 자주
// 갱신되는데, queryKey 에 모든 필드를 깔아두면 불필요한 리페치가 잦다 — 의미
// 있는 필드만 키에 넣어 디바운스/탭 전환에 견디게 한다. placeholderData 로 깜
// 빡임 방지.
// `alwaysRefetchOnMount` 는 어드민 발견 페이지처럼 재진입마다 최신 데이터를
// 강제로 받아야 하는 호출처를 위한 옵트인. 기본은 30s staleTime 캐시 그대로 —
// 공개 맛집 페이지는 토글/스크롤이 잦아 캐시 우선이 맞다.
export const useRestaurantsPublic = (
  query: Partial<RestaurantPublicListQueryType> = {},
  options: { alwaysRefetchOnMount?: boolean } = {},
) =>
  useQuery({
    queryKey: [
      'restaurant',
      'public',
      'list',
      query.q ?? '',
      query.category ?? '',
      query.bbox ?? '',
      query.sort ?? 'recent',
      query.limit ?? 60,
      query.offset ?? 0,
    ],
    queryFn: () => restaurantApi.publicList(query),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    refetchOnMount: options.alwaysRefetchOnMount ? 'always' : true,
  });

// 공개 식당 상세. placeId 가 null/빈 문자열이면 비활성화 — 패널 닫힘 상태.
export const useRestaurantPublic = (placeId: string | null) =>
  useQuery({
    queryKey: ['restaurant', 'public', 'detail', placeId],
    queryFn: () => {
      if (!placeId) throw new Error('placeId required');
      return restaurantApi.publicByPlaceId(placeId);
    },
    enabled: !!placeId,
    staleTime: 60_000,
  });

export const useRestaurantPublicInsights = (placeId: string | null) =>
  useQuery({
    queryKey: ['restaurant', 'public', 'insights', placeId],
    queryFn: () => {
      if (!placeId) throw new Error('placeId required');
      return restaurantApi.publicInsights(placeId);
    },
    enabled: !!placeId,
    staleTime: 60_000,
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
// 어드민 발견(공개 list 기반) 화면용 — 공개 list 는 Naver 전용이라 placeId 만
// 있다. canonical-기반 hook 과 별개 (kind: 'place' 로 구독).
export const useRestaurantListSummaryEventsByPlaceIds = (placeIds: string[]): void => {
  const qc = useQueryClient();
  const key = placeIds.join(',');
  useEffect(() => {
    if (placeIds.length === 0) return undefined;
    const unsubs = placeIds.map((placeId) =>
      summarySseManager.subscribe(
        { kind: 'place', placeId },
        {
          onSnapshot: (snap) => {
            patchSummaryInListCaches(qc, snap);
          },
          onReview: () => {
            // 리스트는 review 본문 무관 — snapshot bump 가 카운트 갱신 처리.
          },
        },
      ),
    );
    return () => {
      for (const u of unsubs) u();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, qc]);
};

// 리스트 화면용 — 표시 중인 canonical 들의 SSE 구독. DC source 도 같이 풀려
// 들어와 라이브 진행 배지가 모든 출처에서 갱신.
export const useRestaurantListSummaryEvents = (canonicalIds: string[]): void => {
  const qc = useQueryClient();
  // 안정 키 — items[] 가 같은 canonicalId 들로 refetch 될 때 effect 가 다시
  // 돌지 않게.
  const key = canonicalIds.join(',');
  useEffect(() => {
    if (canonicalIds.length === 0) return undefined;
    const unsubs = canonicalIds.map((canonicalId) =>
      summarySseManager.subscribe(
        { kind: 'canonical', canonicalId },
        {
          onSnapshot: (snap) => {
            patchSummaryInListCaches(qc, snap);
          },
          onReview: () => {
            // 리스트는 per-review 본문을 렌더하지 않음 — 다음 snapshot bump 가
            // 카운트 배지 갱신을 처리.
          },
        },
      ),
    );
    return () => {
      for (const u of unsubs) u();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, qc]);
};

// 디테일 페이지 — placeId 단일 구독 (Naver 전용 라우트). 서버는 같은 SSE 로
// 처리하므로 DC 행은 이 hook 으로는 안 오지만 onReview 이벤트가 canonical
// 기반이라 같은 canonical 의 DC review 가 와도 placeId 가 다르면 patch 안 함.
export const useRestaurantSummaryEvents = (
  placeId: string | null,
): { data: RestaurantSummaryProgressType | null } => {
  const [data, setData] = useState<RestaurantSummaryProgressType | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    setData(null);
    if (!placeId) return undefined;
    return summarySseManager.subscribe(
      { kind: 'place', placeId },
      {
      onSnapshot: (snap) => {
        setData(snap);
        // 리스트 캐시도 같이 갱신 — 디테일에서 진행이 발생하면 리스트 행 배지도
        // 함께 stale 해소.
        patchSummaryInListCaches(qc, snap);
      },
      onReview: (ev) => {
        // 자신의 placeId 가 아닌 review (=같은 canonical 의 다른 source) 는 무시.
        if (ev.placeId !== placeId) return;
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

// 실패/구버전 요약을 LLM 큐에 다시 밀어 넣는다. 백엔드 reanalyze API 는
// status='failed' + status='done' AND analysisVersion<현재 만 골라 큐잉하므로
// 멱등 — 같은 버튼을 여러 번 눌러도 진행 중(pending/running)인 행은 건드리지
// 않는다. SSE 가 결과를 라이브로 흘려주므로 별도 invalidate 는 불필요.
export const useReanalyzeRestaurant = () =>
  useMutation({
    mutationFn: (placeId: string) => restaurantApi.reanalyze(placeId),
  });

// Hard-delete a restaurant by placeId. On success the list query is
// invalidated and the cached detail/summary entries for that placeId are
// removed so the row vanishes immediately.
export const useDeleteRestaurant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => restaurantApi.delete(placeId),
    onSuccess: (_data, placeId) => {
      qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
      qc.invalidateQueries({ queryKey: ['restaurant', 'public', 'list'] });
      qc.removeQueries({ queryKey: ['restaurant', placeId] });
    },
  });
};
