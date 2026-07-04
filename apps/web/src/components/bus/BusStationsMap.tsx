import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { ApiError, useMapPublicConfig } from '@repo/shared';
import type { BusPositionItemType, BusStationItemType } from '@repo/api-contract';
import { buildBusStopMarkerDataUrl, buildBusVehicleMarkerDataUrl } from '@repo/utils';
import {
  MapCanvas,
  type MapCanvasHandle,
  type MapMarker,
} from '~/components/restaurant/MapCanvas';

// 모듈 레벨 상수 — 모든 마커가 같은 data URL 문자열을 공유해 OL 아이콘
// 캐시가 이미지를 1회만 디코드한다.
const BUS_MARKER_URL = buildBusStopMarkerDataUrl(false);
const BUS_MARKER_SELECTED_URL = buildBusStopMarkerDataUrl(true);
// 차량은 선택 개념이 없어 1종 — selectedSrc 도 같은 이미지로 채운다.
const BUS_VEHICLE_MARKER_URL = buildBusVehicleMarkerDataUrl();

// 차량 마커 id 접두사 — 정류장 stId 와 네임스페이스 충돌 방지 + 클릭 무시 판별.
const VEHICLE_ID_PREFIX = 'veh-';

interface Props {
  items: BusStationItemType[];
  // 선택 노선의 실시간 버스 위치(15초 폴링) — 없으면 정류장 마커만.
  vehicles?: BusPositionItemType[];
  selectedStId: string | null;
  onSelectMarker(stId: string): void;
}

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
  selectedStId,
  onSelectMarker,
}: Props) => {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  // 키 미등록은 404 — ApiError statusCode 로 분기.
  const keyMissing =
    config.isError && config.error instanceof ApiError && config.error.statusCode === 404;

  const handleRef = useRef<MapCanvasHandle>(null);

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
    return [...stationMarkers, ...vehicleMarkers];
  }, [items, vehicles]);

  // 차량 마커 클릭은 no-op — 정류장 선택(stId)으로 오염시키지 않는다.
  const handleMarkerSelect = useCallback(
    (id: string) => {
      if (id.startsWith(VEHICLE_ID_PREFIX)) return;
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
    if (!apiKey || items.length === 0) return;
    handleRef.current?.fitToMarkers();
  }, [items, apiKey]);

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
    <MapCanvas
      ref={handleRef}
      apiKey={apiKey}
      markers={markers}
      selectedMarkerId={selectedStId}
      onMarkerSelect={handleMarkerSelect}
    />
  );
};

const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <div className="flex size-full items-center justify-center gap-2 bg-muted/30 p-6 text-sm text-muted-foreground">
    {children}
  </div>
);
