import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Crosshair, Loader2 } from 'lucide-react';
import { ApiError, useMapPublicConfig } from '@repo/shared';
import type {
  AirMeasureItemType,
  AirNearbyStationItemType,
  AirStationInfoItemType,
} from '@repo/api-contract';
import {
  AIR_SIDO_OPTIONS,
  airSidoMatches,
  buildAirSavedLocationMarkerDataUrl,
  buildAirStationMarkerDataUrl,
  buildMyLocationMarkerDataUrl,
  type AirGradeLevel,
} from '@repo/utils';
import {
  MapCanvas,
  type MapCanvasHandle,
  type MapMarker,
  type MapViewport,
} from '~/components/restaurant/MapCanvas';
import { cn } from '~/lib/utils';

// 전국 측정소 지도 — 측정소정보 API 의 좌표에 '전국' 실시간 캐시의 현재 통합지수
// 등급을 색으로 얹는다(마커색 = 상태색, 선택은 핀). 마커 클릭 = 측정소 선택(시도도
// 함께). 내 위치(파란 점)·저장 위치(보라 점)는 fit 에서 제외되는 오버레이 레이어.
// picking 이면 화면 중앙에 십자선을 띄우고 지도 중심 좌표를 onCenterChange 로 올린다
// (지도에서 직접 지정 — 지도를 움직여 십자선을 원하는 지점에 맞춘다).

// 등급(0=없음,1~4)×선택 10종 — 모듈 레벨에서 한 번 만들어 공유(OL 아이콘 캐시).
const ICONS: Record<0 | AirGradeLevel, { src: string; selectedSrc: string }> = {
  0: { src: buildAirStationMarkerDataUrl({ grade: null, selected: false }), selectedSrc: buildAirStationMarkerDataUrl({ grade: null, selected: true }) },
  1: { src: buildAirStationMarkerDataUrl({ grade: 1, selected: false }), selectedSrc: buildAirStationMarkerDataUrl({ grade: 1, selected: true }) },
  2: { src: buildAirStationMarkerDataUrl({ grade: 2, selected: false }), selectedSrc: buildAirStationMarkerDataUrl({ grade: 2, selected: true }) },
  3: { src: buildAirStationMarkerDataUrl({ grade: 3, selected: false }), selectedSrc: buildAirStationMarkerDataUrl({ grade: 3, selected: true }) },
  4: { src: buildAirStationMarkerDataUrl({ grade: 4, selected: false }), selectedSrc: buildAirStationMarkerDataUrl({ grade: 4, selected: true }) },
};
const MY_LOCATION_URL = buildMyLocationMarkerDataUrl();
const SAVED_LOCATION_URL = buildAirSavedLocationMarkerDataUrl();
const MY_LOCATION_ID = 'my-location';
const SAVED_LOCATION_ID = 'saved-location';
// 전국이 한눈에 — 한반도 남부 중심, 줌 7.
const KOREA_CENTER = { lat: 36.3, lng: 127.8, zoom: 7 };
const SELECT_ZOOM = 11;

interface Props {
  stations: AirStationInfoItemType[];
  // '전국' 실시간 측정값 — 측정소명으로 조인해 마커색을 정한다.
  measures: AirMeasureItemType[];
  selectedStation: string | null;
  onSelect: (stationName: string, sidoOption: string | null) => void;
  myLocation: { lat: number; lng: number } | null;
  // 저장한 내 대기 위치 — 보라 점.
  savedLocation?: { lat: number; lng: number } | null;
  // 내 주변 결과 — 이 측정소들만 지도 라벨을 붙인다(650개 전부 라벨은 과밀).
  nearby: AirNearbyStationItemType[];
  // 지도에서 직접 지정 모드 — 중앙 십자선 + 중심 좌표 보고.
  picking?: boolean;
  onCenterChange?: (center: { lat: number; lng: number }) => void;
  className?: string;
}

