import {
  Routes,
  type CrawlJobLogsResultType,
  type CrawlLogLevelType,
  type PublicVisitorReviewType,
  type RestaurantCancelSummaryResultType,
  type RestaurantDeleteResultType,
  type RestaurantDetailType,
  type RestaurantInsightsType,
  type RestaurantListQueryType,
  type RestaurantListResultType,
  type RestaurantPublicDetailType,
  type RestaurantPublicListQueryType,
  type RestaurantPublicListResultType,
  type RestaurantPublicReviewsQueryType,
  type RestaurantPublicReviewsResultType,
  type RestaurantRankingQueryType,
  type RestaurantRankingResultType,
  type RestaurantReanalyzeResultType,
  type RestaurantResumeSummaryResultType,
  type RestaurantSummaryProgressType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

// prod 백엔드 배포 전 임시 호환. 옛 응답은 `reviews: PublicVisitorReview[]` 한
// 필드에 전체 reviews 를 담아 보낸다. 새 클라이언트는 `reviewsFirstPage` +
// `reviewCounts` 를 기대하므로, 옛 응답을 새 모양으로 평탄화한다.
// prod 배포 완료 후 이 어댑터는 제거. publicReviews 새 endpoint 가 옛 서버에는
// 없어 chip/sort 변경 시 추가 fetch 는 404 — ReviewsTab 의 첫 페이지(seed) 만
// 보장된다.
const adaptPublicDetailResponse = (
  raw: RestaurantPublicDetailType & { reviews?: PublicVisitorReviewType[] },
): RestaurantPublicDetailType => {
  if (raw.reviewsFirstPage && raw.reviewCounts) return raw;
  const reviews = raw.reviews ?? [];
  let positive = 0;
  let negative = 0;
  for (const r of reviews) {
    if (r.analysis?.sentiment === 'positive') positive += 1;
    else if (r.analysis?.sentiment === 'negative') negative += 1;
  }
  return {
    ...raw,
    reviewsFirstPage: raw.reviewsFirstPage ?? reviews,
    reviewCounts: raw.reviewCounts ?? {
      all: reviews.length,
      positive,
      negative,
    },
  };
};

export const restaurantApi = {
  list: (query: Partial<RestaurantListQueryType> = {}) => {
    const params = new URLSearchParams();
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.offset !== undefined) params.set('offset', String(query.offset));
    if (query.sort) params.set('sort', query.sort);
    const qs = params.toString();
    return apiFetch<RestaurantListResultType>(
      `${Routes.Restaurant.list}${qs ? `?${qs}` : ''}`,
    );
  },

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

  publicByPlaceId: async (placeId: string): Promise<RestaurantPublicDetailType> => {
    const raw = await apiFetch<
      RestaurantPublicDetailType & { reviews?: PublicVisitorReviewType[] }
    >(Routes.Restaurant.publicByPlaceId(placeId));
    return adaptPublicDetailResponse(raw);
  },

  // 방문자 리뷰 페이지네이션. 첫 페이지는 detail.reviewsFirstPage 로 동봉돼
  // 오므로 useInfiniteQuery 의 첫 페이지 seed 로 쓰고, 이 함수는 2 페이지부터.
  publicReviews: (placeId: string, query: Partial<RestaurantPublicReviewsQueryType> = {}) => {
    const params = new URLSearchParams();
    if (query.offset !== undefined) params.set('offset', String(query.offset));
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.sentiment) params.set('sentiment', query.sentiment);
    if (query.sort) params.set('sort', query.sort);
    if (query.tip) params.set('tip', query.tip);
    if (query.menu) params.set('menu', query.menu);
    const qs = params.toString();
    return apiFetch<RestaurantPublicReviewsResultType>(
      `${Routes.Restaurant.publicReviews(placeId)}${qs ? `?${qs}` : ''}`,
    );
  },

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

  // 이 가게의 진행 중인 요약 작업 중지. queued/pending 행을 'cancelled' 로
  // 마킹 + chain 클리어. 진행 중 청크는 끝까지 흘러간다.
  cancelSummary: (placeId: string) =>
    apiFetch<RestaurantCancelSummaryResultType>(
      Routes.Restaurant.cancelSummary(placeId),
      { method: 'POST' },
    ),

  // 중지(cancelled)된 행만 골라 다시 큐잉. failed 행은 손대지 않으므로
  // reanalyze 와 명확히 분리된 의도 — "내가 멈췄던 것만 이어서".
  resumeSummary: (placeId: string) =>
    apiFetch<RestaurantResumeSummaryResultType>(
      Routes.Restaurant.resumeSummary(placeId),
      { method: 'POST' },
    ),

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
