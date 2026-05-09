import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, RefreshCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError, useMapPublicConfig } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
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
  // URL 의 bbox(이미 검색에 반영된 영역). 사용자가 패닝하여 다른 영역으로 가면
  // "이 지역 재검색" 버튼이 노출된다.
  appliedBbox: string | null;
  onSelectMarker(placeId: string): void;
  onResearchInArea(bbox: string): void;
  onClearArea(): void;
  // 컨트롤(전체 영역 등)을 패널 반대편 모서리에 붙이기 위해 받아둔다.
  panelSide: PanelSide;
}

const formatBbox = (b: MapViewport['bbox']): string =>
  // 5자리 → vworld bbox 1m 정도 해상도면 충분.
  [b.minLng, b.minLat, b.maxLng, b.maxLat].map((n) => n.toFixed(5)).join(',');

export const DiscoverMap = ({
  markers,
  selectedPlaceId,
  hoveredPlaceId,
  appliedBbox,
  onSelectMarker,
  onResearchInArea,
  onClearArea,
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

  // 첫 등록 마커 묶음 fit. markers 가 빈 → 채워짐 으로 바뀐 첫 시점에만.
  useEffect(() => {
    if (didInitialFitRef.current) return;
    const registered = markers.filter((m) => m.variant === 'muted');
    if (registered.length === 0) return;
    handleRef.current?.fitToMarkers(80);
    didInitialFitRef.current = true;
  }, [markers]);

  const handleViewportChange = useCallback((viewport: MapViewport) => {
    setPendingViewport(viewport);
  }, []);

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
        onTileError={() => setTileError(true)}
      />

      {tileError && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive shadow-sm">
          지도 타일을 불러오지 못했습니다. 키가 유효한지 확인해 주세요.
        </div>
      )}

      {showResearch && pendingBboxStr && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
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

      {appliedBbox && (
        <div className={cn('absolute top-3', controlSideClass)}>
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
