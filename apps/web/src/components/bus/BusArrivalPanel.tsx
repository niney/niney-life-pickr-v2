import { ArrowLeft, Loader2 } from 'lucide-react';
import type {
  BusArrivalEntryType,
  BusArrivalItemType,
  BusRouteInfoType,
  BusStationItemType,
} from '@repo/api-contract';
import { formatRelativeSec, isBusArrivalImminent } from '@repo/utils';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { BusFavoriteStar } from './BusFavoriteStar';

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
  // 서버가 업스트림 장애로 last-known(≤10분)을 대신 서빙 중 — 경고 배너 표시.
  stale: boolean;
  // 에러가 서울시 API 쪽(502/503)인지 — 에러 문구에 원인 안내를 덧붙인다.
  isUpstreamError: boolean;
  selectedRouteId: string | null;
  onToggleRoute(busRouteId: string): void;
  onBack(): void;
  onRetry(): void;
  // 즐겨찾기 — 정류장 별(헤더)과 노선 별(행). 지도 추적 토글(onToggleRoute)과
  // 별개다. 정류장 스냅샷은 station 프로퍼티에서, 노선 스냅샷은 각 도착 항목에서
  // 상위(BusPage)가 조립한다.
  stationFavorite: boolean;
  onToggleStationFavorite(): void;
  isRouteFavorite(busRouteId: string): boolean;
  onToggleRouteFavorite(item: BusArrivalItemType): void;
  // 추적 중(selectedRouteId) 노선의 기본정보. 상위(BusPage)가 useBusRouteDetail
  // 로 조회해 내려준다(패널은 훅을 직접 호출하지 않는 기존 패턴 준수). 로딩/실패/
  // 미추적이면 null → 카드 생략(조용히).
  routeInfo?: BusRouteInfoType | null;
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
  stale,
  isUpstreamError,
  selectedRouteId,
  onToggleRoute,
  onBack,
  onRetry,
  stationFavorite,
  onToggleStationFavorite,
  isRouteFavorite,
  onToggleRouteFavorite,
  routeInfo,
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
          <BusFavoriteStar
            active={stationFavorite}
            onToggle={onToggleStationFavorite}
            label={`${station.name} 즐겨찾기`}
            className="ml-auto"
          />
        </div>
        {!virtual && fetchedAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            갱신 {formatRelativeSec(fetchedAt)} · 30초마다 자동 갱신
            {isFetching && <Loader2 className="size-3 animate-spin" />}
          </div>
        )}
        {/* 서버가 업스트림 장애로 최근 성공본을 대신 서빙 중 — 정보 나이를 명시. */}
        {!virtual && stale && fetchedAt && (
          <div className="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-600 dark:text-amber-400">
            서울시 버스 API 장애 — {formatRelativeSec(fetchedAt)} 정보를 표시하고 있습니다.
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {/* 추적 중 노선의 정보 카드 — 목록 위. 미추적/로딩/실패면 routeInfo 가
            null 이라 자연히 생략된다. */}
        {selectedRouteId && routeInfo && <RouteInfoCard info={routeInfo} />}
        <PanelBody
          virtual={virtual}
          items={items}
          isLoading={isLoading}
          isPlaceholder={isPlaceholder}
          isError={isError}
          isUpstreamError={isUpstreamError}
          selectedRouteId={selectedRouteId}
          onToggleRoute={onToggleRoute}
          onRetry={onRetry}
          isRouteFavorite={isRouteFavorite}
          onToggleRouteFavorite={onToggleRouteFavorite}
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
  isUpstreamError,
  selectedRouteId,
  onToggleRoute,
  onRetry,
  isRouteFavorite,
  onToggleRouteFavorite,
}: {
  virtual: boolean;
  items: BusArrivalItemType[];
  isLoading: boolean;
  isPlaceholder: boolean;
  isError: boolean;
  isUpstreamError: boolean;
  selectedRouteId: string | null;
  onToggleRoute(busRouteId: string): void;
  onRetry(): void;
  isRouteFavorite(busRouteId: string): boolean;
  onToggleRouteFavorite(item: BusArrivalItemType): void;
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
        {isUpstreamError && (
          <span className="text-xs text-muted-foreground">
            서울시 버스 API 장애입니다. 복구되면 자동으로 다시 표시됩니다.
          </span>
        )}
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
        // 위치 조회가 노선 전체(getBusPosByRtid)로 바뀌어 staOrd 없는 노선도
        // 추적 가능 — 예전의 staOrd 기반 클릭 비활성은 제거.
        return (
          // 지도 추적(행 버튼)과 즐겨찾기 별을 형제로 — 버튼 중첩(무효 HTML) 회피.
          <li key={it.busRouteId} className="flex items-start gap-1">
            <button
              type="button"
              onClick={() => onToggleRoute(it.busRouteId)}
              aria-pressed={selected}
              className={cn(
                'flex min-w-0 flex-1 items-start justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors',
                selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
              )}
            >
              <span className="shrink-0 font-semibold tabular-nums">{it.routeName}</span>
              <span className="flex min-w-0 flex-col items-end gap-0.5 text-right">
                <ArrivalMessage entry={it.first} primary />
                {it.first && it.second && <ArrivalMessage entry={it.second} />}
              </span>
            </button>
            <BusFavoriteStar
              active={isRouteFavorite(it.busRouteId)}
              onToggle={() => onToggleRouteFavorite(it)}
              label={`${it.routeName} 즐겨찾기`}
              className="mt-1"
            />
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
        isBusArrivalImminent(entry.message) &&
          'font-semibold text-emerald-600 dark:text-emerald-400',
      )}
    >
      {entry.message}
    </span>
  );
};

// 추적 중 노선의 기본정보 카드 — 기점↔종점/배차/운행시간/운수사/노선거리.
// null 필드는 행을 생략한다(부분 정보라도 있는 것만 보여준다).
const RouteInfoCard = ({ info }: { info: BusRouteInfoType }) => {
  const rows: { label: string; value: string }[] = [];
  if (info.stStationName || info.edStationName) {
    rows.push({ label: '구간', value: `${info.stStationName} ↔ ${info.edStationName}` });
  }
  if (info.termMin != null) rows.push({ label: '배차', value: `${info.termMin}분` });
  if (info.firstBusTime && info.lastBusTime) {
    rows.push({ label: '운행', value: `${info.firstBusTime} ~ ${info.lastBusTime}` });
  }
  if (info.corpName) rows.push({ label: '운수사', value: info.corpName });
  if (info.lengthKm != null) rows.push({ label: '노선거리', value: `${info.lengthKm}km` });
  // 표시할 정보가 하나도 없으면 카드 자체를 그리지 않는다.
  if (rows.length === 0) return null;
  return (
    <div className="mb-3 rounded-md border bg-muted/40 p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-sm font-semibold tabular-nums">{info.routeName}</span>
        <span className="text-xs text-muted-foreground">노선 정보</span>
      </div>
      <dl className="flex flex-col gap-1 text-xs">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-2">
            <dt className="w-14 shrink-0 text-muted-foreground">{r.label}</dt>
            <dd className="min-w-0 break-words">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

const Hint = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-32 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);
