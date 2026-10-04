// 코스 일정표 합성(10차) — 순수 함수 모음(DB 없음). tour-plan.service 가 지역 프로필을 만들어 넘긴다.
//
// 원칙: 개별 여행의 하루 동선(어느 장소를 어떤 순서로 갔는지)은 읽지 않는다. 재료는 전부 집계다.
//   · 뼈대 — 식사 자리와 볼거리 자리의 순서("볼거리>식당>볼거리>식당")와 자리별 도착 시각 중앙. 여행 TOUR_K_MIN 건 이상에서 나온 순서만 쓴다.
//   · 장소 — 추천 후보(여행 5건 이상). 자리의 묶음·시간대에 맞고 앞 장소에서 가까운 곳을 고른다.
//   · 이동 — 구간 기록(직선거리 → 분)을 거리 구간별 평균으로 접은 모델.
// 그래서 결과는 "많은 여행에서 흔한 하루 흐름에, 많은 여행자가 만족한 장소를 끼워 넣은 예시" 이고 누군가의 실제 하루가 아니다.

import { TOUR_ITINERARY_MAX_DAYS, TOUR_K_MIN, haversineM } from '@repo/utils';

export type PlanDayPos = 'only' | 'first' | 'mid' | 'last';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const medianOf = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
export const planKmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => haversineM(a, b) / 1000;

// ── 시간대 ─────────────────────────────────────────────────────────────────────
// 0 오전(6~10시) · 1 점심(11~13시) · 2 오후(14~16시) · 3 저녁(17~20시) · 4 밤(21~5시). 장소의 주 방문 시간대와 자리 적합도에 쓴다.
export const PLAN_BAND_LABELS = ['오전', '점심', '오후', '저녁', '밤'] as const;
export const planBandOf = (hour: number): number => (hour >= 6 && hour <= 10 ? 0 : hour >= 11 && hour <= 13 ? 1 : hour >= 14 && hour <= 16 ? 2 : hour >= 17 && hour <= 20 ? 3 : 4);
export const emptyPlanBands = (): number[] => PLAN_BAND_LABELS.map(() => 0);

// 주 방문 시간대 — 시각 기록이 TOUR_K_MIN 건 이상이고 한 시간대에 45% 이상 몰릴 때만 말한다(아니면 null = 종일 고르게).
const PEAK_MIN_SHARE = 0.45;
export const planPeakLabel = (bands: readonly number[]): string | null => {
  const total = bands.reduce((a, b) => a + b, 0);
  if (total < TOUR_K_MIN) return null;
  let best = 0;
  for (let i = 1; i < bands.length; i += 1) if (bands[i]! > bands[best]!) best = i;
  return bands[best]! / total >= PEAK_MIN_SHARE ? PLAN_BAND_LABELS[best]! : null;
};

// ── 자리 묶음 ───────────────────────────────────────────────────────────────────
// 방문 유형은 여행자가 방문마다 적은 값이라 같은 해수욕장이 자연·레저·산책으로 갈리고(운영 집계에서 확인), 유형 순서를 그대로 세면
// 순서마다 표본이 얇아진다. 그래서 뼈대는 "식사 자리(식당·카페)" 와 "볼거리 자리(그 밖의 갈 곳)" 두 가지로만 센다. 볼거리 자리에
// 어떤 유형이 올지는 후보의 시간대·비슷한 여행자 선호·가까움이 정한다.
export const PLAN_SLOT_MEAL = '식당';
export const PLAN_SLOT_SIGHT = '볼거리';
// 식당이 방문의 절반이라(식당 다음에 다시 식당이 가장 흔하다) 식당·카페만 도는 날도 많고, 도착한 날은 볼거리만 들르는 날도 있다 —
// 코스 뼈대로는 식사 자리와 볼거리 자리가 둘 다 있는 날만 쓴다. 볼거리 자리는 하루 4곳까지 1곳, 5곳부터는 2곳 이상.
const minSightSlots = (len: number): number => (len >= 5 ? 2 : 1);
const isCourseDay = (types: readonly string[]): boolean => {
  const sights = types.filter((t) => t !== PLAN_SLOT_MEAL).length;
  return sights >= minSightSlots(types.length) && sights < types.length;
};

