import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, RefreshCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError, useMapPublicConfig, type UserLocationStatus } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { MyLocationButton } from '~/components/restaurant/MyLocationButton';
import {
  MapCanvas,
  type MapCanvasHandle,
  type MapMarker,
  type MapViewport,
} from '~/components/restaurant/MapCanvas';
import type { PanelSide } from '~/stores/panelPrefsStore';

interface Props {
  markers: MapMarker[];
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  // 더블클릭으로 "확대 포커스" 요청된 식당. 참조가 바뀔 때마다(매 더블클릭 새
  // 객체) 해당 식당으로 flyToZoomIn — 단순 선택/호버 패닝과 구분된다.
  zoomFocus: { placeId: string } | null;
  // URL 의 bbox(이미 검색에 반영된 영역). 사용자가 패닝하여 다른 영역으로 가면
  // "이 지역 재검색" 버튼이 노출된다.
  appliedBbox: string | null;
  // 외부에서 주입하는 중심 좌표(사용자 geolocation). 참조가 새로워질 때마다
  // flyTo — "내 위치" 버튼의 수동 재요청을 처리한다. 어드민은 첫 진입 자동
  // 도착이 없고(등록 마커 fit 우선), 버튼 클릭으로만 좌표가 들어온다.
  focusCoord?: { lat: number; lng: number } | null;
  // "내 위치" 버튼 표시/상태/콜백. null/undefined 면 버튼 자체 숨김.
  locationStatus?: UserLocationStatus;
  onRequestLocation?: () => void;
  onSelectMarker(placeId: string): void;
  onResearchInArea(bbox: string): void;
  onClearArea(): void;
  // 모든 viewport 변경(첫 렌더, 사용자 패닝, programmatic) 시 현재 bbox 통지.
  // 페이지가 ref 로 보관해두고, 검색 트리거 시점에 URL bbox 가 비어 있으면
  // 자동으로 박는다 — 첫 검색도 사용자가 보고 있는 영역으로 떨어지게 하기 위함.
  onViewportSync?(bbox: string): void;
  // 컨트롤(전체 영역 등)을 패널 반대편 모서리에 붙이기 위해 받아둔다.
  panelSide: PanelSide;
}

const formatBbox = (b: MapViewport['bbox']): string =>
  // 5자리 → vworld bbox 1m 정도 해상도면 충분.
  [b.minLng, b.minLat, b.maxLng, b.maxLat].map((n) => n.toFixed(5)).join(',');

// "내 위치" 도착 줌 — 동네/도로 수준. 등록 마커 전체 fit(시 단위로 축소)이나
// 직전 패닝 줌과 무관하게, 클릭하면 항상 이 레벨로 확대해 주변 가게가 한눈에
// 들어오게 한다(MapCanvas DEFAULT_ZOOM=15 보다 한 단계 더 가깝게).
const MY_LOCATION_ZOOM = 16;

// 더블클릭 "확대" 시 목표 줌 — 공개 지도(PublicRestaurantsMap)와 동일하게 17.
const ZOOM_IN_LEVEL = 17;

