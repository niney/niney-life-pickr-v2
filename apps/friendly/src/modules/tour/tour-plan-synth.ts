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

// 일차 뼈대 고르기 — 하루 길이가 비슷한 여행의 속도(하루 자리 수 중앙)에 가까운 것부터, 같은 길이면 비슷한 여행의 뼈대를 지역
// 전체보다 앞에, 그다음 여행 수 순. 하나도 없으면 기본 뼈대. 가운데 날이 여럿이면 nth 로 다음 순위를 돌려 써서 날마다 흐름이
// 달라지게 한다.
// lenShift(11차) — 속도 입력. 중앙에서 하나 줄이거나 늘린 길이를 목표로 삼는다(그 길이의 실제 뼈대가 있을 때만 달라진다).
export const pickPlanSkeleton = (pos: PlanDayPos, nth: number, similar: PlanSkeletonSet, region: PlanSkeletonSet, lenShift = 0): PickedPlanSkeleton => {
  const [lo, hi] = LEN_BOUNDS[pos];
  const target = clamp((similar.targetLen[pos] ?? region.targetLen[pos] ?? DEFAULT_LEN[pos]) + lenShift, lo, hi);
  const seen = new Set<string>();
  const list: PickedPlanSkeleton[] = [];
  for (const [basis, set] of [
    ['similar', similar],
    ['region', region],
  ] as const) {
    for (const s of set.byPos[pos]) {
      const key = skeletonKey(s.types);
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ ...s, basis });
    }
  }
  if (list.length === 0) return { ...DEFAULT_SKELETON[pos], trips: 0, basis: 'default' };
  const off = (s: PlanSkeleton): number => Math.abs(s.types.length - target);
  const rankOf = (b: PlanPatternBasis): number => (b === 'similar' ? 0 : 1);
  list.sort((a, b) => off(a) - off(b) || rankOf(a.basis) - rankOf(b.basis) || b.trips - a.trips || skeletonKey(a.types).localeCompare(skeletonKey(b.types)));
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
  // 다른 수단의 모델을 빌려 쓸 때의 보정(대중교통 기록이 모자라면 차 모델 × factor + extra 분).
  factor?: number;
  extra?: number;
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
  return Math.max(5, Math.round((raw * (model.factor ?? 1) + (model.extra ?? 0)) / 5) * 5);
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
  // 추천 점수(목록과 같은 값 — 보정 만족도·방문 수·비슷한 여행자 선호·취향).
  score: number;
  stayMin: number | null;
  // 시간대별 방문 수(5칸) · 여러 날 여행에서의 일차 위치별 방문 수.
  bands: readonly number[];
  pos: { first: number; mid: number; last: number };
  // 등록된 맛집 — 식당 자리에서 조금 앞세운다(상세·리뷰 분석으로 이어진다).
  registered: boolean;
  // 사실상 같은 곳 묶음(13차 — "대왕암공원" 과 "대왕암공원 출렁다리"). 한 일정에는 묶음에서 한 곳만 쓴다. 없으면 자기 혼자.
  group?: string;
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
  // ── 11차 입력 확장(전부 선택) ──
  // 속도 — 하루 자리 수를 중앙에서 가감(여유 −1 · 빽빽 +1).
  lenShift?: number;
  // 앞 장소와의 거리 감쇠 척도(km). 기본 8, 대중교통은 더 좁게.
  proxKm?: number;
  // 꼭 갈 곳(후보 id) — 그 장소가 든 권역을 먼저 날에 주고 자리에 고정한다. 권역 반경(pinReachKm) 안이면 reachKm 밖이어도 넣는다.
  pinned?: ReadonlySet<string>;
  pinReachKm?: number;
  // 숙소 동네 중심 — 가까운 권역을 앞세우고 숙소에서/까지의 이동을 붙인다. stayScaleKm = 숙소에서 먼 권역의 감쇠 척도(이 거리에서
  // 절반. 기본 45km — 제주는 끝에서 끝도 하루에 다녀온다. 동선이 좁은 지역은 그만큼 좁게 준다).
  stay?: { lat: number; lng: number } | null;
  stayScaleKm?: number;
  // ── 12차 날씨 ──
  // 비 오는 일차 번호(1부터)와 그날 후보 점수에 곱할 유형별 배수(야외는 1 미만, 실내에 가까운 유형은 1 초과, 없는 유형은 1).
  wetDays?: ReadonlySet<number>;
  wetFactor?: ReadonlyMap<string, number>;
  // ── 13차 제주 밖 지역 ──
  // 일정 전체가 머무는 반경(km). 거점 권역 중심에서 이 거리 안의 권역만 날에 준다(꼭 갈 곳이 든 권역은 멀어도 준다). 거점은
  // 숙소 동네 → 꼭 갈 곳이 든 권역 → 며칠을 가장 알차게 채우는 권역 순으로 정한다. 날을 다 못 채우면 두 배까지 넓혀 본다.
  // null·생략 = 제한 없음(제주 — 섬 전체가 하루 거리).
  hubKm?: number | null;
  // 식사 자리에 넣을 식당 후보가 그 권역에 없으면 볼거리로 채운다(식당마다 표본이 얇은 지역).
  mealFallback?: boolean;
  // ── 14차 다른 코스 보기 ──
  // 변형 번호(0·생략 = 점수가 가장 높은 코스). 0 이 아니면 후보와 권역의 점수에 번호별로 고정된 잡음을 곱해, 1등 대신 상위권이
  // 번갈아 뽑히게 한다. 같은 번호는 같은 결과다(난수를 차례로 뽑지 않고 번호와 후보 id 로 정한다 — 권역을 견줄 때와 채울 때
  // 같은 후보가 같은 점수로 보여야 한다).
  variant?: number;
}
export interface PlanSynthStop {
  id: string;
  arriveMin: number;
  stayMin: number;
  moveMin: number | null;
  moveKm: number | null;
  pinned: boolean;
  altIds: string[];
}
export interface PlanSynthDay {
  pos: PlanDayPos;
  basis: PlanPatternBasis;
  stops: PlanSynthStop[];
  // 숙소에서 첫 장소까지 / 마지막 장소에서 숙소까지(분). 숙소 입력이 없거나 도착·출발하는 쪽이면 null.
  fromStayMin: number | null;
  toStayMin: number | null;
  // 비 오는 날로 짰는가.
  wet: boolean;
}
export interface PlanSynthResult {
  days: PlanSynthDay[];
  // 일정에 넣지 못한 꼭 갈 곳(id).
  unplaced: string[];
  // 거점(13차) — 거점 반경(hubKm)을 쓰지 않았으면 null. zone = 거점 권역(zones 의 번호), lat·lng = 그 권역에서 하루를 채웠을 때
  // 들르는 곳들의 중심(예보 지점을 고를 자리), day = 거점 권역에서 보내는 날(days 의 번호 — 숙소로 정한 거점이거나 그날을 못
  // 채웠으면 null).
  hub: { zone: number; lat: number; lng: number; day: number | null } | null;
}