// ── 하루 뼈대 ───────────────────────────────────────────────────────────────────
// 여행 하루의 공개 방문을 순서대로 놓고 자리에 넣지 않을 유형(이동·숙소·마트 …)을 뺀 뒤 자리 묶음으로 바꾼 것. 장소는 들어 있지 않다.
export interface PlanTripDay {
  travelId: string;
  pos: PlanDayPos;
  types: string[];
  hours: Array<number | null>;
}
export interface PlanSkeleton {
  types: string[];
  // 자리별 도착 시각(시) 중앙 — 뒤 자리가 앞 자리보다 이르지 않게 맞춘 값.
  hours: number[];
  trips: number;
}
export interface PlanSkeletonSet {
  // 일차 위치별 뼈대(여행 수 내림차순).
  byPos: Record<PlanDayPos, PlanSkeleton[]>;
  // 그 위치의 하루 방문 수 중앙(표본이 모자라면 null) — 여행 속도.
  targetLen: Record<PlanDayPos, number | null>;
}
const POSITIONS: readonly PlanDayPos[] = ['only', 'first', 'mid', 'last'];
// 뼈대로 쓰는 하루 길이 — 첫날·마지막 날은 이동이 끼어 짧다.
const LEN_BOUNDS: Record<PlanDayPos, readonly [number, number]> = { only: [3, 6], first: [2, 5], mid: [3, 6], last: [2, 5] };
const HOUR_MIN_SAMPLES = 3;
// 표본이 전혀 없을 때의 기본 뼈대.
const DEFAULT_SKELETON: Record<PlanDayPos, { types: string[]; hours: number[] }> = {
  only: { types: [PLAN_SLOT_SIGHT, PLAN_SLOT_MEAL, PLAN_SLOT_SIGHT, PLAN_SLOT_MEAL], hours: [10, 12, 14, 18] },
  first: { types: [PLAN_SLOT_MEAL, PLAN_SLOT_SIGHT, PLAN_SLOT_MEAL], hours: [13, 15, 18] },
  mid: { types: [PLAN_SLOT_SIGHT, PLAN_SLOT_MEAL, PLAN_SLOT_SIGHT, PLAN_SLOT_MEAL], hours: [10, 12, 14, 18] },
  last: { types: [PLAN_SLOT_SIGHT, PLAN_SLOT_MEAL], hours: [10, 12] },
};
const fallbackHours = (len: number, pos: PlanDayPos): number[] => {
  const start = pos === 'first' ? 13 : 10;
  const end = pos === 'last' ? 14 : 19;
  return Array.from({ length: len }, (_, i) => (len === 1 ? start : Math.round(start + ((end - start) * i) / (len - 1))));
};
const skeletonKey = (types: readonly string[]): string => types.join('>');

export const emptyPlanSkeletonSet = (): PlanSkeletonSet => ({
  byPos: { only: [], first: [], mid: [], last: [] },
  targetLen: { only: null, first: null, mid: null, last: null },
});

