import {
  Routes,
  type CrawlJobLogsResultType,
  type CrawlLogLevelType,
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

  // placeId 단위 누적 크롤 로그 — 상세 페이지 "크롤 로그" 아코디언이 호출.
  // 한 가게의 모든 잡(과거 재크롤 포함) 가로지름. cursor pagination.
  crawlLogs: ({
    placeId,
    cursor,
    limit,
    level,
    stage,
  }: {
    placeId: string;
    cursor?: string | null;
    limit?: number | null;
    level?: CrawlLogLevelType | null;
    stage?: string | null;
  }) => {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (limit != null) params.set('limit', String(limit));
    if (level) params.set('level', level);
    if (stage) params.set('stage', stage);
    const qs = params.toString();
    const sep = qs ? '?' : '';
    return apiFetch<CrawlJobLogsResultType>(
      `${Routes.Restaurant.crawlLogs(placeId)}${sep}${qs}`,
    );
  },
};

// Build the SSE endpoint URL for live summary progress. EventSource can't
// carry the auth header, so we tack the JWT onto the query string (same
// pattern as the crawl jobEvents stream). The endpoint multiplexes any
// number of placeIds + canonicalIds over a single connection.
// canonicalId 는 한 가게의 모든 source(Naver+DC) 를 한 번에 구독 — 리스트 화면용.
// placeId 는 단일 Naver 행 — 디테일 페이지용 (기존 흐름 유지).
export const buildSummaryEventsUrl = async (
  keys: { placeIds?: string[]; canonicalIds?: string[] },
): Promise<string> => {
  const cfg = getApiConfig();
  const token = (await cfg.getToken?.()) ?? '';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  for (const pid of keys.placeIds ?? []) params.append('placeId', pid);
  for (const cid of keys.canonicalIds ?? []) params.append('canonicalId', cid);
  const qs = params.toString();
  const sep = qs ? '?' : '';
  return `${cfg.baseUrl}${Routes.Restaurant.summaryEvents}${sep}${qs}`;
};
