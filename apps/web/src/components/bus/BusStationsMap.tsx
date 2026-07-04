import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, RotateCw } from 'lucide-react';
import { ApiError, useMapPublicConfig } from '@repo/shared';
import type { BusPositionItemType, BusStationItemType } from '@repo/api-contract';
import {
  buildBusStopMarkerDataUrl,
  buildBusVehicleMarkerDataUrl,
  buildMyLocationMarkerDataUrl,
} from '@repo/utils';
import {
  MapCanvas,
  type MapCanvasHandle,
  type MapMarker,
  type MapViewport,
} from '~/components/restaurant/MapCanvas';

// 모듈 레벨 상수 — 모든 마커가 같은 data URL 문자열을 공유해 OL 아이콘
// 캐시가 이미지를 1회만 디코드한다.
const BUS_MARKER_URL = buildBusStopMarkerDataUrl(false);
const BUS_MARKER_SELECTED_URL = buildBusStopMarkerDataUrl(true);
// 차량은 선택 개념이 없어 1종 — selectedSrc 도 같은 이미지로 채운다.
const BUS_VEHICLE_MARKER_URL = buildBusVehicleMarkerDataUrl();
const MY_LOCATION_MARKER_URL = buildMyLocationMarkerDataUrl();

// 차량 마커 id 접두사 — 정류장 stId 와 네임스페이스 충돌 방지 + 클릭 무시 판별.
const VEHICLE_ID_PREFIX = 'veh-';
// 내 위치 마커 id — 정류장/차량과 충돌 없는 고정 id, 클릭은 무시.
const MY_LOCATION_ID = 'my-location';

interface Props {
  items: BusStationItemType[];
  // 선택 노선의 실시간 버스 위치(15초 폴링) — 없으면 정류장 마커만.
  vehicles?: BusPositionItemType[];
  // 주변 모드의 조회 기준점(Geolocation 내 위치 또는 지도 재검색 좌표) —
  // 파란 점 마커. 없으면 미표시.
  myLocation?: { lat: number; lng: number } | null;
  selectedStId: string | null;
  onSelectMarker(stId: string): void;
  // '이 위치에서 재검색' — 주변 모드에서 사용자가 지도를 기준점에서 일정 거리
  // 이상 옮겼을 때(자동 조회 조건 미충족 시) 버튼을 띄우고, 클릭 시 지도 중심
  // 좌표를 넘긴다.
  onResearchAt?(center: { lat: number; lng: number }): void;
  // 자동 재조회 — 줌이 충분히 가까울 때(AUTO_RESEARCH_MIN_ZOOM) 사용자 패닝이
  // 끝나면 지도 중심으로 알아서 조회한다. 서버가 셀 단위 30일 DB 캐시를 들고
  // 있어 업스트림 부담이 거의 없다. 미지정이면 수동 버튼만.
  onAutoResearchAt?(center: { lat: number; lng: number }): void;
  // 자동 재조회로 결과가 갱신될 때 fitToMarkers 억제 — 사용자가 보던 화면을
  // 지도가 되받아치지 않게 한다(명시 액션 시에만 fit).
  suppressFit?: boolean;
}

// 재검색(수동/자동) 트리거 임계 — 기준점에서 지도 중심이 이만큼 벗어나야.
// 서버 기본 반경(500m)보다 작게 잡아 "결과 경계쯤 왔을 때" 자연히 발동.
const RESEARCH_THRESHOLD_M = 300;
// 자동 재조회 최소 줌 — 반경 500m 결과가 화면에 들어오는 수준. 그보다 멀면
// 자동 조회는 의미가 없어(100건 절단만 남음) 수동 버튼으로 강등.
const AUTO_RESEARCH_MIN_ZOOM = 15;
// 자동 재조회 스로틀 — 관성 스크롤/연속 패닝으로 moveend 가 몰릴 때 최소 간격.
const AUTO_RESEARCH_MIN_INTERVAL_MS = 2_500;