export const buildPlanSkeletons = (days: Iterable<PlanTripDay>, minTrips = TOUR_K_MIN): PlanSkeletonSet => {
  const acc: Record<PlanDayPos, Map<string, { types: string[]; trips: Set<string>; hours: number[][] }>> = { only: new Map(), first: new Map(), mid: new Map(), last: new Map() };
  const lens: Record<PlanDayPos, number[]> = { only: [], first: [], mid: [], last: [] };
  const lenTrips: Record<PlanDayPos, Set<string>> = { only: new Set(), first: new Set(), mid: new Set(), last: new Set() };
  for (const d of days) {
    const [lo, hi] = LEN_BOUNDS[d.pos];
    if (d.types.length < lo || d.types.length > hi) continue;
    // 하루 방문 수(여행 속도)는 식당만·볼거리만 도는 날까지 포함해 세고, 뼈대 후보에서만 뺀다.
    lens[d.pos].push(d.types.length);
    lenTrips[d.pos].add(d.travelId);
    if (!isCourseDay(d.types)) continue;
    const key = skeletonKey(d.types);
    const cur = acc[d.pos].get(key) ?? { types: d.types, trips: new Set<string>(), hours: d.types.map(() => [] as number[]) };
    acc[d.pos].set(key, cur);
    cur.trips.add(d.travelId);
    for (let i = 0; i < d.types.length; i += 1) {
      const h = d.hours[i] ?? null;
      if (h !== null && h >= 0 && h < 24) cur.hours[i]!.push(h);
    }
  }
  const out = emptyPlanSkeletonSet();
  for (const pos of POSITIONS) {
    out.targetLen[pos] = lenTrips[pos].size >= minTrips ? Math.round(medianOf(lens[pos])) : null;
    out.byPos[pos] = [...acc[pos].values()]
      .filter((s) => s.trips.size >= minTrips)
      .map((s) => {
        const fb = fallbackHours(s.types.length, pos);
        const hours = s.hours.map((hs, i) => (hs.length >= HOUR_MIN_SAMPLES ? Math.round(medianOf(hs)) : fb[i]!));
        for (let i = 1; i < hours.length; i += 1) hours[i] = Math.max(hours[i]!, hours[i - 1]!);
        return { types: s.types, hours, trips: s.trips.size };
      })
      .sort((a, b) => b.trips - a.trips || skeletonKey(a.types).localeCompare(skeletonKey(b.types)));
  }
  return out;
};

export type PlanPatternBasis = 'similar' | 'region' | 'default';
export interface PickedPlanSkeleton extends PlanSkeleton {
  basis: PlanPatternBasis;
}
const DEFAULT_LEN: Record<PlanDayPos, number> = { only: 4, first: 3, mid: 4, last: 2 };

// 일차 뼈대 고르기 — 비슷한 여행의 뼈대를 먼저, 없으면 지역 전체, 그것도 없으면 기본. 하루 길이는 비슷한 여행의 속도(중앙)에
// 가까운 것을 앞세우고, 가운데 날이 여럿이면 nth 로 다음 순위를 돌려 써서 날마다 흐름이 달라지게 한다.
export const pickPlanSkeleton = (pos: PlanDayPos, nth: number, similar: PlanSkeletonSet, region: PlanSkeletonSet): PickedPlanSkeleton => {
  const target = similar.targetLen[pos] ?? region.targetLen[pos] ?? DEFAULT_LEN[pos];
  const rank = (xs: PlanSkeleton[]): PlanSkeleton[] =>
    [...xs].sort((a, b) => Math.abs(a.types.length - target) - Math.abs(b.types.length - target) || b.trips - a.trips || skeletonKey(a.types).localeCompare(skeletonKey(b.types)));
  const seen = new Set<string>();
  const list: PickedPlanSkeleton[] = [];
  for (const [basis, set] of [
    ['similar', similar],
    ['region', region],
  ] as const) {
    for (const s of rank(set.byPos[pos])) {
      const key = skeletonKey(s.types);
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ ...s, basis });
    }
  }
  if (list.length === 0) return { ...DEFAULT_SKELETON[pos], trips: 0, basis: 'default' };
  return list[nth % list.length]!;
};

