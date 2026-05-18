import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import {
  flattenJobLogPages,
  useCrawlJobLogs,
  type StreamLogEntry,
} from '@repo/shared';
import type {
  CrawlJobLogEntryType,
  CrawlLogLevelType,
  RestaurantSummaryLogEventType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';

// 표시용 통합 로그 행 — 출처(SSE 실시간/DB 영속/요약 SSE) 모두 같은 모양으로
// 변환해 한 리스트에 누적. id 가 있으면 DB 행, 없으면 실시간 스트림.
interface DisplayLog {
  // 안정 키 — DB 행은 id, 실시간은 출처+시퀀스 조합.
  key: string;
  source: 'crawl-sse' | 'summary-sse' | 'db';
  level: CrawlLogLevelType;
  stage: string;
  message: string;
  meta: Record<string, unknown> | null;
  at: string;
}

interface JobLogTabProps {
  jobId: string;
  streamLogs: StreamLogEntry[];
  summaryLogs: RestaurantSummaryLogEventType[];
  // 잡이 끝났을 때만 DB 조회 fallback. 실행 중엔 실시간 SSE 누적분으로 충분.
  isJobFinished: boolean;
}

const LEVEL_BADGE: Record<CrawlLogLevelType, string> = {
  info: 'bg-secondary text-secondary-foreground',
  warn: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  error: 'bg-destructive/20 text-destructive',
};

// 키는 (jobId, seq) — 백엔드가 같은 로그를 crawl SSE 와 summary SSE 양쪽에
// fan-out 할 때 같은 seq 를 박는다. 클라이언트는 두 출처가 같은 key 를 만들
// 어 Map dedup 으로 한 행만 남긴다.
const fromStream = (e: StreamLogEntry): DisplayLog => ({
  key: `${e.jobId}:${e.seq}`,
  source: 'crawl-sse',
  level: e.level,
  stage: e.stage,
  message: e.message,
  meta: e.meta,
  at: e.at,
});

const fromSummaryStream = (e: RestaurantSummaryLogEventType): DisplayLog => ({
  // crawl-sse 가 같은 (jobId, seq) 로 먼저 들어왔으면 Map 에서 같은 key 로
  // 충돌해 자연 dedup. summary 단계(잡 SSE 가 안 받는 단계) 만 단독으로 남음.
  key: `${e.jobId ?? 'no-job'}:${e.seq}`,
  source: 'summary-sse',
  level: e.level,
  stage: e.stage,
  message: e.message,
  meta: e.meta,
  at: e.at,
});

const fromDb = (e: CrawlJobLogEntryType): DisplayLog => ({
  key: `db:${e.id}`,
  source: 'db',
  level: e.level,
  stage: e.stage,
  message: e.message,
  meta: e.meta,
  at: e.createdAt,
});

export const JobLogTab = ({
  jobId,
  streamLogs,
  summaryLogs,
  isJobFinished,
}: JobLogTabProps) => {
  const [levelFilter, setLevelFilter] = useState<CrawlLogLevelType | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // DB fallback — 잡 종료 후에만 활성. 실행 중에는 실시간 SSE 가 모든 행을
  // 가져오므로 별도 폴링 불필요.
  const dbQuery = useCrawlJobLogs({
    jobId,
    enabled: isJobFinished,
    level: levelFilter === 'all' ? null : levelFilter,
    pageSize: 100,
  });
  const dbItems = useMemo(() => flattenJobLogPages(dbQuery.data), [dbQuery.data]);

  const merged = useMemo(() => {
    // DB + 실시간 두 SSE 출처를 Map<key, DisplayLog> 로 dedup. 우선순위:
    // crawl-sse(원본) > summary-sse(fan-out) > db. 같은 key 가 중복 도착해도
    // 첫 출처를 유지 — fan-out 으로 들어온 동일 로그는 무시된다.
    const map = new Map<string, DisplayLog>();
    for (const e of streamLogs.map(fromStream)) {
      if (!map.has(e.key)) map.set(e.key, e);
    }
    for (const e of summaryLogs.map(fromSummaryStream)) {
      if (!map.has(e.key)) map.set(e.key, e);
    }
    for (const e of dbItems.map(fromDb)) {
      if (!map.has(e.key)) map.set(e.key, e);
    }
    return [...map.values()]
      .filter((e) => levelFilter === 'all' || e.level === levelFilter)
      .sort((a, b) => a.at.localeCompare(b.at));
  }, [streamLogs, summaryLogs, dbItems, levelFilter]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* 필터 — info/warn/error. all 은 기본. */}
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
          {merged.length}건 / 크롤 {streamLogs.length} · 요약 {summaryLogs.length}
          {isJobFinished && dbItems.length > 0 ? ` · DB ${dbItems.length}` : ''}
        </span>
      </div>

      {merged.length === 0 && (
        <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
          {isJobFinished
            ? '저장된 로그가 없습니다.'
            : '아직 수신된 로그가 없습니다.'}
        </div>
      )}

      <ul className="space-y-1 max-h-[420px] overflow-y-auto">
        {merged.map((e) => {
          const isOpen = expanded.has(e.key);
          const hasMeta = e.meta !== null && Object.keys(e.meta).length > 0;
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
                  {e.at.slice(11, 23)}
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
                <pre className="mt-1 ml-5 max-h-48 overflow-auto rounded bg-muted px-2 py-1 text-[11px]">
                  {JSON.stringify(e.meta, null, 2)}
                </pre>
              )}
            </li>
          );
        })}
      </ul>

      {isJobFinished && dbQuery.hasNextPage && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => void dbQuery.fetchNextPage()}
          disabled={dbQuery.isFetchingNextPage}
        >
          {dbQuery.isFetchingNextPage ? (
            <>
              <Loader2 className="mr-2 size-3 animate-spin" />더 불러오는 중…
            </>
          ) : (
            '이전 로그 더 보기'
          )}
        </Button>
      )}
    </div>
  );
};
