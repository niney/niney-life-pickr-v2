// 여행로그 공개 6차 — 지도 밀도 격자·숙소 통계·지역 비교. 인사이트(5차)와 같은 규율: 응답에 식별자 없음, 집단 셀은
// 여행자 TOUR_K_MIN 미만이면 뺀다, 결과는 키별 캐시(재적재는 배포 단위).
//   - density: 공개 방문(좌표 있음)을 0.02° 격자로 세고(SQL group by) 여행 5건 미만 칸 제외. kind=restaurant 는 식당·상업·상점만.
//   - lodging: 숙박 결제(소비 표) 유형별 결제 중앙·1박 추정·1인·예약률 + 숙소 방문 평가 만족도. 1박 추정 = 결제액 × 그 여행의
//     숙박 결제 건수 ÷ 박수(체크인·아웃이 export 에 없어 여행 박수를 나눠 쓴다 — 화면에 산식 표기).
//   - regions: 제주시·서귀포시·부속섬 3집단 + 읍면동 표. 필터는 인사이트 축(region 은 제주 고정).

import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  TourCountType,
  TourDensityQueryType,
  TourDensityResultType,
  TourInsightsQueryType,
  TourLodgingResultType,
  TourLodgingTypeStatType,
  TourRegionEmdType,
  TourRegionGroupType,
  TourRegionKeyType,
  TourRegionsResultType,
} from '@repo/api-contract';
import {
  TOUR_DENSITY_CELL_DEG,
  TOUR_K_MIN,
  TOUR_RATING_MIN_N,
  TOUR_RESTAURANT_TYPE_SHORTS,
  TOUR_SAMPLE_LABEL,
  TOUR_SOURCE_NOTE,
  tourDensityQuantileBreaks,
} from '@repo/utils';
import { LRUCache } from 'lru-cache';
import { TOUR_INSIGHTS_MIN_TRIPS, attrWhere, countMap, median, round1, round2 } from './tour-insights.service.js';

const CACHE_TTL_MS = 10 * 60_000;
const REGION_LABEL: Record<TourRegionKeyType, string> = { 'jeju-si': '제주시', seogwipo: '서귀포시', island: '부속섬' };
const REGION_ORDER: TourRegionKeyType[] = ['jeju-si', 'seogwipo', 'island'];

const filtersOf = (q: TourInsightsQueryType) => ({
  region: q.region,
  ageGrp: q.ageGrp ?? null,
  gender: q.gender ?? null,
  accompany: q.accompany ?? null,
  month: q.month ?? null,
  nights: q.nights ?? null,
});
const filterKey = (q: TourInsightsQueryType): string => JSON.stringify(filtersOf(q));
const meanOf = (sum: number, n: number): number | null => (n >= TOUR_RATING_MIN_N ? round2(sum / n) : null);
const medianOf = (xs: number[]): number | null => (xs.length >= TOUR_RATING_MIN_N ? round1(median(xs)) : null);
const parseBbox = (s: string): { minLng: number; minLat: number; maxLng: number; maxLat: number } => {
  const [minLng, minLat, maxLng, maxLat] = s.split(',').map(Number) as [number, number, number, number];
  return { minLng, minLat, maxLng, maxLat };
};
const topN = (m: Map<string, number>, n: number): TourCountType[] =>
  [...m.entries()]
    .map(([label, c]) => ({ label, n: c }))
    .filter((x) => x.n >= TOUR_K_MIN)
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, n);

interface SatAgg {
  n: number;
  sum: number;
  rated: number;
}
const addSat = (a: SatAgg, dgstfn: number | null): void => {
  a.n += 1;
  if (dgstfn !== null) {
    a.sum += dgstfn;
    a.rated += 1;
  }
};

export class TourRegionService {
  private readonly densityCache = new LRUCache<string, TourDensityResultType>({ max: 20, ttl: CACHE_TTL_MS });
  private readonly lodgingCache = new LRUCache<string, TourLodgingResultType>({ max: 200, ttl: CACHE_TTL_MS });
  private readonly regionsCache = new LRUCache<string, TourRegionsResultType>({ max: 200, ttl: CACHE_TTL_MS });

