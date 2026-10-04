import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as OlHas from 'ol/has';
import type { Icon } from 'ol/style';
import type * as Raster from './mapIconRaster';

// 마커 아이콘 사전 래스터화 — 그림이 로드되기 전에는 예전과 같은 src 아이콘, 로드 뒤에는 한 번 구운 canvas
// 아이콘을 돌려주는지, 그리고 그 canvas 아이콘이 예전과 같은 자리·크기로 찍히는 값(anchor·scale)을 갖는지 본다.
// jsdom 은 그림을 실제로 받지도 그리지도 않으므로 로드 이벤트와 2D 컨텍스트는 흉내 낸다.

const svg = (fill: string, size = 26): string =>
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle fill="${fill}" cx="13" cy="13" r="11"/></svg>`,
  );

// 모듈 상태(구운 그림·대기 목록)를 테스트마다 새로 만든다. OL 자체는 node_modules 라 다시 평가되지 않으므로
// (아이콘 캐시가 테스트 사이에 남는다 — 그래서 테스트마다 다른 src 를 쓴다) 지도 pixelRatio 상수만 갈아 끼운다.
const loadModule = async (pixelRatio = 1): Promise<typeof Raster> => {
  vi.resetModules();
  vi.doMock('ol/has', async (importOriginal) => ({
    ...(await importOriginal<typeof OlHas>()),
    DEVICE_PIXEL_RATIO: pixelRatio,
  }));
  return import('./mapIconRaster');
};

// OL 이 feature 를 그리면서 하는 일 — 로드를 걸고, 브라우저가 그림을 다 받은 것처럼 load 이벤트를 낸다.
const finishLoad = (icon: Icon, width: number, height: number, ok = true): void => {
  icon.load();
  const img = icon.getImage(1) as HTMLImageElement;
  Object.defineProperty(img, 'width', { value: width, configurable: true });
  Object.defineProperty(img, 'height', { value: height, configurable: true });
  img.dispatchEvent(new Event(ok ? 'load' : 'error'));
};

const CENTER = [0.5, 0.5] as const;
const PIN = [0.5, 1] as const;

describe('markerIcon', () => {
  let drawImage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({ drawImage }) as unknown as CanvasRenderingContext2D,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('ol/has');
  });

  it('로드 전에는 src 아이콘을 주고, 로드가 끝나면 알린 뒤 구운 canvas 아이콘을 준다', async () => {
    const { markerIcon } = await loadModule();
    const src = svg('#c2185b');
    const onReady = vi.fn();

    const first = markerIcon(src, 1, CENTER, onReady);
    expect(first.getSrc()).toBe(src);
    expect(first.getScale()).toBe(1);
    expect(onReady).not.toHaveBeenCalled();

    finishLoad(first, 26, 26);
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(first.getImage(1), 0, 0, 26, 26);

    const onReadyAgain = vi.fn();
    const baked = markerIcon(src, 1, CENTER, onReadyAgain);
    const canvas = baked.getImage(1) as HTMLCanvasElement;
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect([canvas.width, canvas.height]).toEqual([26, 26]);
    expect(baked.getAnchor()).toEqual([13, 13]);
    expect(baked.getScale()).toBe(1);
    // 이미 구운 그림은 다시 굽지도, 알리지도 않는다.
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(onReadyAgain).not.toHaveBeenCalled();
    // 같은 그림을 쓰는 아이콘은 canvas 하나를 나눠 쓴다.
    expect(markerIcon(src, 1, PIN, vi.fn()).getImage(1)).toBe(canvas);
  });

  it('장치 픽셀 크기로 굽고 scale 을 1/pixelRatio 로 줘 화면에 1:1 로 찍히게 한다', async () => {
    const { markerIcon } = await loadModule(2);
    const src = svg('#00897b');
    const onReady = vi.fn();
    // 축소 핀(0.55배) — 26 × 0.55 × 2 = 28.6 장치 픽셀.
    finishLoad(markerIcon(src, 0.55, CENTER, onReady), 26, 26);
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const baked = markerIcon(src, 0.55, PIN, vi.fn());
    const canvas = baked.getImage(1) as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([29, 29]);
    const [w, h] = drawImage.mock.calls[0]!.slice(3) as [number, number];
    expect(w).toBeCloseTo(28.6, 10);
    expect(h).toBeCloseTo(28.6, 10);
    // 기준점은 올림한 canvas 가 아니라 그림이 차지하는 크기 기준 — 아래 꼭지점(가로 가운데, 세로 끝).
    const [ax, ay] = baked.getAnchor();
    expect(ax).toBeCloseTo(14.3, 10);
    expect(ay).toBeCloseTo(28.6, 10);
    expect(baked.getScale()).toBe(0.5);
  });

  it('같은 그림을 기다리는 호출이 여럿이면 한 번만 굽고 모두에게 알린다', async () => {
    const { markerIcon } = await loadModule();
    const src = svg('#8e24aa');
    const callbacks = [vi.fn(), vi.fn(), vi.fn()];
    const icons = callbacks.map((cb) => markerIcon(src, 1, CENTER, cb));

    finishLoad(icons[0]!, 26, 26);
    await vi.waitFor(() => expect(callbacks[2]).toHaveBeenCalledTimes(1));
    for (const cb of callbacks) expect(cb).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledTimes(1);
  });

  it('이미 받아 둔 그림은 다른 배율에서 기다리지 않고 바로 굽는다', async () => {
    const { markerIcon } = await loadModule();
    const src = svg('#2a78d6');
    const onReady = vi.fn();
    finishLoad(markerIcon(src, 1, CENTER, onReady), 26, 26);
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const onSmallReady = vi.fn();
    const small = markerIcon(src, 0.5, CENTER, onSmallReady);
    const canvas = small.getImage(1) as HTMLCanvasElement;
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect([canvas.width, canvas.height]).toEqual([13, 13]);
    expect(onSmallReady).not.toHaveBeenCalled();
  });

  it('로드에 실패한 그림은 굽지 않고, 다시 기다리지도 않는다', async () => {
    const { markerIcon } = await loadModule();
    const src = svg('#eb6834');
    const onReady = vi.fn();
    finishLoad(markerIcon(src, 1, CENTER, onReady), 0, 0, false);
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(drawImage).not.toHaveBeenCalled();

    const onReadyAgain = vi.fn();
    const again = markerIcon(src, 1, CENTER, onReadyAgain);
    expect(again.getSrc()).toBe(src);
    // 실패한 그림에는 리스너를 다시 걸지 않는다.
    (again.getImage(1) as HTMLImageElement).dispatchEvent(new Event('load'));
    await Promise.resolve();
    expect(onReadyAgain).not.toHaveBeenCalled();
  });

  it('2D 컨텍스트를 못 얻으면 src 아이콘을 그대로 쓴다', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(() => null);
    const { markerIcon } = await loadModule();
    const src = svg('#1baf7a');
    const onReady = vi.fn();
    finishLoad(markerIcon(src, 1, CENTER, onReady), 26, 26);
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    expect(markerIcon(src, 1, CENTER, vi.fn()).getSrc()).toBe(src);
  });

  it('상한을 넘는 아이콘은 굽지 않는다', async () => {
    const { markerIcon, ICON_RASTER_MAX } = await loadModule();
    for (let i = 0; i < ICON_RASTER_MAX; i++) markerIcon(svg(`#${String(i).padStart(6, '0')}`), 1, CENTER, vi.fn());

    const onReady = vi.fn();
    const over = markerIcon(svg('#abcdef'), 1, CENTER, onReady);
    finishLoad(over, 26, 26);
    await vi.waitFor(() => expect(over.getImageState()).toBe(2));
    expect(onReady).not.toHaveBeenCalled();
    expect(drawImage).not.toHaveBeenCalled();
    expect(markerIcon(svg('#abcdef'), 1, CENTER, vi.fn()).getImage(1)).toBeInstanceOf(HTMLImageElement);
  });
});
