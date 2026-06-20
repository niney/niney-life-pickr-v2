import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle as BubbleIcon, Loader2, MapPin } from 'lucide-react';
import OlMap from 'ol/Map';
import OlView from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import { Fill, Stroke, Style, Text as OlText } from 'ol/style';
import CircleStyle from 'ol/style/Circle';
import 'ol/ol.css';
import { buildVworldTileUrl, type VworldLayer } from '@repo/utils';
import { ApiError, useMapPublicConfig } from '@repo/shared';
import type { RegionStatsResultType } from '@repo/api-contract';
import { useThemeStore } from '~/stores/theme';
import { cn } from '~/lib/utils';

// 지역 통계 지도 — VWorld 타일 위에 시/구 통계를 얹는다. MapCanvas(레스토랑 핀
// 전용)와 달리 사이즈 가변 버블이 필요해 OpenLayers 를 직접 쓴다. 타일 URL·투영
// 헬퍼는 공개 지도와 동일한 것을 재사용한다.
//
// 모드:
//   bubble  — 시군구 중심에 가게 수만큼 큰 원 + 숫자 (집계 통계 한눈에)
//   markers — 가게별 점 (위치 분포)
// choropleth(경계 색칠)는 후속 단계에서 같은 맵에 레이어로 추가한다.
type MapMode = 'bubble' | 'markers';

const KOREA_CENTER = { lat: 36.5, lng: 127.8 };

// 면적이 개수에 비례하도록 sqrt 스케일. 10~34px.
const bubbleRadius = (count: number, max: number): number => {
  const t = max <= 1 ? 1 : Math.sqrt(count) / Math.sqrt(max);
  return 10 + t * 24;
};

const layerForTheme = (mode: string): VworldLayer => (mode === 'dark' ? 'midnight' : 'Base');

const MapShell = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-[420px] w-full items-center justify-center gap-2 rounded-lg border bg-muted/30 px-6 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

const MODES: Array<{ key: MapMode; label: string; icon: typeof BubbleIcon }> = [
  { key: 'bubble', label: '버블', icon: BubbleIcon },
  { key: 'markers', label: '마커', icon: MapPin },
];

export const RegionStatsMap = ({ data }: { data: RegionStatsResultType }) => {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  // 키 미등록은 404 — ApiError statusCode 로 분기 (공개 지도 페이지와 동일).
  const keyMissing =
    config.isError && config.error instanceof ApiError && config.error.statusCode === 404;
  const themeMode = useThemeStore((s) => s.mode);
  const [mode, setMode] = useState<MapMode>('bubble');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<OlMap | null>(null);
  const vectorSourceRef = useRef<VectorSource | null>(null);
  const tileSourceRef = useRef<XYZ | null>(null);

  // 버블 데이터 — 좌표 있는 시군구만. (regions.json centroid + 집계 count)
  const bubbles = useMemo(
    () =>
      data.sidos
        .flatMap((s) => s.sigungus)
        .filter((sg) => sg.lat !== null && sg.lng !== null)
        .map((sg) => ({ sigungu: sg.sigungu, count: sg.count, lat: sg.lat!, lng: sg.lng! })),
    [data],
  );
  const maxBubble = useMemo(() => Math.max(1, ...bubbles.map((b) => b.count)), [bubbles]);

  // 맵 생성 — apiKey 준비되면 1회. 타일은 Base 로 시작하고 테마 effect 가 즉시
  // 올바른 레이어로 교체(다크면 midnight). 줌/센터/feature 는 유지된다.
  useEffect(() => {
    if (!containerRef.current || !apiKey) return;
    const tileSource = new XYZ({
      url: buildVworldTileUrl(apiKey, 'Base'),
      crossOrigin: 'anonymous',
    });
    tileSourceRef.current = tileSource;
    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;
    const map = new OlMap({
      target: containerRef.current,
      layers: [new TileLayer({ source: tileSource }), new VectorLayer({ source: vectorSource })],
      view: new OlView({ center: fromLonLat([KOREA_CENTER.lng, KOREA_CENTER.lat]), zoom: 7 }),
    });
    mapRef.current = map;
    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
      vectorSourceRef.current = null;
      tileSourceRef.current = null;
    };
  }, [apiKey]);

  // 테마 → 타일 레이어 교체 (맵 재생성 없이 URL 만).
  useEffect(() => {
    const ts = tileSourceRef.current;
    if (!ts || !apiKey) return;
    ts.setUrl(buildVworldTileUrl(apiKey, layerForTheme(themeMode)));
  }, [themeMode, apiKey]);

  // feature 갱신 — 모드/데이터 변경 시. 갱신 후 전체가 보이게 fit.
  useEffect(() => {
    const src = vectorSourceRef.current;
    const map = mapRef.current;
    if (!src || !map) return;
    src.clear();

    if (mode === 'bubble') {
      for (const b of bubbles) {
        const f = new Feature({ geometry: new Point(fromLonLat([b.lng, b.lat])) });
        f.setStyle(
          new Style({
            image: new CircleStyle({
              radius: bubbleRadius(b.count, maxBubble),
              fill: new Fill({ color: 'rgba(37,99,235,0.55)' }),
              stroke: new Stroke({ color: 'rgba(37,99,235,0.95)', width: 1.5 }),
            }),
            text: new OlText({
              text: String(b.count),
              font: 'bold 11px sans-serif',
              fill: new Fill({ color: '#ffffff' }),
            }),
          }),
        );
        src.addFeature(f);
      }
    } else {
      for (const p of data.points) {
        const f = new Feature({ geometry: new Point(fromLonLat([p.lng, p.lat])) });
        f.setStyle(
          new Style({
            image: new CircleStyle({
              radius: 5,
              fill: new Fill({ color: 'rgba(37,99,235,0.85)' }),
              stroke: new Stroke({ color: '#ffffff', width: 1 }),
            }),
          }),
        );
        src.addFeature(f);
      }
    }

    const ext = src.getExtent();
    if (ext && Number.isFinite(ext[0])) {
      map.getView().fit(ext, { padding: [40, 40, 40, 40], duration: 300, maxZoom: 13 });
    }
  }, [mode, bubbles, maxBubble, data.points]);

  if (config.isLoading) {
    return (
      <MapShell>
        <Loader2 className="size-4 animate-spin" /> 지도 키 확인 중…
      </MapShell>
    );
  }
  if (keyMissing) {
    return (
      <MapShell>
        <MapPin className="size-4 opacity-50" />
        지도 키가 등록되지 않았습니다. 설정 &gt; 지도에서 vworld 키를 등록하면 표시됩니다.
      </MapShell>
    );
  }
  if (config.isError || !apiKey) {
    return <MapShell>지도 설정을 불러오지 못했습니다.</MapShell>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {mode === 'bubble'
            ? '원 크기·숫자 = 시군구별 가게 수'
            : '점 하나 = 가게 한 곳 (위치 분포)'}
        </p>
        <div className="inline-flex rounded-lg bg-muted p-0.5">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="relative h-[420px] w-full overflow-hidden rounded-lg border">
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
};
