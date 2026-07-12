import type { ReactNode } from 'react';
import { ArrowUpRight, Bus, ChevronDown, Loader2 } from 'lucide-react';
import type {
  BusArrivalItemType,
  BusFavoriteRouteItemType,
  BusFavoriteStationItemType,
  SubwayArrivalItemType,
  SubwayFavoriteLineItemType,
  SubwayFavoriteStationItemType,
} from '@repo/api-contract';
import {
  useBusStationArrivals,
  useSubwayStationArrivals,
  type BusFavoritesApi,
  type SubwayFavoritesApi,
} from '@repo/shared';
import { isBusArrivalImminent, subwayLineName } from '@repo/utils';
import { Badge } from '~/components/ui/badge';
import { BusFavoriteStar } from '~/components/bus/BusFavoriteStar';
import { SubwayLineBadge } from '~/components/subway/SubwayLineBadge';
import { useTransitFavExpandStore } from '~/stores/transitFavExpandStore';

// 통합 즐겨찾기 섹션 — 버스·지하철 양 탭의 초기화면 최상단 공용. 4종(버스 정류장 /
// 버스 정류장×노선 / 지하철 역 / 지하철 역×호선)을 한 목록으로 보여준다. 도메인은
// 아이콘·호선색 뱃지로 구분한다(별도 섹션 헤더 없음).
//
// 데이터·토글은 두 즐겨찾기 훅에서 props 로 받는다 — 이 훅들은 로그인 직후 게스트
// 병합 부수효과를 갖고 "페이지당 1회만" 호출해야 하므로(hook 주석) 섹션이 직접
// 호출하지 않고 페이지가 넘긴다.
//
// 도착 미리보기는 **펼친 행에서만** 로드+폴링(30초)한다. 한 번에 하나만 펼치므로
// (useTransitFavExpandStore, 단일 아코디언) 도착 훅은 섹션당 최대 1개만 enabled →
// swopen 일일 쿼터를 보호한다. 펼침 상태는 데스크톱/모바일 동시 마운트 인스턴스가
// 스토어로 공유해 같은 queryKey 를 구독(React Query dedupe)하므로 네트워크는 1회.

// 행의 '이동' 액션이 페이지로 올려보내는 딥링크 의도. 페이지는 자기 도메인이면
// 기존 in-page 핸들러(동일 URL 계약)로, 상대 도메인이면 navigate 로 처리한다.
export type TransitFavTarget =
  | { kind: 'bus-station'; stId: string }
  | { kind: 'bus-route'; stId: string; busRouteId: string }
  | { kind: 'subway-station'; stationId: string }
  | { kind: 'subway-line'; stationId: string };

export interface TransitFavoritesSectionProps {
  // 두 즐겨찾기 훅 반환 그대로 — 목록·토글에 사용(파생 판정은 안 씀).
  bus: BusFavoritesApi;
  subway: SubwayFavoritesApi;
  onNavigate(target: TransitFavTarget): void;
}

// 병합 행 — 4종 판별 유니온. key 는 도메인+식별자 합성(펼침 스토어의 단일 키).
type Row =
  | { kind: 'bus-station'; key: string; item: BusFavoriteStationItemType }
  | { kind: 'bus-route'; key: string; item: BusFavoriteRouteItemType }
  | { kind: 'subway-station'; key: string; item: SubwayFavoriteStationItemType }
  | { kind: 'subway-line'; key: string; item: SubwayFavoriteLineItemType };

const targetOf = (row: Row): TransitFavTarget => {
  switch (row.kind) {
    case 'bus-station':
      return { kind: 'bus-station', stId: row.item.stId };
    case 'bus-route':
      return { kind: 'bus-route', stId: row.item.stId, busRouteId: row.item.busRouteId };
    case 'subway-station':
      return { kind: 'subway-station', stationId: row.item.stationId };
    case 'subway-line':
      return { kind: 'subway-line', stationId: row.item.stationId };
  }
};

