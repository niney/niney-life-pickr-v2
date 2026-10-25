// 등산 — 한국등산트레킹지원센터 100대명산 GPX(data.go.kr 15098177, Tranggle 1.1 형식) 해석·정리. 순수 함수만.
// docs/PLAN-hiking.md §0차 실측
//
// 원본 특성(2026-10-25 실측, 607코스):
//   - trk 에 이름이 없고 time 은 전부 같은 값 — 코스 이름은 지점 이름으로 만든다(nameCourse).
//   - trkseg 2~7개로 나뉜 코스 229개. 이어지는 조각 쌍 대부분이 50~600m 떨어져 있고(기록 끊김) 일부는 뒤집혀 있다
//     → 끝점이 가까운 조각부터 이어 붙이고(stitchPieces), 30m 안이면 하나로 합친다.
//   - 고도 튐: 누적 상승 2,500m 를 넘는 코스 10개(백운산(포천) 9,707m/11km). 전부 0 인 코스(대암산)도 있다.
//   - 방향이 섞여 있다(하산 방향 기록 95) → 편도는 낮은 끝에서 시작하게 뒤집는다.
//   - 노면 rtsc 는 유형별 spt~ept(전체 trkpt 1-based 순번) 범위이고 서로 겹친다(대부분 "그 노면이 처음·마지막으로
//     나온 곳" 정도의 범위) — 범위를 거리로만 바꿔 두고 해석은 화면이 한다.

const R = 6_371_000;
const rad = (d: number): number => (d * Math.PI) / 180;
export const distM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

// ── 해석 ──────────────────────────────────────────────────────────────────────

export interface GpxPoint {
  lat: number;
  lng: number;
  // 원본 고도(0 이하는 null — 측정 없음).
  ele: number | null;
  // 파일 전체 trkpt 순번(1-based) — 노면 범위가 이 번호를 쓴다.
  seq: number;
}
export interface GpxSignpost {
  dest: string;
  dir: string | null;
}
export interface GpxWaypoint {
  sym: string;
  lat: number;
  lng: number;
  ele: number | null;
  name: string | null;
  category: string;
  signposts: GpxSignpost[];
}
export interface GpxSurfaceRange {
  name: string;
  spt: number;
  ept: number;
}
export interface GpxParsed {
  waypoints: GpxWaypoint[];
  segments: GpxPoint[][];
  surfaces: GpxSurfaceRange[];
}

// 빈 값과 문자 그대로의 'null'(분류 336점이 이렇다)은 없음.
const cdata = (s: string | undefined): string | null => {
  if (s === undefined) return null;
  const v = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
  return v.length > 0 && v !== 'null' ? v : null;
};
const tag = (body: string, name: string): string | undefined =>
  new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(body)?.[1];
const eleOf = (raw: string | undefined): number | null => {
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};
// 이정표 목적지가 비어 있다는 표기 — 'null'·'NA'(목적지 없는 방향, 대개 걸어온 쪽 'NA;UT' 1,378개).
export const isEmptySignDest = (dest: string): boolean => /^(null|NA|N\/A)$/i.test(dest.trim());

// "목적지;코드" — 목적지나 코드가 비어 있다는 표기면 비어 있는 칸.
const parseSignpost = (raw: string | null): GpxSignpost | null => {
  if (!raw) return null;
  const [destRaw, dirRaw] = raw.split(';');
  const dest = destRaw?.trim();
  if (!dest || isEmptySignDest(dest)) return null;
  const dir = dirRaw?.trim();
  return { dest, dir: dir && dir !== 'null' ? dir : null };
};

export const parseGpx = (xml: string): GpxParsed => {
  const waypoints: GpxWaypoint[] = [];
  for (const m of xml.matchAll(/<wpt lat="([\d.-]+)" lon="([\d.-]+)">([\s\S]*?)<\/wpt>/g)) {
    const body = m[3]!;
    const sym = cdata(tag(body, 'sym'));
    if (!sym) continue;
    const signposts: GpxSignpost[] = [];
    for (let i = 1; i <= 4; i++) {
      const sp = parseSignpost(cdata(tag(body, `signpost${i}`)));
      if (sp) signposts.push(sp);
    }
    waypoints.push({
      sym,
      lat: Number(m[1]),
      lng: Number(m[2]),
      ele: eleOf(tag(body, 'ele')),
      name: cdata(tag(body, 'name'))?.replace(/\s+/g, ' ') ?? null,
      category: cdata(tag(body, 'category')) ?? 'NONE',
      signposts,
    });
  }
  let seq = 0;
  const segments: GpxPoint[][] = [];
  for (const s of xml.matchAll(/<trkseg>([\s\S]*?)<\/trkseg>/g)) {
    const pts: GpxPoint[] = [];
    for (const p of s[1]!.matchAll(/<trkpt lat="([\d.-]+)" lon="([\d.-]+)">\s*(?:<ele>([\d.-]+)<\/ele>)?/g)) {
      seq += 1;
      pts.push({ lat: Number(p[1]), lng: Number(p[2]), ele: eleOf(p[3]), seq });
    }
    if (pts.length > 0) segments.push(pts);
  }
  const surfaces: GpxSurfaceRange[] = [];
  for (const m of xml.matchAll(/<rtsc ([^>]*)>\s*<name>([\s\S]*?)<\/name>/g)) {
    const attr = (k: string): number => Number(new RegExp(`${k}="(\\d+)"`).exec(m[1]!)?.[1] ?? NaN);
    const name = cdata(m[2]);
    const spt = attr('spt');
    const ept = attr('ept');
    if (name && Number.isFinite(spt) && Number.isFinite(ept)) surfaces.push({ name, spt: Math.min(spt, ept), ept: Math.max(spt, ept) });
  }
  return { waypoints, segments, surfaces };
};

