import { useEffect, useMemo, useRef } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { ApiError, useMapPublicConfig } from '@repo/shared';
import type { SubwayStationGroupItemType } from '@repo/api-contract';
import { buildSubwayStationMarkerDataUrl } from '@repo/utils';
import {
  MapCanvas,
  type MapCanvasHandle,
  type MapMarker,
} from '~/components/restaurant/MapCanvas';

// 모듈 레벨 상수 — 선택×환승 4종을 미리 만들어 모든 마커가 같은 data URL 문자열을
// 공유한다(OL 아이콘 캐시가 이미지를 1회만 디코드). 정류장 마커와 규격이 같아
// (26×26 원 / 32×48 핀) MapCanvas 의 라벨 offset·축소 스케일이 그대로 유효하다.
const STATION_URL = buildSubwayStationMarkerDataUrl({ selected: false, transfer: false });
const STATION_SELECTED_URL = buildSubwayStationMarkerDataUrl({ selected: true, transfer: false });
const TRANSFER_URL = buildSubwayStationMarkerDataUrl({ selected: false, transfer: true });
const TRANSFER_SELECTED_URL = buildSubwayStationMarkerDataUrl({ selected: true, transfer: true });

// 역 선택 시 확대 포커스 목표 줌 — 식당 지도의 ZOOM_IN_LEVEL(및 fitToMarkers
// maxZoom)과 통일한 17. flyToZoomIn 이라 현재 줌이 더 크면 그대로 둔다(줌아웃 없음).
const SUBWAY_SELECT_ZOOM = 17;

interface Props {
  // 역명 그룹 — 그룹당 마커 1개(대표 좌표). 2개 이상 호선 = 환승(이중 링).
  groups: SubwayStationGroupItemType[];
  selectedId: string | null;
  onSelect(id: string): void;
  className?: string;
}

// 역 검색 결과를 vworld 지도에 마커로. 키 로딩/미등록/에러 3분기는 BusStationsMap
// 과 동일 정책(문구만 지하철용). 1차 범위 — 차량/폴리라인/재검색/follow 없음.
export const SubwayStationsMap = ({ groups, selectedId, onSelect }: Props) => {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  // 키 미등록은 404 — ApiError statusCode 로 분기.
  const keyMissing =
    config.isError && config.error instanceof ApiError && config.error.statusCode === 404;

  const handleRef = useRef<MapCanvasHandle>(null);

  const markers: MapMarker[] = useMemo(
    () =>
      groups.map((g) => {
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
      }),
    [groups],
  );

  // 검색 결과가 갱신되면 전체 마커가 보이게 fit. apiKey 가 늦게 와서 MapCanvas
  // mount 이전에 groups 가 먼저 도착한 경우를 위해 apiKey 도 deps 에 포함한다.
  // (선택 flyTo 효과보다 먼저 선언 — 딥링크로 stn 까지 들고 진입하면 fit 후 선택
  //  역 센터링이 이긴다.)
  useEffect(() => {
    if (!apiKey) return;
    if (groups.length > 0) handleRef.current?.fitToMarkers();
  }, [groups, apiKey]);

  // 선택 역으로 확대 포커스 — 리스트 행/마커 클릭 공통. "선택이 바뀐 순간" 1회만
  // 발사한다(데이터 갱신마다 재센터링 금지 — ref 가드). flyToZoomIn 이라 넓은 fit
  // (예: 전국 범위 검색) 상태에서 선택하면 SUBWAY_SELECT_ZOOM 까지 당기고, 이미 더
  // 확대돼 있으면 줌을 유지한다(팬만 되고 확대 안 되던 문제 해소). 선택 시점에
  // groups 에 아직 없으면 flownRef 를 남겨 두고 도착 후 1회 발사한다.
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
        onMarkerSelect={onSelect}
      />
    </div>
  );
};

const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <div className="flex size-full items-center justify-center gap-2 bg-muted/30 p-6 text-sm text-muted-foreground">
    {children}
  </div>
);
