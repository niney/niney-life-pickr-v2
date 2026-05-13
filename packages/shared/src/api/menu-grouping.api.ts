import {
  Routes,
  type MenuGroupRunResultType,
  type MenuGroupingJobInputType,
  type MenuGroupingJobSnapshotType,
  type MenuGroupingRestaurantStatusListType,
  type MenuGroupingRestaurantStatusQueryType,
  type MenuRankingQueryType,
  type MenuRankingResultType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

export const menuGroupingApi = {
  // 단일 식당: distinct nameNorm 들을 LLM 으로 canonical 그룹에 매핑.
  // 동기 응답이라 보통 2~5초 — 큰 식당이면 더 오래.
  groupForRestaurant: (placeId: string) =>
    apiFetch<MenuGroupRunResultType>(Routes.Restaurant.menusGroup(placeId), {
      method: 'POST',
    }),

  // 식당 메뉴 순위. minMentions/sort 옵션 — UI 차트가 sort 만 토글.
  getRanking: (placeId: string, query: Partial<MenuRankingQueryType> = {}) => {
    const params = new URLSearchParams();
    if (query.sort) params.set('sort', query.sort);
    if (query.minMentions !== undefined) {
      params.set('minMentions', String(query.minMentions));
    }
    const qs = params.toString();
    return apiFetch<MenuRankingResultType>(
      `${Routes.Restaurant.menusRanking(placeId)}${qs ? `?${qs}` : ''}`,
    );
  },

  // 관리자 페이지 메인 테이블 — 식당별 정규화 상태. 검색·정렬·페이지 쿼리.
  getRestaurantsStatus: (
    query: Partial<MenuGroupingRestaurantStatusQueryType> = {},
  ) => {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.sort) params.set('sort', query.sort);
    if (query.attention) params.set('attention', 'true');
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
    const qs = params.toString();
    return apiFetch<MenuGroupingRestaurantStatusListType>(
      `${Routes.Analytics.restaurantsStatus}${qs ? `?${qs}` : ''}`,
    );
  },

  // batch 잡 시작 — 여러 식당을 하나의 잡으로 묶어 SSE 로 진행.
  createGroupingJob: (input: MenuGroupingJobInputType) =>
    apiFetch<MenuGroupingJobSnapshotType>(Routes.Analytics.groupingJobs, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // 잡 스냅샷 — 페이지 첫 진입 시 (SSE 보다 먼저) 호출.
  getGroupingJob: (jobId: string) =>
    apiFetch<MenuGroupingJobSnapshotType>(Routes.Analytics.groupingJob(jobId)),
};

// SSE URL 빌더 — EventSource 가 헤더 못 보내므로 token 을 query 로.
export const buildGroupingJobEventsUrl = async (jobId: string): Promise<string> => {
  const cfg = getApiConfig();
  const token = (await cfg.getToken?.()) ?? '';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  const qs = params.toString();
  const sep = qs ? '?' : '';
  return `${cfg.baseUrl}${Routes.Analytics.groupingJobEvents(jobId)}${sep}${qs}`;
};