const MIN_STOPS = 2;
const MAX_SLOTS = 7;
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
// 숙소에서 먼 권역의 감쇠(45km 에서 절반) — 제주 끝에서 끝도 하루에 다녀오므로 완만하게.
const STAY_SCALE_KM = 45;
// 꼭 갈 곳 때문에 자리를 늘릴 때의 시각 — 그 장소에 가장 많이 가는 시간대의 대표 시각.
const BAND_HOUR = [9, 12, 15, 18, 21] as const;
// 거점 반경 안에서 날을 다 못 채우면 이 배수까지 넓혀 한 번 더 짠다(그래도 모자라면 채운 날만 낸다).
const HUB_RELAX = 2;
// 변형(14차)의 잡음 폭 — 후보 점수 ±35%, 권역 점수 ±30%. 1등의 절반에 못 미치는 후보는 어떤 번호에서도 1등을 못 이긴다
// (0.65 ÷ 1.35 ≈ 0.48). 권역은 하루 점수의 합이라 후보 잡음이 서로 지워진다 — 권역에도 따로 준다.
const VARIANT_CANDIDATE_SPREAD = 0.35;
const VARIANT_ZONE_SPREAD = 0.3;

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
// 번호와 열쇠로 정해지는 [0, 1) 값(FNV-1a 뒤섞기) — 변형 잡음용. 같은 번호·같은 열쇠는 늘 같은 값이다.
const hash01 = (seed: number, key: string): number => {
  let h = (2166136261 ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};
const jitter = (variant: number, key: string, spread: number): number => (variant === 0 ? 1 : 1 + spread * (2 * hash01(variant, key) - 1));
const peakHour = (c: PlanCandidate): number => {
  let best = -1;
  for (let i = 0; i < c.bands.length; i += 1) if (c.bands[i]! > 0 && (best < 0 || c.bands[i]! > c.bands[best]!)) best = i;
  return best < 0 ? (c.slot === PLAN_SLOT_MEAL ? 12 : 15) : BAND_HOUR[best]!;
};

interface Slot {
  type: string;
  hour: number;
  fixed: PlanCandidate | null;
}
interface FilledSlot {
  c: PlanCandidate;
  hour: number;
  score: number;
  ranked: PlanCandidate[];
  pinned: boolean;
}
interface DayFill {
  slots: FilledSlot[];
  total: number;
}
interface DayPlan {
  pos: PlanDayPos;
  sk: PickedPlanSkeleton;
  zone: number;
  wet: boolean;
}

const permutations = <T>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest])));

