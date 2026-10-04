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
  planKmBetween,
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

  it('속도 — 목표 길이를 하나 줄이거나 늘려 그 길이의 실제 뼈대를 고른다(범위 밖으로는 안 나간다)', () => {
    const region = buildPlanSkeletons([
      ...repeat(9, (i) => day(`a${i}`, 'mid', [S, M, S, M], [10, 12, 14, 18])),
      ...repeat(6, (i) => day(`b${i}`, 'mid', [S, M, S], [10, 12, 15])),
      ...repeat(5, (i) => day(`c${i}`, 'mid', [S, M, S, S, M], [10, 12, 14, 16, 19])),
    ]);
    const none = emptyPlanSkeletonSet();
    expect(region.targetLen.mid).toBe(4);
    expect(pickPlanSkeleton('mid', 0, none, region).types).toEqual([S, M, S, M]);
    expect(pickPlanSkeleton('mid', 0, none, region, -1).types).toEqual([S, M, S]);
    expect(pickPlanSkeleton('mid', 0, none, region, 1).types).toEqual([S, M, S, S, M]);
    // 가운데 날은 3~6곳 — 목표가 범위를 벗어나면 끝값으로.
    expect(pickPlanSkeleton('mid', 0, none, region, -5).types).toEqual([S, M, S]);
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

  it('다른 수단의 모델을 빌릴 때는 배율과 가산을 얹는다(대중교통 = 차 × 1.8 + 10분)', () => {
    const car = fitPlanLegModel([...repeat(20, () => ({ km: 2, min: 10 })), ...repeat(20, () => ({ km: 8, min: 20 })), ...repeat(20, () => ({ km: 30, min: 50 }))]);
    expect(planLegMin(car, 8)).toBe(20);
    expect(planLegMin({ ...car, factor: 1.8, extra: 10 }, 8)).toBe(45);
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

const planDays = (over: Partial<PlanSynthInput> = {}) => synthesizePlanItinerary(baseInput(over)).days;

describe('일정 합성', () => {
  it('2박 3일 — 첫날·마지막 날에 많이 가는 동네를 그날에 놓고, 자리는 묶음·시간대·가까움으로 채운다', () => {
    const days = planDays();
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
    const [first, mid] = planDays();
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
    const days = planDays();
    expect(days[0]!.stops[0]!.altIds).toEqual(['a-food2']);
    expect(days[2]!.stops[0]!.altIds).toEqual(['c-cape']);
    // 남은 해수욕장(b-beach2)은 아침 볼거리 자리의 대안으로 한 번만 나온다 — 같은 날 안에서는 대안이 겹치지 않는다.
    expect(days[1]!.stops[0]!.altIds).toEqual(['b-beach2']);
    expect(days[1]!.stops[2]!.altIds).toEqual([]);
  });

  it('당일 — 하루, 권역 하나', () => {
    const days = planDays({ days: 1, skeletons: { similar: emptyPlanSkeletonSet(), region: emptyPlanSkeletonSet() } });
    expect(days).toHaveLength(1);
    // 기본 뼈대(볼거리>식당>볼거리>식당)를 채울 수 있는 만큼 — 점수가 가장 높게 차는 권역.
    expect(days[0]).toMatchObject({ pos: 'only', basis: 'default' });
    expect(days[0]!.stops.length).toBeGreaterThanOrEqual(2);
  });

  it('일수가 권역보다 많으면 장소는 겹치지 않고, 채울 수 없는 가운데 날을 뺀다(첫날·마지막 날이 먼저)', () => {
    const days = planDays({ days: 5 });
    const ids = days.flatMap((d) => d.stops.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(days.map((d) => d.pos)).toEqual(['first', 'mid', 'last']);
  });

  it('후보나 권역이 없으면 빈 일정', () => {
    expect(planDays({ candidates: [] })).toEqual([]);
    expect(planDays({ zones: [] })).toEqual([]);
  });

  it('같은 입력이면 같은 결과(결정적)', () => {
    expect(planDays()).toEqual(planDays({ candidates: [...candidates].reverse() }));
  });
});

describe('입력 확장(11차) — 꼭 갈 곳·숙소', () => {
  const plan = (over: Partial<PlanSynthInput> = {}) => synthesizePlanItinerary(baseInput(over));

  it('꼭 갈 곳이 든 동네는 가운데 날이 먼저 가져가고, 그 장소는 시간대가 맞는 자리에 고정된다', () => {
    const r = plan({ pinned: new Set(['c-cape']) });
    expect(r.unplaced).toEqual([]);
    expect(r.days.map((d) => [d.pos, d.stops.map((s) => s.id)])).toEqual([
      ['first', ['a-food', 'a-nature', 'a-market']],
      // 성산(C)이 마지막 날에서 가운데 날로 옮겨 오고, 아침에 가는 섭지코지(c-cape)가 10시 볼거리 자리를 차지한다.
      ['mid', ['c-cape', 'c-food', 'c-peak']],
      ['last', ['b-beach', 'b-lunch']],
    ]);
    expect(r.days[1]!.stops.map((s) => s.pinned)).toEqual([true, false, false]);
  });

  it('같은 동네에 꼭 갈 곳이 자리보다 많으면 그 장소에 많이 가는 시각에 자리를 늘린다', () => {
    const r = plan({ days: 1, skeletons: { similar: emptyPlanSkeletonSet(), region: emptyPlanSkeletonSet() }, pinned: new Set(['b-beach', 'b-beach2', 'b-park']) });
    expect(r.unplaced).toEqual([]);
    // 기본 뼈대(볼거리 10시·식당 12시·볼거리 14시·식당 18시)에 볼거리 자리는 둘 — 셋째(오후에 가는 b-park)는 15시 자리를 새로 낸다.
    expect(r.days[0]!.stops.map((s) => [s.id, s.pinned])).toEqual([
      ['b-beach', true],
      ['b-lunch', false],
      ['b-beach2', true],
      ['b-park', true],
      ['b-cafe', false],
    ]);
  });

  it('날이 모자라 못 넣은 꼭 갈 곳·후보에 없는 id 는 unplaced 로 돌려준다', () => {
    const r = plan({ days: 1, pinned: new Set(['c-cape', 'b-park', 'ghost']) });
    // 하루뿐이라 점수가 더 높은 꼭 갈 곳(b-park)의 동네만 간다.
    expect(r.days).toHaveLength(1);
    expect(r.days[0]!.stops.map((s) => s.id)).toContain('b-park');
    expect([...r.unplaced].sort()).toEqual(['c-cape', 'ghost']);
    expect(plan({ candidates: [], pinned: new Set(['b-park']) })).toEqual({ days: [], unplaced: ['b-park'], hub: null });
  });

  it('숙소 동네 — 도착한 날은 숙소로 가는 쪽, 떠나는 날은 숙소에서 나오는 쪽만 이동 분을 붙인다', () => {
    const r = plan({ stay: B });
    expect(r.days.map((d) => d.pos)).toEqual(['first', 'mid', 'last']);
    const [first, mid, last] = r.days;
    expect(first!.fromStayMin).toBeNull();
    expect(first!.toStayMin).toBeGreaterThan(30);
    // 가운데 날은 숙소 동네(B)를 돈다 — 숙소에서·숙소까지 모두 가깝다.
    expect(mid!.stops[0]!.id).toBe('b-beach');
    expect(mid).toMatchObject({ fromStayMin: 5, toStayMin: 5 });
    expect(last!.fromStayMin).toBeGreaterThan(30);
    expect(last!.toStayMin).toBeNull();
    // 숙소 입력이 없으면 붙이지 않는다.
    expect(plan().days.every((d) => d.fromStayMin === null && d.toStayMin === null)).toBe(true);
  });

  it('숙소에서 먼 동네는 밀린다 — 숙소가 성산이면 가운데 날이 한림(65km) 대신 표선(17km)을 돈다', () => {
    // 표선(D) — 가운데 날 점수가 한림(B)보다 조금 낮은 네 번째 동네.
    const D = { lat: 33.33, lng: 126.84 };
    const midDay = { first: 0, mid: 20, last: 0 };
    const more = [
      ...candidates,
      cand('d-beach', '자연', D.lat, D.lng, 6.5, { bands: [20, 0, 0, 0, 0], pos: midDay }),
      cand('d-lunch', '식당', D.lat - 0.001, D.lng + 0.003, 4, { bands: [0, 20, 0, 0, 0], pos: midDay }),
      cand('d-park', '테마', D.lat - 0.005, D.lng, 3.8, { bands: [0, 0, 20, 0, 0], pos: midDay }),
      cand('d-cafe', '식당', D.lat - 0.004, D.lng - 0.005, 4.2, { bands: [0, 0, 20, 0, 0], pos: midDay }),
    ];
    const zones = buildPlanZones(more.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, n: Math.round(c.score * 10) })), 12);
    const midStart = (over: Partial<PlanSynthInput>) => plan({ candidates: more, zones, ...over }).days[1]!.stops[0]!.id;
    expect(midStart({})).toBe('b-beach');
    expect(midStart({ stay: C })).toBe('d-beach');
  });

  it('당일 여행에는 숙소 이동이 없다', () => {
    const r = plan({ days: 1, stay: B });
    expect(r.days[0]).toMatchObject({ pos: 'only', fromStayMin: null, toStayMin: null });
  });
});

describe('날씨(12차) — 비 오는 날', () => {
  // 한림(B)에 오후에 가는 미술관을 하나 더한다 — 맑은 날엔 점수가 높은 한림공원(테마)에 밀린다.
  const museum = cand('b-museum', '문화', B.lat - 0.004, B.lng + 0.002, 3, { bands: [0, 0, 20, 0, 0], pos: { first: 0, mid: 20, last: 0 } });
  const more = [...candidates, museum];
  const zones = buildPlanZones(more.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, n: Math.round(c.score * 10) })), 12);
  const wetFactor = new Map([
    ['자연', 0.5],
    ['테마', 0.8],
    ['문화', 1.5],
  ]);
  const plan = (over: Partial<PlanSynthInput> = {}) => synthesizePlanItinerary(baseInput({ candidates: more, zones, ...over }));

  it('비 오는 날은 실내에 가까운 유형이 볼거리 자리를 차지한다 — 그날만', () => {
    const dry = plan();
    expect(dry.days.map((d) => d.wet)).toEqual([false, false, false]);
    expect(dry.days[1]!.stops.map((s) => s.id)).toEqual(['b-beach', 'b-lunch', 'b-park', 'b-cafe']);

    const wet = plan({ wetDays: new Set([2]), wetFactor });
    expect(wet.days.map((d) => d.wet)).toEqual([false, true, false]);
    // 14시 볼거리 자리가 한림공원(테마 × 0.8)에서 미술관(문화 × 1.5)으로 바뀐다. 아침 자리는 그 시간대에 갈 곳이 해수욕장뿐이라 그대로.
    expect(wet.days[1]!.stops.map((s) => s.id)).toEqual(['b-beach', 'b-lunch', 'b-museum', 'b-cafe']);
    expect(wet.days[0]!.stops.map((s) => s.id)).toEqual(dry.days[0]!.stops.map((s) => s.id));
    expect(wet.days[2]!.stops.map((s) => s.id)).toEqual(dry.days[2]!.stops.map((s) => s.id));
  });

  it('배수표가 없거나 일정 밖 일차 번호면 아무 일도 없다', () => {
    const dry = plan().days.map((d) => d.stops.map((s) => s.id));
    expect(plan({ wetDays: new Set([2]) }).days.map((d) => d.stops.map((s) => s.id))).toEqual(dry);
    const out = plan({ wetDays: new Set([4, 5]), wetFactor });
    expect(out.days.map((d) => d.wet)).toEqual([false, false, false]);
    expect(out.days.map((d) => d.stops.map((s) => s.id))).toEqual(dry);
  });
});