// ── 고도 정리 ──────────────────────────────────────────────────────────────────

// 30m 안에서 이 경사(고도차/수평거리)를 넘으면 튐으로 본다. 등산로 계단·암릉도 1(45°)을 오래 넘지 않는다.
const SPIKE_GRADE = 1;
const SPIKE_MIN_RUN_M = 10;
const MEDIAN_WINDOW = 5;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1]!;
};

// 한 줄(조각들을 이은 순서)의 고도를 정리 — null 은 앞뒤 보간, 튐은 버리고 보간, 끝으로 이동 중앙값.
// 고도가 하나도 없으면 null.
export const cleanElevations = (pts: readonly { lat: number; lng: number; ele: number | null }[]): number[] | null => {
  const n = pts.length;
  if (n === 0 || pts.every((p) => p.ele === null)) return null;
  const ele: (number | null)[] = pts.map((p) => p.ele);
  // 튐: 직전 유효 점 대비 경사가 SPIKE_GRADE 를 넘으면 버린다(유효 점 기준이라 연속 튐도 걸린다).
  let ref = ele.findIndex((e) => e !== null);
  for (let i = ref + 1; i < n; i++) {
    const e = ele[i];
    if (e === null || e === undefined) continue;
    const run = Math.max(distM(pts[ref]!, pts[i]!), SPIKE_MIN_RUN_M);
    if (Math.abs(e - ele[ref]!) / run > SPIKE_GRADE) ele[i] = null;
    else ref = i;
  }
  // 보간(앞쪽·뒤쪽 끝은 가장 가까운 값).
  const filled = new Array<number>(n);
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (ele[i] === null) continue;
    if (last === -1) for (let k = 0; k < i; k++) filled[k] = ele[i]!;
    else for (let k = last + 1; k < i; k++) filled[k] = ele[last]! + ((ele[i]! - ele[last]!) * (k - last)) / (i - last);
    filled[i] = ele[i]!;
    last = i;
  }
  for (let k = last + 1; k < n; k++) filled[k] = ele[last]!;
  const half = MEDIAN_WINDOW >> 1;
  return filled.map((_, i) => median(filled.slice(Math.max(0, i - half), Math.min(n, i + half + 1))));
};

// 5m 히스테리시스 누적 상승·하강.
export const gainLoss = (eles: readonly number[]): { gain: number; loss: number } => {
  let gain = 0;
  let loss = 0;
  let ref = eles[0];
  if (ref === undefined) return { gain, loss };
  for (const e of eles) {
    const d = e - ref;
    if (d >= 5) {
      gain += d;
      ref = e;
    } else if (d <= -5) {
      loss -= d;
      ref = e;
    }
  }
  return { gain: Math.round(gain), loss: Math.round(loss) };
};

// ── 조각 잇기·방향 ────────────────────────────────────────────────────────────

// 이 거리 안의 조각은 한 줄로 합친다(같은 길의 기록 끊김이 아니라 점 간격 수준).
export const JOIN_GAP_M = 30;

export interface StitchResult<P> {
  pieces: P[][];
  // pieces[i] 와 pieces[i+1] 사이 직선거리(JOIN_GAP_M 초과만 남는다).
  gaps: number[];
}

// 첫 조각에서 시작해, 지금 줄 끝에 가장 가까운 끝점을 가진 조각을 (필요하면 뒤집어) 잇는다.
export const stitchPieces = <P extends { lat: number; lng: number }>(segments: readonly P[][]): StitchResult<P> => {
  const rest = segments.filter((s) => s.length > 0).map((s) => [...s]);
  if (rest.length === 0) return { pieces: [], gaps: [] };
  const chain: P[][] = [rest.shift()!];
  const gaps: number[] = [];
  while (rest.length > 0) {
    const tail = chain[chain.length - 1]!.at(-1)!;
    let best = 0;
    let bestD = Infinity;
    let bestRev = false;
    rest.forEach((s, i) => {
      const dHead = distM(tail, s[0]!);
      const dTail = distM(tail, s.at(-1)!);
      if (dHead < bestD) [best, bestD, bestRev] = [i, dHead, false];
      if (dTail < bestD) [best, bestD, bestRev] = [i, dTail, true];
    });
    const next = rest.splice(best, 1)[0]!;
    if (bestRev) next.reverse();
    if (bestD <= JOIN_GAP_M) chain[chain.length - 1]!.push(...next);
    else {
      chain.push(next);
      gaps.push(Math.round(bestD));
    }
  }
  return { pieces: chain, gaps };
};

