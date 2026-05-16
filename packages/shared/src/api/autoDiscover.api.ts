import {
  Routes,
  type AutoDiscoverJobInputType,
  type AutoDiscoverJobSnapshotType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

// 자동 발견 잡 API. 다이닝코드 bulk-save 와 동형 — start/get/cancel + SSE URL 빌더.

export const autoDiscoverApi = {
  start: (input: AutoDiscoverJobInputType) =>
    apiFetch<AutoDiscoverJobSnapshotType>(Routes.AutoDiscover.jobs, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  get: (jobId: string) =>
    apiFetch<AutoDiscoverJobSnapshotType>(Routes.AutoDiscover.job(jobId)),

  cancel: (jobId: string) =>
    apiFetch<void>(Routes.AutoDiscover.job(jobId), { method: 'DELETE' }),
};

// SSE URL — token query 인증.
export const buildAutoDiscoverEventsUrl = async (
  jobId: string,
): Promise<string> => {
  const cfg = getApiConfig();
  const token = (await cfg.getToken?.()) ?? '';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  const qs = params.toString();
  const sep = qs ? '?' : '';
  return `${cfg.baseUrl}${Routes.AutoDiscover.jobEvents(jobId)}${sep}${qs}`;
};
