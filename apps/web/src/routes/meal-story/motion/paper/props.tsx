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

/** 기름병 — 색과 이름표만 바꿔 쓴다(올리브유·참기름). */
const Bottle = ({ pal, v, fill, label, seed }: PropProps & { fill: string; label: string; seed: number }) => (
  <g>
    <Paper d={tp('M -18 -120 L 18 -120 L 18 -70 C 50 -50, 56 -30, 56 0 L 56 110 C 56 124, 46 130, 34 130 L -34 130 C -46 130, -56 124, -56 110 L -56 0 C -56 -30, -50 -50, -18 -70 Z', seed, v)} fill={fill} lift={1} />
    <Paper d={tr(-22, -140, 44, 26, seed + 1, v, 1.4)} fill={pal.navy} lift={0.2} />
    <Paper d={tr(-46, 10, 92, 56, seed + 2, v, 1.6)} fill={pal.paper} lift={0} />
    <text data-deco="" x={0} y={46} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={22} fill={pal.ink}>
      {label}
    </text>
  </g>
);

export const OilBottle = (p: PropProps) => <Bottle {...p} fill={p.pal.oil} label="올리브유" seed={211} />;

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

// ── 식이섬유 편(2026-11-10) — 밥·버섯·채소·콩·과일 ──
/** 밥공기 — 잡곡이 섞인 밥 더미. face 를 주면 그릇에 얼굴(마무리 장면의 짝). */
export const RiceBowl = ({ pal, f, v, face }: PropProps & { face?: Mood }) => (
  <g>
    <Steam x={0} y={-84} s={0.9} f={f} />
    <Paper d={tp('M -100 -4 C -98 -66, -44 -98, 0 -98 C 44 -98, 98 -66, 100 -4 Z', 291, v)} fill="#efe2c4" lift={0.4} />
    {[
      [-60, -30],
      [-34, -60],
      [2, -44],
      [34, -66],
      [64, -30],
      [-6, -80],
      [26, -22],
      [-40, -14],
    ].map(([x, y], i) => (
      <ellipse key={i} cx={x} cy={y} rx={9} ry={6} fill={i % 3 === 0 ? '#8a5a3c' : i % 3 === 1 ? '#c9a06a' : '#5e4636'} transform={`rotate(${i * 40} ${x} ${y})`} />
    ))}
    <Paper d={tp('M -112 -6 L 112 -6 C 106 66, 62 102, 0 102 C -62 102, -106 66, -112 -6 Z', 292, v)} fill={pal.paper} lift={0.9} />
    {face ? <Face x={0} y={40} s={0.92} mood={face} f={f} pal={pal} seed={21} /> : <path d="M -102 30 C -60 40, 60 40, 102 30" stroke={pal.navy} strokeWidth={10} fill="none" />}
    <Paper d={tr(-42, 96, 84, 18, 293, v, 1.6)} fill={pal.paper} lift={0.3} />
  </g>
);

/** 표고버섯 — 갈색 갓에 크림색 대. face 를 주면 대에 얼굴. */
export const Mushroom = ({ pal, f, v, face }: PropProps & { face?: Mood }) => (
  <g>
    <Paper d={tp('M -42 -6 L 42 -6 C 48 50, 50 86, 36 104 C 16 116, -16 116, -36 104 C -50 86, -48 50, -42 -6 Z', 301, v)} fill="#f3e7d0" lift={0.8} />
    <Paper d={tp('M -116 4 C -116 -70, -60 -108, 0 -108 C 60 -108, 116 -70, 116 4 C 80 22, -80 22, -116 4 Z', 302, v)} fill="#a5683f" lift={0.6} />
    <path d="M -62 -50 L -42 -30 M -10 -78 L 4 -54 M 48 -60 L 36 -36 M 74 -22 L 54 -10" stroke="#f3e7d0" strokeWidth={7} strokeLinecap="round" />
    {face ? <Face x={0} y={54} s={0.6} mood={face} f={f} pal={pal} seed={23} /> : null}
  </g>
);

