import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bus, ExternalLink, Loader2, MapPinOff, TrainFront } from 'lucide-react';
import type { RestaurantPublicDetailType } from '@repo/api-contract';
import {
  useBusNearbyStations,
  useBusStationArrivals,
  useSubwayNearbyStations,
  useSubwayStationArrivals,
} from '@repo/shared';
import { formatDistanceM, formatRelativeSec, roundCoord } from '@repo/utils';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { SubwayLineBadge } from '~/components/subway/SubwayLineBadge';
import { cn } from '~/lib/utils';

// "가는 법" 탭 — 식당 좌표 주변의 버스 정류장(500m)·지하철역(1.5km)과 실시간
// 도착정보. 서버·계약 변경 0 — 기존 대중교통 nearby/도착 훅을 그대로 재사용한다.
//
// - nearby 는 로컬 정류소/역사 마스터 조회(업스트림 0콜)라 탭 진입 즉시 로드.
// - 도착정보만 실시간 프록시(일일 쿼터) — 행을 선택했을 때만 조회하고, 섹션당
//   동시 1개(새 선택이 이전을 대체, 재탭 해제). 30초 폴링·탭 비활성 정지는
//   훅에 내장돼 있고, 다른 상세 탭으로 옮기면 이 컴포넌트 언마운트로 중단된다.
// - 선택 항목은 렌더 중 파생(items.find) — useEffect 없음.

const ROWS_COLLAPSED = 8;

