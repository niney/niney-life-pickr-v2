import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { DEM_ZOOM, decodeTerrarium, demTilesFor, loadDemTiles, makeDemAt } from './hiking-dem.js';

// 지형 고도(9차 보강) — terrarium 풀기, 쌍선형 보간·바다 null, 필요한 타일 고르기, 캐시·실패.

// 고도 → terrarium RGB.
const rgbOf = (ele: number): [number, number, number] => {
  const v = ele + 32768;
  return [Math.floor(v / 256), Math.floor(v % 256), Math.round((v % 1) * 256)];
};
// 위경도가 든 타일 키(줌 13).
const keyOf = (lat: number, lng: number): string => {
  const n = 2 ** DEM_ZOOM;
  const r = (lat * Math.PI) / 180;
  return `${Math.floor(((lng + 180) / 360) * n)}/${Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)}`;
};

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('hiking-dem', () => {
  it('decodeTerrarium — R·256 + G + B/256 − 32768, 채널 수만큼 건너뛴다', () => {
    const raw = Uint8Array.from([...rgbOf(1234.5), 255, ...rgbOf(-20), 255]);
    expect([...decodeTerrarium(raw, 4)]).toEqual([1234.5, -20]);
  });

  it('makeDemAt — 같은 값 타일은 그 값, 바다(0 이하)·타일 없음은 null', () => {
    const key = keyOf(37.5, 127.5);
    const at = makeDemAt(new Map([[key, new Float32Array(256 * 256).fill(800)]]));
    expect(at(37.5, 127.5)).toBeCloseTo(800, 3);
    expect(at(35, 129)).toBeNull();
    const sea = makeDemAt(new Map([[key, new Float32Array(256 * 256).fill(-3)]]));
    expect(sea(37.5, 127.5)).toBeNull();
  });

  it('makeDemAt — 가로로 1m 씩 오르는 타일은 픽셀 사이를 보간한다', () => {
    const key = keyOf(37.5, 127.5);
    const [x, y] = key.split('/').map(Number) as [number, number];
    const t = new Float32Array(256 * 256);
    for (let i = 0; i < t.length; i++) t[i] = 100 + (i % 256);
    const at = makeDemAt(new Map([[key, t]]));
    // 타일 가운데 근처 두 점 — 경도 차이만큼(픽셀 단위) 고도가 오른다.
    const lngOf = (px: number) => ((x * 256 + px) / (2 ** DEM_ZOOM * 256)) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * (y * 256 + 128)) / (2 ** DEM_ZOOM * 256);
    const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
    expect(at(lat, lngOf(100.5))).toBeCloseTo(200, 1);
    expect(at(lat, lngOf(101))).toBeCloseTo(200.5, 1);
  });

  it('demTilesFor — 점이 든 타일과 경계 옆 타일', () => {
    const keys = demTilesFor([{ lat: 37.5, lng: 127.5 }]);
    expect(keys).toContain(keyOf(37.5, 127.5));
    expect(keys.length).toBeLessThanOrEqual(4);
  });

  it('loadDemTiles — 받아서 캐시에 두고 다음엔 캐시로, 못 받은 타일은 failed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hiking-dem-'));
    dirs.push(dir);
    const [r, g, b] = rgbOf(500);
    const png = await sharp({ create: { width: 256, height: 256, channels: 3, background: { r, g, b } } }).png().toBuffer();
    const urls: string[] = [];
    const ok = async (url: string) => {
      urls.push(url);
      return url.endsWith('/1/2.png') ? new Response('nope', { status: 404 }) : new Response(new Uint8Array(png));
    };
    const first = await loadDemTiles(['10/20', '1/2'], dir, ok);
    // 여러 타일을 동시에 받으니 순서는 보지 않는다.
    expect(urls).toContain(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${DEM_ZOOM}/10/20.png`);
    expect(first).toMatchObject({ cached: 0, fetched: 1 });
    expect(first.failed).toEqual(['1/2 HTTP 404']);
    expect(first.tiles.get('10/20')![0]).toBeCloseTo(500, 3);
    expect(fs.existsSync(path.join(dir, `${DEM_ZOOM}-10-20.png`))).toBe(true);

    const again = await loadDemTiles(['10/20'], dir, async () => {
      throw new Error('부르면 안 됨');
    });
    expect(again).toMatchObject({ cached: 1, fetched: 0, failed: [] });
  });
});