  constructor(private readonly prisma: PrismaClient) {}

  invalidate(): void {
    this.densityCache.clear();
    this.lodgingCache.clear();
    this.regionsCache.clear();
  }

  // ── 밀도 격자 ───────────────────────────────────────────────────────────────
  async density(q: TourDensityQueryType): Promise<TourDensityResultType> {
    const key = `${q.kind}|${q.bbox ?? ''}`;
    const hit = this.densityCache.get(key);
    if (hit) return hit;
    const deg = TOUR_DENSITY_CELL_DEG;
    const kinds = q.kind === 'restaurant' ? [...TOUR_RESTAURANT_TYPE_SHORTS] : null;
    const bbox = q.bbox ? parseBbox(q.bbox) : null;
    // SQLite 엔 FLOOR 가 없다 — 한국 좌표는 양수라 CAST(… AS INTEGER)(0 방향 절삭)가 floor 와 같다.
    const rows = await this.prisma.$queryRaw<Array<{ x: number | bigint; y: number | bigint; n: number | bigint; travelers: number | bigint }>>(Prisma.sql`
      SELECT CAST(lng / ${deg} AS INTEGER) AS x, CAST(lat / ${deg} AS INTEGER) AS y, COUNT(*) AS n, COUNT(DISTINCT travelId) AS travelers
      FROM tour_visits
      WHERE isPrivate = 0 AND lat IS NOT NULL AND lng IS NOT NULL
        ${kinds ? Prisma.sql`AND typeShort IN (${Prisma.join(kinds)})` : Prisma.empty}
        ${bbox ? Prisma.sql`AND lng >= ${bbox.minLng} AND lng <= ${bbox.maxLng} AND lat >= ${bbox.minLat} AND lat <= ${bbox.maxLat}` : Prisma.empty}
      GROUP BY x, y
      HAVING COUNT(DISTINCT travelId) >= ${TOUR_K_MIN}
      ORDER BY n DESC
    `);
    const cells = rows.map((r) => ({ x: Number(r.x), y: Number(r.y), n: Number(r.n), travelers: Number(r.travelers) }));
    const out: TourDensityResultType = {
      kind: q.kind,
      cellDeg: deg,
      cells,
      breaks: tourDensityQuantileBreaks(cells.map((c) => c.n)).map((b) => Math.round(b * 10) / 10),
      total: { cells: cells.length, visits: cells.reduce((a, c) => a + c.n, 0) },
      sampleLabel: TOUR_SAMPLE_LABEL,
      sourceNote: TOUR_SOURCE_NOTE,
    };
    this.densityCache.set(key, out);
    return out;
  }

