import { describe, expect, it } from 'vitest';
import { jamoBigramDice, packBySimilarity, toJamo } from './menu-grouping.similarity.js';

describe('menu-grouping similarity', () => {
  it('decomposes Hangul syllables to jamo and passes other chars through', () => {
    expect(toJamo('공기밥')).toBe('ㄱㅗㅇㄱㅣㅂㅏㅂ');
    expect(toJamo('abc 123')).toBe('abc 123');
  });

  it('scores typo/affix variants high and unrelated dishes low', () => {
    // 받침 추가 오타 — 음절 bigram 은 놓치지만 자모 bigram 은 잡는 케이스.
    expect(jamoBigramDice('공기밥', '공깃밥')).toBeGreaterThanOrEqual(0.7);
    expect(jamoBigramDice('돈까스', '수제돈까스')).toBeGreaterThanOrEqual(0.6);
    expect(jamoBigramDice('김치찌개', '묵은지김치찌개')).toBeGreaterThanOrEqual(0.6);
    // 다른 음식은 패킹 임계(0.45) 아래.
    expect(jamoBigramDice('김치찌개', '된장찌개')).toBeLessThan(0.45);
    expect(jamoBigramDice('비빔밥', '물냉면')).toBeLessThan(0.2);
    expect(jamoBigramDice('수육', '수육')).toBe(1);
  });

  it('packs similar variants into the same chunk', () => {
    const chunks = packBySimilarity(['김치찌개', '수육', '묵은지김치찌개', '도가니수육'], 2);
    expect(chunks).toHaveLength(2);
    const chunkOf = (name: string): number => chunks.findIndex((c) => c.includes(name));
    expect(chunkOf('김치찌개')).toBe(chunkOf('묵은지김치찌개'));
    expect(chunkOf('수육')).toBe(chunkOf('도가니수육'));
  });

  it('slices oversized blocks and never exceeds maxChunk', () => {
    const family = ['돈까스', '돈까스정식', '돈까스세트', '돈까스스페셜', '왕돈까스'];
    const chunks = packBySimilarity(family, 2);
    expect(chunks.every((c) => c.length <= 2)).toBe(true);
    // 항목 유실/중복 없음.
    expect(chunks.flat().sort()).toEqual([...family].sort());
  });

  it('is deterministic for the same input', () => {
    const items = ['감자탕', '뼈해장국', '김치찌개', '된장찌개', '비빔밥', '물냉면'];
    expect(packBySimilarity(items, 3)).toEqual(packBySimilarity(items, 3));
    // 비유사 6개 → singleton 블록 6개 → 입력 순서 그대로 3+3.
    expect(packBySimilarity(items, 3).map((c) => c.length)).toEqual([3, 3]);
  });

  it('handles empty and single inputs', () => {
    expect(packBySimilarity([], 10)).toEqual([]);
    expect(packBySimilarity(['혼밥'], 10)).toEqual([['혼밥']]);
  });
});
