// 경로 탐색(11차) 순수 로직 — 역 그래프 구축 + 다익스트라 + leg 압축. I/O(DB
// 조회·캐시)는 SubwayService.getPath 가 담당한다. 단위 테스트 대상.
//
// 그래프: 노드 = SubwayStation(stationId). 운행 간선 = 같은 (lineId, branchKey)
// 인접 seq 쌍(양방향, RIDE_SEC_PER_STATION). 2호선 본선은 순환이라 끝↔처음 간선
// 추가(isLoopSection). 환승 간선 = 역명 근접 그룹(groupStations, ≤1km) 내 서로
// 다른 stationId 쌍(양방향, TRANSFER_SEC). 지선 분기는 공용 정차역이 같은
// stationId 로 여러 branch 에 등장 → 노드 공유로 자연 반영.
//
// 가중치는 근사 고정 상수 — 거리 보정 안 함('약 N분' 계약이라 충분. 과설계 금지).

import type { SubwayPathLegType } from '@repo/api-contract';
import { isLoopSection } from './subway-line-order.service.js';
import { groupStations, type StationForGrouping } from './subway-master.service.js';

// 역간 이동 근사(초) — 정차·주행 뭉뚱그린 상수.
export const RIDE_SEC_PER_STATION = 120;
// 환승 근사(초) — 도보·대기.
export const TRANSFER_SEC = 240;
// 그래프 메모리 캐시 TTL — 재적재는 드물어 lazy+TTL 로 충분.
export const SUBWAY_GRAPH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface GraphStation {
  id: string;
  name: string;
  lineId: string;
  lineName: string;
  lat: number;
  lng: number;
}
export interface GraphLineStation {
  lineId: string;
  branchKey: string;
  seq: number;
  stationId: string;
}

type EdgeKind = 'ride' | 'transfer';
interface Edge {
  to: string;
  sec: number;
  kind: EdgeKind;
  lineId: string | null; // ride 는 호선(leg 압축용), transfer 은 null
}

export interface SubwayGraph {
  adj: Map<string, Edge[]>;
  stations: Map<string, GraphStation>;
}

export interface BuildGraphOptions {
  rideSecPerStation?: number;
  transferSec?: number;
}

// 노드 배열 + 노선순서 → 그래프. 순서 행의 노드가 마스터에 없으면 그 간선은 skip
// (스냅샷 내성 — 재적재 시점 어긋나도 안전).
export const buildSubwayGraph = (
  stations: GraphStation[],
  lineStations: GraphLineStation[],
  options: BuildGraphOptions = {},
): SubwayGraph => {
  const rideSec = options.rideSecPerStation ?? RIDE_SEC_PER_STATION;
  const transferSec = options.transferSec ?? TRANSFER_SEC;

  const stationMap = new Map(stations.map((s) => [s.id, s]));
  const adj = new Map<string, Edge[]>();
  const addEdge = (a: string, b: string, sec: number, kind: EdgeKind, lineId: string | null): void => {
    let list = adj.get(a);
    if (!list) {
      list = [];
      adj.set(a, list);
    }
    list.push({ to: b, sec, kind, lineId });
  };
  const addRideBoth = (a: string, b: string, lineId: string): void => {
    if (a === b || !stationMap.has(a) || !stationMap.has(b)) return;
    addEdge(a, b, rideSec, 'ride', lineId);
    addEdge(b, a, rideSec, 'ride', lineId);
  };

  // 운행 간선 — section(lineId, branchKey) 별 seq 정렬 후 인접 쌍.
  const bySection = new Map<string, GraphLineStation[]>();
  for (const ls of lineStations) {
    const key = `${ls.lineId}|${ls.branchKey}`;
    let list = bySection.get(key);
    if (!list) {
      list = [];
      bySection.set(key, list);
    }
    list.push(ls);
  }
  for (const [key, list] of bySection) {
    const sep = key.indexOf('|');
    const lineId = key.slice(0, sep);
    const branchKey = key.slice(sep + 1);
    const sorted = [...list].sort((a, b) => a.seq - b.seq);
    for (let i = 0; i + 1 < sorted.length; i += 1) {
      addRideBoth(sorted[i]!.stationId, sorted[i + 1]!.stationId, lineId);
    }
    // 순환(2호선 본선) — 마지막↔처음.
    if (isLoopSection(lineId, branchKey) && sorted.length >= 2) {
      addRideBoth(sorted[sorted.length - 1]!.stationId, sorted[0]!.stationId, lineId);
    }
  }

  // 환승 간선 — 역명 근접 그룹 내 서로 다른 stationId 쌍(전 쌍 연결).
  const grouping: StationForGrouping[] = stations.map((s) => ({
    id: s.id,
    name: s.name,
    lineId: s.lineId,
    lineName: s.lineName,
    lat: s.lat,
    lng: s.lng,
  }));
  for (const g of groupStations(grouping)) {
    const ids = g.lines.map((l) => l.stationId);
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        addEdge(ids[i]!, ids[j]!, transferSec, 'transfer', null);
        addEdge(ids[j]!, ids[i]!, transferSec, 'transfer', null);
      }
    }
  }

  return { adj, stations: stationMap };
};

