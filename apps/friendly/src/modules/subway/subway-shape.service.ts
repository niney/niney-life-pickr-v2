// 노선 실형상(OSM 선로 기하) 조립 — 순수 로직(단위 테스트 대상). I/O(Overpass·DB)
// 는 scripts/load-subway-shapes.ts 가 담당한다.
//
// 입력은 OSM route relation 의 way 좌표열 목록. way 는 순서·방향이 뒤섞여 올 수
// 있어 끝점 일치(동일 노드 → 동일 좌표)로 체인을 조립하고, 소규모 간극은 직선
// 브리지로 잇는다. 조립된 체인에 section 역들을 투영해 호길이 anchor(stationS)를
// 얻는다 — locateTrain 의 "역 i 호길이" 가 cum[i] 대신 이 anchor 로 대체된다.
import {
  approxDistanceM,
  createRoutePathIndex,
  projectOnRoutePath,
  sliceRoutePath,
  type LatLng,
} from '@repo/utils';

// 역→형상 최대 허용 거리(m) — 초과 역이 있으면 그 후보 relation 은 탈락.
// (역 좌표는 역사 중심, 형상은 선로 중심선이라 수십 m 오차는 정상. 서울역처럼
// 역 부지가 거대한 곳은 300m대 실측 — 오매칭은 커버리지+단조 검증이 걸러 상한을
// 여유 있게 둔다.)
export const STATION_MAX_DIST_M = 400;
// way 간극 직선 브리지 상한(m) — OSM 데이터 소규모 단절 허용, 초과는 조립 중단.
export const BRIDGE_MAX_GAP_M = 300;
// 순환 링 닫힘 판정(m) — 첫·끝점이 이보다 멀면 마지막에 첫점을 덧대 닫는다.
const LOOP_CLOSE_EPS_M = 5;

export interface AssembledChain {
  pts: LatLng[];
  // 직선 브리지 횟수/총 길이(m) — 리포트용(과다하면 데이터 품질 의심).
  bridges: number;
  bridgedM: number;
  // 체인에 못 이은 way 수 — 지선/측선 잔여일 수 있어 실패가 아니다(커버리지가 판정).
  unusedWays: number;
}

const keyOf = (p: LatLng): string => `${p.lat.toFixed(7)},${p.lng.toFixed(7)}`;

type Attach =
  | { at: 'tail'; rev: boolean }
  | { at: 'head'; rev: boolean };

// 체인 한쪽 끝에 seg 를 잇는다(중복 조인트 점 제거). rev 는 seg 를 뒤집어 붙임.
const attachSeg = (chain: LatLng[], seg: LatLng[], how: Attach, bridged: boolean): void => {
  const s = how.rev ? [...seg].reverse() : seg;
  if (how.at === 'tail') {
    const from = bridged ? 0 : 1; // 브리지가 아니면 조인트 점 중복 제거.
    for (let i = from; i < s.length; i++) chain.push(s[i]!);
  } else {
    const upto = bridged ? s.length : s.length - 1;
    chain.unshift(...s.slice(0, upto));
  }
};

interface ExtendState {
  bridges: number;
  bridgedM: number;
}

