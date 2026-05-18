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

// 실시간 스트림 한 행을 표시용 변환. 잡 종료 후엔 DB 페이지로 덮어쓰여 중복
// 제거되도록 source/at/message 기준으로 dedup 키를 별도 계산하지 않는다 — 잡
// 단위 로그는 양이 많아도 수백 행 수준이라 단순화.
const fromStream = (e: StreamLogEntry): DisplayLog => ({
  key: `crawl:${e.seq}`,
  source: 'crawl-sse',
  level: e.level,
  stage: e.stage,
  message: e.message,
  meta: e.meta,
  at: e.at,
});

const fromSummaryStream = (e: RestaurantSummaryLogEventType): DisplayLog => ({
  // 요약 SSE 는 seq 가 없어 at + stage 로 안정 키. 같은 at(ms) 충돌은 거의
  // 없지만 stage 까지 더해 추가 안전.
  key: `summary:${e.at}:${e.stage}:${e.message.slice(0, 16)}`,
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
    // DB + 실시간 둘 다 모아 시간 오름차순. 같은 행이 DB 와 실시간 둘 다에
    // 있을 수 있지만 (잡 진행 중 DB 가 먼저 응답하면) key 가 다르므로 중복으로
    // 표시될 수 있다 — 잡 종료 후만 fallback 호출이라 실제로는 거의 안 겹침.
    const all: DisplayLog[] = [
      ...streamLogs.map(fromStream),
      ...summaryLogs.map(fromSummaryStream),
      ...dbItems.map(fromDb),
    ];
    // 같은 at 일 때 source 'db' 가 stable 키를 들고 있으니 우선. 단순 정렬만.
    return all
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
