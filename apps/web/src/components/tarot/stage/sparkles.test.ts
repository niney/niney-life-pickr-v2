import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { sparkleColors } from './sparkles';

// drei <Sparkles> 에 넘기는 색 버퍼 — 같은 색·개수면 같은 참조여야 다시 그릴 때 bufferAttribute 가 재생성되지 않는다.

describe('sparkleColors', () => {
  it('색·개수가 같으면 같은 버퍼를 돌려준다', () => {
    const a = sparkleColors('#ffd98a', 4);
    expect(sparkleColors('#ffd98a', 4)).toBe(a);
    expect(sparkleColors('#ffd98a', 5)).not.toBe(a);
    expect(sparkleColors('#e8cf8f', 4)).not.toBe(a);
  });

  it('파티클마다 THREE.Color 와 같은 rgb(작업 색공간)를 채운다', () => {
    const buf = sparkleColors('#d9b65b', 3);
    const c = new THREE.Color('#d9b65b');
    expect(buf).toHaveLength(9);
    for (let i = 0; i < 3; i++) {
      expect(buf[i * 3]).toBeCloseTo(c.r, 6);
      expect(buf[i * 3 + 1]).toBeCloseTo(c.g, 6);
      expect(buf[i * 3 + 2]).toBeCloseTo(c.b, 6);
    }
  });
});
