import { useEffect, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  CrawlLogLevelType,
  PublicVisitorReviewType,
  RestaurantDetailType,
  RestaurantListQueryType,
  RestaurantListResultType,
  RestaurantPublicListQueryType,
  RestaurantPublicListResultType,
  RestaurantPublicReviewsResultType,
  RestaurantPublicReviewSentimentType,
  RestaurantPublicReviewSortType,
  RestaurantRankingQueryType,
  RestaurantSourceSummaryType,
  RestaurantSummaryLogEventType,
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
// 갱신한다. 공개 list 의 queryKey 는 URL 파라미터마다 달라 여러 인스턴스가
// 동시에 살아 있을 수 있어 setQueriesData 로 prefix 매칭.
//
// 두 list 의 갱신 전략이 다르다:
//   - 어드민 list: 행마다 sources[] 분리 카운트가 있으므로 한 source 만 새 값
//     으로 교체하고 recomputeCanonicalAggregates 로 합산 재계산. prev 불필요.
//   - 공개 list: 행은 placeId 키 1개에 두 출처의 합산 카운트만 들고 있다 (서버
//     머지 결과). 한 source 의 새 값으로 통째 덮어쓰면 다른 source 의 카운트가
//     0 으로 빠지므로, prev snapshot 과 비교해 변경된 source 의 delta 만 합산
//     행에 가감한다. 첫 catch-up snapshot 은 prev=null → delta=0 → 덮어쓰지 않음.
const patchSummaryInListCaches = (
  qc: QueryClient,
  snap: RestaurantSummarySnapshotEventType,
  prev: RestaurantSummarySnapshotEventType | null,
): void => {
  // 어드민 list 가 페이징되면서 queryKey 가 ['restaurant','list', page, pageSize,
  // sort] 처럼 가변이라 prefix 매칭(setQueriesData)으로 모든 페이지 캐시를 갱신.
  qc.setQueriesData<RestaurantListResultType | undefined>(
    { queryKey: ['restaurant', 'list'] },
    (prevCache) => {
      if (!prevCache) return prevCache;
      const items = prevCache.items.map((item) => {
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
      return { ...prevCache, items };
    },
  );
  // 공개 list 는 placeId 가 key — DC source 이벤트(placeId=null)는 공개 list
  // 행에 직접 매칭 안 됨. 단 그런 이벤트도 합산 카운트의 변경분(예: DC 쪽 done
  // +1)을 같은 canonical 의 Naver placeId 행에 반영해야 라이브가 정확.
  const targetPlaceId =
    snap.placeId ?? prev?.placeId ?? null;
  // prev/snap 모두 placeId 가 없으면 어느 행에 적용할지 알 수 없음 — skip.
  // (DC source 의 첫 catch-up 이 이 케이스. 다음 이벤트부터는 prev 가 채워져
  // 정상 delta 적용.)
  const dTotal = snap.totalReviews - (prev?.totalReviews ?? snap.totalReviews);
  const dPending = snap.pending - (prev?.pending ?? snap.pending);
  const dRunning = snap.running - (prev?.running ?? snap.running);
  const dDone = snap.done - (prev?.done ?? snap.done);
  const dFailed = snap.failed - (prev?.failed ?? snap.failed);
  const allZero =
    dTotal === 0 && dPending === 0 && dRunning === 0 && dDone === 0 && dFailed === 0;
  if (allZero) return;
  // delta 적용은 같은 canonical 의 어떤 placeId 행에 해야 한다. 공개 list 는
  // Naver placeId 만 노출하므로 그 placeId 를 알아야 함. snap.placeId 가 있으면
  // 그것을, 없으면 prev.placeId (DC 이벤트는 placeId=null 이지만 prev 는 같은
  // canonical 의 같은 source 라 둘 다 null 일 수밖에 없음). 그래서 DC 이벤트로
  // 공개 list 를 갱신하려면 canonicalId → placeId 역매핑이 필요하지만 — 본
  // hook 시점에는 알 수 없으므로 우선 patch 안 함 (재진입/staleTime 만료 시
  // 정상 fetch 로 합산값 갱신). Naver 이벤트만 안전하게 라이브 갱신한다.
  if (targetPlaceId === null) return;
  const placeId = targetPlaceId;
  qc.setQueriesData<RestaurantPublicListResultType | undefined>(
    { queryKey: ['restaurant', 'public', 'list'] },
    (prevCache) => {
      if (!prevCache) return prevCache;
      const items = prevCache.items.map((item) =>
        item.placeId === placeId
          ? {
              ...item,
              totalReviews: Math.max(0, item.totalReviews + dTotal),
              summaryPending: Math.max(0, item.summaryPending + dPending),
              summaryRunning: Math.max(0, item.summaryRunning + dRunning),
              summaryDone: Math.max(0, item.summaryDone + dDone),
              summaryFailed: Math.max(0, item.summaryFailed + dFailed),
            }
          : item,
      );
      return { ...prevCache, items };
    },
  );
};

// Crawled-restaurant list. Query is mostly static — invalidate from the
// restaurants page after a crawl completes (or after recrawl/update kicks
// off, since the row stays present but counts change).
//
// 페이징 — queryKey 에 limit/offset/sort 가 들어가서 페이지/정렬 변경마다 다른
// 캐시 인스턴스. placeholderData 로 페이지 전환 시 깜빡임 방지. SSE patch 는
// 모든 인스턴스를 prefix 매칭으로 갱신 (patchSummaryInListCaches 참고).
export const useRestaurantList = (
  query: Partial<RestaurantListQueryType> = {},
) =>
  useQuery({
    queryKey: [
      'restaurant',
      'list',
      query.limit ?? 25,
      query.offset ?? 0,
      query.sort ?? 'recent',
    ],
    queryFn: () => restaurantApi.list(query),
    placeholderData: (prev) => prev,
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

// 공개 식당 방문자 리뷰 페이지네이션. detail 응답엔 reviewsFirstPage(10) 만
// 동봉되므로 ReviewsTab 진입 후 추가 페이지를 lazy 로 가져온다. 첫 페이지는
// detail.reviewsFirstPage 를 initialData 로 seed — sentiment='all', sort='recent'
// 일 때만 (detail 동봉 페이로드의 필터 상태와 일치). 다른 chip 으로 시작하면
// seed 무효, 첫 페이지부터 fetch.
const REVIEWS_PAGE_SIZE = 10;

export const useRestaurantPublicReviews = (
  placeId: string | null,
  filters: {
    sentiment: RestaurantPublicReviewSentimentType;
    sort: RestaurantPublicReviewSortType;
  },
  seed?: { items: PublicVisitorReviewType[]; total: number },
) => {
  const canSeed =
    !!seed && filters.sentiment === 'all' && filters.sort === 'recent';
  return useInfiniteQuery<
    RestaurantPublicReviewsResultType,
    Error,
    { pages: RestaurantPublicReviewsResultType[]; pageParams: number[] },
    readonly unknown[],
    number
  >({
    queryKey: [
      'restaurant',
      'public',
      'reviews',
      placeId,
      filters.sentiment,
      filters.sort,
    ] as const,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      if (!placeId) throw new Error('placeId required');
      return restaurantApi.publicReviews(placeId, {
        offset: pageParam,
        limit: REVIEWS_PAGE_SIZE,
        sentiment: filters.sentiment,
        sort: filters.sort,
      });
    },
    getNextPageParam: (lastPage, _all, lastPageParam) => {
      const nextOffset = (lastPageParam ?? 0) + lastPage.items.length;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    enabled: !!placeId,
    staleTime: 60_000,
    initialData: canSeed
      ? {
          pages: [{ items: seed!.items, total: seed!.total }],
          pageParams: [0],
        }
      : undefined,
  });
};

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
          onSnapshot: (snap, prev) => {
            patchSummaryInListCaches(qc, snap, prev);
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
          onSnapshot: (snap, prev) => {
            patchSummaryInListCaches(qc, snap, prev);
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
//
// onLog 콜백을 넘기면 잡 단계별 로그도 같은 connection 으로 수신. 어드민 패널
// 의 "로그" 탭이 요약 단계 로그를 누적하기 위한 통로. 미지정 시 log 이벤트는
// drop 된다.
export const useRestaurantSummaryEvents = (
  placeId: string | null,
  opts?: { onLog?: (ev: RestaurantSummaryLogEventType) => void },
): { data: RestaurantSummaryProgressType | null } => {
  const [data, setData] = useState<RestaurantSummaryProgressType | null>(null);
  const qc = useQueryClient();
  // onLog 콜백은 상위에서 매 렌더마다 새로 생성될 수 있어 ref 로 안정화. 그래야
  // useEffect 의존성에서 빼고도 최신 콜백을 호출 가능.
  const onLogRef = useRef(opts?.onLog);
  useEffect(() => {
    onLogRef.current = opts?.onLog;
  }, [opts?.onLog]);

  useEffect(() => {
    setData(null);
    if (!placeId) return undefined;
    return summarySseManager.subscribe(
      { kind: 'place', placeId },
      {
      onSnapshot: (snap, prev) => {
        setData(snap);
        // 리스트 캐시도 같이 갱신 — 디테일에서 진행이 발생하면 리스트 행 배지도
        // 함께 stale 해소.
        patchSummaryInListCaches(qc, snap, prev);
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
      onLog: (ev) => {
        if (ev.placeId !== placeId) return;
        onLogRef.current?.(ev);
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

// 이 가게의 진행 중인 요약 작업 중지. queued/pending 행이 'cancelled' 로
// 마킹되고 chain 이 끊긴다. 진행 중인 청크는 끝까지 흘러간다.
export const useCancelSummary = () =>
  useMutation({
    mutationFn: (placeId: string) => restaurantApi.cancelSummary(placeId),
  });

// 직전에 중지된(cancelled) 행만 다시 큐잉. UI 가 SSE 로 새 'queued' 카운트
// 와 곧 이어지는 진행 전환을 받아 갱신하므로 별도 invalidate 불필요.
export const useResumeSummary = () =>
  useMutation({
    mutationFn: (placeId: string) => restaurantApi.resumeSummary(placeId),
  });

// placeId 단위 크롤 로그 — 상세 페이지 "크롤 로그" 아코디언 전용. 한 가게의
// 누적 잡 로그를 cursor pagination 으로. 아코디언이 닫혀 있으면 enabled=false
// 로 fetch 안 함.
export interface UseRestaurantCrawlLogsArgs {
  placeId: string | null;
  level?: CrawlLogLevelType | null;
  stage?: string | null;
  pageSize?: number;
  enabled?: boolean;
}

export const useRestaurantCrawlLogs = ({
  placeId,
  level = null,
  stage = null,
  pageSize = 100,
  enabled = true,
}: UseRestaurantCrawlLogsArgs) =>
  useInfiniteQuery({
    queryKey: ['restaurant', 'crawl-logs', placeId, level, stage, pageSize],
    enabled: enabled && !!placeId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      restaurantApi.crawlLogs({
        placeId: placeId as string,
        cursor: pageParam ?? null,
        limit: pageSize,
        level: level ?? null,
        stage: stage ?? null,
      }),
    getNextPageParam: (last) => last.nextCursor,
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
