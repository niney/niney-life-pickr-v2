import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { ApiError, useMapPublicConfig } from '@repo/shared';
import { buildMyLocationMarkerDataUrl, buildSeaSpotMarkerDataUrl, type SeaIndexLevel } from '@repo/utils';
import { MapCanvas, type MapCanvasHandle, type MapMarker } from '~/components/restaurant/MapCanvas';
import { cn } from '~/lib/utils';
import type { SeaRankedSpot } from './seaFormat';

// 바다 지점 지도 — 선택 날짜·시간대 지수 단계를 마커색으로(대기 측정소 지도와 같은 원/핀 프레임). 라벨은 선택
// 지점과 상위 3곳만(해안선에 50곳이 몰려 전부 붙이면 겹친다). 마커 클릭 = 지점 선택. 내 위치는 fit 에서 빠지는
// 오버레이.

type IconKey = SeaIndexLevel | 'none';
const ICON_KEYS: IconKey[] = ['none', 0, 1, 2, 3, 4, 5];
const ICONS = Object.fromEntries(
  ICON_KEYS.map((k) => {
    const level = k === 'none' ? null : k;
    return [String(k), { src: buildSeaSpotMarkerDataUrl(level, false), selectedSrc: buildSeaSpotMarkerDataUrl(level, true) }];
  }),
) as Record<string, { src: string; selectedSrc: string }>;
const MY_LOCATION_URL = buildMyLocationMarkerDataUrl();
const MY_LOCATION_ID = 'my-location';
// 남한 해안 전체가 한눈에.
const KOREA_CENTER = { lat: 36.0, lng: 127.8, zoom: 7 };
const SELECT_ZOOM = 11;
const LABEL_TOP = 3;

interface Props {
  ranked: SeaRankedSpot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  myLocation: { lat: number; lng: number } | null;
  className?: string;
}

export const SeaMap = ({ ranked, selectedId, onSelect, myLocation, className }: Props) => {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  const keyMissing = config.isError && config.error instanceof ApiError && config.error.statusCode === 404;
  const handleRef = useRef<MapCanvasHandle>(null);

  const markers = useMemo<MapMarker[]>(
    () =>
      ranked.map((r, i) => {
        const level = r.slot?.level ?? null;
        const labeled = r.spot.id === selectedId || (i < LABEL_TOP && level !== null && level >= 4);
        return {
          id: r.spot.id,
          lat: r.spot.lat,
          lng: r.spot.lng,
          label: labeled ? r.spot.name : undefined,
          icon: ICONS[String(level ?? 'none')]!,
        };
      }),
    [ranked, selectedId],
  );
  const overlayMarkers = useMemo<MapMarker[]>(
    () =>
      myLocation
        ? [{ id: MY_LOCATION_ID, lat: myLocation.lat, lng: myLocation.lng, icon: { src: MY_LOCATION_URL, selectedSrc: MY_LOCATION_URL } }]
        : [],
    [myLocation],
  );

  // 선택 지점으로 카메라 이동 — 지도는 외부 시스템이라 effect. 줌아웃은 하지 않는다.
  const selected = ranked.find((r) => r.spot.id === selectedId)?.spot ?? null;
  const selectedKey = selected ? `${selected.lat},${selected.lng}` : null;
  useEffect(() => {
    if (selected) handleRef.current?.flyToZoomIn(selected.lat, selected.lng, SELECT_ZOOM);
    // 좌표 변화만 추적(날짜·시간대가 바뀌어 객체가 새로 만들어져도 다시 날지 않게).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const handleMarkerSelect = useCallback(
    (id: string) => {
      if (id !== MY_LOCATION_ID) onSelect(id);
    },
    [onSelect],
  );

  if (config.isLoading) {
    return (
      <div className={cn('flex items-center justify-center text-sm text-muted-foreground', className)}>
        <Loader2 className="mr-2 size-4 animate-spin" /> 지도 설정 불러오는 중…
      </div>
    );
  }
  if (keyMissing || !apiKey) {
    return (
      <div className={cn('flex items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground', className)}>
        지도 키(vworld)가 설정되지 않아 지도를 표시할 수 없습니다. 어드민 &gt; 설정 &gt; 지도에서 키를 등록하세요.
      </div>
    );
  }
  return (
    <div className={cn('relative overflow-hidden rounded-md border', className)}>
      <MapCanvas
        ref={handleRef}
        apiKey={apiKey}
        markers={markers}
        selectedMarkerId={selectedId}
        initialCenter={KOREA_CENTER}
        onMarkerSelect={handleMarkerSelect}
        overlayMarkers={overlayMarkers}
        poolKey="sea"
        className="h-full w-full"
      />
    </div>
  );
};
