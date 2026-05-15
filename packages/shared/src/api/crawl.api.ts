import {
  Routes,
  type CatchtableSearchResponseType,
  type CatchtableShopDataType,
  type CatchtableShopMenusResponseType,
  type CatchtableShopReviewOverviewResponseType,
  type CrawlJobListResultType,
  type CrawlModeType,
  type CrawlSearchResultType,
  type DiningcodeSearchResponseType,
  type DiningcodeShopDataType,
  type DiningcodeShopReviewsResponseType,
  type SaveDiningcodeShopResultType,
  type StartCrawlResultType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

export interface StartCrawlArgs {
  url: string;
  mode?: CrawlModeType;
}

export const crawlApi = {
  start: ({ url, mode = 'create' }: StartCrawlArgs) =>
    apiFetch<StartCrawlResultType>(Routes.Crawl.naverPlace, {
      method: 'POST',
      body: JSON.stringify({ url, mode }),
    }),

  list: () => apiFetch<CrawlJobListResultType>(Routes.Crawl.jobs),

  cancel: (jobId: string) =>
    apiFetch<void>(Routes.Crawl.job(jobId), { method: 'DELETE' }),

  search: ({ q, bbox }: { q: string; bbox?: string | null }) => {
    const params = new URLSearchParams({ q });
    if (bbox) params.set('bbox', bbox);
    return apiFetch<CrawlSearchResultType>(
      `${Routes.Crawl.search}?${params.toString()}`,
    );
  },

  // 캐치테이블 키워드 검색 — 어드민 검증 페이지 전용. q 외엔 모두 옵션.
  catchtableSearch: ({
    q,
    offset,
    limit,
    contractedOnly,
    lat,
    lon,
  }: {
    q: string;
    offset?: string | null;
    limit?: number | null;
    contractedOnly?: boolean | null;
    lat?: number | null;
    lon?: number | null;
  }) => {
    const params = new URLSearchParams({ q });
    if (offset) params.set('offset', offset);
    if (limit != null) params.set('limit', String(limit));
    if (contractedOnly != null) params.set('contractedOnly', String(contractedOnly));
    if (lat != null) params.set('lat', String(lat));
    if (lon != null) params.set('lon', String(lon));
    return apiFetch<CatchtableSearchResponseType>(
      `${Routes.Crawl.catchtableSearch}?${params.toString()}`,
    );
  },

  // 캐치테이블 가게 상세 (가벼운 미리보기). shopRef 만 받음.
  catchtableShop: (shopRef: string) =>
    apiFetch<CatchtableShopDataType>(Routes.Crawl.catchtableShop(shopRef)),

  catchtableShopMenus: (shopRef: string) =>
    apiFetch<CatchtableShopMenusResponseType>(
      Routes.Crawl.catchtableShopMenus(shopRef),
    ),

  catchtableShopReviewOverview: (shopRef: string) =>
    apiFetch<CatchtableShopReviewOverviewResponseType>(
      Routes.Crawl.catchtableShopReviewOverview(shopRef),
    ),

  // 다이닝코드 키워드 검색 — 어드민 /diningcode-test 페이지 전용. q 외엔 옵션.
  diningcodeSearch: ({
    q,
    from,
    size,
    order,
    lat,
    lng,
    distance,
  }: {
    q: string;
    from?: number | null;
    size?: number | null;
    order?: 'r_score' | 'score' | 'review' | 'distance' | null;
    lat?: number | null;
    lng?: number | null;
    distance?: number | null;
  }) => {
    const params = new URLSearchParams({ q });
    if (from != null) params.set('from', String(from));
    if (size != null) params.set('size', String(size));
    if (order) params.set('order', order);
    if (lat != null) params.set('lat', String(lat));
    if (lng != null) params.set('lng', String(lng));
    if (distance != null) params.set('distance', String(distance));
    return apiFetch<DiningcodeSearchResponseType>(
      `${Routes.Crawl.diningcodeSearch}?${params.toString()}`,
    );
  },

  // 다이닝코드 가게 상세. vRid 만 받으면 메뉴·사진·리뷰 첫 페이지·블로그·평점
  // 분포 모두 한 방에. UI 는 별도 lazy fetch 필요 없음.
  diningcodeShop: (vRid: string) =>
    apiFetch<DiningcodeShopDataType>(Routes.Crawl.diningcodeShop(vRid)),

  // 다이닝코드 리뷰 페이지네이션. 상세 페이지의 "더 보기" 클릭 시.
  diningcodeShopReviews: (vRid: string, page: number) => {
    const params = new URLSearchParams({ page: String(page) });
    return apiFetch<DiningcodeShopReviewsResponseType>(
      `${Routes.Crawl.diningcodeShopReviews(vRid)}?${params.toString()}`,
    );
  },

  // 다이닝코드 가게를 DB 에 저장 (+ 모든 리뷰 페이지 끌어와 persist + AI 분석 큐잉).
  // 응답은 동기. 평균 가게당 수 초. AI 분석은 백그라운드.
  diningcodeShopSave: (vRid: string) =>
    apiFetch<SaveDiningcodeShopResultType>(Routes.Crawl.diningcodeShopSave(vRid), {
      method: 'POST',
    }),
};

// Build the SSE endpoint URL with the auth token in the query string. The
// SSE route accepts ?token= because EventSource can't carry custom headers
// (no Authorization).
export const buildJobEventsUrl = async (jobId: string): Promise<string> => {
  const cfg = getApiConfig();
  const token = (await cfg.getToken?.()) ?? '';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  const qs = params.toString();
  const sep = qs ? '?' : '';
  return `${cfg.baseUrl}${Routes.Crawl.jobEvents(jobId)}${sep}${qs}`;
};