export const synthesizePlanItinerary = (input: PlanSynthInput): PlanSynthResult => {
  const n = clamp(Math.round(input.days), 1, TOUR_ITINERARY_MAX_DAYS);
  const pinned: ReadonlySet<string> = input.pinned ?? new Set<string>();
  const unplacedAll = (): string[] => [...pinned];
  if (input.zones.length === 0 || input.candidates.length === 0) return { days: [], unplaced: unplacedAll(), hub: null };
  const proxKm = input.proxKm ?? PROX_KM;
  const pinReachKm = Math.max(input.reachKm, input.pinReachKm ?? input.reachKm);
  const stay = input.stay ?? null;
  const reachByZone = input.zones.map((z) =>
    input.candidates.filter((c) => {
      const km = planKmBetween(z, c);
      return km <= input.reachKm || (pinned.has(c.id) && km <= pinReachKm);
    }),
  );
  const stayFactor = input.zones.map((z) => (stay ? prox(planKmBetween(z, stay), input.stayScaleKm ?? STAY_SCALE_KM) : 1));
  // 변형 잡음 — 후보마다·권역마다 한 번 정해 두고 어디서나 같은 값을 쓴다. 꼭 갈 곳은 사용자가 고른 것이라 흔들지 않는다.
  const variant = Math.max(0, Math.round(input.variant ?? 0));
  const candNoise = new Map(input.candidates.map((c) => [c.id, pinned.has(c.id) ? 1 : jitter(variant, c.id, VARIANT_CANDIDATE_SPREAD)]));
  const zoneNoise = input.zones.map((_, zi) => jitter(variant, `zone:${zi}`, VARIANT_ZONE_SPREAD));
  // 같은 묶음의 후보 id — 한 곳을 쓰면 묶음 전체를 쓴 것으로 친다.
  const groupIds = new Map<string, string[]>();
  for (const c of input.candidates) {
    const key = c.group ?? c.id;
    const ids = groupIds.get(key) ?? [];
    ids.push(c.id);
    groupIds.set(key, ids);
  }
  const markAll = (set: Set<string>, c: PlanCandidate): void => {
    for (const id of groupIds.get(c.group ?? c.id) ?? [c.id]) set.add(id);
  };

  // 한 권역에서 하루를 채운다. ① 꼭 갈 곳을 묶음이 같은 자리 중 그 장소의 시간대에 가장 맞는 자리에 먼저 놓고(맞는 자리가 없으면
  // 그 장소에 가장 많이 가는 시각에 자리를 하나 늘린다) ② 남은 자리를 앞에서부터 — 묶음이 같은 후보 중 점수 × 시간대 적합 ×
  // 일차 위치 적합 × 가까움이 큰 곳으로 채운다.
  const wetOf = (c: PlanCandidate, wet: boolean): number => (wet ? (input.wetFactor?.get(c.kind) ?? 1) : 1);
  const fillDay = (zi: number, sk: PickedPlanSkeleton, pos: PlanDayPos, used: ReadonlySet<string>, wet: boolean): DayFill => {
    const zone = input.zones[zi]!;
    const reach = reachByZone[zi]!.filter((c) => !used.has(c.id));
    const slots: Slot[] = sk.types.map((type, i) => ({ type, hour: sk.hours[i]!, fixed: null }));
    const pins = reach.filter((c) => pinned.has(c.id)).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    for (const pin of pins) {
      let best = -1;
      let bestFit = -1;
      slots.forEach((s, i) => {
        if (s.fixed || s.type !== pin.slot) return;
        const fit = hourFit(pin, planBandOf(s.hour));
        if (fit > bestFit) {
          bestFit = fit;
          best = i;
        }
      });
      if (best >= 0) slots[best]!.fixed = pin;
      else if (slots.length < MAX_SLOTS) {
        const hour = peakHour(pin);
        const at = slots.findIndex((s) => s.hour > hour);
        slots.splice(at < 0 ? slots.length : at, 0, { type: pin.slot, hour, fixed: pin });
      }
    }
    const taken = new Set<string>();
    for (const s of slots) if (s.fixed) markAll(taken, s.fixed);
    const sightKinds = new Set<string>();
    const filled: FilledSlot[] = [];
    let prev: PlanCandidate | null = null;
    for (const s of slots) {
      const band = planBandOf(s.hour);
      const from: PlanCandidate | null = prev;
      // 식당은 등록된 맛집을 조금 앞세우고, 볼거리는 그날 이미 나온 세부 유형이면 조금 깎는다.
      const scoreOf = (c: PlanCandidate): number =>
        c.score *
        candNoise.get(c.id)! *
        wetOf(c, wet) *
        hourFit(c, band) *
        posFit(c, pos, input.posBase) *
        (from ? prox(planKmBetween(from, c), proxKm) : prox(planKmBetween(zone, c), PROX_FIRST_KM)) *
        (c.slot === PLAN_SLOT_MEAL ? (c.registered ? REGISTERED_BONUS : 1) : sightKinds.has(c.kind) ? SAME_KIND_FACTOR : 1);
      const rankFor = (slot: string): Array<{ c: PlanCandidate; s: number }> =>
        reach
          .filter((c) => c.slot === slot && !taken.has(c.id))
          .map((c) => ({ c, s: scoreOf(c) }))
          .sort((a, b) => b.s - a.s || a.c.id.localeCompare(b.c.id));
      let ranked = rankFor(s.type);
      // 식사 자리인데 이 권역에 남은 식당 후보가 없다(13차) — 그 시각에 맞는 볼거리로 채운다. 식사는 일정 밖으로 남는다.
      if (!s.fixed && ranked.length === 0 && s.type === PLAN_SLOT_MEAL && input.mealFallback) ranked = rankFor(PLAN_SLOT_SIGHT);
      const pick = s.fixed ?? ranked[0]?.c;
      if (!pick) continue;
      filled.push({
        c: pick,
        hour: s.hour,
        score: s.fixed ? scoreOf(s.fixed) : ranked[0]!.s,
        ranked: ranked.slice(s.fixed ? 0 : 1, (s.fixed ? 0 : 1) + ALT_RANK_KEEP).map((r) => r.c),
        pinned: s.fixed !== null,
      });
      markAll(taken, pick);
      if (pick.slot !== PLAN_SLOT_MEAL) sightKinds.add(pick.kind);
      prev = pick;
    }
    // 자리를 다 못 채운 권역은 그만큼 깎는다(인기 장소 하나로 하루를 차지하지 않게).
    return { slots: filled, total: filled.reduce((a, s) => a + s.score, 0) * (filled.length / slots.length) };
  };
  // 꼭 갈 곳이 든 날은 한 곳뿐이어도 살린다.
  const enough = (f: DayFill): boolean => f.slots.length >= (f.slots.some((s) => s.pinned) ? 1 : MIN_STOPS);
  const none: ReadonlySet<string> = new Set();
  const positions: PlanDayPos[] = n === 1 ? ['only'] : ['first', ...Array.from({ length: n - 2 }, () => 'mid' as const), 'last'];
  // 대안은 고른 장소에서 가까운 곳만 — 하루 권역이 좁은 지역은 그 반경까지.
  const altKm = Math.min(ALT_MAX_KM, input.reachKm);

  // 꼭 갈 곳이 든 권역(가장 가까운 권역 중심) — 점수 합이 큰 순.
  const pinScore = new Map<number, number>();
  for (const c of input.candidates) {
    if (!pinned.has(c.id)) continue;
    let best = -1;
    let bestKm = Number.POSITIVE_INFINITY;
    input.zones.forEach((z, zi) => {
      const km = planKmBetween(z, c);
      if (km < bestKm) {
        bestKm = km;
        best = zi;
      }
    });
    if (best >= 0 && bestKm <= pinReachKm) pinScore.set(best, (pinScore.get(best) ?? 0) + c.score);
  }
  const pinZones = [...pinScore.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([zi]) => zi);

  // 거점 반경 하나(limitKm)로 일정을 짠다. null 이면 반경 제한 없이(제주).
  const attempt = (limitKm: number | null): PlanSynthResult => {
    let midNth = 0;
    const plans: DayPlan[] = positions.map((pos, di) => ({
      pos,
      sk: pickPlanSkeleton(pos, pos === 'mid' ? midNth++ : 0, input.skeletons.similar, input.skeletons.region, input.lenShift ?? 0),
      zone: -1,
      wet: input.wetDays?.has(di + 1) ?? false,
    }));

    // 거점(13차) — 숙소 동네가 있으면 그곳, 꼭 갈 곳이 있으면 그 권역(점수 합이 가장 큰 곳), 아니면 며칠을 가장 알차게 채우는 동네:
    // 권역마다 하루를 채운 점수를 내고(첫 일차 뼈대 기준. 날씨는 보지 않는다 — 예보가 거점을 흔들면 예보 지점도 따라 바뀐다),
    // 반경의 절반 안에 있는 권역의 점수를 높은 것부터 일수만큼 더한 값이 가장 큰 묶음을 찾아, 그 묶음에서 하루 점수가 가장 높은
    // 권역을 거점으로 삼는다. 절반으로 재는 이유 — 반경 전체로 재면 두 도시의 중간(강릉과 속초 사이의 주문진)이 양쪽을 다 품어
    // 일정이 두 도시를 오간다. 묶음의 중심이 아니라 가장 센 권역을 거점으로 삼는 이유 — 중심은 이름 없는 길목이기 쉽다.
    // 날에 줄 수 있는 권역은 거점에서 반경 안 + 꼭 갈 곳이 든 권역.
    // 거리는 권역 중심이 아니라 "그 권역에서 하루를 채웠을 때 들르는 곳들의 중심" 끼리 잰다 — 권역 중심은 군집의 씨앗일 뿐이고
    // 후보는 반경 안에서 고르므로, 이웃 권역의 인기 장소로 하루를 채우는 권역은 중심과 실제 동선이 반경만큼 어긋난다
    // (강릉 북쪽 권역: 중심에서는 속초가 38km 안인데 하루는 강문해변에서 보낸다). 재는 대상도 표본의 "날짜 사이 이동 거리" 와 같아진다.
    let hubZone: number | null = null;
    let hubSpot: { lat: number; lng: number } | null = null;
    let within: boolean[] | null = null;
    if (limitKm !== null) {
      const first = plans[0]!;
      const fills = input.zones.map((_, zi) => fillDay(zi, first.sk, first.pos, none, false));
      const dayValue = fills.map((f, zi) => (enough(f) ? f.total * zoneNoise[zi]! : 0));
      const spot = input.zones.map((z, zi) => {
        const cs = dayValue[zi]! > 0 ? fills[zi]!.slots.map((x) => x.c) : [];
        return cs.length > 0 ? { lat: cs.reduce((a, c) => a + c.lat, 0) / cs.length, lng: cs.reduce((a, c) => a + c.lng, 0) / cs.length } : { lat: z.lat, lng: z.lng };
      });
      const gapKm = (a: number, b: number): number => planKmBetween(spot[a]!, spot[b]!);
      if (stay) {
        let bestKm = Number.POSITIVE_INFINITY;
        for (let zi = 0; zi < input.zones.length; zi += 1) {
          const km = planKmBetween(input.zones[zi]!, stay);
          if (km < bestKm) {
            bestKm = km;
            hubZone = zi;
          }
        }
      } else if (pinZones.length > 0) hubZone = pinZones[0]!;
      else {
        let center = -1;
        let bestValue = 0;
        for (let zi = 0; zi < input.zones.length; zi += 1) {
          if (!(dayValue[zi]! > 0)) continue;
          const value = dayValue
            .map((v, wi) => (gapKm(zi, wi) <= limitKm / 2 ? v : 0))
            .sort((a, b) => b - a)
            .slice(0, n)
            .reduce((a, b) => a + b, 0);
          if (value > bestValue) {
            bestValue = value;
            center = zi;
          }
        }
        if (center >= 0) {
          hubZone = center;
          for (let zi = 0; zi < input.zones.length; zi += 1) {
            if (gapKm(center, zi) <= limitKm / 2 && dayValue[zi]! > dayValue[hubZone]!) hubZone = zi;
          }
        }
      }
      if (hubZone !== null) {
        const hub = hubZone;
        hubSpot = spot[hub]!;
        within = input.zones.map((_, zi) => pinZones.includes(zi) || gapKm(hub, zi) <= limitKm);
      }
    }
    const rankZones = (p: DayPlan, used: ReadonlySet<string>) =>
      input.zones
        .map((_, zi) => zi)
        .filter((zi) => within === null || within[zi]!)
        .map((zi) => ({ zi, ...fillDay(zi, p.sk, p.pos, used, p.wet) }))
        .filter(enough)
        .map((r) => ({ ...r, total: r.total * stayFactor[r.zi]! * zoneNoise[r.zi]! }))
        .sort((a, b) => b.total - a.total || a.zi - b.zi);
    const takenZones = new Set<number>();

    // 권역 배정 ① 꼭 갈 곳이 든 권역을 먼저 날에 준다 — 가운데 날부터, 없으면 첫날·마지막 날. 그 권역을 가장 잘 채우는 날에
    // 놓는다. 날보다 권역이 많으면 점수 합이 큰 권역부터.
    for (const zi of pinZones) {
      const free = plans.map((_, di) => di).filter((di) => plans[di]!.zone < 0);
      const mids = free.filter((di) => plans[di]!.pos === 'mid');
      const pool = mids.length > 0 ? mids : free;
      if (pool.length === 0) break;
      let bestDay = pool[0]!;
      let bestTotal = -1;
      for (const di of pool) {
        const total = fillDay(zi, plans[di]!.sk, plans[di]!.pos, none, plans[di]!.wet).total;
        if (total > bestTotal) {
          bestTotal = total;
          bestDay = di;
        }
      }
      plans[bestDay]!.zone = zi;
      takenZones.add(zi);
    }

    // 권역 배정 ①′ 거점 권역에도 하루를 준다(13차) — 거점은 그 여행의 중심 동네다. 그 권역을 가장 잘 채우는 날에 놓는다.
    // 숙소로 정한 거점은 잠자리일 뿐이라 주지 않는다(가까운 권역이 점수로 앞설 뿐).
    if (hubZone !== null && !stay && !takenZones.has(hubZone)) {
      let bestDay = -1;
      let bestTotal = -1;
      plans.forEach((plan, di) => {
        if (plan.zone >= 0) return;
        const fill = fillDay(hubZone!, plan.sk, plan.pos, none, plan.wet);
        if (enough(fill) && fill.total > bestTotal) {
          bestTotal = fill.total;
          bestDay = di;
        }
      });
      if (bestDay >= 0) {
        plans[bestDay]!.zone = hubZone;
        takenZones.add(hubZone);
      }
    }

    // 권역 배정 ② 나머지 — 첫날·마지막 날을 먼저(그날 유독 많이 가는 동네가 따로 있다), 가운데 날은 남은 권역 중 점수 순.
    // 권역이 모자라면 다시 쓴다(거점 반경이 좁은 지역은 같은 동네에서 이틀을 보내기도 한다).
    const order = [0, ...(n > 1 ? [n - 1] : []), ...Array.from({ length: Math.max(0, n - 2) }, (_, i) => i + 1)];
    for (const di of order) {
      if (plans[di]!.zone >= 0) continue;
      const ranked = rankZones(plans[di]!, none);
      const pick = ranked.find((r) => !takenZones.has(r.zi)) ?? ranked[0];
      if (!pick) continue;
      plans[di]!.zone = pick.zi;
      takenZones.add(pick.zi);
    }

    // 가운데 날 순서 — 첫날 → … → 마지막 날 권역 중심을 잇는 길이가 가장 짧은 순열(가운데 날은 많아야 3개). 비 오는 날과 아닌 날이
    // 섞여 있으면 바꾸지 않는다 — 권역을 그날 날씨에 맞춰 골랐으므로 날짜를 옮기면 안 된다.
    if (n > 3 && new Set(plans.slice(1, n - 1).map((p) => p.wet)).size === 1) {
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
    // used = 쓴 장소와 그 묶음(다시 고르지 않는다) · placed = 실제로 일정에 든 장소(못 넣은 꼭 갈 곳을 가릴 때).
    const used = new Set<string>();
    const placed = new Set<string>();
    const built: Array<{ plan: DayPlan; stops: BuiltStop[]; zone: number } | null> = plans.map(() => null);
    for (const di of order) {
      const plan = plans[di]!;
      let zone = plan.zone;
      let fill: DayFill | null = zone >= 0 ? fillDay(zone, plan.sk, plan.pos, used, plan.wet) : null;
      if (!fill || !enough(fill)) {
        // 배정한 권역에 남은 후보가 모자라다 — 지금 남은 후보로 가장 잘 채워지는 권역으로.
        const next = rankZones(plan, used)[0];
        fill = next ?? null;
        zone = next?.zi ?? -1;
      }
      if (!fill) continue;
      const stops: BuiltStop[] = [];
      let t = 0;
      let prev: PlanCandidate | null = null;
      for (const s of fill.slots) {
        const target = s.hour * 60;
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
        stops.push({ id: s.c.id, arriveMin, stayMin, moveMin, moveKm, pinned: s.pinned, c: s.c, ranked: s.ranked });
        t = arriveMin + stayMin;
        prev = s.c;
      }
      if (stops.length < (stops.some((s) => s.pinned) ? 1 : MIN_STOPS)) continue;
      for (const s of stops) {
        markAll(used, s.c);
        placed.add(s.id);
      }
      built[di] = { plan, stops, zone };
    }

    // 자리별 대안 — 일정에 쓰이지 않았고 고른 장소에서 가까운 후보를 그 자리 점수 순으로(같은 날 안에서는 겹치지 않게).
    // 숙소 이동 — 도착한 날은 숙소로 돌아가는 쪽만, 떠나는 날은 숙소에서 나오는 쪽만, 당일은 없다.
    const days: PlanSynthDay[] = [];
    let hubDay: number | null = null;
    for (const day of built) {
      if (!day) continue;
      if (hubDay === null && !stay && day.zone === hubZone) hubDay = days.length;
      const altSeen = new Set<string>();
      const pos = day.plan.pos;
      const first = day.stops[0]!.c;
      const last = day.stops[day.stops.length - 1]!.c;
      days.push({
        pos,
        basis: day.plan.sk.basis,
        stops: day.stops.map(({ ranked, c: chosen, ...stop }) => {
          const altIds = ranked
            .filter((c) => !used.has(c.id) && !altSeen.has(c.id) && planKmBetween(chosen, c) <= altKm)
            .slice(0, ALT_PER_STOP)
            .map((c) => c.id);
          for (const id of altIds) altSeen.add(id);
          return { ...stop, altIds };
        }),
        fromStayMin: stay && (pos === 'mid' || pos === 'last') ? planLegMin(input.legModel, planKmBetween(stay, first)) : null,
        toStayMin: stay && (pos === 'mid' || pos === 'first') ? planLegMin(input.legModel, planKmBetween(last, stay)) : null,
        wet: day.plan.wet,
      });
    }
    return { days, unplaced: [...pinned].filter((id) => !placed.has(id)), hub: hubZone !== null && hubSpot ? { zone: hubZone, ...hubSpot, day: hubDay } : null };
  };

  const hubKm = input.hubKm ?? null;
  if (hubKm === null) return attempt(null);
  const tight = attempt(hubKm);
  if (tight.days.length >= n) return tight;
  const wide = attempt(hubKm * HUB_RELAX);
  return wide.days.length > tight.days.length ? wide : tight;
};