export const Carrot = ({ pal, v }: PropProps) => (
  <g transform="rotate(38) translate(0 14)">
    <Paper d={tp('M -30 -110 C -54 -150, -20 -162, -8 -124 C -6 -166, 26 -162, 14 -122 C 40 -152, 62 -130, 30 -108 Z', 311, v, 1.8)} fill={pal.leaf} lift={0.4} />
    <Paper d={tp('M -40 -112 C -14 -124, 14 -124, 40 -112 C 34 -30, 16 60, 0 118 C -16 60, -34 -30, -40 -112 Z', 312, v)} fill="#f08a34" lift={0.9} />
    <path d="M -22 -70 L 0 -66 M 6 -30 L 24 -34 M -16 6 L 2 10 M 0 50 L 10 46" stroke="#c96a1c" strokeWidth={5} strokeLinecap="round" />
  </g>
);

export const Egg = ({ v }: PropProps) => (
  <g transform="rotate(-12)">
    <Paper d={tp('M 0 -108 C 52 -108, 86 -30, 86 24 C 86 76, 48 108, 0 108 C -48 108, -86 76, -86 24 C -86 -30, -52 -108, 0 -108 Z', 321, v)} fill="#e9bd8f" lift={0.9} />
    <path d="M -44 -40 C -36 -68, -18 -84, 0 -88" stroke="#f7dcbd" strokeWidth={12} fill="none" strokeLinecap="round" />
  </g>
);

/** 콩나물 — 노란 머리에 하얀 줄기 셋. */
export const Sprout = ({ v }: PropProps) => (
  <g>
    {[
      { x: -62, tilt: -8, bend: -16 },
      { x: 0, tilt: 5, bend: 8 },
      { x: 62, tilt: -3, bend: 18 },
    ].map(({ x, tilt, bend }, i) => (
      <g key={i} transform={`translate(${x} 0) rotate(${tilt})`}>
        <path d={`M 0 -58 C ${bend} -10, ${-bend} 50, ${bend * 0.6} 112`} stroke="#d6c9a8" strokeWidth={20} fill="none" strokeLinecap="round" />
        <path d={`M 0 -58 C ${bend} -10, ${-bend} 50, ${bend * 0.6} 112`} stroke="#fbf7ea" strokeWidth={13} fill="none" strokeLinecap="round" />
        <Paper d={te(-4, -80, 31, 23, 331 + i, v, 1.6)} fill="#f2cf4e" lift={0.5} />
        <path d="M -30 -82 C -18 -72, 12 -72, 24 -82" stroke="#d9ae2e" strokeWidth={4} fill="none" />
      </g>
    ))}
  </g>
);

/** 콩 — 검은콩·팥·노란콩 몇 알. */
export const Bean = ({ v }: PropProps) => (
  <g>
    {[
      { x: -52, y: -36, rx: 46, ry: 34, rot: -20, fill: '#2f2a2a' },
      { x: 46, y: -46, rx: 42, ry: 32, rot: 24, fill: '#8d3b2e' },
      { x: -6, y: 40, rx: 52, ry: 36, rot: 8, fill: '#c8a15a' },
      { x: 74, y: 52, rx: 34, ry: 26, rot: -30, fill: '#2f2a2a' },
      { x: -86, y: 58, rx: 30, ry: 24, rot: 30, fill: '#8d3b2e' },
    ].map(({ x, y, rx, ry, rot, fill }, i) => (
      <g key={i} transform={`rotate(${rot} ${x} ${y})`}>
        <Paper d={te(x, y, rx, ry, 341 + i, v, 1.8)} fill={fill} lift={0.6} />
        <path d={`M ${x - rx * 0.5} ${y - ry * 0.35} C ${x - rx * 0.2} ${y - ry * 0.7}, ${x + rx * 0.2} ${y - ry * 0.7}, ${x + rx * 0.45} ${y - ry * 0.4}`} stroke="rgba(255,255,255,0.45)" strokeWidth={5} fill="none" strokeLinecap="round" />
      </g>
    ))}
  </g>
);

export const Apple = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={tp('M 0 -62 C 30 -92, 108 -70, 104 6 C 100 76, 52 112, 0 100 C -52 112, -100 76, -104 6 C -108 -70, -30 -92, 0 -62 Z', 351, v)} fill="#d94b3c" lift={0.9} />
    <path d="M -66 -22 C -60 -48, -42 -62, -24 -62" stroke="#f39a8c" strokeWidth={12} fill="none" strokeLinecap="round" />
    <path d="M 0 -62 C 0 -86, 6 -100, 14 -114" stroke="#6b4a2f" strokeWidth={9} fill="none" strokeLinecap="round" />
    <Paper d={tp('M 14 -98 C 34 -132, 80 -130, 84 -114 C 70 -92, 40 -86, 14 -98 Z', 352, v, 1.4)} fill={pal.leaf} lift={0.3} />
  </g>
);

