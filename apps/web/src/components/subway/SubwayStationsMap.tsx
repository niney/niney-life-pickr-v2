import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, RotateCw } from 'lucide-react';
import { ApiError, useMapPublicConfig } from '@repo/shared';
import type { SubwayStationGroupItemType } from '@repo/api-contract';
import { buildMyLocationMarkerDataUrl, buildSubwayStationMarkerDataUrl } from '@repo/utils';
import {
  MapCanvas,
  type MapCanvasHandle,
  type MapMarker,
  type MapViewport,
} from '~/components/restaurant/MapCanvas';

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
  // 미지정이면 수동 버튼만.
  onAutoResearchAt?(center: { lat: number; lng: number }): void;
  // 자동 재조회로 결과가 갱신될 때 fitToMarkers 억제 — 사용자가 보던 화면을 지도가
  // 되받아치지 않게.
  suppressFit?: boolean;
  // 주변 조회 진행 중 — 지도 상단 로딩 칩.
  loading?: boolean;
  className?: string;
}

// 역 검색/주변 결과를 vworld 지도에 마커로. 키 로딩/미등록/에러 3분기는 BusStationsMap
// 과 동일 정책(문구만 지하철용). 자동 재조회 파이프라인은 버스 3차 검증본 이식(수치만
// 조정, 마커 누적은 30그룹 상한이라 생략 — 현재 결과만). follow/차량은 여전히 제외.
export const SubwayStationsMap = ({
  groups,
  selectedId,
  onSelect,
  myLocation,
  onResearchAt,
  onAutoResearchAt,
  suppressFit,
  loading,
}: Props) => {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  // 키 미등록은 404 — ApiError statusCode 로 분기.
  const keyMissing =
    config.isError && config.error instanceof ApiError && config.error.statusCode === 404;

  const handleRef = useRef<MapCanvasHandle>(null);

  const markers: MapMarker[] = useMemo(() => {
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
    // 내 위치 마커 — 주변 모드에서만. 라벨 없이 파란 점만.
    if (myLocation) {
      stationMarkers.push({
        id: MY_LOCATION_ID,
        lat: myLocation.lat,
        lng: myLocation.lng,
        icon: { src: MY_LOCATION_MARKER_URL, selectedSrc: MY_LOCATION_MARKER_URL },
      });
    }
    return stationMarkers;
  }, [groups, myLocation]);

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
  // 재조회로 인한 갱신(suppressFit)은 사용자가 보던 화면을 유지한다.
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
  // 금지 — ref 가드). 자동 조회로 groups 가 바뀌어도 flownIdRef 가 같아 재발화하지
  // 않는다. flyToZoomIn 이라 넓은 fit 에서 선택하면 SUBWAY_SELECT_ZOOM 까지 당기고,
  // 이미 더 확대돼 있으면 줌을 유지한다. 선택 시점에 groups 에 아직 없으면 flownRef
  // 를 남겨 두고 도착 후 1회 발사한다.
  const flownIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId) {
      flownIdRef.current = null;
      return;
    }
    if (!apiKey || flownIdRef.current === selectedId) return;
    const target = groups.find((g) => g.id === selectedId);
    if (!target) return;
    flownIdRef.current = selectedId;
    handleRef.current?.flyToZoomIn(target.lat, target.lng, SUBWAY_SELECT_ZOOM);
  }, [selectedId, groups, apiKey]);

  // 내 위치 마커 클릭은 no-op — 역 선택(stn)으로 오염시키지 않는다.
  const handleMarkerSelect = useCallback(
    (id: string) => {
      if (id === MY_LOCATION_ID) return;
      onSelect(id);
    },
    [onSelect],
  );

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
      />
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
