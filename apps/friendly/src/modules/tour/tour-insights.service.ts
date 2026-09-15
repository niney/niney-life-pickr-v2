// 여행로그 공개 인사이트·코스 추천(5차) — 필터(지역·연령·성별·동반·월·박수)를 걸어 여행·방문·전이·하루 코스·소비를
// 집계한다. 공개 층이라 응답에 식별자가 없고(계약), 집단 셀은 TOUR_K_MIN 미만이면 뺀다. 필터 후 여행이 20건 미만이면
// insufficient — 화면은 "표본 부족" 을 붙인다. 여행 속성(gender·ageGrp·accompany·nights·month)이 방문·전이·일차·소비
// 표에 비정규화돼 있어 대부분 한 표 조회로 끝나고, 결과는 필터 키로 10분 캐시한다(재적재는 배포 단위).
//
// 코스 추천은 "나와 비슷한 여행" 을 세그먼트 일치로 고르고(부족하면 month→gender→nights→ageGrp 순으로 풀며 기록),
// 그 여행들이 만족한 장소를 n × (mean − 3.3) 으로 점수화한다(tour-c PlanPage 산식). docs/PLAN-tour-log.md §공개 API.

import type { Prisma, PrismaClient } from '@prisma/client';
import type { TourInsightsQueryType, TourInsightsResultType, TourPlanBodyType, TourPlanResultType, TourPlaceRefType } from '@repo/api-contract';
import { TOUR_K_MIN, TOUR_RATING_MIN_N, TOUR_SAMPLE_LABEL, TOUR_SOURCE_NOTE } from '@repo/utils';
import { LRUCache } from 'lru-cache';
import { registeredNaverIds } from './tour-public.service.js';
import { tourRegionDayWhere, tourRegionHubLabel, tourRegionHubs, tourRegionTransitionWhere, tourRegionTripWhere, tourRegionVisitWhere } from './tour-region-filter.js';

export const TOUR_INSIGHTS_MIN_TRIPS = 20;
const CACHE_TTL_MS = 10 * 60_000;
const IN_CHUNK = 500;
const HOUR_TYPES = ['식당', '자연', '숙소', '상업'] as const;
// 코스 추천에서 제외하는 유형(이동·잠자리·비공개).
const PLAN_EXCLUDED_TYPES = new Set(['교통', '숙소', '집', '친지', '사무실']);
const PLAN_BASELINE = 3.3;

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

const cacheKey = (q: TourInsightsQueryType): string => JSON.stringify([q.region, q.ageGrp ?? '', q.gender ?? '', q.accompany ?? '', q.month ?? '', q.nights ?? '']);

export class TourInsightsService {
  private readonly cache = new LRUCache<string, TourInsightsResultType>({ max: 200, ttl: CACHE_TTL_MS });

  constructor(private readonly prisma: PrismaClient) {}

  invalidate(): void {
    this.cache.clear();
  }

  async insights(q: TourInsightsQueryType): Promise<TourInsightsResultType> {
    const key = cacheKey(q);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const out = await this.computeInsights(q);
    this.cache.set(key, out);
    return out;
  }

