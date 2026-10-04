// 여행로그 코스 추천(5차 → 10차 보강) — "나와 비슷한 여행자가 만족한 곳" 을 고르고, 지원 지역에서는 일정표까지 합성한다.
// 공개 층이라 응답에 식별자·좌표가 없고(계약), 장소는 여행 TOUR_K_MIN 건·평가 TOUR_RATING_MIN_N 건 이상인 곳만 나간다.
//
//   · 비슷한 여행 — 세그먼트(연령·성별·동반·박수·월) 일치. 20건 미만이면 month → gender → nights → ageGrp 순으로 풀며 기록한다.
//   · 장소 후보 — 공개 가능 여부와 표시 숫자(n·보정 만족도)는 지역 표본 전체 기준이다. 비슷한 여행은 정렬 가중치로만 쓴다:
//     그 여행 5건 이상이 간 곳은 "지역 평균 대비 몇 배 갔나" 로, 그 미만이면 유형 선호(비슷한 여행이 그 유형을 평균보다 얼마나
//     가나)로 물러선다. 5차는 비슷한 여행 "안에서" 5건을 요구해 조건을 좁힐수록 장소가 사라졌다 — 그 어긋남을 없앤 것.
//     점수 = (보정 만족도 − 3.3) × √n × 선호. 국세청 조회에서 폐업·휴업으로 확인된 곳은 뺀다.
//   · 일정표 — utils TOUR_ITINERARY_REGIONS 지역만. 합성 규칙은 tour-plan-synth.ts(개별 여행의 하루 동선은 읽지 않는다).
//   · 장소의 유형 — 방문마다 여행자가 적은 유형 중 가장 많은 것(장소 표의 값은 동률·기록 없음일 때만).
//
// 지역 프로필(후보·시간대·일차 위치·여행별 요약·권역·이동 모델)은 지역 키로 10분 캐시한다(재적재는 배포 단위). docs/PLAN-tour-log.md §10차.

import type { Prisma, PrismaClient } from '@prisma/client';
import type { TourInsightsQueryType, TourPlanAltType, TourPlanBodyType, TourPlanDayType, TourPlanPlaceType, TourPlanResultType } from '@repo/api-contract';
import { TOUR_ITINERARY_REGIONS, TOUR_K_MIN, TOUR_RATING_MIN_N, TOUR_RESTAURANT_TYPE_SHORTS, TOUR_SAMPLE_LABEL, TOUR_SOURCE_NOTE, haversineM, tourItineraryDays, type TourRegionKey } from '@repo/utils';
import { LRUCache } from 'lru-cache';
import { TOUR_INSIGHTS_MIN_TRIPS, attrWhere, countMap, median, round2 } from './tour-insights.service.js';
import {
  PLAN_SLOT_MEAL,
  PLAN_SLOT_SIGHT,
  buildPlanSkeletons,
  buildPlanZones,
  emptyPlanBands,
  emptyPlanSkeletonSet,
  fitPlanLegModel,
  planBandOf,
  planPeakLabel,
  synthesizePlanItinerary,
  type PlanCandidate,
  type PlanDayPos,
  type PlanLegModel,
  type PlanSkeletonSet,
  type PlanTripDay,
  type PlanZone,
} from './tour-plan-synth.js';
import { registeredNaverIds } from './tour-public.service.js';
import { tourRegionDayWhere, tourRegionPlaceWhere, tourRegionTransitionWhere, tourRegionTripWhere, tourRegionVisitWhere } from './tour-region-filter.js';

