import * as THREE from 'three';

// 3D 무대 절차 생성 텍스처 도우미 — 앱(expo-gl)엔 2D 캔버스가 없어 글꼴이 필요 없는 무늬(그라데이션·테두리·점)는 JS
// 픽셀 배열(DataTexture)로 만든다. 모듈에 한 번 만들어 두고 재사용한다(GPU 업로드는 렌더러가 컨텍스트마다 한다).
// 사주·타로 장면이 같이 쓴다 — memo 키는 장면 이름을 앞에 붙여 겹치지 않게.

export type RGB = readonly [number, number, number];

export const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** 시드 고정 의사난수 — 렌더·실행마다 같은 무늬. */
export const seededRng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

/** 픽셀 배열 → 밉맵 켠 DataTexture. color 면 sRGB(색 그림), 아니면 선형(마스크·빛). */
export const finishTexture = (data: Uint8Array, w: number, h: number, color = true): THREE.DataTexture => {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
};

const cache = new Map<string, THREE.DataTexture>();
export const memoTexture = (key: string, make: () => THREE.DataTexture): THREE.DataTexture => {
  const hit = cache.get(key);
  if (hit) return hit;
  const t = make();
  cache.set(key, t);
  return t;
};

/** 방사형 그라데이션 픽셀 — stops: [반지름 비율 0~1, 색, 불투명도]. 원 밖은 투명. */
export const radialPixels = (s: number, stops: ReadonlyArray<readonly [number, RGB, number]>): Uint8Array => {
  const d = new Uint8Array(s * s * 4);
  const c = (s - 1) / 2;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const t = Math.sqrt((x - c) ** 2 + (y - c) ** 2) / (s / 2);
      let i = 0;
      while (i < stops.length - 1 && t > (stops[i + 1] as readonly [number, RGB, number])[0]) i++;
      const a = stops[i] as readonly [number, RGB, number];
      const b = (stops[Math.min(i + 1, stops.length - 1)] ?? a) as readonly [number, RGB, number];
      const k = b[0] === a[0] ? 0 : Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
      const o = (y * s + x) * 4;
      d[o] = Math.round(a[1][0] + (b[1][0] - a[1][0]) * k);
      d[o + 1] = Math.round(a[1][1] + (b[1][1] - a[1][1]) * k);
      d[o + 2] = Math.round(a[1][2] + (b[1][2] - a[1][2]) * k);
      d[o + 3] = Math.round((a[2] + (b[2] - a[2]) * k) * 255 * (t > 1 ? 0 : 1));
    }
  }
  return d;
};

const WHITE: RGB = [255, 255, 255];

/** 둥근 점 — 별·별가루·반짝이(Points 의 map). */
export const dotTexture = (): THREE.DataTexture =>
  memoTexture('common:dot', () =>
    finishTexture(
      radialPixels(32, [
        [0, WHITE, 1],
        [0.35, WHITE, 0.8],
        [1, WHITE, 0],
      ]),
      32,
      32,
    ),
  );
