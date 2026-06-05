import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, RefreshCcw } from 'lucide-react';
import { ApiError, useMapPublicConfig, type UserLocationStatus } from '@repo/shared';
import type { RestaurantPublicListItemType } from '@repo/api-contract';
import { resolveRestaurantCategoryKey } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { MyLocationButton } from './MyLocationButton';
import { MapCanvas, type MapCanvasHandle, type MapMarker, type MapViewport } from './MapCanvas';

// 카드 더블클릭 "확대" 시 목표 줌. DEFAULT_ZOOM(15)보다 두 단계 가까운 거리감 —
// fitToMarkers 의 maxZoom 과 같은 17 로 통일.
const ZOOM_IN_LEVEL = 17;

interface Props {
  items: RestaurantPublicListItemType[];
  selectedPlaceId: string | null;
  // 더블클릭으로 "확대 포커스" 요청된 식당. 참조가 바뀔 때마다(매 더블클릭 새
  // 객체) 해당 식당으로 flyToZoomIn — 단순 선택(클릭) 패닝과 구분된다.
  zoomFocus: { placeId: string } | null;
  // URL 의 bbox(이미 검색에 반영된 영역) — 사용자가 지도를 패닝해서 이 값과
  // 다른 영역으로 가면 "이 지역 재검색" 노출.
  appliedBbox: string | null;
  // 외부에서 주입하는 중심 좌표(예: 사용자 geolocation). 참조가 새로워질
  // 때마다 flyTo — 첫 진입의 자동 도착과 "내 위치" 버튼의 수동 재요청 양쪽
  // 다 처리. 사용자가 패닝한 후엔 호출자가 새 좌표를 안 주는 한 그대로 둔다.
  focusCoord?: { lat: number; lng: number } | null;
  // "내 위치" 버튼 표시/상태/콜백. null/undefined 면 버튼 자체 숨김.
  locationStatus?: UserLocationStatus;
  onRequestLocation?: () => void;
  onSelectMarker(placeId: string): void;
  onResearchInArea(bbox: string): void;
  onClearArea(): void;
}