export const WaterGlass = ({ v }: PropProps) => (
  <g>
    <Paper d={tp('M -72 -110 L 72 -110 L 58 112 L -58 112 Z', 361, v)} fill="#dcebf3" lift={0.9} />
    <Paper d={tp('M -64 -44 L 64 -44 L 54 104 L -54 104 Z', 362, v, 1.6)} fill="#8fc7ea" lift={0} />
    <path d="M -64 -44 C -30 -56, 30 -32, 64 -44" stroke="#c4e3f5" strokeWidth={8} fill="none" />
    <path d="M -46 -92 L -40 62" stroke="#ffffff" strokeWidth={10} strokeLinecap="round" opacity={0.8} />
  </g>
);

/** 참기름병 — 올리브유 병과 같은 모양, 갈색에 이름표만 다르다. */
export const SesameOil = (p: PropProps) => <Bottle {...p} fill="#9a6a2c" label="참기름" seed={371} />;

export const SoySauce = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={tp('M -30 -124 L 30 -124 L 30 -84 C 62 -70, 70 -44, 70 -16 L 70 110 C 70 126, -70 126, -70 110 L -70 -16 C -70 -44, -62 -70, -30 -84 Z', 381, v)} fill="#3b2a24" lift={1} />
    <Paper d={tr(-34, -146, 68, 30, 382, v, 1.4)} fill={pal.red} lift={0.2} />
    <Paper d={tr(-56, 4, 112, 60, 383, v, 1.8)} fill={pal.paper} lift={0.2} />
    <text data-deco="" x={0} y={46} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={34} fill={pal.ink}>
      간장
    </text>
  </g>
);

/** 볶는 팬 — 버섯 조각과 당근 채. */
export const StirFry = ({ pal, f, v }: PropProps) => (
  <g>
    <Steam x={-10} y={-20} s={0.9} f={f} />
    <g transform="rotate(-6)">
      <Paper d={tr(110, 8, 160, 28, 391, v)} fill={pal.wood} lift={0.6} />
    </g>
    <Paper d={te(0, 24, 132, 46, 392, v)} fill="#3b3f48" lift={1} />
    <Paper d={te(0, 16, 112, 34, 393, v, 1.8)} fill="#5a606c" lift={0} />
    {[
      { x: -58, y: 12, fill: '#a5683f' },
      { x: -14, y: 26, fill: '#f3e7d0' },
      { x: 28, y: 6, fill: '#a5683f' },
      { x: 64, y: 20, fill: '#f3e7d0' },
    ].map(({ x, y, fill }, i) => (
      <ellipse key={i} cx={x} cy={y} rx={21} ry={11} fill={fill} transform={`rotate(${i % 2 ? 14 : -12} ${x} ${y})`} />
    ))}
    {[
      { x: -34, y: 0, rot: 20 },
      { x: 6, y: 34, rot: -24 },
      { x: 46, y: 30, rot: 30 },
      { x: -76, y: 26, rot: -16 },
    ].map(({ x, y, rot }, i) => (
      <rect key={i} x={x - 16} y={y - 4} width={32} height={8} rx={3} fill="#f08a34" transform={`rotate(${rot} ${x} ${y})`} />
    ))}
  </g>
);

/** 비빔밥 한 그릇 — 검은 그릇에 밥, 색색 나물과 반으로 가른 달걀. */
export const Bibimbap = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={tp('M -124 -6 L 124 -6 C 118 70, 68 106, 0 106 C -68 106, -118 70, -124 -6 Z', 401, v)} fill="#4b4540" lift={0.9} />
    <path d="M -110 34 C -64 46, 64 46, 110 34" stroke="#6a625b" strokeWidth={8} fill="none" />
    <Paper d={tr(-46, 100, 92, 18, 402, v, 1.6)} fill="#4b4540" lift={0.3} />
    <Paper d={te(0, -8, 116, 36, 403, v)} fill="#efe2c4" lift={0} />
    <Paper d={te(-70, -10, 32, 17, 404, v, 1.4)} fill={pal.leaf} lift={0} />
    <Paper d={te(-30, -26, 30, 14, 405, v, 1.4)} fill="#f08a34" lift={0} />
    <Paper d={te(30, -26, 30, 14, 406, v, 1.4)} fill="#a5683f" lift={0} />
    <Paper d={te(70, -10, 32, 17, 407, v, 1.4)} fill="#f2cf4e" lift={0} />
    <Paper d={te(0, 2, 34, 20, 408, v, 1.4)} fill="#fffdf6" lift={0.2} />
    <circle cx={0} cy={2} r={11} fill="#f2b632" />
  </g>
);