// 그리디 확장 — 체인 양끝에 정확 일치(동일 노드) way 를 반복해 잇고, 실패 시
// 상한 이내 최근접 끝점 직선 브리지. 더 못 이으면 중단(잔여는 남긴다).
const greedyExtend = (chain: LatLng[], remaining: LatLng[][], st8: ExtendState): void => {
  for (;;) {
    const head = chain[0]!;
    const tail = chain[chain.length - 1]!;
    const headKey = keyOf(head);
    const tailKey = keyOf(tail);
    let hit = -1;
    let how: Attach | null = null;
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i]!;
      const sh = keyOf(s[0]!);
      const st = keyOf(s[s.length - 1]!);
      if (sh === tailKey) { hit = i; how = { at: 'tail', rev: false }; break; }
      if (st === tailKey) { hit = i; how = { at: 'tail', rev: true }; break; }
      if (st === headKey) { hit = i; how = { at: 'head', rev: false }; break; }
      if (sh === headKey) { hit = i; how = { at: 'head', rev: true }; break; }
    }
    let bridged = false;
    if (hit === -1) {
      // 정확 일치 없음 — 상한 이내 최근접 끝점 브리지.
      let best = { d: Infinity, i: -1, how: null as Attach | null };
      for (let i = 0; i < remaining.length; i++) {
        const s = remaining[i]!;
        const cands: { d: number; how: Attach }[] = [
          { d: approxDistanceM(tail, s[0]!), how: { at: 'tail', rev: false } },
          { d: approxDistanceM(tail, s[s.length - 1]!), how: { at: 'tail', rev: true } },
          { d: approxDistanceM(head, s[s.length - 1]!), how: { at: 'head', rev: false } },
          { d: approxDistanceM(head, s[0]!), how: { at: 'head', rev: true } },
        ];
        for (const c of cands) {
          if (c.d < best.d) best = { d: c.d, i, how: c.how };
        }
      }
      if (best.i === -1 || best.d > BRIDGE_MAX_GAP_M) return;
      hit = best.i;
      how = best.how;
      st8.bridges += 1;
      st8.bridgedM += best.d;
      bridged = true;
    }
    attachSeg(chain, remaining[hit]!, how!, bridged);
    remaining.splice(hit, 1);
  }
};

// member 순서 우선 조립 — OSM route relation 의 way 순서는 통행 순서라, 같은
// 지점을 두 번 지나는 형상(6호선 응암 루프)도 순서대로 tail 에 이으면 보존된다.
// (그리디 양끝 매칭만 쓰면 재방문 분기점에서 지선을 건너뛰는 오조립이 난다.)
const assembleOrdered = (segs: LatLng[][]): AssembledChain => {
  const chain = [...segs[0]!];
  const st8: ExtendState = { bridges: 0, bridgedM: 0 };
  const leftovers: LatLng[][] = [];
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i]!;
    const sh = keyOf(s[0]!);
    const st = keyOf(s[s.length - 1]!);
    const tailKey = keyOf(chain[chain.length - 1]!);
    const headKey = keyOf(chain[0]!);
    // tail(통행 진행 방향) 우선 — 재방문 분기점에서 순서를 지키는 핵심.
    if (sh === tailKey) {
      attachSeg(chain, s, { at: 'tail', rev: false }, false);
    } else if (st === tailKey) {
      attachSeg(chain, s, { at: 'tail', rev: true }, false);
    } else if (st === headKey) {
      attachSeg(chain, s, { at: 'head', rev: false }, false);
    } else if (sh === headKey) {
      attachSeg(chain, s, { at: 'head', rev: true }, false);
    } else {
      const tail = chain[chain.length - 1]!;
      const d0 = approxDistanceM(tail, s[0]!);
      const d1 = approxDistanceM(tail, s[s.length - 1]!);
      const d = Math.min(d0, d1);
      if (d <= BRIDGE_MAX_GAP_M) {
        attachSeg(chain, s, { at: 'tail', rev: d1 < d0 }, true);
        st8.bridges += 1;
        st8.bridgedM += d;
      } else {
        leftovers.push(s);
      }
    }
  }
  greedyExtend(chain, leftovers, st8);
  return { pts: chain, bridges: st8.bridges, bridgedM: st8.bridgedM, unusedWays: leftovers.length };
};

// 그리디 전용 조립(시작 way 지정) — 순서 조립이 막힐 때의 재시도 경로.
const assembleFrom = (segs: LatLng[][], startIdx: number): AssembledChain => {
  const remaining = segs.map((s, i) => (i === startIdx ? null : s)).filter((s): s is LatLng[] => s !== null);
  const chain = [...segs[startIdx]!];
  const st8: ExtendState = { bridges: 0, bridgedM: 0 };
  greedyExtend(chain, remaining, st8);
  return { pts: chain, bridges: st8.bridges, bridgedM: st8.bridgedM, unusedWays: remaining.length };
};

