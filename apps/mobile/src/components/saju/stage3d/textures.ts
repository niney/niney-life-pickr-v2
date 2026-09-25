import * as THREE from 'three';

// 절차 생성 텍스처 — 웹 stage/sajuTextures 의 캔버스 그리기를 픽셀 배열(DataTexture)로 옮겼다. 앱(expo-gl)엔 2D
// 캔버스가 없고, 글꼴이 필요 없는 무늬(인주 얼룩·금 테두리·파문·광택·별 점·배경 그라데이션)는 JS 로 바로 만든다.
// 모듈에 한 번 만들어 두고 재사용한다(GPU 업로드는 렌더러가 컨텍스트마다 한다).

type RGB = readonly [number, number, number];

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// 시드 고정 의사난수 — 렌더·실행마다 같은 무늬.
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const finish = (data: Uint8Array, w: number, h: number, color = true): THREE.DataTexture => {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
};

const cache = new Map<string, THREE.DataTexture>();
const memo = (key: string, make: () => THREE.DataTexture): THREE.DataTexture => {
  const hit = cache.get(key);
  if (hit) return hit;
  const t = make();
  cache.set(key, t);
  return t;
};

/** 인장 면 바탕 — 주사 인주 + 옅은 얼룩 + 금 테두리. 글자는 아틀라스 평면을 위에 겹친다. accent 는 일간. */
export const sealFaceTexture = (accent: boolean): THREE.DataTexture =>
  memo(`seal:${accent}`, () => {
    const s = 128;
    const d = new Uint8Array(s * s * 4);
    const [br, bg, bb] = hex(accent ? '#c93a2f' : '#b8322a');
    for (let i = 0; i < s * s; i++) {
      d[i * 4] = br;
      d[i * 4 + 1] = bg;
      d[i * 4 + 2] = bb;
      d[i * 4 + 3] = 255;
    }
    const r = rng(accent ? 11 : 7);
    for (let k = 0; k < 60; k++) {
      const cx = r() * s;
      const cy = r() * s;
      const rad = 3 + r() * 11;
      const a = 0.03 + r() * 0.05;
      for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(s, Math.ceil(cy + rad)); y++) {
        for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(s, Math.ceil(cx + rad)); x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > rad * rad) continue;
          const o = (y * s + x) * 4;
          d[o] = Math.round((d[o] as number) * (1 - a));
          d[o + 1] = Math.round((d[o + 1] as number) * (1 - a));
          d[o + 2] = Math.round((d[o + 2] as number) * (1 - a));
        }
      }
    }
    const [gr, gg, gb] = hex('#d9b65b');
    const inset = 7;
    const lw = accent ? 7 : 5;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const edge = Math.min(x - inset, y - inset, s - 1 - inset - x, s - 1 - inset - y);
        if (edge >= -lw / 2 && edge < lw / 2) {
          const o = (y * s + x) * 4;
          d[o] = gr;
          d[o + 1] = gg;
          d[o + 2] = gb;
        }
      }
    }
    return finish(d, s, s);
  });

const radial = (s: number, stops: ReadonlyArray<readonly [number, RGB, number]>): Uint8Array => {
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

const GOLD = hex('#d9b65b');
const JUSA = hex('#b8322a');
const WHITE: RGB = [255, 255, 255];

/** 먹 번짐 리플 — 부드러운 금빛 고리. */
export const rippleTexture = (): THREE.DataTexture =>
  memo('ripple', () =>
    finish(
      radial(128, [
        [0, GOLD, 0],
        [0.6, GOLD, 0],
        [0.84, GOLD, 0.9],
        [1, GOLD, 0],
      ]),
      128,
      128,
    ),
  );

/** 원판 바닥 글로우(금빛 안개 → 주사 → 투명). */
export const discGlowTexture = (): THREE.DataTexture =>
  memo('disc-glow', () =>
    finish(
      radial(128, [
        [0, GOLD, 0.35],
        [0.55, JUSA, 0.12],
        [1, [0, 0, 0], 0],
      ]),
      128,
      128,
    ),
  );

/** 둥근 점 — 별·별가루·파티클. */
export const dotTexture = (): THREE.DataTexture =>
  memo('dot', () =>
    finish(
      radial(32, [
        [0, WHITE, 1],
        [0.35, WHITE, 0.8],
        [1, WHITE, 0],
      ]),
      32,
      32,
    ),
  );

/** 배경 — 위 #1c1a22 에서 65% 지점 #0b0b0f 로(웹 무대·앱 2D 화면과 같은 그라데이션). */
export const backgroundTexture = (): THREE.DataTexture =>
  memo('background', () => {
    const h = 64;
    const d = new Uint8Array(h * 4);
    const top = hex('#1c1a22');
    const bottom = hex('#0b0b0f');
    for (let y = 0; y < h; y++) {
      // DataTexture 는 첫 줄이 아래(v=0) — 위로 갈수록 밝게.
      const fromTop = 1 - y / (h - 1);
      const k = Math.min(1, fromTop / 0.65);
      d[y * 4] = Math.round(top[0] + (bottom[0] - top[0]) * k);
      d[y * 4 + 1] = Math.round(top[1] + (bottom[1] - top[1]) * k);
      d[y * 4 + 2] = Math.round(top[2] + (bottom[2] - top[2]) * k);
      d[y * 4 + 3] = 255;
    }
    const t = new THREE.DataTexture(d, 1, h, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  });
