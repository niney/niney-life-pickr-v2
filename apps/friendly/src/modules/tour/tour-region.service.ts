// 여행로그 공개 6차 — 지도 밀도 격자·숙소 통계·지역 비교. 인사이트(5차)와 같은 규율: 응답에 식별자 없음, 집단 셀은
// 여행자 TOUR_K_MIN 미만이면 뺀다, 결과는 키별로 10분 캐시하고 적재·제거로 데이터 버전이 바뀌면 버린다(tour-data-version.ts) —
// 그 위에 같은 키 동시 요청 합류·콜드 계산 공용 게이트(tour-aggregate-cache.ts).
//   - density: 공개 방문(좌표 있음)을 0.02° 격자로 세고(SQL group by) 여행 5건 미만 칸 제외. kind=restaurant 는 식당·상업·상점만.
//     kind 별 전국 격자만 세어 캐시하고 bbox 는 그 칸을 메모리에서 거른다 — bbox 가 캐시 키에 들어가면 값만 바꿔 매번 풀스캔을
//     시킬 수 있었다(PLAN-perf-2 D-8).
//   - lodging: 숙박 결제(소비 표) 유형별 결제 중앙·1박 추정·1인·예약률 + 숙소 방문 평가 만족도. 1박 추정 = 결제액 × 그 여행의
//     숙박 결제 건수 ÷ 박수(체크인·아웃이 export 에 없어 여행 박수를 나눠 쓴다 — 화면에 산식 표기).
//   - regions: region=jeju 는 제주시·서귀포시·부속섬 3집단, 시도·서부권·전체는 시군구 집단(방문 수 상위 8, 여행 5건 이상) + 읍면동 표.
//     필터는 인사이트 축(region 포함 — 7차).

import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  TourCountType,
  TourDensityCellType,
  TourDensityQueryType,
  TourDensityResultType,
  TourInsightsQueryType,
  TourLodgingResultType,
  TourLodgingTypeStatType,
  TourRegionEmdType,
  TourRegionGroupType,
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
import { TourAggregateCache } from './tour-aggregate-cache.js';
import { TOUR_INSIGHTS_MIN_TRIPS, attrSql, attrWhere, countMap, median, round1, round2, tourFilterKey, whereSql } from './tour-insights.service.js';
import { tourRegionSpendByTrips, tourRegionTripWhere, tourRegionVisitSql, tourRegionVisitWhere } from './tour-region-filter.js';

// 필터 조합 키는 개수로 묶는다(결과는 top-N 이라 건당 수 KB). 밀도는 kind 2개뿐(버전이 바뀌면 통째로 비운다 — tour-data-version.ts).
const CACHE_MAX = 200;
const DENSITY_CACHE_MAX = 4;
// 제주 3집단(고정 순서·라벨). 다른 지역은 시군구 이름이 키·라벨.
const JEJU_GROUPS: Array<{ key: string; label: string }> = [
  { key: 'jeju-si', label: '제주시' },
  { key: 'seogwipo', label: '서귀포시' },
  { key: 'island', label: '부속섬' },
];
const MAX_SIGUNGU_GROUPS = 8;