// 같은 이름 정류장 쌍(상·하행 마주보는 표지판)의 라벨 겹침 판정 거리.
const LABEL_DEDUP_DIST_M = 60;

// 등거리 사각 근사 거리(m) — 60m 판정에는 하버사인급 정밀도가 불필요.
const approxDistanceM = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const mPerLatDeg = 111_320;
  const dLat = (a.lat - b.lat) * mPerLatDeg;
  const dLng = (a.lng - b.lng) * mPerLatDeg * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

// 정류장 검색 결과를 vworld 지도에 마커로. 키 로딩/미등록/에러 3분기는
// PublicRestaurantsMap 과 동일 정책 (문구만 버스용).
export const BusStationsMap = ({
  items,
  vehicles,
  myLocation,
  selectedStId,
  onSelectMarker,
  onResearchAt,
  onAutoResearchAt,
  suppressFit,
}: Props) => {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  // 키 미등록은 404 — ApiError statusCode 로 분기.
  const keyMissing =
    config.isError && config.error instanceof ApiError && config.error.statusCode === 404;

  const handleRef = useRef<MapCanvasHandle>(null);

  // 사용자가 직접 패닝/줌을 끝낸 시점의 지도 상태 — MapCanvas 가 programmatic
  // move(fit/flyTo)는 걸러주므로(userInteractedRef) 여기엔 사용자 이동만 쌓인다.
  const [userView, setUserView] = useState<{ lat: number; lng: number; zoom: number } | null>(
    null,
  );
  const lastAutoAtRef = useRef(0);
  const handleViewportChangeEnd = useCallback(
    (vp: MapViewport) => {
      const center = { lat: vp.centerLat, lng: vp.centerLng };
      setUserView({ ...center, zoom: vp.zoom });
      // 자동 재조회 — 줌이 충분히 가깝고 기준점에서 임계 이상 벗어났을 때만,
      // 스로틀 간격으로. 자동 조회 자체는 URL 을 안 건드린다(호출자 정책).
      if (
        onAutoResearchAt &&
        myLocation &&
        vp.zoom >= AUTO_RESEARCH_MIN_ZOOM &&
        approxDistanceM(myLocation, center) > RESEARCH_THRESHOLD_M
      ) {
        const now = Date.now();
        if (now - lastAutoAtRef.current >= AUTO_RESEARCH_MIN_INTERVAL_MS) {
          lastAutoAtRef.current = now;
          onAutoResearchAt(center);
        }
      }
    },
    [onAutoResearchAt, myLocation],
  );

  // 수동 재검색 버튼 — 기준점에서 임계 이상 벗어났지만 자동 조건이 아닐 때
  // (줌이 멀거나 자동 핸들러 미지정). 재검색 직후엔 기준점=지도 중심(dist≈0)
  // 이라 별도 리셋 없이 숨는다.
  const autoActive =
    !!onAutoResearchAt && userView !== null && userView.zoom >= AUTO_RESEARCH_MIN_ZOOM;
  const showResearch =
    !!onResearchAt &&
    !autoActive &&
    !!myLocation &&
    userView !== null &&
    approxDistanceM(myLocation, userView) > RESEARCH_THRESHOLD_M;

  const markers: MapMarker[] = useMemo(() => {
    // 같은 이름 + 60m 이내 정류장 그룹은 첫 항목만 라벨 유지 — 마주보는
    // 쌍의 라벨이 글자 단위로 겹쳐 읽히지 않는 문제 방지. label 미지정은
    // MapCanvas 가 텍스트 스타일 자체를 생략하는 안전한 경로.
    const labeledByName = new Map<string, BusStationItemType[]>();
    const stationMarkers: MapMarker[] = items.map((it) => {
      const peers = labeledByName.get(it.name);
      const nearLabeled =
        peers?.some((p) => approxDistanceM(p, it) <= LABEL_DEDUP_DIST_M) ?? false;
      if (!nearLabeled) {
        if (peers) peers.push(it);
        else labeledByName.set(it.name, [it]);
      }
      return {
        id: it.stId,
        lat: it.lat,
        lng: it.lng,
        label: nearLabeled ? undefined : it.name,
        icon: { src: BUS_MARKER_URL, selectedSrc: BUS_MARKER_SELECTED_URL },
      };
    });
    // 차량 마커 — 라벨 생략(밀집 시 declutter 부담). 15초 폴링마다 위치를
    // 통째로 교체(부드러운 이동 불필요).
    const vehicleMarkers: MapMarker[] = (vehicles ?? []).map((v) => ({
      id: `${VEHICLE_ID_PREFIX}${v.vehId}`,
      lat: v.lat,
      lng: v.lng,
      icon: { src: BUS_VEHICLE_MARKER_URL, selectedSrc: BUS_VEHICLE_MARKER_URL },
    }));
    // 내 위치 마커 — 주변 모드에서만. 라벨 없이 파란 점만.
    const myLocationMarkers: MapMarker[] = myLocation
      ? [
          {
            id: MY_LOCATION_ID,
            lat: myLocation.lat,
            lng: myLocation.lng,
            icon: { src: MY_LOCATION_MARKER_URL, selectedSrc: MY_LOCATION_MARKER_URL },
          },
        ]
      : [];
    return [...stationMarkers, ...vehicleMarkers, ...myLocationMarkers];
  }, [items, vehicles, myLocation]);

  // 차량·내 위치 마커 클릭은 no-op — 정류장 선택(stId)으로 오염시키지 않는다.
  const handleMarkerSelect = useCallback(
    (id: string) => {
      if (id.startsWith(VEHICLE_ID_PREFIX) || id === MY_LOCATION_ID) return;
      onSelectMarker(id);
    },
    [onSelectMarker],
  );

  // 검색 결과가 갱신되면 전체 마커가 보이게 fit. apiKey 가 늦게 와서 MapCanvas
  // mount 이전에 items 가 먼저 도착한 경우를 위해 apiKey 도 deps 에 포함 —
  // mount 직후 한 번 더 평가된다. (선택 flyTo 효과보다 먼저 선언 — 딥링크로
  // stId 까지 들고 진입하면 fit 후 선택 정류장 센터링이 이긴다.)
  // vehicles 는 deps 에서 의도적으로 제외 — 15초 위치 폴링마다 화면이 널뛰면
  // 안 된다(fit 은 정류장 검색 결과 변경 시에만).
  useEffect(() => {
    if (!apiKey) return;
    // 자동 재조회로 인한 결과 갱신 — 사용자가 보던 화면을 유지(fit 억제).
    if (suppressFit) return;
    if (items.length > 0) {
      // 주변 모드면 기준점 마커도 markers 에 포함돼 함께 fit 된다.
      handleRef.current?.fitToMarkers();
    } else if (myLocation) {
      // 주변에 정류장이 하나도 없을 때 — 최소한 기준점으로 센터링.
      handleRef.current?.flyTo(myLocation.lat, myLocation.lng);
    }
  }, [items, apiKey, myLocation, suppressFit]);

  // 선택 정류장으로 부드럽게 이동 — 리스트 행/마커 클릭 공통.
  useEffect(() => {
    if (!apiKey || !selectedStId) return;
    const target = items.find((it) => it.stId === selectedStId);
    if (!target) return;
    handleRef.current?.flyTo(target.lat, target.lng);
  }, [selectedStId, items, apiKey]);

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
          관리자가 설정 &gt; 지도에서 vworld 키를 등록하면 정류장 지도가 표시됩니다.
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
        selectedMarkerId={selectedStId}
        onMarkerSelect={handleMarkerSelect}
        onViewportChangeEnd={handleViewportChangeEnd}
      />
      {/* '이 위치에서 재검색' — 지도 상단 중앙 오버레이. 클릭 시 지도 중심으로
          주변 조회를 다시 던진다(자동 조회 금지 — 명시 클릭만). */}
      {showResearch && (
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
