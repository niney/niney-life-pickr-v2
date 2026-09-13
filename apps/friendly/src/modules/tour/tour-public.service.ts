// 여행로그 공개 집계(4차) — 맛집 상세·목록·골라주기에 붙는 "여행자 방문 통계". AI 허브 이용조건상 공개 층은 집계뿐이라
// 이 파일이 내는 값에는 여행·방문·여행자 식별자가 없고(계약 스키마도 없음), 집단 분해(동반·연령)는 TOUR_K_MIN(5) 미만이면
// 뺀다. 장소 평점·재방문·지출은 표본이 TOUR_RATING_MIN_N(3) 미만이면 null. 순수 집계 함수(aggregateTourStats)는 export 해
// 테스트한다. docs/PLAN-tour-log.md §공개 API.

import type { PrismaClient, TourPlace } from '@prisma/client';
import type { RestaurantPublicListTourType, RestaurantTourStatsType, RestaurantTourSummaryType, TourPlaceRefType } from '@repo/api-contract';
import { TOUR_K_MIN, TOUR_RATING_MIN_N, TOUR_SAMPLE_LABEL, TOUR_SOURCE_NOTE } from '@repo/utils';

const IN_CHUNK = 500;

// 장소 집계 → 공개 요약. 평가·표본 하한 미만은 null 로 가린다(값이 있어도 한 사람의 평가일 수 있다).
export const toTourSummary = (p: TourPlace): RestaurantTourSummaryType => {
  const rated = p.nRated >= TOUR_RATING_MIN_N;
  const enough = p.nVisits >= TOUR_K_MIN;
  return {
    nTravelers: p.nTravelers,
    nVisits: p.nVisits,
    nRated: p.nRated,
    bayesScore: rated ? p.bayesScore : null,
    meanDgstfn: rated ? p.meanDgstfn : null,
    revisitRate: enough ? p.revisitRate : null,
    stayMedian: enough ? p.stayMedian : null,
    spendPpMedian: p.spendN >= TOUR_RATING_MIN_N ? p.spendPpMedian : null,
    topReasonNm: enough ? p.topReasonNm : null,
    sampleLabel: TOUR_SAMPLE_LABEL,
    sourceNote: TOUR_SOURCE_NOTE,
  };
};

export const toListTour = (p: TourPlace): RestaurantPublicListTourType => {
  const s = toTourSummary(p);
  return { nTravelers: s.nTravelers, bayesScore: s.bayesScore, spendPpMedian: s.spendPpMedian, revisitRate: s.revisitRate };
};

// 골라주기 가중치 — 보정 만족도 1~5 → 0~1. 평가 하한 미만이면 null(후보에서 그 항은 빠진다).
export const travelerWeight = (bayesScore: number | null): number | null => (bayesScore === null ? null : Math.max(0, Math.min(1, (bayesScore - 1) / 4)));

// canonical 의 매칭 장소 요약(상태 matched 만). 매칭 없거나 장소가 사라졌으면 null.
export const getRestaurantTourSummary = async (prisma: PrismaClient, canonicalId: string): Promise<RestaurantTourSummaryType | null> => {
  const m = await prisma.restaurantTourMatch.findUnique({ where: { canonicalId } });
  if (!m || m.status !== 'matched') return null;
  const place = await prisma.tourPlace.findUnique({ where: { id: m.tourPlaceId } });
  return place ? toTourSummary(place) : null;
};

// 공개 목록용 — canonicalId 들의 매칭 장소를 한 번에(500개씩 in-절). 매칭 없는 canonical 은 맵에 없다.
export const getPublicListTourMap = async (prisma: PrismaClient, canonicalIds: string[]): Promise<Map<string, RestaurantPublicListTourType>> => {
  const out = new Map<string, RestaurantPublicListTourType>();
  if (canonicalIds.length === 0) return out;
  const matches: Array<{ canonicalId: string; tourPlaceId: string }> = [];
  for (let i = 0; i < canonicalIds.length; i += IN_CHUNK) {
    matches.push(
      ...(await prisma.restaurantTourMatch.findMany({
        where: { canonicalId: { in: canonicalIds.slice(i, i + IN_CHUNK) }, status: 'matched' },
        select: { canonicalId: true, tourPlaceId: true },
      })),
    );
  }
  if (matches.length === 0) return out;
  const places = new Map<string, TourPlace>();
  const placeIds = matches.map((m) => m.tourPlaceId);
  for (let i = 0; i < placeIds.length; i += IN_CHUNK) {
    for (const p of await prisma.tourPlace.findMany({ where: { id: { in: placeIds.slice(i, i + IN_CHUNK) } } })) places.set(p.id, p);
  }
  for (const m of matches) {
    const p = places.get(m.tourPlaceId);
    if (p) out.set(m.canonicalId, toListTour(p));
  }
  return out;
};

