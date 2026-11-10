import { pop, prog } from './anim';

// 소금통이 움직이는 길(컴포넌트 없음). 소금통 그림은 paper/props.tsx, 알갱이는 paper/grains.tsx.

/** 소금통 입구(뚜껑 구멍)가 몸통 가운데(원점)에서 위로 떨어진 거리. */
export const SHAKER_MOUTH = 168;

/** 프레임 구간 [시작, 끝]. */
export type Span = readonly [number, number];

/** 소금통 동작 — 위에서 떨어져 튕기고, 기울여(반시계 -150도) 흔들며 쏟고, 다시 세워 오른쪽 위로 빠진다. */
export const shakerPose = (
  f: number,
  fps: number,
  at: { x: number; y: number; s: number },
  timing: { drop: number; tilt: Span; pour: Span },
): { cx: number; cy: number; angle: number } => {
  const tiltIn = prog(f, timing.tilt[0], timing.tilt[1]);
  const tiltOut = prog(f, timing.pour[1] + 2, timing.pour[1] + 14);
  const shake = f >= timing.pour[0] && f <= timing.pour[1] ? Math.sin((f - timing.pour[0]) * 1.9) * 11 : 0;
  const exit = prog(f, timing.pour[1] + 8, timing.pour[1] + 28);
  const lift = (1 - pop(f, timing.drop, fps, { damping: 10, stiffness: 120 })) * -900 + exit * -1000;
  return { cx: at.x + exit * 460, cy: at.y + lift, angle: -150 * tiltIn * (1 - tiltOut) + shake };
};
