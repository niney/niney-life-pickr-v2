import { useContext, type CSSProperties, type ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import { rand } from '../anim';
import { textWidth } from '../layout';
import { FONT } from '../theme';
import type { PaperPalette } from './palette';
import { PaperShadow } from './shadow';
import { tornRect } from './torn';

// 종이 오리기 도구 — 찢긴 종이 조각(겹친 그림자), 테이프, 쪽지(글 + 종이), 얼굴, 김, 종이 결.
// 숫자·작은 글은 앱 글꼴(FONT)로 쪽지 위에, 손글씨(HAND)는 제목·짧은 덧말에만.

/** 종이 조각 — 찢긴 경로 + 아래로 겹친 그림자(lift 가 클수록 떠 보인다). 그림자 색은 장면이 내려 준다(paper/shadow.ts). */
export const Paper = ({ d, fill, lift = 1, opacity }: { d: string; fill: string; lift?: number; opacity?: number }) => {
  const shadow = useContext(PaperShadow);
  return (
    <g opacity={opacity}>
      {lift > 0
        ? [10, 6, 3].map((dy, i) => <path key={dy} d={d} fill={shadow[i]} transform={`translate(${(i === 0 ? 2 : i === 1 ? 1 : 0) * lift} ${dy * lift})`} />)
        : null}
      <path d={d} fill={fill} />
    </g>
  );
};

/** 테이프 한 조각(반투명). */
export const Tape = ({ x, y, angle, pal, w = 104 }: { x: number; y: number; angle: number; pal: PaperPalette; w?: number }) => (
  <path d={tornRect(x - w / 2, y - 17, w, 34, { seed: Math.round(x * 7 + y), amp: 1.6, step: 5 })} fill={pal.tape} transform={`rotate(${angle} ${x} ${y})`} />
);

/** 쪽지 — 글 크기에 맞춘 찢긴 종이 + 글. x 는 가운데(anchor middle) 또는 왼쪽. */
export const Note = ({
  x,
  y,
  text,
  size,
  fill,
  color,
  font = FONT,
  weight = 800,
  angle = 0,
  seed = 1,
  padX = 26,
  padY = 12,
  anchor = 'middle',
  minWidth = 0,
  lift = 0.8,
  tracking = -0.02,
}: {
  x: number;
  y: number;
  text: string;
  size: number;
  fill: string;
  color: string;
  font?: string;
  weight?: number;
  angle?: number;
  seed?: number;
  padX?: number;
  padY?: number;
  anchor?: 'middle' | 'start';
  minWidth?: number;
  lift?: number;
  tracking?: number;
}) => {
  const w = Math.max(minWidth, textWidth(text, size) + padX * 2);
  const h = size * 1.3 + padY * 2;
  const left = anchor === 'middle' ? x - w / 2 : x;
  return (
    <g transform={`rotate(${angle} ${left + w / 2} ${y + h / 2})`}>
      <Paper d={tornRect(Math.round(left), Math.round(y), Math.round(w), Math.round(h), { seed, amp: 2.2, step: 6 })} fill={fill} lift={lift} />
      <text
        x={anchor === 'middle' ? x : left + padX}
        y={y + padY + size * 1.0}
        textAnchor={anchor}
        fontFamily={font}
        fontWeight={weight}
        fontSize={size}
        letterSpacing={size * tracking}
        fill={color}
      >
        {text}
      </text>
    </g>
  );
};

/** 여러 줄 쪽지 — 줄마다 글(나눠서 넘긴다), 종이는 가장 긴 줄에 맞춘다. */
export const Card = ({
  x,
  y,
  lines,
  size,
  fill,
  color,
  font = FONT,
  weight = 700,
  angle = 0,
  seed = 1,
  padX = 30,
  padY = 18,
  lineHeight = 1.32,
  anchor = 'middle',
  minWidth = 0,
  lift = 0.8,
}: {
  x: number;
  y: number;
  lines: string[];
  size: number;
  fill: string;
  color: string;
  font?: string;
  weight?: number;
  angle?: number;
  seed?: number;
  padX?: number;
  padY?: number;
  lineHeight?: number;
  anchor?: 'middle' | 'start';
  minWidth?: number;
  lift?: number;
}) => {
  const w = Math.max(minWidth, ...lines.map((l) => textWidth(l, size) + padX * 2));
  const h = lines.length * size * lineHeight + padY * 2;
  const left = anchor === 'middle' ? x - w / 2 : x;
  return (
    <g transform={`rotate(${angle} ${left + w / 2} ${y + h / 2})`}>
      <Paper d={tornRect(Math.round(left), Math.round(y), Math.round(w), Math.round(h), { seed, amp: 2.4, step: 6 })} fill={fill} lift={lift} />
      <text textAnchor={anchor} fontFamily={font} fontWeight={weight} fontSize={size} letterSpacing={size * -0.02} fill={color}>
        {lines.map((l, i) => (
          <tspan key={i} x={anchor === 'middle' ? x : left + padX} y={y + padY + size * (0.98 + i * lineHeight)}>
            {l}
          </tspan>
        ))}
      </text>
    </g>
  );
};

export type Mood = 'calm' | 'happy' | 'worried' | 'wow';

/** 얼굴 — 볼·눈·입(기분마다), 이따금 눈을 깜빡인다. 원점 = 얼굴 가운데. */
export const Face = ({ x, y, s, mood, f, pal, seed = 0 }: { x: number; y: number; s: number; mood: Mood; f: number; pal: PaperPalette; seed?: number }) => {
  // 약 3초마다 4프레임 깜빡임(설계 프레임).
  const period = 96 + Math.round(rand(seed + 3.3) * 40);
  const blink = (f + seed * 17) % period < 4;
  const eye = (cx: number) =>
    blink ? (
      <path d={`M ${cx - 8} -4 L ${cx + 8} -4`} stroke={pal.ink} strokeWidth={5} strokeLinecap="round" />
    ) : (
      <circle cx={cx} cy={-4} r={7} fill={pal.ink} />
    );
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={-46} cy={12} rx={14} ry={8} fill={pal.pink} opacity={0.9} />
      <ellipse cx={46} cy={12} rx={14} ry={8} fill={pal.pink} opacity={0.9} />
      {mood === 'worried' ? (
        <>
          <path d="M -36 -20 L -16 -13 M 36 -20 L 16 -13" stroke={pal.ink} strokeWidth={5} strokeLinecap="round" />
          {eye(-24)}
          {eye(24)}
          <path d="M -16 22 C -8 14, 0 30, 8 20 C 12 16, 16 22, 18 24" stroke={pal.ink} strokeWidth={5} fill="none" strokeLinecap="round" />
          <path d="M 64 -30 C 74 -14, 76 -4, 68 2 C 60 6, 54 -4, 64 -30 Z" fill="#9fd0f0" />
        </>
      ) : (
        <>
          {eye(-24)}
          {eye(24)}
          {mood === 'wow' ? (
            <ellipse cx={0} cy={20} rx={9} ry={12} fill={pal.ink} />
          ) : mood === 'happy' ? (
            <path d="M -16 12 C -8 30, 8 30, 16 12 Z" fill={pal.ink} />
          ) : (
            <path d="M -14 14 C -6 24, 6 24, 14 14" stroke={pal.ink} strokeWidth={5} fill="none" strokeLinecap="round" />
          )}
        </>
      )}
    </g>
  );
};

