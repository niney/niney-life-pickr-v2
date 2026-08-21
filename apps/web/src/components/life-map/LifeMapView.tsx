import { forwardRef, useCallback, useMemo } from 'react';
import { Loader2, ZoomIn } from 'lucide-react';
import { ApiError, useMapPublicConfig, type UserLocationStatus } from '@repo/shared';
import type { LifeMapCellType, LifeMapPointsResultType } from '@repo/api-contract';
import { buildAirSavedLocationMarkerDataUrl, buildMyLocationMarkerDataUrl, type LifeMapLayer } from '@repo/utils';
import { MapCanvas, type MapCanvasHandle, type MapMarker, type MapViewport } from '~/components/restaurant/MapCanvas';
import { MyLocationButton } from '~/components/restaurant/MyLocationButton';
import { buildLifeMarkers, lifeCellAt, parseLifeMarkerId } from './lifeMapMarkers';

// 일상지도 지도 뷰 — MapCanvas 한 장에 CCTV 점/셀 + 화장실 원/핀을 한 소스로 그린다(화장실을
// 뒤에 넣어 점 위에 오게). 내 위치(파란 점)·저장 위치(보라 점)는 fit 에서 빠지는 오버레이.
// 키 게이트(로딩/미등록/오류) 3분기는 대기·버스 지도와 같은 정책.

const MY_LOCATION_URL = buildMyLocationMarkerDataUrl();
const SAVED_LOCATION_URL = buildAirSavedLocationMarkerDataUrl();
const MY_LOCATION_ID = 'my-location';
const SAVED_LOCATION_ID = 'saved-location';
const EMPTY_IDS: ReadonlySet<string> = new Set();

interface Props {
  cctv: LifeMapPointsResultType | undefined;
  toilet: LifeMapPointsResultType | undefined;
  // 라벨을 붙일 화장실 id(주변 목록 + 선택).
  labeledToiletIds?: ReadonlySet<string>;
  selectedMarkerId: string | null;
  initialCenter: { lat: number; lng: number; zoom: number };
  myLocation: { lat: number; lng: number } | null;
  savedLocation: { lat: number; lng: number } | null;
  locationStatus: UserLocationStatus;
  onLocate: () => void;
  loading: boolean;
  // 상단 중앙 안내(셀 모드 → 확대 안내, 절단 안내). null 이면 숨김.
  hint: string | null;
  onSelectPoint: (layer: LifeMapLayer, id: string) => void;
  onSelectCell: (layer: LifeMapLayer, cell: LifeMapCellType) => void;
  onViewportSync: (vp: MapViewport) => void;
  onViewportChangeEnd: (vp: MapViewport) => void;
  poolKey?: string;
}

export const LifeMapView = forwardRef<MapCanvasHandle, Props>(function LifeMapView(
  {
    cctv,
    toilet,
    labeledToiletIds = EMPTY_IDS,
    selectedMarkerId,
    initialCenter,
    myLocation,
    savedLocation,
    locationStatus,
    onLocate,
    loading,
    hint,
    onSelectPoint,
    onSelectCell,
    onViewportSync,
    onViewportChangeEnd,
    poolKey = 'life',
  },
  ref,
) {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  const keyMissing = config.isError && config.error instanceof ApiError && config.error.statusCode === 404;

  const markers = useMemo<MapMarker[]>(
    () => [...buildLifeMarkers('cctv', cctv, EMPTY_IDS), ...buildLifeMarkers('toilet', toilet, labeledToiletIds)],
    [cctv, toilet, labeledToiletIds],
  );
  const overlayMarkers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (savedLocation) {
      out.push({
        id: SAVED_LOCATION_ID,
        lat: savedLocation.lat,
        lng: savedLocation.lng,
        label: '내 위치',
        icon: { src: SAVED_LOCATION_URL, selectedSrc: SAVED_LOCATION_URL },
      });
    }
    if (myLocation) {
      out.push({ id: MY_LOCATION_ID, lat: myLocation.lat, lng: myLocation.lng, icon: { src: MY_LOCATION_URL, selectedSrc: MY_LOCATION_URL } });
    }
    return out;
  }, [myLocation, savedLocation]);

  const handleMarkerSelect = useCallback(
    (markerId: string) => {
      const parsed = parseLifeMarkerId(markerId);
      if (!parsed) return;
      if (parsed.kind === 'point') {
        onSelectPoint(parsed.layer, parsed.id);
        return;
      }
      const cell = lifeCellAt(parsed.layer === 'cctv' ? cctv : toilet, parsed.index);
      if (cell) onSelectCell(parsed.layer, cell);
    },
    [cctv, toilet, onSelectPoint, onSelectCell],
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
    <div className="relative size-full" data-testid="life-map-view">
      <MapCanvas
        ref={ref}
        apiKey={apiKey}
        poolKey={poolKey}
        markers={markers}
        overlayMarkers={overlayMarkers}
        selectedMarkerId={selectedMarkerId}
        initialCenter={initialCenter}
        onMarkerSelect={handleMarkerSelect}
        onViewportSync={onViewportSync}
        onViewportChangeEnd={onViewportChangeEnd}
      />
      {/* 상단 중앙 — 로딩 칩 / 확대 안내 칩(같은 슬롯, 로딩이 우선). */}
      {loading ? (
        <div className="absolute left-1/2 top-3 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md">
          <Loader2 className="size-3.5 animate-spin" />
          불러오는 중…
        </div>
      ) : hint ? (
        <div
          className="absolute left-1/2 top-3 z-10 inline-flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md"
          data-testid="life-map-hint"
        >
          <ZoomIn className="size-3.5 shrink-0" />
          <span className="truncate">{hint}</span>
        </div>
      ) : null}
      {/* 우하단 — 내 위치(좌하단은 MapCanvas 레이어 컨트롤). */}
      <div className="absolute bottom-3 right-3 z-10">
        <MyLocationButton status={locationStatus} onClick={onLocate} />
      </div>
    </div>
  );
});

const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <div className="flex size-full items-center justify-center gap-2 bg-muted/30 p-6 text-sm text-muted-foreground">
    {children}
  </div>
);
