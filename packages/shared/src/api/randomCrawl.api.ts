import {
  Routes,
  type RandomCrawlConfigInputType,
  type RandomCrawlConfigType,
  type RandomCrawlPreviewInputType,
  type RandomCrawlPreviewResultType,
  type RandomCrawlRunListType,
  type RandomCrawlRunType,
  type RegionDongListType,
  type RegionTreeType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

export const randomCrawlApi = {
  getConfig: () => apiFetch<RandomCrawlConfigType>(Routes.RandomCrawl.config),

  updateConfig: (input: RandomCrawlConfigInputType) =>
    apiFetch<RandomCrawlConfigType>(Routes.RandomCrawl.config, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  // 지금 실행 — 진행 중이면 서버가 skipped run 을 돌려준다.
  runNow: () =>
    apiFetch<RandomCrawlRunType>(Routes.RandomCrawl.run, { method: 'POST' }),

  listRuns: () => apiFetch<RandomCrawlRunListType>(Routes.RandomCrawl.runs),

  preview: (input: RandomCrawlPreviewInputType) =>
    apiFetch<RandomCrawlPreviewResultType>(Routes.RandomCrawl.preview, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // 전체 시도→시군구 트리(동 제외).
  getRegions: () => apiFetch<RegionTreeType>(Routes.RandomCrawl.regions),

  // 특정 시군구의 동 목록.
  getRegionDongs: (sido: string, sigungu: string) => {
    const qs = new URLSearchParams({ sido, sigungu }).toString();
    return apiFetch<RegionDongListType>(`${Routes.RandomCrawl.regionDongs}?${qs}`);
  },
};

// SSE URL — EventSource 가 헤더를 못 보내므로 token 을 query 로 싣는다.
export const buildRandomCrawlRunEventsUrl = async (): Promise<string> => {
  const cfg = getApiConfig();
  const token = (await cfg.getToken?.()) ?? '';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  const qs = params.toString();
  return `${cfg.baseUrl}${Routes.RandomCrawl.runEvents}${qs ? `?${qs}` : ''}`;
};
