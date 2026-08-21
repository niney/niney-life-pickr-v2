import { useState } from 'react';
import { Crosshair, ExternalLink, Loader2, Search } from 'lucide-react';
import { ApiError, useAirNearbyStations, useAirStationSearch, useUserLocation } from '@repo/shared';
import type {
  AirMeasureItemType,
  AirNearbyStationItemType,
  AirStationInfoItemType,
} from '@repo/api-contract';
import { AIR_SIDO_OPTIONS, airSidoMatches, formatAirValue, formatDistanceM } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { useDebounced } from '~/lib/useDebounced';
import { cn } from '~/lib/utils';
import { AirStationsMap } from './AirStationsMap';
import { AirGradeBadge, AirStateBlock } from './AirPrimitives';

// 측정소 지도 · 내 주변 · 검색 — 측정소정보 API(좌표) 위에 실시간 등급을 얹는 섹션.
// 위치는 '내 위치로 찾기' 버튼을 눌렀을 때만 요청한다(진입만으로 권한 prompt 금지).
// 검색은 서버 캐시 로컬 검색이라 타이핑 즉시(디바운스 250ms).

interface Props {
  stations: AirStationInfoItemType[];
  measures: AirMeasureItemType[];
  selectedStation: string | null;
  onSelect: (stationName: string, sidoOption: string | null) => void;
  dim?: boolean;
}

const NEARBY_RADIUS_M = 20_000;
const NEARBY_LIMIT = 5;

const sidoOptionFor = (s: { sidoName: string | null }): string | null =>
  AIR_SIDO_OPTIONS.find(
    (o) => o.value !== '전국' && s.sidoName !== null && airSidoMatches(o.value, s.sidoName),
  )?.value ?? null;

