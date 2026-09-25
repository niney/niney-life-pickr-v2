import { resolve } from 'node:path';
import { LRUCache } from 'lru-cache';
import sharp from 'sharp';
import { tarotCardImagePath } from '@repo/utils';
import { candidateWebAssetRoots } from '../../lib/web-index.js';

// 카드 앞면 텍스처 — 앱 3D 무대(expo-gl)는 이미지를 stb_image 로 풀어 WebP 를 못 읽는다. 카드 그림의 단일 출처는
// 웹 정적 자산(apps/web/{dist|public}/tarot/cards/<id>-512.webp)이라, 여기서 JPEG 384px 로 바꿔 준다(저장소에
// 같은 그림을 한 벌 더 두지 않는다). 카드 78장 × 약 60KB 라 프로세스 메모리에 다 들어간다. 그림이 없으면 null.

export const TAROT_TEXTURE_WIDTH = 384;

const cache = new LRUCache<string, Buffer>({ max: 80 });

export async function renderTarotCardTexture(cardId: string): Promise<Buffer | null> {
  const hit = cache.get(cardId);
  if (hit) return hit;
  const rel = tarotCardImagePath(cardId, 512).replace(/^\//, '');
  for (const root of candidateWebAssetRoots()) {
    try {
      const jpg = await sharp(resolve(root, rel)).resize(TAROT_TEXTURE_WIDTH).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
      cache.set(cardId, jpg);
      return jpg;
    } catch {
      // 다음 후보
    }
  }
  return null;
}