const CACHE_TTL_MS = 10 * 60_000;
const IN_CHUNK = 500;
// 추천에서 빼는 유형(이동·잠자리·비공개).
const PLAN_EXCLUDED_TYPES = ['교통', '숙소', '집', '친지', '사무실'] as const;
const PLAN_EXCLUDED = new Set<string>(PLAN_EXCLUDED_TYPES);
// 일정표 자리에는 넣지 않는 유형 — 마트·편의점(상점), 분류 밖(기타), 2023년 행사(축제)는 목적지로 권하기 어렵다. 목록에는 남는다.
const SLOT_EXCLUDED = new Set<string>([...PLAN_EXCLUDED_TYPES, '상점', '기타', '축제']);
// 자리 묶음 — 식당(카페 포함)은 식사 자리, 그 밖의 갈 곳은 전부 볼거리 자리(tour-plan-synth 의 설명 참고).
const slotOf = (kind: string): string => (kind === '식당' ? PLAN_SLOT_MEAL : PLAN_SLOT_SIGHT);
const PLAN_BASELINE = 3.3;
const PLAN_LIST_LIMIT = 24;
// 목록에 식당도, 식당 아닌 곳도 이만큼은 들도록 뒤 순위에서 채운다 — 방문 수가 한쪽에 쏠린 지역에서도 "식당만" 보기(→ 그룹투표)와
// 볼거리가 둘 다 비지 않게.
const PLAN_GROUP_MIN = 12;
const CLOSED_BSTT = ['폐업자', '휴업자'];
// 장소 선호 = (비슷한 여행 중 방문 + 3) ÷ (지역 평균대로라면 갔을 수 + 3) — 작은 표본이 튀지 않게 누른다.
const LIFT_PRIOR = 3;
const LIFT_RANGE = [0.5, 2] as const;
const TYPE_LIFT_RANGE = [0.7, 1.5] as const;
const TYPE_SHARE_PRIOR = 0.02;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface PoolPlace {
  id: string;
  name: string;
  kind: string;
  sigungu: string | null;
  emd: string | null;
  lat: number | null;
  lng: number | null;
  island: boolean;
  n: number;
  bayes: number;
  stayMin: number | null;
  spendPp: number | null;
  bands: number[];
  pos: { first: number; mid: number; last: number };
}
// 여행 1건의 요약 — 간 후보 장소·유형별 방문 수·일차별 유형 순서. 메모리 안에서만 쓰고 응답에는 집계로만 나간다.
interface TripFacts {
  nights: number;
  places: Set<string>;
  types: Map<string, number>;
  days: PlanTripDay[];
}
interface RegionProfile {
  totalTrips: number;
  pool: PoolPlace[];
  excludedClosed: number;
  trips: Map<string, TripFacts>;
  typeVisits: Map<string, number>;
  typeVisitsTotal: number;
  posBase: { first: number; mid: number; last: number };
  typeStay: Map<string, number>;
  itinerary: { zones: PlanZone[]; reachKm: number; legModel: PlanLegModel; skeletons: PlanSkeletonSet } | null;
}
interface ScoredPlace {
  p: PoolPlace;
  score: number;
  similarN: number | null;
  lift: number | null;
}

// 일차 위치 — 당일 여행은 only, 첫날 first, 마지막 날(박수 + 1 일차 이후) last, 그 사이 mid.
const dayPosOf = (dayIndex: number | null, nights: number): PlanDayPos | null => (dayIndex === null ? null : nights <= 0 ? 'only' : dayIndex <= 1 ? 'first' : dayIndex >= nights + 1 ? 'last' : 'mid');
const routable = (p: PoolPlace): p is PoolPlace & { lat: number; lng: number } => p.lat !== null && p.lng !== null && !p.island && !SLOT_EXCLUDED.has(p.kind);

// 그날 도는 동네 — 들르는 곳의 읍면동을 많이 나온 순으로 둘까지("제주시 애월읍·한림읍").
const areaOf = (stops: PoolPlace[]): string => {
  const sigungus = [...new Set(stops.map((p) => p.sigungu).filter((s): s is string => Boolean(s)))];
  const emdCount = new Map<string, number>();
  for (const p of stops) if (p.emd) countMap(emdCount, p.emd);
  const emds = [...emdCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([emd]) => emd);
  if (emds.length === 0) return sigungus.join('·');
  return `${sigungus.length === 1 ? `${sigungus[0]} ` : ''}${emds.join('·')}`;
};

export class TourPlanService {
  // 프로미스를 캐시한다 — 같은 지역 요청이 겹쳐도 프로필은 한 번만 만든다.
  private readonly profiles = new LRUCache<string, Promise<RegionProfile>>({ max: 8, ttl: CACHE_TTL_MS });

  constructor(private readonly prisma: PrismaClient) {}

  invalidate(): void {
    this.profiles.clear();
  }

