import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TAROT_CARDS, tarotCardImagePath } from '@repo/utils';
import { FRONT_CACHE_MAX, loadCardBack, loadCardFront, placeholderFrontTexture } from './textures';

// 카드 텍스처 캐시 — 네트워크·GPU 없이 로더만 바꿔 치워, 앞면이 한도(FRONT_CACHE_MAX)를 넘으면 가장 오래 안 쓴 것부터
// dispose 되는지 본다. 모듈 캐시는 테스트 사이에 남으므로 테스트마다 다른 카드를 쓴다.

const made = new Map<string, THREE.Texture>();
const stubLoader = () =>
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation(async (url: string) => {
    const tex = new THREE.Texture<HTMLImageElement>();
    vi.spyOn(tex, 'dispose');
    made.set(url, tex);
    return tex;
  });
const texOf = (cardId: string): THREE.Texture => made.get(tarotCardImagePath(cardId, 512))!;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
  made.clear();
});

describe('loadCardFront', () => {
  it('최근에 쓴 FRONT_CACHE_MAX 장만 들고, 밀려난 카드는 dispose 한 뒤 다시 받는다', async () => {
    const loadAsync = stubLoader();
    const ids = TAROT_CARDS.slice(0, FRONT_CACHE_MAX + 1).map((c) => c.id);
    for (const id of ids.slice(0, FRONT_CACHE_MAX)) await loadCardFront(id);
    expect(loadAsync).toHaveBeenCalledTimes(FRONT_CACHE_MAX);

    // 한도 안에서는 같은 카드를 다시 받지 않는다. 방금 쓴 ids[0] 은 맨 뒤로 간다.
    const first = texOf(ids[0]!);
    expect(await loadCardFront(ids[0]!)).toBe(first);
    expect(loadAsync).toHaveBeenCalledTimes(FRONT_CACHE_MAX);

    // 한 장 더 — 가장 오래 안 쓴 ids[1] 이 밀려난다(ids[0] 은 남는다).
    const evicted = texOf(ids[1]!);
    await loadCardFront(ids[FRONT_CACHE_MAX]!);
    await tick();
    expect(evicted.dispose).toHaveBeenCalledTimes(1);
    expect(first.dispose).not.toHaveBeenCalled();
    expect(texOf(ids[FRONT_CACHE_MAX]!).dispose).not.toHaveBeenCalled();

    // 밀려난 카드는 다시 부르면 새로 받는다.
    await loadCardFront(ids[1]!);
    expect(loadAsync).toHaveBeenCalledTimes(FRONT_CACHE_MAX + 2);
    expect(texOf(ids[1]!)).not.toBe(evicted);
  });

  it('실패(아직 없는 이미지)는 기억하지 않아 다음에 다시 시도한다', async () => {
    const id = TAROT_CARDS[40]!.id;
    const loadAsync = vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockRejectedValueOnce(new Error('404'));
    await expect(loadCardFront(id)).rejects.toThrow('404');
    loadAsync.mockResolvedValueOnce(new THREE.Texture());
    await expect(loadCardFront(id)).resolves.toBeInstanceOf(THREE.Texture);
    expect(loadAsync).toHaveBeenCalledTimes(2);
  });
});

describe('placeholderFrontTexture', () => {
  it('같은 카드는 한 장을 돌려쓰고, 한도를 넘으면 가장 오래 안 쓴 것부터 dispose 한다', () => {
    // jsdom 에는 2D 컨텍스트가 없다 — 그림은 건너뛰고 텍스처 수명만 본다.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as never);
    const ids = TAROT_CARDS.slice(20, 20 + FRONT_CACHE_MAX + 1).map((c) => c.id);
    const drawn = ids.slice(0, FRONT_CACHE_MAX).map((id) => {
      const tex = placeholderFrontTexture(id);
      vi.spyOn(tex, 'dispose');
      return tex;
    });
    // 방금 다시 쓴 ids[0] 은 맨 뒤로 간다.
    expect(placeholderFrontTexture(ids[0]!)).toBe(drawn[0]);

    // 한 장 더 — 가장 오래 안 쓴 ids[1] 이 내려간다.
    placeholderFrontTexture(ids[FRONT_CACHE_MAX]!);
    expect(drawn[1]!.dispose).toHaveBeenCalledTimes(1);
    expect(drawn[0]!.dispose).not.toHaveBeenCalled();
    expect(placeholderFrontTexture(ids[1]!)).not.toBe(drawn[1]);
  });
});

describe('loadCardBack', () => {
  it('뒷면은 한 번만 받고 앞면 한도와 무관하게 남는다', async () => {
    const loadAsync = stubLoader();
    const back = await loadCardBack();
    for (const card of TAROT_CARDS.slice(50, 50 + FRONT_CACHE_MAX + 2)) await loadCardFront(card.id);
    await tick();
    expect(await loadCardBack()).toBe(back);
    expect(back.dispose).not.toHaveBeenCalled();
    expect(loadAsync.mock.calls.filter(([url]) => String(url).includes('back-')).length).toBe(1);
  });
});
