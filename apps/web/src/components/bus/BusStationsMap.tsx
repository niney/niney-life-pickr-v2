import { useEffect, useMemo, useRef } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { ApiError, useMapPublicConfig } from '@repo/shared';
import type { BusStationItemType } from '@repo/api-contract';
import { buildBusStopMarkerDataUrl } from '@repo/utils';
import {
  MapCanvas,
  type MapCanvasHandle,
  type MapMarker,
} from '~/components/restaurant/MapCanvas';

// 모듈 레벨 상수 — 모든 마커가 같은 data URL 문자열을 공유해 OL 아이콘
// 캐시가 이미지를 1회만 디코드한다.
const BUS_MARKER_URL = buildBusStopMarkerDataUrl(false);
const BUS_MARKER_SELECTED_URL = buildBusStopMarkerDataUrl(true);

interface Props {
  items: BusStationItemType[];
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
export const BusStationsMap = ({ items, selectedStId, onSelectMarker }: Props) => {
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
    return items.map((it) => {
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
  }, [items]);

  // 검색 결과가 갱신되면 전체 마커가 보이게 fit. apiKey 가 늦게 와서 MapCanvas
  // mount 이전에 items 가 먼저 도착한 경우를 위해 apiKey 도 deps 에 포함 —
  // mount 직후 한 번 더 평가된다. (선택 flyTo 효과보다 먼저 선언 — 딥링크로
  // stId 까지 들고 진입하면 fit 후 선택 정류장 센터링이 이긴다.)
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
      onMarkerSelect={onSelectMarker}
    />
  );
};

const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <div className="flex size-full items-center justify-center gap-2 bg-muted/30 p-6 text-sm text-muted-foreground">
    {children}
  </div>
);
