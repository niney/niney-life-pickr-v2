// 여행로그 공개 인사이트(5차) — 필터(지역·연령·성별·동반·월·박수)를 걸어 여행·방문·전이·하루 코스·소비를
// 집계한다. 공개 층이라 응답에 식별자가 없고(계약), 집단 셀은 TOUR_K_MIN 미만이면 뺀다. 필터 후 여행이 20건 미만이면
// insufficient — 화면은 "표본 부족" 을 붙인다. 여행 속성(gender·ageGrp·accompany·nights·month)이 방문·전이·일차·소비
// 표에 비정규화돼 있어 대부분 한 표 조회로 끝난다. 집계는 데이터 버전(tour-data-version.ts — 적재·제거와 맞춘다)에 묶은
// 캐시에 두고(같은 키 합류·콜드 계산 공용 게이트 — tour-aggregate-cache), 등록 맛집 링크(거점 다음의 placeId)는 매칭 실행으로
// 바뀌므로 응답 때마다 붙인다.
//
// 코스 추천은 tour-plan.service.ts(10차에 분리) — 여기의 필터 조각(attrWhere)·통계 함수·표본 하한을 같이 쓴다.

import { Prisma, type PrismaClient } from '@prisma/client';
import type { TourInsightsQueryType, TourInsightsResultType } from '@repo/api-contract';
import { TOUR_K_MIN, TOUR_RATING_MIN_N, TOUR_SAMPLE_LABEL, TOUR_SOURCE_NOTE } from '@repo/utils';
import { TourAggregateCache } from './tour-aggregate-cache.js';
import { registeredNaverIds } from './tour-public.service.js';
import {
  tourRegionDayWhere,
  tourRegionHubLabel,
  tourRegionHubs,
  tourRegionSpendByTrips,
  tourRegionTransitionSql,
  tourRegionTripWhere,
  tourRegionVisitSql,
} from './tour-region-filter.js';

export const TOUR_INSIGHTS_MIN_TRIPS = 20;
// 필터 조합(지역 21 × 연령·성별·동반·월·박수)은 수만 가지라 개수로 묶는다 — 결과는 top-N 으로 잘려 건당 수 KB.
const CACHE_MAX = 200;
const HOUR_TYPES = ['식당', '자연', '숙소', '상업'] as const;

export const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
export const quantile = (xs: number[], q: number): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
};
export const round1 = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10);
export const round2 = (v: number | null): number | null => (v === null ? null : Math.round(v * 100) / 100);
export const countMap = <K>(m: Map<K, number>, k: K, by = 1): void => {
  m.set(k, (m.get(k) ?? 0) + by);
};

// 여행 속성 필터 → Prisma where 조각(비정규화 열 이름이 표마다 같다).
export const attrWhere = (q: TourInsightsQueryType): Record<string, unknown> => ({
  ...(q.ageGrp ? { ageGrp: q.ageGrp } : {}),
  ...(q.gender ? { gender: q.gender } : {}),
  ...(q.accompany ? { accompany: q.accompany } : {}),
  ...(q.month !== undefined ? { month: q.month } : {}),
  ...(q.nights !== undefined ? { nights: q.nights >= 4 ? { gte: 4 } : q.nights } : {}),
});

// 같은 필터의 원시 SQL 판(큰 표 콜드 적재용 — tour-region-filter 의 *Sql 과 같이 쓴다). attrWhere 와 같은 조건·같은 바인드.
export const attrSql = (q: TourInsightsQueryType): Prisma.Sql[] => [
  ...(q.ageGrp ? [Prisma.sql`ageGrp = ${q.ageGrp}`] : []),
  ...(q.gender ? [Prisma.sql`gender = ${q.gender}`] : []),
  ...(q.accompany ? [Prisma.sql`accompany = ${q.accompany}`] : []),
  ...(q.month !== undefined ? [Prisma.sql`month = ${q.month}`] : []),
  ...(q.nights !== undefined ? [q.nights >= 4 ? Prisma.sql`nights >= ${4}` : Prisma.sql`nights = ${q.nights}`] : []),
];
export const whereSql = (conds: Array<Prisma.Sql | null>): Prisma.Sql => {
  const xs = conds.filter((c): c is Prisma.Sql => c !== null);
  return xs.length > 0 ? Prisma.sql`WHERE ${Prisma.join(xs, ' AND ')}` : Prisma.empty;
};

