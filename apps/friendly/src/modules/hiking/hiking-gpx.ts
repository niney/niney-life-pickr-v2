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
// "목적지;코드" — 목적지나 코드가 'null' 문자열이면 비어 있는 칸.
const parseSignpost = (raw: string | null): GpxSignpost | null => {
  if (!raw) return null;
  const [destRaw, dirRaw] = raw.split(';');
  const dest = destRaw?.trim();
  if (!dest || dest === 'null') return null;
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
  reversed: boolean;
  profile: { d: number[]; e: number[] };
  surfaces: BuiltSurface[];
  bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number };
}

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
    reversed,
    profile,
    surfaces,
    bbox,
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

// 끝점 이름 후보 분류(순서 = 우선순위). INFO(이정표·구조목·안내도)·TOILET 은 이름이 대개 설명이라 뺀다.
const END_CATEGORIES = ['ENTRY', 'TRANS', 'PARK', 'SHELTER', 'CULTURAL'] as const;
// 이름으로 쓰기엔 뜻이 없는 지점 이름.
const GENERIC_NAME =
  /^(갈림길|이정표|정상|안내|안내판|안내도|화장실|주차장|버스|버스정류장|버스정류소|정류장|정류소|입구|들머리|날머리|쉼터|탐방로|탐방로 입구|현위치번호|국가위치번호|국가지점번호)$/;

// 원본 이름의 군더더기 — "용연사(버스 ID 01833)", "성당리 지방도(오늘산행 날머리)", "능강교코스 들머리".
export const cleanPlaceName = (name: string): string =>
  name
    .replace(/\(?\s*버스\s*ID\s*\d+\s*\)?/gi, ' ')
    .replace(/\([^)]*(들머리|날머리|산행)[^)]*\)/g, ' ')
    .replace(/^(들머리|날머리|출발지|도착지|출발|도착)\s+/, '')
    .replace(/\s+(들머리|날머리)$/, '')
    .replace(/\s+/g, ' ')
    .trim();

const endNameOf = (p: { lat: number; lng: number }, wpts: readonly GpxWaypoint[]): string | null => {
  let best: { rank: number; d: number; name: string } | null = null;
  for (const w of wpts) {
    if (!w.name) continue;
    const rank = (END_CATEGORIES as readonly string[]).indexOf(w.category);
    if (rank === -1) continue;
    const name = cleanPlaceName(w.name);
    if (!name || GENERIC_NAME.test(name)) continue;
    const d = distM(p, w);
    if (d > END_NAME_M) continue;
    if (!best || rank < best.rank || (rank === best.rank && d < best.d)) best = { rank, d, name };
  }
  return best?.name ?? null;
};

// 정상 이름 — 코스 선에서 COURSE_POI_M 안의 PEAK 중 고도 최고점에 가장 가까운 것(300m 안), 없으면 그중 가장 높은 것.
// 코스가 지나지 않는 봉우리(파일에 같이 들어 있는 다른 코스의 정상)는 쓰지 않는다. 이름이 '정상'뿐이면 산 이름을 붙인다.
const peakNameOf = (course: BuiltCourse, wpts: readonly GpxWaypoint[], mountainName: string): string | null => {
  const peaks = wpts.filter((w) => w.category === 'PEAK' && w.name && projectOnCourse(course, w).offM <= COURSE_POI_M);
  if (peaks.length === 0) return null;
  const target = course.top;
  let pick: GpxWaypoint | null = null;
  if (target) {
    let bestD = END_NAME_M;
    for (const w of peaks) {
      const d = distM(target, w);
      if (d <= bestD) [pick, bestD] = [w, d];
    }
  }
  if (!pick) pick = peaks.reduce((a, b) => ((b.ele ?? 0) > (a.ele ?? 0) ? b : a));
  const name = cleanPlaceName(pick.name!);
  return /^정상$/.test(name) ? `${mountainName} 정상` : name;
};

export interface CourseNames {
  name: string;
  source: 'points' | 'number';
  startName: string | null;
  endName: string | null;
  peakName: string | null;
}

export const nameCourse = (course: BuiltCourse, wpts: readonly GpxWaypoint[], mountainName: string, no: number): CourseNames => {
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
