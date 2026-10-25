import { describe, expect, it } from 'vitest';
import {
  buildCourse,
  cleanElevations,
  cleanPlaceName,
  gainLoss,
  guideSignposts,
  isGenericPlaceName,
  isJunkPlaceName,
  isTrailNetwork,
  nameCourse,
  parseGpx,
  peakPointName,
  projectOnCourse,
  signDestNames,
  simplifyLine,
  stitchPieces,
  toblerMinutes,
  turnAt,
  type NamedPoint,
  type SignGuide,
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
          wpt({ sym: '0000000218', lat: 37.001, name: '갈림길', cat: 'SIGN', signs: ['정상,가삽고개;UT', '휴양림;TR', 'null;null', 'NA;BL'] }),
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

  // 5차 전국 봉우리 — 들머리 리·동(VILLAGE)은 역·정류장·주차장이 없을 때만.
  it('리·동 이름은 맨 뒤 — 주차장이 있으면 주차장, 없으면 리', () => {
    const village: NamedPoint = { category: 'VILLAGE', name: '진동리', lat: 37, lng: 127, ele: null };
    const park: NamedPoint = { category: 'PARK', name: '진동공영주차장', lat: 37.0005, lng: 127, ele: null };
    const peak: NamedPoint = { category: 'PEAK', name: '돌산', lat: 37.004, lng: 127, ele: 600 };
    expect(nameCourse(course, [village, peak], '돌산', 1).name).toBe('진동리 → 돌산');
    expect(nameCourse(course, [village, park, peak], '돌산', 1).name).toBe('진동공영주차장 → 돌산');
  });

  it('지점 투영 — 선 위 거리와 떨어진 거리', () => {
    const r = projectOnCourse(course, { lat: 37.001, lng: 127.0001 });
    expect(r.atM).toBeGreaterThan(100);
    expect(r.atM).toBeLessThan(125);
    expect(r.offM).toBeGreaterThan(5);
    expect(r.offM).toBeLessThan(15);
  });
});