// 인사이트·숙소·지역 비교가 같이 쓰는 필터 키.
export const tourFilterKey = (q: TourInsightsQueryType): string =>
  JSON.stringify([q.region, q.ageGrp ?? '', q.gender ?? '', q.accompany ?? '', q.month ?? '', q.nights ?? '']);

// 캐시에 두는 집계 — 링크(네이버 placeId) 대신 여행로그 장소 id 를 들고 있다가 응답 때 바꾼다.
interface HubNextAgg {
  name: string;
  tourPlaceId: string | null;
  n: number;
}
type InsightsAgg = Omit<TourInsightsResultType, 'airportNext'> & { hubNext: HubNextAgg[] };

// ── 인사이트 단계별 집계 ─────────────────────────────────────────────────────
// 표를 하나씩 읽어 바로 접는다 — 단계 함수가 끝나면 그 표의 원시 행이 버려진다. 예전엔 5표를 Promise.all 로 한꺼번에 올려
// region=all 에서 원시 행 수십만 개가 동시에 살았고(RSS 피크 = 합), 커넥션도 5개를 1초 넘게 잡았다(PLAN-perf-2 D-2).
// 큰 표(소비·방문·전이)는 $queryRaw 로 읽는다(같은 조건이라 행 순서도 findMany 와 같다 — 동률 정렬 결과가 안 바뀐다).

const aggregateTrips = async (prisma: PrismaClient, q: TourInsightsQueryType, attrs: Record<string, unknown>) => {
  const trips = await prisma.tourTrip.findMany({
    where: { ...attrs, ...tourRegionTripWhere(q.region) } as Prisma.TourTripWhereInput,
    select: { id: true, nights: true, month: true, spendTotal: true, residenceSido: true, ageGrp: true, gender: true },
  });
  const nightsMap = new Map<number, number>();
  const monthsMap = new Map<number, number>();
  const residenceMap = new Map<string, number>();
  const ageGenderMap = new Map<string, number>();
  const spendTotals: number[] = [];
  for (const t of trips) {
    countMap(nightsMap, Math.min(t.nights, 4));
    countMap(monthsMap, t.month);
    if (t.residenceSido) countMap(residenceMap, t.residenceSido);
    if (t.ageGrp && t.gender) countMap(ageGenderMap, `${t.ageGrp}|${t.gender}`);
    if (t.spendTotal !== null && t.spendTotal > 0) spendTotals.push(t.spendTotal);
  }
  return { tripIds: trips.map((t) => t.id), nightsMap, monthsMap, residenceMap, ageGenderMap, spendTotals };
};

// 소비(여행 단위 합계) — 지역은 그 지역 여행 id 로 자른다(소비 표엔 지역 열이 없다).
const aggregateSpend = async (prisma: PrismaClient, q: TourInsightsQueryType, tripIdList: string[]) => {
  const tripIds = new Set(tripIdList);
  const spendRows = await tourRegionSpendByTrips(
    q.region,
    tripIdList,
    (travelIds) => prisma.$queryRaw<Array<{ travelId: string; category: string; amount: number | null }>>`
      SELECT travelId, category, amount FROM tour_spend
      ${whereSql([...attrSql(q), Prisma.sql`amount > ${0}`, travelIds ? Prisma.sql`travelId IN (${Prisma.join(travelIds)})` : null])}`,
  );
  const spendCat = new Map<string, { n: number; total: number; amounts: number[] }>();
  for (const s of spendRows) {
    if (!tripIds.has(s.travelId) || s.amount === null) continue;
    const c = spendCat.get(s.category) ?? { n: 0, total: 0, amounts: [] };
    c.n += 1;
    c.total += s.amount;
    c.amounts.push(s.amount);
    spendCat.set(s.category, c);
  }
  return spendCat;
};

