import * as THREE from 'three';
import { getTarotCard, tarotCardBackImagePath, tarotCardImagePath } from '@repo/utils';
import { TAROT_GOLD } from '@repo/shared';

// 카드 텍스처 로딩 — 앞면은 뽑힌 카드만 512 로 지연 로드(78장을 다 올리면 모바일 GPU 메모리가
// 터진다). 실패(아직 생성 안 된 카드)는 이름을 그린 캔버스 텍스처로 대체.
//
// 앞면은 최근에 쓴 FRONT_CACHE_MAX 장만 들고 있는다 — 캐시에 한도가 없으면 한 세션에서 리딩을 거듭할수록
// 뽑았던 카드가 전부 GPU 에 남아 결국 78장에 수렴한다. 넘치면 가장 오래 안 쓴 것부터 dispose.

const loader = new THREE.TextureLoader();

const prepare = (tex: THREE.Texture): THREE.Texture => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
};

/** 앞면 텍스처를 몇 장까지 들고 있을지 — 한 리딩이 쓰는 장수(지금 최대 3, 켈틱 10)보다 넉넉하게. */
export const FRONT_CACHE_MAX = 12;

// cardId → 로드 Promise. Map 은 삽입 순서를 지키므로 맨 앞이 가장 오래 안 쓴 카드다.
const fronts = new Map<string, Promise<THREE.Texture>>();
// cardId → 이름을 그린 임시 앞면(아래 placeholderFrontTexture). 앞면이 캐시에서 밀려날 때 같이 내리고, 자체로도
// 같은 한도를 지킨다.
const placeholders = new Map<string, THREE.CanvasTexture>();

export const loadCardFront = (cardId: string): Promise<THREE.Texture> => {
  const hit = fronts.get(cardId);
  if (hit) {
    // 방금 쓴 카드를 맨 뒤로.
    fronts.delete(cardId);
    fronts.set(cardId, hit);
    return hit;
  }
  const p = loader.loadAsync(tarotCardImagePath(cardId, 512)).then(prepare);
  p.catch(() => {
    if (fronts.get(cardId) === p) fronts.delete(cardId);
  });
  fronts.set(cardId, p);
  for (const oldest of fronts.keys()) {
    if (fronts.size <= FRONT_CACHE_MAX) break;
    const old = fronts.get(oldest);
    fronts.delete(oldest);
    // 다 받은 뒤에(이미 받았으면 바로) GPU 에서 내린다. 그 카드의 placeholder 도 같이.
    old?.then((tex) => tex.dispose()).catch(() => {});
    placeholders.get(oldest)?.dispose();
    placeholders.delete(oldest);
  }
  return p;
};

// 뒷면은 무대가 떠 있는 내내 쓰므로 한도 밖에서 한 장만 든다.
let back: Promise<THREE.Texture> | null = null;

export const loadCardBack = (): Promise<THREE.Texture> => {
  if (!back) {
    const p = loader.loadAsync(tarotCardBackImagePath(512)).then(prepare);
    p.catch(() => {
      if (back === p) back = null;
    });
    back = p;
  }
  return back;
};

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

// 아직 이미지가 없는 카드 — 이름·번호를 그린 임시 앞면. 로드가 실패했거나 뒤집힐 때까지 못 받았을 때만 만든다.
export const placeholderFrontTexture = (cardId: string): THREE.CanvasTexture => {
  const hit = placeholders.get(cardId);
  if (hit) {
    // 방금 쓴 카드를 맨 뒤로.
    placeholders.delete(cardId);
    placeholders.set(cardId, hit);
    return hit;
  }
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
  // 이미지가 없는 카드는 앞면 캐시에 남지 않아 loadCardFront 에서 같이 내려가지 않는다 — 여기서도 같은 한도로 자른다.
  for (const oldest of placeholders.keys()) {
    if (placeholders.size <= FRONT_CACHE_MAX) break;
    placeholders.get(oldest)?.dispose();
    placeholders.delete(oldest);
  }
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
