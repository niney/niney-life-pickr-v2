import { FONT } from '../theme';
import { Face, Paper, Steam, type Mood } from './kit';
import type { PaperPalette } from './palette';
import { SPOON_BOWL_PATH, SPOON_PATH } from './shapes';
import { tornEllipse, tornPath, tornRect } from './torn';

// 소품 — 색종이로 오린 살림살이. 모두 원점이 가운데, 대략 240×240 안(숟가락·소금통은 장면 크기 그대로).
// v = 2프레임마다 바뀌는 가장자리(boil), f = 장면 시계(김·시곗바늘 같은 작은 움직임).

export interface PropProps {
  pal: PaperPalette;
  f: number;
  v: number;
}

const tr = (x: number, y: number, w: number, h: number, seed: number, v: number, amp = 2.4) => tornRect(x, y, w, h, { seed: seed + v * 101, amp, step: 6 });
const te = (cx: number, cy: number, rx: number, ry: number, seed: number, v: number, amp = 2.4) => tornEllipse(cx, cy, rx, ry, { seed: seed + v * 101, amp, step: 6 });
const tp = (d: string, seed: number, v: number, amp = 2.6) => tornPath(d, { seed: seed + v * 101, amp, step: 6 });

// ── 숟가락·소금통(소금 숟가락 장면) ──
/** 숟가락 + 소금 더미(얼굴). fill 1 = 가득, 넘으면 솟는다. ghost = 아직 모르는 내 숟가락(점선 윤곽). */
export const PaperSpoon = ({ pal, f, v, fill, mood, seed, ghost = false }: PropProps & { fill: number; mood: Mood; seed: number; ghost?: boolean }) => {
  if (ghost) {
    return (
      <g>
        <path d={SPOON_PATH} fill="rgba(255,255,255,0.1)" stroke="#ffffff" strokeWidth={10} strokeDasharray="28 20" strokeLinejoin="round" />
        <text data-deco="" x={0} y={30} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={120} fill="#ffffff" opacity={0.9}>
          ?
        </text>
      </g>
    );
  }
  const full = Math.min(Math.max(fill, 0), 1);
  const heap = Math.min(Math.max(fill - 1, 0), 0.6);
  const rx = 172 * Math.sqrt(full) + heap * 75;
  const ry = 106 * Math.sqrt(full) + heap * 48;
  const cy = -Math.min(fill, 1.6) * 24;
  const dots = Math.round(40 * Math.min(fill, 1.5));
  return (
    <g>
      <Paper d={tp(SPOON_PATH, seed, v, 3)} fill={pal.silver} lift={1.1} />
      <path d={SPOON_BOWL_PATH} fill={pal.silverDeep} />
      <path d="M -6 190 L -10 330" stroke={pal.shine} strokeWidth={14} strokeLinecap="round" />
      <path d="M -150 -40 C -140 -100, -80 -128, -20 -130" stroke={pal.shine} strokeWidth={10} strokeLinecap="round" fill="none" opacity={0.8} />
      {fill > 0.02 ? (
        <g>
          <Paper d={te(0, Math.round(cy), Math.round(rx), Math.round(ry), seed + 7, v, 2.6)} fill={pal.salt} lift={0.5} />
          {Array.from({ length: dots }, (_, i) => {
            const a = ((i * 137.5) % 360) * (Math.PI / 180);
            const r = Math.sqrt(((i * 0.618) % 1) * 0.9 + 0.05) * 0.86;
            return <circle key={i} cx={Math.cos(a) * rx * r} cy={cy + Math.sin(a) * ry * r} r={3 + (i % 4)} fill={pal.saltDot} />;
          })}
          {fill > 0.35 ? <Face x={0} y={cy - 6} s={Math.min(1.25, 0.6 + full * 0.65)} mood={mood} f={f} pal={pal} seed={seed} /> : null}
        </g>
      ) : null}
    </g>
  );
};