// ── 13차 제주 밖 지역 ────────────────────────────────────────────────────────────
// 동해안 네 동네 — 강릉(P) · 정동진(Q, P 에서 16km) · 속초(R, P 에서 52km) · 춘천(T, 100km 넘게 떨어진 내륙, 식당 후보 없음).
describe('거점 반경(13차) — 넓은 지역의 일정은 한 동네 주변에서', () => {
  const P = { lat: 37.795, lng: 128.918 };
  const Q = { lat: 37.69, lng: 129.035 };
  const R = { lat: 38.19, lng: 128.602 };
  const T = { lat: 37.88, lng: 127.73 };
  const noon = { bands: [0, 20, 0, 0, 0] };
  const afternoon = { bands: [0, 0, 20, 0, 0] };
  const land: PlanCandidate[] = [
    cand('p-beach', '자연', P.lat, P.lng, 8, afternoon),
    cand('p-market', '상업', P.lat - 0.04, P.lng - 0.02, 6, { bands: [0, 0, 5, 15, 0] }),
    cand('p-museum', '문화', P.lat - 0.005, P.lng - 0.01, 5, afternoon),
    cand('p-pine', '산책', P.lat + 0.004, P.lng - 0.004, 4, { bands: [20, 0, 0, 0, 0] }),
    cand('p-tofu', '식당', P.lat - 0.004, P.lng - 0.003, 5, noon),
    cand('p-cafe', '식당', P.lat + 0.002, P.lng + 0.001, 4, afternoon),
    cand('q-station', '자연', Q.lat, Q.lng, 5, { bands: [20, 0, 0, 0, 0] }),
    cand('q-park', '테마', Q.lat + 0.01, Q.lng - 0.005, 4, afternoon),
    cand('q-food', '식당', Q.lat + 0.002, Q.lng, 3, noon),
    cand('r-beach', '자연', R.lat, R.lng, 9, afternoon),
    cand('r-market', '상업', R.lat + 0.015, R.lng - 0.012, 8, { bands: [0, 0, 5, 15, 0] }),
    cand('r-pavilion', '역사', R.lat + 0.023, R.lng, 6, { bands: [20, 0, 0, 0, 0] }),
    cand('r-food', '식당', R.lat + 0.002, R.lng + 0.002, 5, noon),
    cand('t-island', '자연', T.lat, T.lng, 6, { bands: [20, 0, 0, 0, 0] }),
    cand('t-walk', '자연', T.lat + 0.01, T.lng + 0.01, 4, afternoon),
    cand('t-lake', '산책', T.lat - 0.01, T.lng, 3.5, noon),
  ];
  const zonesOf = (cs: PlanCandidate[]) => buildPlanZones(cs.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, n: Math.round(c.score * 10) })), 9);
  const zones = zonesOf(land);
  const region = buildPlanSkeletons([
    ...repeat(6, (i) => day(`t${i}`, 'first', [M, S, S], [12, 14, 17])),
    ...repeat(6, (i) => day(`t${i}`, 'mid', [S, M, S, M], [10, 12, 14, 16])),
    ...repeat(6, (i) => day(`t${i}`, 'last', [S, M], [9, 12])),
  ]);
  const plan = (over: Partial<PlanSynthInput> = {}) =>
    synthesizePlanItinerary({
      days: 3,
      candidates: land,
      zones,
      reachKm: 9,
      skeletons: { similar: emptyPlanSkeletonSet(), region },
      posBase: { first: 0.3, mid: 0.4, last: 0.3 },
      legModel: fitPlanLegModel([]),
      typeStay: new Map(),
      proxKm: 6,
      ...over,
    });
  const ids = (r: ReturnType<typeof plan>): string[] => r.days.flatMap((d) => d.stops.map((x) => x.id));
  const towns = (r: ReturnType<typeof plan>): string[] => [...new Set(ids(r).map((id) => id[0]!))].sort();
  const zoneAt = (pt: { lat: number; lng: number }): number => zones.findIndex((z) => planKmBetween(z, pt) < 1);

  it('권역 넷 — 방문 많은 순(속초 · 강릉 · 춘천 · 정동진)', () => {
    expect([R, P, T, Q].map(zoneAt)).toEqual([0, 1, 2, 3]);
  });

  it('반경이 없으면 점수대로 속초와 강릉을 오가고, 반경(38km)을 주면 며칠을 가장 알차게 채우는 동네(강릉 + 정동진) 안에서 짠다', () => {
    const free = plan();
    expect(free.hub).toBeNull();
    expect(towns(free)).toEqual(expect.arrayContaining(['p', 'r']));

    const r = plan({ hubKm: 38 });
    expect(r.days).toHaveLength(3);
    expect(towns(r)).toEqual(['p', 'q']);
    // 거점 = 그 묶음에서 하루 점수가 가장 높은 권역(강릉)이고, 그 권역에서 하루를 보낸다. 좌표는 그날 들르는 곳들의 중심.
    expect(r.hub).toMatchObject({ zone: zoneAt(P) });
    expect(r.hub!.day).not.toBeNull();
    expect(r.days[r.hub!.day!]!.stops.every((x) => x.id.startsWith('p-'))).toBe(true);
    expect(planKmBetween(r.hub!, P)).toBeLessThan(5);
  });

  it('반경 안에서 날을 다 못 채우면 두 배까지 넓혀 본다 — 그래도 모자라면 채운 날만', () => {
    // 강릉이 거점, 반경 10km — 강릉 후보로는 이틀만 채워진다 → 20km 로 넓히면 정동진(16km)이 들어와 사흘.
    const south = land.filter((c) => !c.id.startsWith('r-'));
    const r = plan({ hubKm: 10, candidates: south, zones: zonesOf(south) });
    expect(r.days).toHaveLength(3);
    expect(towns(r)).toEqual(['p', 'q']);
    // 속초(52km)가 있어도 넓힌 반경(20km) 밖이라 가지 않고, 정동진이 없으면 강릉에서 이틀만 낸다.
    const noQ = land.filter((c) => !c.id.startsWith('q-') && c.id !== 'r-beach');
    const short = plan({ hubKm: 10, candidates: noQ, zones: zonesOf(noQ) });
    expect(short.hub).toMatchObject({ zone: zonesOf(noQ).findIndex((z) => planKmBetween(z, P) < 1) });
    expect(short.days).toHaveLength(2);
    expect(towns(short)).toEqual(['p']);
  });

  it('숙소 동네가 거점이면 그 주변에서 짜되 그 권역에 하루를 꼭 주지는 않는다(day null)', () => {
    const r = plan({ days: 1, hubKm: 38, stay: zones[zoneAt(R)]! });
    expect(towns(r)).toEqual(['r']);
    expect(r.hub).toMatchObject({ zone: zoneAt(R), day: null });
  });

  it('꼭 갈 곳이 있으면 그 권역이 거점 — 반경 밖의 다른 꼭 갈 곳도 하루를 받는다', () => {
    const one = plan({ hubKm: 38, pinned: new Set(['q-park']) });
    expect(one.hub).toMatchObject({ zone: zoneAt(Q) });
    expect(one.unplaced).toEqual([]);
    expect(towns(one)).toEqual(['p', 'q']);

    const two = plan({ hubKm: 38, pinned: new Set(['p-beach', 'r-pavilion']) });
    // 점수 합이 큰 강릉이 거점, 속초(52km)는 꼭 갈 곳이 있어 하루를 받는다. 춘천은 여전히 밖.
    expect(two.hub).toMatchObject({ zone: zoneAt(P) });
    expect(two.unplaced).toEqual([]);
    expect(ids(two)).toEqual(expect.arrayContaining(['p-beach', 'r-pavilion']));
    expect(towns(two)).not.toContain('t');
  });

  it('거리는 권역 중심이 아니라 하루를 채웠을 때 들르는 곳끼리 잰다 — 이웃 동네의 장소로 하루를 채우는 권역', () => {
    // 권역 Z 의 중심은 강릉 장소들에서 8km 북쪽(후보는 전부 반경 9km 안의 강릉 것). 북쪽 동네 N 은 Z 의 중심에서는 37km 지만
    // 강릉 장소들에서는 45km — 반경(38km) 밖이다.
    const Z = { lat: P.lat + 0.07, lng: P.lng, weight: 100 };
    const N = { lat: Z.lat + 0.33, lng: P.lng, weight: 90 };
    const cs = [
      ...land.filter((c) => c.id.startsWith('p-') && c.id !== 'p-market'),
      cand('n-beach', '자연', N.lat, N.lng, 4, afternoon),
      cand('n-market', '상업', N.lat + 0.01, N.lng, 3, { bands: [0, 0, 5, 15, 0] }),
      cand('n-food', '식당', N.lat + 0.002, N.lng, 2, noon),
    ];
    expect(planKmBetween(Z, N)).toBeLessThan(38);
    expect(planKmBetween(P, N)).toBeGreaterThan(38);
    const r = plan({ days: 2, hubKm: 38, candidates: cs, zones: [Z, N] });
    expect(r.days).toHaveLength(2);
    expect(towns(r)).toEqual(['p']);
    expect(r.hub).toMatchObject({ zone: 0 });
  });

  it('숙소 감쇠 척도 — 좁게 주면 먼 동네(속초)보다 가까운 동네(정동진)가 앞선다', () => {
    // 속초의 아침 볼거리를 세게 — 기본 척도(45km)에서는 52km 떨어져도 속초가 이긴다.
    const strongR = land.map((c) => (c.id === 'r-pavilion' ? { ...c, score: 12 } : c));
    const lastTown = (over: Partial<PlanSynthInput>): string => plan({ days: 2, candidates: strongR, stay: zones[zoneAt(P)]!, ...over }).days[1]!.stops[0]!.id[0]!;
    expect(lastTown({})).toBe('r');
    expect(lastTown({ stayScaleKm: 10 })).toBe('q');
  });
});