// ── 칼슘 편(2026-11-11) — 유제품·멸치·잎채소 ──
/** 우유곽 — 흰 몸통에 파란 띠. face 를 주면 이름표 대신 얼굴(마무리 장면의 짝). */
export const Milk = ({ pal, f, v, face }: PropProps & { face?: Mood }) => (
  <g>
    <Paper d={tp('M -72 -66 L 0 -116 L 72 -66 Z', 411, v)} fill="#d9e4f2" lift={0.6} />
    <Paper d={tr(-14, -132, 28, 22, 412, v, 1.2)} fill="#c3d1e6" lift={0.2} />
    <Paper d={tr(-72, -68, 144, 192, 413, v)} fill="#f6f9fd" lift={1} />
    <Paper d={tr(-72, 52, 144, 44, 414, v, 1.6)} fill="#4f8fd6" lift={0} />
    {face ? (
      <Face x={0} y={-6} s={0.86} mood={face} f={f} pal={pal} seed={31} />
    ) : (
      <text data-deco="" x={0} y={12} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={46} fill="#2f5fa8">
        우유
      </text>
    )}
  </g>
);

/** 멸치 한 마리 — 은빛 몸에 꼬리. face 를 주면 눈 대신 얼굴. */
const Fish = ({ pal, f, v, seed, face }: PropProps & { seed: number; face?: Mood }) => (
  <g>
    <Paper d={tp('M 74 0 L 122 -36 L 110 0 L 122 36 Z', seed, v, 1.8)} fill="#8fa3bd" lift={0.4} />
    <Paper d={tp('M -112 0 C -92 -42, 40 -46, 86 0 C 40 46, -92 42, -112 0 Z', seed + 1, v)} fill="#b9c6d8" lift={0.8} />
    <path d="M -70 -22 C -30 -32, 30 -30, 66 -8" stroke="#eef2f7" strokeWidth={9} fill="none" strokeLinecap="round" />
    {face ? <Face x={-30} y={4} s={0.52} mood={face} f={f} pal={pal} seed={33} /> : <circle cx={-80} cy={-6} r={8} fill={pal.ink} />}
  </g>
);

/** 멸치 — 세 마리(목록·재료), face 를 주면 얼굴 있는 한 마리(마무리 장면의 짝). */
export const Anchovy = ({ face, ...p }: PropProps & { face?: Mood }) =>
  face ? (
    <g transform="rotate(-8)">
      <Fish {...p} seed={421} face={face} />
    </g>
  ) : (
    <g>
      <g transform="translate(-6 -58) rotate(-10) scale(0.8)">
        <Fish {...p} seed={421} />
      </g>
      <g transform="translate(10 6) rotate(6) scale(0.86)">
        <Fish {...p} seed={423} />
      </g>
      <g transform="translate(-10 66) rotate(-4) scale(0.74)">
        <Fish {...p} seed={425} />
      </g>
    </g>
  );

export const Kale = ({ v }: PropProps) => (
  <g transform="rotate(-12)">
    <Paper d={tp('M 0 116 C -40 96, -116 60, -104 -14 C -126 -40, -84 -98, -44 -84 C -30 -126, 30 -126, 44 -84 C 84 -98, 126 -40, 104 -14 C 116 60, 40 96, 0 116 Z', 431, v, 3.4)} fill="#2f7d4f" lift={0.9} />
    <path d="M 0 126 L 0 -70 M 0 42 L -56 -6 M 0 42 L 56 -6 M 0 -8 L -44 -52 M 0 -8 L 44 -52" stroke="#cfe6c4" strokeWidth={7} fill="none" strokeLinecap="round" />
  </g>
);

export const Tofu = ({ v }: PropProps) => (
  <g>
    <Paper d={tp('M -104 -30 L 96 -30 L 96 84 L -104 84 Z', 441, v)} fill="#f1e7d0" lift={0.9} />
    <Paper d={tp('M -104 -30 L -72 -76 L 124 -76 L 96 -30 Z', 442, v, 1.8)} fill="#fbf7ec" lift={0} />
    <Paper d={tp('M 96 -30 L 124 -76 L 124 40 L 96 84 Z', 443, v, 1.8)} fill="#e2d6ba" lift={0} />
    <path d="M -80 0 L 72 0 M -80 34 L 72 34" stroke="#e2d6ba" strokeWidth={5} strokeLinecap="round" />
  </g>
);