// 여행로그 장소 id → 등록된 맛집의 네이버 placeId(매칭 matched + 네이버 행). 링크·그룹투표 후보용. 인사이트·코스도 쓴다.
export const registeredNaverIds = async (prisma: PrismaClient, tourPlaceIds: string[]): Promise<Map<string, string>> => {
  const registered = new Map<string, string>();
  const ids = [...new Set(tourPlaceIds)];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const ms = await prisma.restaurantTourMatch.findMany({ where: { tourPlaceId: { in: ids.slice(i, i + IN_CHUNK) }, status: 'matched' }, select: { tourPlaceId: true, canonicalId: true } });
    if (ms.length === 0) continue;
    const rows = await prisma.restaurant.findMany({ where: { canonicalId: { in: ms.map((x) => x.canonicalId) }, source: 'naver' }, select: { canonicalId: true, placeId: true } });
    const byCanonical = new Map(rows.map((x) => [x.canonicalId, x.placeId]));
    for (const x of ms) {
      const np = byCanonical.get(x.canonicalId);
      if (np) registered.set(x.tourPlaceId, np);
    }
  }
  return registered;
};

// ── 상세 통계(순수 집계) ─────────────────────────────────────────────────────
export interface TourStatsVisitRow {
  travelId: string;
  dgstfn: number | null;
  rcmdInt: number | null;
  revisitYn: string | null;
  arrivalHour: number | null;
  arrivalWeekday: number | null;
  month: number | null;
  stayMin: number | null;
  dayIndex: number | null;
  nights: number | null;
  reasonNm: string | null;
  accompany: string | null;
  ageGrp: string | null;
}
export interface TourStatsInput {
  place: TourPlace;
  visits: TourStatsVisitRow[];
  activityDetails: string[];
  spend: Array<{ amount: number | null; perPerson: number | null; payNum: number | null; methodNm: string | null }>;
  // 이 장소 → 다음 / 이전 → 이 장소 전이의 상대 장소(장소 id·이름·유형).
  next: Array<{ placeId: string | null; name: string | null; typeShort: string | null }>;
  prev: Array<{ placeId: string | null; name: string | null; typeShort: string | null }>;
  // 같은 여행에서 함께 간 다른 장소(여행당 1회로 이미 접은 목록).
  together: Array<{ placeId: string; name: string; typeShort: string; travelers: number }>;
  // 등록된 맛집이면 여행로그 장소 id → 네이버 placeId.
  registered: Map<string, string>;
}

const STAY_BUCKETS: Array<[string, (m: number) => boolean]> = [
  ['30분 이하', (m) => m <= 30],
  ['60분', (m) => m > 30 && m <= 60],
  ['90분', (m) => m > 60 && m <= 90],
  ['2시간', (m) => m > 90 && m <= 120],
  ['2시간 초과', (m) => m > 120],
];

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
const quantile = (xs: number[], q: number): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
};
const round1 = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10);
const round2 = (v: number | null): number | null => (v === null ? null : Math.round(v * 100) / 100);

// 주문 자유기술 "흑돼지한마리;공기밥;된장찌개" → 어절. 수량 꼬리(2인분·1개) 제거, 공백 제거로 표기 통일.
export const tokenizeMenuDetail = (detail: string): string[] =>
  detail
    .split(/[;,/+]/)
    .map((t) => t.trim().toLowerCase().replace(/\s*\d+\s*(인분|개|잔|병|그릇|판|마리)$/u, '').replace(/\s+/g, ''))
    .filter((t) => t.length >= 2);

const placeRefs = (rows: Array<{ placeId: string | null; name: string | null; typeShort: string | null }>, minN: number, registered: Map<string, string>, limit: number): TourPlaceRefType[] => {
  const counts = new Map<string, { name: string; typeShort: string; n: number; placeId: string | null }>();
  for (const r of rows) {
    if (!r.name) continue;
    const key = r.placeId ?? `name:${r.name}`;
    const cur = counts.get(key);
    if (cur) cur.n += 1;
    else counts.set(key, { name: r.name, typeShort: r.typeShort ?? '기타', n: 1, placeId: r.placeId ? (registered.get(r.placeId) ?? null) : null });
  }
  return [...counts.values()]
    .filter((c) => c.n >= minN)
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((c) => ({ name: c.name, typeShort: c.typeShort, n: c.n, placeId: c.placeId }));
};