export const reverseStitch = <P>(s: StitchResult<P>): StitchResult<P> => ({
  pieces: [...s.pieces].reverse().map((p) => [...p].reverse()),
  gaps: [...s.gaps].reverse(),
});

// ── 선 단순화(Douglas–Peucker, 평면 근사) ──────────────────────────────────────

export const simplifyLine = <P extends { lat: number; lng: number }>(pts: readonly P[], toleranceM: number): P[] => {
  if (pts.length <= 2) return [...pts];
  const ref = pts[0]!;
  const kx = 111_320 * Math.cos(rad(ref.lat));
  const ky = 110_540;
  const xy = pts.map((p) => [(p.lng - ref.lng) * kx, (p.lat - ref.lat) * ky] as const);
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a]!;
    const [bx, by] = xy[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let far = -1;
    let farD = toleranceM;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i]!;
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > farD) [far, farD] = [i, d];
    }
    if (far !== -1) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
};

// ── 코스 만들기 ────────────────────────────────────────────────────────────────

export const PROFILE_STEP_M = 20;
export const LINE_TOLERANCE_M = 4;
// 시작·끝이 이 안이면 원점회귀.
export const LOOP_M = 300;
// 편도에서 시작이 끝보다 이만큼 높으면 뒤집는다(평지 코스가 오락가락 뒤집히지 않게).
const REVERSE_MIN_DROP_M = 30;
// 코스 이름에 쓰는 끝점 지점 반경.
const END_NAME_M = 300;
// 코스 지점 연결 — 선에서 이보다 멀면 그 코스 지점이 아니다(GPX 의 "○○에서 버스탑승" 같은 안내용 점).
export const COURSE_POI_M = 200;

export interface BuiltPoint {
  lat: number;
  lng: number;
  ele: number | null;
  // 시작에서의 거리(끊김 직선거리는 넣지 않는다).
  atM: number;
}
export interface BuiltSurface {
  type: string;
  fromM: number;
  toM: number;
}
// loop 원점회귀 · summit 정상(고도 최고점)에서 끝나는 편도(같은 길로 내려온다) · traverse 넘어가는 편도.
export type CourseShape = 'loop' | 'summit' | 'traverse';

export interface BuiltCourse {
  pieces: BuiltPoint[][];
  gaps: number[];
  lengthM: number;
  hasElevation: boolean;
  gainM: number | null;
  lossM: number | null;
  minEle: number | null;
  maxEle: number | null;
  start: BuiltPoint;
  end: BuiltPoint;
  // 고도 최고점(고도 없으면 null).
  top: BuiltPoint | null;
  isLoop: boolean;
  shape: CourseShape;
  reversed: boolean;
  profile: { d: number[]; e: number[] };
  surfaces: BuiltSurface[];
  bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  // 이동 분(Tobler, 휴식·피로 보정 전) — 시작→끝 / 끝→시작. 고도 없으면 null.
  moveMin: number | null;
  moveRevMin: number | null;
  // 가장 가파른 500m 의 평균 경사(%, 오르내림 무관). 고도가 없거나 500m 넘는 조각이 없으면 null.
  steepPct: number | null;
}

// ── 예상 시간(이동 분)·가파름 ───────────────────────────────────────────────────
// docs/PLAN-hiking.md §2차 — Tobler(1993) 보행 함수 v = 6·e^(−3.5·|경사+0.05|) km/h 를 조각마다 20m 표본으로 더한다.
// 경사는 ±0.5 에서 자른다(그보다 가파르면 속도가 0 으로 무너진다 — 계단·암릉의 짧은 구간). 끊긴 곳은 거리처럼 넣지
// 않는다 — 직선으로 넣어 보니 기록이 엉뚱한 곳으로 튄 끊김(한라산 관음사 쪽 5.7km)이 있어 안내 시간보다 47% 길어졌다.
// 휴식·피로 보정은 @repo/utils estimateHikingMinutes — 보정값을 바꿔도 다시 적재하지 않게 여기서는 이동 분만 낸다.
export const TOBLER_GRADE_CAP = 0.5;
export const toblerMinutes = (runM: number, riseM: number): number => {
  if (runM <= 0) return 0;
  const g = Math.max(-TOBLER_GRADE_CAP, Math.min(TOBLER_GRADE_CAP, riseM / runM));
  return (runM / 1000 / (6 * Math.exp(-3.5 * Math.abs(g + 0.05)))) * 60;
};

// 한 조각을 step 간격(끝점 포함)으로 다시 뽑은 거리·고도.
const resamplePiece = (piece: readonly BuiltPoint[], step: number): { d: number[]; e: number[] } => {
  const out = { d: [] as number[], e: [] as number[] };
  const first = piece[0];
  if (!first || first.ele === null) return out;
  const from = first.atM;
  const to = piece.at(-1)!.atM;
  let k = 0;
  for (let s = from; ; s = Math.min(s + step, to)) {
    while (k < piece.length - 2 && piece[k + 1]!.atM < s) k++;
    const a = piece[k]!;
    const b = piece[k + 1] ?? a;
    const t = b.atM > a.atM ? Math.min(1, Math.max(0, (s - a.atM) / (b.atM - a.atM))) : 0;
    out.d.push(s - from);
    out.e.push(a.ele! + (b.ele! - a.ele!) * t);
    if (s >= to) break;
  }
  return out;
};

