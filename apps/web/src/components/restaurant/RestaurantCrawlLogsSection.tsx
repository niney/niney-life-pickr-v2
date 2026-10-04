import { memo, useCallback, useMemo, useState } from 'react';
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

// DB 한 페이지 크기 — "이전 로그 더 보기" 한 번에 늘어나는 표시 행 수이기도 하다.
const PAGE_SIZE = 100;
// 한 번에 그리는 행 수의 기본 상한(JobLogTab 과 같은 값). 실시간 로그는 아코디언을 열어 둔 동안
// 계속 쌓이므로, 가상화 없이 DOM 노드 수를 묶어 둔다. 상한에 가려진 행은 "더 보기" 로 꺼낸다.
const MAX_DISPLAY = 500;
// SSE 로 쌓아 두는 실시간 로그 상한 — 넘으면 오래된 것부터 버린다(DB 에는 전부 남아 있어 다시
// 열면 페이지로 볼 수 있다). 로그 1건마다 배열 전체를 복사·정렬하는 비용도 함께 묶인다.
const MAX_SSE_LOGS = 2000;

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

// 로그 한 행. memo — 실시간 로그가 1건 들어올 때마다 목록 전체가 다시 계산되지만, 이미 그려진
// 행은 내용이 바뀌지 않는다(로그는 key 단위로 불변). DisplayLog 객체는 계산 때마다 새로 만들어
// 지므로 참조 대신 key 로 비교한다 — 새 행과 배지가 옮겨 간 행만 다시 그려진다.
const LogRow = memo(
  function LogRow({
    e,
    isOpen,
    showJobBadge,
    onToggle,
  }: {
    e: DisplayLog;
    isOpen: boolean;
    showJobBadge: boolean;
    onToggle: (key: string) => void;
  }) {
    const hasMeta = e.meta !== null && Object.keys(e.meta).length > 0;
    return (
      <li className="rounded-md border bg-card/30 px-2 py-1.5 text-xs font-mono">
        <button
          type="button"
          className="flex w-full items-start gap-2 text-left"
          onClick={() => (hasMeta ? onToggle(e.key) : undefined)}
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
  },
  (prev, next) =>
    prev.e.key === next.e.key &&
    prev.isOpen === next.isOpen &&
    prev.showJobBadge === next.showJobBadge &&
    prev.onToggle === next.onToggle,
);

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
  // SSE 실시간 누적분(최근 MAX_SSE_LOGS 건). 아코디언이 닫혀 있으면 useRestaurantSummaryEvents 가
  // 구독을 끊으므로 자동으로 비워질 일은 없다 — 닫을 때만 리셋(toggleOpen). dropped 는 상한을
  // 넘겨 버린 로그가 있다는 표시 — 건수 뒤에 '+' 를 붙여 "표시된 것보다 더 있음" 을 알린다.
  const [sse, setSse] = useState<{ logs: RestaurantSummaryLogEventType[]; dropped: boolean }>({
    logs: [],
    dropped: false,
  });
  // 그리는 행 수 상한 — 기본 MAX_DISPLAY, "이전 로그 더 보기" 를 누를 때마다 한 페이지씩 늘어난다.
  const [displayLimit, setDisplayLimit] = useState(MAX_DISPLAY);

  const logsQuery = useRestaurantCrawlLogs({
    placeId,
    enabled: open,
    level: levelFilter === 'all' ? null : levelFilter,
    pageSize: PAGE_SIZE,
  });

  // 아코디언을 닫으면 SSE 누적과 표시 한도를 비운다 — 다음에 열 때는 새 페이지 + 빈 SSE
  // 로 시작. 열어두는 동안에는 실시간으로 계속 쌓인다.
  const toggleOpen = () => {
    if (open) {
      setSse({ logs: [], dropped: false });
      setDisplayLimit(MAX_DISPLAY);
    }
    setOpen(!open);
  };

  const handleLog = useCallback((ev: RestaurantSummaryLogEventType) => {
    setSse((prev) => {
      const logs = [...prev.logs, ev];
      return logs.length > MAX_SSE_LOGS
        ? { logs: logs.slice(-MAX_SSE_LOGS), dropped: true }
        : { logs, dropped: prev.dropped };
    });
  }, []);
  // 아코디언이 열려있을 때만 SSE 구독. 닫혀있으면 placeId=null 로 unsubscribe.
  useRestaurantSummaryEvents(open ? placeId : null, { onLog: handleLog });
  const sseLogs = sse.logs;

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

  // 최신순 목록에서 위쪽 displayLimit 건만 그린다 — 가려진 것은 더 오래된 로그.
  const visible = items.length > displayLimit ? items.slice(0, displayLimit) : items;
  const hiddenCount = items.length - visible.length;

  // "이전 로그 더 보기" — 표시 한도를 한 페이지만큼 늘린다. 이미 받아 둔 행이 한도에 가려져
  // 있으면 그것부터 보이고, 그걸로 한 페이지가 안 찰 때만 DB 다음 페이지를 받는다.
  const showMore = () => {
    setDisplayLimit((n) => n + PAGE_SIZE);
    if (hiddenCount < PAGE_SIZE && logsQuery.hasNextPage) void logsQuery.fetchNextPage();
  };

  // 같은 jobId 가 연속이면 첫 행에만 배지 표시 — 시각적 노이즈 줄이기.
  const jobIdShown = new Set<string>();

  // 함수형 업데이터라 deps [] 로 안정 — LogRow memo 가 유지된다.
  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <section className="space-y-3">
      <button
        type="button"
        className="flex w-full items-center gap-2"
        onClick={toggleOpen}
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
                onClick={() => {
                  setLevelFilter(lv);
                  setDisplayLimit(MAX_DISPLAY);
                }}
              >
                {lv}
              </Button>
            ))}
            <span className="ml-auto text-muted-foreground">
              {items.length}건
              {logsQuery.hasNextPage || sse.dropped ? '+' : ''}
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
            {visible.map((e) => {
              // jobId 가 처음 등장한 행에만 표시 (정렬상 최신부터라 가장 위 행에 표시됨).
              const showJobBadge = !!e.jobId && !jobIdShown.has(e.jobId);
              if (showJobBadge) jobIdShown.add(e.jobId);

              return (
                <LogRow
                  key={e.key}
                  e={e}
                  isOpen={expanded.has(e.key)}
                  showJobBadge={showJobBadge}
                  onToggle={toggle}
                />
              );
            })}
          </ul>

          {hiddenCount > 0 && (
            <div className="text-center text-[11px] text-muted-foreground">
              이전 {hiddenCount}건 생략 — 최근 {visible.length}건만 표시
            </div>
          )}

          {(hiddenCount > 0 || logsQuery.hasNextPage) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={showMore}
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
