// subway-shape.service 순수 로직 테스트 — way 체인 조립 + 역 anchor 계산.
import { describe, expect, it } from 'vitest';
import { assembleChain, anchorStations } from './subway-shape.service.js';
import type { LatLng } from '@repo/utils';

// 37.5° 기준 경도 1e-3 ≈ 88m, 위도 1e-3 ≈ 111m — 테스트 좌표는 1e-3 격자.
const P = (lat: number, lng: number): LatLng => ({ lat: 37.5 + lat / 1000, lng: 127 + lng / 1000 });

describe('assembleChain — way 끝점 매칭 조립', () => {
  it('순서·방향이 뒤섞인 way 를 단일 체인으로 잇는다', () => {
    const a = [P(0, 0), P(0, 1), P(0, 2)];
    const b = [P(0, 2), P(0, 3)];
    const c = [P(0, 5), P(0, 4), P(0, 3)]; // 역방향 way
    const out = assembleChain([b, c, a]);
    expect(out).not.toBeNull();
    expect(out!.unusedWays).toBe(0);
    expect(out!.bridges).toBe(0);
    expect(out!.pts.length).toBe(6); // 조인트 중복 제거: 3+2+3 - 2
    const lngs = out!.pts.map((p) => Math.round((p.lng - 127) * 1000));
    // 시작 way(b)에 앞뒤로 붙어 0..5 연속(방향은 조립 순서에 따라 어느 쪽이든).
    expect(lngs).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('소규모 간극은 직선 브리지로 잇고 횟수를 센다', () => {
    const a = [P(0, 0), P(0, 1)];
    const b = [P(0.5, 1.5), P(0, 3)]; // a 끝과 ~70m 간극
    const out = assembleChain([a, b]);
    expect(out).not.toBeNull();
    expect(out!.bridges).toBe(1);
    expect(out!.unusedWays).toBe(0);
    expect(out!.pts.length).toBe(4); // 브리지는 조인트 제거 없음
  });

  it('상한 초과 간극은 잇지 않고 unusedWays 로 남긴다', () => {
    const a = [P(0, 0), P(0, 1)];
    const far = [P(0, 50), P(0, 51)]; // ~4.3km 간극
    const out = assembleChain([a, far]);
    expect(out).not.toBeNull();
    expect(out!.unusedWays).toBe(1);
  });

  it('재방문 분기(롤리팝 루프)는 member 순서를 보존해 두 번 지난다', () => {
    // 스템 → 루프(시작점 재방문) → 계속 — 6호선 응암 모형. 그리디 양끝 매칭만
    // 쓰면 분기점에서 exit 를 먼저 붙여 루프가 뒤로 밀린다.
    const stem = [P(0, 0), P(0, 4)];
    const loop = [P(0, 4), P(2, 4), P(2, 6), P(0, 6), P(0, 4)];
    const exit = [P(0, 4), P(0, 8)];
    const out = assembleChain([stem, loop, exit]);
    expect(out).not.toBeNull();
    expect(out!.unusedWays).toBe(0);
    const pts = out!.pts.map((p) => [Math.round((p.lat - 37.5) * 1000), Math.round((p.lng - 127) * 1000)]);
    expect(pts).toEqual([[0, 0], [0, 4], [2, 4], [2, 6], [0, 6], [0, 4], [0, 8]]);
  });

  it('측선에서 시작해 갇히면 다른 시작 way 로 재시도해 본선을 채택한다', () => {
    // spur 는 본선과 안 이어지는 짧은 측선 — seg[0] 시작이면 갇힌다.
    const spur = [P(5, 0), P(5, 1)];
    const m1 = [P(0, 0), P(0, 1), P(0, 2)];
    const m2 = [P(0, 2), P(0, 3), P(0, 4)];
    const out = assembleChain([spur, m1, m2]);
    expect(out).not.toBeNull();
    const lngs = out!.pts.map((p) => Math.round((p.lng - 127) * 1000));
    expect(lngs).toEqual([0, 1, 2, 3, 4]); // 본선 체인이 최장이라 채택
    expect(out!.unusedWays).toBe(1); // spur 잔여
  });
});

describe('anchorStations — 역 투영 anchor', () => {
  // 동서 직선 형상 0..10 (약 880m).
  const line = [P(0, 0), P(0, 2), P(0, 4), P(0, 6), P(0, 8), P(0, 10)];

  it('비순환 — seq 순 단조 anchor + [첫, 끝] 트림', () => {
    // 역은 형상에서 살짝 벗어남(역사 중심 vs 선로 중심선).
    const stations = [P(0.2, 1), P(0.2, 5), P(0.2, 9)];
    const out = anchorStations(line, stations, false);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.stationS[0]).toBe(0); // 트림 재기준
    expect(out.stationS[1]).toBeGreaterThan(0);
    expect(out.stationS[2]).toBeGreaterThan(out.stationS[1]!);
    // 트림 — 첫 역(1)~끝 역(9) 구간만: 전체(~880m)보다 짧다.
    const approxTotal = out.stationS[2]!;
    expect(approxTotal).toBeGreaterThan(600);
    expect(approxTotal).toBeLessThan(800);
    expect(out.maxDistM).toBeLessThan(30);
  });

  it('운행 순서가 형상 방향과 반대면 형상을 뒤집는다', () => {
    const stations = [P(0.2, 9), P(0.2, 5), P(0.2, 1)];
    const out = anchorStations(line, stations, false);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    for (let i = 1; i < out.stationS.length; i++) {
      expect(out.stationS[i]!).toBeGreaterThan(out.stationS[i - 1]!);
    }
    // 뒤집힌 형상 — path 시작이 lng 9 쪽(끝 역 근처).
    expect(out.path[0]!.lng).toBeGreaterThan(127.008);
  });

  it('형상에서 먼 역이 있으면 실패(후보 탈락)', () => {
    const stations = [P(0.2, 1), P(5, 5), P(0.2, 9)]; // 가운데 역 ~550m 이탈
    const out = anchorStations(line, stations, false);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain('역 이탈');
  });

  it('재방문 구간(롤리팝 루프)은 순차 윈도우 투영으로 푼다', () => {
    // 스템(0..4) + 루프(4→위→오른쪽→아래→4) 후 계속(4..8) — 6호선 응암 모형.
    const lollipop = [
      P(0, 0), P(0, 4), // 스템
      P(2, 4), P(2, 6), P(0, 6), P(0, 4), // 루프(4 재방문)
      P(0, 8), // 계속
    ];
    // 역 순서: 스템 → 루프 위쪽 → 재방문 지점 근처 → 이후. 전역 최근접이라면
    // 마지막 (0,4) 근처 역이 첫 방문 s 로 붙어 단조가 깨질 수 있다.
    const stations = [P(0.2, 1), P(1.8, 5), P(0.2, 4.2), P(0.2, 7)];
    const out = anchorStations(lollipop, stations, false);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    for (let i = 1; i < out.stationS.length; i++) {
      expect(out.stationS[i]!).toBeGreaterThan(out.stationS[i - 1]!);
    }
  });

  it('순환 — 링 유지 + 방향 보정 + 인접 간격 검증', () => {
    // 사각 링(반시계): (0,0)→(0,4)→(4,4)→(4,0)→닫힘.
    const ring = [P(0, 0), P(0, 4), P(4, 4), P(4, 0), P(0, 0)];
    // 운행 순서는 시계 방향(링과 반대) — 뒤집기가 일어나야 단조.
    const stations = [P(0.2, 1), P(3, 0.2), P(3.8, 3), P(0.5, 3.8)];
    const out = anchorStations(ring, stations, true);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // 링은 트림하지 않는다 — 닫힌 경로 유지(첫점=끝점).
    expect(out.path[0]!.lat).toBe(out.path[out.path.length - 1]!.lat);
    expect(out.path[0]!.lng).toBe(out.path[out.path.length - 1]!.lng);
  });

  it('열린 링 입력은 자동으로 닫는다', () => {
    const openRing = [P(0, 0), P(0, 4), P(4, 4), P(4, 0)];
    const stations = [P(0.2, 1), P(0.2, 3), P(3.8, 3), P(3.8, 1)];
    const out = anchorStations(openRing, stations, true);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.path.length).toBe(5);
  });
});
