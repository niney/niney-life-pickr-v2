import satori from 'satori';
import { describe, expect, it } from 'vitest';
import { loadShareFallbackAsset, loadShareFonts } from './share-fonts.js';

// 공유 이미지(satori) 한자 — Plex 에 없는 한자(正官·比肩 등)는 한자 대체 글꼴로 그려야 □ 가 되지 않는다.
const node = (children: string) => ({ type: 'div', props: { style: { display: 'flex', fontFamily: 'Plex', fontSize: 40 }, children } });
// satori 는 글자를 path 로 그린다(embedFont 기본값).
const pathOf = (svg: string): string => [...svg.matchAll(/<path[^>]* d="([^"]*)"/g)].map((m) => m[1]).join('');

describe('share-fonts 한자 대체', () => {
  it('한자가 든 글자 묶음에만 한자 글꼴을 보탠다', async () => {
    const han = await loadShareFallbackAsset('zh-CN', '正官');
    if (!Array.isArray(han)) throw new Error('글꼴 배열이 아님');
    expect(han.map((f) => f.name)).toEqual(['NotoSansKRHanja']);
    expect(Buffer.from(han[0]!.data as Buffer).subarray(0, 4).toString('latin1')).toBe('OTTO');
    // 확장 B(보조 평면) 한자도 한자로 본다.
    expect(await loadShareFallbackAsset('unknown', '𠀀')).toHaveLength(1);
    expect(await loadShareFallbackAsset('emoji', '😀')).toEqual([]);
    expect(await loadShareFallbackAsset('unknown', 'ÆØ')).toEqual([]);
  });

  it('본문 한자를 빈 글자(□)가 아니라 글자 윤곽으로 그린다', async () => {
    const fonts = await loadShareFonts();
    // satori 가 파싱한 글꼴을 캐시하려면(WeakMap 키) 늘 같은 배열이어야 한다.
    expect(await loadShareFonts()).toBe(fonts);
    const size = { width: 240, height: 60 };
    const drawn = pathOf(await satori(node('正官') as never, { ...size, fonts, loadAdditionalAsset: loadShareFallbackAsset }));
    // 새 배열 = 한자 글꼴이 보태지지 않은 글꼴 캐시 — 예전처럼 Plex 로만 그린다.
    const tofu = pathOf(await satori(node('正官') as never, { ...size, fonts: [...fonts] }));
    expect(drawn).not.toBe(tofu);
    expect(drawn.length).toBeGreaterThan(tofu.length);
  });
});
