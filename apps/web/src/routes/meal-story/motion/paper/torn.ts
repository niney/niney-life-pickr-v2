import { rand } from '../anim';
import { TEMPO } from '../theme';

// 찢긴 종이 가장자리 — 모양(사각형·타원·경로)의 둘레를 고르게 찍어 바깥으로 들쭉날쭉 밀어 낸 다각형 경로.
// 그릴 때마다 계산하지 않고 모양·씨앗별로 한 번만 만들어 둔다(SVG 변형 필터는 휴대폰에서 매 프레임 비싸다).
// 기법 참고: cth9191/animate styles/cut-paper(MIT) — 가장자리는 낮은 주파수의 굴곡 + 잔 톱니.

type Pt = readonly [number, number];

export interface TornOptions {
  seed?: number;
  /** 굴곡 크기(px). */
  amp?: number;
  /** 둘레를 찍는 간격(px). */
  step?: number;
}

const cache = new Map<string, string>();
const memo = (key: string, make: () => string): string => {
  const hit = cache.get(key);
  if (hit) return hit;
  const d = make();
  if (cache.size > 4000) cache.clear();
  cache.set(key, d);
  return d;
};

// 둘레를 한 바퀴 도는 값 잡음(−1~1) — 끝과 처음이 이어진다.
const loopNoise = (t: number, seed: number, cells: number): number => {
  const x = t * cells;
  const i = Math.floor(x);
  const f = x - i;
  const a = rand(seed + (i % cells) * 7.13) * 2 - 1;
  const b = rand(seed + ((i + 1) % cells) * 7.13) * 2 - 1;
  const s = f * f * (3 - 2 * f);
  return a + (b - a) * s;
};

const toPath = (pts: Pt[]): string =>
  `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z`;

/** 둘레 점들(바깥 법선 포함)을 찢긴 가장자리로. */
const tear = (outline: { p: Pt; n: Pt }[], perimeter: number, o: TornOptions): string => {
  const seed = o.seed ?? 1;
  const amp = o.amp ?? 3;
  const cells = Math.max(6, Math.round(perimeter / 46));
  const pts = outline.map(({ p, n }, i) => {
    const t = i / outline.length;
    const wobble = loopNoise(t, seed, cells) * amp;
    const teeth = (rand(seed * 3.7 + i * 1.31) - 0.5) * amp * 0.9;
    const k = wobble + teeth;
    return [p[0] + n[0] * k, p[1] + n[1] * k] as const;
  });
  return toPath(pts);
};

/** 찢긴 사각형(모서리는 살짝 무른다). */
export const tornRect = (x: number, y: number, w: number, h: number, o: TornOptions = {}): string =>
  memo(`r|${x}|${y}|${w}|${h}|${o.seed}|${o.amp}|${o.step}`, () => {
    const step = o.step ?? 7;
    const outline: { p: Pt; n: Pt }[] = [];
    const side = (x0: number, y0: number, x1: number, y1: number, n: Pt) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const k = Math.max(2, Math.round(len / step));
      for (let i = 0; i < k; i += 1) outline.push({ p: [x0 + ((x1 - x0) * i) / k, y0 + ((y1 - y0) * i) / k], n });
    };
    side(x, y, x + w, y, [0, -1]);
    side(x + w, y, x + w, y + h, [1, 0]);
    side(x + w, y + h, x, y + h, [0, 1]);
    side(x, y + h, x, y, [-1, 0]);
    return tear(outline, 2 * (w + h), o);
  });

