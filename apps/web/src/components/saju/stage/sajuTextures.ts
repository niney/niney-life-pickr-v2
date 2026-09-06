import * as THREE from 'three';
import { sajuImagePath, sajuStemImageId, type Stem } from '@repo/utils';
import { SAJU_GOLD, SAJU_HANJI, SAJU_JUSA } from '../sajuTheme';

// 캔버스 텍스처 — 한자·한글 글리프는 WebGL 로 폰트를 싣지 않고 2D 캔버스로 그려 텍스처로 쓴다
// (troika 는 CJK 폰트 파일이 필요). 인장 면·고리 글자·일간 캐릭터.

const SERIF = "'Noto Serif KR','Batang','Apple Myungjo','Noto Serif CJK KR',serif";

const cache = new Map<string, THREE.Texture>();
const toTexture = (canvas: HTMLCanvasElement): THREE.CanvasTexture => {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
};

/** 인장 면 — 주사(朱砂) 인주 바탕 + 금 테두리 + 한자 한 글자(한지색). accent 는 일간 등 강조. */
export const sealFaceTexture = (hanja: string, color = SAJU_HANJI, accent = false): THREE.Texture => {
  const key = `seal:${hanja}:${color}:${accent}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d');
  if (!g) return new THREE.Texture();
  g.fillStyle = accent ? '#c93a2f' : SAJU_JUSA;
  g.fillRect(0, 0, s, s);
  // 인주 질감 — 살짝 얼룩.
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`;
    const r = 6 + Math.random() * 22;
    g.beginPath();
    g.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = SAJU_GOLD;
  g.lineWidth = accent ? 14 : 10;
  g.strokeRect(14, 14, s - 28, s - 28);
  g.fillStyle = color;
  g.font = `700 ${Math.round(s * 0.62)}px ${SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(hanja, s / 2, s / 2 + s * 0.04);
  const t = toTexture(c);
  cache.set(key, t);
  return t;
};

/** 고리 글자 — 투명 바탕에 금색 한자. */
export const ringGlyphTexture = (hanja: string, color = SAJU_GOLD): THREE.Texture => {
  const key = `glyph:${hanja}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = 128;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d');
  if (!g) return new THREE.Texture();
  g.clearRect(0, 0, s, s);
  g.fillStyle = color;
  g.font = `600 ${Math.round(s * 0.66)}px ${SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(hanja, s / 2, s / 2 + s * 0.04);
  const t = toTexture(c);
  cache.set(key, t);
  return t;
};

/** 먹 번짐 리플 — 부드러운 고리. */
export const rippleTexture = (): THREE.Texture => {
  const key = 'ripple';
  const hit = cache.get(key);
  if (hit) return hit;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d');
  if (!g) return new THREE.Texture();
  const grad = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s * 0.5);
  grad.addColorStop(0, 'rgba(217,182,91,0)');
  grad.addColorStop(0.7, 'rgba(217,182,91,0.9)');
  grad.addColorStop(1, 'rgba(217,182,91,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = toTexture(c);
  cache.set(key, t);
  return t;
};

/** 원판 바닥 글로우(금빛 안개). */
export const discGlowTexture = (): THREE.Texture => {
  const key = 'disc-glow';
  const hit = cache.get(key);
  if (hit) return hit;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d');
  if (!g) return new THREE.Texture();
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(217,182,91,0.35)');
  grad.addColorStop(0.55, 'rgba(184,50,42,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = toTexture(c);
  cache.set(key, t);
  return t;
};

/** 일간 캐릭터 이미지(512 webp). 로드 실패 시 null. */
export const loadDayMasterTexture = (stem: Stem): Promise<THREE.Texture> =>
  new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      sajuImagePath(sajuStemImageId(stem), 512),
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        resolve(t);
      },
      undefined,
      (e) => reject(e),
    );
  });
