import * as THREE from 'three';
import { getTarotCard, tarotCardBackImagePath, tarotCardImagePath } from '@repo/utils';
import { TAROT_GOLD } from '../tarotTheme';

// 카드 텍스처 로딩 — 앞면은 뽑힌 카드만 512 로 지연 로드(78장을 다 올리면 모바일 GPU 메모리가
// 터진다). URL 별 1회 로드, 실패(아직 생성 안 된 카드)는 이름을 그린 캔버스 텍스처로 대체.

const cache = new Map<string, Promise<THREE.Texture>>();
const loader = new THREE.TextureLoader();

const prepare = (tex: THREE.Texture): THREE.Texture => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
};

export const loadTexture = (url: string): Promise<THREE.Texture> => {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then(prepare);
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
};

export const loadCardFront = (cardId: string): Promise<THREE.Texture> =>
  loadTexture(tarotCardImagePath(cardId, 512));
export const loadCardBack = (): Promise<THREE.Texture> => loadTexture(tarotCardBackImagePath(512));

const W = 512;
const H = 878;

const canvasTexture = (draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};

const paintBase = (ctx: CanvasRenderingContext2D): void => {
  const g = ctx.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H * 0.4, H * 0.75);
  g.addColorStop(0, '#22306a');
  g.addColorStop(1, '#090b1a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = TAROT_GOLD;
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, W - 44, H - 44);
};

const placeholders = new Map<string, THREE.CanvasTexture>();

// 아직 이미지가 없는 카드 — 이름·번호를 그린 임시 앞면.
export const placeholderFrontTexture = (cardId: string): THREE.CanvasTexture => {
  const hit = placeholders.get(cardId);
  if (hit) return hit;
  const card = getTarotCard(cardId);
  const tex = canvasTexture((ctx) => {
    paintBase(ctx);
    ctx.textAlign = 'center';
    ctx.fillStyle = TAROT_GOLD;
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.36, 110, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = TAROT_GOLD;
    ctx.stroke();
    ctx.font = '700 72px Georgia, serif';
    ctx.fillText(card ? (card.arcana === 'major' ? String(card.number) : card.nameKo.split(' ').pop() ?? '') : '?', W / 2, H * 0.36 + 26);
    ctx.fillStyle = '#f3e9c6';
    ctx.font = "700 48px 'Noto Serif KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
    ctx.fillText(card?.nameKo ?? cardId, W / 2, H * 0.66);
    ctx.fillStyle = TAROT_GOLD;
    ctx.font = '26px Georgia, serif';
    ctx.fillText(card?.nameEn ?? '', W / 2, H * 0.66 + 46);
  });
  placeholders.set(cardId, tex);
  return tex;
};

let backFallback: THREE.CanvasTexture | null = null;

// 뒷면 이미지가 없을 때 — 남색 바탕 + 금색 테두리 + 중앙 문양(180° 대칭).
export const fallbackBackTexture = (): THREE.CanvasTexture => {
  if (backFallback) return backFallback;
  backFallback = canvasTexture((ctx) => {
    paintBase(ctx);
    ctx.strokeStyle = TAROT_GOLD;
    ctx.lineWidth = 2;
    ctx.strokeRect(44, 44, W - 88, H - 88);
    for (let r = 40; r <= 160; r += 40) {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = TAROT_GOLD;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 14, 0, Math.PI * 2);
    ctx.fill();
  });
  return backFallback;
};

// 테이블 위 은은한 빛 무리 — 방사형 그라데이션.
let glow: THREE.CanvasTexture | null = null;
export const glowTexture = (): THREE.CanvasTexture => {
  if (glow) return glow;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(217,182,91,0.55)');
    g.addColorStop(0.45, 'rgba(120,100,60,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  glow = new THREE.CanvasTexture(canvas);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
};
