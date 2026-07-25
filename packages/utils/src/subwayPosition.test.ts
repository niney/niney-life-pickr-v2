import { describe, expect, it } from 'vitest';
import { createRoutePathIndex, type LatLng } from './index.js';
import {
  locateTrain,
  normalizeStationName,
  resolveTrainSection,
  sliceForMove,
  subwayDestinationLabel,
  TRAIN_STATUS_FRACTION,
  type LocateInput,
  type TrainSection,
} from './subwayPosition.js';

// 가상 직선 5역 A~E — 위도 고정, 경도 0.01°씩(≈883m). 방향 판정/상태 분수/슬라이스
// 검증에 좌표 세부는 무관해 등간격 직선이면 충분하다.
const STRAIGHT: LatLng[] = [
  { lat: 37.5, lng: 127.0 },
  { lat: 37.5, lng: 127.01 },
  { lat: 37.5, lng: 127.02 },
  { lat: 37.5, lng: 127.03 },
  { lat: 37.5, lng: 127.04 },
];
const NAMES = ['A', 'B', 'C', 'D', 'E'];

const makeSection = (coords: LatLng[], names: string[], isLoop: boolean): TrainSection => {
  const pts = isLoop ? [...coords, coords[0]!] : coords;
  const index = createRoutePathIndex(pts);
  if (!index) throw new Error('index build failed');
  return {
    sectionKey: 'main',
    index,
    isLoop,
    byName: new Map(names.map((n, i) => [n, i])),
    stationCount: coords.length,
  };
};

const item = (over: Partial<LocateInput>): LocateInput => ({
  statnNm: 'C',
  trainStatus: '1',
  updnLine: '0',
  destinationName: 'E',
  ...over,
});

describe('locateTrain — 직선 section', () => {
  const sec = makeSection(STRAIGHT, NAMES, false);
  const cum = sec.index.cum;

  it('현재역에 없는 열차는 null (호출측이 좌표 마커로 강등)', () => {
    expect(locateTrain([sec], item({ statnNm: 'Z' }))).toBeNull();
  });

  it("상태별 분수 — '1' 도착은 현재역", () => {
    const loc = locateTrain([sec], item({ statnNm: 'C', trainStatus: '1' }));
    expect(loc?.s).toBeCloseTo(cum[2]!, 3);
  });

  it("'3' 전역출발은 직전역(B) 근처, '0' 진입은 현재역(C) 근처", () => {
    const s3 = locateTrain([sec], item({ trainStatus: '3' }))!.s;
    const s0 = locateTrain([sec], item({ trainStatus: '0' }))!.s;
    // B→C 세그먼트 위, f=0.2 / 0.9.
    expect(s3).toBeCloseTo(cum[1]! + 0.2 * (cum[2]! - cum[1]!), 3);
    expect(s0).toBeCloseTo(cum[1]! + 0.9 * (cum[2]! - cum[1]!), 3);
    expect(s3).toBeLessThan(s0);
  });

  it("'2' 출발은 다음 세그먼트(C→D) 시작", () => {
    const s2 = locateTrain([sec], item({ trainStatus: '2' }))!.s;
    expect(s2).toBeCloseTo(cum[2]! + TRAIN_STATUS_FRACTION['2']! * (cum[3]! - cum[2]!), 3);
    expect(s2).toBeGreaterThan(cum[2]!);
  });

  it('방향 — 행선이 뒤(A)면 하행: 같은 상태라도 s 가 반대편', () => {
    // 하행 '2' 출발은 [C→B], 현재역보다 s 감소.
    const down = locateTrain([sec], item({ destinationName: 'A', trainStatus: '2' }))!;
    expect(down.s).toBeLessThan(cum[2]!);
    expect(down.s).toBeCloseTo(cum[2]! + 0.1 * (cum[1]! - cum[2]!), 3);
  });

  it('방위각 — 상행 동쪽(≈90°), 하행 서쪽(≈270°)', () => {
    const up = locateTrain([sec], item({ trainStatus: '0', destinationName: 'E' }))!;
    const down = locateTrain([sec], item({ trainStatus: '0', destinationName: 'A' }))!;
    expect(up.bearing).toBeCloseTo(90, 0);
    expect(down.bearing).toBeCloseTo(270, 0);
  });

  it("행선 미해석 시 updn 보조 — 프로브 기본 '1'=증가/'0'=감소", () => {
    // 행선 없음 → updnLine 으로 방향. '2' 출발 기준: '1' 상행(+1)이면 s 증가, '0' 하행(-1)이면 감소.
    const up = locateTrain([sec], item({ destinationName: null, updnLine: '1', trainStatus: '2' }))!;
    const down = locateTrain([sec], item({ destinationName: null, updnLine: '0', trainStatus: '2' }))!;
    expect(up.s).toBeGreaterThan(cum[2]!);
    expect(down.s).toBeLessThan(cum[2]!);
  });

  it('종점 클램프 — 첫 역에서 직전역 없으면 현재역 정지', () => {
    // A(cur=0) 상행 '1' — 직전역 인덱스 -1(범위 밖) → 현재역 s.
    const loc = locateTrain([sec], item({ statnNm: 'A', trainStatus: '1', destinationName: 'E' }))!;
    expect(loc.s).toBeCloseTo(cum[0]!, 3);
  });

  it('행선이 다른 section 을 가리키면 그 section 선택(지선 분기 해소)', () => {
    // main: A~C 공용, branch: C-F-G. 행선 G 면 branch 선택.
    const main = makeSection(STRAIGHT.slice(0, 3), ['A', 'B', 'C'], false);
    const branch = makeSection(
      [STRAIGHT[2]!, { lat: 37.51, lng: 127.02 }, { lat: 37.52, lng: 127.02 }],
      ['C', 'F', 'G'],
      false,
    );
    const loc = locateTrain([main, branch], item({ statnNm: 'C', destinationName: 'G' }))!;
    expect(loc.sectionKey).toBe(branch.sectionKey);
  });

  it("'지선' 행선은 공용 분기역에서 지선 section 우선", () => {
    // 성수는 main·지선 공용. 행선 '성수지선'(→정규화 '성수')이면 지선 section 선택.
    const main = makeSection(STRAIGHT.slice(0, 3), ['A', 'B', '성수'], false);
    const branch: TrainSection = {
      ...makeSection(
        [STRAIGHT[2]!, { lat: 37.51, lng: 127.02 }, { lat: 37.52, lng: 127.02 }],
        ['성수', '용답', '신답'],
        false,
      ),
      sectionKey: 'seongsu',
    };
    const loc = locateTrain(
      [main, branch],
      item({ statnNm: '성수', destinationName: '성수지선' }),
    )!;
    expect(loc.sectionKey).toBe('seongsu');
  });
});

