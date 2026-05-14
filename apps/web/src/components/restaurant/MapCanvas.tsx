import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import OlMap from 'ol/Map';
import OlView from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Style, Icon, Text as OlText, Fill, Stroke } from 'ol/style';
import 'ol/ol.css';
import { buildVworldTileUrl } from '@repo/utils';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  // 'muted' 는 회색 핀(예: 어드민 발견 페이지의 '이미 등록된 맛집' 표시).
  // 미지정 또는 'primary' 는 기존 빨강. selected 강조는 색 톤만 진해진다.
  variant?: 'primary' | 'muted';
}

export interface MapViewport {
  // longitude/latitude (EPSG:4326). bbox 도 같이 — 호출자가 뷰포트 검색에
  // 그대로 박아 쓰기 좋게.
  centerLng: number;
  centerLat: number;
  zoom: number;
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number };
}

export interface MapCanvasHandle {
  // 외부에서 특정 좌표로 부드럽게 이동. 다중 마커 페이지에서 카드 클릭 시
  // 해당 마커로 fly-to 할 때 사용.
  flyTo(lat: number, lng: number, zoom?: number): void;
  // bbox 에 모든 마커가 들어오게 fit. ol fit duration 짧게.
  fitToMarkers(padding?: number): void;
}

interface Props {
  apiKey: string;
  markers: MapMarker[];
  selectedMarkerId?: string | null;
  initialCenter?: { lat: number; lng: number; zoom?: number };
  onMarkerSelect?(markerId: string): void;
  // 사용자가 패닝/줌을 끝낸 후 (programmatic move 는 무시) 호출. "이 지역 재검
  // 색" 버튼 노출 트리거에 쓴다.
  onViewportChangeEnd?(viewport: MapViewport): void;
  // 모든 viewport 변경(첫 렌더, programmatic move, 사용자 인터랙션) 시 호출.
  // 호출자가 "현재 보이는 영역" 을 항상 알고 있어야 할 때 (예: 검색 시점에
  // bbox 자동 첨부) 사용. onViewportChangeEnd 와는 의도가 다름 — 그쪽은
  // 사용자 인터랙션 직후의 명시적 시그널, 이쪽은 단순 동기화 채널.
  onViewportSync?(viewport: MapViewport): void;
  // 처음 mount 시점에 onTileError 가 한 번 호출되면 키가 거부됐을 가능성 큼.
  onTileError?(): void;
  className?: string;
}

const DEFAULT_ZOOM = 15;

