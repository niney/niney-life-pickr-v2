import { Easing, interpolate, spring, useCurrentFrame } from 'remotion';
import { TEMPO } from './theme';

// 움직임 도구 — 모든 움직임은 프레임에서 계산한다(CSS 애니메이션은 렌더·되감기에서 어긋난다).

/** 장면 시계(설계 프레임) — 실제 프레임 ÷ TEMPO. 장면 그림의 시각표는 모두 이 시계로 적는다(빠르기는 theme.ts TEMPO 한 곳). */
export const useClock = (): number => useCurrentFrame() / TEMPO;

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const SMOOTH = Easing.bezier(0.2, 0.7, 0.2, 1);

/** a~b 프레임 사이의 0~1 진행(부드럽게 감속). */
export const prog = (f: number, a: number, b: number, easing: (t: number) => number = SMOOTH): number =>
  interpolate(f, [a, b], [0, 1], { ...CLAMP, easing });

/** 시작 프레임부터 튕기며 0 → 1(조금 넘쳤다 돌아옴). 시작 전엔 0. */
export const pop = (
  f: number,
  start: number,
  fps: number,
  config: { damping?: number; stiffness?: number; mass?: number } = {},
): number =>
  f < start ? 0 : spring({ frame: f - start, fps, config: { damping: 12, stiffness: 140, mass: 0.8, ...config } });

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 결정적 난수(0~1) — 같은 씨앗이면 렌더마다 같은 값. */
export const rand = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
