import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MapPin } from 'lucide-react';
import OlMap from 'ol/Map';
import OlView from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import { Style, Icon, Text as OlText, Fill, Stroke } from 'ol/style';
import 'ol/ol.css';
import { useMapProviderSecret } from '@repo/shared';
import { buildVworldTileUrl } from '~/lib/vworld';

interface Props {
  lat: number | null;
  lng: number | null;
  name: string;
  // 컨테이너 크기 오버라이드. 기본은 280px 고정 — 우측 사이드바에 들어갈
  // 사이즈. 풀 슬라이드오버에서는 'h-full w-full' 같은 값을 넘긴다.
  className?: string;
}

const ZOOM = 17;

// vworld WMTS 타일을 OpenLayers 가 직접 받아 그리는 지도. JS SDK 와 달리
// 도메인 화이트리스트 검증이 없어 어떤 origin 에서도 동작한다 — 키 유효
// 여부만 vworld 서버가 본다.
//
// 마커는 SVG data-URL Icon 으로 그려서 외부 이미지 의존을 없앴다.
export const VWorldMap = ({ lat, lng, name, className }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<OlMap | null>(null);

  const hasCoords = lat !== null && lng !== null;
  const secret = useMapProviderSecret('vworld', hasCoords);
  const apiKey = secret.data?.apiKey ?? null;

  const [tileError, setTileError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !hasCoords || !apiKey) return;

    const tileSource = new XYZ({
      url: buildVworldTileUrl(apiKey, 'Base'),
      crossOrigin: 'anonymous',
    });

    // 타일 로드 실패는 키 거부 / 네트워크 차단의 신호. 한 번이라도 떨어지면
    // 즉시 표시 — 화면에 빈 회색만 보이는 상황을 줄인다.
    let errored = false;
    tileSource.on('tileloaderror', () => {
      if (errored) return;
      errored = true;
      setTileError(
        '지도 타일을 불러오지 못했습니다. 키가 유효한지 확인해 주세요.',
      );
    });

    const baseLayer = new TileLayer({ source: tileSource });

    const view = new OlView({
      center: fromLonLat([lng!, lat!]),
      zoom: ZOOM,
    });

    const map = new OlMap({
      target: containerRef.current,
      layers: [baseLayer],
      view,
      // 컨트롤은 OL 기본값 — zoom 버튼만 노출. attribution/rotate 는 작은
      // 사이드바 카드에서 시각 노이즈가 되어 끔.
      controls: [],
    });

    const markerFeature = new Feature({
      geometry: new Point(fromLonLat([lng!, lat!])),
    });
    markerFeature.setStyle(
      new Style({
        image: new Icon({
          anchor: [0.5, 1],
          src:
            'data:image/svg+xml;charset=utf-8,' +
            encodeURIComponent(`
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48">
                <path fill="#ef4444" stroke="#fff" stroke-width="2" d="M16 2C8.268 2 2 8.268 2 16c0 10 14 30 14 30s14-20 14-30c0-7.732-6.268-14-14-14z"/>
                <circle fill="#fff" cx="16" cy="16" r="6"/>
              </svg>
            `),
        }),
        text: new OlText({
          text: name,
          offsetY: -54,
          font: 'bold 12px sans-serif',
          fill: new Fill({ color: '#0f172a' }),
          stroke: new Stroke({ color: '#fff', width: 3 }),
        }),
      }),
    );

    map.addLayer(
      new VectorLayer({
        source: new VectorSource({ features: [markerFeature] }),
      }),
    );

    mapRef.current = map;
    setTileError(null);

    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, [apiKey, lat, lng, name, hasCoords]);

  const sizeClass = className ?? 'h-[280px] w-full';

  if (!hasCoords) {
    return (
      <Placeholder sizeClass={sizeClass}>
        <MapPin className="size-4 opacity-50" /> 좌표 정보가 없습니다.
      </Placeholder>
    );
  }

  if (secret.isLoading) {
    return (
      <Placeholder sizeClass={sizeClass}>
        <Loader2 className="size-4 animate-spin" /> 키 확인 중…
      </Placeholder>
    );
  }

  if (!apiKey) {
    return (
      <Placeholder sizeClass={sizeClass}>
        <MapPin className="size-4 opacity-50" />
        <div>
          지도 키가 설정되지 않았습니다.{' '}
          <Link
            to="/admin/settings/map"
            className="text-primary underline underline-offset-2"
          >
            설정 &gt; 지도
          </Link>{' '}
          에서 등록하세요.
        </div>
      </Placeholder>
    );
  }

  return (
    <div className={`relative ${sizeClass}`}>
      <div
        ref={containerRef}
        className="size-full overflow-hidden rounded-md border bg-muted"
      />
      {tileError && (
        <div className="absolute inset-x-2 top-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-center text-xs text-destructive">
          {tileError}
        </div>
      )}
    </div>
  );
};

const Placeholder = ({
  children,
  sizeClass,
}: {
  children: React.ReactNode;
  sizeClass: string;
}) => (
  <div
    className={`flex items-center justify-center gap-2 rounded-md border bg-muted/40 px-4 text-center text-xs text-muted-foreground ${sizeClass}`}
  >
    {children}
  </div>
);