export const TransitTab = ({ detail }: { detail: RestaurantPublicDetailType }) => {
  const lat = detail.latitude;
  const lng = detail.longitude;

  if (lat === null || lng === null) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <MapPinOff className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">좌표 정보가 없어 주변 대중교통을 찾을 수 없어요</p>
        {(detail.roadAddress ?? detail.address) && (
          <p className="text-xs text-muted-foreground">{detail.roadAddress ?? detail.address}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <BusNearbySection lat={lat} lng={lng} />
      <SubwayNearbySection lat={lat} lng={lng} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 공용 조각 — 섹션 골격(헤더 + 딥링크 버튼) / 로딩 / 에러 / 빈 상태.
// SubwayNearbyBusSection 의 마크업 패턴을 따른다.
// ─────────────────────────────────────────────────────────────────────────────

const SectionShell = ({
  icon,
  title,
  deepLinkLabel,
  onDeepLink,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  deepLinkLabel: string;
  onDeepLink(): void;
  children: React.ReactNode;
}) => (
  <section>
    <header className="mb-2 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1 text-xs text-muted-foreground"
        onClick={onDeepLink}
      >
        {deepLinkLabel}
        <ExternalLink className="size-3" />
      </Button>
    </header>
    {children}
  </section>
);

const SectionLoading = () => (
  <div className="flex h-16 items-center justify-center text-sm text-muted-foreground">
    <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
  </div>
);

const SectionError = ({ onRetry }: { onRetry(): void }) => (
  <div className="flex h-16 flex-col items-center justify-center gap-1.5 text-sm text-destructive">
    불러오지 못했습니다.
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>
      재시도
    </Button>
  </div>
);

const ShowMoreButton = ({
  total,
  showAll,
  onToggle,
}: {
  total: number;
  showAll: boolean;
  onToggle(): void;
}) => (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    className="mt-1 w-full text-xs text-muted-foreground"
    onClick={onToggle}
  >
    {showAll ? '접기' : `더 보기 (${total - ROWS_COLLAPSED}개)`}
  </Button>
);

// ─────────────────────────────────────────────────────────────────────────────
// 버스 — 주변 정류장 + 선택 시 인라인 도착정보.
// ─────────────────────────────────────────────────────────────────────────────

const BusNearbySection = ({ lat, lng }: { lat: number; lng: number }) => {
  const navigate = useNavigate();
  const nearby = useBusNearbyStations(lat, lng); // 기본 반경 500m
  const [selectedStId, setSelectedStId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const items = nearby.data?.items ?? [];
  const visible = showAll ? items : items.slice(0, ROWS_COLLAPSED);

  const goToBus = (stId: string | null) => {
    const stIdQ = stId ? `&stId=${encodeURIComponent(stId)}` : '';
    navigate(`/bus?near=${roundCoord(lat)},${roundCoord(lng)}${stIdQ}`);
  };

  return (
    <SectionShell
      icon={<Bus className="size-4" />}
      title="주변 버스 정류장"
      deepLinkLabel="버스 탭에서 보기"
      onDeepLink={() => goToBus(selectedStId)}
    >
      {nearby.isLoading && items.length === 0 ? (
        <SectionLoading />
      ) : nearby.isError ? (
        <SectionError onRetry={() => void nearby.refetch()} />
      ) : items.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">
          주변 500m에 정류장이 없어요.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-0.5">
            {visible.map((it) => {
              const virtual = it.arsId === '0';
              const selected = it.stId === selectedStId;
              return (
                <li key={it.stId}>
                  <button
                    type="button"
                    disabled={virtual}
                    aria-expanded={selected}
                    onClick={() => setSelectedStId((prev) => (prev === it.stId ? null : it.stId))}
                    className={cn(
                      'flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                      virtual ? 'cursor-default opacity-60' : 'hover:bg-accent/50',
                      selected && 'bg-accent/60',
                    )}
                  >
                    <span className="truncate font-medium">{it.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDistanceM(it.dist)}
                      </span>
                      {/* arsId '0' = 가상정류장(표지판 번호 없음) — 도착정보 미제공. */}
                      {virtual ? (
                        <span className="text-[11px] text-muted-foreground">도착정보 미제공</span>
                      ) : (
                        <Badge variant="secondary" className="tabular-nums">
                          {it.arsId}
                        </Badge>
                      )}
                    </span>
                  </button>
                  {selected && !virtual && <BusArrivalInline arsId={it.arsId} />}
                </li>
              );
            })}
          </ul>
          {items.length > ROWS_COLLAPSED && (
            <ShowMoreButton
              total={items.length}
              showAll={showAll}
              onToggle={() => setShowAll((v) => !v)}
            />
          )}
        </>
      )}
    </SectionShell>
  );
};

const BusArrivalInline = ({ arsId }: { arsId: string }) => {
  const arrivals = useBusStationArrivals(arsId); // 30초 폴링, 탭 비활성 자동 정지
  const data = arrivals.data;

  return (
    <div className="mx-3 mb-1 rounded-md border bg-muted/30 px-3 py-2">
      {arrivals.isLoading && !data ? (
        <SectionLoading />
      ) : arrivals.isError ? (
        <SectionError onRetry={() => void arrivals.refetch()} />
      ) : !data || data.items.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">도착 예정 버스가 없어요.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {data.items.map((route) => (
              <li
                key={route.busRouteId}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="shrink-0 font-semibold tabular-nums">{route.routeName}</span>
                <span className="min-w-0 truncate text-right text-xs text-muted-foreground">
                  {route.first?.message ?? '도착 정보 없음'}
                  {route.second?.message ? ` · ${route.second.message}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-right text-[11px] text-muted-foreground">
            {data.stale
              ? `서울시 API 장애 — ${formatRelativeSec(data.fetchedAt)} 정보`
              : `갱신 ${formatRelativeSec(data.fetchedAt)} · 30초마다 자동 갱신`}
          </p>
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 지하철 — 주변 역 + 선택 시 인라인 도착정보(상·하행 그룹).
// ─────────────────────────────────────────────────────────────────────────────

const SubwayNearbySection = ({ lat, lng }: { lat: number; lng: number }) => {
  const navigate = useNavigate();
  const nearby = useSubwayNearbyStations(lat, lng); // 기본 반경 1.5km
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const items = nearby.data?.items ?? [];
  const visible = showAll ? items : items.slice(0, ROWS_COLLAPSED);

  const goToSubway = (id: string | null) => {
    const stnQ = id ? `&stn=${encodeURIComponent(id)}` : '';
    navigate(`/subway?near=${roundCoord(lat)},${roundCoord(lng)}${stnQ}`);
  };

  return (
    <SectionShell
      icon={<TrainFront className="size-4" />}
      title="주변 지하철역"
      deepLinkLabel="지하철 탭에서 보기"
      onDeepLink={() => goToSubway(selectedId)}
    >
      {nearby.isLoading && items.length === 0 ? (
        <SectionLoading />
      ) : nearby.isError ? (
        <SectionError onRetry={() => void nearby.refetch()} />
      ) : items.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">
          주변 1.5km에 지하철역이 없어요.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-0.5">
            {visible.map((it) => {
              const selected = it.id === selectedId;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    aria-expanded={selected}
                    onClick={() => setSelectedId((prev) => (prev === it.id ? null : it.id))}
                    className={cn(
                      'flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50',
                      selected && 'bg-accent/60',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="flex shrink-0 gap-0.5">
                        {it.lines.map((line) => (
                          <SubwayLineBadge key={line.lineId} lineId={line.lineId} />
                        ))}
                      </span>
                      <span className="truncate font-medium">{it.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatDistanceM(it.dist)}
                    </span>
                  </button>
                  {selected && <SubwayArrivalInline stationId={it.id} />}
                </li>
              );
            })}
          </ul>
          {items.length > ROWS_COLLAPSED && (
            <ShowMoreButton
              total={items.length}
              showAll={showAll}
              onToggle={() => setShowAll((v) => !v)}
            />
          )}
        </>
      )}
    </SectionShell>
  );
};

const SubwayArrivalInline = ({ stationId }: { stationId: string }) => {
  const arrivals = useSubwayStationArrivals(stationId); // 30초 폴링, 탭 비활성 자동 정지
  const data = arrivals.data;

  // 상·하행(내선·외선) 원문 라벨로 묶어 방향별로 보여준다 — 도착 임박순 정렬은
  // 서버 계약(barvlDt asc)을 그대로 신뢰.
  const groups = new Map<string, NonNullable<typeof data>['items']>();
  for (const item of data?.items ?? []) {
    const key = item.updnLine || '기타';
    const arr = groups.get(key);
    if (arr) arr.push(item);
    else groups.set(key, [item]);
  }

  return (
    <div className="mx-3 mb-1 rounded-md border bg-muted/30 px-3 py-2">
      {arrivals.isLoading && !data ? (
        <SectionLoading />
      ) : arrivals.isError ? (
        <SectionError onRetry={() => void arrivals.refetch()} />
      ) : !data || data.items.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">도착 예정 열차가 없어요.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {[...groups.entries()].map(([updn, list]) => (
              <div key={updn}>
                <div className="mb-1 text-[11px] font-semibold text-muted-foreground">{updn}</div>
                <ul className="flex flex-col gap-1.5">
                  {list.map((item, i) => (
                    <li
                      key={`${item.trainNo ?? i}-${item.lineId}`}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <SubwayLineBadge lineId={item.lineId} />
                        <span className="truncate">
                          {item.trainLineNm ?? item.destination ?? '행선 정보 없음'}
                        </span>
                        {item.isLastTrain && (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            막차
                          </Badge>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {item.arrivalMsg ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-2 text-right text-[11px] text-muted-foreground">
            갱신 {formatRelativeSec(data.fetchedAt)} · 30초마다 자동 갱신
          </p>
        </>
      )}
    </div>
  );
};