const chainLengthM = (pts: LatLng[]): number => {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) sum += approxDistanceM(pts[i - 1]!, pts[i]!);
  return sum;
};

// 조립 진입점 — member 순서 조립 우선, 잔여가 남으면(측선 시작·순서 뒤섞임 등)
// 그리디 다중 시작으로 재시도해 가장 긴 체인을 채택한다.
export const assembleChain = (segsIn: LatLng[][]): AssembledChain | null => {
  const segs = segsIn.filter((s) => s.length >= 2);
  if (segs.length === 0) return null;
  let best = assembleOrdered(segs);
  if (best.unusedWays > 0) {
    let bestLen = chainLengthM(best.pts);
    for (let i = 0; i < segs.length; i++) {
      const cand = assembleFrom(segs, i);
      const len = chainLengthM(cand.pts);
      if (len > bestLen) {
        best = cand;
        bestLen = len;
      }
      if (cand.unusedWays === 0) break;
    }
  }
  return best;
};

export interface AnchoredShape {
  // 최종 형상 — 비순환은 [첫 역, 끝 역] 구간으로 트림, 순환은 닫힌 링 전체.
  path: LatLng[];
  // stations 입력 순서와 정렬된 형상 호길이(m).
  stationS: number[];
  maxDistM: number;
  meanDistM: number;
}

export type AnchorResult =
  | ({ ok: true } & AnchoredShape)
  | { ok: false; reason: string };

type PathIndex = NonNullable<ReturnType<typeof createRoutePathIndex>>;

// 같은 지점을 두 번 지나는 형상(6호선 응암 루프)에선 최근접 s 가 두 곳이라
// 시작 후보 병합 반경보다 먼 국소 최근접들을 전부 수집한다.
const CANDIDATE_MERGE_M = 300;

// p 의 형상 위 국소 최근접 후보 전부 — 임계 이내 (s, dist) 를 s 순으로 수집하고
// 재방문 구간 구분(간격 > CANDIDATE_MERGE_M)별 최적만 남긴다.
const projectCandidates = (
  index: PathIndex,
  p: LatLng,
  maxDistM: number,
): { s: number; distM: number }[] => {
  const { points, xs, ys, cum } = index;
  const ref = points[0]!;
  const mPerLngDeg = 111_320 * Math.cos((ref.lat * Math.PI) / 180);
  const px = (p.lng - ref.lng) * mPerLngDeg;
  const py = (p.lat - ref.lat) * 111_320;
  const hits: { s: number; distM: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const ax = xs[i]!;
    const ay = ys[i]!;
    const dx = xs[i + 1]! - ax;
    const dy = ys[i + 1]! - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    if (d <= maxDistM) hits.push({ s: cum[i]! + Math.sqrt(len2) * t, distM: d });
  }
  hits.sort((a, b) => a.s - b.s);
  const out: { s: number; distM: number }[] = [];
  for (const h of hits) {
    const last = out[out.length - 1];
    if (last && h.s - last.s <= CANDIDATE_MERGE_M) {
      if (h.distM < last.distM) out[out.length - 1] = h;
    } else {
      out.push(h);
    }
  }
  return out;
};