export const aggregateTourStats = (input: TourStatsInput): RestaurantTourStatsType => {
  const { visits } = input;
  const satisfaction = [0, 0, 0, 0, 0];
  const recommend = [0, 0, 0, 0, 0];
  const hours = Array.from({ length: 24 }, () => 0);
  const weekdays = Array.from({ length: 7 }, () => 0);
  const months = new Map<number, number>();
  const stay = STAY_BUCKETS.map(([label]) => ({ label, n: 0 }));
  const reasons = new Map<string, number>();
  const groups = { accompany: new Map<string, { n: number; sum: number; rated: number }>(), ages: new Map<string, { n: number; sum: number; rated: number }>() };
  const dayPosition = { first: 0, mid: 0, last: 0 };
  let revisitFirst = 0;
  let revisitAgain = 0;

  const bump = (m: Map<string, { n: number; sum: number; rated: number }>, key: string | null, dgstfn: number | null) => {
    if (!key) return;
    const g = m.get(key) ?? { n: 0, sum: 0, rated: 0 };
    g.n += 1;
    if (dgstfn !== null) {
      g.sum += dgstfn;
      g.rated += 1;
    }
    m.set(key, g);
  };

  for (const v of visits) {
    if (v.dgstfn !== null && v.dgstfn >= 1 && v.dgstfn <= 5) satisfaction[v.dgstfn - 1]! += 1;
    if (v.rcmdInt !== null && v.rcmdInt >= 1 && v.rcmdInt <= 5) recommend[v.rcmdInt - 1]! += 1;
    if (v.revisitYn === 'Y') revisitAgain += 1;
    else if (v.revisitYn === 'N') revisitFirst += 1;
    if (v.arrivalHour !== null && v.arrivalHour >= 0 && v.arrivalHour < 24) hours[v.arrivalHour]! += 1;
    if (v.arrivalWeekday !== null && v.arrivalWeekday >= 0 && v.arrivalWeekday < 7) weekdays[v.arrivalWeekday]! += 1;
    if (v.month !== null) months.set(v.month, (months.get(v.month) ?? 0) + 1);
    if (v.stayMin !== null) {
      const idx = STAY_BUCKETS.findIndex(([, f]) => f(v.stayMin!));
      if (idx >= 0) stay[idx]!.n += 1;
    }
    if (v.reasonNm) reasons.set(v.reasonNm, (reasons.get(v.reasonNm) ?? 0) + 1);
    bump(groups.accompany, v.accompany, v.dgstfn);
    bump(groups.ages, v.ageGrp ? `${v.ageGrp}대` : null, v.dgstfn);
    if (v.dayIndex !== null) {
      if (v.dayIndex === 1) dayPosition.first += 1;
      else if (v.nights !== null && v.dayIndex >= v.nights + 1) dayPosition.last += 1;
      else dayPosition.mid += 1;
    }
  }

  const groupStats = (m: Map<string, { n: number; sum: number; rated: number }>) =>
    [...m.entries()]
      .filter(([, g]) => g.n >= TOUR_K_MIN)
      .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
      .map(([label, g]) => ({ label, n: g.n, mean: g.rated >= TOUR_RATING_MIN_N ? round2(g.sum / g.rated) : null }));

  const menuCounts = new Map<string, number>();
  for (const d of input.activityDetails) for (const t of tokenizeMenuDetail(d)) menuCounts.set(t, (menuCounts.get(t) ?? 0) + 1);
  const menuTerms = [...menuCounts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([label, n]) => ({ label, n }));

  const paid = input.spend.filter((s) => s.amount !== null && s.amount > 0);
  const pp = paid.map((s) => s.perPerson).filter((x): x is number => x !== null && x > 0);
  const amounts = paid.map((s) => s.amount!);
  const payNums = paid.map((s) => s.payNum).filter((x): x is number => x !== null && x > 0);
  const methods = new Map<string, number>();
  for (const s of paid) {
    const k = s.methodNm ?? '미기재';
    methods.set(k, (methods.get(k) ?? 0) + 1);
  }
  const enoughSpend = paid.length >= TOUR_RATING_MIN_N;

  return {
    summary: toTourSummary(input.place),
    satisfaction,
    recommend,
    revisit: { first: revisitFirst, again: revisitAgain },
    hours,
    weekdays,
    months: [...months.entries()].sort((a, b) => a[0] - b[0]).map(([m, n]) => ({ label: `${m}월`, n })),
    stay,
    dayPosition,
    reasons: [...reasons.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([label, n]) => ({ label, n })),
    accompany: groupStats(groups.accompany),
    ages: groupStats(groups.ages),
    prevPlaces: placeRefs(input.prev, 3, input.registered, 6),
    nextPlaces: placeRefs(input.next, 3, input.registered, 6),
    togetherPlaces: input.together
      .filter((t) => t.travelers >= TOUR_K_MIN)
      .sort((a, b) => b.travelers - a.travelers || a.name.localeCompare(b.name))
      .slice(0, 8)
      .map((t) => ({ name: t.name, typeShort: t.typeShort, n: t.travelers, placeId: input.registered.get(t.placeId) ?? null })),
    menuTerms,
    spend: {
      n: paid.length,
      medianPp: enoughSpend ? round1(median(pp)) : null,
      q1Pp: enoughSpend ? round1(quantile(pp, 0.25)) : null,
      q3Pp: enoughSpend ? round1(quantile(pp, 0.75)) : null,
      medianAmount: enoughSpend ? round1(median(amounts)) : null,
      avgPayNum: enoughSpend && payNums.length > 0 ? round1(payNums.reduce((a, b) => a + b, 0) / payNums.length) : null,
      methods: enoughSpend
        ? [...methods.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, n]) => ({ label, n }))
        : [],
    },
  };
};

