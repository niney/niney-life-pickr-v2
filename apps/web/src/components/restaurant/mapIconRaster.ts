import ImageState from 'ol/ImageState';
import { DEVICE_PIXEL_RATIO } from 'ol/has';
import { Icon } from 'ol/style';

// 마커 아이콘 사전 래스터화.
//
// 마커 아이콘은 SVG data URL 이고, OL 은 프레임마다 feature 수만큼 그 <img> 를 drawImage 한다. SVG 이미지는
// 그릴 때마다 벡터를 다시 칠하므로 점이 수천 개인 화면(일상지도 z15: 6,760개)에서는 지도를 끄는 동안 프레임이
// 72ms 까지 늘어진다 — 같은 그림을 canvas 에 한 번 구워 그리면 18ms 다(Chromium + D3D11 합성 벤치).
// 그래서 아이콘마다 장치 픽셀 크기의 canvas 를 한 번 구워 두고, 그 canvas 를 Icon 의 img 로 쓴다.
//
//   - 굽는 크기 = 원본 크기 × 축소 배율 × 지도 pixelRatio, Icon scale = 1/pixelRatio → 구운 픽셀이 화면에 1:1 로
//     찍힌다. anchor 도 구운 픽셀 단위로 넘겨, 예전과 같은 자리에 같은 모양으로 그려진다.
//   - 굽는 원본은 OL 이 받은 <img> 다. 아직 못 받았으면 예전처럼 src 아이콘을 돌려주고(OL 이 그리면서 로드한다)
//     로드가 끝났을 때 구운 뒤 onReady 로 알린다 — 같은 그림을 두 번 디코드하지 않는다.
//   - 지도는 pixelRatio 옵션 없이 만든다(OL 기본 = DEVICE_PIXEL_RATIO). 그 옵션을 주게 되면 여기 배율도 바꾼다.
//   - 마커마다 그림이 다른 아이콘(가격·건수를 새긴 배지)은 호출자가 여기로 보내지 않는다 — 장마다 canvas 를 쥐면
//     수천 장이 된다. 그래도 새는 경우를 대비해 장수 상한을 두고, 넘으면 굽지 않는다(예전 경로 그대로).

export interface IconRaster {
  canvas: HTMLCanvasElement;
  // 그림이 차지하는 크기(구운 픽셀, 실수) — canvas 는 이 값을 올림한 정수 크기다.
  width: number;
  height: number;
}

export type IconAnchor = readonly [number, number];

export const ICON_RASTER_MAX = 256;

// 키(src + 배율) → 구운 결과. null = 굽지 못하는 아이콘(로드 실패·canvas 없음) — 다시 시도하지 않는다.
const rasters = new Map<string, IconRaster | null>();
// 로드를 기다리는 키 → 준비되면 부를 콜백들.
const waiting = new Map<string, Array<() => void>>();

const rasterKey = (src: string, scale: number): string => `${scale}|${src}`;

const bake = (icon: Icon, scale: number): IconRaster | null => {
  const size = icon.getSize();
  if (!size || !(size[0]! > 0) || !(size[1]! > 0)) return null;
  const k = scale * DEVICE_PIXEL_RATIO;
  const width = size[0]! * k;
  const height = size[1]! * k;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(icon.getImage(1) as CanvasImageSource, 0, 0, width, height);
  } catch {
    return null;
  }
  return { canvas, width, height };
};

const rasterIcon = (raster: IconRaster, anchor: IconAnchor): Icon =>
  new Icon({
    img: raster.canvas,
    anchor: [raster.width * anchor[0], raster.height * anchor[1]],
    anchorXUnits: 'pixels',
    anchorYUnits: 'pixels',
    scale: 1 / DEVICE_PIXEL_RATIO,
  });

const watch = (key: string, icon: Icon, scale: number, onReady: () => void): void => {
  const queued = waiting.get(key);
  if (queued) {
    queued.push(onReady);
    return;
  }
  waiting.set(key, [onReady]);
  const onChange = () => {
    const state = icon.getImageState();
    if (state !== ImageState.LOADED && state !== ImageState.ERROR) return;
    icon.unlistenImageChange(onChange);
    const callbacks = waiting.get(key) ?? [];
    waiting.delete(key);
    rasters.set(key, state === ImageState.LOADED ? bake(icon, scale) : null);
    for (const cb of callbacks) cb();
  };
  icon.listenImageChange(onChange);
};

/**
 * 마커 아이콘 하나 — 구워 둔 그림이 있으면 그것을, 없으면 예전과 같은 src 아이콘을 돌려준다.
 *
 * src 아이콘을 돌려준 경우, 그림이 로드돼 구울 수 있게 되면 `onReady` 를 한 번 부른다. 호출자는 그때 이
 * 아이콘으로 만든 Style 을 버려, 다음 평가에서 구운 아이콘으로 다시 만들게 한다(다시 그리기는 OL 이 로드
 * 완료를 보고 스스로 건다).
 */
export const markerIcon = (src: string, scale: number, anchor: IconAnchor, onReady: () => void): Icon => {
  const key = rasterKey(src, scale);
  const ready = rasters.get(key);
  if (ready) return rasterIcon(ready, anchor);

  const icon = new Icon({ anchor: [anchor[0], anchor[1]], src, scale });
  if (ready === null) return icon;
  if (rasters.size + waiting.size >= ICON_RASTER_MAX && !waiting.has(key)) return icon;

  // 같은 src 를 다른 배율로 이미 받아 둔 경우(OL 아이콘 캐시 공유) — 기다릴 것 없이 그 자리에서 굽는다.
  if (icon.getImageState() === ImageState.LOADED) {
    const baked = bake(icon, scale);
    rasters.set(key, baked);
    return baked ? rasterIcon(baked, anchor) : icon;
  }
  watch(key, icon, scale, onReady);
  return icon;
};