interface VisitRow {
  travelId: string;
  placeId: string | null;
  typeShort: string;
  dgstfn: number | null;
  stayMin: number | null;
  spendPp: number | null;
  arrivalHour: number | null;
  reasonNm: string | null;
  sigungu: string | null;
  emd: string | null;
  accompany: string | null;
}
const aggregateVisits = async (prisma: PrismaClient, q: TourInsightsQueryType) => {
  const visits = await prisma.$queryRaw<VisitRow[]>`
    SELECT travelId, placeId, typeShort, dgstfn, stayMin, spendPp, arrivalHour, reasonNm, sigungu, emd, accompany FROM tour_visits
    ${whereSql([...attrSql(q), Prisma.sql`isPrivate = ${false}`, tourRegionVisitSql(q.region)])}`;
  // 규모.
  const placeIds = new Set<string>();
  const restaurantIds = new Set<string>();
  const accompanyTrips = new Map<string, Set<string>>();
  const accompanySat = new Map<string, { sum: number; n: number }>();
  const hourType = new Map<string, number[]>(HOUR_TYPES.map((t) => [t, Array.from({ length: 24 }, () => 0)]));
  const typeAgg = new Map<string, { n: number; sum: number; rated: number; stays: number[]; pps: number[] }>();
  const emdAgg = new Map<string, { sigungu: string | null; emd: string; n: number; sum: number; rated: number }>();
  const reasons = new Map<string, number>();
  for (const v of visits) {
    if (v.placeId) {
      placeIds.add(v.placeId);
      if (v.typeShort === '식당') restaurantIds.add(v.placeId);
    }
    if (v.accompany) {
      let s = accompanyTrips.get(v.accompany);
      if (!s) {
        s = new Set();
        accompanyTrips.set(v.accompany, s);
      }
      s.add(v.travelId);
      if (v.dgstfn !== null) {
        const a = accompanySat.get(v.accompany) ?? { sum: 0, n: 0 };
        a.sum += v.dgstfn;
        a.n += 1;
        accompanySat.set(v.accompany, a);
      }
    }
    const ht = hourType.get(v.typeShort);
    if (ht && v.arrivalHour !== null && v.arrivalHour >= 0 && v.arrivalHour < 24) ht[v.arrivalHour]! += 1;
    const ta = typeAgg.get(v.typeShort) ?? { n: 0, sum: 0, rated: 0, stays: [], pps: [] };
    ta.n += 1;
    if (v.dgstfn !== null) {
      ta.sum += v.dgstfn;
      ta.rated += 1;
    }
    if (v.stayMin !== null) ta.stays.push(v.stayMin);
    if (v.spendPp !== null && v.spendPp > 0) ta.pps.push(v.spendPp);
    typeAgg.set(v.typeShort, ta);
    if (v.emd) {
      const k = `${v.sigungu ?? ''}|${v.emd}`;
      const e = emdAgg.get(k) ?? { sigungu: v.sigungu, emd: v.emd, n: 0, sum: 0, rated: 0 };
      e.n += 1;
      if (v.dgstfn !== null) {
        e.sum += v.dgstfn;
        e.rated += 1;
      }
      emdAgg.set(k, e);
    }
    if (v.reasonNm) countMap(reasons, v.reasonNm);
  }
  return { visits: visits.length, places: placeIds.size, restaurants: restaurantIds.size, accompanyTrips, accompanySat, hourType, typeAgg, emdAgg, reasons };
};

