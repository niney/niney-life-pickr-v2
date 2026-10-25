import { describe, expect, it } from 'vitest';
import {
  buildCourse,
  cleanElevations,
  cleanPlaceName,
  gainLoss,
  nameCourse,
  parseGpx,
  projectOnCourse,
  simplifyLine,
  stitchPieces,
} from './hiking-gpx.js';

// 합성 GPX — 경도 127 위를 북쪽으로 0.0002°(≈22m)씩. Tranggle 1.1 원본과 같은 태그 모양(CDATA·extensions).
const STEP = 0.0002;
const trkpt = (lat: number, ele: number): string =>
  `<trkpt lat="${lat.toFixed(6)}" lon="127.000000"><ele>${ele.toFixed(3)}</ele><time>2022-01-05 21:13:56</time>` +
  '<extensions><ptid>1</ptid><rtcd>1;2</rtcd></extensions></trkpt>';
const wpt = (o: { sym: string; lat: number; lng?: number; ele?: number; name: string; cat: string; signs?: string[] }): string =>
  `<wpt lat="${o.lat.toFixed(6)}" lon="${(o.lng ?? 127).toFixed(6)}"><ele>${(o.ele ?? 0).toFixed(6)}</ele>` +
  `<sym><![CDATA[${o.sym}]]></sym><name><![CDATA[${o.name}]]></name><extensions><wptid>0</wptid>` +
  `<category><![CDATA[${o.cat}]]></category><address/>` +
  (o.signs ?? []).map((s, i) => `<signpost${i + 1}><![CDATA[${s}]]></signpost${i + 1}>`).join('') +
  '<direction>0;;;</direction></extensions></wpt>';
const gpx = (wpts: string[], segs: string[][], rtsc: string[] = []): string =>
  '<?xml version="1.0" encoding="UTF-8"?><gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">' +
  wpts.join('') +
  '<trk>' +
  segs.map((s) => `<trkseg>${s.join('')}</trkseg>`).join('') +
  '</trk>' +
  (rtsc.length ? `<extensions>${rtsc.join('')}</extensions>` : '') +
  '</gpx>';
const rtsc = (name: string, spt: number, ept: number): string =>
  `<rtsc ept="${ept}" fin="1" rtcd="1" scid="1" spt="${spt}"><name><![CDATA[${name}]]></name><stime>x</stime></rtsc>`;

// 0..n-1 점, i 번째 고도 = f(i).
const line = (from: number, n: number, ele: (i: number) => number): string[] =>
  Array.from({ length: n }, (_, i) => trkpt(37 + (from + i) * STEP, ele(i)));

describe('parseGpx', () => {
  it('지점(CDATA·이정표)·조각·노면을 읽고 trkpt 순번은 조각을 넘어 이어진다', () => {
    const p = parseGpx(
      gpx(
        [
          wpt({ sym: '0000000218', lat: 37.001, name: '갈림길', cat: 'SIGN', signs: ['정상,가삽고개;UT', '휴양림;TR', 'null;null'] }),
          wpt({ sym: '0000002041', lat: 37, ele: 341.627, name: '가리산자연휴양림  매표소', cat: 'ENTRY' }),
        ],
        [line(0, 3, () => 100), line(3, 2, () => 0)],
        [rtsc('오솔길', 1, 5)],
      ),
    );
    expect(p.waypoints).toHaveLength(2);
    expect(p.waypoints[0]!.signposts).toEqual([
      { dest: '정상,가삽고개', dir: 'UT' },
      { dest: '휴양림', dir: 'TR' },
    ]);
    // 고도 0 은 측정 없음 → null, 이름 공백 정리.
    expect(p.waypoints[1]).toMatchObject({ ele: 341.627, name: '가리산자연휴양림 매표소', category: 'ENTRY' });
    expect(p.segments.map((s) => s.map((x) => x.seq))).toEqual([[1, 2, 3], [4, 5]]);
    expect(p.segments[1]![0]!.ele).toBeNull();
    expect(p.surfaces).toEqual([{ name: '오솔길', spt: 1, ept: 5 }]);
  });
});

describe('cleanElevations / gainLoss', () => {
  const pts = (eles: (number | null)[]) => eles.map((ele, i) => ({ lat: 37 + i * STEP, lng: 127, ele }));

  it('튐(22m 사이 300m)은 버리고 보간, 측정 없는 점은 앞뒤로 채운다', () => {
    const out = cleanElevations(pts([100, 105, 410, 115, null, 125, 130]))!;
    expect(Math.max(...out)).toBeLessThan(140);
    expect(out[4]).toBeGreaterThan(110);
    expect(out[4]).toBeLessThan(126);
  });

  it('고도가 하나도 없으면 null', () => {
    expect(cleanElevations(pts([null, null]))).toBeNull();
  });

  it('5m 히스테리시스 — 3m 떨림은 상승으로 치지 않는다', () => {
    expect(gainLoss([100, 103, 100, 103, 100])).toEqual({ gain: 0, loss: 0 });
    // 110 → 107 의 3m 하강은 무시하고 110 기준으로 130 까지 +20.
    expect(gainLoss([100, 110, 107, 130, 120])).toEqual({ gain: 30, loss: 10 });
  });
});