// ── 이동시간 모델 ────────────────────────────────────────────────────────────────
// 같은 날 이어진 두 공개 방문의 (직선거리, 이동 분)을 거리 구간별 평균으로 접는다. 구간에 기록이 20건 이상인 점이 3개
// 이상일 때만 실측(observed)으로 치고, 아니면 기본 속도(직선 1km 에 1.8분 + 6분)를 쓴다.
// 중앙값이 아니라 평균인 이유 — 원본의 도착·출발 시각이 30분 단위라 이동 분이 0·30·60 으로만 찍힌다(운영 집계: 렌터카 중앙 30분,
// 도보 0분). 중앙값은 "15km 까지는 전부 30분" 같은 계단이 되지만, 반올림 오차는 평균에서 상쇄된다. 그래서 0분 구간도 버리지
// 않고, 중간에 다른 일을 한 긴 공백만 상위 10% 값으로 눌러(윈저화) 평균을 낸다.
export interface PlanLegModel {
  points: Array<{ km: number; min: number }>;
  observed: boolean;
}
const LEG_BUCKET_EDGES = [1, 3, 6, 10, 15, 25, 40, 70] as const;
const LEG_MIN_SAMPLES = 20;
const LEG_MIN_POINTS = 3;
const LEG_WINSOR_Q = 0.9;
const LEG_DEFAULT = { base: 6, perKm: 1.8 } as const;
const meanOf = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const winsorizedMean = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  const cap = s[Math.floor((s.length - 1) * q)]!;
  return meanOf(s.map((x) => Math.min(x, cap)));
};

export const fitPlanLegModel = (pairs: Iterable<{ km: number; min: number }>): PlanLegModel => {
  const buckets = Array.from({ length: LEG_BUCKET_EDGES.length + 1 }, () => ({ kms: [] as number[], mins: [] as number[] }));
  for (const p of pairs) {
    if (!(p.km >= 0.2 && p.km <= 150) || !(p.min >= 0 && p.min <= 300)) continue;
    const i = LEG_BUCKET_EDGES.findIndex((edge) => p.km < edge);
    const b = buckets[i < 0 ? LEG_BUCKET_EDGES.length : i]!;
    b.kms.push(p.km);
    b.mins.push(p.min);
  }
  const points = buckets.filter((b) => b.kms.length >= LEG_MIN_SAMPLES).map((b) => ({ km: meanOf(b.kms), min: winsorizedMean(b.mins, LEG_WINSOR_Q) }));
  // 먼 구간이 가까운 구간보다 빨리 끝나는 역전은 표본 잡음이다 — 단조로 편다.
  for (let i = 1; i < points.length; i += 1) points[i]!.min = Math.max(points[i]!.min, points[i - 1]!.min);
  return { points, observed: points.length >= LEG_MIN_POINTS };
};

// 직선거리(km) → 이동 분(5분 단위, 최소 5분).
export const planLegMin = (model: PlanLegModel, km: number): number => {
  let raw = LEG_DEFAULT.base + LEG_DEFAULT.perKm * km;
  if (model.observed) {
    const pts = model.points;
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    if (km <= first.km) raw = first.min * (0.5 + (0.5 * km) / first.km);
    else if (km >= last.km) {
      const prev = pts[pts.length - 2]!;
      raw = last.min + clamp((last.min - prev.min) / Math.max(0.1, last.km - prev.km), 0.8, 3) * (km - last.km);
    } else {
      const i = pts.findIndex((p) => p.km > km);
      const a = pts[i - 1]!;
      const b = pts[i]!;
      raw = a.min + ((b.min - a.min) * (km - a.km)) / Math.max(0.1, b.km - a.km);
    }
  }
  return Math.max(5, Math.round(raw / 5) * 5);
};

// ── 하루 권역 ───────────────────────────────────────────────────────────────────
// 방문이 많은 장소부터 놓으며, 가장 가까운 권역 중심이 반경 안이면 거기에 넣고 아니면 새 권역을 연다(리더 군집 — 결정적).
export interface PlanZone {
  lat: number;
  lng: number;
  weight: number;
}
export const buildPlanZones = (places: ReadonlyArray<{ id: string; lat: number; lng: number; n: number }>, radiusKm: number): PlanZone[] => {
  const zones: PlanZone[] = [];
  for (const p of [...places].sort((a, b) => b.n - a.n || a.id.localeCompare(b.id))) {
    let best = -1;
    let bestKm = Number.POSITIVE_INFINITY;
    zones.forEach((z, i) => {
      const d = planKmBetween(z, p);
      if (d < bestKm) {
        bestKm = d;
        best = i;
      }
    });
    if (best >= 0 && bestKm <= radiusKm) zones[best]!.weight += p.n;
    else zones.push({ lat: p.lat, lng: p.lng, weight: p.n });
  }
  return zones;
};

