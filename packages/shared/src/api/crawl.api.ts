import {
  Routes,
  type CatchtableSearchResponseType,
  type CrawlJobListResultType,
  type CrawlModeType,
  type CrawlSearchResultType,
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