describe('stitchPieces', () => {
  const seg = (fromLat: number, n: number) => Array.from({ length: n }, (_, i) => ({ lat: fromLat + i * STEP, lng: 127 }));

  it('뒤집힌 조각도 30m 안이면 한 줄로, 먼 조각은 끊김으로 남긴다', () => {
    const a = seg(37, 3); // 37.0000 ~ 37.0004
    const b = seg(37.0005, 3).reverse(); // 끝(37.0005)이 a 끝과 ≈11m
    const c = seg(37.0030, 2); // b 를 이은 끝(37.0009)에서 ≈233m
    const r = stitchPieces([a, c, b]);
    expect(r.pieces).toHaveLength(2);
    expect(r.pieces[0]!.map((p) => p.lat.toFixed(4))).toEqual(['37.0000', '37.0002', '37.0004', '37.0005', '37.0007', '37.0009']);
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0]).toBeGreaterThan(200);
  });
});

describe('simplifyLine', () => {
  it('직선 위 중간 점은 지우고 꺾인 점은 남긴다', () => {
    const pts = [
      { lat: 37, lng: 127 },
      { lat: 37.001, lng: 127 },
      { lat: 37.002, lng: 127 },
      { lat: 37.002, lng: 127.002 },
    ];
    expect(simplifyLine(pts, 4)).toEqual([pts[0], pts[2], pts[3]]);
  });
});

describe('buildCourse', () => {
  it('하산 방향으로 기록된 편도는 낮은 끝에서 시작하게 뒤집고, 노면 범위도 뒤집힌 거리로 바뀐다', () => {
    // 고도 500 → 300 (내려가며 기록), 21점 ≈ 445m(원점회귀 판정 300m 밖, 경사 0.45).
    const xml = gpx([], [line(0, 21, (i) => 500 - i * 10)], [rtsc('암릉', 1, 3)]);
    const c = buildCourse(parseGpx(xml))!;
    expect(c.reversed).toBe(true);
    expect(c.isLoop).toBe(false);
    expect(c.start.ele).toBeLessThan(c.end.ele!);
    expect(c.lengthM).toBeGreaterThan(435);
    expect(c.lengthM).toBeLessThan(455);
    // 원래 1~3번 점(고도 500~420)은 뒤집힌 코스의 끝쪽.
    expect(c.surfaces).toHaveLength(1);
    expect(c.surfaces[0]!.toM).toBe(c.lengthM);
    expect(c.surfaces[0]!.fromM).toBeGreaterThan(c.lengthM - 50);
    // 프로필은 20m 간격, 마지막 칸은 코스 길이.
    expect(c.profile.d[0]).toBe(0);
    expect(c.profile.d.at(-1)).toBe(c.lengthM);
    expect(c.profile.d.length).toBe(c.profile.e.length);
    expect(c.gainM).toBeGreaterThan(150);
  });

  it('고도가 전부 0 이면 hasElevation=false 이고 뒤집지 않는다', () => {
    const c = buildCourse(parseGpx(gpx([], [line(0, 5, () => 0)])))!;
    expect(c.hasElevation).toBe(false);
    expect(c.gainM).toBeNull();
    expect(c.profile).toEqual({ d: [], e: [] });
    expect(c.reversed).toBe(false);
  });

  it('점이 하나뿐이면 null', () => {
    expect(buildCourse(parseGpx(gpx([], [line(0, 1, () => 100)])))).toBeNull();
  });
});

describe('nameCourse / projectOnCourse', () => {
  // 37.000(들머리, 낮음) → 37.004(정상, 높음) 편도 ≈ 445m.
  const wpts = [
    wpt({ sym: '1', lat: 37.0, name: '들머리 장구목이', cat: 'ENTRY' }),
    wpt({ sym: '2', lat: 37.004, ele: 600, name: '정상', cat: 'PEAK' }),
    // 코스에서 ≈880m 떨어진 다른 코스의 봉우리 — 이름에 쓰면 안 된다.
    wpt({ sym: '3', lat: 37.001, lng: 127.01, ele: 1200, name: '상봉', cat: 'PEAK' }),
  ];
  const parsed = parseGpx(gpx(wpts, [line(0, 21, (i) => 400 + i * 10)]));
  const course = buildCourse(parsed)!;

  it('들머리 → 정상(이름이 "정상"뿐이면 산 이름)', () => {
    expect(nameCourse(course, parsed.waypoints, '가리왕산', 1)).toMatchObject({
      name: '장구목이 → 가리왕산 정상',
      source: 'points',
      startName: '장구목이',
      peakName: '가리왕산 정상',
    });
  });

  it('이름을 만들 지점이 없으면 번호', () => {
    expect(nameCourse(course, [], '가리왕산', 3)).toMatchObject({ name: '코스 3', source: 'number' });
  });

  it('지점 투영 — 선 위 거리와 떨어진 거리', () => {
    const r = projectOnCourse(course, { lat: 37.001, lng: 127.0001 });
    expect(r.atM).toBeGreaterThan(100);
    expect(r.atM).toBeLessThan(125);
    expect(r.offM).toBeGreaterThan(5);
    expect(r.offM).toBeLessThan(15);
  });
});

describe('cleanPlaceName', () => {
  it('버스 ID·날머리 표기·앞뒤 들머리 말을 지운다', () => {
    expect(cleanPlaceName('용연사(버스 ID 01833)')).toBe('용연사');
    expect(cleanPlaceName('성당리 지방도(오늘산행 날머리)')).toBe('성당리 지방도');
    expect(cleanPlaceName('능강교코스 들머리')).toBe('능강교코스');
    expect(cleanPlaceName('들머리 장구목이')).toBe('장구목이');
  });
});
