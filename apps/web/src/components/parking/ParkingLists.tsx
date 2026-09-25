import { Loader2 } from 'lucide-react';
import type {
  EvNearbyResultType,
  EvStationNearbyItemType,
  ParkingAirportType,
  ParkingLotNearbyItemType,
  ParkingLotNearbyResultType,
} from '@repo/api-contract';
import {
  EV_LEVEL_COLOR,
  EV_LEVEL_LABEL,
  PARKING_LEVEL_LABEL,
  approxDistanceM,
  formatDistanceM,
  formatParkingFeeRule,
  parkingLevelColor,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { feeRuleOf, lotTypeLine } from './parkingFormat';

// 주차 주변 목록 — 탭마다 하나. 지도 중심 기준 거리순(공항은 전국 14곳을 거리순). 행 클릭 = 선택(URL sel) + 지도 이동.
// filters 슬롯: 머리 행 바로 아래 — 모바일 시트에선 peek 에 머리 행만 보이고 half 부터 필터 칩이 따라오게 여기 끼운다.

const Head = ({ title, meta }: { title: string; meta: string }) => (
  <div className="flex items-center gap-2 px-3 pt-2">
    <span className="text-sm font-semibold">{title}</span>
    <span className="ml-auto text-[11px] text-muted-foreground">{meta}</span>
  </div>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center justify-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>
);

const Row = ({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) => (
  <li>
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={cn('flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent/60', selected && 'bg-accent')}
    >
      {children}
    </button>
  </li>
);

const Dot = ({ color }: { color: string }) => <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />;

// ── 주차장 ──
interface LotProps {
  data: ParkingLotNearbyResultType | undefined;
  isLoading: boolean;
  isError: boolean;
  radiusM: number;
  selectedId: string | null;
  onSelect: (item: ParkingLotNearbyItemType) => void;
  filters?: React.ReactNode;
}

export const ParkingLotList = ({ data, isLoading, isError, radiusM, selectedId, onSelect, filters }: LotProps) => (
  <div className="flex min-h-0 flex-1 flex-col">
    <Head title="주변 주차장" meta={`지도 중심 ${formatDistanceM(radiusM)} 안${data ? ` · ${data.total.toLocaleString('ko-KR')}곳` : ''}`} />
    {filters}
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="parking-lot-list">
      {isError && !data ? (
        <Empty>주차장 정보를 불러오지 못했습니다(적재 전일 수 있음).</Empty>
      ) : isLoading && !data ? (
        <Empty>
          <Loader2 className="size-4 animate-spin" /> 주변을 찾는 중…
        </Empty>
      ) : !data || data.items.length === 0 ? (
        <Empty>지도 중심 {formatDistanceM(radiusM)} 안에 주차장이 없습니다. 지도를 옮기거나 필터를 풀어 보세요.</Empty>
      ) : (
        <ul className="divide-y">
          {data.items.map((item) => {
            const live = item.live;
            return (
              <Row key={item.id} selected={selectedId === item.id} onClick={() => onSelect(item)}>
                <Dot color={parkingLevelColor(live?.level)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {lotTypeLine(item)}
                    {item.feeType !== 'free' && item.fee.baseFee !== null ? ` · ${formatParkingFeeRule(feeRuleOf(item))}` : ''}
                  </span>
                  {live && live.available !== null && (
                    <span className="mt-0.5 block text-xs font-medium" style={{ color: parkingLevelColor(live.level) }}>
                      {live.level ? PARKING_LEVEL_LABEL[live.level] : '실시간'} · 여석 {live.available.toLocaleString('ko-KR')}
                      {live.total !== null ? ` / ${live.total.toLocaleString('ko-KR')}` : ''}
                    </span>
                  )}
                </span>
                <span className="ml-auto shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{formatDistanceM(item.dist)}</span>
              </Row>
            );
          })}
        </ul>
      )}
    </div>
  </div>
);

// ── 충전소 ──
interface EvProps {
  data: EvNearbyResultType | undefined;
  isLoading: boolean;
  isError: boolean;
  radiusM: number;
  selectedId: string | null;
  onSelect: (item: EvStationNearbyItemType) => void;
  filters?: React.ReactNode;
}

export const EvList = ({ data, isLoading, isError, radiusM, selectedId, onSelect, filters }: EvProps) => (
  <div className="flex min-h-0 flex-1 flex-col">
    <Head title="주변 충전소" meta={`지도 중심 ${formatDistanceM(radiusM)} 안${data ? ` · ${data.total.toLocaleString('ko-KR')}곳` : ''}`} />
    {filters}
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="parking-ev-list">
      {isError && !data ? (
        <Empty>충전소 정보를 불러오지 못했습니다(적재 전일 수 있음).</Empty>
      ) : isLoading && !data ? (
        <Empty>
          <Loader2 className="size-4 animate-spin" /> 주변을 찾는 중…
        </Empty>
      ) : !data || data.items.length === 0 ? (
        <Empty>지도 중심 {formatDistanceM(radiusM)} 안에 충전소가 없습니다. 지도를 옮기거나 필터를 풀어 보세요.</Empty>
      ) : (
        <ul className="divide-y">
          {data.items.map((item) => (
            <Row key={item.id} selected={selectedId === item.id} onClick={() => onSelect(item)}>
              <Dot color={EV_LEVEL_COLOR[item.level]} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.fastCount > 0 ? `급속 ${item.fastCount}` : ''}
                  {item.fastCount > 0 && item.chargerCount - item.fastCount > 0 ? ' · ' : ''}
                  {item.chargerCount - item.fastCount > 0 ? `완속 ${item.chargerCount - item.fastCount}` : ''}
                  {item.operator ? ` · ${item.operator}` : ''}
                </span>
                <span className="mt-0.5 block text-xs font-medium" style={{ color: EV_LEVEL_COLOR[item.level] }}>
                  {item.level === 'available' ? `사용 가능 ${item.availableCount}기` : EV_LEVEL_LABEL[item.level]}
                  {item.parkingFree === true ? <span className="ml-1.5 font-normal text-muted-foreground">주차료 무료</span> : null}
                  {item.limited === true ? <span className="ml-1.5 font-normal text-muted-foreground">이용 제한</span> : null}
                </span>
              </span>
              <span className="ml-auto shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{formatDistanceM(item.dist)}</span>
            </Row>
          ))}
        </ul>
      )}
    </div>
  </div>
);

// ── 공항 ──
interface AirportProps {
  airports: ParkingAirportType[] | undefined;
  isLoading: boolean;
  isError: boolean;
  center: { lat: number; lng: number };
  selectedCode: string | null;
  onSelect: (airport: ParkingAirportType) => void;
  fetchedAt: string | null;
  stale: boolean;
}

export const AirportList = ({ airports, isLoading, isError, center, selectedCode, onSelect, fetchedAt, stale }: AirportProps) => {
  const sorted = (airports ?? [])
    .map((a) => ({ a, dist: Math.round(approxDistanceM(center, { lat: a.lat, lng: a.lng })) }))
    .sort((x, y) => x.dist - y.dist);
  const at = fetchedAt ? new Date(fetchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }) : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Head title="공항 주차장" meta={at ? `${at} 기준${stale ? ' · 일부 이전 값' : ''}` : '아직 받지 못함'} />
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="parking-airport-list">
        {isError && !airports ? (
          <Empty>공항 주차 정보를 불러오지 못했습니다.</Empty>
        ) : isLoading && !airports ? (
          <Empty>
            <Loader2 className="size-4 animate-spin" /> 불러오는 중…
          </Empty>
        ) : (
          <ul className="divide-y">
            {sorted.map(({ a, dist }) => {
              const full = a.lots.filter((l) => l.level === 'full').length;
              const rate = a.total !== null && a.occupied !== null && a.total > 0 ? Math.round((a.occupied / a.total) * 100) : null;
              return (
                <Row key={a.code} selected={selectedCode === a.code} onClick={() => onSelect(a)}>
                  <Dot color={parkingLevelColor(a.level)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.lots.length === 0
                        ? '실시간 정보 없음'
                        : `주차장 ${a.lots.length}곳${rate !== null ? ` · 전체 ${rate}% 사용` : ''}${full > 0 ? ` · 만차 ${full}곳` : ''}`}
                    </span>
                    {a.level && (
                      <span className="mt-0.5 block text-xs font-medium" style={{ color: parkingLevelColor(a.level) }}>
                        {PARKING_LEVEL_LABEL[a.level]}
                      </span>
                    )}
                  </span>
                  <span className="ml-auto shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{formatDistanceM(dist)}</span>
                </Row>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