// 미리보기 안내/상태 한 줄 — 로딩·에러·빈 상태 공용 톤(조용하고 담백하게).
const PreviewNote = ({ children }: { children: ReactNode }) => (
  <p className="px-1 py-1 text-xs text-muted-foreground">{children}</p>
);

// 도착 메시지는 업스트림 원문 그대로 노출(기존 패널과 동일 — 남은시간 재파싱
// 안 함). '곧 도착'은 패널과 같은 emerald 강조.
const BusArrivalLine = ({ item }: { item: BusArrivalItemType }) => {
  const imminent = isBusArrivalImminent(item.first?.message);
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="shrink-0 font-semibold tabular-nums">{item.routeName}</span>
      <span className="min-w-0">
        <span
          className={
            imminent
              ? 'font-semibold text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground'
          }
        >
          {item.first?.message ?? '도착 정보 없음'}
        </span>
        {item.second?.message ? (
          <span className="text-muted-foreground"> · {item.second.message}</span>
        ) : null}
      </span>
    </li>
  );
};

// 행선지 표기는 패널과 동일 우선순위(trainLineNm → '종착역행' → 미상), 뒤에 도착
// 보조문구(arvlMsg2). 카운트다운 tick 은 미리보기라 생략하고 원문만.
const SubwayArrivalLine = ({ item }: { item: SubwayArrivalItemType }) => {
  const dest =
    item.trainLineNm ?? (item.destination ? `${item.destination}행` : '행선지 미상');
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{item.updnLine}</span>
      <span className="min-w-0 flex-1 truncate">{dest}</span>
      {item.arrivalMsg ? (
        <span className="shrink-0 text-xs text-muted-foreground">{item.arrivalMsg}</span>
      ) : null}
    </li>
  );
};

// 방향(updnLine)별 첫 도착만 — items 는 서버가 도착 임박순(barvlDt asc)으로 정렬해
// 주므로 방향별 첫 등장 = 가장 이른 열차. 최대 2방향(상·하행).
const firstPerDirection = (
  items: SubwayArrivalItemType[],
  lineIdFilter?: string,
): SubwayArrivalItemType[] => {
  const seen = new Set<string>();
  const out: SubwayArrivalItemType[] = [];
  for (const it of items) {
    if (lineIdFilter && it.lineId !== lineIdFilter) continue;
    if (seen.has(it.updnLine)) continue;
    seen.add(it.updnLine);
    out.push(it);
    if (out.length >= 2) break;
  }
  return out;
};

