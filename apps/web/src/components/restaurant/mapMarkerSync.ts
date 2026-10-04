import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import type VectorSource from 'ol/source/Vector';
import type { MapMarker } from './MapCanvas';

// MapCanvas 의 마커 → feature 동기화. feature 가 자기 MapMarker 를 속성(MARKER_PROP)으로 들고, 레이어
// 공용 style function 이 평가 시점에 그걸 읽는다. 그래서 마커 배열이 바뀌어도 feature 를 통째로 다시
// 만들 필요가 없다(OL 의존만 있고 React 와 무관해 따로 떼어 테스트한다).
export const MARKER_PROP = 'marker';

// 겉모습(= style function 입력)이 같은가 — 다르면 그 feature 만 changed() 로 다시 칠한다.
const sameMarkerLook = (a: MapMarker, b: MapMarker): boolean =>
  a.label === b.label &&
  a.variant === b.variant &&
  a.categoryKey === b.categoryKey &&
  a.fixedScale === b.fixedScale &&
  a.icon?.src === b.icon?.src &&
  a.icon?.selectedSrc === b.icon?.selectedSrc;

// 겉모습이 바뀐 feature 가 이보다 많으면 하나씩 changed() 하는 것보다 통째 교체가 싸다.
const MARKER_RESTYLE_BULK = 500;

const createMarkerFeature = (m: MapMarker): Feature => {
  const f = new Feature({ geometry: new Point(fromLonLat([m.lng, m.lat])) });
  f.set('markerId', m.id, true);
  f.set(MARKER_PROP, m, true);
  return f;
};

// markers 를 소스에 반영 — id 기준 차분. 예전엔 배열 참조가 바뀔 때마다 clear() 뒤 전부 다시 만들었는데,
// 일상지도(레이어 4개 합쳐 수천 점)는 팬 한 번에 최대 5번·마커 클릭마다 1번 그 비용을 냈다. 겹치는 id 가
// 하나도 없으면(첫 채움·전혀 다른 화면) 통째 교체가 가장 싸다.
// byId 는 호출자가 소스와 수명을 맞춰 들고 있는 id → feature 색인(선택 강조와 차분에 같이 쓴다).
export const syncMarkerFeatures = (
  src: VectorSource,
  byId: Map<string, Feature>,
  markers: readonly MapMarker[],
): void => {
  // 같은 id 가 두 번 오면 마지막 것만 — 예전에도 색인(byId)은 마지막 것을 가리켰다.
  const next = new Map<string, MapMarker>();
  for (const m of markers) next.set(m.id, m);

  let kept = 0;
  let restyle = 0;
  for (const [id, f] of byId) {
    const m = next.get(id);
    if (!m) continue;
    kept += 1;
    const prev = f.get(MARKER_PROP) as MapMarker;
    if (prev !== m && !sameMarkerLook(prev, m)) restyle += 1;
  }

  if (kept === 0 || restyle > MARKER_RESTYLE_BULK) {
    if (byId.size > 0) src.clear(true);
    byId.clear();
    const all: Feature[] = [];
    for (const m of next.values()) {
      const f = createMarkerFeature(m);
      byId.set(m.id, f);
      all.push(f);
    }
    if (all.length > 0) src.addFeatures(all);
    return;
  }

  const gone: Feature[] = [];
  for (const [id, f] of byId) {
    if (next.has(id)) continue;
    gone.push(f);
    byId.delete(id);
  }
  if (gone.length > 0) src.removeFeatures(gone);

  const added: Feature[] = [];
  for (const m of next.values()) {
    const f = byId.get(m.id);
    if (!f) {
      const nf = createMarkerFeature(m);
      byId.set(m.id, nf);
      added.push(nf);
      continue;
    }
    const prev = f.get(MARKER_PROP) as MapMarker;
    if (prev === m) continue;
    f.set(MARKER_PROP, m, true);
    if (prev.lat !== m.lat || prev.lng !== m.lng) {
      // 좌표 이동 — setCoordinates 가 change 를 내므로 스타일도 같이 다시 평가된다.
      (f.getGeometry() as Point).setCoordinates(fromLonLat([m.lng, m.lat]));
    } else if (!sameMarkerLook(prev, m)) {
      f.changed();
    }
  }
  if (added.length > 0) src.addFeatures(added);
};