describe('isTrailNetwork / peakPointName (5차 전국 봉우리)', () => {
  const seg = (pts: [number, number][]) => pts.map(([lat, lng]) => ({ lat, lng }));
  const vertical = seg(Array.from({ length: 20 }, (_, i) => [37 + i * STEP, 127]));

  it('조각 끝이 다른 조각 가운데에 붙으면(T자) 망, 끝끼리만 이어지면(기록 끊김) 코스', () => {
    // 가운데(37.002)에서 동쪽으로 갈라지는 조각.
    const branch = seg(Array.from({ length: 10 }, (_, i) => [37.002, 127 + i * 0.0002]));
    expect(isTrailNetwork([vertical, branch])).toBe(true);
    // 앞 조각 끝(37.0038)에서 이어지는 조각 — 끝끼리 한 쌍뿐이라 코스.
    const next = seg(Array.from({ length: 10 }, (_, i) => [37.0038 + i * STEP, 127]));
    expect(isTrailNetwork([vertical, next])).toBe(false);
    expect(isTrailNetwork([vertical])).toBe(false);
  });

  it('한 자리에 조각 끝이 셋 모이면 망', () => {
    const east = seg(Array.from({ length: 10 }, (_, i) => [37, 127 + i * 0.0002]));
    const west = seg(Array.from({ length: 10 }, (_, i) => [37, 127 - i * 0.0002]));
    expect(isTrailNetwork([vertical, east, west])).toBe(true);
  });

  it('봉우리 지점 이름 — 끝 괄호가 지역(두 글자 이상 시·군·구·읍·면·동·리)이면 뗀다', () => {
    expect(peakPointName('장군봉(노원구)')).toBe('장군봉');
    expect(peakPointName('송곳산(상북면)')).toBe('송곳산');
    expect(peakPointName('도봉산(신선대)')).toBe('도봉산(신선대)');
    expect(peakPointName('남한산(동)')).toBe('남한산(동)');
    expect(peakPointName('청계산(국사봉)(의왕)')).toBe('청계산(국사봉)(의왕)');
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

describe('예상 이동 분·가파름·형태', () => {
  it('Tobler — 평지 1km ≈ 11.9분, 완만한 내리막(−5%)이 가장 빠르고 경사는 ±0.5 에서 자른다', () => {
    expect(toblerMinutes(1000, 0)).toBeCloseTo(11.9, 1);
    expect(toblerMinutes(1000, -50)).toBeCloseTo(10, 5);
    expect(toblerMinutes(1000, 2000)).toBeCloseTo(toblerMinutes(1000, 500), 5);
    expect(toblerMinutes(0, 10)).toBe(0);
  });

  it('오르막 편도 — 정상에서 끝나면 summit, 반대(내려오기)가 더 빠르다', () => {
    const c = buildCourse(parseGpx(gpx([], [line(0, 31, (i) => 300 + i * 10)])))!;
    expect(c.shape).toBe('summit');
    expect(c.moveMin!).toBeGreaterThan(c.moveRevMin!);
    expect(c.moveMin!).toBeGreaterThan(30);
    expect(c.steepPct).toBe(45);
  });

  it('정상을 지나 내려가면 traverse', () => {
    const c = buildCourse(parseGpx(gpx([], [line(0, 31, (i) => 300 + (i <= 15 ? i : 30 - i) * 10)])))!;
    expect(c.shape).toBe('traverse');
  });

  it('끊긴 곳은 거리처럼 이동 분에도 넣지 않는다', () => {
    const one = buildCourse(parseGpx(gpx([], [line(0, 11, () => 100)])))!;
    const two = buildCourse(parseGpx(gpx([], [line(0, 11, () => 100), line(40, 11, () => 100)])))!;
    expect(two.gaps).toHaveLength(1);
    expect(two.moveMin!).toBeCloseTo(one.moveMin! * 2, 0);
  });

  it('가장 가파른 500m 는 조각 안에서만 잰다 — 끊김 건너 고도차(100 → 400m)는 경사가 아니다', () => {
    const c = buildCourse(parseGpx(gpx([], [line(0, 28, () => 100), line(60, 28, () => 400)])))!;
    expect(c.gaps).toHaveLength(1);
    expect(c.steepPct).toBe(0);
  });

  it('고도가 없으면 이동 분·가파름도 null', () => {
    const c = buildCourse(parseGpx(gpx([], [line(0, 5, () => 0)])))!;
    expect(c).toMatchObject({ moveMin: null, moveRevMin: null, steepPct: null });
  });
});

describe('nameCourse — 병합 이름·보조 분류', () => {
  const parsed = parseGpx(gpx([], [line(0, 21, (i) => 400 + i * 10)]));
  const course = buildCourse(parsed)!;
  const pt = (category: string, name: string, lat: number, source?: 'api'): NamedPoint => ({ category, name, lat, lng: 127, ele: null, source });

  it('GPX 에 없는 API 봉우리 이름, 들머리가 없으면 쉼터·안내 이름 중 자리 이름 꼴("허덕교")', () => {
    const names = nameCourse(
      course,
      [pt('SIGN', '갈림길 10', 37), pt('REST', '나무의자', 37.0001), pt('TOILET', '허덕교 화장실', 37.0002), pt('PEAK', '계방산정상', 37.004, 'api')],
      '계방산',
      1,
    );
    expect(names).toMatchObject({ name: '허덕교 → 계방산 정상', startName: '허덕교', peakName: '계방산 정상' });
  });

  it('같은 자리 봉우리 표기가 둘이면 API 쪽을 100m 멀리 친다', () => {
    const names = nameCourse(course, [pt('PEAK', '장블재', 37.004, 'api'), pt('PEAK', '장불재', 37.0036)], '무등산', 1);
    expect(names.peakName).toBe('장불재');
  });

  it('깨진 이름·"정상석"뿐인 봉우리', () => {
    expect(nameCourse(course, [pt('PEAK', '정3', 37.004)], '무등산', 2)).toMatchObject({ name: '코스 2', source: 'number' });
    expect(nameCourse(course, [pt('PEAK', '정상석', 37.004)], '희양산', 3).peakName).toBe('희양산 정상');
  });
});

describe('cleanPlaceName · isGenericPlaceName · isJunkPlaceName', () => {
  it('높이·날짜·한자·정상석·대시 자모·끝 마침표', () => {
    expect(cleanPlaceName('등선봉 해발632m')).toBe('등선봉');
    expect(cleanPlaceName('삼악산 용화봉(654m)')).toBe('삼악산 용화봉');
    expect(cleanPlaceName('방태산주억봉 1,444m')).toBe('방태산주억봉');
    expect(cleanPlaceName('월출산 천황봉 20200921')).toBe('월출산 천황봉');
    expect(cleanPlaceName('비봉(碑峰)')).toBe('비봉');
    expect(cleanPlaceName('공작산 정상(과거 정상표지석 위치)')).toBe('공작산 정상');
    expect(cleanPlaceName('신선봉 정상석')).toBe('신선봉');
    expect(cleanPlaceName('신불산정상')).toBe('신불산 정상');
    expect(cleanPlaceName('서대산정상(904m)')).toBe('서대산 정상');
    expect(cleanPlaceName('소요산 ㅡ 의상대')).toBe('소요산 의상대');
    expect(cleanPlaceName('석골폭포.')).toBe('석골폭포');
  });

  it('일반 이름·깨진 이름', () => {
    expect(isGenericPlaceName('갈림길 10')).toBe(true);
    expect(isGenericPlaceName('위치번호 내장06-02')).toBe(true);
    expect(isGenericPlaceName('북한산국립공원')).toBe(true);
    expect(isGenericPlaceName('북한산국립공원 정릉')).toBe(false);
    expect(isJunkPlaceName('승강ㅈ1ㆍㅇ')).toBe(true);
    expect(isJunkPlaceName('정3')).toBe(true);
    expect(isJunkPlaceName('가평운수')).toBe(true);
    expect(isJunkPlaceName('656봉')).toBe(false);
  });
});

describe('이정표 안내', () => {
  const base = { atM: 1000, named: [] as { name: string; atM: number }[], mountainName: '가야산', topAtM: null, sameFrame: null, turnDeg: null };
  const ways = (g: SignGuide[]) => g.map((x) => x.way);

  it('목적지 문구에서 비교할 이름만', () => {
    expect(signDestNames('상왕봉 .진행방향')).toEqual(['상왕봉']);
    expect(signDestNames('칠불봉(200m)')).toEqual(['칠불봉']);
    expect(signDestNames('상왕봉.칠불봉')).toEqual(['상왕봉', '칠불봉']);
    expect(signDestNames('도봉산역, 도봉탐방지원센터')).toEqual(['도봉산역', '도봉탐방지원센터']);
  });

  it('이름 — 앞쪽 지점이면 가는 길, 뒤쪽이면 온 길(방향 코드와 상관없이)', () => {
    const g = guideSignposts({
      ...base,
      signposts: [
        { dest: '토신골(하산방향)', dir: 'ST' },
        { dest: '상왕봉 0.2km', dir: 'UT' },
        { dest: '금강굴', dir: 'BL' },
      ],
      named: [
        { name: '토신골탐방로입구', atM: 100 },
        { name: '가야산 상왕봉', atM: 2000 },
      ],
    });
    expect(ways(g)).toEqual(['prev', 'next', null]);
  });

  it("'정상'·산 이름 목적지는 고도 최고점 자리", () => {
    expect(ways(guideSignposts({ ...base, signposts: [{ dest: '정상', dir: 'TR' }], topAtM: 3000 }))).toEqual(['next']);
    expect(ways(guideSignposts({ ...base, signposts: [{ dest: '가야산', dir: 'TR' }], topAtM: 300 }))).toEqual(['prev']);
  });

  it('방향 코드 — 기록 방향 그대로면 UT=온 길, 꺾인 쪽=가는 길 / 뒤집힌 코스면 반대', () => {
    const signposts = [
      { dest: '가마을', dir: 'UT' },
      { dest: '나봉', dir: 'TR' },
      { dest: '다사', dir: 'TL' },
    ];
    expect(ways(guideSignposts({ ...base, signposts, sameFrame: true, turnDeg: 80 }))).toEqual(['prev', 'next', null]);
    // 기록한 사람은 반대로 걸었다 — 그 사람의 뒤(UT)가 우리 앞, 그 사람이 꺾은 쪽(−80° → TL)이 우리 뒤.
    expect(ways(guideSignposts({ ...base, signposts, sameFrame: false, turnDeg: 80 }))).toEqual(['next', null, 'prev']);
    // 다른 출처(방향 모름)면 코드는 쓰지 않는다.
    expect(ways(guideSignposts({ ...base, signposts, sameFrame: null, turnDeg: 80 }))).toEqual([null, null, null]);
  });

  it('이름이 앞쪽인 목적지는 방향 코드로 온 길이 되지 않는다', () => {
    const g = guideSignposts({
      ...base,
      signposts: [
        { dest: '상왕봉', dir: 'UT' },
        { dest: '칠불봉', dir: 'ST' },
      ],
      named: [
        { name: '칠불봉', atM: 1100 },
        { name: '상왕봉', atM: 1300 },
      ],
      sameFrame: true,
    });
    expect(ways(g)).toEqual([null, 'next']);
  });

  it("목적지 없는 칸('NA')은 빼고, 꺾인 각도는 오른쪽 +", () => {
    expect(guideSignposts({ ...base, signposts: [{ dest: 'NA', dir: 'UT' }] })).toEqual([]);
    // 북쪽으로 10칸 간 뒤 동쪽으로 10칸 — 오른쪽으로 90°.
    const north = Array.from({ length: 11 }, (_, i) => ({ lat: 37 + i * STEP, lng: 127 }));
    const east = Array.from({ length: 10 }, (_, i) => ({ lat: 37 + 10 * STEP, lng: 127 + (i + 1) * STEP * 1.25 }));
    const pts = [...north, ...east].map((p) => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><ele>100</ele></trkpt>`);
    const c = buildCourse(parseGpx(gpx([], [pts])))!;
    const corner = c.pieces[0]![10]!.atM;
    expect(turnAt(c, corner)).toBeGreaterThan(70);
    expect(turnAt(c, corner)).toBeLessThan(110);
    expect(turnAt(c, 5)).toBeNull();
  });
});
