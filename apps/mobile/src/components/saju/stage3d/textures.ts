import * as THREE from 'three';
import { finishTexture as finish, hex, memoTexture, radialPixels as radial, seededRng as rng } from '../../common/stage3d/dataTexture';

// 절차 생성 텍스처 — 웹 stage/sajuTextures 의 캔버스 그리기를 픽셀 배열(DataTexture)로 옮겼다. 앱(expo-gl)엔 2D
// 캔버스가 없고, 글꼴이 필요 없는 무늬(인주 얼룩·금 테두리·파문·광택·배경 그라데이션)는 JS 로 바로 만든다.
// 도우미·둥근 점(dotTexture)은 공용 common/stage3d/dataTexture.

/** 인장 면 바탕 — 주사 인주 + 옅은 얼룩 + 금 테두리. 글자는 아틀라스 평면을 위에 겹친다. accent 는 일간. */
export const sealFaceTexture = (accent: boolean): THREE.DataTexture =>
  memoTexture(`saju:seal:${accent}`, () => {
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

const GOLD = hex('#d9b65b');
const JUSA = hex('#b8322a');

/** 먹 번짐 리플 — 부드러운 금빛 고리. */
export const rippleTexture = (): THREE.DataTexture =>
  memoTexture('saju:ripple', () =>
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
  memoTexture('saju:disc-glow', () =>
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

/** 배경 — 위 #1c1a22 에서 65% 지점 #0b0b0f 로(웹 무대·앱 2D 화면과 같은 그라데이션). */
export const backgroundTexture = (): THREE.DataTexture =>
  memoTexture('saju:background', () => {
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
