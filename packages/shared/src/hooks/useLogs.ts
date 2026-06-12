import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  OperationLogEntryType,
  OperationLogLevelType,
  UpdateLogConfigInputType,
} from '@repo/api-contract';
import {
  logsApi,
  type ListOperationRunsArgs,
} from '../api/logs.api.js';

// 작업 로그 화면용 훅 모음. crawl 외 feature 는 SSE 채널이 없으므로
// 진행 중인 run/보고서는 폴링(refetchInterval)으로 따라간다.

// run 목록 — running 항목이 보이는 동안만 5초 폴링 (종료되면 자동 중단).
export const useOperationRuns = (query: ListOperationRunsArgs = {}) =>
  useQuery({
    queryKey: [
      'logs',
      'runs',
      {
        page: query.page ?? null,
        limit: query.limit ?? null,
        feature: query.feature ?? null,
        status: query.status ?? null,
      },
    ],
    queryFn: () => logsApi.listRuns(query),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      return data.items.some((run) => run.status === 'running') ? 5000 : false;
    },
  });

// run 상세 + 보고서 — run 이 진행 중이거나 보고서 분석이 끝나지 않은 동안
// 3초 폴링. '다시 분석' 직후 running 보고서를 이 폴링이 완료로 바꿔준다.
export const useOperationRun = (runId: string | null) =>
  useQuery({
    queryKey: ['logs', 'runs', runId],
    enabled: !!runId,
    queryFn: () => logsApi.getRun(runId as string),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      const reportActive =
        data.report?.status === 'pending' || data.report?.status === 'running';
      return data.run.status === 'running' || reportActive ? 3000 : false;
    },
  });

export interface UseOperationRunLogsArgs {
  level?: OperationLogLevelType | null;
  // 한 페이지 크기. 서버 max 500.
  pageSize?: number;
  enabled?: boolean;
}

// run 의 스텝 로그 — cursor 무한스크롤. 응답은 최신순(createdAt DESC). UI 는
// 표시 시 다시 뒤집어 시간 오름차순으로 보여줄 수 있음.
export const useOperationRunLogs = (
  runId: string | null,
  { level = null, pageSize = 100, enabled = true }: UseOperationRunLogsArgs = {},
) =>
  useInfiniteQuery({
    queryKey: ['logs', 'runs', runId, 'logs', level, pageSize],
    enabled: enabled && !!runId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      logsApi.getRunLogs({
        runId: runId as string,
        cursor: pageParam ?? null,
        limit: pageSize,
        level: level ?? null,
      }),
    getNextPageParam: (last) => last.nextCursor,
  });

// 무한 페이지 결과를 평탄한 entry 배열로. UI 표시용 헬퍼.
export const flattenOperationLogPages = (
  data:
    | {
        pages: Array<{ logs: OperationLogEntryType[] }>;
      }
    | undefined,
): OperationLogEntryType[] => {
  if (!data) return [];
  return data.pages.flatMap((p) => p.logs);
};

// 실패 run 수동 재분석. ok=false(미설정/중복 등)도 200 으로 돌아오므로
// onSuccess 에서 분기 없이 무효화 — 상세 폴링이 보고서 상태를 이어받는다.
export const useAnalyzeRun = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => logsApi.analyzeRun(runId),
    onSuccess: (_result, runId) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['logs', 'runs', runId] }),
        qc.invalidateQueries({ queryKey: ['logs', 'runs'] }),
      ]),
  });
};

export const useLogConfig = () =>
  useQuery({
    queryKey: ['logs', 'config'],
    queryFn: logsApi.getLogConfig,
  });

export const useUpdateLogConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLogConfigInputType) =>
      logsApi.updateLogConfig(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['logs', 'config'] }),
  });
};