export const AirNearbySection = ({ stations, measures, selectedStation, onSelect, dim }: Props) => {
  // 위치 — 명시 버튼으로만 요청(auto:false). 거부/미지원은 안내 문구.
  const location = useUserLocation({ auto: false });
  const coords = location.status === 'granted' ? location.coords : null;
  const nearbyQ = useAirNearbyStations(coords?.lat ?? null, coords?.lng ?? null, {
    radius: NEARBY_RADIUS_M,
    limit: NEARBY_LIMIT,
  });
  const nearby: AirNearbyStationItemType[] = nearbyQ.data?.items ?? [];

  // 검색 — 입력값은 즉시, 쿼리는 디바운스.
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 250);
  const searchQ = useAirStationSearch(debouncedQ);
  const searching = q.trim().length > 0;

  const locationHint =
    location.status === 'denied'
      ? '위치 권한이 거부되어 있습니다. 브라우저 사이트 설정에서 위치를 허용한 뒤 다시 누르세요.'
      : location.status === 'unavailable'
        ? '이 환경에서는 위치를 가져올 수 없습니다(비보안 HTTP·미지원 브라우저·시간 초과).'
        : null;

  return (
    <div className={cn('grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]', dim && 'opacity-60')}>
      <AirStationsMap
        stations={stations}
        measures={measures}
        selectedStation={selectedStation}
        onSelect={onSelect}
        myLocation={coords}
        nearby={nearby}
        className="h-[420px] w-full overflow-hidden rounded-md border lg:h-[520px]"
      />
      <div className="flex min-w-0 flex-col gap-4">
        {/* 검색 */}
        <div className="flex flex-col gap-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="측정소명·주소 검색 (예: 종로, 분당, 해운대)"
              className="pl-8"
              aria-label="측정소 검색"
            />
          </label>
          {searching && (
            <div className="max-h-56 overflow-auto rounded-md border">
              {searchQ.isLoading && !searchQ.data ? (
                <div className="flex h-12 items-center justify-center text-xs text-muted-foreground">
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> 검색 중…
                </div>
              ) : searchQ.isError ? (
                <div className="px-3 py-2 text-xs text-destructive">검색에 실패했습니다.</div>
              ) : (searchQ.data?.items.length ?? 0) === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">일치하는 측정소가 없습니다.</div>
              ) : (
                <ul className={cn('divide-y', searchQ.isPlaceholderData && 'opacity-60')}>
                  {searchQ.data!.items.slice(0, 8).map((s) => (
                    <li key={`${s.stationName}|${s.addr}`}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(s.stationName, sidoOptionFor(s));
                          setQ('');
                        }}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:bg-accent"
                      >
                        <span className="text-sm font-medium">
                          {s.stationName}
                          {s.mangName && <span className="ml-1 text-xs font-normal text-muted-foreground">{s.mangName}</span>}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{s.addr}</span>
                      </button>
                    </li>
                  ))}
                  {searchQ.data && searchQ.data.total > 8 && (
                    <li className="px-3 py-1 text-[11px] text-muted-foreground">
                      {searchQ.data.total}건 중 8건 표시 — 검색어를 더 구체적으로
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* 내 주변 */}
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">내 주변 측정소</div>
              <div className="text-[11px] text-muted-foreground">반경 {NEARBY_RADIUS_M / 1000}km · 가까운 순 {NEARBY_LIMIT}곳</div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => location.refetch()}
              disabled={location.status === 'pending'}
            >
              {location.status === 'pending' ? <Loader2 className="animate-spin" /> : <Crosshair />}
              내 위치로 찾기
            </Button>
          </div>
          {locationHint && <p className="text-xs text-muted-foreground">{locationHint}</p>}
          {!coords && !locationHint && (
            <p className="text-xs text-muted-foreground">버튼을 누르면 현재 위치를 한 번 요청해 가까운 측정소를 찾습니다.</p>
          )}
          {coords && nearbyQ.isLoading && !nearbyQ.data && (
            <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-1.5 size-3.5 animate-spin" /> 가까운 측정소 찾는 중…
            </div>
          )}
          {coords && nearbyQ.isError && !nearbyQ.data && (
            <p className="text-xs text-destructive">
              {nearbyQ.error instanceof ApiError ? nearbyQ.error.message : '주변 측정소를 불러오지 못했습니다.'}
            </p>
          )}
          {coords && nearbyQ.data && nearby.length === 0 && (
            <p className="text-xs text-muted-foreground">반경 {NEARBY_RADIUS_M / 1000}km 안에 측정소가 없습니다.</p>
          )}
          {nearby.length > 0 && (
            <ol className={cn('flex flex-col divide-y', nearbyQ.isPlaceholderData && 'opacity-60')}>
              {nearby.map((n) => {
                const selected = n.stationName === selectedStation;
                return (
                  <li key={`${n.stationName}|${n.addr}`}>
                    <button
                      type="button"
                      onClick={() => onSelect(n.stationName, sidoOptionFor(n))}
                      aria-pressed={selected}
                      className={cn(
                        'flex w-full items-center gap-2 py-1.5 text-left hover:bg-accent/60 focus-visible:outline-none focus-visible:bg-accent',
                        selected && 'font-semibold',
                      )}
                    >
                      <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">{formatDistanceM(n.dist)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{n.stationName}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{n.addr}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
                        {n.measure ? (
                          <>
                            <span title="PM10 / PM2.5">
                              {formatAirValue('pm10', n.measure.pm10)}/{formatAirValue('pm25', n.measure.pm25)}
                            </span>
                            <AirGradeBadge grade={n.measure.khaiGrade} />
                          </>
                        ) : (
                          <span className="text-muted-foreground">측정값 없음</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          마커색 = 현재 통합대기환경지수 등급(회색은 측정값 없음). 마커를 누르면 위 상세가 그 측정소로 바뀝니다.{' '}
          좌표·주소는 측정소정보 API(
          <a
            href="https://www.data.go.kr/data/15073877/openapi.do"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-0.5 underline-offset-2 hover:text-foreground hover:underline"
          >
            15073877 <ExternalLink className="size-3" />
          </a>
          ) 기준.
        </p>
      </div>
    </div>
  );
};

// 측정소정보 API 오류 안내 — 활용신청 전(인증 30)은 키 설정이 아니라 '신청'이 필요하다는
// 점을 분명히 한다(다른 대기 섹션의 503 문구와 구분).
export const AirStationsErrorBlock = ({ error, onRetry, retrying }: { error: unknown; onRetry: () => void; retrying: boolean }) => {
  const apiErr = error instanceof ApiError ? error : null;
  const needsApply = apiErr?.statusCode === 503 && /\(30[:)]|등록되지 않은 서비스키/.test(apiErr.message);
  if (needsApply) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center text-sm">
        <p className="font-medium">측정소정보 API(15073877) 활용신청이 아직 없습니다.</p>
        <p className="text-xs text-muted-foreground">
          공공데이터포털에서 <b>한국환경공단_에어코리아_측정소정보</b>를 같은 계정으로 활용신청(개발계정 자동승인)하면
          같은 키로 지도·내 주변이 바로 동작합니다. 승인 반영까지 수십 분~반나절 걸릴 수 있습니다.
        </p>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="https://www.data.go.kr/data/15073877/openapi.do" target="_blank" rel="noreferrer noopener">
              활용신청 페이지 열기 <ExternalLink />
            </a>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRetry} disabled={retrying}>
            다시 시도
          </Button>
        </div>
      </div>
    );
  }
  return (
    <AirStateBlock
      kind="error"
      message={
        apiErr?.statusCode === 502
          ? `에어코리아 측정소정보 API가 응답하지 않습니다. (${apiErr.message})`
          : apiErr
            ? `측정소 목록을 불러오지 못했습니다. (${apiErr.message})`
            : '측정소 목록을 불러오지 못했습니다.'
      }
      onRetry={onRetry}
      retrying={retrying}
    />
  );
};
