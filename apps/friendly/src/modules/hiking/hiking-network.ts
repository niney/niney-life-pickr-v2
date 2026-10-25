// 등산로 망 → 코스(6차). 전국 주요 봉우리 GPX(15108086)의 여러 조각 파일 3,128개는 봉우리 둘레 구간 묶음이다(조각 끝이 다른
// 조각 가운데에 붙는다 — hiking-gpx isTrailNetwork). 갈림길에서 조각을 잘라 그래프로 잇고, 끝이 막힌 낮은 끝(들머리 후보)에서
// 정상(망에서 가장 높은 점)까지 가장 짧은 길로 왕복 코스를, 갈래가 다른 두 들머리로 넘어가는(또는 한 바퀴 도는) 코스를 하나 만든다.
// 순수 함수. docs/PLAN-hiking.md §6차

import { LineGrid, PointGrid, overlapShare } from './hiking-grid.js';
import { cleanElevations, distM, type GpxPoint } from './hiking-gpx.js';

// 이 안의 점은 같은 자리(조각 끝끼리·조각 끝과 다른 조각 가운데).
const TOUCH_M = 15;
// 조각 끝에서 이보다 먼 점이어야 그 조각을 가운데서 자른다.
const INTERIOR_M = 30;
// 들머리 후보 — 정상까지 길이 이만큼은 되고, 정상보다 이만큼은 낮은 끝.
const MIN_APPROACH_M = 500;
const MIN_DROP_M = 50;
// 왕복 코스 수(낮은 들머리부터, 앞서 고른 길과 80% 넘게 겹치면 건너뛴다)·넘어가기 코스 수.
export const NETWORK_MAX_SUMMIT_COURSES = 4;
const SAME_PATH_SHARE = 0.8;
const SAME_PATH_M = 20;
// 넘어가기 — 두 들머리 길이 이만큼 덜 겹쳐야(정상 근처를 빼고) 다른 갈래다.
const CROSS_MAX_SHARE = 0.3;

export interface NetPoint {
  lat: number;
  lng: number;
  ele: number | null;
}

export interface NetworkResult {
  // 코스 점열(들머리 → … → 끝). 왕복은 들머리 → 정상, 넘어가기는 들머리 → 정상 → 다른 들머리.
  paths: { kind: 'summit' | 'cross'; points: NetPoint[] }[];
  summit: NetPoint | null;
  // 세 갈래 이상 모이는 자리(갈림길).
  junctions: (NetPoint & { degree: number })[];
}

interface Edge {
  a: number;
  b: number;
  points: NetPoint[];
  lengthM: number;
}

const lineLength = (pts: readonly NetPoint[]): number => {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += distM(pts[i - 1]!, pts[i]!);
  return s;
};

// 조각마다 고도 정리(튐 버리고 보간·이동 중앙값) — 조각끼리는 따로(끊긴 곳을 건너 보간하지 않게).
const cleanSegment = (seg: readonly GpxPoint[]): NetPoint[] => {
  const eles = cleanElevations(seg);
  return seg.map((p, i) => ({ lat: p.lat, lng: p.lng, ele: eles ? eles[i]! : null }));
};