// vworld WMTS 타일을 OpenLayers 가 직접 받아 그리는 저레벨 캔버스. 단일/다중
// 마커 모두 처리 — 마커 배열만 넘겨주면 된다. 좌표 없는 상태 / 키 없는 상태
// 등 렌더 분기는 호출자 책임 (placeholder 포함).
//
// 마커 스타일:
//   - 일반: 빨간 핀 (32x48 SVG)
//   - 선택됨: 더 큰 핀 + 강조 색
//
// 인터랙션:
//   - 마커 클릭 → onMarkerSelect
//   - 사용자 패닝/줌 종료 → onViewportChangeEnd (첫 렌더 트리거 방지 플래그)
export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(
  {
    apiKey,
    markers,
    selectedMarkerId,
    initialCenter,
    onMarkerSelect,
    onViewportChangeEnd,
    onViewportSync,
    onTileError,
    className,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<OlMap | null>(null);
  const vectorSourceRef = useRef<VectorSource | null>(null);
  // 사용자 인터랙션이 시작된 적 있는지. 처음 렌더 직후 발생하는 자동 moveend
  // 이벤트(setCenter/animate 호출) 는 무시하기 위함.
  const userInteractedRef = useRef(false);
  // 콜백 ref — useEffect 가 매번 새 effect 를 생성하지 않도록 ref 로 보관.
  const onMarkerSelectRef = useRef(onMarkerSelect);
  const onViewportChangeEndRef = useRef(onViewportChangeEnd);
  const onViewportSyncRef = useRef(onViewportSync);
  const onTileErrorRef = useRef(onTileError);
  useEffect(() => {
    onMarkerSelectRef.current = onMarkerSelect;
    onViewportChangeEndRef.current = onViewportChangeEnd;
    onViewportSyncRef.current = onViewportSync;
    onTileErrorRef.current = onTileError;
  });

  // map 한 번만 생성. apiKey 가 바뀌면 reload (드물게 일어남 — 키 갱신 시).
  useEffect(() => {
    if (!containerRef.current || !apiKey) return;

    const tileSource = new XYZ({
      url: buildVworldTileUrl(apiKey, 'Base'),
      crossOrigin: 'anonymous',
    });
    let errored = false;
    tileSource.on('tileloaderror', () => {
      if (errored) return;
      errored = true;
      onTileErrorRef.current?.();
    });

    const baseLayer = new TileLayer({ source: tileSource });

    const center = initialCenter ?? markers[0] ?? { lat: 37.5665, lng: 126.978 };
    const view = new OlView({
      center: fromLonLat([center.lng, center.lat]),
      zoom: initialCenter?.zoom ?? DEFAULT_ZOOM,
    });

    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    const map = new OlMap({
      target: containerRef.current,
      layers: [baseLayer, new VectorLayer({ source: vectorSource })],
      view,
      controls: [],
    });

    // 사용자 인터랙션 마크. pointerdrag = 드래그(panning), 휠은 별도.
    map.on('pointerdrag', () => {
      userInteractedRef.current = true;
    });
    const handleWheel = () => {
      userInteractedRef.current = true;
    };
    containerRef.current.addEventListener('wheel', handleWheel);

    const computeViewport = (): MapViewport | null => {
      const v = map.getView();
      const c = v.getCenter();
      const z = v.getZoom();
      if (!c || z === undefined) return null;
      const [lng, lat] = toLonLat(c);
      const ext = v.calculateExtent(map.getSize() ?? undefined);
      const [minLng, minLat] = toLonLat([ext[0]!, ext[1]!]);
      const [maxLng, maxLat] = toLonLat([ext[2]!, ext[3]!]);
      return {
        centerLng: lng!,
        centerLat: lat!,
        zoom: z,
        bbox: { minLng: minLng!, minLat: minLat!, maxLng: maxLng!, maxLat: maxLat! },
      };
    };

    map.on('moveend', () => {
      const viewport = computeViewport();
      if (!viewport) return;
      // sync 는 user/programmatic 무관 — 항상 최신 viewport 를 흘려서 호출자가
      // 검색 시점에 현재 영역을 알 수 있게 한다.
      onViewportSyncRef.current?.(viewport);
      // 기존 onViewportChangeEnd 의미는 보존 — 사용자가 직접 패닝/줌한 후에만
      // 발사. "이 지역 재검색" 버튼 노출 트리거.
      if (userInteractedRef.current) {
        onViewportChangeEndRef.current?.(viewport);
      }
    });

    // 첫 렌더 완료 직후 한 번 sync — 사용자가 패닝 안 하고 곧장 검색해도
    // viewport ref 가 비어 있지 않게.
    map.once('postrender', () => {
      const viewport = computeViewport();
      if (viewport) onViewportSyncRef.current?.(viewport);
    });

    map.on('click', (evt) => {
      const f = map.forEachFeatureAtPixel(evt.pixel, (feat) => feat, {
        hitTolerance: 4,
      });
      if (f) {
        const id = f.get('markerId') as string | undefined;
        if (id) onMarkerSelectRef.current?.(id);
      }
    });

    mapRef.current = map;

    // 컨테이너 크기가 바뀌면 OL 가 자체적으로 재측정하지 않으므로 직접 트리거.
    // 좌/우 패널 토글이나 윈도우 리사이즈 모두 한 번에 커버.
    const ro = new ResizeObserver(() => {
      mapRef.current?.updateSize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      containerRef.current?.removeEventListener('wheel', handleWheel);
      map.setTarget(undefined);
      mapRef.current = null;
      vectorSourceRef.current = null;
      userInteractedRef.current = false;
    };
    // initialCenter / markers 는 의도적으로 deps 에서 빼고 별도 effect 에서 갱신.
    // 처음 mount 직후 외 reflow 가 필요한 입력은 apiKey 뿐.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // 마커 갱신 — 좌표/선택 상태가 바뀌면 vectorSource 만 새로 칠한다 (map 재생성 X).
  useEffect(() => {
    const src = vectorSourceRef.current;
    if (!src) return;
    src.clear();
    for (const m of markers) {
      const f = new Feature({ geometry: new Point(fromLonLat([m.lng, m.lat])) });
      f.set('markerId', m.id);
      const isSelected = m.id === selectedMarkerId;
      f.setStyle(makeMarkerStyle(m.label, isSelected, m.variant ?? 'primary'));
      src.addFeature(f);
    }
  }, [markers, selectedMarkerId]);

  // 외부 imperative API
  useImperativeHandle(
    ref,
    () => ({
      flyTo(lat, lng, zoom) {
        const map = mapRef.current;
        if (!map) return;
        const v = map.getView();
        // 외부 호출은 사용자 인터랙션이 아니라고 가정 — onViewportChangeEnd
        // 발사 안 함 (userInteractedRef false 유지).
        userInteractedRef.current = false;
        v.animate({
          center: fromLonLat([lng, lat]),
          zoom: zoom ?? v.getZoom() ?? DEFAULT_ZOOM,
          duration: 350,
        });
      },
      fitToMarkers(padding = 60) {
        const map = mapRef.current;
        const src = vectorSourceRef.current;
        if (!map || !src) return;
        const ext = src.getExtent();
        if (!ext || !Number.isFinite(ext[0])) return;
        userInteractedRef.current = false;
        map.getView().fit(ext, {
          padding: [padding, padding, padding, padding],
          duration: 350,
          maxZoom: 17,
        });
      },
    }),
    [],
  );

  return (
    <div
      ref={containerRef}
      className={className ?? 'h-full w-full'}
      style={{ position: 'relative' }}
    />
  );
});

// 핀 SVG. variant 로 색상 분기 — primary(빨강)는 기본/검색결과, muted(회색)는
// '이미 등록된 항목' 같은 보조 표시. 어느 쪽이든 selected 시 톤이 더 진해지고
// 살짝 커진다.
const PIN_COLORS: Record<NonNullable<MapMarker['variant']>, { base: string; selected: string }> = {
  primary: { base: '#ef4444', selected: '#dc2626' },
  muted: { base: '#94a3b8', selected: '#64748b' },
};

const makeMarkerStyle = (
  label: string | undefined,
  selected: boolean,
  variant: NonNullable<MapMarker['variant']>,
): Style => {
  const palette = PIN_COLORS[variant];
  const fill = selected ? palette.selected : palette.base;
  const size = selected ? 40 : 32;
  const height = selected ? 60 : 48;
  return new Style({
    image: new Icon({
      anchor: [0.5, 1],
      scale: 1,
      src:
        'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 32 48">
            <path fill="${fill}" stroke="#fff" stroke-width="2" d="M16 2C8.268 2 2 8.268 2 16c0 10 14 30 14 30s14-20 14-30c0-7.732-6.268-14-14-14z"/>
            <circle fill="#fff" cx="16" cy="16" r="6"/>
          </svg>
        `),
    }),
    text: label
      ? new OlText({
          text: label,
          offsetY: -(height + 6),
          font: `${selected ? 'bold ' : ''}12px sans-serif`,
          fill: new Fill({ color: '#0f172a' }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
        })
      : undefined,
  });
};
