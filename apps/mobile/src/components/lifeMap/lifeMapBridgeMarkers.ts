import type { LifeMapCellType, LifeMapPointsResultType } from '@repo/api-contract';
import {
  LIFE_CCTV_PURPOSE_GROUPS,
  buildLifeCctvDotDataUrl,
  buildLifeCctvPinDataUrl,
  buildLifeCellMarkerDataUrl,
  buildLifeHospitalMarkerDataUrl,
  buildLifeToiletMarkerDataUrl,
  isLifeMapLayer,
  lifeCctvPurposeGroup,
  type LifeCctvPurposeGroup,
  type LifeMapLayer,
} from '@repo/utils';
import type { BridgeMarker } from '~/components/transit/transitMapBridge';

// 일상지도 마커 빌더(앱) — 서버 응답(점/셀)을 WebView 브리지 마커로. 웹 lifeMapMarkers.ts 와 같은 규칙
// (id 형식·아이콘)이되, 아이콘은 사전(icons)으로 한 번만 보내고 마커는 키만 든다 — CCTV 점 수천 개가
// 같은 data URL 을 반복하지 않게. 셀 버블은 건수마다 이미지가 달라 건수 키로 사전에 들어간다.

const CCTV_KEY = (g: LifeCctvPurposeGroup) => `@cctv:${g}`;
const CCTV_SEL_KEY = (g: LifeCctvPurposeGroup) => `@cctv-sel:${g}`;
const TOILET_KEY = '@toilet';
const TOILET_SEL_KEY = '@toilet-sel';
const HOSPITAL_KEY = '@hospital';
const HOSPITAL_SEL_KEY = '@hospital-sel';
const cellKey = (layer: LifeMapLayer, count: number) => `@cell:${layer}:${count}`;

// 고정 아이콘 사전 — 모듈 로드 시 1회.
const BASE_ICONS: Record<string, string> = {
  ...Object.fromEntries(LIFE_CCTV_PURPOSE_GROUPS.flatMap((g) => [[CCTV_KEY(g), buildLifeCctvDotDataUrl(g)], [CCTV_SEL_KEY(g), buildLifeCctvPinDataUrl(g)]])),
  [TOILET_KEY]: buildLifeToiletMarkerDataUrl(false),
  [TOILET_SEL_KEY]: buildLifeToiletMarkerDataUrl(true),
  [HOSPITAL_KEY]: buildLifeHospitalMarkerDataUrl(false),
  [HOSPITAL_SEL_KEY]: buildLifeHospitalMarkerDataUrl(true),
};
const cellIconCache = new Map<string, string>();

export const lifeMarkerId = (layer: LifeMapLayer, id: string): string => `${layer}:${id}`;
export type ParsedLifeMarkerId = { kind: 'point'; layer: LifeMapLayer; id: string } | { kind: 'cell'; layer: LifeMapLayer; index: number };
export const parseLifeMarkerId = (markerId: string): ParsedLifeMarkerId | null => {
  const i = markerId.indexOf(':');
  if (i <= 0) return null;
  const head = markerId.slice(0, i);
  const rest = markerId.slice(i + 1);
  if (head === 'cell') {
    const j = rest.indexOf(':');
    if (j <= 0) return null;
    const layer = rest.slice(0, j);
    const index = Number(rest.slice(j + 1));
    return isLifeMapLayer(layer) && Number.isInteger(index) ? { kind: 'cell', layer, index } : null;
  }
  return isLifeMapLayer(head) && rest.length > 0 ? { kind: 'point', layer: head, id: rest } : null;
};

export interface LifeBridgeMarkers {
  markers: BridgeMarker[];
  icons: Record<string, string>;
}

// 세 레이어 응답 → 마커 + 사전. labeled*Ids 에 든 화장실/병의원만 라벨(수백 개 전부는 과밀).
export const buildLifeBridgeMarkers = (
  cctv: LifeMapPointsResultType | undefined,
  toilet: LifeMapPointsResultType | undefined,
  hospital: LifeMapPointsResultType | undefined,
  labeledToiletIds: ReadonlySet<string>,
  labeledHospitalIds: ReadonlySet<string>,
): LifeBridgeMarkers => {
  const icons: Record<string, string> = { ...BASE_ICONS };
  const markers: BridgeMarker[] = [];
  const pushCells = (layer: LifeMapLayer, cells: LifeMapCellType[]) => {
    cells.forEach((c, index) => {
      const key = cellKey(layer, c.count);
      if (!icons[key]) {
        let url = cellIconCache.get(key);
        if (!url) {
          url = buildLifeCellMarkerDataUrl(layer, c.count);
          cellIconCache.set(key, url);
        }
        icons[key] = url;
      }
      markers.push({ id: `cell:${layer}:${index}`, lat: c.lat, lng: c.lng, icon: key, fixedScale: true });
    });
  };
  if (cctv) {
    if (cctv.mode === 'cells') pushCells('cctv', cctv.cells);
    else {
      for (const p of cctv.items) {
        const g = lifeCctvPurposeGroup(p.purpose);
        markers.push({ id: lifeMarkerId('cctv', p.id), lat: p.lat, lng: p.lng, icon: CCTV_KEY(g), iconSel: CCTV_SEL_KEY(g), fixedScale: true });
      }
    }
  }
  if (toilet) {
    if (toilet.mode === 'cells') pushCells('toilet', toilet.cells);
    else {
      for (const p of toilet.items) {
        markers.push({
          id: lifeMarkerId('toilet', p.id),
          lat: p.lat,
          lng: p.lng,
          icon: TOILET_KEY,
          iconSel: TOILET_SEL_KEY,
          ...(labeledToiletIds.has(p.id) ? { label: p.name } : {}),
        });
      }
    }
  }
  if (hospital) {
    if (hospital.mode === 'cells') pushCells('hospital', hospital.cells);
    else {
      for (const p of hospital.items) {
        markers.push({
          id: lifeMarkerId('hospital', p.id),
          lat: p.lat,
          lng: p.lng,
          icon: HOSPITAL_KEY,
          iconSel: HOSPITAL_SEL_KEY,
          ...(labeledHospitalIds.has(p.id) ? { label: p.name } : {}),
        });
      }
    }
  }
  return { markers, icons };
};

export const lifeCellAt = (result: LifeMapPointsResultType | undefined, index: number): LifeMapCellType | null =>
  result?.mode === 'cells' ? (result.cells[index] ?? null) : null;
