import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  OperationLogEntryType,
  OperationLogLevelType,
  OperationRunDetailType,
  OperationRunListType,
  UpdateLogConfigInputType,
} from '@repo/api-contract';
import {
  logsApi,
  type ListOperationRunsArgs,
} from '../api/logs.api.js';

// 작업 로그 화면용 훅 모음. crawl 외 feature 는 SSE 채널이 없으므로
// 진행 중인 run/보고서는 폴링(refetchInterval)으로 따라간다.

// ── 폴링 주기 ───────────────────────────────────────────────────────
// 갓 시작한 run 은 빠르게, 오래 running 인 채로 남은 run 은 느리게 따라간다. 마감이
// 누락된 run·응답 없는 분석은 서버 부팅 sweep 전까지 running/pending 으로 남는데,
// 그동안 화면을 켜 두면 빠른 주기 요청이 끝없이 나간다. 멈추지 않고 늦추기만 하는
// 건 스케줄·전역 머지 같은 장시간 잡이 실제로 오래 돌 수 있어서다.
const SLOW_POLL_MS = 30_000;
// 시작한 지 이보다 오래된 running run 은 느린 주기로 본다.
export const OPERATION_RUN_SLOW_AFTER_MS = 30 * 60_000;
// 보고서(pending/running)가 이 시간 넘게 갱신되지 않으면 멈춘 것으로 본다 — 상세
// 화면이 '다시 분석' 버튼을 다시 풀어 주는 기준과 같은 값.
export const OPERATION_REPORT_STALL_MS = 10 * 60_000;

const isWithin = (iso: string, windowMs: number, now: number): boolean => {
  const at = new Date(iso).getTime();
  return Number.isFinite(at) && now - at < windowMs;
};

// run 목록 폴링 주기 — running 행이 안 보이면 false(중단).
export const operationRunsPollInterval = (
  data: Pick<OperationRunListType, 'items'> | undefined,
  now: number = Date.now(),
): number | false => {
  if (!data) return false;
  const running = data.items.filter((run) => run.status === 'running');
  if (running.length === 0) return false;
  return running.some((run) => isWithin(run.startedAt, OPERATION_RUN_SLOW_AFTER_MS, now))
    ? 5000
    : SLOW_POLL_MS;
};

// run 상세 폴링 주기 — run 도 보고서도 끝났으면 false(중단).
export const operationRunPollInterval = (
  data: OperationRunDetailType | undefined,
  now: number = Date.now(),
): number | false => {
  if (!data) return false;
  const { run, report } = data;
  const runActive = run.status === 'running';
  const reportActive = report?.status === 'pending' || report?.status === 'running';
  if (!runActive && !reportActive) return false;
  const fresh =
    (runActive && isWithin(run.startedAt, OPERATION_RUN_SLOW_AFTER_MS, now)) ||
    (reportActive && !!report && isWithin(report.updatedAt, OPERATION_REPORT_STALL_MS, now));
  return fresh ? 3000 : SLOW_POLL_MS;
};

// run 목록 — running 항목이 보이는 동안만 5초 폴링 (종료되면 자동 중단, 오래된
// running 뿐이면 30초). 페이지·필터를 바꿀 때는 이전 목록을 둔 채 새로 받는다 —
// 목록이 스피너로 접혔다 펴지며 스크롤이 튀지 않게.
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
    placeholderData: keepPreviousData,
    refetchInterval: (q) => operationRunsPollInterval(q.state.data),
  });

// run 상세 + 보고서 — run 이 진행 중이거나 보고서 분석이 끝나지 않은 동안
// 3초 폴링(오래 멈춰 있으면 30초). '다시 분석' 직후 running 보고서를 이 폴링이
// 완료로 바꿔준다.
export const useOperationRun = (runId: string | null) =>
  useQuery({
    queryKey: ['logs', 'runs', runId],
    enabled: !!runId,
    queryFn: () => logsApi.getRun(runId as string),
    refetchInterval: (q) => operationRunPollInterval(q.state.data),
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
    // 같은 run 에서 레벨·페이지 크기만 바뀔 때는 이전 목록을 둔 채 새로 받는다.
    // run 이 바뀔 때는 남의 로그가 잠깐 보이지 않게 비운다.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === runId ? previousData : undefined,
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
// 무효화는 한 번만, 스텝 로그 무한 쿼리(['logs','runs',id,'logs',…])는 빼고 한다.
// 상세 키와 ['logs','runs'] 를 따로 부르면 겹치는 쿼리의 요청이 취소·재시작돼 두
// 번씩 나가고, 분석이 바꾸지 않는 스텝 로그까지 불러온 페이지 수만큼 다시 받는다.
export const useAnalyzeRun = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => logsApi.analyzeRun(runId),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ['logs', 'runs'],
        predicate: (query) => query.queryKey[3] !== 'logs',
      }),
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