export interface PathEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  lineId: string | null;
}
export interface FoundPath {
  found: boolean;
  nodes: string[]; // stationId 열(from→to)
  edges: PathEdge[]; // 노드 간 간선(nodes.length-1 개)
  totalSec: number;
  transferCount: number;
}

interface Cost {
  sec: number;
  transfers: number;
}
// 사전순 (sec, transfers) — 동률 소요면 환승 적은 쪽 우선. 둘 다 비음 가산이라
// 다익스트라가 이 사전순 목적에도 정확.
const cheaper = (a: Cost, b: Cost): boolean =>
  a.sec < b.sec || (a.sec === b.sec && a.transfers < b.transfers);

interface HeapItem extends Cost {
  id: string;
}
// (sec, transfers) 최소 이진 힙 — 의존성 추가 없이 배열 구현(노드 수백이라 충분).
class MinHeap {
  private readonly h: HeapItem[] = [];
  get size(): number {
    return this.h.length;
  }
  push(item: HeapItem): void {
    const h = this.h;
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!cheaper(h[i]!, h[p]!)) break;
      [h[i], h[p]] = [h[p]!, h[i]!];
      i = p;
    }
  }
  pop(): HeapItem {
    const h = this.h;
    const top = h[0]!;
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < h.length && cheaper(h[l]!, h[s]!)) s = l;
        if (r < h.length && cheaper(h[r]!, h[s]!)) s = r;
        if (s === i) break;
        [h[i], h[s]] = [h[s]!, h[i]!];
        i = s;
      }
    }
    return top;
  }
}

// 다익스트라 — from→to 최소 (소요, 환승). 미연결이면 found:false.
export const findPath = (graph: SubwayGraph, fromId: string, toId: string): FoundPath => {
  const dist = new Map<string, Cost>();
  const prev = new Map<string, PathEdge>();
  const done = new Set<string>();
  const heap = new MinHeap();

  dist.set(fromId, { sec: 0, transfers: 0 });
  heap.push({ id: fromId, sec: 0, transfers: 0 });

  while (heap.size > 0) {
    const cur = heap.pop();
    if (done.has(cur.id)) continue;
    done.add(cur.id);
    if (cur.id === toId) break;
    for (const edge of graph.adj.get(cur.id) ?? []) {
      if (done.has(edge.to)) continue;
      const cand: Cost = {
        sec: cur.sec + edge.sec,
        transfers: cur.transfers + (edge.kind === 'transfer' ? 1 : 0),
      };
      const known = dist.get(edge.to);
      if (!known || cheaper(cand, known)) {
        dist.set(edge.to, cand);
        prev.set(edge.to, { from: cur.id, to: edge.to, kind: edge.kind, lineId: edge.lineId });
        heap.push({ id: edge.to, ...cand });
      }
    }
  }

  if (!done.has(toId)) {
    return { found: false, nodes: [], edges: [], totalSec: 0, transferCount: 0 };
  }

  const nodes: string[] = [];
  const edges: PathEdge[] = [];
  let at = toId;
  while (at !== fromId) {
    const p = prev.get(at);
    if (!p) break; // 안전장치(정상 경로면 도달)
    nodes.push(at);
    edges.push(p);
    at = p.from;
  }
  nodes.push(fromId);
  nodes.reverse();
  edges.reverse();
  const final = dist.get(toId)!;
  return { found: true, nodes, edges, totalSec: final.sec, transferCount: final.transfers };
};

// 경로(노드/간선) → legs. 연속 ride 간선을 같은 lineId 로 묶고 transfer 간선에서
// 분할. transfer 간선은 leg 가 되지 않는다(경계 = 환승). 따라서 출발/도착이
// 환승으로 시작·끝나도 그 간선은 버려지고 실제 탑승 leg 의 첫/끝 역만 남는다.
export const compressPathLegs = (graph: SubwayGraph, path: FoundPath): SubwayPathLegType[] => {
  if (!path.found) return [];
  const legs: SubwayPathLegType[] = [];
  let current: { lineId: string; nodes: string[] } | null = null;

  const flush = (): void => {
    if (current && current.nodes.length >= 2) {
      const head = graph.stations.get(current.nodes[0]!)!;
      legs.push({
        lineId: current.lineId,
        lineName: head.lineName,
        stations: current.nodes.map((id) => {
          const s = graph.stations.get(id)!;
          return { stationId: s.id, name: s.name, lat: s.lat, lng: s.lng };
        }),
        rideCount: current.nodes.length - 1,
      });
    }
    current = null;
  };

  for (const e of path.edges) {
    if (e.kind === 'transfer') {
      flush();
      continue;
    }
    // ride 간선.
    if (!current || current.lineId !== e.lineId) {
      flush();
      current = { lineId: e.lineId!, nodes: [e.from, e.to] };
    } else {
      current.nodes.push(e.to);
    }
  }
  flush();
  return legs;
};