describe('normalizeStationName — 방향 조인용(종착·지선 모두 제거)', () => {
  it("'종착'/'지선' 접미 제거, 일반 역명 보존", () => {
    expect(normalizeStationName('성수종착')).toBe('성수');
    expect(normalizeStationName('성수지선')).toBe('성수');
    expect(normalizeStationName('신도림지선')).toBe('신도림');
    expect(normalizeStationName('신설동')).toBe('신설동');
    expect(normalizeStationName('까치산')).toBe('까치산');
    expect(normalizeStationName(null)).toBeNull();
  });
});

describe('subwayDestinationLabel — 알약 라벨', () => {
  it("'종착'→'행', '지선'은 그대로, 일반 역명은 '행' 접미", () => {
    expect(subwayDestinationLabel('성수종착')).toBe('성수행');
    expect(subwayDestinationLabel('신도림')).toBe('신도림행');
    expect(subwayDestinationLabel('성수지선')).toBe('성수지선');
    expect(subwayDestinationLabel('신도림지선')).toBe('신도림지선');
    expect(subwayDestinationLabel(null)).toBe('');
    expect(subwayDestinationLabel('')).toBe('');
  });
});

describe('sliceForMove — via 웨이포인트', () => {
  const sec = makeSection(STRAIGHT, NAMES, false);
  const cum = sec.index.cum;

  it('전진(s 증가)은 경도 단조 증가, 후퇴 없음', () => {
    const via = sliceForMove(sec.index, cum[1]!, cum[3]!, { isLoop: false });
    expect(via).not.toBeNull();
    for (let i = 1; i < via!.length; i++) expect(via![i]!.lng).toBeGreaterThanOrEqual(via![i - 1]!.lng);
  });

  it('하행(s 감소)은 reverse — 진행 순서대로 경도 감소', () => {
    const via = sliceForMove(sec.index, cum[3]!, cum[1]!, { isLoop: false })!;
    expect(via[0]!.lng).toBeGreaterThan(via[via.length - 1]!.lng);
  });

  it('점프 상한 초과는 직선 폴백(null)', () => {
    expect(sliceForMove(sec.index, cum[0]!, cum[4]!, { isLoop: false, maxSpanM: 500 })).toBeNull();
  });

  it('미세 이동(정지)은 null', () => {
    expect(sliceForMove(sec.index, cum[2]!, cum[2]! + 1, { isLoop: false })).toBeNull();
  });
});