const filtersOf = (q: TourInsightsQueryType) => ({
  region: q.region,
  ageGrp: q.ageGrp ?? null,
  gender: q.gender ?? null,
  accompany: q.accompany ?? null,
  month: q.month ?? null,
  nights: q.nights ?? null,
});
const meanOf = (sum: number, n: number): number | null => (n >= TOUR_RATING_MIN_N ? round2(sum / n) : null);
const medianOf = (xs: number[]): number | null => (xs.length >= TOUR_RATING_MIN_N ? round1(median(xs)) : null);
const parseBbox = (s: string): { minLng: number; minLat: number; maxLng: number; maxLat: number } => {
  const [minLng, minLat, maxLng, maxLat] = s.split(',').map(Number) as [number, number, number, number];
  return { minLng, minLat, maxLng, maxLat };
};
// 칸 목록 → 응답(분위 경계·합계는 내보내는 칸 기준 — bbox 로 거른 경우도 그 칸들로 다시 센다).
const densityResult = (kind: TourDensityQueryType['kind'], cells: TourDensityCellType[]): TourDensityResultType => ({
  kind,
  cellDeg: TOUR_DENSITY_CELL_DEG,
  cells,
  breaks: tourDensityQuantileBreaks(cells.map((c) => c.n)).map((b) => Math.round(b * 10) / 10),
  total: { cells: cells.length, visits: cells.reduce((a, c) => a + c.n, 0) },
  sampleLabel: TOUR_SAMPLE_LABEL,
  sourceNote: TOUR_SOURCE_NOTE,
});
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
  private readonly densityCache: TourAggregateCache<TourDensityResultType>;
  private readonly lodgingCache: TourAggregateCache<TourLodgingResultType>;
  private readonly regionsCache: TourAggregateCache<TourRegionsResultType>;

  constructor(private readonly prisma: PrismaClient) {
    this.densityCache = new TourAggregateCache(prisma, { max: DENSITY_CACHE_MAX });
    this.lodgingCache = new TourAggregateCache(prisma, { max: CACHE_MAX });
    this.regionsCache = new TourAggregateCache(prisma, { max: CACHE_MAX });
  }

  invalidate(): void {
    this.densityCache.clear();
    this.lodgingCache.clear();
    this.regionsCache.clear();
  }

  // ── 밀도 격자 ───────────────────────────────────────────────────────────────
  // bbox 는 bbox 와 면적으로 겹치는 칸(선으로만 닿는 칸 제외)만 고른다. 칸 값은 칸 전체 기준이라 bbox 경계에 걸친 칸도 잘리지 않은
  // 수를 낸다(여행 5건 미만 칸은 애초에 없으니 소셀 억제는 그대로).
  async density(q: TourDensityQueryType): Promise<TourDensityResultType> {
    const grid = await this.densityCache.get(q.kind, () => this.computeDensity(q.kind));
    if (!q.bbox) return grid;
    const b = parseBbox(q.bbox);
    const deg = TOUR_DENSITY_CELL_DEG;
    return densityResult(
      q.kind,
      grid.cells.filter((c) => c.x * deg < b.maxLng && (c.x + 1) * deg > b.minLng && c.y * deg < b.maxLat && (c.y + 1) * deg > b.minLat),
    );
  }

  private async computeDensity(kind: TourDensityQueryType['kind']): Promise<TourDensityResultType> {
    const deg = TOUR_DENSITY_CELL_DEG;
    const kinds = kind === 'restaurant' ? [...TOUR_RESTAURANT_TYPE_SHORTS] : null;
    // SQLite 엔 FLOOR 가 없다 — 한국 좌표는 양수라 CAST(… AS INTEGER)(0 방향 절삭)가 floor 와 같다.
    const rows = await this.prisma.$queryRaw<Array<{ x: number | bigint; y: number | bigint; n: number | bigint; travelers: number | bigint }>>(Prisma.sql`
      SELECT CAST(lng / ${deg} AS INTEGER) AS x, CAST(lat / ${deg} AS INTEGER) AS y, COUNT(*) AS n, COUNT(DISTINCT travelId) AS travelers
      FROM tour_visits
      WHERE isPrivate = 0 AND lat IS NOT NULL AND lng IS NOT NULL
        ${kinds ? Prisma.sql`AND typeShort IN (${Prisma.join(kinds)})` : Prisma.empty}
      GROUP BY x, y
      HAVING COUNT(DISTINCT travelId) >= ${TOUR_K_MIN}
      ORDER BY n DESC
    `);
    return densityResult(
      kind,
      rows.map((r) => ({ x: Number(r.x), y: Number(r.y), n: Number(r.n), travelers: Number(r.travelers) })),
    );
  }

  // ── 숙소 ───────────────────────────────────────────────────────────────────
  async lodging(q: TourInsightsQueryType): Promise<TourLodgingResultType> {
    return this.lodgingCache.get(tourFilterKey(q), () => this.computeLodging(q));
  }

  private async computeLodging(q: TourInsightsQueryType): Promise<TourLodgingResultType> {
    const attrs = attrWhere(q);
    // 표를 하나씩(인사이트와 같은 이유) — 여행 → 그 여행들의 숙박 결제(소비 표는 여행 id 로 지역을 자른다) → 숙소 방문 평가.
    const trips = await this.prisma.tourTrip.findMany({
      where: { ...attrs, ...tourRegionTripWhere(q.region) } as Prisma.TourTripWhereInput,
      select: { id: true, nights: true },
    });
    const spend = await tourRegionSpendByTrips(
      q.region,
      trips.map((t) => t.id),
      (travelIds) =>
        this.prisma.tourSpend.findMany({
          where: { ...attrs, category: '숙박', ...(travelIds ? { travelId: { in: travelIds } } : {}) } as Prisma.TourSpendWhereInput,
          select: { travelId: true, subtypeNm: true, amount: true, perPerson: true, rsvtYn: true },
        }),
    );
    const lodgeVisits = await this.prisma.tourVisit.findMany({
      where: { ...attrs, typeShort: '숙소', isPrivate: false, ...tourRegionVisitWhere(q.region) } as Prisma.TourVisitWhereInput,
      select: { lodgingTypeNm: true, dgstfn: true },
    });
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
    return {
      filters: filtersOf(q),
      insufficient: trips.length < TOUR_INSIGHTS_MIN_TRIPS,
      total: { trips: trips.length, withLodging: withLodging.size, rsvtRate: rsvtY + rsvtN >= TOUR_K_MIN ? round2(rsvtY / (rsvtY + rsvtN)) : null },
      types,
      sampleLabel: TOUR_SAMPLE_LABEL,
      sourceNote: TOUR_SOURCE_NOTE,
    };
  }

  // ── 지역 비교 ──────────────────────────────────────────────────────────────
  // jeju: 제주시·서귀포시·부속섬(고정 3집단). 그 밖: 방문 sido 조건 안에서 시군구별 집단(방문 수 상위 MAX_SIGUNGU_GROUPS).
  async regions(q: TourInsightsQueryType): Promise<TourRegionsResultType> {
    return this.regionsCache.get(tourFilterKey(q), () => this.computeRegions(q));
  }

  private async computeRegions(q: TourInsightsQueryType): Promise<TourRegionsResultType> {
    const jeju = q.region === 'jeju';
    // 방문 전량(region=all 11.5만 행) — $queryRaw 로(인사이트와 같은 이유, 같은 조건이라 행 순서도 같다).
    const visits = await this.prisma.$queryRaw<
      Array<{ travelId: string; typeShort: string; dgstfn: number | null; stayMin: number | null; spendPp: number | null; sido: string | null; sigungu: string | null; emd: string | null; isIsland: boolean }>
    >`
      SELECT travelId, typeShort, dgstfn, stayMin, spendPp, sido, sigungu, emd, isIsland FROM tour_visits
      ${whereSql([...attrSql(q), Prisma.sql`isPrivate = ${false}`, tourRegionVisitSql(q.region)])}`;
    interface GroupAgg {
      trips: Set<string>;
      sat: SatAgg;
      rest: SatAgg;
      stays: number[];
      pps: number[];
      types: Map<string, number>;
      emd: Map<string, number>;
    }
    const newGroup = (): GroupAgg => ({ trips: new Set(), sat: { n: 0, sum: 0, rated: 0 }, rest: { n: 0, sum: 0, rated: 0 }, stays: [], pps: [], types: new Map(), emd: new Map() });
    const groups = new Map<string, GroupAgg>(jeju ? JEJU_GROUPS.map((g) => [g.key, newGroup()]) : []);
    const labelOf = new Map<string, string>(JEJU_GROUPS.map((g) => [g.key, g.label]));
    // 집단 키 — 제주는 시·부속섬, 그 밖은 "시도 시군구"(같은 시군구 이름이 다른 시도에도 있어 시도를 붙인다).
    const groupKeyOf = (v: { sido: string | null; sigungu: string | null; isIsland: boolean }): string | null => {
      if (jeju) return v.isIsland ? 'island' : v.sigungu === '제주시' ? 'jeju-si' : v.sigungu === '서귀포시' ? 'seogwipo' : null;
      if (!v.sigungu) return null;
      const k = v.sido ? `${v.sido} ${v.sigungu}` : v.sigungu;
      if (!labelOf.has(k)) labelOf.set(k, k);
      return k;
    };
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
      const gk = groupKeyOf(v);
      const isRest = v.typeShort === '식당';
      if (gk) {
        let g = groups.get(gk);
        if (!g) {
          g = newGroup();
          groups.set(gk, g);
        }
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
    // 순서 — 제주는 고정, 그 밖은 방문 수 내림차순 상위 N.
    const ordered = jeju ? JEJU_GROUPS.map((g) => g.key) : [...groups.entries()].sort((a, b) => b[1].sat.n - a[1].sat.n || a[0].localeCompare(b[0])).slice(0, MAX_SIGUNGU_GROUPS).map(([k]) => k);
    return {
      filters: filtersOf(q),
      insufficient: allTrips.size < TOUR_INSIGHTS_MIN_TRIPS,
      groups: ordered
        .map((k): TourRegionGroupType | null => {
          const g = groups.get(k)!;
          if (g.trips.size < TOUR_K_MIN) return null;
          return {
            key: k,
            label: labelOf.get(k) ?? k,
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
        })
        .filter((g): g is TourRegionGroupType => g !== null),
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
  }
}