export const moveMinutes = (pieces: readonly BuiltPoint[][]): { fwd: number; rev: number } | null => {
  if (pieces.length === 0 || pieces.some((p) => p.some((x) => x.ele === null))) return null;
  let fwd = 0;
  let rev = 0;
  for (const piece of pieces) {
    const r = resamplePiece(piece, PROFILE_STEP_M);
    for (let j = 1; j < r.d.length; j++) {
      const run = r.d[j]! - r.d[j - 1]!;
      const rise = r.e[j]! - r.e[j - 1]!;
      fwd += toblerMinutes(run, rise);
      rev += toblerMinutes(run, -rise);
    }
  }
  return { fwd, rev };
};

const STEEP_WINDOW_M = 500;
// 끊김을 건너 재면 직선 몇 km 의 고도차가 한 표본에 들어가 141% 같은 값이 나온다 — 조각 안에서만.
export const steepestPct = (pieces: readonly BuiltPoint[][]): number | null => {
  const w = STEEP_WINDOW_M / PROFILE_STEP_M;
  let best: number | null = null;
  for (const piece of pieces) {
    const r = resamplePiece(piece, PROFILE_STEP_M);
    for (let i = 0; i + w < r.d.length; i++) {
      const g = Math.abs(r.e[i + w]! - r.e[i]!) / (r.d[i + w]! - r.d[i]!);
      if (best === null || g > best) best = g;
    }
  }
  return best === null ? null : Math.round(best * 100);
};

// GPX 하나 → 정리된 코스. 트랙 점이 2개 미만이면 null.
export const buildCourse = (parsed: GpxParsed): BuiltCourse | null => {
  let stitched = stitchPieces(parsed.segments);
  const flat = stitched.pieces.flat();
  if (flat.length < 2) return null;
  const eles = cleanElevations(flat);
  const eleBySeq = new Map<number, number>();
  if (eles) flat.forEach((p, i) => eleBySeq.set(p.seq, eles[i]!));

  const first = stitched.pieces[0]![0]!;
  const lastPt = stitched.pieces.at(-1)!.at(-1)!;
  const isLoop = distM(first, lastPt) <= LOOP_M;
  let reversed = false;
  if (!isLoop && eles) {
    if ((eleBySeq.get(first.seq) ?? 0) - (eleBySeq.get(lastPt.seq) ?? 0) >= REVERSE_MIN_DROP_M) {
      stitched = reverseStitch(stitched);
      reversed = true;
    }
  }

  // 거리 누적 + 순번 → 거리(노면 범위용).
  const atBySeq = new Map<number, number>();
  let at = 0;
  // 끊김(조각 사이 직선거리)은 거리에 넣지 않는다 — 조각 첫 점은 앞 조각 끝과 같은 거리.
  const pieces: BuiltPoint[][] = stitched.pieces.map((piece) => {
    const out: BuiltPoint[] = [];
    piece.forEach((p, i) => {
      if (i > 0) at += distM(piece[i - 1]!, p);
      atBySeq.set(p.seq, at);
      out.push({ lat: p.lat, lng: p.lng, ele: eles ? (eleBySeq.get(p.seq) ?? null) : null, atM: at });
    });
    return out;
  });
  const lengthM = Math.round(at);
  const all = pieces.flat();
  const cleaned = all.map((p) => p.ele).filter((e): e is number => e !== null);
  const gl = eles ? gainLoss(cleaned) : null;

  // 고도 프로필 — PROFILE_STEP_M 간격 선형 보간(끝점 포함).
  const profile = { d: [] as number[], e: [] as number[] };
  if (eles) {
    let k = 0;
    for (let s = 0; ; s = Math.min(s + PROFILE_STEP_M, lengthM)) {
      while (k < all.length - 2 && all[k + 1]!.atM < s) k++;
      const a = all[k]!;
      const b = all[k + 1] ?? a;
      const t = b.atM > a.atM ? Math.min(1, Math.max(0, (s - a.atM) / (b.atM - a.atM))) : 0;
      profile.d.push(Math.round(s));
      profile.e.push(Math.round(a.ele! + (b.ele! - a.ele!) * t));
      if (s >= lengthM) break;
    }
  }

  const surfaces: BuiltSurface[] = [];
  for (const r of parsed.surfaces) {
    const a = atBySeq.get(r.spt);
    const b = atBySeq.get(r.ept);
    if (a === undefined || b === undefined) continue;
    surfaces.push({ type: r.name, fromM: Math.round(Math.min(a, b)), toM: Math.round(Math.max(a, b)) });
  }
  surfaces.sort((x, y) => x.fromM - y.fromM || x.toM - y.toM);

  let top: BuiltPoint | null = null;
  if (eles) for (const p of all) if (!top || p.ele! > top.ele!) top = p;
  const move = eles ? moveMinutes(pieces) : null;
  const shape: CourseShape = isLoop ? 'loop' : top && top.atM >= lengthM - END_NAME_M ? 'summit' : 'traverse';

  const bbox = { minLat: Infinity, minLng: Infinity, maxLat: -Infinity, maxLng: -Infinity };
  for (const p of all) {
    bbox.minLat = Math.min(bbox.minLat, p.lat);
    bbox.maxLat = Math.max(bbox.maxLat, p.lat);
    bbox.minLng = Math.min(bbox.minLng, p.lng);
    bbox.maxLng = Math.max(bbox.maxLng, p.lng);
  }

  return {
    pieces,
    gaps: stitched.gaps,
    lengthM,
    hasElevation: eles !== null,
    gainM: gl?.gain ?? null,
    lossM: gl?.loss ?? null,
    minEle: eles ? Math.min(...cleaned) : null,
    maxEle: eles ? Math.max(...cleaned) : null,
    start: all[0]!,
    end: all.at(-1)!,
    top,
    isLoop,
    shape,
    reversed,
    profile,
    surfaces,
    bbox,
    moveMin: move ? Math.round(move.fwd * 10) / 10 : null,
    moveRevMin: move ? Math.round(move.rev * 10) / 10 : null,
    steepPct: eles ? steepestPct(pieces) : null,
  };
};

