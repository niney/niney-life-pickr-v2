import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, RotateCw, X } from 'lucide-react';
import { ApiError, useMapPublicConfig } from '@repo/shared';
import type {
  SubwayLineDetailResultType,
  SubwayLineStationItemType,
  SubwayStationGroupItemType,
} from '@repo/api-contract';
import {
  buildMyLocationMarkerDataUrl,
  buildSubwayStationMarkerDataUrl,
  buildSubwayStopDotDataUrl,
} from '@repo/utils';
import {
  MapCanvas,
  type MapCanvasHandle,
  type MapMarker,
  type MapViewport,
} from '~/components/restaurant/MapCanvas';
import { SubwayLineBadge } from './SubwayLineBadge';

// 모듈 레벨 상수 — 선택×환승 4종을 미리 만들어 모든 마커가 같은 data URL 문자열을
// 공유한다(OL 아이콘 캐시가 이미지를 1회만 디코드). 정류장 마커와 규격이 같아
// (26×26 원 / 32×48 핀) MapCanvas 의 라벨 offset·축소 스케일이 그대로 유효하다.
const STATION_URL = buildSubwayStationMarkerDataUrl({ selected: false, transfer: false });
const STATION_SELECTED_URL = buildSubwayStationMarkerDataUrl({ selected: true, transfer: false });
const TRANSFER_URL = buildSubwayStationMarkerDataUrl({ selected: false, transfer: true });
const TRANSFER_SELECTED_URL = buildSubwayStationMarkerDataUrl({ selected: true, transfer: true });
// 내 위치 마커 — 버스와 공용(파란 점). 선택 개념이 없어 1종.
const MY_LOCATION_MARKER_URL = buildMyLocationMarkerDataUrl();
// 내 위치 마커 id — 역 마커와 충돌 없는 고정 id, 클릭은 무시.
const MY_LOCATION_ID = 'my-location';

// 역 선택 시 확대 포커스 목표 줌 — 식당 지도의 ZOOM_IN_LEVEL(및 fitToMarkers
// maxZoom)과 통일한 17. flyToZoomIn 이라 현재 줌이 더 크면 그대로 둔다(줌아웃 없음).
const SUBWAY_SELECT_ZOOM = 17;

// 재검색(수동/자동) 트리거 임계 — 기준점에서 지도 중심이 이만큼 벗어나야. 역 간격이
// 버스 정류장보다 넓어 버스(300m)보다 완화한 500m.
const RESEARCH_THRESHOLD_M = 500;
// 자동 재조회 최소 줌 — 역 밀도가 낮아 버스(15)보다 완화한 13. 그보다 멀면 자동
// 조회는 의미가 없어(30그룹 절단만 남음) 수동 버튼으로 강등.
const AUTO_RESEARCH_MIN_ZOOM = 13;
// 자동 재조회 최소 간격 — 트레일링 예약이라 마지막 이동은 반드시 조회된다.
const AUTO_RESEARCH_MIN_INTERVAL_MS = 1_200;

// 등거리 사각 근사 거리(m) — 이탈 판정에는 하버사인급 정밀도가 불필요.
const approxDistanceM = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const mPerLatDeg = 111_320;
  const dLat = (a.lat - b.lat) * mPerLatDeg;
  const dLng = (a.lng - b.lng) * mPerLatDeg * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

interface Props {
  // 역명 그룹 — 그룹당 마커 1개(대표 좌표). 2개 이상 호선 = 환승(이중 링).
  groups: SubwayStationGroupItemType[];
  selectedId: string | null;
  onSelect(id: string): void;
  // 주변 모드의 조회 기준점(Geolocation 내 위치 또는 지도 재검색 좌표) — 파란 점
  // 마커. 없으면 미표시.
  myLocation?: { lat: number; lng: number } | null;
  // '이 위치에서 재검색'(수동) — 자동 조건이 아닐 때 버튼으로 지도 중심을 넘긴다.
  onResearchAt?(center: { lat: number; lng: number }): void;
  // 자동 재조회 — 줌이 충분히 가까울 때 사용자 패닝이 끝나면 지도 중심으로 조회.
  onAutoResearchAt?(center: { lat: number; lng: number }): void;
  // 자동 재조회/노선 추적 중 fitToMarkers 억제 — 사용자가 보던 화면을 지도가
  // 되받아치지 않게(노선 경유역 점이 화면을 줌아웃시키지 않게).
  suppressFit?: boolean;
  // 주변 조회 진행 중 — 지도 상단 로딩 칩.
  loading?: boolean;
  // 5차 — 추적 호선 상세(sections). 있으면 폴리라인 + 경유역 점을 그린다.
  lineDetail?: SubwayLineDetailResultType | null;
  // 추적 호선색(subwayLineColor) — 폴리라인·경유역 점 공용.
  lineColor?: string;
  // 경유역 점 클릭 — 역 마커(onSelect)와 분리된 채널(환승역 id 재해석은 호출부에서).
  onSelectStop?(stationId: string): void;
  // 노선 정보 카드 '노선 닫기'.
  onCloseLine?(): void;
  className?: string;
}

