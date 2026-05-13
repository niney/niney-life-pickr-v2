import {
  Routes,
  type AnalyticsOverviewType,
  type CategoryTreeResultType,
  type GlobalMenuQueryType,
  type GlobalMenuResultType,
  type GlobalMergeJobInputType,
  type GlobalMergeJobSnapshotType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

export const analyticsApi = {
  overview: () => apiFetch<AnalyticsOverviewType>(Routes.Analytics.overview),

  globalMenus: (query: Partial<GlobalMenuQueryType> = {}) => {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.category) params.set('category', query.category);
    if (query.sort) params.set('sort', query.sort);
    if (query.minMentions !== undefined) params.set('minMentions', String(query.minMentions));
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
    if (query.includeUnlinked !== undefined) {
      params.set('includeUnlinked', query.includeUnlinked ? 'true' : 'false');
    }
    const qs = params.toString();
    return apiFetch<GlobalMenuResultType>(
      `${Routes.Analytics.globalMenus}${qs ? `?${qs}` : ''}`,
    );
  },

  categoryTree: () => apiFetch<CategoryTreeResultType>(Routes.Analytics.categoryTree),

  startGlobalMerge: (input: GlobalMergeJobInputType) =>
    apiFetch<GlobalMergeJobSnapshotType>(Routes.Analytics.globalMergeJobs, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getGlobalMergeJob: (jobId: string) =>
    apiFetch<GlobalMergeJobSnapshotType>(Routes.Analytics.globalMergeJob(jobId)),
};

export const buildGlobalMergeJobEventsUrl = async (jobId: string): Promise<string> => {
  const cfg = getApiConfig();
  const token = (await cfg.getToken?.()) ?? '';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  const qs = params.toString();
  const sep = qs ? '?' : '';
  return `${cfg.baseUrl}${Routes.Analytics.globalMergeJobEvents(jobId)}${sep}${qs}`;
};