/** 찢긴 타원(원). */
export const tornEllipse = (cx: number, cy: number, rx: number, ry: number, o: TornOptions = {}): string =>
  memo(`e|${cx}|${cy}|${rx}|${ry}|${o.seed}|${o.amp}|${o.step}`, () => {
    const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const k = Math.max(16, Math.round(perimeter / (o.step ?? 7)));
    const outline = Array.from({ length: k }, (_, i) => {
      const a = (i / k) * Math.PI * 2;
      const p: Pt = [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
      const nx = Math.cos(a) / rx;
      const ny = Math.sin(a) / ry;
      const l = Math.hypot(nx, ny) || 1;
      return { p, n: [nx / l, ny / l] as Pt };
    });
    return tear(outline, perimeter, o);
  });

// ── SVG 경로(M·L·C·Q·Z, 절대 좌표) 고르게 찍기 ──
const parse = (d: string): { cmd: string; v: number[] }[] => {
  const out: { cmd: string; v: number[] }[] = [];
  const re = /([MLCQZ])([^MLCQZ]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const v = (m[2] ?? '')
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    out.push({ cmd: m[1]!.toUpperCase(), v });
  }
  return out;
};

const sampleOutline = (d: string): Pt[] => {
  const pts: Pt[] = [];
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  const pushLine = (a: Pt, b: Pt) => {
    const k = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
    for (let i = 0; i < k; i += 1) pts.push([a[0] + ((b[0] - a[0]) * i) / k, a[1] + ((b[1] - a[1]) * i) / k]);
  };
  for (const { cmd, v } of parse(d)) {
    if (cmd === 'M') {
      cur = [v[0]!, v[1]!];
      start = cur;
    } else if (cmd === 'L') {
      for (let i = 0; i + 1 < v.length; i += 2) {
        const next: Pt = [v[i]!, v[i + 1]!];
        pushLine(cur, next);
        cur = next;
      }
    } else if (cmd === 'C') {
      for (let i = 0; i + 5 < v.length; i += 6) {
        const [x1, y1, x2, y2, x, y] = v.slice(i, i + 6) as [number, number, number, number, number, number];
        const k = 40;
        for (let s = 0; s < k; s += 1) {
          const t = s / k;
          const u = 1 - t;
          pts.push([
            u * u * u * cur[0] + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
            u * u * u * cur[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
          ]);
        }
        cur = [x, y];
      }
    } else if (cmd === 'Q') {
      for (let i = 0; i + 3 < v.length; i += 4) {
        const [x1, y1, x, y] = v.slice(i, i + 4) as [number, number, number, number];
        const k = 30;
        for (let s = 0; s < k; s += 1) {
          const t = s / k;
          const u = 1 - t;
          pts.push([u * u * cur[0] + 2 * u * t * x1 + t * t * x, u * u * cur[1] + 2 * u * t * y1 + t * t * y]);
        }
        cur = [x, y];
      }
    } else if (cmd === 'Z') {
      pushLine(cur, start);
      cur = start;
    }
  }
  return pts;
};

/** 찢긴 경로 — 어떤 닫힌 경로든(숟가락·병). */
export const tornPath = (d: string, o: TornOptions = {}): string =>
  memo(`p|${d}|${o.seed}|${o.amp}|${o.step}`, () => {
    const raw = sampleOutline(d);
    // 길이로 고르게 다시 찍는다.
    const lens = [0];
    for (let i = 1; i < raw.length; i += 1) lens.push(lens[i - 1]! + Math.hypot(raw[i]![0] - raw[i - 1]![0], raw[i]![1] - raw[i - 1]![1]));
    const total = lens[lens.length - 1]! + Math.hypot(raw[0]![0] - raw[raw.length - 1]![0], raw[0]![1] - raw[raw.length - 1]![1]);
    const k = Math.max(16, Math.round(total / (o.step ?? 7)));
    const even: Pt[] = [];
    let j = 0;
    for (let i = 0; i < k; i += 1) {
      const target = (i / k) * total;
      while (j < lens.length - 1 && lens[j + 1]! < target) j += 1;
      const a = raw[j]!;
      const b = raw[(j + 1) % raw.length]!;
      const seg = (lens[j + 1] ?? total) - lens[j]!;
      const f = seg > 0 ? (target - lens[j]!) / seg : 0;
      even.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    // 바깥 법선 — 둘레 방향(시계·반시계)에 맞춰.
    let area = 0;
    for (let i = 0; i < even.length; i += 1) {
      const a = even[i]!;
      const b = even[(i + 1) % even.length]!;
      area += a[0] * b[1] - b[0] * a[1];
    }
    const sign = area > 0 ? 1 : -1;
    const outline = even.map((p, i) => {
      const a = even[(i - 1 + even.length) % even.length]!;
      const b = even[(i + 1) % even.length]!;
      const tx = b[0] - a[0];
      const ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      return { p, n: [(sign * ty) / l, (-sign * tx) / l] as Pt };
    });
    return tear(outline, total, o);
  });

/** 2프레임(실제)마다 바뀌는 세 가지 가장자리 — 종이가 살짝 떨린다. 장면 시계(설계 프레임)를 받는다. */
export const boil = (designFrame: number): number => Math.floor((designFrame * TEMPO) / 2) % 3;