  // ── 숙소 ───────────────────────────────────────────────────────────────────
  async lodging(q: TourInsightsQueryType): Promise<TourLodgingResultType> {
    const key = filterKey(q);
    const hit = this.lodgingCache.get(key);
    if (hit) return hit;
    const jeju = q.region === 'jeju';
    const attrs = attrWhere(q);
    const [trips, spend, lodgeVisits] = await Promise.all([
      this.prisma.tourTrip.findMany({
        where: { ...attrs, ...(jeju ? { nJeju: { gt: 0 } } : {}) } as Prisma.TourTripWhereInput,
        select: { id: true, nights: true },
      }),
      this.prisma.tourSpend.findMany({
        where: { ...attrs, category: '숙박' } as Prisma.TourSpendWhereInput,
        select: { travelId: true, subtypeNm: true, amount: true, perPerson: true, rsvtYn: true },
      }),
      this.prisma.tourVisit.findMany({
        where: { ...attrs, typeShort: '숙소', isPrivate: false, ...(jeju ? { isJeju: true } : {}) } as Prisma.TourVisitWhereInput,
        select: { lodgingTypeNm: true, dgstfn: true },
      }),
    ]);
    const nightsOf = new Map(trips.map((t) => [t.id, t.nights]));
    const rows = spend.filter((s) => nightsOf.has(s.travelId));
    // 여행별 숙박 결제 건수(금액 > 0) — 1박 추정의 분모 보정(한 여행이 숙소 둘을 거치면 박수를 나눠 쓴다).
    const rowsPerTrip = new Map<string, number>();
    for (const s of rows) if (s.amount !== null && s.amount > 0) countMap(rowsPerTrip, s.travelId);

    interface TypeAgg {
      n: number;
      trips: Set<string>;
      amounts: number[];
      nightly: number[];
      pps: number[];
      rsvtY: number;
      rsvtN: number;
      visits: SatAgg;
    }
    const byType = new Map<string, TypeAgg>();
    const aggOf = (label: string): TypeAgg => {
      let a = byType.get(label);
      if (!a) {
        a = { n: 0, trips: new Set(), amounts: [], nightly: [], pps: [], rsvtY: 0, rsvtN: 0, visits: { n: 0, sum: 0, rated: 0 } };
        byType.set(label, a);
      }
      return a;
    };
    const withLodging = new Set<string>();
    let rsvtY = 0;
    let rsvtN = 0;
    for (const s of rows) {
      const a = aggOf(s.subtypeNm ?? '기타');
      a.trips.add(s.travelId);
      withLodging.add(s.travelId);
      if (s.rsvtYn === 'Y') {
        a.rsvtY += 1;
        rsvtY += 1;
      } else if (s.rsvtYn === 'N') {
        a.rsvtN += 1;
        rsvtN += 1;
      }
      if (s.amount !== null && s.amount > 0) {
        a.n += 1;
        a.amounts.push(s.amount);
        const nights = nightsOf.get(s.travelId) ?? 0;
        if (nights >= 1) a.nightly.push((s.amount * (rowsPerTrip.get(s.travelId) ?? 1)) / nights);
        if (s.perPerson !== null && s.perPerson > 0) a.pps.push(s.perPerson);
      }
    }
    for (const v of lodgeVisits) if (v.lodgingTypeNm) addSat(aggOf(v.lodgingTypeNm).visits, v.dgstfn);

    const types: TourLodgingTypeStatType[] = [...byType.entries()]
      .map(([label, a]) => ({
        label,
        n: a.n,
        trips: a.trips.size,
        amountMedian: medianOf(a.amounts),
        nightlyMedian: medianOf(a.nightly),
        perPersonMedian: medianOf(a.pps),
        rsvtRate: a.rsvtY + a.rsvtN >= TOUR_K_MIN ? round2(a.rsvtY / (a.rsvtY + a.rsvtN)) : null,
        visits: a.visits.n,
        mean: meanOf(a.visits.sum, a.visits.rated),
      }))
      .filter((x) => x.trips >= TOUR_K_MIN)
      .sort((a, b) => b.trips - a.trips || a.label.localeCompare(b.label));
    const out: TourLodgingResultType = {
      filters: filtersOf(q),
      insufficient: trips.length < TOUR_INSIGHTS_MIN_TRIPS,
      total: { trips: trips.length, withLodging: withLodging.size, rsvtRate: rsvtY + rsvtN >= TOUR_K_MIN ? round2(rsvtY / (rsvtY + rsvtN)) : null },
      types,
      sampleLabel: TOUR_SAMPLE_LABEL,
      sourceNote: TOUR_SOURCE_NOTE,
    };
    this.lodgingCache.set(key, out);
    return out;
  }