export const TransitFavoritesSection = ({
  bus,
  subway,
  onNavigate,
}: TransitFavoritesSectionProps) => {
  const expandedKey = useTransitFavExpandStore((s) => s.expandedKey);
  const toggle = useTransitFavExpandStore((s) => s.toggle);

  // 병합 — 각 도메인 목록은 서버가 createdAt 오름차순으로 내려주므로 그 순서를
  // 보존한 채 도메인 단위로 이어 붙인다(항목별 createdAt 이 계약에 노출되지 않아
  // 도메인 간 진짜 인터리브는 불가 — BE 무변경 원칙). 버스(정류장→노선) → 지하철
  // (역→호선) 순.
  const rows: Row[] = [
    ...bus.stations.map((item) => ({
      kind: 'bus-station' as const,
      key: `bus-station:${item.stId}`,
      item,
    })),
    ...bus.routes.map((item) => ({
      kind: 'bus-route' as const,
      key: `bus-route:${item.stId}::${item.busRouteId}`,
      item,
    })),
    ...subway.stations.map((item) => ({
      kind: 'subway-station' as const,
      key: `subway-station:${item.stationId}`,
      item,
    })),
    ...subway.lines.map((item) => ({
      kind: 'subway-line' as const,
      key: `subway-line:${item.stationId}::${item.lineId}`,
      item,
    })),
  ];

  // 펼친 행 하나만 도착 훅에 연결 — 버스면 arsId, 지하철이면 stationId. 나머지
  // 훅은 null 로 disabled(동시 폴링 1개). 항목이 지워져 key 가 떠도 find→null →
  // 둘 다 disabled 라 유령 폴링이 남지 않는다.
  const expanded = rows.find((r) => r.key === expandedKey) ?? null;
  const busArsId =
    expanded?.kind === 'bus-station'
      ? expanded.item.arsId
      : expanded?.kind === 'bus-route'
        ? expanded.item.arsId
        : null;
  const subwayStationId =
    expanded?.kind === 'subway-station'
      ? expanded.item.stationId
      : expanded?.kind === 'subway-line'
        ? expanded.item.stationId
        : null;
  const busArrivals = useBusStationArrivals(busArsId);
  const subwayArrivals = useSubwayStationArrivals(subwayStationId);

  const renderBusPreview = (row: Extract<Row, { kind: 'bus-station' | 'bus-route' }>) => {
    // 가상정류장(arsId '0')은 도착 조회 불가 — 훅도 disabled. 기존 정책과 동일 안내.
    if (row.item.arsId === '0') {
      return <PreviewNote>가상정류장 — 도착정보를 제공하지 않습니다.</PreviewNote>;
    }
    if (busArrivals.isError) {
      return <PreviewNote>도착정보를 불러오지 못했습니다.</PreviewNote>;
    }
    // data 없음 = 로딩·재시도 일시정지(비가시 탭에서 RQ가 retry 를 pause — status
    // pending·fetchStatus paused) 포함. 빈 상태 문구는 성공 응답에만 — pending 을
    // "정보 없음"으로 오표시하지 않는다.
    if (!busArrivals.data) {
      return (
        <PreviewNote>
          <Loader2 className="mr-1 inline size-3 animate-spin" />
          도착정보 불러오는 중…
        </PreviewNote>
      );
    }
    const items = busArrivals.data.items;
    // 노선 조합은 그 노선만, 정류장은 상위 3노선 요약.
    const shown =
      row.kind === 'bus-route'
        ? items.filter((i) => i.busRouteId === row.item.busRouteId)
        : items.slice(0, 3);
    if (shown.length === 0) {
      return <PreviewNote>표시할 도착 정보가 없습니다.</PreviewNote>;
    }
    return (
      <ul className="flex flex-col gap-1">
        {shown.map((it) => (
          <BusArrivalLine key={it.busRouteId} item={it} />
        ))}
      </ul>
    );
  };

  const renderSubwayPreview = (
    row: Extract<Row, { kind: 'subway-station' | 'subway-line' }>,
  ) => {
    if (subwayArrivals.isError) {
      return <PreviewNote>도착정보를 불러오지 못했습니다.</PreviewNote>;
    }
    // data 없음 = 로딩·재시도 일시정지 포함(위 renderBusPreview 주석 참조).
    if (!subwayArrivals.data) {
      return (
        <PreviewNote>
          <Loader2 className="mr-1 inline size-3 animate-spin" />
          도착정보 불러오는 중…
        </PreviewNote>
      );
    }
    const items = subwayArrivals.data.items;
    // 역×호선은 그 호선만, 역은 전체에서 방향별 첫 도착.
    const shown = firstPerDirection(
      items,
      row.kind === 'subway-line' ? row.item.lineId : undefined,
    );
    if (shown.length === 0) {
      return <PreviewNote>표시할 도착 정보가 없습니다.</PreviewNote>;
    }
    return (
      <ul className="flex flex-col gap-1">
        {shown.map((it) => (
          <SubwayArrivalLine key={`${it.updnLine}:${it.trainNo ?? it.destination ?? ''}`} item={it} />
        ))}
      </ul>
    );
  };

  return (
    <div>
      <h3 className="mb-1.5 px-1 text-xs font-semibold text-muted-foreground">즐겨찾기</h3>
      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => {
          const isOpen = row.key === expandedKey;
          return (
            <li key={row.key} className="rounded-md">
              <div className="flex items-center gap-1">
                {/* 행 탭 = 아코디언 펼침. 별·이동 버튼과 형제로 둔다(버튼 중첩 회피). */}
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggle(row.key)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/50"
                >
                  <RowHeader row={row} />
                  <ChevronDown
                    className={`ml-auto size-4 shrink-0 text-muted-foreground transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {/* 이동 — 해당 도메인 탭 딥링크(기존 즐겨찾기 진입과 동일 URL 계약). */}
                <button
                  type="button"
                  onClick={() => onNavigate(targetOf(row))}
                  aria-label={`${rowLabel(row)} 열기`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ArrowUpRight className="size-4" />
                </button>
                <FavStar row={row} bus={bus} subway={subway} />
              </div>
              {isOpen && (
                <div className="px-3 pb-2.5 pt-0.5">
                  {row.kind === 'bus-station' || row.kind === 'bus-route'
                    ? renderBusPreview(row)
                    : renderSubwayPreview(row)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// 행 좌측 본문 — 도메인 아이콘/뱃지로 4종을 구분한다.
const RowHeader = ({ row }: { row: Row }) => {
  switch (row.kind) {
    case 'bus-station':
      return (
        <>
          <Bus className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <span className="truncate font-medium">{row.item.name}</span>
          {row.item.arsId !== '0' && (
            <Badge variant="secondary" className="shrink-0 tabular-nums">
              {row.item.arsId}
            </Badge>
          )}
        </>
      );
    case 'bus-route':
      return (
        <>
          <Bus className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <span className="shrink-0 font-semibold tabular-nums">{row.item.routeName}</span>
          <span className="truncate text-muted-foreground">{row.item.stationName}</span>
        </>
      );
    case 'subway-station':
      return (
        <>
          <span className="truncate font-medium">{row.item.name}</span>
          <span className="flex shrink-0 items-center gap-1">
            {row.item.lines.map((lineId) => (
              <SubwayLineBadge key={lineId} lineId={lineId} />
            ))}
          </span>
        </>
      );
    case 'subway-line':
      return (
        <>
          <span className="truncate font-medium">{row.item.stationName}</span>
          <SubwayLineBadge lineId={row.item.lineId} />
        </>
      );
  }
};

// 접근성 라벨용 — 이동 버튼 aria-label 조립.
const rowLabel = (row: Row): string => {
  switch (row.kind) {
    case 'bus-station':
      return row.item.name;
    case 'bus-route':
      return `${row.item.routeName} ${row.item.stationName}`;
    case 'subway-station':
      return row.item.name;
    case 'subway-line':
      return `${row.item.stationName} ${subwayLineName(row.item.lineId)}`;
  }
};

// 별(즐겨찾기 해제) — 도메인별 토글로 라우팅. BusFavoriteStar 를 지하철도 공용으로 쓴다.
const FavStar = ({
  row,
  bus,
  subway,
}: {
  row: Row;
  bus: BusFavoritesApi;
  subway: SubwayFavoritesApi;
}) => {
  switch (row.kind) {
    case 'bus-station':
      return (
        <BusFavoriteStar
          active
          onToggle={() => bus.toggleStation(row.item)}
          label={`${row.item.name} 즐겨찾기 해제`}
        />
      );
    case 'bus-route':
      return (
        <BusFavoriteStar
          active
          onToggle={() => bus.toggleRoute(row.item)}
          label={`${row.item.routeName} 즐겨찾기 해제`}
        />
      );
    case 'subway-station':
      return (
        <BusFavoriteStar
          active
          onToggle={() => subway.toggleStation(row.item)}
          label={`${row.item.name} 즐겨찾기 해제`}
        />
      );
    case 'subway-line':
      return (
        <BusFavoriteStar
          active
          onToggle={() => subway.toggleLine(row.item)}
          label={`${row.item.stationName} ${subwayLineName(row.item.lineId)} 즐겨찾기 해제`}
        />
      );
  }
};
