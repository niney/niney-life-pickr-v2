import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { HikingCourseSummaryType, HikingMountainSummaryType, HikingPoiType } from '@repo/api-contract';
import { ApiError, useMapPublicConfig } from '@repo/shared';
import {
  HIKING_MAP_POI_CATEGORIES,
  HIKING_PEAK_POINT_ZOOM,
  HIKING_SELECTED_COURSE_COLOR,
  LIFE_CELL_ORIGIN,
  buildHikingCellMarkerDataUrl,
  buildHikingMountainMarkerDataUrl,
  buildHikingPeakMarkerDataUrl,
  buildHikingPoiMarkerDataUrl,
  buildMyLocationMarkerDataUrl,
  hikingCourseColor,
  isHikingMapPoiCategory,
  lifeCellSizeDeg,
  type HikingMapPoiCategory,
  type LatLng,
} from '@repo/utils';
import { MapCanvas, type MapCanvasHandle, type MapMarker, type MapViewport, type WmsOverlay } from '~/components/restaurant/MapCanvas';
import { cn } from '~/lib/utils';
import { decodePieces } from './hikingFormat';

// 등산 지도 — 산 마커(100대 명산 초록 산·전국 봉우리 연초록 산 — 줌 10 아래에선 봉우리를 셀 개수 버블로 묶는다) 위에, 산을 고르면 그 산 코스 선 전부(코스마다 색, 고른 코스는 빨강·맨 위), 코스를 고르면
// 코스 지점(정상·갈림길·위험·화장실·주차·정류장 …)과 고도 그래프에서 가리킨 자리. 카메라는 산·코스 범위에 맞춘다.

