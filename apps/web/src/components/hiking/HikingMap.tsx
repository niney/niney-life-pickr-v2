import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import type { HikingCourseSummaryType, HikingMountainSummaryType, HikingPoiType } from '@repo/api-contract';
import { ApiError, useMapPublicConfig } from '@repo/shared';
import {
  HIKING_MAP_POI_CATEGORIES,
  HIKING_SELECTED_COURSE_COLOR,
  buildHikingMountainMarkerDataUrl,
  buildHikingPoiMarkerDataUrl,
  buildMyLocationMarkerDataUrl,
  hikingCourseColor,
  isHikingMapPoiCategory,
  type HikingMapPoiCategory,
  type LatLng,
} from '@repo/utils';
import { MapCanvas, type MapCanvasHandle, type MapMarker } from '~/components/restaurant/MapCanvas';
import { cn } from '~/lib/utils';
import { decodePieces } from './hikingFormat';

// 등산 지도 — 산 마커(초록 산) 위에, 산을 고르면 그 산 코스 선 전부(코스마다 색, 고른 코스는 빨강·맨 위), 코스를 고르면
// 코스 지점(정상·갈림길·위험·화장실·주차·정류장 …)과 고도 그래프에서 가리킨 자리. 카메라는 산·코스 범위에 맞춘다.

const MOUNTAIN_ICON = { src: buildHikingMountainMarkerDataUrl(false), selectedSrc: buildHikingMountainMarkerDataUrl(true) };
const POI_ICON = Object.fromEntries(
  HIKING_MAP_POI_CATEGORIES.map((c) => [
    c,
    { src: buildHikingPoiMarkerDataUrl(c, false), selectedSrc: buildHikingPoiMarkerDataUrl(c, true) },
  ]),
) as Record<HikingMapPoiCategory, { src: string; selectedSrc: string }>;
const MY_LOCATION_URL = buildMyLocationMarkerDataUrl();
const HOVER_ID = 'hover';
const POI_PREFIX = 'poi:';
const KOREA_CENTER = { lat: 36.3, lng: 127.8, zoom: 7 };

interface Props {
  mountains: HikingMountainSummaryType[];
  selectedMountainId: string | null;
  // 고른 산의 코스(상세가 오기 전엔 null).
  courses: HikingCourseSummaryType[] | null;
  selectedCourseId: string | null;
  // 고른 코스의 지점 — 지도 분류(HIKING_MAP_POI_CATEGORIES)만 그린다.
  pois: HikingPoiType[];
  selectedPoiId: string | null;
  hoverPoint: LatLng | null;
  myLocation: LatLng | null;
  onSelectMountain: (id: string) => void;
  onSelectPoi: (id: string) => void;
  className?: string;
}

export const HikingMap = ({
  mountains,
  selectedMountainId,
  courses,
  selectedCourseId,
  pois,
  selectedPoiId,
  hoverPoint,
  myLocation,
  onSelectMountain,
  onSelectPoi,
  className,
}: Props) => {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  const keyMissing = config.isError && config.error instanceof ApiError && config.error.statusCode === 404;
  const handleRef = useRef<MapCanvasHandle>(null);

  // 코스를 고르면 그 산 마커는 뺀다 — 정상 지점(PEAK)과 같은 자리라 겹친다.
  const markers = useMemo<MapMarker[]>(
    () =>
      mountains
        .filter((m) => !(selectedCourseId && m.id === selectedMountainId))
        .map((m) => ({ id: m.id, lat: m.lat, lng: m.lng, label: m.name, icon: MOUNTAIN_ICON })),
    [mountains, selectedCourseId, selectedMountainId],
  );

  const overlayMarkers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    for (const p of pois) {
      if (!isHikingMapPoiCategory(p.category)) continue;
      const icon = POI_ICON[p.category];
      out.push({ id: `${POI_PREFIX}${p.id}`, lat: p.lat, lng: p.lng, icon: p.id === selectedPoiId ? { src: icon.selectedSrc, selectedSrc: icon.selectedSrc } : icon });
    }
    if (hoverPoint) out.push({ id: HOVER_ID, lat: hoverPoint.lat, lng: hoverPoint.lng, icon: { src: MY_LOCATION_URL, selectedSrc: MY_LOCATION_URL } });
    else if (myLocation) out.push({ id: 'me', lat: myLocation.lat, lng: myLocation.lng, icon: { src: MY_LOCATION_URL, selectedSrc: MY_LOCATION_URL } });
    return out;
  }, [pois, selectedPoiId, hoverPoint, myLocation]);

  // 코스 선 — 고른 코스를 마지막(맨 위)에 빨강으로.
  const routeLine = useMemo(() => {
    if (!courses) return null;
    const ordered = [...courses].sort((a, b) => Number(a.id === selectedCourseId) - Number(b.id === selectedCourseId));
    return ordered.flatMap((c) => {
      const color = c.id === selectedCourseId ? HIKING_SELECTED_COURSE_COLOR : hikingCourseColor(courses.indexOf(c));
      return decodePieces(c.pieces).map((points) => ({ points, color }));
    });
  }, [courses, selectedCourseId]);

  // 카메라 — 코스를 고르면 코스 범위, 산만 고르면 산의 코스 전체 범위. 지도는 외부 시스템이라 effect.
  // 지도가 늦게 뜨는 첫 진입(?m=…) 도 맞추게 apiKey 를 같이 본다.
  const focus = useMemo(() => {
    const course = courses?.find((c) => c.id === selectedCourseId);
    const boxes = course ? [course.bbox] : (courses ?? []).map((c) => c.bbox);
    if (boxes.length === 0) return null;
    const corners = boxes.flatMap((b) => [
      { lat: b.minLat, lng: b.minLng },
      { lat: b.maxLat, lng: b.maxLng },
    ]);
    return { key: `${selectedMountainId}|${selectedCourseId}`, corners };
  }, [courses, selectedCourseId, selectedMountainId]);
  useEffect(() => {
    if (focus) handleRef.current?.fitToCoords(focus.corners, 48);
    // 산·코스가 바뀔 때만(같은 코스의 데이터가 다시 와도 사용자가 옮긴 화면을 되돌리지 않게).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key, apiKey]);

  const handleMarkerSelect = useCallback(
    (id: string) => {
      if (id.startsWith(POI_PREFIX)) onSelectPoi(id.slice(POI_PREFIX.length));
      else if (id !== HOVER_ID && id !== 'me') onSelectMountain(id);
    },
    [onSelectMountain, onSelectPoi],
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
        selectedMarkerId={selectedMountainId}
        initialCenter={KOREA_CENTER}
        onMarkerSelect={handleMarkerSelect}
        overlayMarkers={overlayMarkers}
        routeLine={routeLine}
        poolKey="hiking"
        className="h-full w-full"
      />
    </div>
  );
};
