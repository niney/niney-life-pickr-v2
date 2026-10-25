import { describe, expect, it } from 'vitest';
import type { GpxPoint } from './hiking-gpx.js';
import { coursesFromNetwork } from './hiking-network.js';

// 합성 망 — A: 37.000(100m) → 37.010(600m) 북쪽으로 오르는 길(끝이 정상). B: 동쪽 127.012(120m)에서 서쪽으로 와 A 가운데
// (37.005, 350m)에 붙는 길(T자 갈림길). 들머리는 A 아래 끝·B 동쪽 끝.
const seg = (n: number, f: (i: number) => [number, number, number]): GpxPoint[] =>
  Array.from({ length: n }, (_, i) => {
    const [lat, lng, ele] = f(i);
    return { lat, lng, ele, seq: i + 1 };
  });
const A = seg(51, (i) => [37 + i * 0.0002, 127, 100 + i * 10]);
const B = seg(61, (i) => [37.005, 127.012 - i * 0.0002, 120 + (i * 230) / 60]);

describe('coursesFromNetwork', () => {
  it('갈림길에서 잘라 두 들머리 → 정상 왕복과 두 갈래로 넘어가는 코스를 만든다', () => {
    const r = coursesFromNetwork([A, B]);
    // 정상 — 가장 높은 점(이동 중앙값으로 끝 두 점이 같아져 22m 안쪽 점이 잡힌다).
    expect(r.summit!.lat).toBeCloseTo(37.01, 3);
    expect(r.junctions).toHaveLength(1);
    expect(r.junctions[0]).toMatchObject({ degree: 3 });
    expect(r.junctions[0]!.lat).toBeCloseTo(37.005, 4);
    expect(r.paths.map((p) => p.kind)).toEqual(['summit', 'summit', 'cross']);
    // 낮은 들머리(A, 100m)부터 — 정상에서 끝난다.
    const [up1, up2, cross] = r.paths;
    expect(up1!.points[0]).toMatchObject({ lat: 37, lng: 127 });
    expect(up1!.points.at(-1)!.lat).toBeCloseTo(37.01, 3);
    // B 들머리는 동쪽 끝에서 갈림길을 지나 A 위쪽으로 정상까지.
    expect(up2!.points[0]!.lng).toBeCloseTo(127.012, 6);
    expect(up2!.points.at(-1)!.lat).toBeCloseTo(37.01, 3);
    // 넘어가기 — A 로 올라 B 로 내려간다.
    expect(cross!.points[0]).toMatchObject({ lat: 37, lng: 127 });
    expect(cross!.points.at(-1)!.lng).toBeCloseTo(127.012, 6);
  });

  it('다른 봉우리 정상 근처(isAvoided)는 정상 후보에서 뺀다 — 다 빠지면 가장 높은 점', () => {
    const nearTop = (q: { lat: number }) => q.lat > 37.0082;
    expect(coursesFromNetwork([A, B], nearTop).summit!.lat).toBeLessThanOrEqual(37.0082);
    expect(coursesFromNetwork([A, B], () => true).summit!.lat).toBeCloseTo(37.01, 3);
  });

  it('고도가 없거나 조각이 없으면 아무것도 만들지 않는다', () => {
    expect(coursesFromNetwork([A.map((p) => ({ ...p, ele: null })), B.map((p) => ({ ...p, ele: null }))]).paths).toEqual([]);
    expect(coursesFromNetwork([])).toEqual({ paths: [], summit: null, junctions: [] });
  });

  it('정상까지 500m 안 되거나 정상보다 50m 넘게 낮지 않은 끝은 들머리가 아니다', () => {
    // A 위쪽 절반(37.005~37.010)만 — 아래 끝(350m)은 정상보다 충분히 낮고 정상까지 555m 라 들머리. 가운데(37.0075)에 동쪽에서
    // 붙는 길의 끝(580m)은 정상까지 600m 남짓이지만 정상(≈590m)과 거의 같은 높이라 들머리가 아니다.
    const upper = seg(26, (i) => [37.005 + i * 0.0002, 127, 350 + i * 10]);
    const flatB = seg(21, (i) => [37.0075, 127.004 - i * 0.0002, 580 - i * 5]);
    const r = coursesFromNetwork([upper, flatB]);
    expect(r.paths).toHaveLength(1);
    expect(r.paths[0]!.points[0]).toMatchObject({ lat: 37.005, lng: 127 });
  });
});