// 지점 → 코스 위 최근접 거리(atM)와 떨어진 거리. 조각마다 평면 근사 투영.
export const projectOnCourse = (
  course: Pick<BuiltCourse, 'pieces'>,
  p: { lat: number; lng: number },
): { atM: number; offM: number } => {
  let best = { atM: 0, offM: Infinity };
  const kx = 111_320 * Math.cos(rad(p.lat));
  const ky = 110_540;
  for (const piece of course.pieces) {
    for (let i = 0; i < piece.length; i++) {
      const a = piece[i]!;
      const b = piece[i + 1] ?? a;
      const ax = (a.lng - p.lng) * kx;
      const ay = (a.lat - p.lat) * ky;
      const dx = (b.lng - a.lng) * kx;
      const dy = (b.lat - a.lat) * ky;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
      const off = Math.hypot(ax + t * dx, ay + t * dy);
      if (off < best.offM) best = { atM: a.atM + (b.atM - a.atM) * t, offM: off };
    }
  }
  return { atM: Math.round(best.atM), offM: best.offM };
};

// ── 코스 이름 ──────────────────────────────────────────────────────────────────

// 이름 후보 지점 — 그 GPX 의 웨이포인트(이름이 비면 병합된 API 이름) + 코스 가까이의 API 지점. GpxWaypoint 도 된다.
export interface NamedPoint {
  category: string;
  name: string | null;
  lat: number;
  lng: number;
  ele: number | null;
  // 병합된 지점의 출처 — 'api' 에만 있는 이름은 같은 자리 GPX 이름보다 뒤로(표기가 덜 다듬어진 경우가 많다).
  source?: 'gpx' | 'api' | 'both';
}

// 끝점 이름 후보 분류(순서 = 우선순위).
const END_CATEGORIES = ['ENTRY', 'TRANS', 'PARK', 'SHELTER', 'CULTURAL'] as const;
// 위에서 못 찾을 때 더 가까이(END_NAME_FALLBACK_M)에서 보는 분류 — 이름이 "천정탐방지원센터"·"허덕교 화장실"·
// "서성재" 처럼 자리 이름을 담고 있는 경우가 있다(뒤에 붙은 시설 이름은 뗀다).
const END_FALLBACK_CATEGORIES = ['INFO', 'SIGN', 'REST', 'SPRING', 'TOILET'] as const;
const END_NAME_FALLBACK_M = 150;
const FACILITY_SUFFIX = /\s*(종합안내도|안내도|안내판|이정표|화장실|쉼터)$/;
// 보조 분류 이름은 자리 이름 꼴일 때만("허덕교"·"서성재"·"입암분소" — "벤취"·"나무의자"·"이정표와"는 아니다).
const PLACE_TAIL =
  /^.{2,}(마을|리|동|사|암|교|재|령|고개|골|계곡|폭포|봉|산|센터|분소|지킴터|매표소|주차장|정류장|정류소|역|휴게소|공원|약수터|약수|광장|입구|저수지|댐|대피소|산장|휴양림|삼거리|사거리|갈림길|안부)$/;
// 이름으로 쓰기엔 뜻이 없는 지점 이름 — 번호가 붙은 것("갈림길 10"·"웨이포인트 25")과 위치 번호 표지도.
const GENERIC_NAME =
  /^(갈림길|이정표|정상|정상석|정산석|산정상|삼각점|안내|안내판|안내도|화장실|주차장|버스|버스정류장|버스정류소|정류장|정류소|교통|지하철|입구|들머리|날머리|쉼터|탐방로|탐방로 입구|등산로|등산|삼거리|사거리|안부|능선|계곡|약수터|공터|벤치|벤취|의자|정자|평상|카페|매점|식당|관광자원|웨이포인트)(\s*[\d-]+)?$/;