describe('식사 자리 대체·같은 곳 묶음(13차)', () => {
  const T = { lat: 37.88, lng: 127.73 };
  const sights: PlanCandidate[] = [
    cand('t-island', '자연', T.lat, T.lng, 6, { bands: [20, 0, 0, 0, 0] }),
    cand('t-walk', '자연', T.lat + 0.01, T.lng + 0.01, 4, { bands: [0, 0, 20, 0, 0] }),
    cand('t-lake', '산책', T.lat - 0.01, T.lng, 3.5, { bands: [0, 20, 0, 0, 0] }),
  ];
  const plan = (cs: PlanCandidate[], over: Partial<PlanSynthInput> = {}) =>
    synthesizePlanItinerary({
      days: 1,
      candidates: cs,
      zones: buildPlanZones(cs.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, n: Math.round(c.score * 10) })), 9),
      reachKm: 9,
      // 뼈대 표본 없음 → 기본 뼈대(볼거리 10시 · 식당 12시 · 볼거리 14시 · 식당 18시).
      skeletons: { similar: emptyPlanSkeletonSet(), region: emptyPlanSkeletonSet() },
      posBase: { first: 0, mid: 0, last: 0 },
      legModel: fitPlanLegModel([]),
      typeStay: new Map(),
      ...over,
    });

  it('식당 후보가 없는 동네 — 그대로면 볼거리 자리 둘만 차고, 대체를 켜면 식사 자리도 그 시각에 맞는 볼거리로 채운다', () => {
    expect(plan(sights).days[0]!.stops.map((x) => x.id)).toEqual(['t-island', 't-walk']);
    // 12시 식사 자리에 점심때 가는 호수(t-lake)가 들어온다. 18시 자리는 남은 후보가 없어 빈다.
    expect(plan(sights, { mealFallback: true }).days[0]!.stops.map((x) => x.id)).toEqual(['t-island', 't-lake', 't-walk']);
  });

  it('식당 후보가 있으면 대체하지 않는다', () => {
    const withMeal = [...sights, cand('t-food', '식당', T.lat + 0.002, T.lng, 2, { bands: [0, 20, 0, 0, 0] })];
    expect(plan(withMeal, { mealFallback: true }).days[0]!.stops.map((x) => x.id)).toEqual(['t-island', 't-food', 't-walk', 't-lake']);
  });

  it('같은 곳 묶음은 한 일정에 한 곳만 — 대안으로도 내지 않는다', () => {
    const bridge = cand('t-island-bridge', '자연', T.lat + 0.001, T.lng, 5, { bands: [0, 0, 20, 0, 0], group: 't-island' });
    const grouped = [{ ...sights[0]!, group: 't-island' }, ...sights.slice(1), bridge];
    const r = plan(grouped, { mealFallback: true });
    const all = r.days.flatMap((d) => d.stops.flatMap((x) => [x.id, ...x.altIds]));
    expect(all).toContain('t-island');
    expect(all).not.toContain('t-island-bridge');
    // 묶음이 없으면 둘 다 들어간다.
    const loose = plan([...sights, { ...bridge, group: undefined }], { mealFallback: true });
    expect(loose.days[0]!.stops.map((x) => x.id)).toEqual(expect.arrayContaining(['t-island', 't-island-bridge']));
  });
});
