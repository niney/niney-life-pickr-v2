import * as THREE from 'three';
import type { PillarKey } from '@repo/utils';

// 천문도 무대 치수·타이밍 — 원판(흑요석) 위 인장 8개. 카메라는 위에서 비스듬히(타로는 정면).

export const DISC_R = 3.4;
export const DISC_H = 0.26;
/** 바깥(지지 12)·중간(천간 10)·안쪽(오행 5) 고리 반지름. */
export const RING_R: { branches: number; stems: number; elements: number } = { branches: 3.0, stems: 2.3, elements: 1.35 };

export const CAMERA_POS: readonly [number, number, number] = [0, 7.6, 6.6];
export const CAMERA_FOV = 34;
export const LOOK_AT: readonly [number, number, number] = [0, 0.2, 0];

/** 인장 크기(정사각 한 변)·두께·자리 간격. 기둥 4열(년·월·일·시) × 2행(천간·지지). */
export const SEAL_S = 0.86;
export const SEAL_T = 0.16;
export const SEAL_COL_GAP = 1.12;
export const SEAL_ROW_Z = { stem: -0.62, branch: 0.62 } as const;
export const SEAL_DROP_Y = 4.2;

export const TIMING = {
  /** casting — 고리 회전 후 정렬. */
  castS: 3.0,
  /** 인장 간 간격·낙하 시간. */
  stampGapS: 0.55,
  stampDropS: 0.32,
  rippleS: 0.9,
  /** 일간 캐릭터 등장. */
  cardS: 1.2,
} as const;

export const PILLAR_ORDER: readonly PillarKey[] = ['year', 'month', 'day', 'hour'];

/** 기둥 index(0 년 … 3 시) → x. 시주가 없으면 3열을 가운데로. */
export const pillarX = (i: number, total: 3 | 4): number => (i - (total - 1) / 2) * SEAL_COL_GAP;

/** 인장 순서(0..7): 년간·년지·월간·월지·일간·일지·시간·시지. */
export const sealOrder = (total: 3 | 4): Array<{ pillar: number; row: 'stem' | 'branch' }> => {
  const out: Array<{ pillar: number; row: 'stem' | 'branch' }> = [];
  for (let p = 0; p < total; p++) {
    out.push({ pillar: p, row: 'stem' });
    out.push({ pillar: p, row: 'branch' });
  }
  return out;
};

export const sealRestPosition = (pillar: number, row: 'stem' | 'branch', total: 3 | 4): THREE.Vector3 =>
  new THREE.Vector3(pillarX(pillar, total), DISC_H / 2 + SEAL_T / 2, SEAL_ROW_Z[row]);

/** 안쪽 고리 오행 5구슬 자리 — 목(위)부터 시계 방향으로 상생 순서. */
export const elementAngle = (i: number): number => Math.PI / 2 - (i * 2 * Math.PI) / 5;
export const elementPosition = (i: number, r = RING_R.elements): THREE.Vector3 =>
  new THREE.Vector3(Math.cos(elementAngle(i)) * r, DISC_H / 2 + 0.02, -Math.sin(elementAngle(i)) * r);

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const dampK = (dt: number, lambda: number): number => 1 - Math.exp(-lambda * dt);
export const easeOutCubic = (t: number): number => 1 - (1 - clamp(t, 0, 1)) ** 3;
export const easeInOutCubic = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
