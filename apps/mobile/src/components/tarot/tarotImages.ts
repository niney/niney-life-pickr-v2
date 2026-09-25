import { Image } from 'expo-image';
import { tarotCardImagePath } from '@repo/utils';
import { webUrl } from '~/lib/api-setup';

// 카드 앞면 주소 — 웹 정적 자산(`/tarot/cards/<id>-512.webp`, 79장 약 9MB)을 받아 디스크에 캐시한다(앱 번들에 넣지 않는다).
// 뽑은 카드는 자리 잡는 동안 미리 받아 뒤집을 때 비어 보이지 않게 한다.

const origin = webUrl.replace(/\/$/, '');

export const tarotFaceUri = (cardId: string): string => `${origin}${tarotCardImagePath(cardId, 512)}`;

export const prefetchTarotFaces = (cardIds: readonly string[]): void => {
  Image.prefetch(cardIds.map(tarotFaceUri), 'memory-disk').catch(() => undefined);
};