/** 소금통 — 얼굴 있는 하얀 몸통, 남색 뚜껑. 입구(구멍)는 원점에서 위로 168. */
export const PaperShaker = ({ pal, f, v, mood = 'happy', label = '소금' }: PropProps & { mood?: Mood; label?: string }) => (
  <g>
    <Paper d={tp('M -94 -68 C -94 -100, -76 -118, -44 -118 L 44 -118 C 76 -118, 94 -100, 94 -68 L 94 84 C 94 116, 76 134, 44 134 L -44 134 C -76 134, -94 116, -94 84 Z', 61, v)} fill={pal.salt} lift={1} />
    <Paper d={tp('M -88 -112 C -88 -196, 88 -196, 88 -112 Z', 62, v)} fill={pal.navy} lift={0.4} />
    {[-28, 0, 28].map((dx, i) => (
      <circle key={i} cx={dx} cy={i === 1 ? -160 : -148} r={9} fill={pal.paper} />
    ))}
    <Face x={0} y={-36} s={1.1} mood={mood} f={f} pal={pal} seed={5} />
    <Paper d={tr(-70, 30, 140, 70, 63, v, 2)} fill={pal.yellow} lift={0.4} />
    <text data-deco="" x={0} y={80} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={46} fill={pal.ink}>
      {label}
    </text>
  </g>
);

// ── 살림살이 ──
export const SoupBowl = ({ pal, f, v }: PropProps) => (
  <g>
    <Steam x={0} y={-30} s={1} f={f} />
    <Paper d={tp('M -112 -6 L 112 -6 C 106 66, 62 102, 0 102 C -62 102, -106 66, -112 -6 Z', 71, v)} fill={pal.paper} lift={0.9} />
    <path d="M -102 30 C -60 40, 60 40, 102 30" stroke={pal.navy} strokeWidth={10} fill="none" />
    <Paper d={te(0, -6, 112, 26, 72, v)} fill={pal.soup} lift={0} />
    <Paper d={tr(-42, 96, 84, 18, 73, v, 1.6)} fill={pal.paper} lift={0.3} />
  </g>
);

export const Clock = ({ pal, f, v }: PropProps) => (
  <g>
    <Paper d={te(0, 0, 76, 76, 81, v)} fill={pal.paper} lift={0.8} />
    <circle r={60} fill="none" stroke={pal.navy} strokeWidth={8} />
    {Array.from({ length: 12 }, (_, i) => (
      <circle key={i} cx={Math.cos((i / 12) * Math.PI * 2) * 48} cy={Math.sin((i / 12) * Math.PI * 2) * 48} r={i % 3 === 0 ? 5 : 3} fill={pal.navy} />
    ))}
    <path d={`M 0 0 L ${Math.cos((f * 4 - 90) * (Math.PI / 180)) * 40} ${Math.sin((f * 4 - 90) * (Math.PI / 180)) * 40}`} stroke={pal.ink} strokeWidth={7} strokeLinecap="round" />
    <path d={`M 0 0 L ${Math.cos((f / 3 + 30) * (Math.PI / 180)) * 26} ${Math.sin((f / 3 + 30) * (Math.PI / 180)) * 26}`} stroke={pal.ink} strokeWidth={9} strokeLinecap="round" />
    <circle r={7} fill={pal.red} />
  </g>
);

export const Kimchi = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={te(0, 46, 124, 40, 91, v)} fill={pal.paper} lift={0.9} />
    <Paper d={tp('M -86 40 C -96 -20, -40 -54, 0 -40 C 40 -64, 100 -24, 88 40 Z', 92, v)} fill="#d9483b" lift={0.4} />
    <Paper d={tp('M -50 20 C -60 -30, -10 -60, 10 -30 C 0 -6, -20 10, -50 20 Z', 93, v)} fill="#f1d9a8" lift={0.2} />
    <Paper d={tp('M 20 30 C 30 -20, 80 -30, 70 20 Z', 94, v)} fill="#e8743b" lift={0.2} />
    <path d="M -30 -6 L -16 -20 M 36 4 L 50 -10" stroke="#5aa05a" strokeWidth={8} strokeLinecap="round" />
  </g>
);

export const SauceBottle = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={tp('M -72 -58 C -72 -86, 72 -86, 72 -58 L 72 104 C 72 122, -72 122, -72 104 Z', 101, v)} fill={pal.tomato} lift={1} />
    <Paper d={tr(-60, -122, 120, 44, 102, v)} fill={pal.navy} lift={0.4} />
    <Paper d={tr(-58, -4, 116, 64, 103, v, 1.8)} fill={pal.paper} lift={0.2} />
    <text data-deco="" x={0} y={42} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={34} fill={pal.ink}>
      소스
    </text>
  </g>
);