const MARKER_NAME = /^(현위치번호|국가위치번호|국가지점번호|위치번호|지점번호)/;
// "북한산국립공원"처럼 공원 이름뿐인 것 — 코스 끝을 가리키지 못한다("북한산국립공원 정릉"은 된다).
export const isGenericPlaceName = (name: string): boolean => GENERIC_NAME.test(name) || MARKER_NAME.test(name) || /(국립|도립|군립)공원$/.test(name);
// 깨지거나 장소가 아닌 이름 — 자모가 남은 것("승강ㅈ1ㆍㅇ"), 음절 하나뿐인 것("정3" — 번호 봉우리 "656봉"은 된다),
// 시설·회사("전기자동차충전소"·"가평운수"·"김천시내버스").
const JAMO = /[ㄱ-ㆎ]/;
const NOT_PLACE = /(충전소|운수|시내버스)$/;
export const isJunkPlaceName = (name: string): boolean =>
  JAMO.test(name) || ((name.match(/[가-힣]/g)?.length ?? 0) < 2 && !/^\d+봉$/.test(name)) || NOT_PLACE.test(name);

// 원본 이름의 군더더기 — "용연사(버스 ID 01833)", "성당리 지방도(오늘산행 날머리)", "능강교코스 들머리", 높이·날짜·한자
// ("등선봉 해발632m", "삼악산 용화봉(654m)", "월출산 천황봉 20200921", "비봉(碑峰)"), 정상석 표기("신선봉 정상석" → 신선봉,
// "신불산정상" → 신불산 정상), 대시 대신 쓴 자모("소요산 ㅡ 의상대").
export const cleanPlaceName = (name: string): string =>
  name
    .replace(/\(?\s*버스\s*ID\s*\d+\s*\)?/gi, ' ')
    .replace(/\([^)]*(들머리|날머리|산행|표지석)[^)]*\)/g, ' ')
    .replace(/\([^)]*[一-鿿][^)]*\)/g, ' ')
    .replace(/\(?\s*(해발\s*)?\d[\d,]*(\.\d+)?\s*m\s*\)?/gi, ' ')
    .replace(/\s\d{8}$/, ' ')
    .replace(/\s[ㄱ-ㆎ]\s/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s.,·]+$/, '')
    .trim()
    .replace(/^(들머리|날머리|출발지|도착지|출발|도착)\s+/, '')
    .replace(/\s+(들머리|날머리)$/, '')
    .replace(/([가-힣])\s*정상석$/, '$1')
    .replace(/([가-힣]{2,})정상$/, '$1 정상');

const endNameOf = (p: { lat: number; lng: number }, wpts: readonly NamedPoint[]): string | null => {
  const pick = (categories: readonly string[], maxM: number, clean: (n: string) => string): string | null => {
    let best: { rank: number; d: number; name: string } | null = null;
    for (const w of wpts) {
      if (!w.name) continue;
      const rank = categories.indexOf(w.category);
      if (rank === -1) continue;
      const name = clean(cleanPlaceName(w.name));
      if (name.length < 2 || isGenericPlaceName(name) || isJunkPlaceName(name)) continue;
      const d = distM(p, w);
      if (d > maxM) continue;
      if (!best || rank < best.rank || (rank === best.rank && d < best.d)) best = { rank, d, name };
    }
    return best?.name ?? null;
  };
  return (
    pick(END_CATEGORIES, END_NAME_M, (n) => n) ??
    pick(END_FALLBACK_CATEGORIES, END_NAME_FALLBACK_M, (n) => {
      const core = n.replace(FACILITY_SUFFIX, '').trim();
      return PLACE_TAIL.test(core) && !/국립공원$/.test(core) ? core : '';
    })
  );
};

// 정상 이름 — 코스 선에서 COURSE_POI_M 안의 PEAK 중 고도 최고점에 가장 가까운 것(300m 안), 없으면 그중 가장 높은 것.
// 코스가 지나지 않는 봉우리(파일에 같이 들어 있는 다른 코스의 정상)는 쓰지 않는다. 이름이 '정상'뿐이면 산 이름을 붙인다.
// API 에만 있는 봉우리 이름은 이만큼 더 먼 것으로 친다 — 같은 자리 표기가 둘이면 GPX 쪽("장불재" · API "장블재").
const API_PEAK_PENALTY_M = 100;
// 봉우리 이름이 이것뿐이면 산 이름을 붙인다.
const SUMMIT_ONLY = /^(정상|정상석|정산석|산정상)$/;
const peakNameOf = (course: BuiltCourse, wpts: readonly NamedPoint[], mountainName: string): string | null => {
  const usable = (raw: string): boolean => {
    const n = cleanPlaceName(raw);
    return !isJunkPlaceName(n) && (SUMMIT_ONLY.test(n) || !isGenericPlaceName(n));
  };
  const peaks = wpts.filter((w) => w.category === 'PEAK' && w.name && usable(w.name) && projectOnCourse(course, w).offM <= COURSE_POI_M);
  if (peaks.length === 0) return null;
  const target = course.top;
  let pick: NamedPoint | null = null;
  if (target) {
    let bestScore = Infinity;
    for (const w of peaks) {
      const d = distM(target, w);
      if (d > END_NAME_M) continue;
      const score = d + (w.source === 'api' ? API_PEAK_PENALTY_M : 0);
      if (score < bestScore) [pick, bestScore] = [w, score];
    }
  }
  if (!pick) pick = peaks.reduce((a, b) => ((b.ele ?? 0) > (a.ele ?? 0) ? b : a));
  const name = cleanPlaceName(pick.name!);
  return SUMMIT_ONLY.test(name) ? `${mountainName} 정상` : name;
};

