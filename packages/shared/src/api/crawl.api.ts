import {
  Routes,
  type CrawlJobListResultType,
  type StartCrawlInputType,
  type StartCrawlResultType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

export const crawlApi = {
  start: (url: string) =>
    apiFetch<StartCrawlResultType>(Routes.Crawl.naverPlace, {
      method: 'POST',
      body: JSON.stringify({ url } satisfies StartCrawlInputType),
    }),

  list: () => apiFetch<CrawlJobListResultType>(Routes.Crawl.jobs),

  cancel: (jobId: string) =>
    apiFetch<void>(Routes.Crawl.job(jobId), { method: 'DELETE' }),
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