  private async computeInsights(q: TourInsightsQueryType): Promise<TourInsightsResultType> {
    const attrs = attrWhere(q);
    const [trips, visits, transitions, daySeqs, spendRows] = await Promise.all([
      this.prisma.tourTrip.findMany({
        where: { ...attrs, ...tourRegionTripWhere(q.region) } as Prisma.TourTripWhereInput,
        select: { id: true, nights: true, month: true, accompany: true, spendTotal: true, residenceSido: true, ageGrp: true, gender: true },
      }),
      this.prisma.tourVisit.findMany({
        where: { ...attrs, isPrivate: false, ...tourRegionVisitWhere(q.region) } as Prisma.TourVisitWhereInput,
        select: { travelId: true, placeId: true, typeShort: true, dgstfn: true, stayMin: true, spendPp: true, arrivalHour: true, reasonNm: true, sigungu: true, emd: true, accompany: true },
      }),
      this.prisma.tourTransition.findMany({
        where: { ...attrs, ...tourRegionTransitionWhere(q.region) } as Prisma.TourTransitionWhereInput,
        select: { fromType: true, toType: true, mvmnNm: true, travelMin: true, fromName: true, toPlaceId: true, toName: true },
      }),
      this.prisma.tourDaySequence.findMany({
        where: { ...attrs, ...tourRegionDayWhere(q.region), nStops: { gte: 3, lte: 7 } } as Prisma.TourDaySequenceWhereInput,
        select: { typeSeq: true },
      }),
      this.prisma.tourSpend.findMany({
        where: { ...attrs, amount: { gt: 0 } } as Prisma.TourSpendWhereInput,
        select: { travelId: true, category: true, amount: true },
      }),
    ]);
    const tripIds = new Set(trips.map((t) => t.id));

    // 규모.
    const placeIds = new Set<string>();
    const restaurantIds = new Set<string>();
    for (const v of visits) {
      if (v.placeId) {
        placeIds.add(v.placeId);
        if (v.typeShort === '식당') restaurantIds.add(v.placeId);
      }
    }

    // 박수·월·동반(여행 단위).
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
    const accompanyTrips = new Map<string, Set<string>>();
    const accompanySat = new Map<string, { sum: number; n: number }>();
    const hourType = new Map<string, number[]>(HOUR_TYPES.map((t) => [t, Array.from({ length: 24 }, () => 0)]));
    const typeAgg = new Map<string, { n: number; sum: number; rated: number; stays: number[]; pps: number[] }>();
    const emdAgg = new Map<string, { sigungu: string | null; emd: string; n: number; sum: number; rated: number }>();
    const reasons = new Map<string, number>();
    for (const v of visits) {
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

    // 전이·이동수단·거점(공항·역·터미널 — 지역별 utils TOUR_REGIONS.hubs) 다음.
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
    const airportTop = [...airportCounts.values()].filter((x) => x.n >= TOUR_K_MIN).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 8);
    const registered = await registeredNaverIds(this.prisma, airportTop.map((x) => x.placeId).filter((x): x is string => x !== null));
    const airportNext: TourPlaceRefType[] = airportTop.map((x) => ({ name: x.name, typeShort: '', n: x.n, placeId: x.placeId ? (registered.get(x.placeId) ?? null) : null }));

    // 하루 코스 템플릿.
    const templateMap = new Map<string, number>();
    for (const d of daySeqs) countMap(templateMap, d.typeSeq);

    // 소비(여행 단위 합계 — region 은 tripIds 로).
    const spendCat = new Map<string, { n: number; total: number; amounts: number[] }>();
    for (const s of spendRows) {
      if (!tripIds.has(s.travelId) || s.amount === null) continue;
      const c = spendCat.get(s.category) ?? { n: 0, total: 0, amounts: [] };
      c.n += 1;
      c.total += s.amount;
      c.amounts.push(s.amount);
      spendCat.set(s.category, c);
    }

    const k = TOUR_K_MIN;
    const sortDesc = <T extends { n: number }>(xs: T[]): T[] => xs.sort((a, b) => b.n - a.n);
    return {
      filters: { region: q.region, ageGrp: q.ageGrp ?? null, gender: q.gender ?? null, accompany: q.accompany ?? null, month: q.month ?? null, nights: q.nights ?? null },
      insufficient: trips.length < TOUR_INSIGHTS_MIN_TRIPS,
      scale: { trips: trips.length, visits: visits.length, places: placeIds.size, restaurants: restaurantIds.size, spendMedian: round1(median(spendTotals)) },
      nights: [0, 1, 2, 3, 4].map((n) => ({ label: n === 0 ? '당일' : n === 4 ? '4박 이상' : `${n}박`, n: nightsMap.get(n) ?? 0 })).filter((x) => x.n >= k),
      months: [...monthsMap.entries()].sort((a, b) => a[0] - b[0]).map(([m, n]) => ({ label: `${m}월`, n })).filter((x) => x.n >= k),
      accompany: sortDesc(
        [...accompanyTrips.entries()]
          .map(([label, set]) => {
            const s = accompanySat.get(label);
            return { label, n: set.size, mean: s && s.n >= TOUR_RATING_MIN_N ? round2(s.sum / s.n) : null };
          })
          .filter((x) => x.n >= k),
      ),
      hourType: HOUR_TYPES.map((t) => ({ type: t, hours: hourType.get(t)! })),
      typeSat: sortDesc(
        [...typeAgg.entries()]
          .map(([type, a]) => ({ type, n: a.n, mean: a.rated >= TOUR_RATING_MIN_N ? round2(a.sum / a.rated) : null, stayMedian: round1(median(a.stays)), spendPpMedian: a.pps.length >= TOUR_RATING_MIN_N ? round1(median(a.pps)) : null }))
          .filter((x) => x.n >= k),
      ),
      transitions: sortDesc([...transMap.entries()].map(([key, n]) => ({ from: key.split('>')[0]!, to: key.split('>')[1]!, n })).filter((x) => x.n >= k)).slice(0, 30),
      templates: sortDesc([...templateMap.entries()].map(([label, n]) => ({ label, n })).filter((x) => x.n >= 3)).slice(0, 10),
      emd: sortDesc([...emdAgg.values()].map((e) => ({ sigungu: e.sigungu, emd: e.emd, n: e.n, mean: e.rated >= TOUR_RATING_MIN_N ? round2(e.sum / e.rated) : null })).filter((x) => x.n >= k)).slice(0, 12),
      reasons: sortDesc([...reasons.entries()].map(([label, n]) => ({ label, n })).filter((x) => x.n >= k)).slice(0, 10),
      spendComposition: [...spendCat.entries()].map(([category, c]) => ({ category, n: c.n, total: Math.round(c.total), median: round1(median(c.amounts)) })).sort((a, b) => b.total - a.total),
      tripSpend: spendTotals.length >= k ? { p10: Math.round(quantile(spendTotals, 0.1)!), median: Math.round(median(spendTotals)!), p90: Math.round(quantile(spendTotals, 0.9)!) } : null,
      mvmn: sortDesc([...mvmnAgg.entries()].map(([label, m]) => ({ label, n: m.n, medianMin: round1(median(m.mins)) })).filter((x) => x.n >= k)).slice(0, 8),
      airportNext,
      hubLabel: tourRegionHubLabel(q.region),
      residence: sortDesc([...residenceMap.entries()].map(([label, n]) => ({ label, n })).filter((x) => x.n >= k)).slice(0, 10),
      ageGender: [...ageGenderMap.entries()]
        .map(([key, n]) => ({ ageGrp: key.split('|')[0]!, gender: key.split('|')[1]!, n }))
        .filter((x) => x.n >= k)
        .sort((a, b) => a.ageGrp.localeCompare(b.ageGrp) || a.gender.localeCompare(b.gender)),
      sampleLabel: TOUR_SAMPLE_LABEL,
      sourceNote: TOUR_SOURCE_NOTE,
    };
  }