// 한 방향(orientation)의 비순환 anchor 시도 — 첫 역은 국소 최근접 후보를 모두
// 시작점으로 시도(재방문 형상에서 두 번째 통과점에 붙는 오배치 방지), 이후 역은
// 순차 윈도우 투영(직전 s 이후 -30m 마진, 버스 정류소 투영과 동일 접근).
const tryLinear = (pts: LatLng[], stations: LatLng[]): AnchorResult => {
  const index = createRoutePathIndex(pts);
  if (!index) return { ok: false, reason: '형상 점 부족' };
  const firstCands = projectCandidates(index, stations[0]!, STATION_MAX_DIST_M);
  if (firstCands.length === 0) {
    const g = projectOnRoutePath(index, stations[0]!);
    return { ok: false, reason: `역 이탈 max=${Math.round(g.distM)}m (idx 0)` };
  }
  let best: AnchorResult | null = null;
  let firstFail: string | null = null;
  for (const first of firstCands) {
    const proj = [first];
    for (let i = 1; i < stations.length; i++) {
      proj.push(projectOnRoutePath(index, stations[i]!, Math.max(0, proj[i - 1]!.s - 30)));
    }
    const attempt = ((): AnchorResult => {
      const dists = proj.map((p) => p.distM);
      const maxDistM = Math.max(...dists);
      if (maxDistM > STATION_MAX_DIST_M) {
        const worst = dists.indexOf(maxDistM);
        return { ok: false, reason: `역 이탈 max=${Math.round(maxDistM)}m (idx ${worst})` };
      }
      const s0 = proj[0]!.s;
      const s1 = proj[proj.length - 1]!.s;
      if (s1 <= s0) return { ok: false, reason: '역순 투영(끝 역 ≤ 첫 역)' };
      const stationS = proj.map((p) => Math.min(Math.max(p.s - s0, 0), s1 - s0));
      for (let i = 1; i < stationS.length; i++) {
        if (stationS[i]! <= stationS[i - 1]!) {
          return { ok: false, reason: `단조 위반 (idx ${i})` };
        }
      }
      const meanDistM = dists.reduce((a, b) => a + b, 0) / dists.length;
      return { ok: true, path: sliceRoutePath(index, s0, s1), stationS, maxDistM, meanDistM };
    })();
    if (attempt.ok) {
      if (!best || !best.ok || attempt.meanDistM < best.meanDistM) best = attempt;
    } else if (firstFail === null) {
      firstFail = attempt.reason;
    }
  }
  return best ?? { ok: false, reason: firstFail ?? '시작 후보 없음' };
};

// ── 경로 leg 실형상 슬라이스 — 적재된 형상 위에서 탑승~하차 구간을 자른다 ────

export interface SectionShapeIndex {
  index: PathIndex;
  isLoop: boolean;
  // stationId → 형상 호길이(m) anchor.
  anchorByStation: Map<string, number>;
}

// DB 형상 행(path/stationS JSON 파싱값) + section 역 id 목록 → 슬라이스 인덱스.
// stationS 와 stationIds 길이가 어긋나면(재적재 드리프트) null — 호출측 폴백.
export const buildSectionShapeIndex = (
  path: LatLng[],
  stationS: number[],
  stationIds: string[],
  isLoop: boolean,
): SectionShapeIndex | null => {
  if (stationS.length !== stationIds.length) return null;
  const index = createRoutePathIndex(path);
  if (!index) return null;
  return {
    index,
    isLoop,
    anchorByStation: new Map(stationIds.map((id, i) => [id, stationS[i]!])),
  };
};

// 링 전진 슬라이스 — 시임(s=0)을 넘으면 두 조각을 잇는다.
const sliceLoopForward = (index: PathIndex, s0: number, s1: number): LatLng[] =>
  s1 >= s0
    ? sliceRoutePath(index, s0, s1)
    : [...sliceRoutePath(index, s0, index.totalM), ...sliceRoutePath(index, 0, s1).slice(1)];