// ── 일정 합성 ───────────────────────────────────────────────────────────────────
export interface PlanCandidate {
  id: string;
  // 세부 유형(자연·상업 …)과 자리 묶음(PLAN_SLOT_MEAL | PLAN_SLOT_SIGHT).
  kind: string;
  slot: string;
  lat: number;
  lng: number;
  // 추천 점수(목록과 같은 값 — 보정 만족도·방문 수·비슷한 여행자 선호).
  score: number;
  stayMin: number | null;
  // 시간대별 방문 수(5칸) · 여러 날 여행에서의 일차 위치별 방문 수.
  bands: readonly number[];
  pos: { first: number; mid: number; last: number };
  // 등록된 맛집 — 식당 자리에서 조금 앞세운다(상세·리뷰 분석으로 이어진다).
  registered: boolean;
}
export interface PlanSynthInput {
  days: number;
  candidates: readonly PlanCandidate[];
  zones: readonly PlanZone[];
  // 권역 중심에서 이 거리 안의 후보가 그날 후보다.
  reachKm: number;
  skeletons: { similar: PlanSkeletonSet; region: PlanSkeletonSet };
  // 지역 전체에서 일차 위치별 방문 비중(여러 날 여행) — 첫날·마지막 날에 유독 많이 가는 곳을 가리는 기준.
  posBase: { first: number; mid: number; last: number };
  legModel: PlanLegModel;
  // 유형별 체류 중앙(분) — 장소 값이 없을 때.
  typeStay: ReadonlyMap<string, number>;
}
export interface PlanSynthStop {
  id: string;
  arriveMin: number;
  stayMin: number;
  moveMin: number | null;
  moveKm: number | null;
  altIds: string[];
}
export interface PlanSynthDay {
  pos: PlanDayPos;
  basis: PlanPatternBasis;
  stops: PlanSynthStop[];
}

const MIN_STOPS = 2;
const ALT_PER_STOP = 2;
const ALT_RANK_KEEP = 10;
// 대안은 고른 장소에서 이 거리 안 — 같은 자리를 대신할 수 있을 만큼 가까운 곳만.
const ALT_MAX_KM = 8;
const LAST_ARRIVE_MIN = 23 * 60;
const STAY_DEFAULT = 60;
const STAY_RANGE = [20, 240] as const;
const POS_PRIOR = 5;
const REGISTERED_BONUS = 1.15;
// 앞 장소에서의 거리 감쇠(8km 에서 절반) · 그날 첫 자리는 권역 중심 기준으로 느슨하게.
const PROX_KM = 8;
const PROX_FIRST_KM = 20;
// 같은 날 볼거리 자리에 같은 세부 유형이 또 오면 조금 깎는다(해수욕장만 세 곳이 되지 않게).
const SAME_KIND_FACTOR = 0.85;

const hourFit = (c: PlanCandidate, band: number): number => {
  const total = c.bands.reduce((a, b) => a + b, 0);
  return 0.4 + (c.bands[band]! + 0.5) / (total + 2.5);
};
const posFit = (c: PlanCandidate, pos: PlanDayPos, base: PlanSynthInput['posBase']): number => {
  if (pos !== 'first' && pos !== 'last') return 1;
  const total = c.pos.first + c.pos.mid + c.pos.last;
  const b = base[pos];
  if (!(b > 0) || total === 0) return 1;
  return clamp((c.pos[pos] + POS_PRIOR * b) / (total + POS_PRIOR) / b, 0.6, 1.8);
};
const prox = (km: number, scale: number): number => 1 / (1 + km / scale);

interface FilledSlot {
  c: PlanCandidate;
  slot: number;
  score: number;
  ranked: PlanCandidate[];
}
interface DayPlan {
  pos: PlanDayPos;
  sk: PickedPlanSkeleton;
  zone: number;
}

const permutations = <T>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest])));