// 전이·이동수단·거점(공항·역·터미널 — 지역별 utils TOUR_REGIONS.hubs) 다음.
interface TransitionRow {
  fromType: string | null;
  toType: string | null;
  mvmnNm: string | null;
  travelMin: number | null;
  fromName: string | null;
  toPlaceId: string | null;
  toName: string | null;
}
const aggregateTransitions = async (prisma: PrismaClient, q: TourInsightsQueryType) => {
  const transitions = await prisma.$queryRaw<TransitionRow[]>`
    SELECT fromType, toType, mvmnNm, travelMin, fromName, toPlaceId, toName FROM tour_transitions
    ${whereSql([...attrSql(q), tourRegionTransitionSql(q.region)])}`;
  const transMap = new Map<string, number>();
  const mvmnAgg = new Map<string, { n: number; mins: number[] }>();
  const airportNextRows: Array<{ placeId: string | null; name: string | null }> = [];
  const hubs = tourRegionHubs(q.region);
  const isHub = (name: string | null): boolean => name !== null && hubs.some((h) => name.includes(h));
  for (const t of transitions) {
    if (t.fromType && t.toType) countMap(transMap, `${t.fromType}>${t.toType}`);
    if (t.mvmnNm) {
      const m = mvmnAgg.get(t.mvmnNm) ?? { n: 0, mins: [] };
      m.n += 1;
      if (t.travelMin !== null) m.mins.push(t.travelMin);
      mvmnAgg.set(t.mvmnNm, m);
    }
    if (isHub(t.fromName) && t.toName && !isHub(t.toName)) airportNextRows.push({ placeId: t.toPlaceId, name: t.toName });
  }
  const airportCounts = new Map<string, { name: string; placeId: string | null; n: number }>();
  for (const r of airportNextRows) {
    const k = r.placeId ?? `name:${r.name}`;
    const cur = airportCounts.get(k);
    if (cur) cur.n += 1;
    else airportCounts.set(k, { name: r.name!, placeId: r.placeId, n: 1 });
  }
  const hubNext: HubNextAgg[] = [...airportCounts.values()]
    .filter((x) => x.n >= TOUR_K_MIN)
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .slice(0, 8)
    .map((x) => ({ name: x.name, tourPlaceId: x.placeId, n: x.n }));
  return { transMap, mvmnAgg, hubNext };
};

// 하루 코스 템플릿.
const aggregateTemplates = async (prisma: PrismaClient, q: TourInsightsQueryType, attrs: Record<string, unknown>) => {
  const daySeqs = await prisma.tourDaySequence.findMany({
    where: { ...attrs, ...tourRegionDayWhere(q.region), nStops: { gte: 3, lte: 7 } } as Prisma.TourDaySequenceWhereInput,
    select: { typeSeq: true },
  });
  const templateMap = new Map<string, number>();
  for (const d of daySeqs) countMap(templateMap, d.typeSeq);
  return templateMap;
};

export class TourInsightsService {
  private readonly insightsCache: TourAggregateCache<InsightsAgg>;

  constructor(private readonly prisma: PrismaClient) {
    this.insightsCache = new TourAggregateCache(prisma, { max: CACHE_MAX });
  }

  invalidate(): void {
    this.insightsCache.clear();
  }

  async insights(q: TourInsightsQueryType): Promise<TourInsightsResultType> {
    const { hubNext, ...agg } = await this.insightsCache.get(tourFilterKey(q), () => this.computeInsights(q));
    const registered = await registeredNaverIds(this.prisma, hubNext.flatMap((x) => (x.tourPlaceId ? [x.tourPlaceId] : [])));
    const airportNext = hubNext.map((x) => ({ name: x.name, typeShort: '', n: x.n, placeId: x.tourPlaceId ? (registered.get(x.tourPlaceId) ?? null) : null }));
    return { ...agg, airportNext };
  }

