import {
  Routes,
  type ScheduleConfigInputType,
  type ScheduleConfigType,
  type SchedulePreviewInputType,
  type SchedulePreviewResultType,
  type ScheduleRunListType,
  type ScheduleRunType,
} from '@repo/api-contract';
import { apiFetch, getApiConfig } from './client.js';

export const scheduleApi = {
  getConfig: () => apiFetch<ScheduleConfigType>(Routes.Schedule.config),

  updateConfig: (input: ScheduleConfigInputType) =>
    apiFetch<ScheduleConfigType>(Routes.Schedule.config, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  // 지금 실행 — 진행 중이면 서버가 skipped run 을 돌려준다.
  runNow: () =>
    apiFetch<ScheduleRunType>(Routes.Schedule.run, { method: 'POST' }),

  listRuns: () => apiFetch<ScheduleRunListType>(Routes.Schedule.runs),

  preview: (input: SchedulePreviewInputType) =>
    apiFetch<SchedulePreviewResultType>(Routes.Schedule.preview, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

// SSE URL — EventSource 가 헤더를 못 보내므로 token 을 query 로 싣는다.
export const buildScheduleRunEventsUrl = async (): Promise<string> => {
  const cfg = getApiConfig();
  const token = (await cfg.getToken?.()) ?? '';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  const qs = params.toString();
  return `${cfg.baseUrl}${Routes.Schedule.runEvents}${qs ? `?${qs}` : ''}`;
};