// isAvoided — 정상 후보에서 뺄 점(다른 봉우리 정상 근처). 망은 봉우리 둘레 구간 묶음이라 옆 봉우리 정상이 더 높으면 그쪽을 정상으로
// 잡는다(수락산 망의 가장 높은 점이 도솔봉 17m 옆). 다 빠지면 망에서 가장 높은 점.
export const coursesFromNetwork = (segments: readonly GpxPoint[][], isAvoided?: (p: NetPoint) => boolean): NetworkResult => {
  const segs = segments.filter((s) => s.length >= 2).map(cleanSegment);
  const empty: NetworkResult = { paths: [], summit: null, junctions: [] };
  if (segs.length === 0) return empty;

  // 1. 자를 자리 — 조각 끝이 다른 조각 가운데(끝에서 INTERIOR_M 넘게)에 TOUCH_M 안으로 닿는 곳.
  const grid = new PointGrid<{ s: number; i: number }>(TOUCH_M);
  segs.forEach((seg, s) => seg.forEach((p, i) => grid.add(p.lat, p.lng, { s, i })));
  const splits = segs.map((seg) => new Set<number>([0, seg.length - 1]));
  segs.forEach((seg, s) => {
    for (const end of [seg[0]!, seg.at(-1)!]) {
      const best = new Map<number, { i: number; d: number }>();
      for (const { value } of grid.near(end.lat, end.lng, TOUCH_M)) {
        if (value.s === s) continue;
        const d = distM(end, segs[value.s]![value.i]!);
        if (d > TOUCH_M) continue;
        const cur = best.get(value.s);
        if (!cur || d < cur.d) best.set(value.s, { i: value.i, d });
      }
      for (const [s2, { i }] of best) {
        const other = segs[s2]!;
        if (distM(other[i]!, other[0]!) > INTERIOR_M && distM(other[i]!, other.at(-1)!) > INTERIOR_M) splits[s2]!.add(i);
      }
    }
  });

  // 2. 정상 — 망에서 가장 높은 점(고도가 없으면 정상도 코스도 못 만든다).
  let summitAt: { s: number; i: number; ele: number } | null = null;
  let highest: { s: number; i: number; ele: number } | null = null;
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s]!;
    for (let i = 0; i < seg.length; i++) {
      const ele = seg[i]!.ele;
      if (ele === null) continue;
      if (!highest || ele > highest.ele) highest = { s, i, ele };
      if ((!summitAt || ele > summitAt.ele) && !isAvoided?.(seg[i]!)) summitAt = { s, i, ele };
    }
  }
  summitAt ??= highest;
  if (!summitAt) return empty;
  splits[summitAt.s]!.add(summitAt.i);

  // 3. 자른 조각 = 간선, 간선 끝을 TOUCH_M 안끼리 묶어 마디로.
  const raw: { points: NetPoint[] }[] = [];
  let summitEdgeEnd: { e: number; end: 'a' | 'b' } | null = null;
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s]!;
    const cuts = [...splits[s]!].sort((x, y) => x - y);
    for (let k = 0; k + 1 < cuts.length; k++) {
      const from = cuts[k]!;
      const to = cuts[k + 1]!;
      if (to <= from) continue;
      if (s === summitAt.s && from === summitAt.i) summitEdgeEnd = { e: raw.length, end: 'a' };
      if (s === summitAt.s && to === summitAt.i) summitEdgeEnd = { e: raw.length, end: 'b' };
      raw.push({ points: seg.slice(from, to + 1) });
    }
  }
  if (raw.length === 0 || !summitEdgeEnd) return empty;

  const endGrid = new PointGrid<number>(TOUCH_M);
  const endPts: NetPoint[] = [];
  raw.forEach((r) => {
    for (const p of [r.points[0]!, r.points.at(-1)!]) {
      endGrid.add(p.lat, p.lng, endPts.length);
      endPts.push(p);
    }
  });
  const parent = endPts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  endPts.forEach((p, i) => {
    for (const { value: j } of endGrid.near(p.lat, p.lng, TOUCH_M)) if (j !== i && distM(p, endPts[j]!) <= TOUCH_M) parent[find(i)] = find(j);
  });
  const nodeOf = new Map<number, number>();
  const nodePt: NetPoint[] = [];
  const node = (endIndex: number): number => {
    const root = find(endIndex);
    let n = nodeOf.get(root);
    if (n === undefined) {
      n = nodePt.length;
      nodeOf.set(root, n);
      nodePt.push(endPts[root]!);
    }
    return n;
  };
  const edges: Edge[] = raw.map((r, e) => ({ a: node(e * 2), b: node(e * 2 + 1), points: r.points, lengthM: lineLength(r.points) }));
  const summitNode = summitEdgeEnd.end === 'a' ? edges[summitEdgeEnd.e]!.a : edges[summitEdgeEnd.e]!.b;

  const adj = nodePt.map(() => [] as number[]);
  edges.forEach((e, k) => {
    if (e.a === e.b) return;
    adj[e.a]!.push(k);
    adj[e.b]!.push(k);
  });

  // 4. 정상에서 가장 짧은 길(다익스트라 — 마디가 수백이라 단순 배열로).
  const dist = nodePt.map(() => Infinity);
  const via = nodePt.map(() => -1);
  const done = nodePt.map(() => false);
  dist[summitNode] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i]! < Infinity && (u === -1 || dist[i]! < dist[u]!)) u = i;
    if (u === -1) break;
    done[u] = true;
    for (const k of adj[u]!) {
      const e = edges[k]!;
      const v = e.a === u ? e.b : e.a;
      if (dist[u]! + e.lengthM < dist[v]!) {
        dist[v] = dist[u]! + e.lengthM;
        via[v] = k;
      }
    }
  }
  // 마디 → 정상 점열(그 마디에서 시작해 정상에서 끝난다).
  const pathToSummit = (n: number): NetPoint[] => {
    const out: NetPoint[] = [];
    let cur = n;
    while (cur !== summitNode) {
      const e = edges[via[cur]!]!;
      const forward = e.a === cur;
      const pts = forward ? e.points : [...e.points].reverse();
      out.push(...(out.length > 0 ? pts.slice(1) : pts));
      cur = forward ? e.b : e.a;
    }
    return out;
  };

  const summitPt = segs[summitAt.s]![summitAt.i]!;
  const degree = adj.map((list) => list.length);
  const candidates = nodePt
    .map((p, n) => ({ n, p }))
    .filter(({ n, p }) => degree[n] === 1 && dist[n]! >= MIN_APPROACH_M && dist[n]! < Infinity && p.ele !== null && p.ele <= summitAt.ele - MIN_DROP_M)
    .sort((x, y) => x.p.ele! - y.p.ele! || dist[x.n]! - dist[y.n]!);

  const chosen: NetPoint[][] = [];
  const chosenGrid = new LineGrid<number>(10, 5);
  for (const { n } of candidates) {
    if (chosen.length >= NETWORK_MAX_SUMMIT_COURSES) break;
    const path = pathToSummit(n);
    if (path.length < 2) continue;
    if (chosen.length > 0 && overlapShare([path], chosenGrid, 1, SAME_PATH_M) >= SAME_PATH_SHARE) continue;
    chosen.push(path);
    chosenGrid.addLine(path, 1);
  }

  const paths: NetworkResult['paths'] = chosen.map((points) => ({ kind: 'summit', points }));
  // 넘어가기 — 정상 근처(400m)를 뺀 두 길이 가장 덜 겹치는 쌍. 들머리가 300m 안이면 한 바퀴(hiking-gpx 가 원점회귀로 본다).
  let bestPair: { i: number; j: number; share: number } | null = null;
  for (let i = 0; i < chosen.length; i++) {
    for (let j = i + 1; j < chosen.length; j++) {
      const gj = new LineGrid<number>(10, 5);
      gj.addLine(chosen[j]!, 1);
      const away = chosen[i]!.filter((p) => distM(p, summitPt) > 400);
      if (away.length < 2) continue;
      const share = overlapShare([away], gj, 1, SAME_PATH_M);
      if (share < CROSS_MAX_SHARE && (!bestPair || share < bestPair.share)) bestPair = { i, j, share };
    }
  }
  if (bestPair) {
    const up = chosen[bestPair.i]!;
    const down = [...chosen[bestPair.j]!].reverse();
    paths.push({ kind: 'cross', points: [...up, ...down.slice(1)] });
  }

  const junctions = nodePt.flatMap((p, n) => (degree[n]! >= 3 ? [{ ...p, degree: degree[n]! }] : []));
  return { paths, summit: summitPt, junctions };
};
