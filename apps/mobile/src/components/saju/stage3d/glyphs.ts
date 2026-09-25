import * as THREE from 'three';
import { SAJU_BRANCHES, SAJU_STEMS, SAJU_WUXING, SAJU_WUXING_META } from '@repo/utils';

// 한자 글리프 아틀라스(assets/saju/glyph-atlas.png) — 흰 글자 27자, 8×4칸. 순서는 굽는 스크립트
// (apps/friendly/scripts/build-saju-glyph-atlas.ts)와 같다: 천간 10 → 지지 12 → 오행 5, 왼쪽 위부터 가로로.
// 글자마다 UV 를 칸에 맞춘 평면 지오메트리를 만들어 재질 하나(아틀라스 텍스처 + 색)를 공유한다.

export const SAJU_GLYPH_ORDER: readonly string[] = [...SAJU_STEMS.map((s) => s.hanja), ...SAJU_BRANCHES.map((b) => b.hanja), ...SAJU_WUXING.map((e) => SAJU_WUXING_META[e].hanja)];

const COLS = 8;
const ROWS = 4;

export const glyphIndex = (hanja: string): number => {
  const i = SAJU_GLYPH_ORDER.indexOf(hanja);
  if (i < 0) throw new Error(`글리프 아틀라스에 없는 글자: ${hanja}`);
  return i;
};

const cache = new Map<string, THREE.PlaneGeometry>();

/** 글자 한 칸짜리 평면(한 변 size). 아틀라스는 flipY 로 올라가므로 위쪽 줄이 v=1. */
export const glyphGeometry = (hanja: string, size: number): THREE.PlaneGeometry => {
  const key = `${hanja}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const i = glyphIndex(hanja);
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const u0 = col / COLS;
  const u1 = (col + 1) / COLS;
  const v0 = 1 - (row + 1) / ROWS;
  const v1 = 1 - row / ROWS;
  const g = new THREE.PlaneGeometry(size, size);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // PlaneGeometry 기본 UV: (0,1) (1,1) (0,0) (1,0)
  for (let k = 0; k < uv.count; k++) {
    uv.setXY(k, uv.getX(k) === 0 ? u0 : u1, uv.getY(k) === 0 ? v0 : v1);
  }
  uv.needsUpdate = true;
  cache.set(key, g);
  return g;
};

export const SAJU_GLYPH_ATLAS = require('../../../../assets/saju/glyph-atlas.png');