  private profile(region: TourRegionKey): Promise<RegionProfile> {
    let p = this.profiles.get(region);
    if (!p) {
      p = this.buildProfile(region);
      this.profiles.set(region, p);
      p.catch(() => this.profiles.delete(region));
    }
    return p;
  }

  private async buildProfile(region: TourRegionKey): Promise<RegionProfile> {
    const cfg = TOUR_ITINERARY_REGIONS[region] ?? null;
    const placeWhere = tourRegionPlaceWhere(region);
    const [placeRows, tripRows, visitRows, closedRows] = await Promise.all([
      this.prisma.tourPlace.findMany({
        where: { ...placeWhere, nTravelers: { gte: TOUR_K_MIN }, nRated: { gte: TOUR_RATING_MIN_N }, bayesScore: { not: null }, typeShort: { notIn: [...PLAN_EXCLUDED_TYPES] } } as Prisma.TourPlaceWhereInput,
        select: { id: true, name: true, typeShort: true, sigungu: true, emd: true, lat: true, lng: true, isIsland: true, nTravelers: true, bayesScore: true, stayMedian: true, spendPpMedian: true, spendN: true },
      }),
      this.prisma.tourTrip.findMany({ where: tourRegionTripWhere(region) as Prisma.TourTripWhereInput, select: { id: true, nights: true } }),
      this.prisma.tourVisit.findMany({
        where: { isPrivate: false, ...tourRegionVisitWhere(region) } as Prisma.TourVisitWhereInput,
        select: { travelId: true, placeId: true, typeShort: true, dayIndex: true, visitOrder: true, arrivalHour: true },
      }),
      this.prisma.tourPlaceBizStatus.findMany({ where: { bStt: { in: CLOSED_BSTT } }, select: { placeId: true } }),
    ]);

    const closed = new Set(closedRows.map((r) => r.placeId));
    const pool = new Map<string, PoolPlace>();
    let excludedClosed = 0;
    for (const p of placeRows) {
      if (p.bayesScore === null) continue;
      if (closed.has(p.id)) {
        excludedClosed += 1;
        continue;
      }
      pool.set(p.id, {
        id: p.id,
        name: p.name,
        kind: p.typeShort,
        sigungu: p.sigungu,
        emd: p.emd,
        lat: p.lat,
        lng: p.lng,
        island: p.isIsland,
        n: p.nTravelers,
        bayes: p.bayesScore,
        stayMin: p.stayMedian === null ? null : Math.round(p.stayMedian),
        spendPp: p.spendN >= TOUR_RATING_MIN_N && p.spendPpMedian !== null ? Math.round(p.spendPpMedian) : null,
        bands: emptyPlanBands(),
        pos: { first: 0, mid: 0, last: 0 },
      });
    }

    // 방문 한 번 훑기 — 장소별 유형·시간대·일차 위치, 여행별 요약, 지역 유형 비중, (일정 지역이면) 하루 자리 순서.
    const trips = new Map<string, TripFacts>(tripRows.map((t) => [t.id, { nights: t.nights, places: new Set<string>(), types: new Map<string, number>(), days: [] }]));
    const typeVisits = new Map<string, number>();
    let typeVisitsTotal = 0;
    const posCount = { first: 0, mid: 0, last: 0 };
    const dayStops = new Map<string, { travelId: string; pos: PlanDayPos; stops: Array<{ order: number; type: string; hour: number | null }> }>();
    const kindVotes = new Map<string, Map<string, number>>();
    for (const v of visitRows) {
      // 유형은 여행자가 방문마다 적는다 — 같은 장소도 자연·레저·산책으로 갈리므로 장소의 유형은 가장 많이 적힌 것으로 정한다.
      if (v.placeId && pool.has(v.placeId)) {
        const votes = kindVotes.get(v.placeId) ?? new Map<string, number>();
        kindVotes.set(v.placeId, votes);
        countMap(votes, v.typeShort);
      }
      if (PLAN_EXCLUDED.has(v.typeShort)) continue;
      const facts = trips.get(v.travelId);
      if (!facts) continue;
      countMap(facts.types, v.typeShort);
      countMap(typeVisits, v.typeShort);
      typeVisitsTotal += 1;
      const pos = dayPosOf(v.dayIndex, facts.nights);
      if (pos && pos !== 'only') posCount[pos] += 1;
      const place = v.placeId ? pool.get(v.placeId) : undefined;
      if (place) {
        facts.places.add(place.id);
        if (v.arrivalHour !== null && v.arrivalHour >= 0 && v.arrivalHour < 24) place.bands[planBandOf(v.arrivalHour)]! += 1;
        if (pos && pos !== 'only') place.pos[pos] += 1;
      }
      if (cfg && pos && !SLOT_EXCLUDED.has(v.typeShort)) {
        const key = `${v.travelId}\n${v.dayIndex}`;
        const day = dayStops.get(key) ?? { travelId: v.travelId, pos, stops: [] };
        dayStops.set(key, day);
        day.stops.push({ order: v.visitOrder, type: slotOf(v.typeShort), hour: v.arrivalHour });
      }
    }
    for (const [id, votes] of kindVotes) {
      const place = pool.get(id)!;
      let top = place.kind;
      let topN = votes.get(place.kind) ?? 0;
      for (const [kind, n] of votes) {
        if (n > topN) {
          top = kind;
          topN = n;
        }
      }
      // 대부분이 이동·숙소로 적은 곳은 후보가 아니다(장소 표의 유형과 어긋난 경우).
      if (PLAN_EXCLUDED.has(top)) pool.delete(id);
      else place.kind = top;
    }
    for (const day of dayStops.values()) {
      const stops = day.stops.sort((a, b) => a.order - b.order);
      trips.get(day.travelId)!.days.push({ travelId: day.travelId, pos: day.pos, types: stops.map((s) => s.type), hours: stops.map((s) => s.hour) });
    }
    const posTotal = posCount.first + posCount.mid + posCount.last;
    const posBase = posTotal > 0 ? { first: posCount.first / posTotal, mid: posCount.mid / posTotal, last: posCount.last / posTotal } : { first: 0, mid: 0, last: 0 };

    const stays = new Map<string, number[]>();
    for (const p of pool.values()) {
      if (p.stayMin === null) continue;
      const xs = stays.get(p.kind) ?? [];
      xs.push(p.stayMin);
      stays.set(p.kind, xs);
    }
    const typeStay = new Map([...stays.entries()].map(([kind, xs]) => [kind, median(xs)!]));

    const places = [...pool.values()];
    let itinerary: RegionProfile['itinerary'] = null;
    if (cfg) {
      // 이동 모델 — 같은 날 이어진 두 공개 방문(비공개 경유 없음)의 직선거리 × 이동 분.
      const [coordRows, legRows] = await Promise.all([
        this.prisma.tourPlace.findMany({ where: { ...placeWhere, lat: { not: null }, lng: { not: null } } as Prisma.TourPlaceWhereInput, select: { id: true, lat: true, lng: true } }),
        this.prisma.tourTransition.findMany({
          where: { ...tourRegionTransitionWhere(region), sameDay: true, viaPrivate: false, travelMin: { not: null }, fromPlaceId: { not: null }, toPlaceId: { not: null } } as Prisma.TourTransitionWhereInput,
          select: { fromPlaceId: true, toPlaceId: true, travelMin: true },
        }),
      ]);
      const coords = new Map(coordRows.map((c) => [c.id, { lat: c.lat!, lng: c.lng! }]));
      const pairs: Array<{ km: number; min: number }> = [];
      for (const leg of legRows) {
        const a = coords.get(leg.fromPlaceId!);
        const b = coords.get(leg.toPlaceId!);
        if (a && b && leg.fromPlaceId !== leg.toPlaceId) pairs.push({ km: haversineM(a, b) / 1000, min: leg.travelMin! });
      }
      const allDays: PlanTripDay[] = [];
      for (const t of trips.values()) allDays.push(...t.days);
      itinerary = {
        zones: buildPlanZones(
          places.filter(routable).filter((p) => p.bayes > PLAN_BASELINE),
          cfg.zoneKm,
        ),
        // 그날 후보 = 권역 중심에서 권역 반경 안(이웃 권역과 겹치는 가장자리 장소는 먼저 쓰는 날이 가져간다).
        reachKm: cfg.zoneKm,
        legModel: fitPlanLegModel(pairs),
        skeletons: buildPlanSkeletons(allDays),
      };
    }

    return { totalTrips: tripRows.length, pool: places, excludedClosed, trips, typeVisits, typeVisitsTotal, posBase, typeStay, itinerary };
  }