  // ── 지역 비교(제주 고정) ────────────────────────────────────────────────────
  async regions(q: TourInsightsQueryType): Promise<TourRegionsResultType> {
    const key = filterKey({ ...q, region: 'jeju' });
    const hit = this.regionsCache.get(key);
    if (hit) return hit;
    const attrs = attrWhere(q);
    const visits = await this.prisma.tourVisit.findMany({
      where: { ...attrs, isPrivate: false, isJeju: true } as Prisma.TourVisitWhereInput,
      select: { travelId: true, typeShort: true, dgstfn: true, stayMin: true, spendPp: true, sigungu: true, emd: true, isIsland: true },
    });
    interface GroupAgg {
      trips: Set<string>;
      sat: SatAgg;
      rest: SatAgg;
      stays: number[];
      pps: number[];
      types: Map<string, number>;
      emd: Map<string, number>;
    }
    const groups = new Map<TourRegionKeyType, GroupAgg>(
      REGION_ORDER.map((k) => [k, { trips: new Set(), sat: { n: 0, sum: 0, rated: 0 }, rest: { n: 0, sum: 0, rated: 0 }, stays: [], pps: [], types: new Map(), emd: new Map() }]),
    );
    interface EmdAgg {
      sigungu: string | null;
      emd: string;
      island: boolean;
      sat: SatAgg;
      restaurants: number;
      stays: number[];
      pps: number[];
    }
    const emdAgg = new Map<string, EmdAgg>();
    const allTrips = new Set<string>();
    for (const v of visits) {
      allTrips.add(v.travelId);
      const gk: TourRegionKeyType | null = v.isIsland ? 'island' : v.sigungu === '제주시' ? 'jeju-si' : v.sigungu === '서귀포시' ? 'seogwipo' : null;
      const isRest = v.typeShort === '식당';
      if (gk) {
        const g = groups.get(gk)!;
        g.trips.add(v.travelId);
        addSat(g.sat, v.dgstfn);
        if (isRest) addSat(g.rest, v.dgstfn);
        if (v.stayMin !== null) g.stays.push(v.stayMin);
        if (v.spendPp !== null && v.spendPp > 0) g.pps.push(v.spendPp);
        countMap(g.types, v.typeShort);
        if (v.emd) countMap(g.emd, v.emd);
      }
      if (v.emd) {
        const ek = `${v.sigungu ?? ''}|${v.emd}|${v.isIsland ? 1 : 0}`;
        const e = emdAgg.get(ek) ?? { sigungu: v.sigungu, emd: v.emd, island: v.isIsland, sat: { n: 0, sum: 0, rated: 0 }, restaurants: 0, stays: [], pps: [] };
        addSat(e.sat, v.dgstfn);
        if (isRest) e.restaurants += 1;
        if (v.stayMin !== null) e.stays.push(v.stayMin);
        if (v.spendPp !== null && v.spendPp > 0) e.pps.push(v.spendPp);
        emdAgg.set(ek, e);
      }
    }
    const groupVisits = [...groups.values()].reduce((a, g) => a + g.sat.n, 0);
    const out: TourRegionsResultType = {
      filters: filtersOf({ ...q, region: 'jeju' }),
      insufficient: allTrips.size < TOUR_INSIGHTS_MIN_TRIPS,
      groups: REGION_ORDER.map((k): TourRegionGroupType | null => {
        const g = groups.get(k)!;
        if (g.trips.size < TOUR_K_MIN) return null;
        return {
          key: k,
          label: REGION_LABEL[k],
          trips: g.trips.size,
          visits: g.sat.n,
          share: groupVisits > 0 ? Math.round((g.sat.n / groupVisits) * 1000) / 1000 : 0,
          mean: meanOf(g.sat.sum, g.sat.rated),
          restaurants: g.rest.n,
          restaurantMean: meanOf(g.rest.sum, g.rest.rated),
          stayMedian: medianOf(g.stays),
          spendPpMedian: medianOf(g.pps),
          topTypes: topN(g.types, 5),
          topEmd: topN(g.emd, 5),
        };
      }).filter((g): g is TourRegionGroupType => g !== null),
      emd: [...emdAgg.values()]
        .map(
          (e): TourRegionEmdType => ({
            sigungu: e.sigungu,
            emd: e.emd,
            island: e.island,
            n: e.sat.n,
            mean: meanOf(e.sat.sum, e.sat.rated),
            restaurants: e.restaurants,
            stayMedian: medianOf(e.stays),
            spendPpMedian: medianOf(e.pps),
          }),
        )
        .filter((e) => e.n >= TOUR_K_MIN)
        .sort((a, b) => b.n - a.n || a.emd.localeCompare(b.emd))
        .slice(0, 20),
      sampleLabel: TOUR_SAMPLE_LABEL,
      sourceNote: TOUR_SOURCE_NOTE,
    };
    this.regionsCache.set(key, out);
    return out;
  }
}