type StationWithCoords = AirStationInfoItemType & { lat: number; lng: number };
const markerIdOf = (s: StationWithCoords): string =>
  `air:${s.stationName}|${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;

export const AirStationsMap = ({
  stations,
  measures,
  selectedStation,
  onSelect,
  myLocation,
  savedLocation,
  nearby,
  picking,
  onCenterChange,
  className,
}: Props) => {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  // 키 미등록은 404 — ApiError statusCode 로 분기(버스/지하철 지도와 동일 정책).
  const keyMissing =
    config.isError && config.error instanceof ApiError && config.error.statusCode === 404;
  const handleRef = useRef<MapCanvasHandle>(null);

  const withCoords = useMemo(
    () => stations.filter((s): s is StationWithCoords => s.lat !== null && s.lng !== null),
    [stations],
  );
  const byId = useMemo(() => new Map(withCoords.map((s) => [markerIdOf(s), s] as const)), [withCoords]);
  const gradeByName = useMemo(() => {
    const m = new Map<string, AirGradeLevel | null>();
    for (const it of measures) if (!m.has(it.stationName)) m.set(it.stationName, it.khaiGrade);
    return m;
  }, [measures]);
  const nearbyNames = useMemo(() => new Set(nearby.map((n) => n.stationName)), [nearby]);

  const markers = useMemo<MapMarker[]>(
    () =>
      withCoords.map((s) => {
        const grade = gradeByName.get(s.stationName) ?? null;
        const labeled = s.stationName === selectedStation || nearbyNames.has(s.stationName);
        return {
          id: markerIdOf(s),
          lat: s.lat,
          lng: s.lng,
          label: labeled ? s.stationName : undefined,
          icon: ICONS[grade ?? 0],
        };
      }),
    [withCoords, gradeByName, nearbyNames, selectedStation],
  );
  const selectedMarkerId = useMemo(() => {
    const s = withCoords.find((st) => st.stationName === selectedStation);
    return s ? markerIdOf(s) : null;
  }, [withCoords, selectedStation]);
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
      out.push({
        id: MY_LOCATION_ID,
        lat: myLocation.lat,
        lng: myLocation.lng,
        icon: { src: MY_LOCATION_URL, selectedSrc: MY_LOCATION_URL },
      });
    }
    return out;
  }, [myLocation, savedLocation]);

  // 선택 측정소로 카메라 이동 — 지도는 외부 시스템이라 effect. 줌아웃은 하지 않는다.
  useEffect(() => {
    const s = withCoords.find((st) => st.stationName === selectedStation);
    if (s) handleRef.current?.flyToZoomIn(s.lat, s.lng, SELECT_ZOOM);
  }, [selectedStation, withCoords]);
  // 내 위치를 얻으면 그곳으로.
  useEffect(() => {
    if (myLocation) handleRef.current?.flyToZoomIn(myLocation.lat, myLocation.lng, SELECT_ZOOM);
  }, [myLocation]);
  // 저장 위치가 새로 생기거나 바뀌면 그곳으로(지정 모드 중에는 사용자가 움직이는 중이라 제외).
  const savedKey = savedLocation ? `${savedLocation.lat},${savedLocation.lng}` : null;
  useEffect(() => {
    if (picking || !savedLocation) return;
    handleRef.current?.flyToZoomIn(savedLocation.lat, savedLocation.lng, SELECT_ZOOM);
    // savedKey 로 좌표 변화만 추적(객체 identity 무시).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const handleMarkerSelect = useCallback(
    (id: string) => {
      if (id === MY_LOCATION_ID || id === SAVED_LOCATION_ID) return;
      const s = byId.get(id);
      if (!s) return;
      const option =
        AIR_SIDO_OPTIONS.find(
          (o) => o.value !== '전국' && s.sidoName !== null && airSidoMatches(o.value, s.sidoName),
        )?.value ?? null;
      onSelect(s.stationName, option);
    },
    [byId, onSelect],
  );
  const handleViewportSync = useCallback(
    (vp: MapViewport) => onCenterChange?.({ lat: vp.centerLat, lng: vp.centerLng }),
    [onCenterChange],
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
    <div className={cn('relative', className)}>
      <MapCanvas
        ref={handleRef}
        apiKey={apiKey}
        markers={markers}
        selectedMarkerId={selectedMarkerId}
        initialCenter={KOREA_CENTER}
        onMarkerSelect={handleMarkerSelect}
        overlayMarkers={overlayMarkers}
        onViewportSync={onCenterChange ? handleViewportSync : undefined}
        poolKey="air"
        className="h-full w-full"
      />
      {picking && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <span className="rounded-full bg-background/70 p-1.5 shadow-md ring-1 ring-border">
            <Crosshair className="size-6 text-violet-600 dark:text-violet-400" strokeWidth={2.25} />
          </span>
        </div>
      )}
    </div>
  );
};
