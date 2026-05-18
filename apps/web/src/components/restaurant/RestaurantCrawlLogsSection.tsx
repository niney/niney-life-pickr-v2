import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Loader2, Radio } from 'lucide-react';
import {
  flattenJobLogPages,
  useRestaurantCrawlLogs,
  useRestaurantSummaryEvents,
} from '@repo/shared';
import type {
  CrawlJobLogEntryType,
  CrawlLogLevelType,
  RestaurantSummaryLogEventType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { SectionHeader } from './sections';

interface RestaurantCrawlLogsSectionProps {
  placeId: string;
}

const LEVEL_BADGE: Record<CrawlLogLevelType, string> = {
  info: 'bg-secondary text-secondary-foreground',
  warn: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  error: 'bg-destructive/20 text-destructive',
};

// 표시용 통합 로그 — DB 페이지에서 온 행과 SSE 실시간으로 온 행을 같은
// 모양으로 변환. DB 행은 id, SSE 행은 (jobId, seq) 가 안정 키.
interface DisplayLog {
  key: string;
  source: 'db' | 'sse';
  jobId: string;
  level: CrawlLogLevelType;
  stage: string;
  message: string;
  meta: Record<string, unknown> | null;
  at: string;
}

const fromDb = (e: CrawlJobLogEntryType): DisplayLog => ({
  key: `db:${e.id}`,
  source: 'db',
  jobId: e.jobId,
  level: e.level,
  stage: e.stage,
  message: e.message,
  meta: e.meta,
  at: e.createdAt,
});

const fromSse = (e: RestaurantSummaryLogEventType): DisplayLog => ({
  // (jobId, seq) — 백엔드가 같은 로그를 fan-out 해도 한 행만 남게.
  key: `${e.jobId ?? 'no-job'}:${e.seq}`,
  source: 'sse',
  jobId: e.jobId ?? '',
  level: e.level,
  stage: e.stage,
  message: e.message,
  meta: e.meta,
  at: e.at,
});

// 상세 페이지 "크롤 로그" 아코디언. 기본 접힘 — 펼칠 때 fetch 시작 (enabled
// 토글). 한 가게의 모든 잡 로그를 시간 내림차순(최신 위)으로 페이지네이션.
// 펼친 상태에선 placeId 단위 SSE 도 함께 구독 — 진행 중인 잡의 새 로그가
// 실시간으로 위쪽에 쌓인다. 잡 SSE 와 요약 SSE 양쪽에 fan-out 된 같은 로그
// 는 백엔드가 동일 (jobId, seq) 를 박아 자연 dedup.
// jobId 별로 행 좌측에 배지 표시 — 같은 가게에 재크롤이 여러 번 있었으면
// 잡 단위로 시각적 구분.
export const RestaurantCrawlLogsSection = ({
  placeId,
}: RestaurantCrawlLogsSectionProps) => {
  const [open, setOpen] = useState(false);
  const [levelFilter, setLevelFilter] = useState<CrawlLogLevelType | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // SSE 실시간 누적분. 아코디언이 닫혀 있으면 useRestaurantSummaryEvents 가
  // 구독을 끊으므로 자동으로 비워질 일은 없다 — 닫혔다가 다시 열 때만 리셋.
  const [sseLogs, setSseLogs] = useState<RestaurantSummaryLogEventType[]>([]);

  const logsQuery = useRestaurantCrawlLogs({
    placeId,
    enabled: open,
    level: levelFilter === 'all' ? null : levelFilter,
    pageSize: 100,
  });

  // 아코디언이 닫히면 SSE 누적 비우기 — 다음에 열 때는 새 페이지 + 빈 SSE
  // 로 시작. 열어두는 동안에는 실시간으로 계속 쌓인다.
  useEffect(() => {
    if (!open) setSseLogs([]);
  }, [open]);

  const handleLog = useCallback((ev: RestaurantSummaryLogEventType) => {
    setSseLogs((prev) => [...prev, ev]);
  }, []);
  // 아코디언이 열려있을 때만 SSE 구독. 닫혀있으면 placeId=null 로 unsubscribe.
  useRestaurantSummaryEvents(open ? placeId : null, { onLog: handleLog });

  // SSE 실시간 행 + DB 페이지 행. 같은 (jobId, seq) 가 SSE 와 DB 양쪽에 있을
  // 가능성 (DB query 진행 중에 SSE 가 들어오면) 은 작지만 dedup 은 jobId+seq
  // 기준이 아니라 DB 의 id 가 다른 키라 자연 dedup 안 됨 — 짧은 race window
  // 라 받아들이고, 같은 행이 두 번 보이는 경우는 다음 fetch 때 정리된다.
  const items = useMemo(() => {
    const map = new Map<string, DisplayLog>();
    for (const e of flattenJobLogPages(logsQuery.data).map(fromDb)) {
      if (!map.has(e.key)) map.set(e.key, e);
    }
    for (const e of sseLogs.map(fromSse)) {
      if (!map.has(e.key)) map.set(e.key, e);
    }
    return [...map.values()]
      .filter((e) => levelFilter === 'all' || e.level === levelFilter)
      .sort((a, b) => b.at.localeCompare(a.at)); // 최신 위
  }, [logsQuery.data, sseLogs, levelFilter]);

  // 같은 jobId 가 연속이면 첫 행에만 배지 표시 — 시각적 노이즈 줄이기.
  const jobIdShown = new Set<string>();

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section className="space-y-3">
      <button
        type="button"
        className="flex w-full items-center gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
        <SectionHeader icon={<FileText className="size-4" />} label="크롤 로그" />
        {items.length > 0 && (
          <Badge variant="outline" className="ml-1 text-[10px]">
            {items.length}
          </Badge>
        )}
        {open && (
          // SSE 연결 중임을 가시화. 펼쳐져 있으면 실시간 수신 중이라는 안내.
          <Badge variant="outline" className="ml-1 gap-1 text-[10px] text-muted-foreground">
            <Radio className="size-3 animate-pulse" />
            LIVE
          </Badge>
        )}
      </button>

      {open && (
        <div className="space-y-3">
          {/* 필터 — info/warn/error. all 이 기본. */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">레벨:</span>
            {(['all', 'info', 'warn', 'error'] as const).map((lv) => (
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
              {items.length}건
              {logsQuery.hasNextPage ? '+' : ''}
            </span>
          </div>

          {logsQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              불러오는 중…
            </div>
          )}

          {!logsQuery.isLoading && items.length === 0 && (
            <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
              저장된 로그가 없습니다.
            </div>
          )}

          <ul className="space-y-1 max-h-[480px] overflow-y-auto">
            {items.map((e) => {
              const isOpen = expanded.has(e.key);
              const hasMeta = e.meta !== null && Object.keys(e.meta).length > 0;
              // jobId 가 처음 등장한 행에만 표시 (정렬상 최신부터라 가장 위 행에 표시됨).
              const showJobBadge = !!e.jobId && !jobIdShown.has(e.jobId);
              if (showJobBadge) jobIdShown.add(e.jobId);

              return (
                <li
                  key={e.key}
                  className="rounded-md border bg-card/30 px-2 py-1.5 text-xs font-mono"
                >
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 text-left"
                    onClick={() => (hasMeta ? toggle(e.key) : undefined)}
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
                      {e.at.slice(5, 10)} {e.at.slice(11, 19)}
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
                    {showJobBadge && (
                      <Badge
                        variant="outline"
                        className="shrink-0 px-1 py-0 text-[10px] text-muted-foreground"
                        title={`job ${e.jobId}`}
                      >
                        #{e.jobId.slice(0, 6)}
                      </Badge>
                    )}
                    <span className="flex-1 break-all">{e.message}</span>
                  </button>
                  {isOpen && hasMeta && (
                    <pre className="mt-1 ml-5 max-h-48 overflow-auto rounded bg-muted px-2 py-1 text-[11px]">
                      {JSON.stringify(e.meta, null, 2)}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>

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
        </div>
      )}
    </section>
  );
};