export const synthesizePlanItinerary = (input: PlanSynthInput): PlanSynthDay[] => {
  const n = clamp(Math.round(input.days), 1, TOUR_ITINERARY_MAX_DAYS);
  if (input.zones.length === 0 || input.candidates.length === 0) return [];
  const reachByZone = input.zones.map((z) => input.candidates.filter((c) => planKmBetween(z, c) <= input.reachKm));

  // 한 권역에서 뼈대 자리를 앞에서부터 채운다 — 자리 묶음이 같은 후보 중 점수 × 시간대 적합 × 일차 위치 적합 × 가까움이 큰 곳.
  const fillDay = (zi: number, sk: PickedPlanSkeleton, pos: PlanDayPos, used: ReadonlySet<string>): { slots: FilledSlot[]; total: number } => {
    const zone = input.zones[zi]!;
    const reach = reachByZone[zi]!.filter((c) => !used.has(c.id));
    const taken = new Set<string>();
    const sightKinds = new Set<string>();
    const slots: FilledSlot[] = [];
    let prev: PlanCandidate | null = null;
    for (let slot = 0; slot < sk.types.length; slot += 1) {
      const type = sk.types[slot]!;
      const meal = type === PLAN_SLOT_MEAL;
      const band = planBandOf(sk.hours[slot]!);
      const from: PlanCandidate | null = prev;
      const near = (c: PlanCandidate): number => (from ? prox(planKmBetween(from, c), PROX_KM) : prox(planKmBetween(zone, c), PROX_FIRST_KM));
      const extra = (c: PlanCandidate): number => (meal ? (c.registered ? REGISTERED_BONUS : 1) : sightKinds.has(c.kind) ? SAME_KIND_FACTOR : 1);
      const ranked = reach
        .filter((c) => c.slot === type && !taken.has(c.id))
        .map((c) => ({ c, s: c.score * hourFit(c, band) * posFit(c, pos, input.posBase) * near(c) * extra(c) }))
        .sort((a, b) => b.s - a.s || a.c.id.localeCompare(b.c.id));
      const top = ranked[0];
      if (!top) continue;
      slots.push({ c: top.c, slot, score: top.s, ranked: ranked.slice(1, 1 + ALT_RANK_KEEP).map((r) => r.c) });
      taken.add(top.c.id);
      if (!meal) sightKinds.add(top.c.kind);
      prev = top.c;
    }
    // 자리를 다 못 채운 권역은 그만큼 깎는다(인기 장소 하나로 하루를 차지하지 않게).
    return { slots, total: slots.reduce((a, s) => a + s.score, 0) * (slots.length / sk.types.length) };
  };
  const rankZones = (p: DayPlan, used: ReadonlySet<string>) =>
    input.zones
      .map((_, zi) => ({ zi, ...fillDay(zi, p.sk, p.pos, used) }))
      .filter((r) => r.slots.length >= MIN_STOPS)
      .sort((a, b) => b.total - a.total || a.zi - b.zi);

  const positions: PlanDayPos[] = n === 1 ? ['only'] : ['first', ...Array.from({ length: n - 2 }, () => 'mid' as const), 'last'];
  let midNth = 0;
  const plans: DayPlan[] = positions.map((pos) => ({ pos, sk: pickPlanSkeleton(pos, pos === 'mid' ? midNth++ : 0, input.skeletons.similar, input.skeletons.region), zone: -1 }));

  // 권역 배정 — 첫날·마지막 날을 먼저(그날 유독 많이 가는 동네가 따로 있다), 가운데 날은 남은 권역 중 점수 순. 권역이 모자라면 다시 쓴다.
  const none: ReadonlySet<string> = new Set();
  const takenZones = new Set<number>();
  const order = [0, ...(n > 1 ? [n - 1] : []), ...Array.from({ length: Math.max(0, n - 2) }, (_, i) => i + 1)];
  for (const di of order) {
    const ranked = rankZones(plans[di]!, none);
    const pick = ranked.find((r) => !takenZones.has(r.zi)) ?? ranked[0];
    if (!pick) continue;
    plans[di]!.zone = pick.zi;
    takenZones.add(pick.zi);
  }

  // 가운데 날 순서 — 첫날 → … → 마지막 날 권역 중심을 잇는 길이가 가장 짧은 순열(가운데 날은 많아야 3개).
  if (n > 3) {
    const mids = plans.slice(1, n - 1);
    const pathKm = (seq: DayPlan[]): number => {
      const pts = [plans[0]!, ...seq, plans[n - 1]!].filter((p) => p.zone >= 0).map((p) => input.zones[p.zone]!);
      let km = 0;
      for (let i = 1; i < pts.length; i += 1) km += planKmBetween(pts[i - 1]!, pts[i]!);
      return km;
    };
    let best = mids;
    let bestKm = pathKm(mids);
    for (const perm of permutations(mids)) {
      const km = pathKm(perm);
      if (km < bestKm - 1e-9) {
        best = perm;
        bestKm = km;
      }
    }
    plans.splice(1, n - 2, ...best);
  }

  // 채우기 → 시간표. 한 번 쓴 장소는 다시 쓰지 않는다. 배정과 같은 순서(첫날 → 마지막 날 → 가운데 날)로 채워, 후보가 모자랄 때
  // 가운데 날이 마지막 날 동네의 장소를 먼저 가져가지 않게 한다(못 채운 날은 뺀다). 도착은 앞 장소 출발 + 이동과 그 자리의 흔한 시각 중 늦은 쪽.
  type BuiltStop = Omit<PlanSynthStop, 'altIds'> & { c: PlanCandidate; ranked: PlanCandidate[] };
  const used = new Set<string>();
  const built: Array<{ plan: DayPlan; stops: BuiltStop[] } | null> = plans.map(() => null);
  for (const di of order) {
    const plan = plans[di]!;
    let fill = plan.zone >= 0 ? fillDay(plan.zone, plan.sk, plan.pos, used) : null;
    if (!fill || fill.slots.length < MIN_STOPS) fill = rankZones(plan, used)[0] ?? null;
    if (!fill) continue;
    const stops: BuiltStop[] = [];
    let t = 0;
    let prev: PlanCandidate | null = null;
    for (const s of fill.slots) {
      const target = plan.sk.hours[s.slot]! * 60;
      let moveMin: number | null = null;
      let moveKm: number | null = null;
      if (prev) {
        const km = planKmBetween(prev, s.c);
        moveMin = planLegMin(input.legModel, km);
        moveKm = Math.round(km * 10) / 10;
        t = Math.max(t + moveMin, target);
      } else t = target;
      const arriveMin = Math.round(t / 10) * 10;
      if (arriveMin > LAST_ARRIVE_MIN) break;
      const stayMin = clamp(Math.round((s.c.stayMin ?? input.typeStay.get(s.c.kind) ?? STAY_DEFAULT) / 10) * 10, STAY_RANGE[0], STAY_RANGE[1]);
      stops.push({ id: s.c.id, arriveMin, stayMin, moveMin, moveKm, c: s.c, ranked: s.ranked });
      t = arriveMin + stayMin;
      prev = s.c;
    }
    if (stops.length < MIN_STOPS) continue;
    for (const s of stops) used.add(s.id);
    built[di] = { plan, stops };
  }

  // 자리별 대안 — 일정에 쓰이지 않았고 고른 장소에서 가까운 후보를 그 자리 점수 순으로(같은 날 안에서는 겹치지 않게).
  const out: PlanSynthDay[] = [];
  for (const day of built) {
    if (!day) continue;
    const altSeen = new Set<string>();
    out.push({
      pos: day.plan.pos,
      basis: day.plan.sk.basis,
      stops: day.stops.map(({ ranked, c: chosen, ...stop }) => {
        const altIds = ranked
          .filter((c) => !used.has(c.id) && !altSeen.has(c.id) && planKmBetween(chosen, c) <= ALT_MAX_KM)
          .slice(0, ALT_PER_STOP)
          .map((c) => c.id);
        for (const id of altIds) altSeen.add(id);
        return { ...stop, altIds };
      }),
    });
  }
  return out;
};
