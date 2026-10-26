// 지형 고도 — AWS Terrain Tiles(terrarium PNG, 키 없음). 한국 육지는 SRTM 30m, 바다는 ETOPO1 이다. 근처 GPX 고도도 빌리지 못한
// 국립공원 공식 코스에 고도를 붙인다(9차 보강). 적재 스크립트에서만 부른다 — 필요한 타일을 미리 받아 두고(캐시 폴더) 동기 함수
// (DemAt)로 조립(buildHikingRows)에 넘긴다. 출처 표시: "SRTM data courtesy of the U.S. Geological Survey"(공개 자료).
// 실측(GPX 고도 코스 60개를 지형 고도로 다시 만들어 견줌): 예상 시간 중앙 오차 4%·치우침 −2%, 누적 상승 중앙 오차 5%, 봉우리가
// 뭉개져 최고 고도는 30m 남짓 낮다. docs/PLAN-hiking.md §지형 고도

import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchWithTimeout } from '../../lib/fetch-timeout.js';
import type { FetchLike } from './hiking-api.adapter.js';
import type { LatLngPoint } from './hiking-park.adapter.js';

// 줌 13 = 한국에서 픽셀 15m 남짓(원자료 30m 보다 촘촘), 타일 하나 4km 남짓.
export const DEM_ZOOM = 13;
const TILE_PX = 256;
const TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const TIMEOUT_MS = 30_000;
const CONCURRENCY = 8;

// 위경도 → 고도(m). 타일이 없거나 바다(0 이하)면 null.
export type DemAt = (lat: number, lng: number) => number | null;

// 픽셀 중심 기준 좌표(쌍선형 보간의 왼쪽 위 픽셀과 비율).
const pixelOf = (lat: number, lng: number, z: number) => {
  const n = 2 ** z * TILE_PX;
  const r = (lat * Math.PI) / 180;
  const px = ((lng + 180) / 360) * n - 0.5;
  const py = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n - 0.5;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  return { x0, y0, tx: px - x0, ty: py - y0 };
};
const tileKey = (X: number, Y: number): string => `${Math.floor(X / TILE_PX)}/${Math.floor(Y / TILE_PX)}`;

// 이 점들의 고도에 드는 타일 — 보간하는 네 픽셀에 한 픽셀씩 더(조립 때 묻는 점이 여기 준 점과 조금 달라도 타일 경계에서 비지 않게).
export const demTilesFor = (points: Iterable<LatLngPoint>, z = DEM_ZOOM): string[] => {
  const keys = new Set<string>();
  for (const p of points) {
    const { x0, y0 } = pixelOf(p.lat, p.lng, z);
    for (let dx = -1; dx <= 2; dx++) for (let dy = -1; dy <= 2; dy++) keys.add(tileKey(x0 + dx, y0 + dy));
  }
  return [...keys];
};

// terrarium: 고도 = R·256 + G + B/256 − 32768.
export const decodeTerrarium = (raw: Uint8Array, channels: number): Float32Array => {
  const out = new Float32Array(raw.length / channels);
  for (let i = 0; i < out.length; i++) out[i] = raw[i * channels]! * 256 + raw[i * channels + 1]! + raw[i * channels + 2]! / 256 - 32768;
  return out;
};

export const makeDemAt = (tiles: ReadonlyMap<string, Float32Array>, z = DEM_ZOOM): DemAt => {
  const px = (X: number, Y: number): number | undefined => tiles.get(tileKey(X, Y))?.[(((Y % TILE_PX) + TILE_PX) % TILE_PX) * TILE_PX + (((X % TILE_PX) + TILE_PX) % TILE_PX)];
  return (lat, lng) => {
    const { x0, y0, tx, ty } = pixelOf(lat, lng, z);
    const a = px(x0, y0);
    const b = px(x0 + 1, y0);
    const c = px(x0, y0 + 1);
    const d = px(x0 + 1, y0 + 1);
    if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
    const ele = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
    return ele > 0 ? ele : null;
  };
};

export interface DemLoadResult {
  tiles: Map<string, Float32Array>;
  cached: number;
  fetched: number;
  failed: string[];
}

// 타일을 캐시 폴더(<z>-<x>-<y>.png)에서 읽고 없으면 받아 둔다. 못 받은 타일은 failed(그 자리 고도는 null).
export const loadDemTiles = async (keys: readonly string[], cacheDir: string, fetchImpl?: FetchLike, z = DEM_ZOOM): Promise<DemLoadResult> => {
  const { default: sharp } = await import('sharp');
  const doFetch = fetchImpl ?? ((u: string, init?: RequestInit) => fetchWithTimeout(u, init ?? {}, TIMEOUT_MS));
  await fs.mkdir(cacheDir, { recursive: true });
  const out: DemLoadResult = { tiles: new Map(), cached: 0, fetched: 0, failed: [] };
  const queue = [...keys];
  const worker = async () => {
    for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
      const file = path.join(cacheDir, `${z}-${key.replace('/', '-')}.png`);
      try {
        let png = await fs.readFile(file).catch(() => null);
        if (png) out.cached += 1;
        else {
          const res = await doFetch(`${TILE_URL}/${z}/${key}.png`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          png = Buffer.from(await res.arrayBuffer());
          await fs.writeFile(file, png);
          out.fetched += 1;
        }
        const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
        out.tiles.set(key, decodeTerrarium(data, info.channels));
      } catch (e) {
        out.failed.push(`${key} ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
};