/** 피어오르는 김 — 물결 선 세 가닥이 위로 흐르며 옅어진다. */
export const Steam = ({ x, y, s, f, color = '#ffffff', count = 3 }: { x: number; y: number; s: number; f: number; color?: string; count?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round">
    {Array.from({ length: count }, (_, i) => {
      const t = (f / 60 + i / count) % 1;
      const dx = (i - (count - 1) / 2) * 40;
      const rise = -t * 70;
      return (
        <path
          key={i}
          d={`M ${dx} ${rise} C ${dx - 16} ${rise - 26}, ${dx + 16} ${rise - 44}, ${dx} ${rise - 70}`}
          opacity={Math.sin(t * Math.PI) * 0.85}
        />
      );
    })}
  </g>
);

// 종이 결 — 정적인 잡음 무늬를 배경 그림으로(한 번 그려 두고 브라우저가 재사용한다).
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

export const Grain = ({ opacity = 0.16 }: { opacity?: number }) => (
  <AbsoluteFill style={{ backgroundImage: GRAIN, backgroundSize: '260px 260px', mixBlendMode: 'multiply', opacity, pointerEvents: 'none' }} />
);

/** 무늬(줄무늬 벽지·깅엄 식탁보·물방울) — 장면마다 id 앞말을 달리한다(전환 중 두 장면이 함께 보인다). */
export const Patterns = ({ idp, pal }: { idp: string; pal: PaperPalette }) => (
  <defs>
    <pattern id={`${idp}-stripes`} patternUnits="userSpaceOnUse" width={60} height={60}>
      <rect width={30} height={60} fill="rgba(255,255,255,0.08)" />
    </pattern>
    <pattern id={`${idp}-gingham`} patternUnits="userSpaceOnUse" width={64} height={64}>
      <rect width={64} height={64} fill={pal.cloth} />
      <rect width={32} height={64} fill={pal.navy} opacity={0.32} />
      <rect width={64} height={32} fill={pal.navy} opacity={0.32} />
    </pattern>
    <pattern id={`${idp}-dots`} patternUnits="userSpaceOnUse" width={40} height={40}>
      <circle cx={10} cy={10} r={5} fill="rgba(255,255,255,0.18)" />
      <circle cx={30} cy={30} r={5} fill="rgba(255,255,255,0.18)" />
    </pattern>
    <pattern id={`${idp}-lines`} patternUnits="userSpaceOnUse" width={40} height={64}>
      <rect y={62} width={40} height={2} fill="#9fb5d9" />
    </pattern>
  </defs>
);

/** 화면 한 장(1080×1920)의 SVG. */
export const Sheet = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0, overflow: 'visible', ...style }}>
    {children}
  </svg>
);

