import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileSearch,
  GitBranch,
  KeyRound,
  Loader2,
  RefreshCw,
  ScrollText,
  XCircle,
} from 'lucide-react';
import {
  ApiError,
  flattenOperationLogPages,
  useAnalyzeRun,
  useOperationRun,
  useOperationRunLogs,
} from '@repo/shared';
import type {
  OperationLogLevelType,
  OperationReportSeverityType,
  OperationReportType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { cn } from '~/lib/utils';
import {
  FEATURE_LABEL,
  RunStatusBadge,
  formatDuration,
  triggerLabel,
} from './AdminLogsPage';

// JobLogTab 의 level 배지 톤 재사용 + debug 추가 (DB 전용 level — 가장 옅게).
const LEVEL_BADGE: Record<OperationLogLevelType, string> = {
  debug: 'bg-muted text-muted-foreground',
  info: 'bg-secondary text-secondary-foreground',
  warn: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  error: 'bg-destructive/20 text-destructive',
};

const SEVERITY_BADGE: Record<
  OperationReportSeverityType,
  { variant: 'secondary' | 'amber' | 'red'; label: string }
> = {
  low: { variant: 'secondary', label: '심각도 낮음' },
  medium: { variant: 'amber', label: '심각도 중간' },
  high: { variant: 'red', label: '심각도 높음' },
};

// 고아 보고서(pending/running 인 채 멈춤) 판정 임계 — 백엔드 sweep 이 주
// 방어지만, sweep 이전이거나 누락돼도 버튼이 영구 비활성되지 않게 하는
// 웹 측 보조 방어. updatedAt 이 이 시간 넘게 갱신되지 않으면 멈춘 것으로.
const REPORT_STALL_MS = 10 * 60 * 1000;

// run.meta 는 JSON 직렬화 문자열 — 파싱 실패(절단 등)해도 원문은 보여준다.
const parseRunMeta = (meta: string | null): string | null => {
  if (!meta) return null;
  try {
    return JSON.stringify(JSON.parse(meta), null, 2);
  } catch {
    return meta;
  }
};

const InfoItem = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-baseline gap-2">
    <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
    <span className="min-w-0 break-all text-sm">{children}</span>
  </div>
);

// 수동 분석 거절(ok:false) 안내 — no_analysis_llm 만 해결 경로(AI 키 설정)가
// 있어 별도 분기, 나머지는 메시지 그대로.
const AnalyzeNotice = ({ code, message }: { code: string; message: string }) => {
  if (code === 'no_analysis_llm') {
    return (
      <div className="rounded-md border border-dashed bg-amber-50 px-3 py-2 text-xs dark:bg-amber-950/30">
        <p>{message}</p>
        <p className="mt-1">
          AI 키에서 &lsquo;로그 분석(log-analysis)&rsquo; 용도를 추가하면 분석을 실행할 수
          있습니다.{' '}
          <Link
            to="/admin/settings/ai-keys"
            className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
          >
            AI 키 설정으로 이동 <KeyRound className="size-3" />
          </Link>
        </p>
      </div>
    );
  }
  if (code === 'analysis_in_flight') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        이미 이 실행의 분석이 진행 중입니다. 완료되면 자동으로 갱신됩니다.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      <XCircle className="size-3 shrink-0" />
      {code}: {message}
    </div>
  );
};

