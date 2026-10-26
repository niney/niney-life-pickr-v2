import type { HikingCourseDetailType, HikingMountainDetailType, HikingMountainSummaryType } from '@repo/api-contract';
import { decodePieces } from '@repo/shared';
import {
  HIKING_SELECTED_COURSE_COLOR,
  buildHikingMountainMarkerDataUrl,
  buildHikingPeakMarkerDataUrl,
  buildHikingPoiMarkerDataUrl,
  hikingCourseColor,
  isHikingMapPoiCategory,
  type HikingMapPoiCategory,
} from '@repo/utils';
import type { BridgeBbox, BridgeMarker, BridgeRouteLine } from '~/components/transit/transitMapBridge';

// 등산 지도 브리지(앱) — 산 마커·코스 선·코스 지점을 WebView 지도(TransitMapView) 명령으로. 아이콘은 웹과 같은
// @repo/utils 빌더(사전 키로 한 번만 보낸다). 산 3,879곳을 전부 그리면 전국 화면이 덮이므로 줌 10 아래는 100대 명산만,
// 그 위는 보이는 영역 안 산 전부(웹은 묶음 버블 — 브리지 지도엔 묶음이 없어 줌으로 나눈다).

export const HIKING_ALL_PEAKS_ZOOM = 10;
// 100대 명산 이름은 줌 9부터(전국 화면에서 백 개 이름이 겹친다), 봉우리 이름은 줌 12부터 — 웹 지도와 같은 기준.
// 브리지 지도는 줌 14 아래 축소 마커(fixedScale 아님)에 이름을 그리지 않으므로, 이름을 붙이는 줌부터는 원래 크기(fixedScale)로.
const TOP100_LABEL_ZOOM = 9;
const PEAK_LABEL_ZOOM = 12;

const MTN = '@mtn';
const MTN_SEL = '@mtn-sel';
const PEAK = '@peak';
const PEAK_SEL = '@peak-sel';
const poiKey = (c: HikingMapPoiCategory, sel: boolean) => `@poi${sel ? '-sel' : ''}:${c}`;
const iconCache = new Map<string, string>();
const icon = (key: string, build: () => string): string => {
  if (!iconCache.has(key)) iconCache.set(key, build());
  return iconCache.get(key)!;
};

export const mountainMarkerId = (id: string): string => `m:${id}`;
export const poiMarkerId = (id: string): string => `p:${id}`;
export const parseHikingMarkerId = (markerId: string): { kind: 'mountain' | 'poi'; id: string } | null => {
  if (markerId.startsWith('m:')) return { kind: 'mountain', id: markerId.slice(2) };
  if (markerId.startsWith('p:')) return { kind: 'poi', id: markerId.slice(2) };
  return null;
};

export interface HikingBridgeMarkers {
  markers: BridgeMarker[];
  icons: Record<string, string>;
}

const inBbox = (b: BridgeBbox, p: { lat: number; lng: number }, pad: number) =>
  p.lat >= b.minLat - pad && p.lat <= b.maxLat + pad && p.lng >= b.minLng - pad && p.lng <= b.maxLng + pad;

// 산 마커 — 줌 10 아래는 100대 명산만, 그 위는 보이는 영역(조금 넓게) 안 전부. 고른 산은 늘 넣는다.
export const buildMountainMarkers = (
  items: readonly HikingMountainSummaryType[],
  view: { zoom: number; bbox: BridgeBbox } | null,
  selectedId: string | null,
): HikingBridgeMarkers => {
  const zoom = view?.zoom ?? 7;
  const markers: BridgeMarker[] = [];
  for (const m of items) {
    const top = m.kind === 'top100';
    const selected = m.id === selectedId;
    if (!selected && !top && (zoom < HIKING_ALL_PEAKS_ZOOM || !view || !inBbox(view.bbox, m, 0.05))) continue;
    const labelled = selected || zoom >= (top ? TOP100_LABEL_ZOOM : PEAK_LABEL_ZOOM);
    markers.push({
      id: mountainMarkerId(m.id),
      lat: m.lat,
      lng: m.lng,
      label: labelled ? m.name : undefined,
      icon: top ? MTN : PEAK,
      iconSel: top ? MTN_SEL : PEAK_SEL,
      fixedScale: top || labelled,
    });
  }
  return {
    markers,
    icons: {
      [MTN]: icon(MTN, () => buildHikingMountainMarkerDataUrl(false)),
      [MTN_SEL]: icon(MTN_SEL, () => buildHikingMountainMarkerDataUrl(true)),
      [PEAK]: icon(PEAK, () => buildHikingPeakMarkerDataUrl(false)),
      [PEAK_SEL]: icon(PEAK_SEL, () => buildHikingPeakMarkerDataUrl(true)),
    },
  };
};

// 코스 지점 마커(고른 코스) — 지도에 그리는 분류만.
export const buildPoiMarkers = (course: HikingCourseDetailType): HikingBridgeMarkers => {
  const markers: BridgeMarker[] = [];
  const icons: Record<string, string> = {};
  for (const p of course.pois) {
    if (!isHikingMapPoiCategory(p.category)) continue;
    const c = p.category;
    icons[poiKey(c, false)] = icon(poiKey(c, false), () => buildHikingPoiMarkerDataUrl(c, false));
    icons[poiKey(c, true)] = icon(poiKey(c, true), () => buildHikingPoiMarkerDataUrl(c, true));
    markers.push({ id: poiMarkerId(p.id), lat: p.lat, lng: p.lng, label: p.name ?? undefined, icon: poiKey(c, false), iconSel: poiKey(c, true) });
  }
  return { markers, icons };
};

const toTuples = (line: readonly { lat: number; lng: number }[]): [number, number][] =>
  line.map((p) => [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lng * 1e5) / 1e5]);

// 산의 코스 선 — 코스마다 색(웹과 같은 팔레트), 고른 코스는 빨강으로 맨 위(나중에 그린다).
export const buildCourseLines = (mountain: HikingMountainDetailType, selectedCourseId: string | null): BridgeRouteLine[] => {
  const lines: BridgeRouteLine[] = [];
  const top: BridgeRouteLine[] = [];
  mountain.courses.forEach((c, i) => {
    const selected = c.id === selectedCourseId;
    if (selectedCourseId && !selected) return;
    for (const line of decodePieces(c.pieces)) {
      (selected ? top : lines).push({ pts: toTuples(line), color: selected ? HIKING_SELECTED_COURSE_COLOR : hikingCourseColor(i) });
    }
  });
  return [...lines, ...top];
};

// 영역 맞춤용 좌표 — 코스 bbox 모서리(선 전체 점을 보낼 필요 없다).
export const bboxCorners = (bboxes: readonly { minLat: number; minLng: number; maxLat: number; maxLng: number }[]): { lat: number; lng: number }[] =>
  bboxes.flatMap((b) => [
    { lat: b.minLat, lng: b.minLng },
    { lat: b.maxLat, lng: b.maxLng },
  ]);