export const Can = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={tr(-72, -88, 144, 196, 111, v)} fill={pal.silver} lift={1} />
    <Paper d={te(0, -88, 72, 18, 112, v, 1.6)} fill={pal.silverDeep} lift={0} />
    <Paper d={tr(-72, -40, 144, 96, 113, v, 1.8)} fill={pal.red} lift={0.2} />
    <text data-deco="" x={0} y={22} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={48} fill="#ffffff">
      햄
    </text>
    <path d="M -20 -96 C -10 -112, 20 -112, 24 -96" stroke={pal.steel} strokeWidth={8} fill="none" strokeLinecap="round" />
  </g>
);

export const Ramen = ({ pal, v }: PropProps) => (
  <g>
    <path d="M -64 -74 C -50 -110, -20 -96, -10 -120 M 0 -74 C 14 -112, 40 -96, 46 -124 M 40 -74 C 56 -100, 70 -90, 78 -110" stroke="#f2c46d" strokeWidth={10} fill="none" strokeLinecap="round" />
    <Paper d={tp('M -92 -72 L 92 -72 L 72 112 L -72 112 Z', 121, v)} fill={pal.paper} lift={1} />
    <Paper d={tr(-86, -20, 172, 44, 122, v, 1.6)} fill={pal.red} lift={0} />
    <Paper d={tr(-80, 40, 160, 22, 123, v, 1.4)} fill={pal.yellow} lift={0} />
  </g>
);

export const Lemon = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={tp('M -112 0 C -102 -72, 102 -72, 112 0 C 102 72, -102 72, -112 0 Z', 131, v)} fill="#f4d23c" lift={0.9} />
    <path d="M -60 -30 C -30 -46, 20 -46, 50 -32" stroke="#fff3b0" strokeWidth={10} fill="none" strokeLinecap="round" />
    <Paper d={tp('M 80 -40 C 100 -90, 150 -86, 150 -70 C 140 -50, 110 -40, 80 -40 Z', 132, v)} fill={pal.leaf} lift={0.3} />
  </g>
);

export const Magnifier = ({ pal, v }: PropProps) => (
  <g>
    <g transform="rotate(40)">
      <Paper d={tr(60, -16, 130, 32, 141, v)} fill={pal.wood} lift={0.8} />
    </g>
    <Paper d={te(-20, -20, 82, 82, 142, v)} fill="#cfe7f5" lift={0.9} />
    <circle cx={-20} cy={-20} r={74} fill="none" stroke={pal.navy} strokeWidth={14} />
    <path d="M -64 -44 C -56 -70, -32 -82, -8 -80" stroke="#ffffff" strokeWidth={10} fill="none" strokeLinecap="round" />
  </g>
);

export const NutritionLabel = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={tr(-92, -116, 184, 232, 151, v)} fill={pal.paper} lift={1} />
    <text data-deco="" x={-70} y={-78} fontFamily={FONT} fontWeight={900} fontSize={30} fill={pal.ink}>
      영양정보
    </text>
    <rect x={-72} y={-66} width={144} height={8} fill={pal.ink} />
    {[0, 1, 2, 3].map((i) => (
      <rect key={i} x={-72} y={-40 + i * 36} width={144} height={3} fill={pal.ink} opacity={0.6} />
    ))}
    <Paper d={tr(-80, -30, 160, 34, 152, v, 1.4)} fill={pal.yellow} lift={0} />
    <text data-deco="" x={-70} y={-5} fontFamily={FONT} fontWeight={800} fontSize={22} fill={pal.ink}>
      나트륨
    </text>
  </g>
);

export const Dip = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={te(0, 34, 112, 40, 161, v)} fill={pal.paper} lift={0.9} />
    <Paper d={te(0, 28, 76, 22, 162, v, 1.8)} fill="#8a4b2a" lift={0} />
    <g transform="rotate(-28)">
      <Paper d={tr(-10, -110, 20, 120, 163, v, 1.4)} fill={pal.silver} lift={0.4} />
      <Paper d={te(0, 10, 30, 20, 164, v, 1.4)} fill={pal.silver} lift={0.2} />
    </g>
  </g>
);

