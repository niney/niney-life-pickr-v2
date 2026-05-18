import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Loader2 } from 'lucide-react';
import {
  flattenJobLogPages,
  useRestaurantCrawlLogs,
} from '@repo/shared';
import type { CrawlLogLevelType } from '@repo/api-contract';
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

// 상세 페이지 "크롤 로그" 아코디언. 기본 접힘 — 펼칠 때 fetch 시작 (enabled
// 토글). 한 가게의 모든 잡 로그를 시간 내림차순(최신 위)으로 페이지네이션.
// jobId 별로 행 좌측에 배지 표시 — 같은 가게에 재크롤이 여러 번 있었으면
// 잡 단위로 시각적 구분.
export const RestaurantCrawlLogsSection = ({
  placeId,
}: RestaurantCrawlLogsSectionProps) => {
  const [open, setOpen] = useState(false);
  const [levelFilter, setLevelFilter] = useState<CrawlLogLevelType | 'all'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const logsQuery = useRestaurantCrawlLogs({
    placeId,
    enabled: open,
    level: levelFilter === 'all' ? null : levelFilter,
    pageSize: 100,
  });
  const items = useMemo(() => flattenJobLogPages(logsQuery.data), [logsQuery.data]);

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
              const isOpen = expanded.has(e.id);
              const hasMeta = e.meta !== null && Object.keys(e.meta).length > 0;
              // jobId 가 처음 등장한 행에만 표시 (정렬상 최신부터라 가장 위 행에 표시됨).
              const showJobBadge = !jobIdShown.has(e.jobId);
              if (showJobBadge) jobIdShown.add(e.jobId);

              return (
                <li
                  key={e.id}
                  className="rounded-md border bg-card/30 px-2 py-1.5 text-xs font-mono"
                >
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 text-left"
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
                      {e.createdAt.slice(5, 10)} {e.createdAt.slice(11, 19)}
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