  // ── 코스 추천 ───────────────────────────────────────────────────────────────
  async plan(body: TourPlanBodyType): Promise<TourPlanResultType> {
    const visitWhere = tourRegionVisitWhere(body.region);
    const dayWhere = tourRegionDayWhere(body.region);
    // 완화 사다리 — 표본이 20건에 못 미치면 덜 중요한 조건부터 뺀다.
    const ladder: Array<keyof TourPlanBodyType> = ['month', 'gender', 'nights', 'ageGrp'];
    let current: TourInsightsQueryType = { region: body.region, ageGrp: body.ageGrp, gender: body.gender, accompany: body.accompany, month: body.month, nights: body.nights };
    const relaxed: string[] = [];
    const findTripIds = async (): Promise<string[]> => {
      const rows = await this.prisma.tourTrip.findMany({
        where: { ...attrWhere(current), ...tourRegionTripWhere(body.region) } as Prisma.TourTripWhereInput,
        select: { id: true },
      });
      return rows.map((r) => r.id);
    };
    let tripIds = await findTripIds();
    while (tripIds.length < TOUR_INSIGHTS_MIN_TRIPS) {
      const next = ladder.find((f) => current[f] !== undefined);
      if (!next) break;
      relaxed.push(next);
      current = { ...current, [next]: undefined };
      tripIds = await findTripIds();
    }

    const placeAgg = new Map<string, { name: string; kind: string; sigungu: string | null; emd: string | null; travelers: Set<string>; sum: number; rated: number }>();
    const templateMap = new Map<string, number>();
    for (let i = 0; i < tripIds.length; i += IN_CHUNK) {
      const chunk = tripIds.slice(i, i + IN_CHUNK);
      const [visits, days] = await Promise.all([
        this.prisma.tourVisit.findMany({
          where: { travelId: { in: chunk }, isPrivate: false, placeId: { not: null }, ...visitWhere } as Prisma.TourVisitWhereInput,
          select: { travelId: true, placeId: true, name: true, typeShort: true, sigungu: true, emd: true, dgstfn: true },
        }),
        this.prisma.tourDaySequence.findMany({ where: { travelId: { in: chunk }, ...dayWhere, nStops: { gte: 3, lte: 7 } } as Prisma.TourDaySequenceWhereInput, select: { typeSeq: true } }),
      ]);
      for (const v of visits) {
        if (PLAN_EXCLUDED_TYPES.has(v.typeShort)) continue;
        const a = placeAgg.get(v.placeId!) ?? { name: v.name ?? '', kind: v.typeShort, sigungu: v.sigungu, emd: v.emd, travelers: new Set<string>(), sum: 0, rated: 0 };
        a.travelers.add(v.travelId);
        if (v.dgstfn !== null) {
          a.sum += v.dgstfn;
          a.rated += 1;
        }
        placeAgg.set(v.placeId!, a);
      }
      for (const d of days) countMap(templateMap, d.typeSeq);
    }

    const scored = [...placeAgg.entries()]
      .filter(([, a]) => a.travelers.size >= TOUR_K_MIN && a.rated >= TOUR_RATING_MIN_N)
      .map(([placeId, a]) => {
        const mean = a.sum / a.rated;
        return { tourPlaceId: placeId, name: a.name, kind: a.kind, sigungu: a.sigungu, emd: a.emd, n: a.travelers.size, mean: round2(mean), score: Math.round(a.travelers.size * (mean - PLAN_BASELINE) * 10) / 10 };
      })
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score || b.n - a.n || a.name.localeCompare(b.name))
      .slice(0, 24);
    const registered = await registeredNaverIds(this.prisma, scored.map((p) => p.tourPlaceId));

    return {
      matchedTrips: tripIds.length,
      relaxed,
      insufficient: tripIds.length < TOUR_INSIGHTS_MIN_TRIPS,
      places: scored.map((p) => ({ name: p.name, kind: p.kind, sigungu: p.sigungu, emd: p.emd, n: p.n, mean: p.mean, score: p.score, placeId: registered.get(p.tourPlaceId) ?? null })),
      templates: [...templateMap.entries()]
        .map(([label, n]) => ({ label, n }))
        .filter((x) => x.n >= 2)
        .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
        .slice(0, 8),
      sampleLabel: TOUR_SAMPLE_LABEL,
      sourceNote: TOUR_SOURCE_NOTE,
    };
  }
}
