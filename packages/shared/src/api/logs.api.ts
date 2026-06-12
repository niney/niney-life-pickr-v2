import {
  Routes,
  type AnalyzeRunResultType,
  type LogConfigType,
  type OperationFeatureType,
  type OperationLogLevelType,
  type OperationLogsResultType,
  type OperationRunDetailType,
  type OperationRunListType,
  type OperationRunStatusType,
  type UpdateLogConfigInputType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

export interface ListOperationRunsArgs {
  page?: number | null;
  limit?: number | null;
  feature?: OperationFeatureType | null;
  status?: OperationRunStatusType | null;
}

export interface OperationRunLogsArgs {
  runId: string;
  cursor?: string | null;
  limit?: number | null;
  level?: OperationLogLevelType | null;
}

export const logsApi = {
  // run 목록 — feature/status 필터 + 페이지네이션. startedAt DESC.
  listRuns: ({ page, limit, feature, status }: ListOperationRunsArgs = {}) => {
    const params = new URLSearchParams();
    if (page != null) params.set('page', String(page));
    if (limit != null) params.set('limit', String(limit));
    if (feature) params.set('feature', feature);
    if (status) params.set('status', status);
    const qs = params.toString();
    const sep = qs ? '?' : '';
    return apiFetch<OperationRunListType>(`${Routes.Logs.runs}${sep}${qs}`);
  },

  getRun: (id: string) => apiFetch<OperationRunDetailType>(Routes.Logs.run(id)),

  // run 의 스텝 로그 — cursor pagination, 최신순(createdAt DESC). debug 포함
  // 4종 level 필터.
  getRunLogs: ({ runId, cursor, limit, level }: OperationRunLogsArgs) => {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (limit != null) params.set('limit', String(limit));
    if (level) params.set('level', level);
    const qs = params.toString();
    const sep = qs ? '?' : '';
    return apiFetch<OperationLogsResultType>(
      `${Routes.Logs.runLogs(runId)}${sep}${qs}`,
    );
  },

  // 실패 run 수동 재분석 — 수락 시 ok=true + running 스냅샷이 즉시 돌아오고,
  // 완료는 run 상세 폴링으로 확인. 거절(미설정/중복 등)은 ok=false 분기.
  analyzeRun: (id: string) =>
    apiFetch<AnalyzeRunResultType>(Routes.Logs.analyze(id), { method: 'POST' }),

  getLogConfig: () => apiFetch<LogConfigType>(Routes.Logs.config),

  updateLogConfig: (input: UpdateLogConfigInputType) =>
    apiFetch<LogConfigType>(Routes.Logs.config, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
};