// 역 검색/주변/노선 결과를 vworld 지도에 마커+폴리라인으로. 키 로딩/미등록/에러
// 3분기는 BusStationsMap 과 동일 정책(문구만 지하철용). 자동 재조회 파이프라인은
// 버스 3차 검증본 이식. 노선 형상은 MapCanvas routeLine(별도 소스)이라 fit 대상에서
// 제외되고, 경유역 점은 마커 소스라 노선 추적 중 suppressFit 로 줌아웃을 막는다.
export const SubwayStationsMap = ({
  groups,
  selectedId,
  onSelect,
  myLocation,
  onResearchAt,
  onAutoResearchAt,
  suppressFit,
  loading,
  lineDetail,
  lineColor,
  onSelectStop,
  onCloseLine,
}: Props) => {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  // 키 미등록은 404 — ApiError statusCode 로 분기.
  const keyMissing =
    config.isError && config.error instanceof ApiError && config.error.statusCode === 404;

  const handleRef = useRef<MapCanvasHandle>(null);

  // 폴리라인 — 각 section 을 개별 줄로(이어지지 않는 지선이 지그재그가 되지 않게).
  // 순환(isLoop)은 첫 좌표를 끝에 복제해 닫는다. 색은 호선색 공용.
  const routeLines = useMemo(() => {
    if (!lineDetail || !lineColor) return null;
    return lineDetail.sections.map((sec) => {
      const points = sec.stations.map((s) => ({ lat: s.lat, lng: s.lng }));
      if (sec.isLoop && points.length > 1) points.push({ ...points[0]! });
      return { points, color: lineColor };
    });
  }, [lineDetail, lineColor]);

  // 경유역 점 — 추적 호선의 stations(중복 stationId 제거). 활성 결과(groups)에 같은
  // 역명 그룹이 이미 있으면 그 마커가 우선이라 점을 생략(환승역 이중 마커 방지).
  const lineStops = useMemo<SubwayLineStationItemType[]>(() => {
    if (!lineDetail) return [];
    const groupNames = new Set(groups.map((g) => g.name));
    const seen = new Set<string>();
    const out: SubwayLineStationItemType[] = [];
    for (const sec of lineDetail.sections) {
      for (const st of sec.stations) {
        if (seen.has(st.stationId)) continue;
        seen.add(st.stationId);
        if (groupNames.has(st.name)) continue;
        out.push(st);
      }
    }
    return out;
  }, [lineDetail, groups]);

  const stopIds = useMemo(() => new Set(lineStops.map((s) => s.stationId)), [lineStops]);
  // 점 마커 2종(일반/환승) — 호선색 고정이라 memo 로 공유(OL 아이콘 캐시).
  const stopDotUrl = useMemo(
    () => (lineColor ? buildSubwayStopDotDataUrl(lineColor, false) : ''),
    [lineColor],
  );
  const stopDotTransferUrl = useMemo(
    () => (lineColor ? buildSubwayStopDotDataUrl(lineColor, true) : ''),
    [lineColor],
  );

  const markers: MapMarker[] = useMemo(() => {
    // 경유역 점을 먼저(아래) 그려 역 마커/내 위치가 위에 오게 한다. 라벨 없음.
    const stopMarkers: MapMarker[] = lineStops.map((s) => {
      const url = s.isTransfer ? stopDotTransferUrl : stopDotUrl;
      return {
        id: s.stationId,
        lat: s.lat,
        lng: s.lng,
        icon: { src: url, selectedSrc: url },
      };
    });
    const stationMarkers: MapMarker[] = groups.map((g) => {
      const transfer = g.lines.length > 1;
      return {
        id: g.id,
        lat: g.lat,
        lng: g.lng,
        label: g.name,
        icon: transfer
          ? { src: TRANSFER_URL, selectedSrc: TRANSFER_SELECTED_URL }
          : { src: STATION_URL, selectedSrc: STATION_SELECTED_URL },
      };
    });
    const out = [...stopMarkers, ...stationMarkers];
    if (myLocation) {
      out.push({
        id: MY_LOCATION_ID,
        lat: myLocation.lat,
        lng: myLocation.lng,
        icon: { src: MY_LOCATION_MARKER_URL, selectedSrc: MY_LOCATION_MARKER_URL },
      });
    }
    return out;
  }, [groups, myLocation, lineStops, stopDotUrl, stopDotTransferUrl]);

  // 사용자가 직접 패닝/줌을 끝낸 시점의 지도 상태 — MapCanvas 가 programmatic
  // move(fit/flyTo)는 걸러주므로 여기엔 사용자 이동만 쌓인다.
  const [userView, setUserView] = useState<{ lat: number; lng: number; zoom: number } | null>(
    null,
  );
  const lastAutoAtRef = useRef(0);
  // 트레일링 예약 타이머 — 스로틀 간격 안에 온 이벤트를 버리지 않고 남은 시간 뒤에
  // 마지막 좌표로 발사한다(드롭하면 "패닝을 멈췄는데 조회가 영영 안 나가는" 미표시).
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    },
    [],
  );
  const handleViewportChangeEnd = useCallback(
    (vp: MapViewport) => {
      const center = { lat: vp.centerLat, lng: vp.centerLng };
      setUserView({ ...center, zoom: vp.zoom });
      // 자동 재조회 — 줌이 충분히 가깝고 기준점에서 임계 이상 벗어났을 때만.
      if (
        onAutoResearchAt &&
        myLocation &&
        vp.zoom >= AUTO_RESEARCH_MIN_ZOOM &&
        approxDistanceM(myLocation, center) > RESEARCH_THRESHOLD_M
      ) {
        if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
        const fire = () => {
          lastAutoAtRef.current = Date.now();
          onAutoResearchAt(center);
        };
        const wait = AUTO_RESEARCH_MIN_INTERVAL_MS - (Date.now() - lastAutoAtRef.current);
        if (wait <= 0) fire();
        else autoTimerRef.current = setTimeout(fire, wait);
      }
    },
    [onAutoResearchAt, myLocation],
  );

  // 수동 재검색 버튼 — 기준점에서 임계 이상 벗어났지만 자동 조건이 아닐 때(줌이
  // 멀거나 자동 핸들러 미지정). 재검색 직후엔 기준점=지도 중심(dist≈0)이라 숨는다.
  const autoActive =
    !!onAutoResearchAt && userView !== null && userView.zoom >= AUTO_RESEARCH_MIN_ZOOM;
  const showResearch =
    !!onResearchAt &&
    !autoActive &&
    !!myLocation &&
    userView !== null &&
    approxDistanceM(myLocation, userView) > RESEARCH_THRESHOLD_M;

  // 결과가 갱신되면 전체 마커가 보이게 fit. apiKey 가 늦게 와서 MapCanvas mount
  // 이전에 groups 가 먼저 도착한 경우를 위해 apiKey 도 deps 에 포함한다. 자동
  // 재조회/노선 추적(suppressFit)은 사용자가 보던 화면을 유지한다. deps 는 groups
  // 만 — 노선 경유역 점(markers)이 바뀌어도 fit 하지 않는다(줌아웃 방지).
  useEffect(() => {
    if (!apiKey) return;
    if (suppressFit) return;
    if (groups.length > 0) {
      // 주변 모드면 기준점 마커도 markers 에 포함돼 함께 fit 된다.
      handleRef.current?.fitToMarkers();
    } else if (myLocation) {
      // 주변에 역이 하나도 없을 때 — 최소한 기준점으로 센터링.
      handleRef.current?.flyTo(myLocation.lat, myLocation.lng);
    }
  }, [groups, apiKey, myLocation, suppressFit]);

  // 선택 역으로 확대 포커스 — "선택이 바뀐 순간" 1회만 발사(데이터 갱신마다 재센터링
  // 금지 — ref 가드). 대상은 활성 결과(groups) 우선, 없으면 경유역 점(lineStops) —
  // 노선 위 점을 클릭해 목록에 없는 역을 골라도 지도가 그 역으로 이동한다.
  const flownIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId) {
      flownIdRef.current = null;
      return;
    }
    if (!apiKey || flownIdRef.current === selectedId) return;
    const target =
      groups.find((g) => g.id === selectedId) ??
      lineStops.find((s) => s.stationId === selectedId);
    if (!target) return;
    flownIdRef.current = selectedId;
    handleRef.current?.flyToZoomIn(target.lat, target.lng, SUBWAY_SELECT_ZOOM);
  }, [selectedId, groups, lineStops, apiKey]);

  // 마커 클릭 라우팅 — 내 위치는 무시, 경유역 점은 onSelectStop(id 재해석), 나머지는
  // 역 마커라 onSelect(그룹 id 그대로).
  const handleMarkerSelect = useCallback(
    (id: string) => {
      if (id === MY_LOCATION_ID) return;
      if (stopIds.has(id)) onSelectStop?.(id);
      else onSelect(id);
    },
    [onSelect, onSelectStop, stopIds],
  );

  // 노선 정보 카드 — 본선 구간/역 수. 본선(branchName null) 기준, 순환선은 구간 대신 표기.
  const lineInfo = useMemo(() => {
    if (!lineDetail) return null;
    const main =
      lineDetail.sections.find((s) => s.branchName === null) ?? lineDetail.sections[0];
    if (!main) return null;
    const branches = lineDetail.sections.filter((s) => s !== main);
    const first = main.stations[0]?.name ?? '';
    const last = main.stations[main.stations.length - 1]?.name ?? '';
    const section = main.isLoop ? '순환선' : `${first} ↔ ${last}`;
    const count =
      `본선 ${main.stations.length}역` + (branches.length ? ` · 지선 ${branches.length}` : '');
    return { section, count };
  }, [lineDetail]);

  if (config.isLoading) {
    return (
      <Placeholder>
        <Loader2 className="size-4 animate-spin" /> 지도 키 확인 중…
      </Placeholder>
    );
  }
  if (keyMissing) {
    return (
      <Placeholder>
        <MapPin className="size-4 opacity-50" />
        <div className="text-center">
          지도 키가 등록되지 않았습니다.
          <br />
          관리자가 설정 &gt; 지도에서 vworld 키를 등록하면 역 지도가 표시됩니다.
        </div>
      </Placeholder>
    );
  }
  if (config.isError || !apiKey) {
    return <Placeholder>지도 설정을 불러오지 못했습니다.</Placeholder>;
  }

  return (
    <div className="relative size-full">
      <MapCanvas
        ref={handleRef}
        apiKey={apiKey}
        markers={markers}
        selectedMarkerId={selectedId}
        onMarkerSelect={handleMarkerSelect}
        onViewportChangeEnd={handleViewportChangeEnd}
        routeLine={routeLines}
      />
      {/* 노선 정보 카드 — 좌상단(로딩·재검색 칩은 상단 중앙이라 겹치지 않는다). */}
      {lineDetail && lineInfo && (
        <div className="absolute left-3 top-3 z-10 flex max-w-[85%] items-center gap-2 rounded-lg border bg-background/95 px-3 py-1.5 shadow-md">
          <SubwayLineBadge lineId={lineDetail.lineId} />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">{lineDetail.lineName}</div>
            <div className="truncate text-xs text-muted-foreground">
              {lineInfo.section} · {lineInfo.count}
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseLine}
            aria-label="노선 닫기"
            title="노선 닫기"
            className="ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {/* 조회 진행 칩 — 자동/수동 재조회가 도는 동안(재검색 버튼과 같은 슬롯). */}
      {loading && (
        <div className="absolute left-1/2 top-3 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md">
          <Loader2 className="size-3.5 animate-spin" />
          주변 역 불러오는 중…
        </div>
      )}
      {showResearch && !loading && (
        <button
          type="button"
          onClick={() => onResearchAt?.({ lat: userView!.lat, lng: userView!.lng })}
          className="absolute left-1/2 top-3 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-md hover:bg-accent"
        >
          <RotateCw className="size-3.5" />
          이 위치에서 재검색
        </button>
      )}
    </div>
  );
};

const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <div className="flex size-full items-center justify-center gap-2 bg-muted/30 p-6 text-sm text-muted-foreground">
    {children}
  </div>
);