export const DiscoverMap = ({
  markers,
  selectedPlaceId,
  hoveredPlaceId,
  zoomFocus,
  appliedBbox,
  focusCoord,
  locationStatus,
  onRequestLocation,
  onSelectMarker,
  onResearchInArea,
  onClearArea,
  onViewportSync,
  panelSide,
}: Props) => {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  const keyMissing =
    config.isError &&
    config.error instanceof ApiError &&
    config.error.statusCode === 404;

  const handleRef = useRef<MapCanvasHandle>(null);
  const [pendingViewport, setPendingViewport] = useState<MapViewport | null>(null);
  const [tileError, setTileError] = useState(false);
  // 첫 마운트 시 등록(muted) 마커들이 채워지면 한 번만 fit. 검색이 들어오면
  // 사용자가 직접 영역을 잡도록 둔다 — 매번 자동 fit 하면 패닝 의도가 사라진다.
  const didInitialFitRef = useRef(false);

  // 호버 우선 강조. 호버가 없으면 selected.
  const highlightedId = hoveredPlaceId ?? selectedPlaceId;

  // 강조 대상이 화면 밖일 가능성에 대비해 항상 fly-to. 시스템 동작이라
  // userInteractedRef 는 false 유지 — onViewportChangeEnd 가 발사 안 함.
  useEffect(() => {
    if (!highlightedId) return;
    const target = markers.find((m) => m.id === highlightedId);
    if (!target) return;
    handleRef.current?.flyTo(target.lat, target.lng);
  }, [highlightedId, markers]);

  // 더블클릭 = 해당 식당으로 확대. zoomFocus 참조가 바뀔 때마다 flyToZoomIn —
  // 클릭/호버 패닝(줌 유지)과 달리 ZOOM_IN_LEVEL 까지 당긴다(이미 더 확대면 유지).
  useEffect(() => {
    if (!zoomFocus) return;
    const target = markers.find((m) => m.id === zoomFocus.placeId);
    if (!target) return;
    handleRef.current?.flyToZoomIn(target.lat, target.lng, ZOOM_IN_LEVEL);
  }, [zoomFocus, markers]);

  // 첫 등록 마커 묶음 fit. markers 가 빈 → 채워짐 으로 바뀐 첫 시점에만.
  useEffect(() => {
    if (didInitialFitRef.current) return;
    const registered = markers.filter((m) => m.variant === 'muted');
    if (registered.length === 0) return;
    handleRef.current?.fitToMarkers(80);
    didInitialFitRef.current = true;
  }, [markers]);

  // focusCoord 참조가 바뀌면 fly — "내 위치" 버튼 클릭 경로. 같은 좌표라도
  // 호출자가 새 object 를 넘기면 다시 fly(idempotent). apiKey 가 늦게 와서
  // 마운트가 늦어진 경우를 위해 apiKey 도 deps 에 포함. 검색 bbox 는 건드리지
  // 않고 지도만 이동 — 이후 사용자가 검색하면 onViewportSync 가 잡은 현재
  // 영역으로 자동으로 떨어진다(PublicRestaurantsMap 과 다른 어드민 워크플로).
  // 이동만 하지 않고 동네 수준(MY_LOCATION_ZOOM)으로 함께 확대한다.
  useEffect(() => {
    if (!focusCoord || !apiKey) return;
    handleRef.current?.flyTo(focusCoord.lat, focusCoord.lng, MY_LOCATION_ZOOM);
  }, [focusCoord, apiKey]);

  const handleViewportChange = useCallback((viewport: MapViewport) => {
    setPendingViewport(viewport);
  }, []);

  const handleViewportSync = useCallback(
    (viewport: MapViewport) => {
      onViewportSync?.(formatBbox(viewport.bbox));
    },
    [onViewportSync],
  );

  const pendingBboxStr = pendingViewport ? formatBbox(pendingViewport.bbox) : null;
  const showResearch = pendingBboxStr !== null && pendingBboxStr !== appliedBbox;

  // 컨트롤은 패널 반대편 모서리에 — 패널이 우측이면 컨트롤은 좌측에.
  const controlSideClass = panelSide === 'right' ? 'left-3' : 'right-3';

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
          지도 키가 등록되지 않았습니다.{' '}
          <Link to="/admin/settings/map" className="text-primary underline">
            설정 &gt; 지도
          </Link>
          에서 vworld 키를 등록하세요.
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
        selectedMarkerId={highlightedId}
        onMarkerSelect={onSelectMarker}
        onViewportChangeEnd={handleViewportChange}
        onViewportSync={handleViewportSync}
        onTileError={() => setTileError(true)}
      />

      {tileError && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive shadow-sm">
          지도 타일을 불러오지 못했습니다. 키가 유효한지 확인해 주세요.
        </div>
      )}

      {/* "이 지역 재검색" — 모바일은 상단 중앙(하단의 패널/지도 토글과 겹침
          방지), xl+ 은 기존 위치(하단 중앙) 유지. */}
      {showResearch && pendingBboxStr && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 xl:bottom-6 xl:top-auto">
          <Button
            type="button"
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

      {/* 컨트롤 그룹 — 패널 반대편 모서리. "내 위치" 는 모서리에 고정해
          "전체 영역" 토글 시 흔들리지 않게 한다(모서리가 좌측이면 내 위치를
          먼저, 우측이면 나중에 배치). */}
      {(appliedBbox || (onRequestLocation && locationStatus)) && (
        <div
          className={cn(
            'absolute top-3 flex items-center gap-2',
            controlSideClass,
          )}
        >
          {onRequestLocation && locationStatus && panelSide === 'right' && (
            <MyLocationButton status={locationStatus} onClick={onRequestLocation} />
          )}
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
          {onRequestLocation && locationStatus && panelSide !== 'right' && (
            <MyLocationButton status={locationStatus} onClick={onRequestLocation} />
          )}
        </div>
      )}
    </div>
  );
};

const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <div className="flex size-full items-center justify-center gap-2 bg-muted/30 p-6 text-sm text-muted-foreground">
    {children}
  </div>
);