describe('sliceForMove — 순환 시임', () => {
  // 사각 링 4역 + 닫는 점. 시임 교차 이동은 직선 폴백(null), 링 내부 이동은 슬라이스.
  const ring = makeSection(
    [
      { lat: 37.5, lng: 127.0 },
      { lat: 37.5, lng: 127.02 },
      { lat: 37.52, lng: 127.02 },
      { lat: 37.52, lng: 127.0 },
    ],
    ['P', 'Q', 'R', 'S'],
    true,
  );
  const cum = ring.index.cum;
  const total = ring.index.totalM;

  it('시임 비교차 전진은 슬라이스', () => {
    const via = sliceForMove(ring.index, cum[0]!, cum[1]!, { isLoop: true });
    expect(via).not.toBeNull();
    expect(via!.length).toBeGreaterThanOrEqual(2);
  });

  it('시임 교차(마지막→첫 역)는 직선 폴백(null)', () => {
    // 마지막 역 직전(s≈total-10) → 첫 역 직후(s≈10): 전진이지만 sCur<sPrev = 시임 교차.
    expect(sliceForMove(ring.index, total - 10, 10, { isLoop: true })).toBeNull();
  });
});

// 좌표/호길이 없는 순서 전용 section — 탑승 상세('앞으로 지날 역')가 쓰는 입력.
const orderSection = (names: string[], isLoop: boolean, sectionKey = 'main') => ({
  sectionKey,
  isLoop,
  byName: new Map(names.map((n, i) => [n, i])),
  stationCount: names.length,
});

describe('resolveTrainSection — 순서 질의(좌표 없이 section·순번·방향)', () => {
  const sec = orderSection(NAMES, false);

  it('현재역이 없으면 null', () => {
    expect(resolveTrainSection([sec], item({ statnNm: 'Z' }))).toBeNull();
  });

  it('행선으로 방향 판정 — 순번 증가/감소', () => {
    expect(resolveTrainSection([sec], item({ destinationName: 'E' }))!.dir).toBe(1);
    expect(resolveTrainSection([sec], item({ destinationName: 'A' }))!.dir).toBe(-1);
  });

  it('현재역 순번은 section 내 0-based', () => {
    const m = resolveTrainSection([sec], item({ statnNm: 'D' }))!;
    expect(m.stationIdx).toBe(3);
  });

  it('행선 미해석이면 updnLine 폴백, 그마저 없으면 dir 0', () => {
    expect(
      resolveTrainSection([sec], item({ destinationName: null, updnLine: '1' }))!.dir,
    ).toBe(1);
    expect(
      resolveTrainSection([sec], item({ destinationName: null, updnLine: '9' }))!.dir,
    ).toBe(0);
  });

  it('지선 행선은 지선 section 선택 — locateTrain 과 같은 판정', () => {
    const main = orderSection(['A', 'B', '성수'], false);
    const branch = orderSection(['성수', '용답', '신답'], false, 'seongsu');
    const m = resolveTrainSection(
      [main, branch],
      item({ statnNm: '성수', destinationName: '성수지선' }),
    )!;
    expect(m.sectionKey).toBe('seongsu');
  });

  it('순환은 짧은 호 방향 — 시임을 넘는 행선도 전진으로', () => {
    const ring = orderSection(['P', 'Q', 'R', 'S'], true);
    // S(3) → Q(1): 전진 2칸 vs 후진 2칸 — 동률이면 전진.
    expect(resolveTrainSection([ring], item({ statnNm: 'S', destinationName: 'Q' }))!.dir).toBe(1);
    // P(0) → S(3): 전진 3칸 vs 후진 1칸 — 후진.
    expect(resolveTrainSection([ring], item({ statnNm: 'P', destinationName: 'S' }))!.dir).toBe(-1);
  });
});
