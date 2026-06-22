import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type { ReviewAskInputType, ReviewEnrichStatusQueryType } from '@repo/api-contract';
import { reviewSearchApi } from '../api/review-search.api.js';

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
// 진행 중(inProgress)인 식당이 있으면 폴링해 진척을 라이브로 보여준다.
export const useReviewEnrichStatus = (query: Partial<ReviewEnrichStatusQueryType> = {}) =>
  useQuery({
    queryKey: ['review-search', 'enrich-status', query.q ?? '', query.page ?? 1, query.pageSize ?? 50],
    queryFn: () => reviewSearchApi.enrichStatus(query),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.items.some((i) => i.inProgress) ? 4000 : false),
  });

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