const ReportBody = ({ report }: { report: OperationReportType }) => {
  const severity = report.severity ? SEVERITY_BADGE[report.severity] : null;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {severity && <Badge variant={severity.variant}>{severity.label}</Badge>}
        {report.summary && <p className="font-medium">{report.summary}</p>}
      </div>
      {report.rootCause && (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground">원인</h3>
          <p className="whitespace-pre-wrap">{report.rootCause}</p>
        </div>
      )}
      {report.details && (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground">상세</h3>
          <p className="whitespace-pre-wrap text-sm">{report.details}</p>
        </div>
      )}
      {report.suggestions && report.suggestions.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground">제안</h3>
          <ul className="list-disc space-y-1 pl-5">
            {report.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
        {report.provider && <span>{report.provider}</span>}
        {report.model && <span>{report.model}</span>}
        {report.promptTokens !== null && <span>입력 {report.promptTokens} 토큰</span>}
        {report.completionTokens !== null && (
          <span>출력 {report.completionTokens} 토큰</span>
        )}
        {report.durationMs !== null && <span>{(report.durationMs / 1000).toFixed(1)}초</span>}
        <span>{new Date(report.updatedAt).toLocaleString('ko-KR')}</span>
      </div>
    </div>
  );
};

export const AdminLogRunDetailPage = () => {
  const { runId } = useParams<{ runId: string }>();
  // running run / 미완 보고서 동안 3초 폴링 내장.
  const detailQuery = useOperationRun(runId ?? null);
  const run = detailQuery.data?.run ?? null;
  const report = detailQuery.data?.report ?? null;

  const [levelFilter, setLevelFilter] = useState<OperationLogLevelType | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const logsQuery = useOperationRunLogs(runId ?? null, {
    level: levelFilter === 'all' ? null : levelFilter,
    pageSize: 100,
  });
  // 응답은 최신순(createdAt DESC) — 표시는 시간 오름차순으로 뒤집는다.
  // '이전 로그 더 보기'로 받은 과거 페이지가 자연스럽게 위쪽에 붙는다.
  const entries = useMemo(
    () => [...flattenOperationLogPages(logsQuery.data)].reverse(),
    [logsQuery.data],
  );

  const analyzeMutation = useAnalyzeRun();
  const [analyzeNotice, setAnalyzeNotice] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const reportPendingLike =
    report?.status === 'pending' || report?.status === 'running';
  // 폴링(3초) 재렌더마다 재평가되므로 시간이 지나면 자연히 풀린다.
  const reportStalled =
    reportPendingLike &&
    report !== null &&
    Date.now() - new Date(report.updatedAt).getTime() > REPORT_STALL_MS;
  const reportBusy = reportPendingLike && !reportStalled;

  const handleAnalyze = () => {
    if (!runId) return;
    setAnalyzeNotice(null);
    analyzeMutation.mutate(runId, {
      onSuccess: (result) => {
        // ok:false 도 200 — 거절 사유(미설정/중복 등)를 카드 안에 안내.
        if (!result.ok) setAnalyzeNotice({ code: result.error, message: result.message });
      },
      onError: (e) =>
        setAnalyzeNotice({
          code: 'request_failed',
          message: e instanceof ApiError ? e.message : '분석 요청에 실패했습니다.',
        }),
    });
  };

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const runMeta = useMemo(() => parseRunMeta(run?.meta ?? null), [run?.meta]);

  if (detailQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
      </div>
    );
  }
  if (detailQuery.isError || !run) {
    return (
      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-10">
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-sm text-destructive">
          <span className="inline-flex items-center gap-2">
            <XCircle className="size-4" /> 실행 기록을 불러올 수 없습니다.
          </span>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/logs">
              <ArrowLeft /> 로그 목록으로
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="size-8 shrink-0">
          <Link to="/admin/logs" aria-label="로그 목록으로">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ScrollText className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {FEATURE_LABEL[run.feature]} 실행
            <RunStatusBadge status={run.status} />
          </h1>
          <p className="truncate text-sm text-muted-foreground">{run.id}</p>
        </div>
      </header>

      <Card className="mb-6">
        <CardContent className="space-y-3 pt-6">
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem label="기능">{FEATURE_LABEL[run.feature]}</InfoItem>
            <InfoItem label="트리거">{triggerLabel(run.trigger) ?? '—'}</InfoItem>
            <InfoItem label="로그 수">{run.logCount}건</InfoItem>
            <InfoItem label="시작">
              {new Date(run.startedAt).toLocaleString('ko-KR')}
            </InfoItem>
            <InfoItem label="종료">
              {run.finishedAt ? new Date(run.finishedAt).toLocaleString('ko-KR') : '—'}
            </InfoItem>
            <InfoItem label="소요">{formatDuration(run.startedAt, run.finishedAt)}</InfoItem>
            {run.jobId && <InfoItem label="잡 ID">{run.jobId}</InfoItem>}
            {run.subjectId && <InfoItem label="대상">{run.subjectId}</InfoItem>}
            {run.parentRunId && (
              <InfoItem label="부모 run">
                <Link
                  to={`/admin/logs/${run.parentRunId}`}
                  className="inline-flex items-center gap-1 text-foreground hover:underline"
                >
                  <GitBranch className="size-3" />
                  {run.parentRunId}
                </Link>
              </InfoItem>
            )}
          </div>
          {(run.errorCode || run.errorMessage) && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {run.errorCode && (
                <span className="font-mono font-medium">{run.errorCode}</span>
              )}
              {run.errorCode && run.errorMessage && ' — '}
              {run.errorMessage}
            </div>
          )}
          {runMeta && (
            <pre className="max-h-40 overflow-auto rounded bg-muted px-2 py-1 text-[11px]">
              {runMeta}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* 보고서 카드 — 실패 run 이거나 보고서가 이미 있을 때만. 정상 완료
          run 에 빈 카드를 노출할 이유가 없다. */}
      {(run.status === 'failed' || report) && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="inline-flex items-center gap-2">
                  <FileSearch className="size-4" />
                  실패 분석 보고서
                </CardTitle>
                <CardDescription>
                  실패한 실행의 로그를 LLM 이 분석한 원인·제안입니다.
                </CardDescription>
              </div>
              {run.status === 'failed' && (
                <Button
                  type="button"
                  variant="blue"
                  size="sm"
                  onClick={handleAnalyze}
                  disabled={analyzeMutation.isPending || reportBusy}
                  title={
                    reportStalled
                      ? '이전 분석이 응답하지 않음 — 다시 시도 가능'
                      : undefined
                  }
                >
                  {analyzeMutation.isPending || reportBusy ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  다시 분석
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {analyzeNotice && (
              <AnalyzeNotice code={analyzeNotice.code} message={analyzeNotice.message} />
            )}
            {!report ? (
              <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                아직 보고서가 없습니다. &lsquo;다시 분석&rsquo;으로 생성할 수 있습니다.
              </div>
            ) : reportStalled ? (
              <div className="rounded-md border border-dashed bg-amber-50 px-3 py-2 text-xs dark:bg-amber-950/30">
                이전 분석이 응답하지 않음 — &lsquo;다시 분석&rsquo;으로 다시 시도할 수
                있습니다.
              </div>
            ) : reportBusy ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                분석 진행 중… 완료되면 자동으로 표시됩니다.
              </div>
            ) : report.status === 'failed' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <XCircle className="size-3 shrink-0" />
                  분석 실패
                  {report.errorCode && (
                    <span className="font-mono">({report.errorCode})</span>
                  )}
                  {report.errorMessage && <span>— {report.errorMessage}</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  일시적 오류(LLM 한도 등)일 수 있습니다. &lsquo;다시 분석&rsquo;으로
                  재시도하세요.
                </p>
              </div>
            ) : (
              <ReportBody report={report} />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>스텝 로그</CardTitle>
              <CardDescription>
                최신 페이지부터 불러와 시간 오름차순으로 표시합니다. debug 는 DB 에만
                기록되는 상세 레벨입니다.
              </CardDescription>
            </div>
            {/* 진행 중 run 의 로그는 SSE 가 아니라 수동/주기 새로고침 — 버튼으로
                즉시 최신화할 수 있게 한다. */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void detailQuery.refetch();
                void logsQuery.refetch();
              }}
              disabled={logsQuery.isRefetching}
            >
              {logsQuery.isRefetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              새로고침
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">레벨:</span>
            {(['all', 'debug', 'info', 'warn', 'error'] as const).map((lv) => (
              <Button
                key={lv}
                type="button"
                size="sm"
                variant={levelFilter === lv ? 'secondary' : 'ghost'}
                className="h-7 px-2"
                onClick={() => setLevelFilter(lv)}
              >
                {lv}
              </Button>
            ))}
            <span className="ml-auto text-muted-foreground">
              {entries.length}건 표시 / 전체 {run.logCount}건
            </span>
          </div>

          {logsQuery.hasNextPage && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => void logsQuery.fetchNextPage()}
              disabled={logsQuery.isFetchingNextPage}
            >
              {logsQuery.isFetchingNextPage ? (
                <>
                  <Loader2 className="mr-2 size-3 animate-spin" />더 불러오는 중…
                </>
              ) : (
                '이전 로그 더 보기'
              )}
            </Button>
          )}

          {logsQuery.isLoading ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
              저장된 로그가 없습니다.
            </div>
          ) : (
            <ul className="max-h-[480px] space-y-1 overflow-y-auto">
              {entries.map((e) => {
                const isOpen = expanded.has(e.id);
                const hasMeta = e.meta !== null && Object.keys(e.meta).length > 0;
                return (
                  <li
                    key={e.id}
                    className="rounded-md border bg-card/30 px-2 py-1.5 font-mono text-xs"
                  >
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-start gap-2 text-left',
                        !hasMeta && 'cursor-default',
                      )}
                      onClick={() => (hasMeta ? toggle(e.id) : undefined)}
                    >
                      <span className="mt-[2px] shrink-0">
                        {hasMeta ? (
                          isOpen ? (
                            <ChevronDown className="size-3" />
                          ) : (
                            <ChevronRight className="size-3" />
                          )
                        ) : (
                          <span className="inline-block size-3" />
                        )}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {e.createdAt.slice(11, 23)}
                      </span>
                      <Badge
                        variant="outline"
                        className={`shrink-0 px-1 py-0 text-[10px] ${LEVEL_BADGE[e.level]}`}
                      >
                        {e.level}
                      </Badge>
                      <Badge variant="outline" className="shrink-0 px-1 py-0 text-[10px]">
                        {e.stage}
                      </Badge>
                      <span className="flex-1 break-all">{e.message}</span>
                    </button>
                    {isOpen && hasMeta && (
                      <pre className="ml-5 mt-1 max-h-48 overflow-auto rounded bg-muted px-2 py-1 text-[11px]">
                        {JSON.stringify(e.meta, null, 2)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
