import * as THREE from 'three';
import { Routes } from '@repo/api-contract';
import { finishTexture, hex, memoTexture, radialPixels, type RGB } from '../../common/stage3d/dataTexture';
import { apiUrl } from '~/lib/api-setup';

// 타로 3D 텍스처 — 앞면은 뽑힌 카드만 서버 텍스처 JPEG(Routes.Tarot.cardTexture, expo-gl 이 WebP 를 못 읽어 서버가
// 바꿔 준다)로 받아 쓴다(78장을 다 올리지 않는다). 뒷면은 번들 JPEG(assets/tarot/back-384.jpg — 장면이 useLoader 로).
// 절차 무늬(탁자 빛무리·대체 앞면)는 DataTexture. 글자는 그리지 않는다(앱엔 캔버스·글꼴이 없다).

const origin = apiUrl.replace(/\/$/, '');
export const tarotTextureUrl = (cardId: string): string => `${origin}${Routes.Tarot.cardTexture(cardId)}`;

const loader = new THREE.TextureLoader();
const cache = new Map<string, Promise<THREE.Texture>>();

const prepare = (tex: THREE.Texture): THREE.Texture => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
};

/** 카드 앞면 — URL 별 1회. 실패하면 캐시에서 빼 다음에 다시 시도한다. */
export const loadCardFront = (cardId: string): Promise<THREE.Texture> => {
  const url = tarotTextureUrl(cardId);
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then(prepare);
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
};

/** 뒷면 번들 텍스처를 받은 뒤 한 번 손질(장면이 useLoader 결과에 부른다). */
export const prepareBackTexture = (tex: THREE.Texture): THREE.Texture => (tex.colorSpace === THREE.SRGBColorSpace ? tex : prepare(tex));

const NAVY_IN = hex('#22306a');
const NAVY_OUT = hex('#090b1a');
const GOLD = hex('#d9b65b');

// 카드 바탕 — 남색 방사 그라데이션 + 금 테두리(웹 textures.paintBase).
const cardBase = (w: number, h: number): Uint8Array => {
  const d = new Uint8Array(w * h * 4);
  const cx = w / 2;
  const cy = h * 0.6; // DataTexture 는 첫 줄이 아래 — 위쪽 40% 지점이 밝게.
  const rMax = h * 0.75;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = Math.min(1, Math.hypot(x - cx, y - cy) / rMax);
      const o = (y * w + x) * 4;
      d[o] = Math.round(NAVY_IN[0] + (NAVY_OUT[0] - NAVY_IN[0]) * k);
      d[o + 1] = Math.round(NAVY_IN[1] + (NAVY_OUT[1] - NAVY_IN[1]) * k);
      d[o + 2] = Math.round(NAVY_IN[2] + (NAVY_OUT[2] - NAVY_IN[2]) * k);
      d[o + 3] = 255;
    }
  }
  return d;
};

const paint = (d: Uint8Array, w: number, x: number, y: number, c: RGB): void => {
  const o = (y * w + x) * 4;
  d[o] = c[0];
  d[o + 1] = c[1];
  d[o + 2] = c[2];
};

// 테두리 사각형(inset 부터 두께 lw).
const rect = (d: Uint8Array, w: number, h: number, inset: number, lw: number): void => {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = Math.min(x - inset, y - inset, w - 1 - inset - x, h - 1 - inset - y);
      if (edge >= 0 && edge < lw) paint(d, w, x, y, GOLD);
    }
  }
};

// 가운데 동심원 선.
const rings = (d: Uint8Array, w: number, h: number, radii: readonly number[], lw: number): void => {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - w / 2, y - h / 2);
      if (radii.some((rr) => Math.abs(r - rr) < lw / 2)) paint(d, w, x, y, GOLD);
    }
  }
};

const W = 128;
const H = 220;

/** 앞면을 못 받았을 때 — 남색 + 금 테두리 + 원(이름 글자 없이). */
export const fallbackFrontTexture = (): THREE.DataTexture =>
  memoTexture('tarot:front-fallback', () => {
    const d = cardBase(W, H);
    rect(d, W, H, 6, 2);
    rings(d, W, H, [26], 1.6);
    return finishTexture(d, W, H);
  });

/** 탁자 위 은은한 빛무리 — 금빛 → 어두운 금 → 투명(웹 glowTexture). */
export const tableGlowTexture = (): THREE.DataTexture =>
  memoTexture('tarot:table-glow', () =>
    finishTexture(
      radialPixels(128, [
        [0, GOLD, 0.55],
        [0.45, hex('#78643c'), 0.18],
        [1, [0, 0, 0], 0],
      ]),
      128,
      128,
    ),
  );