export const Noodle = ({ pal, v }: PropProps) => (
  <g transform="rotate(-18)">
    <Paper d={tr(-44, -118, 88, 236, 171, v)} fill="#f2c46d" lift={0.9} />
    {Array.from({ length: 7 }, (_, i) => (
      <path key={i} d={`M ${-36 + i * 12} -112 L ${-36 + i * 12} 112`} stroke="#d9a441" strokeWidth={3} />
    ))}
    <Paper d={tr(-50, -14, 100, 30, 172, v, 1.4)} fill={pal.navy} lift={0.2} />
  </g>
);

export const Tomato = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={te(0, 12, 104, 92, 181, v)} fill={pal.tomato} lift={0.9} />
    <path d="M -50 -20 C -40 -44, -14 -54, 8 -52" stroke="#ff9c8a" strokeWidth={12} fill="none" strokeLinecap="round" />
    <Paper d={tp('M 0 -96 L 14 -70 L 44 -76 L 22 -54 L 40 -30 L 10 -42 L 0 -14 L -10 -42 L -40 -30 L -22 -54 L -44 -76 L -14 -70 Z', 182, v, 1.6)} fill={pal.leaf} lift={0.2} />
  </g>
);

export const Onion = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={tp('M 0 -112 C 30 -70, 100 -40, 96 30 C 92 90, 50 106, 0 106 C -50 106, -92 90, -96 30 C -100 -40, -30 -70, 0 -112 Z', 191, v)} fill={pal.onion} lift={0.9} />
    {[-40, 0, 40].map((dx, i) => (
      <path key={i} d={`M ${dx * 0.3} -96 C ${dx} -40, ${dx * 1.4} 40, ${dx * 0.8} 100`} stroke="#c9a37c" strokeWidth={4} fill="none" />
    ))}
    <path d="M -16 106 L -24 124 M 0 106 L 0 128 M 16 106 L 24 124" stroke="#c9a37c" strokeWidth={4} strokeLinecap="round" />
  </g>
);

export const Garlic = ({ v }: PropProps) => (
  <g>
    <Paper d={tp('M 0 -96 C 20 -60, 104 -24, 96 40 C 90 92, 40 104, 0 104 C -40 104, -90 92, -96 40 C -104 -24, -20 -60, 0 -96 Z', 201, v)} fill="#f6efe2" lift={0.9} />
    <path d="M 0 -80 C -30 -10, -40 60, -10 104 M 0 -80 C 30 -10, 40 60, 10 104" stroke="#d8ccb6" strokeWidth={5} fill="none" />
    <path d="M -4 -96 L 0 -126" stroke="#b9a98d" strokeWidth={8} strokeLinecap="round" />
  </g>
);

export const OilBottle = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={tp('M -18 -120 L 18 -120 L 18 -70 C 50 -50, 56 -30, 56 0 L 56 110 C 56 124, 46 130, 34 130 L -34 130 C -46 130, -56 124, -56 110 L -56 0 C -56 -30, -50 -50, -18 -70 Z', 211, v)} fill={pal.oil} lift={1} />
    <Paper d={tr(-22, -140, 44, 26, 212, v, 1.4)} fill={pal.navy} lift={0.2} />
    <Paper d={tr(-46, 10, 92, 56, 213, v, 1.6)} fill={pal.paper} lift={0} />
    <text data-deco="" x={0} y={46} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={22} fill={pal.ink}>
      올리브유
    </text>
  </g>
);

export const Leaf = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={tp('M -110 30 C -60 -70, 30 -70, 40 -10 C 20 40, -60 60, -110 30 Z', 221, v)} fill={pal.leaf} lift={0.8} />
    <Paper d={tp('M -20 40 C 30 -30, 110 -30, 110 20 C 90 70, 20 80, -20 40 Z', 222, v)} fill="#6fb46f" lift={0.6} />
    <path d="M -100 26 C -50 -10, 0 -20, 30 -10 M -10 36 C 30 0, 70 -6, 100 14" stroke="#3f7f3f" strokeWidth={5} fill="none" strokeLinecap="round" />
  </g>
);

export const Cheese = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={tp('M -110 70 L 100 70 L 100 -6 L -110 -70 Z', 231, v)} fill={pal.cheese} lift={0.9} />
    {[
      [-40, 10, 16],
      [30, 30, 12],
      [60, -2, 9],
      [-80, 40, 8],
    ].map(([x, y, r], i) => (
      <ellipse key={i} cx={x} cy={y} rx={r} ry={(r ?? 10) * 0.7} fill="#d9a441" />
    ))}
  </g>
);

