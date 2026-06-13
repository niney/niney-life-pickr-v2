import {
  Routes,
  type CatchtableSearchResponseType,
  type CatchtableShopDataType,
  type CatchtableShopMenusResponseType,
  type CatchtableShopReviewOverviewResponseType,
  type CrawlJobListResultType,
  type CrawlJobLogsResultType,
  type CrawlLogLevelType,
  type CrawlModeType,
  type CrawlSearchResultType,
  type DiningcodeBulkSaveJobInputType,
  type DiningcodeBulkSaveJobSnapshotType,
  type DiningcodeRegisteredResultType,
  type DiningcodeSearchResponseType,
  type DiningcodeShopDataType,
  type DiningcodeShopReviewsResponseType,
  type SaveDiningcodeShopResultType,
  type SaveTablingShopResultType,
  type SaveTablingPlaceResultType,
  type TablingSearchResponseType,
  type TablingSearchSortType,
  type TablingShopDataType,
  type TablingShopReviewsResponseType,
  type TablingRegisteredResultType,
  type TablingDiscoverResultType,
  type TablingBulkSaveJobInputType,
  type TablingBulkSaveJobSnapshotType,
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

  // 잡 영속 로그 조회 — SSE 의 실시간 'log' 이벤트와 같은 데이터를 DB 에서.
  // 잡 종료 후 패널 재진입 시 fallback, 또는 실시간 누적분 위로 과거 페이지를
  // 더 불러올 때.
  jobLogs: ({
    jobId,
    cursor,
    limit,
    level,
    stage,
  }: {
    jobId: string;
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
      `${Routes.Crawl.jobLogs(jobId)}${sep}${qs}`,
    );
  },

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

  // 정식 /admin/diningcode 페이지 — vRid 다수의 등록 상태 조회. 결과에 없는
  // vRid 는 미등록.
  diningcodeRegistered: (vRids: string[]) => {
    const params = new URLSearchParams({ ids: vRids.join(',') });
    return apiFetch<DiningcodeRegisteredResultType>(
      `${Routes.Crawl.diningcodeRegistered}?${params.toString()}`,
    );
  },

  // 일괄 저장 잡 시작 — vRids 받아서 백그라운드 직렬 저장. 응답은 초기 스냅샷.
  diningcodeBulkSaveStart: (input: DiningcodeBulkSaveJobInputType) =>
    apiFetch<DiningcodeBulkSaveJobSnapshotType>(
      Routes.Crawl.diningcodeBulkSaveJobs,
      { method: 'POST', body: JSON.stringify(input) },
    ),

  diningcodeBulkSaveGet: (jobId: string) =>
    apiFetch<DiningcodeBulkSaveJobSnapshotType>(
      Routes.Crawl.diningcodeBulkSaveJob(jobId),
    ),

  diningcodeBulkSaveCancel: (jobId: string) =>
    apiFetch<void>(Routes.Crawl.diningcodeBulkSaveJob(jobId), { method: 'DELETE' }),

  // 테이블링 키워드 검색 — 사이트맵 전수열거와 별개로 키워드로 partner idx 를
  // 바로 찾는다. q 외엔 옵션. cursor 는 직전 응답의 nextCursor.
  tablingSearch: ({
    q,
    cursor,
    pageSize,
    sort,
  }: {
    q: string;
    cursor?: string | null;
    pageSize?: number | null;
    sort?: TablingSearchSortType | null;
  }) => {
    const params = new URLSearchParams({ q });
    if (cursor) params.set('cursor', cursor);
    if (pageSize != null) params.set('pageSize', String(pageSize));
    if (sort) params.set('sort', sort);
    return apiFetch<TablingSearchResponseType>(
      `${Routes.Crawl.tablingSearch}?${params.toString()}`,
    );
  },

  // 테이블링 가게 상세 — idx 하나로 상세+메뉴+리뷰 첫 페이지 합본(무인증 REST).
  tablingShop: (idx: number) =>
    apiFetch<TablingShopDataType>(Routes.Crawl.tablingShop(String(idx))),

  // 테이블링 리뷰 커서 페이지네이션. cursor 는 직전 응답의 nextCursor.
  tablingShopReviews: (idx: number, cursor?: string | null) => {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    const qs = params.toString();
    const sep = qs ? '?' : '';
    return apiFetch<TablingShopReviewsResponseType>(
      `${Routes.Crawl.tablingShopReviews(String(idx))}${sep}${qs}`,
    );
  },

  // 테이블링 가게를 DB 저장 (+리뷰 persist + AI 큐 + 좌표 기반 로컬 canonical
  // 자동매칭). 응답 동기 — 리뷰 페이지 fetch 끝나야 200.
  tablingShopSave: (idx: number) =>
    apiFetch<SaveTablingShopResultType>(Routes.Crawl.tablingShopSave(String(idx)), {
      method: 'POST',
    }),

  // 미입점 place(JSON-LD 얕은 티어) 저장.
  tablingPlaceSave: (objectId: string) =>
    apiFetch<SaveTablingPlaceResultType>(Routes.Crawl.tablingPlaceSave(objectId), {
      method: 'POST',
    }),

  // 등록됨 배지용 — idx 다수 조회.
  tablingRegistered: (idxs: number[]) => {
    const params = new URLSearchParams({ ids: idxs.join(',') });
    return apiFetch<TablingRegisteredResultType>(
      `${Routes.Crawl.tablingRegistered}?${params.toString()}`,
    );
  },

  // 사이트맵 기반 발견 — tier=shop(partner idx) | place(미입점 objectId, page 1~5).
  tablingDiscover: ({
    tier,
    page,
  }: {
    tier: 'shop' | 'place';
    page?: number | null;
  }) => {
    const params = new URLSearchParams({ tier });
    if (page != null) params.set('page', String(page));
    return apiFetch<TablingDiscoverResultType>(
      `${Routes.Crawl.tablingDiscover}?${params.toString()}`,
    );
  },

  // 테이블링 일괄 저장 잡 시작 — idxs 받아 백그라운드 직렬 저장. 응답은 초기 스냅샷.
  tablingBulkSaveStart: (input: TablingBulkSaveJobInputType) =>
    apiFetch<TablingBulkSaveJobSnapshotType>(Routes.Crawl.tablingBulkSaveJobs, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  tablingBulkSaveGet: (jobId: string) =>
    apiFetch<TablingBulkSaveJobSnapshotType>(Routes.Crawl.tablingBulkSaveJob(jobId)),

  tablingBulkSaveCancel: (jobId: string) =>
    apiFetch<void>(Routes.Crawl.tablingBulkSaveJob(jobId), { method: 'DELETE' }),
};

// 테이블링 일괄 저장 SSE URL — token query.
export const buildTablingBulkSaveEventsUrl = async (
  jobId: string,
): Promise<string> => {
  const cfg = getApiConfig();
  const token = (await cfg.getToken?.()) ?? '';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  const qs = params.toString();
  const sep = qs ? '?' : '';
  return `${cfg.baseUrl}${Routes.Crawl.tablingBulkSaveJobEvents(jobId)}${sep}${qs}`;
};

// 다이닝코드 일괄 저장 SSE URL — token query.
export const buildDiningcodeBulkSaveEventsUrl = async (
  jobId: string,
): Promise<string> => {
  const cfg = getApiConfig();
  const token = (await cfg.getToken?.()) ?? '';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  const qs = params.toString();
  const sep = qs ? '?' : '';
  return `${cfg.baseUrl}${Routes.Crawl.diningcodeBulkSaveJobEvents(jobId)}${sep}${qs}`;
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
