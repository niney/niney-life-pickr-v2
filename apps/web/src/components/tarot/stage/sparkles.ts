import * as THREE from 'three';

// drei <Sparkles> 의 color 를 문자열로 주면 렌더마다 새 THREE.Color 를 만들어(안쪽 useMemo 의 의존값) 색 버퍼를 다시
// 채우고 bufferAttribute 를 갈아 끼운다 — 그때마다 GL 버퍼가 새로 올라간다. Float32Array 를 주면 그대로 쓰므로,
// 색·개수별로 한 번만 만든 버퍼를 돌려쓴다(타로·사주 무대 공용).

const cache = new Map<string, Float32Array>();

/** 파티클 count 개에 같은 색을 채운 버퍼 — 색·개수가 같으면 같은 참조. */
export const sparkleColors = (color: string, count: number): Float32Array => {
  const key = `${color}:${count}`;
  let hit = cache.get(key);
  if (!hit) {
    const c = new THREE.Color(color);
    hit = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      hit[i * 3] = c.r;
      hit[i * 3 + 1] = c.g;
      hit[i * 3 + 2] = c.b;
    }
    cache.set(key, hit);
  }
  return hit;
};