export const PublicRestaurantsMap = ({
  items,
  selectedPlaceId,
  zoomFocus,
  appliedBbox,
  focusCoord,
  locationStatus,
  onRequestLocation,
  onSelectMarker,
  onResearchInArea,
  onClearArea,
}: Props) => {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  // 키 미등록은 404 — ApiError statusCode 로 분기.
  const keyMissing =
    config.isError && config.error instanceof ApiError && config.error.statusCode === 404;

  const handleRef = useRef<MapCanvasHandle>(null);

  // 지도 패닝 후 임시 viewport. URL bbox 와 비교해서 "재검색" 버튼 노출.
  const [pendingViewport, setPendingViewport] = useState<MapViewport | null>(null);
  const [tileError, setTileError] = useState(false);

  // 좌표 있는 식당만 마커로. id 는 placeId 그대로 사용 (선택 동기화에 그대로 매핑).
  // 모든 마커에 라벨 전달. 겹치는 텍스트는 VectorLayer declutter:true 가 자동
  // 숨김 처리 (도심 밀집 지역에서도 가독성 유지). selectedPlaceId 가 deps 에
  // 없어 selection 변경 시 markers 재계산 안 됨 → MapCanvas 의 feature 안정성 ↑.
  const markers: MapMarker[] = useMemo(
    () =>
      items
        .filter((it) => it.latitude !== null && it.longitude !== null)
        .map((it) => ({
          id: it.placeId,
          lat: it.latitude!,
          lng: it.longitude!,
          label: it.name,
          categoryKey: resolveRestaurantCategoryKey(it.category),
        })),
    [items],
  );

  // 선택된 마커가 화면 밖이면 부드럽게 가운데로 이동. 식당 선택(카드/마커 클릭)
  // 으로만 트리거 — 단순 호버로는 패닝하지 않는다. 이건 사용자 인터랙션이 아니라
  // 시스템 동작 — onViewportChangeEnd 안 발사.
  useEffect(() => {
    if (!selectedPlaceId) return;
    const target = items.find((it) => it.placeId === selectedPlaceId);
    if (!target || target.latitude === null || target.longitude === null) return;
    handleRef.current?.flyTo(target.latitude, target.longitude);
  }, [selectedPlaceId, items]);

  // 더블클릭 = 해당 식당으로 확대. zoomFocus 참조가 바뀔 때마다 flyToZoomIn —
  // 클릭 패닝(줌 유지)과 달리 ZOOM_IN_LEVEL 까지 당긴다(이미 더 확대면 유지).
  useEffect(() => {
    if (!zoomFocus) return;
    const target = items.find((it) => it.placeId === zoomFocus.placeId);
    if (!target || target.latitude === null || target.longitude === null) return;
    handleRef.current?.flyToZoomIn(target.latitude, target.longitude, ZOOM_IN_LEVEL);
  }, [zoomFocus, items]);

  // focusCoord 참조가 바뀌면 fly — 첫 도착도, "내 위치" 재요청도 같은 경로.
  // 같은 좌표라도 호출자가 새 object 를 넘기면 다시 fly (idempotent — 이미
  // 같은 중심이면 시각적 변화 없음). apiKey 가 늦게 와서 mount 이 늦어진
  // 경우를 위해 apiKey 도 deps 에 포함.
  useEffect(() => {
    if (!focusCoord || !apiKey) return;
    handleRef.current?.flyTo(focusCoord.lat, focusCoord.lng);
  }, [focusCoord, apiKey]);

  // viewport 변경 콜백 — URL bbox 와 비교, 다르면 재검색 후보로 보관.
  const handleViewportChange = useCallback(
    (viewport: MapViewport) => {
      setPendingViewport(viewport);
    },
    [],
  );

  // 표시 여부: pendingViewport 가 있고, 현재 URL bbox 와 비교해 충분히 다르면.
  // "충분히" 기준: bbox center 가 viewport extent 밖에 있거나, area 차이가 30% 이상.
  // 단순 휴리스틱 — pendingViewport 가 존재하면 일단 노출하고, URL bbox 와 정확히
  // 같은 문자열이면 숨김 (재검색이 막 끝나면 같아짐).
  const pendingBboxStr = pendingViewport
    ? formatBbox(pendingViewport.bbox)
    : null;
  const showResearch =
    pendingBboxStr !== null && pendingBboxStr !== appliedBbox;

  if (config.isLoading) {
    return <Placeholder><Loader2 className="size-4 animate-spin" /> 지도 키 확인 중…</Placeholder>;
  }
  if (keyMissing) {
    return (
      <Placeholder>
        <MapPin className="size-4 opacity-50" />
        <div className="text-center">
          지도 키가 등록되지 않았습니다.
          <br />
          관리자가 설정 &gt; 지도에서 vworld 키를 등록하면 표시됩니다.
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
        selectedMarkerId={selectedPlaceId}
        onMarkerSelect={onSelectMarker}
        onViewportChangeEnd={handleViewportChange}
        onTileError={() => setTileError(true)}
      />

      {tileError && (
        <div className="absolute left-3 top-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive shadow-sm">
          지도 타일을 불러오지 못했습니다. 키가 유효한지 확인해 주세요.
        </div>
      )}

      {/* "이 지역 재검색" — 상단 중앙. 네이버/카카오/구글맵 모바일 표준 위치이며,
          하단의 list/map 토글(모바일)과 겹치지 않는다. */}
      {showResearch && pendingBboxStr && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => {
              onResearchInArea(pendingBboxStr);
              setPendingViewport(null);
            }}
            className="gap-1 shadow-md"
          >
            <RefreshCcw className="size-3.5" />이 지역에서 재검색
          </Button>
        </div>
      )}

      {/* 우측 상단 컨트롤 — 가로 배치. "전체 영역"(bbox 있을 때) 왼쪽, "내 위치"
          오른쪽. 위치 버튼이 모서리에 고정되어 "전체 영역" 토글 시 안 흔들린다. */}
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {appliedBbox && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onClearArea();
              setPendingViewport(null);
            }}
            className="gap-1 bg-background/95 shadow-sm"
          >
            전체 영역
          </Button>
        )}
        {onRequestLocation && locationStatus && (
          <MyLocationButton
            status={locationStatus}
            onClick={onRequestLocation}
          />
        )}
      </div>
    </div>
  );
};

const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <div className="flex size-full items-center justify-center gap-2 bg-muted/30 p-6 text-sm text-muted-foreground">
    {children}
  </div>
);

const formatBbox = (b: MapViewport['bbox']): string =>
  // 소수점 5자리 — vworld bbox 1m 정도 해상도면 충분, URL 길이 절약.
  [b.minLng, b.minLat, b.maxLng, b.maxLat].map((n) => n.toFixed(5)).join(',');