export interface CourseNames {
  name: string;
  source: 'points' | 'number';
  startName: string | null;
  endName: string | null;
  peakName: string | null;
}

export const nameCourse = (course: BuiltCourse, wpts: readonly NamedPoint[], mountainName: string, no: number): CourseNames => {
  const startName = endNameOf(course.start, wpts);
  const endName = course.isLoop ? startName : endNameOf(course.end, wpts);
  const peakName = peakNameOf(course, wpts, mountainName);
  // 끝이 정상이면(편도 오르기만) 끝 이름 대신 정상.
  const endIsPeak = course.top !== null && course.top.atM >= course.lengthM - END_NAME_M;
  const parts: string[] = [];
  if (startName) parts.push(startName);
  if (peakName && !parts.includes(peakName)) parts.push(peakName);
  let name: string;
  if (course.isLoop) {
    // "들머리 ↺ 정상" / 하나뿐이면 "○○ 원점회귀".
    name = parts.length >= 2 ? parts.join(' ↺ ') : parts[0] ? `${parts[0]} 원점회귀` : '';
  } else {
    if (endName && !endIsPeak && !parts.includes(endName)) parts.push(endName);
    // 이름 하나뿐이면 무엇인지 붙인다 — 들머리만 "○○ 출발", 정상만 "○○ 코스", 끝만 "○○ 도착".
    if (parts.length >= 2) name = parts.join(' → ');
    else if (parts[0] === undefined) name = '';
    else if (parts[0] === startName) name = `${parts[0]} 출발`;
    else if (parts[0] === peakName) name = `${parts[0]} 코스`;
    else name = `${parts[0]} 도착`;
  }
  return name
    ? { name, source: 'points', startName, endName, peakName }
    : { name: `코스 ${no}`, source: 'number', startName, endName, peakName };
};

// ── 이정표 안내 ────────────────────────────────────────────────────────────────
// 이정표 방향 코드는 조사자가 걸어온 방향 기준이다(2차 실측: 'UT' 목적지가 지나온 쪽 지점과 맞은 것 1,666 · 앞쪽 373,
// 앞쪽 목적지의 코드별 꺾인 각도 중앙값 ST 1° · BR 17° · TR 32° · BL −22° · TL −40°). 하산 방향 기록을 뒤집은 코스나
// 다른 출처(API) 이정표는 화살표가 거꾸로일 수 있어, 코스마다 "가는 길(next)·온 길(prev)"을 따로 정한다.
//   1. 이름 — 목적지가 코스 앞쪽 지점(정상 포함)에만 맞으면 next, 뒤쪽에만 맞으면 prev(가장 가까운 것 하나씩).
//   2. 방향 코드 — 그 GPX 의 이정표라 기록 방향을 알 때만 비어 있는 쪽을 채운다. 같은 방향이면 UT=prev, 코스가
//      꺾인 각도에 가장 가까운 코드=next. 뒤집은 코스면 UT=next, 반대로 꺾인 각도에 가까운 코드=prev.

export type SignWay = 'next' | 'prev';
export interface SignGuide {
  dest: string;
  dir: string | null;
  way: SignWay | null;
}

// 코드 → 걸어온 방향 기준 각도(오른쪽 +). B* 는 비스듬히, S* 는 크게 꺾임(실측 표본이 적어 근사).
const SIGN_DIR_DEG: Record<string, number> = { ST: 0, BR: 45, TR: 90, SR: 135, UT: 180, SL: -135, TL: -90, BL: -45 };
const SIGN_DIR_MATCH_DEG = 60;
// 이정표 바로 옆(이 거리 안)의 지점은 앞뒤를 가르지 않는다.
const SIGN_NEAR_M = 30;
// 꺾인 각도를 재는 앞뒤 거리.
const TURN_SPAN_M = 30;

const compact = (s: string): string => s.replace(/[\s()·.,]/g, '');
// 지점 이름에서 시설 꼬리를 뗀 핵심("해인사주차장" → "해인사").
const PLACE_SUFFIX = /(탐방지원센터|탐방안내소|탐방로입구|탐방로|안내소|주차장|매표소|버스정류장|정류장|정류소|버스종점|입구|분소|휴게소|광장)$/;
const placeCore = (s: string): string => {
  const c = compact(s);
  return c.replace(PLACE_SUFFIX, '') || c;
};
// 목적지 문구 → 비교할 이름들. "상왕봉 .진행방향" · "칠불봉(200m)" · "도봉산역, 도봉탐방지원센터" · "상왕봉.칠불봉".
export const signDestNames = (dest: string): string[] =>
  dest
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\d+(?:\.\d+)?\s*(?:km|m|키로|미터)/gi, ' ')
    .replace(/(?:진행|하산|등산)\s*방향|방면|가는\s*길/g, ' ')
    .split(/[,./·]/)
    .map((s) => s.replace(/\s+/g, ''))
    .filter((s) => s.length >= 2 && !isEmptySignDest(s));
const SUMMIT_WORDS = new Set(['정상', '산정상']);

