import { forwardRef, useCallback, useMemo } from 'react';
import { Loader2, ZoomIn } from 'lucide-react';
import { ApiError, useMapPublicConfig, type UserLocationStatus } from '@repo/shared';
import { buildAirSavedLocationMarkerDataUrl, buildMyLocationMarkerDataUrl } from '@repo/utils';
import { MapCanvas, type MapCanvasHandle, type MapMarker, type MapViewport } from '~/components/restaurant/MapCanvas';
import { MyLocationButton } from '~/components/restaurant/MyLocationButton';
import { parseParkingMarkerId, type ParsedParkingMarkerId } from './parkingMarkers';

// 주차 지도 뷰 — MapCanvas 한 장에 지금 탭(주차장·충전소·공항)의 마커를 한 소스로 그린다(마커는 페이지가 만든다).
// 내 위치(파란 점)·저장 위치(보라 점)는 fit 에서 빠지는 오버레이. 키 게이트(로딩/미등록) 분기는 집값·일상지도와 같다.

const MY_LOCATION_URL = buildMyLocationMarkerDataUrl();
const SAVED_LOCATION_URL = buildAirSavedLocationMarkerDataUrl();

interface Props {
  markers: MapMarker[];
  selectedMarkerId: string | null;
  initialCenter: { lat: number; lng: number; zoom: number };
  myLocation: { lat: number; lng: number } | null;
  savedLocation: { lat: number; lng: number } | null;
  locationStatus: UserLocationStatus;
  onLocate: () => void;
  loading: boolean;
  hint: string | null;
  onMarkerSelect: (parsed: ParsedParkingMarkerId) => void;
  onViewportSync: (vp: MapViewport) => void;
  onViewportChangeEnd: (vp: MapViewport) => void;
}

export const ParkingMapView = forwardRef<MapCanvasHandle, Props>(function ParkingMapView(
  { markers, selectedMarkerId, initialCenter, myLocation, savedLocation, locationStatus, onLocate, loading, hint, onMarkerSelect, onViewportSync, onViewportChangeEnd },
  ref,
) {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  const keyMissing = config.isError && config.error instanceof ApiError && config.error.statusCode === 404;

  const overlayMarkers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (savedLocation) {
      out.push({ id: 'saved-location', lat: savedLocation.lat, lng: savedLocation.lng, label: '내 위치', icon: { src: SAVED_LOCATION_URL, selectedSrc: SAVED_LOCATION_URL } });
    }
    if (myLocation) out.push({ id: 'my-location', lat: myLocation.lat, lng: myLocation.lng, icon: { src: MY_LOCATION_URL, selectedSrc: MY_LOCATION_URL } });
    return out;
  }, [myLocation, savedLocation]);

  const handleMarkerSelect = useCallback(
    (markerId: string) => {
      const parsed = parseParkingMarkerId(markerId);
      if (parsed) onMarkerSelect(parsed);
    },
    [onMarkerSelect],
  );

  if (config.isLoading) {
    return (
      <Placeholder>
        <Loader2 className="size-4 animate-spin" /> 지도 키 확인 중…
      </Placeholder>
    );
  }
  if (keyMissing || !apiKey) {
    return (
      <Placeholder>
        <div className="text-center">
          지도 키(vworld)가 설정되지 않아 지도를 표시할 수 없습니다.
          <br />
          어드민 &gt; 설정 &gt; 지도에서 키를 등록하세요.
        </div>
      </Placeholder>
    );
  }

  return (
    <div className="relative size-full" data-testid="parking-map-view">
      <MapCanvas
        ref={ref}
        apiKey={apiKey}
        poolKey="parking"
        markers={markers}
        overlayMarkers={overlayMarkers}
        selectedMarkerId={selectedMarkerId}
        initialCenter={initialCenter}
        onMarkerSelect={handleMarkerSelect}
        onViewportSync={onViewportSync}
        onViewportChangeEnd={onViewportChangeEnd}
      />
      {loading ? (
        <div className="absolute left-1/2 top-3 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md">
          <Loader2 className="size-3.5 animate-spin" />
          불러오는 중…
        </div>
      ) : hint ? (
        <div
          className="absolute left-1/2 top-3 z-10 inline-flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md"
          data-testid="parking-map-hint"
        >
          <ZoomIn className="size-3.5 shrink-0" />
          <span className="truncate">{hint}</span>
        </div>
      ) : null}
      <div className="absolute bottom-[calc(0.75rem+var(--map-bottom-inset,0px))] right-3 z-10">
        <MyLocationButton status={locationStatus} onClick={onLocate} />
      </div>
    </div>
  );
});

const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <div className="flex size-full items-center justify-center gap-2 bg-muted/30 p-6 text-sm text-muted-foreground">{children}</div>
);
