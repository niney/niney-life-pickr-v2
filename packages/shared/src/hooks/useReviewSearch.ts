import { useEffect } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ReviewAskInputType,
  ReviewEnrichProgressEventType,
  ReviewEnrichStatusListType,
  ReviewEnrichStatusQueryType,
} from '@repo/api-contract';
import { buildReviewEnrichEventsUrl, reviewSearchApi } from '../api/review-search.api.js';

export const useReviewSearchRestaurants = () =>
  useQuery({
    queryKey: ['review-search', 'restaurants'],
    queryFn: reviewSearchApi.restaurants,
  });

// enrich/ask 는 버튼 트리거 액션(LLM 호출) — mutation 으로.
export const useEnrichReviews = () =>
  useMutation({ mutationFn: (restaurantId: string) => reviewSearchApi.enrich(restaurantId) });

export const useReviewAsk = () =>
  useMutation({ mutationFn: (input: ReviewAskInputType) => reviewSearchApi.ask(input) });

// ── enrich 상태 관리 (어드민) ──
// 진행률은 SSE(useReviewEnrichEvents)로 라이브 push. 폴링은 SSE 끊김 대비 안전망(10s).
export const useReviewEnrichStatus = (query: Partial<ReviewEnrichStatusQueryType> = {}) =>
  useQuery({
    queryKey: ['review-search', 'enrich-status', query.q ?? '', query.page ?? 1, query.pageSize ?? 50],
    queryFn: () => reviewSearchApi.enrichStatus(query),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.items.some((i) => i.inProgress) ? 10000 : false),
  });

// enrich 진행률 SSE 구독 — 'progress' 이벤트로 enrich-status 캐시를 라이브 패치(진행률 %),
// done 시 invalidate 로 최종 검색가능 수 갱신. EventSource 내장 재연결 사용.
export const useReviewEnrichEvents = () => {
  const qc = useQueryClient();
  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    void buildReviewEnrichEventsUrl().then((url) => {
      if (cancelled) return;
      es = new EventSource(url);
      es.addEventListener('progress', (ev) => {
        let e: ReviewEnrichProgressEventType;
        try {
          e = JSON.parse((ev as MessageEvent).data) as ReviewEnrichProgressEventType;
        } catch {
          return;
        }
        qc.setQueriesData<ReviewEnrichStatusListType>(
          { queryKey: ['review-search', 'enrich-status'] },
          (old) =>
            old
              ? {
                  ...old,
                  items: old.items.map((it) =>
                    it.restaurantId === e.restaurantId
                      ? {
                          ...it,
                          inProgress: !e.done,
                          progress: e.done ? null : { processed: e.processed, total: e.total },
                        }
                      : it,
                  ),
                }
              : old,
        );
        if (e.done) void qc.invalidateQueries({ queryKey: ['review-search', 'enrich-status'] });
      });
    });
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [qc]);
};

export const useReviewEnrichBg = () =>
  useMutation({ mutationFn: (restaurantId: string) => reviewSearchApi.enrichBg(restaurantId) });

export const useReviewEnrichPending = () =>
  useMutation({ mutationFn: () => reviewSearchApi.enrichPending() });

// ── 공개 QA (placeId 기반) — 공개 식당 상세에서 사용 ──
// 준비 여부(enrich 됨?) — 가벼운 GET, 탭 진입 시 활성화. LLM 호출 없음.
export const useReviewQaReady = (placeId: string, enabled = true) =>
  useQuery({
    queryKey: ['review-qa', 'ready', placeId],
    queryFn: () => reviewSearchApi.publicQaReady(placeId),
    enabled: enabled && !!placeId,
    staleTime: 60_000,
  });

// 공개 질문 — LLM 파이프라인. 버튼 트리거 mutation.
export const useReviewAskPublic = () =>
  useMutation({
    mutationFn: ({ placeId, query }: { placeId: string; query: string }) =>
      reviewSearchApi.publicAsk(placeId, query),
  });