  private async computeInsights(q: TourInsightsQueryType): Promise<InsightsAgg> {
    const attrs = attrWhere(q);
    const t = await aggregateTrips(this.prisma, q, attrs);
    const spendCat = await aggregateSpend(this.prisma, q, t.tripIds);
    const v = await aggregateVisits(this.prisma, q);
    const tr = await aggregateTransitions(this.prisma, q);
    const templateMap = await aggregateTemplates(this.prisma, q, attrs);

    const k = TOUR_K_MIN;
    const trips = t.tripIds.length;
    const sortDesc = <T extends { n: number }>(xs: T[]): T[] => xs.sort((a, b) => b.n - a.n);
    return {
      filters: { region: q.region, ageGrp: q.ageGrp ?? null, gender: q.gender ?? null, accompany: q.accompany ?? null, month: q.month ?? null, nights: q.nights ?? null },
      insufficient: trips < TOUR_INSIGHTS_MIN_TRIPS,
      scale: { trips, visits: v.visits, places: v.places, restaurants: v.restaurants, spendMedian: round1(median(t.spendTotals)) },
      nights: [0, 1, 2, 3, 4].map((n) => ({ label: n === 0 ? '당일' : n === 4 ? '4박 이상' : `${n}박`, n: t.nightsMap.get(n) ?? 0 })).filter((x) => x.n >= k),
      months: [...t.monthsMap.entries()].sort((a, b) => a[0] - b[0]).map(([m, n]) => ({ label: `${m}월`, n })).filter((x) => x.n >= k),
      accompany: sortDesc(
        [...v.accompanyTrips.entries()]
          .map(([label, set]) => {
            const s = v.accompanySat.get(label);
            return { label, n: set.size, mean: s && s.n >= TOUR_RATING_MIN_N ? round2(s.sum / s.n) : null };
          })
          .filter((x) => x.n >= k),
      ),
      hourType: HOUR_TYPES.map((type) => ({ type, hours: v.hourType.get(type)! })),
      typeSat: sortDesc(
        [...v.typeAgg.entries()]
          .map(([type, a]) => ({ type, n: a.n, mean: a.rated >= TOUR_RATING_MIN_N ? round2(a.sum / a.rated) : null, stayMedian: round1(median(a.stays)), spendPpMedian: a.pps.length >= TOUR_RATING_MIN_N ? round1(median(a.pps)) : null }))
          .filter((x) => x.n >= k),
      ),
      transitions: sortDesc([...tr.transMap.entries()].map(([key, n]) => ({ from: key.split('>')[0]!, to: key.split('>')[1]!, n })).filter((x) => x.n >= k)).slice(0, 30),
      templates: sortDesc([...templateMap.entries()].map(([label, n]) => ({ label, n })).filter((x) => x.n >= 3)).slice(0, 10),
      emd: sortDesc([...v.emdAgg.values()].map((e) => ({ sigungu: e.sigungu, emd: e.emd, n: e.n, mean: e.rated >= TOUR_RATING_MIN_N ? round2(e.sum / e.rated) : null })).filter((x) => x.n >= k)).slice(0, 12),
      reasons: sortDesc([...v.reasons.entries()].map(([label, n]) => ({ label, n })).filter((x) => x.n >= k)).slice(0, 10),
      spendComposition: [...spendCat.entries()].map(([category, c]) => ({ category, n: c.n, total: Math.round(c.total), median: round1(median(c.amounts)) })).sort((a, b) => b.total - a.total),
      tripSpend: t.spendTotals.length >= k ? { p10: Math.round(quantile(t.spendTotals, 0.1)!), median: Math.round(median(t.spendTotals)!), p90: Math.round(quantile(t.spendTotals, 0.9)!) } : null,
      mvmn: sortDesc([...tr.mvmnAgg.entries()].map(([label, m]) => ({ label, n: m.n, medianMin: round1(median(m.mins)) })).filter((x) => x.n >= k)).slice(0, 8),
      hubNext: tr.hubNext,
      hubLabel: tourRegionHubLabel(q.region),
      residence: sortDesc([...t.residenceMap.entries()].map(([label, n]) => ({ label, n })).filter((x) => x.n >= k)).slice(0, 10),
      ageGender: [...t.ageGenderMap.entries()]
        .map(([key, n]) => ({ ageGrp: key.split('|')[0]!, gender: key.split('|')[1]!, n }))
        .filter((x) => x.n >= k)
        .sort((a, b) => a.ageGrp.localeCompare(b.ageGrp) || a.gender.localeCompare(b.gender)),
      sampleLabel: TOUR_SAMPLE_LABEL,
      sourceNote: TOUR_SOURCE_NOTE,
    };
  }
}