const bearingDeg = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180) / Math.PI;
};
const angleDiff = (a: number, b: number): number => {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
};
const pointOnPiece = (piece: readonly BuiltPoint[], atM: number): { lat: number; lng: number } | null => {
  if (piece.length === 0 || atM < piece[0]!.atM || atM > piece.at(-1)!.atM) return null;
  for (let i = 1; i < piece.length; i++) {
    const a = piece[i - 1]!;
    const b = piece[i]!;
    if (b.atM < atM) continue;
    const t = b.atM > a.atM ? (atM - a.atM) / (b.atM - a.atM) : 0;
    return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  }
  return piece.at(-1)!;
};

// atM 자리에서 코스가 꺾이는 각도(도, 오른쪽 +, 시작→끝 방향). 앞뒤 TURN_SPAN_M 이 같은 조각에 없으면 null.
export const turnAt = (course: Pick<BuiltCourse, 'pieces'>, atM: number): number | null => {
  for (const piece of course.pieces) {
    const here = pointOnPiece(piece, atM);
    if (!here) continue;
    const before = pointOnPiece(piece, atM - TURN_SPAN_M);
    const after = pointOnPiece(piece, atM + TURN_SPAN_M);
    if (!before || !after) return null;
    return angleDiff(bearingDeg(here, after), bearingDeg(before, here));
  }
  return null;
};

export interface SignGuideInput {
  signposts: readonly GpxSignpost[];
  atM: number;
  // 코스 위 이름 있는 지점(일반 이름은 뺀다) — 앞뒤 판정.
  named: readonly { name: string; atM: number }[];
  mountainName: string;
  // 정상(고도 최고점) 자리 — '정상'·산 이름 목적지.
  topAtM: number | null;
  // 이 GPX 의 이정표면 코스가 기록 방향 그대로인지(true)·뒤집혔는지(false). 다른 출처면 null(방향 코드를 안 쓴다).
  sameFrame: boolean | null;
  // turnAt 결과(시작→끝 방향).
  turnDeg: number | null;
}

export const guideSignposts = (input: SignGuideInput): SignGuide[] => {
  const mountain = compact(input.mountainName);
  const entries = input.signposts
    .filter((s) => !isEmptySignDest(s.dest))
    .map((s) => {
      let ahead = Infinity;
      let behind = Infinity;
      const see = (pos: number) => {
        const d = pos - input.atM;
        if (d > SIGN_NEAR_M) ahead = Math.min(ahead, d);
        else if (d < -SIGN_NEAR_M) behind = Math.min(behind, -d);
      };
      for (const alt of signDestNames(s.dest)) {
        if (SUMMIT_WORDS.has(alt) || alt === mountain || alt === `${mountain}정상`) {
          if (input.topAtM !== null) see(input.topAtM);
          continue;
        }
        for (const n of input.named) {
          const pn = compact(n.name);
          const pc = placeCore(n.name);
          if (pn.includes(alt) || (pc.length >= 2 && alt.includes(pc))) see(n.atM);
        }
      }
      return { s, ahead, behind };
    });
  const way: (SignWay | null)[] = entries.map(() => null);
  const nearest = (side: 'ahead' | 'behind', other: 'ahead' | 'behind'): number => {
    let best = -1;
    entries.forEach((e, i) => {
      if (e[side] === Infinity || e[other] !== Infinity) return;
      if (best === -1 || e[side] < entries[best]![side]) best = i;
    });
    return best;
  };
  const next = nearest('ahead', 'behind');
  const prev = nearest('behind', 'ahead');
  if (next !== -1) way[next] = 'next';
  if (prev !== -1 && prev !== next) way[prev] = 'prev';

  if (input.sameFrame !== null) {
    const backWay: SignWay = input.sameFrame ? 'prev' : 'next';
    const turnWay: SignWay = input.sameFrame ? 'next' : 'prev';
    // 이름이 반대쪽을 가리키는 목적지에는 방향 코드로 정하지 않는다(앞쪽 지점 이름과 맞는데 "온 길"이 되지 않게).
    const against = (e: (typeof entries)[number], w: SignWay): boolean => (w === 'next' ? e.behind !== Infinity : e.ahead !== Infinity);
    const ut = entries.findIndex((e) => e.s.dir === 'UT');
    if (ut !== -1 && way[ut] === null && !way.includes(backWay) && !against(entries[ut]!, backWay)) way[ut] = backWay;
    if (input.turnDeg !== null && !way.includes(turnWay)) {
      // 기록 방향 기준으로 꺾인 각도 — 뒤집힌 코스면 반대 방향(각도 부호가 바뀐다).
      const turn = input.sameFrame ? input.turnDeg : -input.turnDeg;
      let best = -1;
      let bestD = SIGN_DIR_MATCH_DEG;
      entries.forEach((e, i) => {
        const deg = e.s.dir ? SIGN_DIR_DEG[e.s.dir] : undefined;
        if (deg === undefined || e.s.dir === 'UT' || way[i] !== null || against(e, turnWay)) return;
        const d = Math.abs(angleDiff(deg, turn));
        if (d <= bestD) [best, bestD] = [i, d];
      });
      if (best !== -1) way[best] = turnWay;
    }
  }
  return entries.map((e, i) => ({ dest: e.s.dest, dir: e.s.dir, way: way[i]! }));
};
