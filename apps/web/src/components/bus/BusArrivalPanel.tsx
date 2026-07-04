import { ArrowLeft, Loader2 } from 'lucide-react';
import type {
  BusArrivalEntryType,
  BusArrivalItemType,
  BusStationItemType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

// 실시간 데이터(30초 폴링)라 초 단위 상대시각 — 검색 리스트의 분 단위
// formatRelative 와 달리 '방금/N초 전'이 의미를 가진다.
const formatRelativeSec = (iso: string): string => {
  const sec = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 10) return '방금 전';
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
};

// "곧 도착" 계열 메시지 강조 판정 — 서울시 원문이 "곧 도착" 단독 표기.
const isImminent = (message: string): boolean => message.includes('곧 도착');

export interface BusArrivalPanelProps {
  station: BusStationItemType;
  items: BusArrivalItemType[];
  fetchedAt: string | null;
  isLoading: boolean;
  // 30초 자동 갱신 중 표시용 — 로딩 스피너 대신 헤더에 작게.
  isFetching: boolean;
  // 정류장 전환 직후 이전 정류장 데이터(placeholder) 표시 중 — 디밍 처리.
  isPlaceholder: boolean;
  isError: boolean;
  selectedRouteId: string | null;
  onToggleRoute(busRouteId: string): void;
  onBack(): void;
  onRetry(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// BusArrivalPanel — 선택 정류장의 실시간 도착정보. 데스크톱 좌패널/모바일 하단
// 영역이 목록 대신 이 뷰로 전환된다(BottomSheet 없이 단순 전환 + '← 목록').
// ─────────────────────────────────────────────────────────────────────────────

export const BusArrivalPanel = ({
  station,
  items,
  fetchedAt,
  isLoading,
  isFetching,
  isPlaceholder,
  isError,
  selectedRouteId,
  onToggleRoute,
  onBack,
  onRetry,
}: BusArrivalPanelProps) => {
  // arsId '0' = 가상정류장 — 도착정보 API 자체가 없다(훅도 호출 안 함).
  const virtual = station.arsId === '0';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1.5 border-b p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="size-3.5" /> 목록
          </button>
          <span className="min-w-0 truncate text-sm font-semibold">{station.name}</span>
          {!virtual && (
            <Badge variant="secondary" className="shrink-0 tabular-nums">
              {station.arsId}
            </Badge>
          )}
        </div>
        {!virtual && fetchedAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            갱신 {formatRelativeSec(fetchedAt)} · 30초마다 자동 갱신
            {isFetching && <Loader2 className="size-3 animate-spin" />}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <PanelBody
          virtual={virtual}
          items={items}
          isLoading={isLoading}
          isPlaceholder={isPlaceholder}
          isError={isError}
          selectedRouteId={selectedRouteId}
          onToggleRoute={onToggleRoute}
          onRetry={onRetry}
        />
      </div>
    </div>
  );
};

const PanelBody = ({
  virtual,
  items,
  isLoading,
  isPlaceholder,
  isError,
  selectedRouteId,
  onToggleRoute,
  onRetry,
}: {
  virtual: boolean;
  items: BusArrivalItemType[];
  isLoading: boolean;
  isPlaceholder: boolean;
  isError: boolean;
  selectedRouteId: string | null;
  onToggleRoute(busRouteId: string): void;
  onRetry(): void;
}) => {
  if (virtual) {
    return <Hint>가상정류장 — 도착정보를 제공하지 않습니다.</Hint>;
  }
  if (isLoading && items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> 도착정보 불러오는 중…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-destructive">
        도착정보를 불러오지 못했습니다.
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          재시도
        </Button>
      </div>
    );
  }
  if (items.length === 0) {
    return <Hint>이 정류장의 도착 예정 노선이 없습니다.</Hint>;
  }
  return (
    <ul
      className={cn('flex flex-col gap-0.5', isPlaceholder && 'opacity-50')}
      data-testid="bus-arrival-list"
    >
      {items.map((it) => {
        const selected = it.busRouteId === selectedRouteId;
        // staOrd 가 없으면 위치 구간(startOrd/endOrd) 계산 불가 — 클릭 비활성.
        const trackable = it.staOrd !== null;
        return (
          <li key={it.busRouteId}>
            <button
              type="button"
              disabled={!trackable}
              title={trackable ? undefined : '이 노선은 버스 위치를 조회할 수 없습니다'}
              onClick={() => onToggleRoute(it.busRouteId)}
              aria-pressed={selected}
              className={cn(
                'flex w-full items-start justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors',
                selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                !trackable && 'opacity-60',
              )}
            >
              <span className="shrink-0 font-semibold tabular-nums">{it.routeName}</span>
              <span className="flex min-w-0 flex-col items-end gap-0.5 text-right">
                <ArrivalMessage entry={it.first} primary />
                {it.first && it.second && <ArrivalMessage entry={it.second} />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

const ArrivalMessage = ({
  entry,
  primary = false,
}: {
  entry: BusArrivalEntryType | null;
  primary?: boolean;
}) => {
  if (!entry) {
    return <span className="text-xs text-muted-foreground">도착 정보 없음</span>;
  }
  return (
    <span
      className={cn(
        'truncate',
        primary ? 'text-sm' : 'text-xs text-muted-foreground',
        isImminent(entry.message) && 'font-semibold text-emerald-600 dark:text-emerald-400',
      )}
    >
      {entry.message}
    </span>
  );
};

const Hint = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-32 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);
