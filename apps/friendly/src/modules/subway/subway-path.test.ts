import { describe, expect, it } from 'vitest';
import {
  buildSubwayGraph,
  compressPathLegs,
  findPath,
  type GraphLineStation,
  type GraphStation,
} from './subway-path.service.js';

// 가상 그래프 헬퍼 — stationId = `${lineId}:${name}`. 같은 name 을 근접 좌표로 두면
// groupStations 가 환승 간선을 만든다(이름 다르면 거리 무관 그룹 안 됨).
const st = (lineId: string, name: string, lat: number, lng: number): GraphStation => ({
  id: `${lineId}:${name}`,
  name,
  lineId,
  lineName: `${lineId}호선`,
  lat,
  lng,
});
const ls = (lineId: string, branchKey: string, seq: number, name: string): GraphLineStation => ({
  lineId,
  branchKey,
  seq,
  stationId: `${lineId}:${name}`,
});
const ids = (path: ReturnType<typeof findPath>, graph: ReturnType<typeof buildSubwayGraph>) =>
  compressPathLegs(graph, path).map((l) => ({
    lineId: l.lineId,
    stations: l.stations.map((s) => s.stationId),
  }));

describe('subway-path — buildSubwayGraph + findPath + compressPathLegs', () => {
  // 1005: A-B-C-D 직선. 1006: B-E. 'B' 는 1005/1006 근접 동명 → 환승. (비순환
  // 노선을 써야 함 — 1002:main 은 LOOP_SECTIONS 라 첫↔끝 loop 간선이 붙는다.)
  const g1 = buildSubwayGraph(
    [
      st('1005', 'A', 37.5, 127.0),
      st('1005', 'B', 37.51, 127.0),
      st('1005', 'C', 37.52, 127.0),
      st('1005', 'D', 37.53, 127.0),
      st('1006', 'B', 37.5101, 127.0001),
      st('1006', 'E', 37.51, 127.02),
    ],
    [
      ls('1005', 'main', 1, 'A'),
      ls('1005', 'main', 2, 'B'),
      ls('1005', 'main', 3, 'C'),
      ls('1005', 'main', 4, 'D'),
      ls('1006', 'main', 1, 'B'),
      ls('1006', 'main', 2, 'E'),
    ],
  );

  it('직행(환승 0) — 같은 호선 연속 leg 1', () => {
    const p = findPath(g1, '1005:A', '1005:D');
    expect(p.found).toBe(true);
    expect(p.transferCount).toBe(0);
    expect(p.totalSec).toBe(360); // 3 ride × 120
    expect(ids(p, g1)).toEqual([
      { lineId: '1005', stations: ['1005:A', '1005:B', '1005:C', '1005:D'] },
    ]);
  });

  it('1회 환승 — 경계에서 leg 분할(환승 간선은 leg 아님)', () => {
    const p = findPath(g1, '1005:A', '1006:E');
    expect(p.found).toBe(true);
    expect(p.transferCount).toBe(1);
    expect(p.totalSec).toBe(480); // 120 + 240(환승) + 120
    expect(ids(p, g1)).toEqual([
      { lineId: '1005', stations: ['1005:A', '1005:B'] },
      { lineId: '1006', stations: ['1006:B', '1006:E'] },
    ]);
  });

  it('출발이 환승 간선으로 시작 — 그 환승은 leg 로 안 만들고 실제 탑승 leg 첫역 유지', () => {
    // 1006:B 출발 → 즉시 1005:B 환승 → 1005 로 주행. 선두 환승 간선은 트림.
    const p = findPath(g1, '1006:B', '1005:D');
    expect(p.found).toBe(true);
    expect(p.transferCount).toBe(1);
    const legs = compressPathLegs(g1, p);
    expect(legs).toHaveLength(1);
    expect(legs[0]!.lineId).toBe('1005');
    // 선두 1006:B 는 leg 에 없다 — 실제 탑승은 1005:B 부터.
    expect(legs[0]!.stations.map((s) => s.stationId)).toEqual(['1005:B', '1005:C', '1005:D']);
  });

  it('동률 소요면 환승 적은 경로 우선', () => {
    // S-A1-T(1005 2 ride) vs S~1006~T(환승2+ride1). 가중치를 튜닝해 소요 동률.
    const g = buildSubwayGraph(
      [
        st('1005', 'S', 37.5, 127.0),
        st('1005', 'A1', 37.505, 127.0),
        st('1005', 'T', 37.51, 127.0),
        st('1006', 'S', 37.5001, 127.0001),
        st('1006', 'T', 37.5101, 127.0001),
      ],
      [
        ls('1005', 'main', 1, 'S'),
        ls('1005', 'main', 2, 'A1'),
        ls('1005', 'main', 3, 'T'),
        ls('1006', 'main', 1, 'S'),
        ls('1006', 'main', 2, 'T'),
      ],
      { rideSecPerStation: 200, transferSec: 100 },
    );
    // Route A: 2×200 = 400, 0 환승. Route B: 100 + 200 + 100 = 400, 2 환승. → A.
    const p = findPath(g, '1005:S', '1005:T');
    expect(p.totalSec).toBe(400);
    expect(p.transferCount).toBe(0);
    expect(ids(p, g)).toEqual([{ lineId: '1005', stations: ['1005:S', '1005:A1', '1005:T'] }]);
  });

  it('순환(2호선 본선) — 짧은 호 선택(loop 간선 사용)', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F'];
    const g = buildSubwayGraph(
      names.map((n, i) => st('1002', n, 37.5 + i * 0.01, 127.0)),
      names.map((n, i) => ls('1002', 'main', i + 1, n)),
    );
    // A→E: 정방향 A-B-C-D-E(4) vs 역방향 A-F-E(2, F-A 는 loop 간선). 역방향.
    const p = findPath(g, '1002:A', '1002:E');
    expect(p.transferCount).toBe(0);
    expect(p.totalSec).toBe(240); // 2 ride
    expect(ids(p, g)).toEqual([{ lineId: '1002', stations: ['1002:A', '1002:F', '1002:E'] }]);
  });

  it('지선 경유 — 공용 정차역(J) 노드 공유, 같은 호선이라 환승 아님', () => {
    // 비순환 노선(1005) 본선 + 지선. J 는 두 section 에 같은 stationId 로 등장.
    const g = buildSubwayGraph(
      [
        st('1005', 'P', 37.5, 127.0),
        st('1005', 'J', 37.51, 127.0),
        st('1005', 'Q', 37.52, 127.0),
        st('1005', 'K', 37.51, 127.02),
      ],
      [
        ls('1005', 'main', 1, 'P'),
        ls('1005', 'main', 2, 'J'),
        ls('1005', 'main', 3, 'Q'),
        ls('1005', 'macheon', 1, 'J'), // 지선 — J 공유(같은 stationId)
        ls('1005', 'macheon', 2, 'K'),
      ],
    );
    const p = findPath(g, '1005:P', '1005:K');
    expect(p.transferCount).toBe(0);
    expect(ids(p, g)).toEqual([{ lineId: '1005', stations: ['1005:P', '1005:J', '1005:K'] }]);
  });

  it('미연결 — found:false, legs []', () => {
    const g = buildSubwayGraph(
      [
        st('1005', 'A', 37.5, 127.0),
        st('1005', 'B', 37.51, 127.0),
        st('1004', 'Z', 37.6, 127.5),
      ],
      [ls('1005', 'main', 1, 'A'), ls('1005', 'main', 2, 'B')],
    );
    const p = findPath(g, '1005:A', '1004:Z');
    expect(p.found).toBe(false);
    expect(compressPathLegs(g, p)).toEqual([]);
  });
});