const MOUNTAIN_ICON = { src: buildHikingMountainMarkerDataUrl(false), selectedSrc: buildHikingMountainMarkerDataUrl(true) };
const PEAK_ICON = { src: buildHikingPeakMarkerDataUrl(false), selectedSrc: buildHikingPeakMarkerDataUrl(true) };
const CELL_PREFIX = 'cell:';
const cellIconCache = new Map<number, string>();
const cellIcon = (count: number): string => {
  let url = cellIconCache.get(count);
  if (!url) {
    url = buildHikingCellMarkerDataUrl(count);
    cellIconCache.set(count, url);
  }
  return url;
};
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
// 7차 — 산림청 전국 등산로(브이월드 2D데이터 LT_L_FRSTCLIMB, 5.7만 구간)를 배경 선으로. 줌 12부터(전국을 덮으면 무겁고 안 보인다).
// 브이월드 WMS 는 EPSG:3857 요청이 자주 502 라 같은 좌표계 이름 EPSG:900913 으로 묻는다.
const TRAIL_WMS_MIN_ZOOM = 12;
const trailWms = (apiKey: string): WmsOverlay => ({
  url: 'https://api.vworld.kr/req/wms',
  params: { SERVICE: 'WMS', VERSION: '1.3.0', LAYERS: 'lt_l_frstclimb', STYLES: 'lt_l_frstclimb', FORMAT: 'image/png', TRANSPARENT: 'true', KEY: apiKey },
  projection: 'EPSG:900913',
  minZoom: TRAIL_WMS_MIN_ZOOM,
  opacity: 0.6,
});

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
  // 산·코스 범위에 맞출 때 아래를 덮는 높이(px) — 모바일 상세 시트(half)에 코스가 가리지 않게.
  fitBottomInset?: number;
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
  fitBottomInset = 0,
  className,
}: Props) => {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  const keyMissing = config.isError && config.error instanceof ApiError && config.error.statusCode === 404;
  const handleRef = useRef<MapCanvasHandle>(null);
  const trailOverlay = useMemo(() => (apiKey ? trailWms(apiKey) : null), [apiKey]);

  // 화면 범위·줌 — 지도는 외부 시스템이라 콜백으로 받아 둔다. 줌 HIKING_PEAK_POINT_ZOOM 아래면 100대 명산은 마커, 봉우리는
  // 셀 버블(일상지도·주차와 같은 격자), 이상이면 화면 안(여유 20%) 산을 전부 마커로.
  const [view, setView] = useState<MapViewport | null>(null);
  const zoom = Math.floor(view?.zoom ?? KOREA_CENTER.zoom);
  const lowZoom = zoom < HIKING_PEAK_POINT_ZOOM;
  const box = lowZoom ? null : view?.bbox ?? null;

  // 코스를 고르면 그 산 마커는 뺀다 — 정상 지점(PEAK)과 같은 자리라 겹친다. 고른 산은 줌과 상관없이 마커로.
  const { markers, cells } = useMemo(() => {
    const visible = mountains.filter((m) => !(selectedCourseId && m.id === selectedMountainId));
    const toMarker = (m: HikingMountainSummaryType): MapMarker => ({ id: m.id, lat: m.lat, lng: m.lng, label: m.name, icon: m.kind === 'peak' ? PEAK_ICON : MOUNTAIN_ICON });
    if (!lowZoom) {
      const padLat = box ? (box.maxLat - box.minLat) * 0.2 : 0;
      const padLng = box ? (box.maxLng - box.minLng) * 0.2 : 0;
      const inBox = (m: HikingMountainSummaryType) =>
        !box || (m.lat >= box.minLat - padLat && m.lat <= box.maxLat + padLat && m.lng >= box.minLng - padLng && m.lng <= box.maxLng + padLng);
      return { markers: visible.filter((m) => inBox(m) || m.id === selectedMountainId).map(toMarker), cells: [] as { lat: number; lng: number }[] };
    }
    const { dLng, dLat } = lifeCellSizeDeg(zoom);
    const groups = new Map<string, HikingMountainSummaryType[]>();
    const out: MapMarker[] = [];
    for (const m of visible) {
      if (m.kind !== 'peak' || m.id === selectedMountainId) {
        out.push(toMarker(m));
        continue;
      }
      const k = `${Math.floor((m.lng - LIFE_CELL_ORIGIN.lng) / dLng)},${Math.floor((m.lat - LIFE_CELL_ORIGIN.lat) / dLat)}`;
      const g = groups.get(k);
      if (g) g.push(m);
      else groups.set(k, [m]);
    }
    const centers: { lat: number; lng: number }[] = [];
    for (const g of groups.values()) {
      // 하나뿐인 셀은 봉우리 마커 그대로.
      if (g.length === 1) {
        out.push(toMarker(g[0]!));
        continue;
      }
      const c = { lat: g.reduce((s, m) => s + m.lat, 0) / g.length, lng: g.reduce((s, m) => s + m.lng, 0) / g.length };
      const src = cellIcon(g.length);
      // 개수를 새긴 버블이라 셀마다 그림이 다르다 — 사전 래스터화에서 뺀다(perMarker), 줌 축소 없이(fixedScale).
      out.push({ id: `${CELL_PREFIX}${centers.length}`, lat: c.lat, lng: c.lng, icon: { src, selectedSrc: src, perMarker: true }, fixedScale: true });
      centers.push(c);
    }
    return { markers: out, cells: centers };
  }, [mountains, selectedCourseId, selectedMountainId, lowZoom, zoom, box]);

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
    if (focus) handleRef.current?.fitToCoords(focus.corners, 48, { bottomInset: fitBottomInset });
    // 산·코스가 바뀔 때만(같은 코스의 데이터가 다시 와도 사용자가 옮긴 화면을 되돌리지 않게).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key, apiKey]);

  const handleMarkerSelect = useCallback(
    (id: string) => {
      if (id.startsWith(POI_PREFIX)) onSelectPoi(id.slice(POI_PREFIX.length));
      else if (id.startsWith(CELL_PREFIX)) {
        // 봉우리 묶음 — 봉우리가 하나씩 보이는 줌까지 들어간다.
        const c = cells[Number(id.slice(CELL_PREFIX.length))];
        if (c) handleRef.current?.flyToZoomIn(c.lat, c.lng, HIKING_PEAK_POINT_ZOOM + 1, { bottomInset: fitBottomInset });
      } else if (id !== HOVER_ID && id !== 'me') onSelectMountain(id);
    },
    [onSelectMountain, onSelectPoi, cells, fitBottomInset],
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
      <div className={cn('flex items-center justify-center px-4 text-center text-sm text-muted-foreground', className)}>
        지도 키(vworld)가 설정되지 않아 지도를 표시할 수 없습니다. 어드민 &gt; 설정 &gt; 지도에서 키를 등록하세요.
      </div>
    );
  }
  // 헤더 아래 한 화면을 채우는 지도(맛집·주차와 같은 틀)라 테두리·둥근 모서리 없이.
  return (
    <div className={cn('relative overflow-hidden', className)}>
      <MapCanvas
        ref={handleRef}
        apiKey={apiKey}
        markers={markers}
        selectedMarkerId={selectedMountainId}
        initialCenter={KOREA_CENTER}
        onMarkerSelect={handleMarkerSelect}
        onViewportSync={setView}
        overlayMarkers={overlayMarkers}
        routeLine={routeLine}
        wmsOverlay={trailOverlay}
        poolKey="hiking"
        className="h-full w-full"
      />
    </div>
  );
};
