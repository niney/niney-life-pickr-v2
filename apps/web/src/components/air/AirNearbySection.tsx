import { useState } from 'react';
import { Crosshair, ExternalLink, Loader2, MapPin, MapPinOff, Search } from 'lucide-react';
import { ApiError, useAirNearbyStations, useAirStationSearch, useUserLocation } from '@repo/shared';
import type {
  AirLocationItemType,
  AirLocationUpsertBodyType,
  AirMeasureItemType,
  AirNearbyStationItemType,
  AirStationInfoItemType,
} from '@repo/api-contract';
import {
  AIR_SIDO_OPTIONS,
  airSidoMatches,
  formatAirValue,
  formatDistanceM,
  formatRelativeMin,
  haversineM,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { useDebounced } from '~/lib/useDebounced';
import { cn } from '~/lib/utils';
import { AirStationsMap } from './AirStationsMap';
import { AirGradeBadge, AirStateBlock } from './AirPrimitives';

// 측정소 지도 · 내 주변 · 검색 · 내 위치 저장 — 측정소정보 API(좌표) 위에 실시간 등급을
// 얹는 섹션. 위치는 '내 위치로 찾기' 버튼을 눌렀을 때만 요청한다(진입만으로 권한 prompt
// 금지). 검색은 서버 캐시 로컬 검색이라 타이핑 즉시(디바운스 250ms).
//
// 내 대기 위치(저장 지점): '현재 위치 저장'(geolocation) 또는 '지도에서 직접 지정'(지도를
// 움직여 십자선 지점 저장, manual). 저장하면 상단바 칩이 그 지점으로 가장 가까운 측정소의
// 등급을 보여주고, 이 섹션의 '내 주변' 목록도 새 위치 요청 없이 저장 지점 기준으로 뜬다.

interface Props {
  stations: AirStationInfoItemType[];
  measures: AirMeasureItemType[];
  selectedStation: string | null;
  onSelect: (stationName: string, sidoOption: string | null) => void;
  // 내 대기 위치(하이브리드 훅 결과) — 페이지가 내려준다.
  savedLocation: AirLocationItemType | null;
  onSaveLocation: (body: AirLocationUpsertBodyType) => void;
  onClearLocation: () => void;
  savingLocation?: boolean;
  dim?: boolean;
}

const NEARBY_RADIUS_M = 20_000;
const NEARBY_LIMIT = 5;

const sidoOptionFor = (s: { sidoName: string | null }): string | null =>
  AIR_SIDO_OPTIONS.find(
    (o) => o.value !== '전국' && s.sidoName !== null && airSidoMatches(o.value, s.sidoName),
  )?.value ?? null;

// 지점에서 가장 가까운 측정소명(클라이언트 계산) — 저장 라벨용. 좌표 없는 측정소 제외.
const nearestStationName = (
  stations: AirStationInfoItemType[],
  p: { lat: number; lng: number },
): string | null => {
  let best: { name: string; d: number } | null = null;
  for (const s of stations) {
    if (s.lat === null || s.lng === null) continue;
    const d = haversineM(p, { lat: s.lat, lng: s.lng });
    if (!best || d < best.d) best = { name: s.stationName, d };
  }
  return best?.name ?? null;
};

export const AirNearbySection = ({
  stations,
  measures,
  selectedStation,
  onSelect,
  savedLocation,
  onSaveLocation,
  onClearLocation,
  savingLocation,
  dim,
}: Props) => {
  // 위치 — 명시 버튼으로만 요청(auto:false). 거부/미지원은 안내 문구.
  const location = useUserLocation({ auto: false });
  const geoCoords = location.status === 'granted' ? location.coords : null;
  // 내 주변 기준점 — 이번에 얻은 현재 위치가 있으면 그것, 아니면 저장 지점.
  const origin = geoCoords ?? (savedLocation ? { lat: savedLocation.lat, lng: savedLocation.lng } : null);
  const originKind: 'geo' | 'saved' | null = geoCoords ? 'geo' : savedLocation ? 'saved' : null;
  const nearbyQ = useAirNearbyStations(origin?.lat ?? null, origin?.lng ?? null, {
    radius: NEARBY_RADIUS_M,
    limit: NEARBY_LIMIT,
  });
  const nearby: AirNearbyStationItemType[] = nearbyQ.data?.items ?? [];

  // 검색 — 입력값은 즉시, 쿼리는 디바운스.
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 250);
  const searchQ = useAirStationSearch(debouncedQ);
  const searching = q.trim().length > 0;

  // 지도에서 직접 지정 — 십자선 모드 + 지도 중심 좌표.
  const [picking, setPicking] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);

  const locationHint =
    location.status === 'denied'
      ? '위치 권한이 거부되어 있습니다. 브라우저 사이트 설정에서 위치를 허용한 뒤 다시 누르세요.'
      : location.status === 'unavailable'
        ? '이 환경에서는 위치를 가져올 수 없습니다(비보안 HTTP·미지원 브라우저·시간 초과).'
        : null;

  const saveGeo = () => {
    if (!geoCoords) return;
    onSaveLocation({
      lat: geoCoords.lat,
      lng: geoCoords.lng,
      label: nearby[0]?.stationName ?? nearestStationName(stations, geoCoords),
      source: 'geolocation',
    });
  };
  const savePicked = () => {
    if (!mapCenter) return;
    onSaveLocation({
      lat: Number(mapCenter.lat.toFixed(6)),
      lng: Number(mapCenter.lng.toFixed(6)),
      label: nearestStationName(stations, mapCenter),
      source: 'manual',
    });
    setPicking(false);
  };

  return (
    <div className={cn('grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]', dim && 'opacity-60')}>
      <AirStationsMap
        stations={stations}
        measures={measures}
        selectedStation={selectedStation}
        onSelect={onSelect}
        myLocation={geoCoords}
        savedLocation={savedLocation}
        nearby={nearby}
        picking={picking}
        // 항상 구독 — MapCanvas 는 초기 1회 + moveend 에만 보고하므로, 지정 모드에 들어간
        // 시점에 이미 중심을 알고 있어야 '이 지점 저장'이 바로 활성화된다.
        onCenterChange={setMapCenter}
        className="h-[420px] w-full overflow-hidden rounded-md border lg:h-[560px]"
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

        {/* 내 대기 위치(저장 지점) */}
        <div className="flex flex-col gap-2 rounded-md border border-violet-500/30 bg-violet-500/5 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <MapPin className="size-4 text-violet-600 dark:text-violet-400" /> 내 대기 위치
              </div>
              <div className="text-[11px] text-muted-foreground">
                저장하면 상단바에 이 지점의 공기질이 항상 보입니다.
              </div>
            </div>
            {savedLocation && (
              <Button type="button" variant="ghost" size="sm" onClick={onClearLocation} disabled={savingLocation} aria-label="내 대기 위치 해제">
                <MapPinOff /> 해제
              </Button>
            )}
          </div>
          {savedLocation ? (
            <p className="text-xs">
              <span className="font-medium">{savedLocation.label ?? '저장 지점'}</span>
              <span className="text-muted-foreground">
                {' '}
                · {savedLocation.lat.toFixed(4)}, {savedLocation.lng.toFixed(4)} ·{' '}
                {savedLocation.source === 'geolocation' ? '내 위치로 찾기' : '지도에서 지정'} ·{' '}
                {formatRelativeMin(savedLocation.updatedAt)}
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">아직 저장한 위치가 없습니다.</p>
          )}
          {picking ? (
            <div className="flex flex-col gap-2 rounded-md bg-background/70 p-2 text-xs">
              <span>지도를 움직여 십자선을 원하는 지점에 맞춘 뒤 저장하세요.</span>
              <span className="text-muted-foreground tabular-nums">
                {mapCenter ? `${mapCenter.lat.toFixed(4)}, ${mapCenter.lng.toFixed(4)} · 가까운 측정소 ${nearestStationName(stations, mapCenter) ?? '-'}` : '지도 중심을 읽는 중…'}
              </span>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={savePicked} disabled={!mapCenter || savingLocation}>
                  이 지점 저장
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setPicking(false)}>
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)} disabled={savingLocation}>
                <Crosshair /> 지도에서 직접 지정
              </Button>
              {geoCoords && (
                <Button type="button" variant="outline" size="sm" onClick={saveGeo} disabled={savingLocation}>
                  <MapPin /> 현재 위치 저장
                </Button>
              )}
            </div>
          )}
        </div>

        {/* 내 주변 */}
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">내 주변 측정소</div>
              <div className="text-[11px] text-muted-foreground">
                반경 {NEARBY_RADIUS_M / 1000}km · 가까운 순 {NEARBY_LIMIT}곳
                {originKind === 'saved' && ' · 저장한 내 위치 기준'}
                {originKind === 'geo' && ' · 현재 위치 기준'}
              </div>
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
          {!origin && !locationHint && (
            <p className="text-xs text-muted-foreground">버튼을 누르면 현재 위치를 한 번 요청해 가까운 측정소를 찾습니다.</p>
          )}
          {origin && nearbyQ.isLoading && !nearbyQ.data && (
            <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-1.5 size-3.5 animate-spin" /> 가까운 측정소 찾는 중…
            </div>
          )}
          {origin && nearbyQ.isError && !nearbyQ.data && (
            <p className="text-xs text-destructive">
              {nearbyQ.error instanceof ApiError ? nearbyQ.error.message : '주변 측정소를 불러오지 못했습니다.'}
            </p>
          )}
          {origin && nearbyQ.data && nearby.length === 0 && (
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