export const Pot = ({ f, v }: PropProps) => (
  <g>
    <Steam x={0} y={-64} s={1.1} f={f} />
    <Paper d={tr(-122, -44, 244, 150, 241, v)} fill="#5b6b8c" lift={1} />
    <Paper d={tr(-132, -60, 264, 26, 242, v, 1.6)} fill="#46546f" lift={0.3} />
    <Paper d={tr(-162, -30, 40, 22, 243, v, 1.4)} fill="#46546f" lift={0.2} />
    <Paper d={tr(122, -30, 40, 22, 244, v, 1.4)} fill="#46546f" lift={0.2} />
    {[0, 1, 2].map((i) => {
      const t = (f / 40 + i / 3) % 1;
      return <circle key={i} cx={-60 + i * 60} cy={-60 - t * 30} r={8 + t * 6} fill="#ffffff" opacity={0.7 * (1 - t)} />;
    })}
  </g>
);

export const Pan = ({ pal, f, v }: PropProps) => (
  <g>
    <Steam x={-10} y={-20} s={0.9} f={f} />
    <g transform="rotate(-6)">
      <Paper d={tr(110, 8, 160, 28, 251, v)} fill={pal.wood} lift={0.6} />
    </g>
    <Paper d={te(0, 24, 132, 46, 252, v)} fill="#3b3f48" lift={1} />
    <Paper d={te(0, 16, 112, 34, 253, v, 1.8)} fill={pal.tomato} lift={0} />
    {[
      [-40, 10],
      [10, 20],
      [50, 6],
    ].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={9} fill="#f6efe2" />
    ))}
  </g>
);

export const Plate = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={te(0, 30, 144, 50, 261, v)} fill={pal.paper} lift={1} />
    <Paper d={te(0, 24, 104, 34, 262, v, 1.8)} fill={pal.cream} lift={0} />
    {[-48, -24, 0, 24, 48].map((dx, i) => (
      <path key={i} d={`M ${dx - 30} 30 C ${dx - 10} -10, ${dx + 10} 50, ${dx + 30} 10`} stroke="#f2c46d" strokeWidth={9} fill="none" strokeLinecap="round" />
    ))}
    <Paper d={te(0, 10, 44, 18, 263, v, 1.6)} fill={pal.tomato} lift={0} />
    <Paper d={tp('M 10 -8 C 30 -30, 60 -26, 62 -14 C 50 -2, 30 0, 10 -8 Z', 264, v, 1.2)} fill={pal.leaf} lift={0} />
  </g>
);

export const Timer = ({ pal, f, v }: PropProps) => (
  <g>
    <Paper d={tr(-16, -118, 32, 26, 271, v, 1.4)} fill={pal.navy} lift={0.2} />
    <Paper d={te(0, 4, 96, 96, 272, v)} fill={pal.red} lift={1} />
    <Paper d={te(0, 4, 70, 70, 273, v, 1.8)} fill={pal.paper} lift={0} />
    {Array.from({ length: 8 }, (_, i) => (
      <rect key={i} x={-2} y={-58} width={4} height={14} fill={pal.ink} transform={`rotate(${i * 45} 0 4)`} />
    ))}
    <path d={`M 0 4 L ${Math.cos((-90 - f * 2) * (Math.PI / 180)) * 50} ${4 + Math.sin((-90 - f * 2) * (Math.PI / 180)) * 50}`} stroke={pal.red} strokeWidth={7} strokeLinecap="round" />
  </g>
);

/** 목록·단계 아이콘 크기(약 240) 숟가락·소금통. */
export const SpoonIcon = (p: PropProps) => (
  <g transform="scale(0.48) translate(0 -128)">
    <PaperSpoon {...p} fill={0.8} mood="calm" seed={301} />
  </g>
);
export const ShakerIcon = (p: PropProps) => (
  <g transform="scale(0.72) translate(0 -8)">
    <PaperShaker {...p} />
  </g>
);

/** 그림이 없는 것 — 둥근 색종이에 첫 글자. */
export const Badge = ({ pal, v, text }: PropProps & { text: string }) => (
  <g>
    <Paper d={te(0, 0, 92, 92, 281, v)} fill={pal.yellow} lift={0.9} />
    <text data-deco="" x={0} y={32} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={88} fill={pal.ink}>
      {[...text][0] ?? '·'}
    </text>
  </g>
);
