import { useNavigate, useSearchParams } from 'react-router-dom';
import { GitBranch, Loader2, ScrollText, XCircle } from 'lucide-react';
import { useOperationRuns } from '@repo/shared';
import type {
  OperationFeatureType,
  OperationRunStatusType,
  OperationRunType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Pager } from '~/components/ui/pager';
import { cn } from '~/lib/utils';

// feature 식별자 → 사람용 한국어 라벨. 새 feature 가 생기면 여기에만 추가.
// 상세 페이지(AdminLogRunDetailPage)도 같은 매핑을 쓰므로 export.
export const FEATURE_LABEL: Record<OperationFeatureType, string> = {
  crawl: '크롤링',
  summary: '리뷰 요약',
  'menu-grouping': '메뉴 그룹핑',
  'settlement-extraction': '영수증 추출',
  'auto-discover': '자동 발견',
  schedule: '스케줄',
  'global-merge': '글로벌 메뉴 병합',
  'diningcode-bulk-save': '다이닝코드 일괄 저장',
};

const STATUS_LABEL: Record<OperationRunStatusType, string> = {
  running: '진행 중',
  done: '완료',
  failed: '실패',
  cancelled: '취소',
};

// trigger 는 기능별 어휘가 다른 자유 문자열 — 알려진 값만 번역, 나머지는 원문.
const TRIGGER_LABEL: Record<string, string> = {
  manual: '수동',
  cron: '크론',
  auto: '자동',
  user: '사용자',
};
export const triggerLabel = (t: string | null): string | null =>
  t === null ? null : (TRIGGER_LABEL[t] ?? t);

const FEATURE_OPTIONS: OperationFeatureType[] = [
  'crawl',
  'summary',
  'menu-grouping',
  'settlement-extraction',
  'auto-discover',
  'schedule',
  'global-merge',
  'diningcode-bulk-save',
];
const STATUS_OPTIONS: OperationRunStatusType[] = [
  'running',
  'done',
  'failed',
  'cancelled',
];

// 상태 배지 — 기존 어드민 배지 톤(soft tonal) 재사용. running 은 진행감을
// 위해 스피너 동반.
export const RunStatusBadge = ({ status }: { status: OperationRunStatusType }) => {
  switch (status) {
    case 'running':
      return (
        <Badge variant="blue" className="inline-flex items-center gap-1">
          <Loader2 className="size-3 animate-spin" />
          {STATUS_LABEL.running}
        </Badge>
      );
    case 'done':
      return <Badge variant="green">{STATUS_LABEL.done}</Badge>;
    case 'failed':
      return <Badge variant="red">{STATUS_LABEL.failed}</Badge>;
    case 'cancelled':
      return <Badge variant="secondary">{STATUS_LABEL.cancelled}</Badge>;
  }
};