  async plan(body: TourPlanBodyType): Promise<TourPlanResultType> {
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

    const profile = await this.profile(body.region);
    const matched = tripIds.length;
    // 조건이 하나도 없어 지역 여행 전체가 대상이면 "비슷한 여행" 가중은 의미가 없다(전부 1).
    const personalized = matched > 0 && matched < profile.totalTrips;

    // 비슷한 여행의 장소별 방문 여행 수 · 유형 비중 · 하루 유형 순서 · 박수.
    const segPlace = new Map<string, number>();
    const segTypeVisits = new Map<string, number>();
    const segTypeTrips = new Map<string, number>();
    let segVisits = 0;
    const segDays: PlanTripDay[] = [];
    const segNights: number[] = [];
    for (const id of tripIds) {
      const facts = profile.trips.get(id);
      if (!facts) continue;
      segNights.push(facts.nights);
      for (const pid of facts.places) countMap(segPlace, pid);
      for (const [type, c] of facts.types) {
        countMap(segTypeVisits, type, c);
        countMap(segTypeTrips, type);
        segVisits += c;
      }
      if (personalized) segDays.push(...facts.days);
    }
    const typeLift = (kind: string): number => {
      if (!personalized || segVisits === 0 || profile.typeVisitsTotal === 0 || (segTypeTrips.get(kind) ?? 0) < TOUR_K_MIN) return 1;
      const seg = (segTypeVisits.get(kind) ?? 0) / segVisits;
      const all = (profile.typeVisits.get(kind) ?? 0) / profile.typeVisitsTotal;
      return clamp((seg + TYPE_SHARE_PRIOR) / (all + TYPE_SHARE_PRIOR), TYPE_LIFT_RANGE[0], TYPE_LIFT_RANGE[1]);
    };

    const scored: ScoredPlace[] = profile.pool
      .map((p) => {
        const segN = segPlace.get(p.id) ?? 0;
        const similar = personalized && segN >= TOUR_K_MIN;
        const lift = similar ? clamp((segN + LIFT_PRIOR) / ((matched * p.n) / profile.totalTrips + LIFT_PRIOR), LIFT_RANGE[0], LIFT_RANGE[1]) : typeLift(p.kind);
        return { p, score: Math.max(0, p.bayes - PLAN_BASELINE) * Math.sqrt(p.n) * lift, similarN: similar ? segN : null, lift: similar ? Math.round(lift * 10) / 10 : null };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.p.n - a.p.n || a.p.name.localeCompare(b.p.name));

    const list = scored.slice(0, PLAN_LIST_LIMIT);
    const isMeal = (x: ScoredPlace): boolean => x.p.kind === '식당';
    let meals = list.filter(isMeal).length;
    let others = list.length - meals;
    for (const x of scored.slice(PLAN_LIST_LIMIT)) {
      if (meals >= PLAN_GROUP_MIN && others >= PLAN_GROUP_MIN) break;
      if (isMeal(x) ? meals >= PLAN_GROUP_MIN : others >= PLAN_GROUP_MIN) continue;
      list.push(x);
      if (isMeal(x)) meals += 1;
      else others += 1;
    }

    // 등록된 맛집 링크(매칭 대상 유형만 조회) — 목록·일정의 placeId 와 식당 자리 우선에 쓴다.
    const matchable = new Set<string>(TOUR_RESTAURANT_TYPE_SHORTS);
    const registered = await registeredNaverIds(
      this.prisma,
      scored.filter((x) => matchable.has(x.p.kind)).map((x) => x.p.id),
    );

    let itinerary: TourPlanResultType['itinerary'] = null;
    if (profile.itinerary) {
      const byId = new Map(scored.map((x) => [x.p.id, x.p]));
      const candidates: PlanCandidate[] = [];
      for (const x of scored) {
        if (!routable(x.p)) continue;
        candidates.push({ id: x.p.id, kind: x.p.kind, slot: slotOf(x.p.kind), lat: x.p.lat, lng: x.p.lng, score: x.score, stayMin: x.p.stayMin, bands: x.p.bands, pos: x.p.pos, registered: registered.has(x.p.id) });
      }
      const nights = body.nights ?? Math.round(median(segNights) ?? 2);
      const days = synthesizePlanItinerary({
        days: tourItineraryDays(nights),
        candidates,
        zones: profile.itinerary.zones,
        reachKm: profile.itinerary.reachKm,
        skeletons: { similar: personalized ? buildPlanSkeletons(segDays) : emptyPlanSkeletonSet(), region: profile.itinerary.skeletons },
        posBase: profile.posBase,
        legModel: profile.itinerary.legModel,
        typeStay: profile.typeStay,
      });
      const toAlt = (id: string): TourPlanAltType => {
        const p = byId.get(id)!;
        return { name: p.name, kind: p.kind, n: p.n, mean: round2(p.bayes), placeId: registered.get(id) ?? null };
      };
      const out: TourPlanDayType[] = days.map((d, i) => {
        const places = d.stops.map((s) => byId.get(s.id)!);
        const spends = places.map((p) => p.spendPp).filter((v): v is number => v !== null);
        return {
          day: i + 1,
          area: areaOf(places),
          pattern: places.map((p) => p.kind).join('>'),
          patternBasis: d.basis,
          stops: d.stops.map((s, k) => {
            const p = places[k]!;
            return {
              name: p.name,
              kind: p.kind,
              sigungu: p.sigungu,
              emd: p.emd,
              n: p.n,
              mean: round2(p.bayes),
              placeId: registered.get(p.id) ?? null,
              arriveMin: s.arriveMin,
              stayMin: s.stayMin,
              moveMin: s.moveMin,
              moveKm: s.moveKm,
              spendPp: p.spendPp,
              alternatives: s.altIds.map(toAlt),
            };
          }),
          moveMin: d.stops.reduce((a, s) => a + (s.moveMin ?? 0), 0),
          moveKm: Math.round(d.stops.reduce((a, s) => a + (s.moveKm ?? 0), 0) * 10) / 10,
          stayMin: d.stops.reduce((a, s) => a + s.stayMin, 0),
          spendPp: spends.length > 0 ? spends.reduce((a, v) => a + v, 0) : null,
        };
      });
      if (out.length > 0) itinerary = { days: out, legBasis: profile.itinerary.legModel.observed ? 'observed' : 'default' };
    }

    // 흔한 하루 유형 순서(5차 그대로 — 이동·숙소가 들어간 원래 순서).
    const templateMap = new Map<string, number>();
    for (let i = 0; i < tripIds.length; i += IN_CHUNK) {
      const rows = await this.prisma.tourDaySequence.findMany({
        where: { travelId: { in: tripIds.slice(i, i + IN_CHUNK) }, ...dayWhere, nStops: { gte: 3, lte: 7 } } as Prisma.TourDaySequenceWhereInput,
        select: { typeSeq: true },
      });
      for (const d of rows) countMap(templateMap, d.typeSeq);
    }

    const toPlace = (x: ScoredPlace): TourPlanPlaceType => ({
      name: x.p.name,
      kind: x.p.kind,
      sigungu: x.p.sigungu,
      emd: x.p.emd,
      n: x.p.n,
      mean: round2(x.p.bayes),
      score: Math.round(x.score * 10) / 10,
      similarN: x.similarN,
      lift: x.lift,
      peak: planPeakLabel(x.p.bands),
      stayMin: x.p.stayMin,
      spendPp: x.p.spendPp,
      placeId: registered.get(x.p.id) ?? null,
    });

    return {
      matchedTrips: matched,
      relaxed,
      insufficient: matched < TOUR_INSIGHTS_MIN_TRIPS,
      places: list.map(toPlace),
      templates: [...templateMap.entries()]
        .map(([label, n]) => ({ label, n }))
        .filter((x) => x.n >= 2)
        .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
        .slice(0, 8),
      itinerary,
      excludedClosed: profile.excludedClosed,
      sampleLabel: TOUR_SAMPLE_LABEL,
      sourceNote: TOUR_SOURCE_NOTE,
    };
  }
}