export const Yogurt = ({ pal, v }: PropProps) => (
  <g>
    <g transform="rotate(24 44 -60)">
      <Paper d={tr(37, -150, 14, 96, 454, v, 1.2)} fill={pal.silver} lift={0.3} />
    </g>
    <Paper d={tp('M -76 -52 L 76 -52 L 60 106 L -60 106 Z', 451, v)} fill="#f4f7fb" lift={0.9} />
    <Paper d={tr(-71, -6, 142, 52, 452, v, 1.6)} fill={pal.pink} lift={0} />
    <Paper d={te(0, -54, 80, 20, 453, v, 1.8)} fill="#fffdf6" lift={0.3} />
    <path d="M -34 -60 C -12 -74, 20 -72, 36 -58" stroke="#e6dfcc" strokeWidth={6} fill="none" strokeLinecap="round" />
  </g>
);

export const Scallion = ({ v }: PropProps) => (
  <g transform="rotate(32)">
    <Paper d={tp('M -16 6 L -42 -116 L -16 -124 L 0 -24 L 16 -124 L 42 -116 L 16 6 Z', 462, v, 2)} fill="#4f9a5a" lift={0.6} />
    <Paper d={tr(-16, 0, 32, 118, 461, v)} fill="#f4f2e4" lift={0.8} />
    <path d="M -10 118 L -16 132 M 0 120 L 0 136 M 10 118 L 16 132" stroke="#cfc8b0" strokeWidth={4} strokeLinecap="round" />
  </g>
);

/** 깨 한 종지. */
export const SesameSeed = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={te(0, 44, 116, 40, 471, v)} fill={pal.paper} lift={0.9} />
    <Paper d={tp('M -82 40 C -70 -6, 70 -6, 82 40 C 50 58, -50 58, -82 40 Z', 472, v, 1.8)} fill="#e6d3a0" lift={0} />
    {Array.from({ length: 16 }, (_, i) => {
      const a = ((i * 137.5) % 360) * (Math.PI / 180);
      const r = 0.25 + ((i * 0.618) % 1) * 0.7;
      const x = Math.cos(a) * 62 * r;
      const y = 28 + Math.sin(a) * 18 * r - 8;
      return <ellipse key={i} cx={x} cy={y} rx={7} ry={4} fill={i % 4 === 0 ? '#3a3330' : '#c2a05e'} transform={`rotate(${i * 47} ${x} ${y})`} />;
    })}
  </g>
);

/** 볶음밥 한 접시 — 밥 더미에 초록 잎·노란 달걀·은빛 멸치. */
export const FriedRice = ({ pal, v }: PropProps) => (
  <g>
    <Paper d={te(0, 48, 144, 46, 481, v)} fill={pal.paper} lift={1} />
    <Paper d={tp('M -104 44 C -100 -28, -50 -64, 0 -64 C 50 -64, 100 -28, 104 44 C 60 64, -60 64, -104 44 Z', 482, v)} fill="#efe2c4" lift={0.3} />
    {[
      { x: -56, y: 4, fill: '#2f7d4f' },
      { x: -8, y: -36, fill: '#2f7d4f' },
      { x: 44, y: -8, fill: '#2f7d4f' },
      { x: 12, y: 26, fill: '#2f7d4f' },
      { x: -30, y: -12, fill: '#f2c94c' },
      { x: 26, y: -40, fill: '#f2c94c' },
      { x: 62, y: 24, fill: '#f2c94c' },
      { x: -66, y: 34, fill: '#f2c94c' },
    ].map(({ x, y, fill }, i) => (
      <ellipse key={i} cx={x} cy={y} rx={16} ry={9} fill={fill} transform={`rotate(${i * 38} ${x} ${y})`} />
    ))}
    {[
      { x: -26, y: 30, rot: 16 },
      { x: 30, y: 8, rot: -24 },
      { x: -4, y: -10, rot: 40 },
    ].map(({ x, y, rot }, i) => (
      <path key={i} d={`M ${x - 16} ${y} L ${x + 16} ${y}`} stroke="#9fb0c6" strokeWidth={7} strokeLinecap="round" transform={`rotate(${rot} ${x} ${y})`} />
    ))}
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
