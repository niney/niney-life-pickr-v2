import { rand } from '../anim';
import { SHAKER_MOUTH, shakerPose, type Span } from '../saltPose';
import type { PaperPalette } from './palette';

// 쏟아지고 넘치는 소금 — 작은 종이 조각(네모, 제각각 기울기)과 아주 옅은 그림자.

const Bit = ({ x, y, r, rot, pal, opacity }: { x: number; y: number; r: number; rot: number; pal: PaperPalette; opacity?: number }) => (
  <g opacity={opacity} transform={`rotate(${rot} ${x} ${y})`}>
    <rect x={x - r + 1} y={y - r + 3} width={r * 2} height={r * 2} rx={1.5} fill="rgba(42,29,24,0.16)" />
    <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={1.5} fill={pal.salt} />
  </g>
);

/** 소금통 입구에서 쏟아지는 조각 — land 높이에 닿으면 사라진다(더미가 받는다). */
export const PaperGrains = ({
  f,
  fps,
  at,
  timing,
  land,
  count,
  seed,
  pal,
}: {
  f: number;
  fps: number;
  at: { x: number; y: number; s: number };
  timing: { drop: number; tilt: Span; pour: Span };
  land: (i: number) => number;
  count: number;
  seed: number;
  pal: PaperPalette;
}) => {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const spawn = timing.pour[0] + (i / count) * (timing.pour[1] - timing.pour[0]) + (rand(seed + i) - 0.5) * 2;
    if (f < spawn) continue;
    const pose = shakerPose(spawn, fps, at, timing);
    const a = (pose.angle * Math.PI) / 180;
    const mx = pose.cx + SHAKER_MOUTH * at.s * Math.sin(a);
    const my = pose.cy - SHAKER_MOUTH * at.s * Math.cos(a);
    const t = (f - spawn) / fps;
    const x = mx + (rand(seed + i * 2.3) - 0.5) * 160 * at.s * t;
    const y = my + 220 * at.s * t + 0.5 * 2600 * at.s * t * t;
    if (y > land(i)) continue;
    out.push(<Bit key={i} x={x} y={y} r={(6 + rand(seed + i * 6.7) * 4) * at.s} rot={rand(seed + i * 9.1) * 90 + f * 3} pal={pal} />);
  }
  return <g>{out}</g>;
};

/** 숟가락 테두리에서 넘쳐 흘러내리는 조각 — 떨어지며 옅어진다. */
export const PaperSpill = ({
  f,
  fps,
  at,
  from,
  to,
  count,
  seed,
  pal,
}: {
  f: number;
  fps: number;
  at: { x: number; y: number; s: number };
  from: number;
  to: number;
  count: number;
  seed: number;
  pal: PaperPalette;
}) => {
  const out = [];
  for (let j = 0; j < count; j += 1) {
    const spawn = from + (j / count) * Math.max(1, to - from);
    if (f < spawn) continue;
    const t = (f - spawn) / fps;
    if (t > 1.1) continue;
    const side = j % 2 === 0 ? -1 : 1;
    const x0 = at.x + side * (196 + rand(seed + j) * 22) * at.s;
    const y0 = at.y - 34 * at.s + rand(seed + j * 1.9) * 24 * at.s;
    const x = x0 + side * (150 + rand(seed + j * 2.9) * 200) * at.s * t;
    const y = y0 - (60 + rand(seed + j * 3.7) * 140) * at.s * t + 0.5 * 2600 * at.s * t * t;
    out.push(<Bit key={j} x={x} y={y} r={(6 + rand(seed + j * 5.1) * 3) * at.s} rot={j * 37 + f * 4} pal={pal} opacity={1 - t / 1.1} />);
  }
  return <g>{out}</g>;
};