// startedAt~finishedAt 소요시간 — 진행 중(finishedAt null)은 '—'. 진행 경과는
// 폴링 주기에 묶여 어차피 정확하지 않아 표기하지 않는다.
export const formatDuration = (
  startedAt: string,
  finishedAt: string | null,
): string => {
  if (!finishedAt) return '—';
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 ${Math.round(s % 60)}초`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
};

const RunRow = ({ run }: { run: OperationRunType }) => {
  const navigate = useNavigate();
  const failed = run.status === 'failed';
  const trigger = triggerLabel(run.trigger);
  const goDetail = () => navigate(`/admin/logs/${run.id}`);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={goDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goDetail();
        }
      }}
      className={cn(
        'cursor-pointer rounded-md border p-3 transition-colors hover:bg-muted/40 sm:p-4',
        // 실패 행 강조 — 목록 스캔 시 어디부터 봐야 하는지 한눈에.
        failed && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <RunStatusBadge status={run.status} />
        <Badge variant="outline">{FEATURE_LABEL[run.feature]}</Badge>
        {trigger && (
          <span className="text-xs text-muted-foreground">{trigger}</span>
        )}
        {/* 중첩 run — 부모(스케줄 등)에서 파생된 실행임을 표시. 행 네비와
            겹치지 않게 클릭은 stopPropagation 으로 부모 상세로 직행. */}
        {run.parentRunId && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/admin/logs/${run.parentRunId}`);
            }}
            className="inline-flex"
            title="부모 run 상세로 이동"
          >
            <Badge
              variant="violet"
              className="inline-flex cursor-pointer items-center gap-1 hover:bg-[var(--tonal-violet-bg-hover)]"
            >
              <GitBranch className="size-3" />
              부모 run
            </Badge>
          </button>
        )}
        {run.subjectId && (
          <span className="truncate text-xs text-muted-foreground">
            대상 {run.subjectId}
          </span>
        )}
      </div>
      {failed && (run.errorCode || run.errorMessage) && (
        <p className="mt-1.5 truncate text-xs text-destructive">
          {run.errorCode && (
            <span className="font-mono font-medium">{run.errorCode}</span>
          )}
          {run.errorCode && run.errorMessage && ' — '}
          {run.errorMessage}
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>로그 {run.logCount}건</span>
        <span>시작 {new Date(run.startedAt).toLocaleString('ko-KR')}</span>
        <span>소요 {formatDuration(run.startedAt, run.finishedAt)}</span>
        {run.jobId && <span className="truncate">잡 {run.jobId}</span>}
      </div>
    </div>
  );
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const DEFAULT_PAGE_SIZE = 20;

const SELECT_CLASS = 'h-8 rounded border bg-background px-2 text-xs';

export const AdminLogsPage = () => {
  // URL 동기화 — 새로고침/뒤로가기 시 필터·페이지 보존 (맛집 목록과 동일 관례).
  const [searchParams, setSearchParams] = useSearchParams();
  const featureParam = searchParams.get('feature');
  const feature: OperationFeatureType | null = (FEATURE_OPTIONS as string[]).includes(
    featureParam ?? '',
  )
    ? (featureParam as OperationFeatureType)
    : null;
  const statusParam = searchParams.get('status');
  const status: OperationRunStatusType | null = (STATUS_OPTIONS as string[]).includes(
    statusParam ?? '',
  )
    ? (statusParam as OperationRunStatusType)
    : null;
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const pageSize = (() => {
    const n = Number(searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE);
    return PAGE_SIZE_OPTIONS.includes(n) ? n : DEFAULT_PAGE_SIZE;
  })();

  const updateParams = (patch: Record<string, string | number | null>): void => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, String(v));
        }
        return next;
      },
      { replace: true },
    );
  };

  // running 항목이 보이는 동안 5초 폴링 내장 — SSE 없는 feature 의 공식 전략.
  const listQuery = useOperationRuns({ page, limit: pageSize, feature, status });
  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ScrollText className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">로그</h1>
          <p className="text-sm text-muted-foreground">
            크롤링·요약·스케줄 등 모든 작업의 실행 기록과 실패 분석 보고서를 봅니다.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>작업 실행 ({total})</CardTitle>
              <CardDescription>
                행을 클릭하면 스텝 로그와 실패 분석 보고서를 볼 수 있습니다.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                기능
                <select
                  value={feature ?? 'all'}
                  onChange={(e) =>
                    // 필터 변경은 페이지를 1로 리셋 — 다른 페이지 채로 필터를
                    // 바꾸면 결과가 어긋남.
                    updateParams({
                      feature: e.target.value === 'all' ? null : e.target.value,
                      page: null,
                    })
                  }
                  className={SELECT_CLASS}
                >
                  <option value="all">전체</option>
                  {FEATURE_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {FEATURE_LABEL[f]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                상태
                <select
                  value={status ?? 'all'}
                  onChange={(e) =>
                    updateParams({
                      status: e.target.value === 'all' ? null : e.target.value,
                      page: null,
                    })
                  }
                  className={SELECT_CLASS}
                >
                  <option value="all">전체</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
            </div>
          ) : listQuery.isError ? (
            <div className="flex h-32 items-center justify-center gap-2 text-sm text-destructive">
              <XCircle className="size-4" /> 목록을 불러올 수 없습니다.
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              조건에 맞는 실행 기록이 없습니다.
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((run) => (
                <li key={run.id}>
                  <RunRow run={run} />
                </li>
              ))}
            </ul>
          )}
          {!listQuery.isLoading && !listQuery.isError && (
            <Pager
              className="mt-3"
              total={total}
              page={page}
              pageSize={pageSize}
              onPageChange={(p) => updateParams({ page: p === 1 ? null : p })}
              onPageSizeChange={(s) =>
                updateParams({
                  pageSize: s === DEFAULT_PAGE_SIZE ? null : s,
                  page: null,
                })
              }
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};