// leg(같은 호선 연속 탑승)의 역 id 열 → 실형상 폴리라인. 인접 역 쌍마다 두 anchor
// 를 모두 가진 section 형상을 찾아 슬라이스해 잇는다(2호선 본선↔지선 넘나드는
// leg 도 쌍 단위로 해소). 한 쌍이라도 못 찾으면 null — 호출측이 직선 폴백.
export const sliceLegPath = (
  sections: SectionShapeIndex[],
  stationIds: string[],
): LatLng[] | null => {
  if (stationIds.length < 2) return null;
  const out: LatLng[] = [];
  for (let i = 1; i < stationIds.length; i++) {
    const a = stationIds[i - 1]!;
    const b = stationIds[i]!;
    const sec = sections.find((s) => s.anchorByStation.has(a) && s.anchorByStation.has(b));
    if (!sec) return null;
    const sa = sec.anchorByStation.get(a)!;
    const sb = sec.anchorByStation.get(b)!;
    let seg: LatLng[];
    if (!sec.isLoop) {
      seg = sa <= sb
        ? sliceRoutePath(sec.index, sa, sb)
        : sliceRoutePath(sec.index, sb, sa).reverse();
    } else {
      // 순환 — 짧은 호가 실제 운행 경로(인접 역이라 반바퀴를 넘지 않는다).
      const T = sec.index.totalM;
      const fwd = (((sb - sa) % T) + T) % T;
      const bwd = (((sa - sb) % T) + T) % T;
      seg = fwd <= bwd
        ? sliceLoopForward(sec.index, sa, sb)
        : sliceLoopForward(sec.index, sb, sa).reverse();
    }
    // 이음 — 직전 조각 끝점과 다음 조각 첫점은 같은 역이라 중복 제거.
    for (let j = out.length > 0 ? 1 : 0; j < seg.length; j++) out.push(seg[j]!);
  }
  return out.length >= 2 ? out : null;
};

// 체인에 역들을 투영해 anchor 를 얻는다 — 비순환은 정방향/역방향 모두 시도해
// 성공한 쪽(둘 다면 mean dist 작은 쪽), 순환은 링 닫기 + 방향 보정 + 간격 검증.
export const anchorStations = (
  chain: LatLng[],
  stations: LatLng[],
  isLoop: boolean,
): AnchorResult => {
  if (stations.length < 2 || chain.length < 2) return { ok: false, reason: '입력 부족' };

  if (!isLoop) {
    const fwd = tryLinear(chain, stations);
    const bwd = tryLinear([...chain].reverse(), stations);
    if (fwd.ok && bwd.ok) return fwd.meanDistM <= bwd.meanDistM ? fwd : bwd;
    if (fwd.ok) return fwd;
    if (bwd.ok) return bwd;
    return { ok: false, reason: `정방향: ${fwd.reason} / 역방향: ${bwd.reason}` };
  }

  // ── 순환 — 링 닫기 + 전역 투영(링은 각 지점을 한 번만 지난다) ───────────────
  let pts = [...chain];
  if (approxDistanceM(pts[0]!, pts[pts.length - 1]!) > LOOP_CLOSE_EPS_M) {
    pts.push({ ...pts[0]! });
  }
  let index = createRoutePathIndex(pts);
  if (!index) return { ok: false, reason: '형상 점 부족' };
  let proj = stations.map((st) => projectOnRoutePath(index!, st));
  const dists = proj.map((p) => p.distM);
  const maxDistM = Math.max(...dists);
  if (maxDistM > STATION_MAX_DIST_M) {
    return { ok: false, reason: `역 이탈 max=${Math.round(maxDistM)}m` };
  }
  const meanDistM = dists.reduce((a, b) => a + b, 0) / dists.length;

  // 방향 보정 — 운행 seq 전진 이동량 합이 작은 쪽이 실제 운행 방향.
  const T = index.totalM;
  let fwdSum = 0;
  let bwdSum = 0;
  for (let i = 1; i < proj.length; i++) {
    const d = proj[i]!.s - proj[i - 1]!.s;
    fwdSum += ((d % T) + T) % T;
    bwdSum += ((-d % T) + T) % T;
  }
  if (bwdSum < fwdSum) {
    pts = [...pts].reverse();
    index = createRoutePathIndex(pts);
    if (!index) return { ok: false, reason: '형상 점 부족' };
    proj = stations.map((st) => projectOnRoutePath(index!, st));
  }

  // 인접 역 전진 간격이 (0, 반바퀴) 이내인지 검증(투영 오배치 방어).
  const total = index.totalM;
  const sArr = proj.map((p) => p.s);
  for (let i = 1; i < sArr.length; i++) {
    const d = (((sArr[i]! - sArr[i - 1]!) % total) + total) % total;
    if (d <= 0 || d > total / 2) return { ok: false, reason: `링 간격 이상 (idx ${i})` };
  }
  return { ok: true, path: pts, stationS: sArr, maxDistM, meanDistM };
};
