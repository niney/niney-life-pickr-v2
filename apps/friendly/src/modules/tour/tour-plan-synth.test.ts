import { describe, expect, it } from 'vitest';
import {
  PLAN_SLOT_MEAL as M,
  PLAN_SLOT_SIGHT as S,
  buildPlanSkeletons,
  buildPlanZones,
  emptyPlanSkeletonSet,
  fitPlanLegModel,
  pickPlanSkeleton,
  planBandOf,
  planLegMin,
  planPeakLabel,
  synthesizePlanItinerary,
  type PlanCandidate,
  type PlanSynthInput,
  type PlanTripDay,
} from './tour-plan-synth.js';

// 코스 일정표 합성(10차) 순수 함수 — 시간대·뼈대·이동 모델·권역·일정. DB 없이 손으로 만든 집계 입력만 쓴다.
// 뼈대의 자리는 두 묶음뿐이다: M = 식사 자리(식당·카페), S = 볼거리 자리(그 밖의 갈 곳).

const day = (travelId: string, pos: PlanTripDay['pos'], types: string[], hours: Array<number | null>): PlanTripDay => ({ travelId, pos, types, hours });
const repeat = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

describe('시간대', () => {
  it('시각 → 5칸(오전·점심·오후·저녁·밤)', () => {
    expect([6, 10, 11, 13, 14, 16, 17, 20, 21, 2].map(planBandOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('주 방문 시간대는 기록 5건 이상이고 한 칸에 45% 이상 몰릴 때만 말한다', () => {
    expect(planPeakLabel([0, 9, 1, 0, 0])).toBe('점심');
    expect(planPeakLabel([2, 2, 2, 2, 2])).toBeNull();
    expect(planPeakLabel([0, 4, 0, 0, 0])).toBeNull();
  });
});

describe('하루 뼈대', () => {
  it('여행 5건 이상에서 나온 자리 순서만 남기고, 자리별 시각은 중앙값(뒤 자리가 앞서지 않게)', () => {
    const set = buildPlanSkeletons([
      ...repeat(6, (i) => day(`t${i}`, 'mid', [S, M, S], [10, 12, 15])),
      // 같은 여행의 가운데 날 둘 — 여행 수는 한 번만 센다.
      day('t0', 'mid', [S, M, S], [9, 13, 11]),
      ...repeat(4, (i) => day(`u${i}`, 'mid', [M, S, M], [12, 15, 18])),
      ...repeat(5, (i) => day(`v${i}`, 'first', [M, S], [null, null])),
      // 길이 밖(1곳)은 뼈대로 쓰지 않는다.
      ...repeat(9, (i) => day(`w${i}`, 'mid', [S], [10])),
    ]);
    expect(set.byPos.mid).toEqual([{ types: [S, M, S], hours: [10, 12, 15], trips: 6 }]);
    expect(set.targetLen.mid).toBe(3);
    // 시각 기록이 없으면 기본 시각(첫날은 13시부터).
    expect(set.byPos.first).toEqual([{ types: [M, S], hours: [13, 19], trips: 5 }]);
    expect(set.byPos.last).toEqual([]);
    expect(set.targetLen.last).toBeNull();
  });

  it('식당만·볼거리만 도는 날은 뼈대로 쓰지 않는다 — 식사 1곳 이상, 볼거리는 하루 4곳까지 1곳·5곳부터 2곳 이상', () => {
    const set = buildPlanSkeletons([
      // 가장 흔하지만 볼거리가 없다.
      ...repeat(20, (i) => day(`a${i}`, 'mid', [M, M, M, M], [10, 12, 15, 18])),
      ...repeat(8, (i) => day(`b${i}`, 'mid', [M, M, S, M], [10, 12, 14, 18])),
      ...repeat(7, (i) => day(`c${i}`, 'mid', [M, M, S, M, M], [10, 12, 14, 16, 19])),
      ...repeat(6, (i) => day(`d${i}`, 'mid', [S, M, S, M, M], [10, 12, 14, 16, 19])),
      // 도착한 날 볼거리만 둘 — 식사 자리가 없어 뺀다.
      ...repeat(9, (i) => day(`e${i}`, 'first', [S, S], [14, 16])),
      ...repeat(5, (i) => day(`f${i}`, 'first', [M, S], [13, 15])),
    ]);
    expect(set.byPos.mid.map((s) => s.types.join('>'))).toEqual([`${M}>${M}>${S}>${M}`, `${S}>${M}>${S}>${M}>${M}`]);
    expect(set.byPos.first.map((s) => s.types.join('>'))).toEqual([`${M}>${S}`]);
    // 하루 방문 수(여행 속도)는 빠진 날까지 포함해 센다.
    expect(set.targetLen.mid).toBe(4);
    expect(set.targetLen.first).toBe(2);
  });

  it('고르기 — 비슷한 여행 → 지역 → 기본 순, 하루 길이는 비슷한 여행의 속도에 가까운 것부터, nth 로 돌려 쓴다', () => {
    const similar = buildPlanSkeletons(repeat(5, (i) => day(`s${i}`, 'mid', [S, M, S, M], [10, 12, 14, 18])));
    const region = buildPlanSkeletons([...repeat(9, (i) => day(`r${i}`, 'mid', [S, M, S], [10, 12, 15])), ...repeat(7, (i) => day(`q${i}`, 'mid', [M, S, S, M], [12, 14, 16, 18]))]);
    expect(pickPlanSkeleton('mid', 0, similar, region)).toMatchObject({ types: [S, M, S, M], basis: 'similar' });
    // 둘째 가운데 날 — 지역 뼈대 중 길이 4(비슷한 여행의 속도)인 것이 여행 수가 더 많은 길이 3 보다 앞선다.
    expect(pickPlanSkeleton('mid', 1, similar, region)).toMatchObject({ types: [M, S, S, M], basis: 'region' });
    expect(pickPlanSkeleton('mid', 2, similar, region)).toMatchObject({ types: [S, M, S], basis: 'region' });
    expect(pickPlanSkeleton('mid', 3, similar, region).basis).toBe('similar');
    expect(pickPlanSkeleton('last', 0, similar, region)).toMatchObject({ types: [S, M], hours: [10, 12], basis: 'default', trips: 0 });
  });
});

describe('이동시간 모델', () => {
  it('거리 구간별 기록이 20건 이상인 점이 3개 이상이면 실측, 사이는 직선 보간·5분 단위', () => {
    const model = fitPlanLegModel([
      ...repeat(20, () => ({ km: 2, min: 10 })),
      ...repeat(20, () => ({ km: 8, min: 20 })),
      ...repeat(20, () => ({ km: 30, min: 50 })),
      // 20건에 못 미치는 구간·말이 안 되는 값은 버린다.
      ...repeat(5, () => ({ km: 12, min: 200 })),
      { km: 0.05, min: 30 },
      { km: 5, min: 900 },
    ]);
    expect(model).toEqual({ observed: true, points: [{ km: 2, min: 10 }, { km: 8, min: 20 }, { km: 30, min: 50 }] });
    expect(planLegMin(model, 5)).toBe(15);
    expect(planLegMin(model, 8)).toBe(20);
    expect(planLegMin(model, 19)).toBe(35);
    // 가장 가까운 점보다 가까우면 그 점의 절반까지 줄고(최소 5분), 가장 먼 점 너머는 마지막 기울기로 잇는다.
    expect(planLegMin(model, 0.2)).toBe(5);
    expect(planLegMin(model, 41)).toBe(65);
  });

  it('30분 단위로 찍힌 기록(0·30·60분) — 중앙값이 아니라 평균이라 0분도 세고, 긴 공백은 상위 10% 값으로 누른다', () => {
    const model = fitPlanLegModel([
      // 2km: 0분 16건·30분 4건 → 평균 6분(중앙값이면 0분).
      ...repeat(16, () => ({ km: 2, min: 0 })),
      ...repeat(4, () => ({ km: 2, min: 30 })),
      // 8km: 0분 8건·30분 12건 → 18분(중앙값이면 30분).
      ...repeat(8, () => ({ km: 8, min: 0 })),
      ...repeat(12, () => ({ km: 8, min: 30 })),
      // 30km: 30분 6건·60분 13건 + 중간에 딴 일을 한 240분 1건 → 240 은 60 으로 눌려 평균 51분.
      ...repeat(6, () => ({ km: 30, min: 30 })),
      ...repeat(13, () => ({ km: 30, min: 60 })),
      { km: 30, min: 240 },
    ]);
    expect(model.observed).toBe(true);
    expect(model.points).toEqual([{ km: 2, min: 6 }, { km: 8, min: 18 }, { km: 30, min: 51 }]);
    expect(planLegMin(model, 5)).toBe(10);
    expect(planLegMin(model, 19)).toBe(35);
  });

  it('기록이 모자라면 기본 속도(직선 1km 에 1.8분 + 6분)', () => {
    const model = fitPlanLegModel(repeat(30, () => ({ km: 2, min: 10 })));
    expect(model.observed).toBe(false);
    expect(planLegMin(model, 10)).toBe(25);
    expect(planLegMin(model, 0)).toBe(5);
  });

  it('먼 구간이 가까운 구간보다 짧게 나오는 역전은 편다', () => {
    const model = fitPlanLegModel([...repeat(20, () => ({ km: 2, min: 25 })), ...repeat(20, () => ({ km: 8, min: 15 })), ...repeat(20, () => ({ km: 30, min: 50 }))]);
    expect(model.points.map((p) => p.min)).toEqual([25, 25, 50]);
  });
});

describe('하루 권역', () => {
  it('방문 많은 곳부터 놓고 반경 안이면 합친다 — 입력 순서와 무관', () => {
    const places = [
      { id: 'c', lat: 33.46, lng: 126.94, n: 40 },
      { id: 'a', lat: 33.51, lng: 126.52, n: 60 },
      { id: 'a2', lat: 33.5, lng: 126.5, n: 10 },
      { id: 'b', lat: 33.39, lng: 126.24, n: 50 },
    ];
    const zones = buildPlanZones(places, 12);
    expect(zones).toEqual([
      { lat: 33.51, lng: 126.52, weight: 70 },
      { lat: 33.39, lng: 126.24, weight: 50 },
      { lat: 33.46, lng: 126.94, weight: 40 },
    ]);
    expect(buildPlanZones([...places].reverse(), 12)).toEqual(zones);
  });
});

// ── 일정 합성 ───────────────────────────────────────────────────────────────────
// 세 동네(제주시내 A · 한림 B · 성산 C). 첫날은 A, 마지막 날은 C 에 방문이 몰려 있다.
const cand = (id: string, kind: string, lat: number, lng: number, score: number, opt: Partial<PlanCandidate> = {}): PlanCandidate => ({
  id,
  kind,
  slot: kind === '식당' ? M : S,
  lat,
  lng,
  score,
  stayMin: 60,
  bands: [0, 0, 0, 0, 0],
  pos: { first: 0, mid: 0, last: 0 },
  registered: false,
  ...opt,
});
const A = { lat: 33.512, lng: 126.527 };
const B = { lat: 33.394, lng: 126.24 };
const C = { lat: 33.458, lng: 126.942 };
const candidates: PlanCandidate[] = [
  cand('a-food', '식당', A.lat, A.lng + 0.005, 6, { bands: [0, 20, 0, 0, 0], pos: { first: 20, mid: 0, last: 0 } }),
  cand('a-food2', '식당', A.lat - 0.01, A.lng, 4, { bands: [0, 6, 0, 0, 0], pos: { first: 6, mid: 0, last: 0 } }),
  cand('a-nature', '자연', A.lat + 0.004, A.lng - 0.015, 4, { bands: [0, 0, 20, 0, 0], pos: { first: 20, mid: 0, last: 0 } }),
  // 시장은 저녁에 몰린다 — 14시 볼거리 자리에는 낮에 가는 곳이, 17시 자리에는 시장이 온다.
  cand('a-market', '상업', A.lat, A.lng, 5, { bands: [0, 0, 2, 18, 0], pos: { first: 20, mid: 0, last: 0 }, stayMin: null }),
  cand('b-beach', '자연', B.lat, B.lng, 7, { bands: [20, 0, 0, 0, 0], pos: { first: 0, mid: 20, last: 0 }, stayMin: 90 }),
  cand('b-lunch', '식당', B.lat - 0.001, B.lng + 0.003, 4, { bands: [0, 20, 0, 0, 0], pos: { first: 0, mid: 20, last: 0 } }),
  cand('b-park', '테마', B.lat - 0.005, B.lng, 4, { bands: [0, 0, 20, 0, 0], pos: { first: 0, mid: 20, last: 0 }, stayMin: 120 }),
  cand('b-beach2', '자연', B.lat - 0.004, B.lng - 0.004, 4.4, { bands: [0, 0, 20, 0, 0], pos: { first: 0, mid: 20, last: 0 } }),
  cand('b-cafe', '식당', B.lat - 0.004, B.lng - 0.005, 4.5, { bands: [0, 0, 20, 0, 0], pos: { first: 0, mid: 20, last: 0 } }),
  cand('c-peak', '자연', C.lat, C.lng, 8, { bands: [20, 0, 0, 0, 0], pos: { first: 0, mid: 0, last: 20 } }),
  cand('c-cape', '자연', C.lat - 0.034, C.lng - 0.012, 3, { bands: [6, 0, 0, 0, 0], pos: { first: 0, mid: 0, last: 6 } }),
  cand('c-food', '식당', C.lat + 0.002, C.lng - 0.006, 4, { bands: [0, 20, 0, 0, 0], pos: { first: 0, mid: 0, last: 20 } }),
];
const similar = buildPlanSkeletons([
  ...repeat(6, (i) => day(`t${i}`, 'first', [M, S, S], [12, 14, 17])),
  ...repeat(6, (i) => day(`t${i}`, 'mid', [S, M, S, M], [10, 12, 14, 16])),
  ...repeat(6, (i) => day(`t${i}`, 'last', [S, M], [9, 12])),
]);
const baseInput = (over: Partial<PlanSynthInput> = {}): PlanSynthInput => ({
  days: 3,
  candidates,
  zones: buildPlanZones(candidates.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, n: Math.round(c.score * 10) })), 12),
  reachKm: 15,
  skeletons: { similar, region: emptyPlanSkeletonSet() },
  posBase: { first: 0.35, mid: 0.4, last: 0.25 },
  legModel: fitPlanLegModel([]),
  typeStay: new Map([['상업', 40]]),
  ...over,
});

describe('일정 합성', () => {
  it('2박 3일 — 첫날·마지막 날에 많이 가는 동네를 그날에 놓고, 자리는 묶음·시간대·가까움으로 채운다', () => {
    const days = synthesizePlanItinerary(baseInput());
    expect(days.map((d) => [d.pos, d.basis, d.stops.map((s) => s.id)])).toEqual([
      // 14시 볼거리 자리는 낮에 가는 곳, 17시 자리는 저녁에 몰리는 시장.
      ['first', 'similar', ['a-food', 'a-nature', 'a-market']],
      // 12시 식사 자리는 점심에 몰린 곳, 16시 식사 자리는 오후에 몰린 곳(카페) — 점수는 카페가 더 높아도 점심 자리엔 안 온다.
      // 14시 볼거리 자리는 점수가 더 높은 해수욕장(b-beach2)이 아니라 테마(b-park) — 같은 날 같은 유형이 또 오면 깎는다.
      ['mid', 'similar', ['b-beach', 'b-lunch', 'b-park', 'b-cafe']],
      ['last', 'similar', ['c-peak', 'c-food']],
    ]);
    // 한 번 쓴 장소는 다시 쓰지 않는다.
    const ids = days.flatMap((d) => d.stops.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('시간표 — 도착은 앞 장소 출발 + 이동과 그 자리의 흔한 시각 중 늦은 쪽, 첫 장소는 이동 없음', () => {
    const [first, mid] = synthesizePlanItinerary(baseInput());
    expect(first!.stops.map((s) => s.arriveMin)).toEqual([720, 840, 1020]);
    expect(first!.stops[0]).toMatchObject({ moveMin: null, moveKm: null, stayMin: 60 });
    // 장소 체류값이 없으면 유형 중앙(상업 40분).
    expect(first!.stops[2]!.stayMin).toBe(40);
    // 한림공원 14:00 도착 + 120분 = 16:00, 이동 5분 → 16:05 → 10분 단위 16:10.
    expect(mid!.stops.map((s) => [s.arriveMin, s.stayMin])).toEqual([
      [600, 90],
      [720, 60],
      [840, 120],
      [970, 60],
    ]);
    for (const s of mid!.stops.slice(1)) {
      expect(s.moveMin).toBeGreaterThanOrEqual(5);
      expect(s.moveMin! % 5).toBe(0);
      expect(s.moveKm).toBeGreaterThan(0);
    }
  });

  it('대안 — 일정에 쓰이지 않았고 고른 장소에서 가까운 같은 묶음 후보(세부 유형은 달라도 된다)', () => {
    const days = synthesizePlanItinerary(baseInput());
    expect(days[0]!.stops[0]!.altIds).toEqual(['a-food2']);
    expect(days[2]!.stops[0]!.altIds).toEqual(['c-cape']);
    // 남은 해수욕장(b-beach2)은 아침 볼거리 자리의 대안으로 한 번만 나온다 — 같은 날 안에서는 대안이 겹치지 않는다.
    expect(days[1]!.stops[0]!.altIds).toEqual(['b-beach2']);
    expect(days[1]!.stops[2]!.altIds).toEqual([]);
  });

  it('당일 — 하루, 권역 하나', () => {
    const days = synthesizePlanItinerary(baseInput({ days: 1, skeletons: { similar: emptyPlanSkeletonSet(), region: emptyPlanSkeletonSet() } }));
    expect(days).toHaveLength(1);
    // 기본 뼈대(볼거리>식당>볼거리>식당)를 채울 수 있는 만큼 — 점수가 가장 높게 차는 권역.
    expect(days[0]).toMatchObject({ pos: 'only', basis: 'default' });
    expect(days[0]!.stops.length).toBeGreaterThanOrEqual(2);
  });

  it('일수가 권역보다 많으면 장소는 겹치지 않고, 채울 수 없는 가운데 날을 뺀다(첫날·마지막 날이 먼저)', () => {
    const days = synthesizePlanItinerary(baseInput({ days: 5 }));
    const ids = days.flatMap((d) => d.stops.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(days.map((d) => d.pos)).toEqual(['first', 'mid', 'last']);
  });

  it('후보나 권역이 없으면 빈 일정', () => {
    expect(synthesizePlanItinerary(baseInput({ candidates: [] }))).toEqual([]);
    expect(synthesizePlanItinerary(baseInput({ zones: [] }))).toEqual([]);
  });

  it('같은 입력이면 같은 결과(결정적)', () => {
    expect(synthesizePlanItinerary(baseInput())).toEqual(synthesizePlanItinerary(baseInput({ candidates: [...candidates].reverse() })));
  });
});