// 네이버 placeId → 매칭 장소의 상세 통계. 식당 없음·매칭 없음·장소 없음이면 null.
export const getRestaurantTourStats = async (prisma: PrismaClient, naverPlaceId: string): Promise<RestaurantTourStatsType | null> => {
  const r = await prisma.restaurant.findUnique({ where: { placeId: naverPlaceId }, select: { canonicalId: true } });
  if (!r) return null;
  const m = await prisma.restaurantTourMatch.findUnique({ where: { canonicalId: r.canonicalId } });
  if (!m || m.status !== 'matched') return null;
  const place = await prisma.tourPlace.findUnique({ where: { id: m.tourPlaceId } });
  if (!place) return null;
  const pid = place.id;

  const [visits, activities, spend, transitionsFrom, transitionsTo] = await Promise.all([
    prisma.tourVisit.findMany({
      where: { placeId: pid },
      select: { travelId: true, dgstfn: true, rcmdInt: true, revisitYn: true, arrivalHour: true, arrivalWeekday: true, month: true, stayMin: true, dayIndex: true, nights: true, reasonNm: true, accompany: true, ageGrp: true },
    }),
    prisma.tourActivity.findMany({ where: { placeId: pid, typeNm: '취식', detail: { not: null } }, select: { detail: true } }),
    prisma.tourSpend.findMany({ where: { placeId: pid, categoryCd: 'activity' }, select: { amount: true, perPerson: true, payNum: true, methodNm: true } }),
    prisma.tourTransition.findMany({ where: { fromPlaceId: pid }, select: { toPlaceId: true, toName: true, toType: true } }),
    prisma.tourTransition.findMany({ where: { toPlaceId: pid }, select: { fromPlaceId: true, fromName: true, fromType: true } }),
  ]);

  // 함께 간 곳 — 이 장소를 포함한 여행의 다른 공개 방문을 여행당 1회로 접는다.
  const travelIds = [...new Set(visits.map((v) => v.travelId))];
  const together = new Map<string, { placeId: string; name: string; typeShort: string; travelers: number }>();
  for (let i = 0; i < travelIds.length; i += IN_CHUNK) {
    const others = await prisma.tourVisit.findMany({
      where: { travelId: { in: travelIds.slice(i, i + IN_CHUNK) }, placeId: { not: null }, NOT: { placeId: pid } },
      select: { travelId: true, placeId: true, name: true, typeShort: true },
    });
    const seen = new Set<string>();
    for (const o of others) {
      const key = `${o.travelId}|${o.placeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cur = together.get(o.placeId!);
      if (cur) cur.travelers += 1;
      else together.set(o.placeId!, { placeId: o.placeId!, name: o.name ?? '', typeShort: o.typeShort, travelers: 1 });
    }
  }

  // 상대 장소가 등록 맛집이면 링크용 네이버 placeId.
  const refIds = new Set<string>();
  for (const t of transitionsFrom) if (t.toPlaceId) refIds.add(t.toPlaceId);
  for (const t of transitionsTo) if (t.fromPlaceId) refIds.add(t.fromPlaceId);
  for (const t of together.values()) if (t.travelers >= TOUR_K_MIN) refIds.add(t.placeId);
  const registered = await registeredNaverIds(prisma, [...refIds]);

  return aggregateTourStats({
    place,
    visits,
    activityDetails: activities.map((a) => a.detail!).filter(Boolean),
    spend,
    next: transitionsFrom.map((t) => ({ placeId: t.toPlaceId, name: t.toName, typeShort: t.toType })),
    prev: transitionsTo.map((t) => ({ placeId: t.fromPlaceId, name: t.fromName, typeShort: t.fromType })),
    together: [...together.values()],
    registered,
  });
};
