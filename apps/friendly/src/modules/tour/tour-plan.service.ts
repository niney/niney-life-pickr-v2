// 여행로그 코스 추천(5차 → 10차 보강) — "나와 비슷한 여행자가 만족한 곳" 을 고르고, 지원 지역에서는 일정표까지 합성한다.
// 공개 층이라 응답에 식별자·좌표가 없고(계약), 장소는 여행 TOUR_K_MIN 건·평가 TOUR_RATING_MIN_N 건 이상인 곳만 나간다.
//
//   · 비슷한 여행 — 세그먼트(연령·성별·동반·박수·월) 일치. 20건 미만이면 month → gender → nights → ageGrp 순으로 풀며 기록한다.
//   · 장소 후보 — 공개 가능 여부와 표시 숫자(n·보정 만족도)는 지역 표본 전체 기준이다. 비슷한 여행은 정렬 가중치로만 쓴다:
//     그 여행 5건 이상이 간 곳은 "지역 평균 대비 몇 배 갔나" 로, 그 미만이면 유형 선호(비슷한 여행이 그 유형을 평균보다 얼마나
//     가나)로 물러선다. 5차는 비슷한 여행 "안에서" 5건을 요구해 조건을 좁힐수록 장소가 사라졌다 — 그 어긋남을 없앤 것.
//     점수 = (보정 만족도 − 3.3) × √n × 선호. 국세청 조회에서 폐업·휴업으로 확인된 곳은 뺀다.
//   · 일정표 — utils TOUR_ITINERARY_REGIONS 지역만('전체' 빼고 전부 — 13차). 합성 규칙은 tour-plan-synth.ts(개별 여행의 하루 동선은
//     읽지 않는다). 제주 밖은 일정 전체를 거점 동네 주변(지역별 거점 반경)에서 짜고, 식당 후보가 없는 식사 자리는 볼거리로 채운다.
//   · 같은 곳 합치기(13차) — 장소 id 는 데이터셋 안에서만 유일해 제주·도서 세트와 권역 세트에 같이 잡힌 곳이 따로 들어온다.
//     이름이 같고 300m 안이면 한 곳으로 센다.
//   · 장소의 유형 — 방문마다 여행자가 적은 유형 중 가장 많은 것(장소 표의 값은 동률·기록 없음일 때만).
//
//   · 입력 확장(11차) — 속도(하루 자리 수 가감)·취향(유형 묶음 가중, 목록 순위에도)·이동수단(대중교통이면 버스 기록의 이동 분 +
//     좁은 하루 권역)·숙소 동네(가까운 권역을 앞세우고 숙소까지 이동 분)·꼭 갈 곳/뺄 곳. 장소는 이름(+읍면동)으로 받는다 —
//     응답에 여행로그 장소 id 가 없으므로.
//   · 날씨(12차) — 비 오는 일차(wetDays, 화면이 예보에서 골라 보낸다)는 야외 유형을 낮추고 실내에 가까운 유형을 앞세운다.
//     서버는 예보를 부르지 않는다(외부 의존 없이 결정적).
//
// 지역 프로필(후보·시간대·일차 위치·여행별 요약·권역·이동 모델)은 지역 키로 10분 캐시한다. 적재·제거(다른 프로세스)로 데이터
// 버전이 바뀌면 프로필을 버리고 다음 요청부터 새로 만든다(tour-data-version.ts). docs/PLAN-tour-log.md §10차·§11차.

import type { Prisma, PrismaClient } from '@prisma/client';
import type { TourInsightsQueryType, TourPlanAltType, TourPlanBodyType, TourPlanDayType, TourPlanPlaceKeyType, TourPlanPlaceType, TourPlanResultType } from '@repo/api-contract';
import {
  TOUR_ITINERARY_REGIONS,
  TOUR_K_MIN,
  TOUR_PLAN_FOCUSES,
  TOUR_PLAN_FOCUS_BOOST,
  TOUR_PLAN_PACES,
  TOUR_RATING_MIN_N,
  TOUR_REGIONS,
  TOUR_RESTAURANT_TYPE_SHORTS,
  TOUR_SAMPLE_LABEL,
  TOUR_SOURCE_NOTE,
  haversineM,
  nearestWeatherPlace,
  tourItineraryDays,
  type TourItineraryRegionDef,
  type TourRegionKey,
} from '@repo/utils';
import { TourVersionedCache, tourDataVersion } from './tour-data-version.js';
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
  planKmBetween,
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
// 이름으로 거르는 곳(13차) — 대형마트·편의점·생활용품점·주거 단지. 유형이 '상점' 이면 위에서 빠지지만 유형은 여행자가 방문마다
// 적는 값이라 '상업'·'식당' 으로 더 많이 적힌 곳이 남는다(이마트 서귀포점 36건·GS25·○○아파트 — 2026-10-04 실측). 목록에는 남는다.
const SLOT_NAME_EXCLUDED = /이마트|롯데마트|홈플러스|코스트코|하나로마트|트레이더스|다이소|GS25|세븐일레븐|미니스톱|편의점|^CU\s|(아파트|오피스텔)$/;
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
// ── 11차 입력 확장 ──
// 대중교통 — 버스 구간 기록이 모자라면 차 모델 × 1.8 + 10분(기다림·환승), 하루 권역은 반경의 0.7배·앞 장소 거리 감쇠는 5km.
const TRANSIT_FALLBACK = { factor: 1.8, extra: 10 } as const;
const TRANSIT_REACH_FACTOR = 0.7;
const TRANSIT_PROX_KM = 5;
// 앞 장소와의 거리 감쇠 척도 = 하루 권역 반경 × 2/3(제주 12km → 8km). 하루 동선이 좁은 지역은 그만큼 가까운 곳끼리 잇는다.
const PROX_PER_ZONE_KM = 2 / 3;
// 같은 곳 판정(13차) — 이름이 같고 이 거리(km) 안.
const MERGE_KM = 0.3;
// 사실상 같은 곳 묶음 — 한쪽 이름이 다른 쪽 이름 + 공백으로 시작하고("대왕암공원" · "대왕암공원 출렁다리") 이 거리(km) 안.
// 합치지는 않고(따로 간 사람이 있다) 한 일정에 한 곳만 넣는다.
const SIBLING_KM = 0.5;
// 비 오는 날(12차) 유형별 배수 — 유형이 장소 단위 실내·야외 정보가 아니라 거친 구분이라 완만하게: 바깥(자연·산책·레저)은 절반,
// 반쯤 바깥(역사·테마)은 0.8, 실내가 많은 문화는 1.5, 시장·쇼핑(상업)과 체험은 1.2. 식당은 그대로.
const WET_KIND_FACTOR: ReadonlyMap<string, number> = new Map([
  ['자연', 0.5],
  ['산책', 0.5],
  ['레저', 0.5],
  ['역사', 0.8],
  ['테마', 0.8],
  ['문화', 1.5],
  ['상업', 1.2],
  ['체험', 1.2],
]);
// 숙소 동네 선택지 — 후보 장소가 이만큼은 있는 권역을 방문 많은 순으로.
const AREA_MIN_PLACES = 3;
const AREA_LIMIT = 12;
// 구간 기록의 이동수단(원본 표기) → 모델 묶음. '렌터카(승용/승합/버스 등등)' 에 '버스' 가 들어 있어 앞머리부터 본다.
type LegMode = 'car' | 'transit' | 'walk' | 'other';
const legModeOf = (mvmn: string | null): LegMode => {
  if (!mvmn) return 'other';
  if (mvmn.startsWith('렌터카') || mvmn.startsWith('자가용') || mvmn.startsWith('택시')) return 'car';
  if (mvmn.startsWith('도보')) return 'walk';
  if (mvmn.startsWith('관광버스')) return 'other';
  return /버스|지하철|전철|기차|철도|KTX/.test(mvmn) ? 'transit' : 'other';
};

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface PoolPlace {
  id: string;
  // 같은 곳으로 합친 원래 장소 id 전부(자기 자신 포함) — 등록 맛집 연결은 어느 id 에 걸려 있을지 모른다.
  ids: string[];
  name: string;
  kind: string;
  sido: string | null;
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
  // 사실상 같은 곳 묶음의 대표 id(없으면 자기 id).
  group: string;
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
  // 일정표 지역만 — 지역 설정(권역 반경·거점 반경 …), 권역(중심·방문 합)과 그 라벨·후보 수(같은 순서), 수단별 이동 모델, 지역 전체
  // 뼈대. withSido = 여러 시도를 묶은 지역이라 동네 라벨에 시도를 붙인다.
  itinerary: {
    cfg: TourItineraryRegionDef;
    withSido: boolean;
    zones: PlanZone[];
    areas: Array<{ label: string; n: number }>;
    legModels: { car: PlanLegModel; transit: PlanLegModel };
    skeletons: PlanSkeletonSet;
  } | null;
}
interface ScoredPlace {
  p: PoolPlace;
  score: number;
  similarN: number | null;
  lift: number | null;
}

// 일차 위치 — 당일 여행은 only, 첫날 first, 마지막 날(박수 + 1 일차 이후) last, 그 사이 mid.
const dayPosOf = (dayIndex: number | null, nights: number): PlanDayPos | null => (dayIndex === null ? null : nights <= 0 ? 'only' : dayIndex <= 1 ? 'first' : dayIndex >= nights + 1 ? 'last' : 'mid');
type RoutablePlace = PoolPlace & { lat: number; lng: number };
// 일정에 넣을 수 있는 곳 — 좌표가 있고 자리에 넣는 유형. 부속섬은 그 열이 뜻을 갖는 지역(제주)에서만 뺀다.
const routableIn =
  (cfg: TourItineraryRegionDef) =>
  (p: PoolPlace): p is RoutablePlace =>
    p.lat !== null && p.lng !== null && !(cfg.skipIslands && p.island) && !SLOT_EXCLUDED.has(p.kind) && !SLOT_NAME_EXCLUDED.test(p.name);

// 읍면동에 그 읍면동이 가장 많이 속한 시군구를 붙인다("해운대구 우동·수영구 광안동") — 읍면동이 시군구를 넘나드는 라벨에서.
// 이어진 읍면동이 같은 시군구면 한 번만 적는다("수영구 광안동·민락동").
const withSigungu = (places: PoolPlace[], emds: string[], weightOf: (p: PoolPlace) => number): string[] => {
  let prev: string | undefined;
  return emds.map((emd) => {
    const w = new Map<string, number>();
    for (const p of places) if (p.emd === emd && p.sigungu) countMap(w, p.sigungu, weightOf(p));
    const sigungu = [...w.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    const label = sigungu && sigungu !== prev ? `${sigungu} ${emd}` : emd;
    prev = sigungu;
    return label;
  });
};

// 그날 도는 동네 — 들르는 곳의 읍면동을 많이 나온 순으로 둘까지("제주시 애월읍·한림읍"). 시군구가 갈리면 읍면동마다 시군구를
// 붙인다("서귀포시 성산읍·제주시 구좌읍"). 여러 시도를 묶은 지역은 시도를 앞에 붙인다("부산 해운대구 우동·중동" — '중구'·'동구' 가
// 시도마다 있다).
const areaOf = (stops: PoolPlace[], withSido: boolean): string => {
  const uniq = (pick: (p: PoolPlace) => string | null): string[] => [...new Set(stops.map(pick).filter((v): v is string => Boolean(v)))];
  const sidos = withSido ? uniq((p) => p.sido) : [];
  const prefix = sidos.length === 1 ? `${sidos[0]} ` : '';
  const sigungus = uniq((p) => p.sigungu);
  const emdCount = new Map<string, number>();
  for (const p of stops) if (p.emd) countMap(emdCount, p.emd);
  const emds = [...emdCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([emd]) => emd);
  if (emds.length === 0) return `${prefix}${sigungus.join('·')}`.trim();
  if (sigungus.length === 1) return `${prefix}${sigungus[0]} ${emds.join('·')}`;
  return `${prefix}${withSigungu(stops, emds, () => 1).join('·')}`;
};

// 권역 라벨 — 가장 가까운 권역에 속한 후보 장소의 읍면동을 방문 여행 수로 무게를 달아 둘까지. 같은 라벨이 겹치면 번호를 붙인다
// (숙소 동네 입력이 이 라벨로 되돌아온다).
const zoneAreas = (zones: PlanZone[], places: RoutablePlace[], withSido: boolean): Array<{ label: string; n: number }> => {
  const members: Array<Array<PoolPlace>> = zones.map(() => []);
  for (const p of places) {
    let best = -1;
    let bestKm = Number.POSITIVE_INFINITY;
    zones.forEach((z, zi) => {
      const km = planKmBetween(z, p);
      if (km < bestKm) {
        bestKm = km;
        best = zi;
      }
    });
    if (best >= 0) members[best]!.push(p);
  }
  const seen = new Map<string, number>();
  return members.map((ps) => {
    const top = (pick: (p: PoolPlace) => string | null, n: number): string[] => {
      const w = new Map<string, number>();
      for (const p of ps) {
        const key = pick(p);
        if (key) countMap(w, key, p.n);
      }
      return [...w.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, n)
        .map(([key]) => key);
    };
    const emds = top((p) => p.emd, 2);
    const sigungu = top((p) => p.sigungu, 1)[0];
    // 시군구는 고른 읍면동이 전부 그 시군구일 때만 앞에 한 번 붙인다. 경계에 걸친 권역은 읍면동마다("서귀포시 성산읍·제주시 구좌읍").
    const oneSigungu = sigungu !== undefined && ps.every((p) => !p.emd || !emds.includes(p.emd) || p.sigungu === sigungu);
    const sido = withSido ? top((p) => p.sido, 1)[0] : undefined;
    const local =
      emds.length === 0 ? (sigungu ?? '이름 없는 동네') : oneSigungu ? `${sigungu} ${emds.join('·')}` : withSigungu(ps, emds, (p) => p.n).join('·');
    const base = sido ? `${sido} ${local}` : local;
    const dup = (seen.get(base) ?? 0) + 1;
    seen.set(base, dup);
    return { label: dup === 1 ? base : `${base} ${dup}`, n: ps.length };
  });
};
// 이름(+읍면동)으로 가리킨 장소 — 같은 이름이 여럿이면 방문이 가장 많은 곳.
const matchesKey = (p: PoolPlace, key: TourPlanPlaceKeyType): boolean => p.name === key.name && (!key.emd || p.emd === key.emd);

export class TourPlanService {
  // 프로미스를 캐시한다 — 같은 지역 요청이 겹쳐도 프로필은 한 번만 만든다.
  private readonly profiles = new TourVersionedCache<Promise<RegionProfile>>({ max: 8, ttl: CACHE_TTL_MS });

  constructor(private readonly prisma: PrismaClient) {}

  invalidate(): void {
    this.profiles.clear();
  }

  private async profile(region: TourRegionKey): Promise<RegionProfile> {
    // 프로필을 꺼내기 직전에(= 프로필이 읽는 표보다 먼저) 읽는다 — 버전이 바뀌었으면 캐시가 비워져 새로 만든다.
    const version = await tourDataVersion(this.prisma);
    let p = this.profiles.get(version, region);
    if (!p) {
      p = this.buildProfile(region);
      this.profiles.set(version, region, p);
      const built = p;
      // 실패한 프로필과 빈 프로필(미적재)은 남기지 않는다 — 적재 이력 없이 넣은 데이터는 버전이 그대로라 비워 줄 신호가 없고,
      // 빈 채로 10분을 붙들면 넣은 직후에도 "0건" 으로 보인다. 빈 프로필은 다시 만들어도 싸다.
      const drop = (): void => this.profiles.drop(region, built);
      built.then((r) => r.totalTrips === 0 && drop(), drop);
    }
    return p;
  }

  private async buildProfile(region: TourRegionKey): Promise<RegionProfile> {
    const cfg = TOUR_ITINERARY_REGIONS[region] ?? null;
    const placeWhere = tourRegionPlaceWhere(region);
    const [placeRows, tripRows, visitRows, closedRows] = await Promise.all([
      this.prisma.tourPlace.findMany({
        where: { ...placeWhere, nTravelers: { gte: TOUR_K_MIN }, nRated: { gte: TOUR_RATING_MIN_N }, bayesScore: { not: null }, typeShort: { notIn: [...PLAN_EXCLUDED_TYPES] } } as Prisma.TourPlaceWhereInput,
        select: { id: true, name: true, typeShort: true, sido: true, sigungu: true, emd: true, lat: true, lng: true, isIsland: true, nTravelers: true, bayesScore: true, stayMedian: true, spendPpMedian: true, spendN: true },
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
        ids: [p.id],
        name: p.name,
        kind: p.typeShort,
        sido: p.sido,
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
        group: p.id,
      });
    }

    // 같은 곳 합치기(13차) — 이름이 같고 MERGE_KM 안인 후보는 여행이 가장 많은 쪽으로 합친다. 방문 여행 수는 더하고(세트마다
    // 패널이 달라 겹치지 않는다) 보정 만족도는 여행 수로 가중, 나머지 표시값은 여행이 많은 쪽을 따른다. 합쳐진 id 의 방문은
    // 아래에서 대표 id 로 센다.
    const alias = new Map<string, string>();
    const byName = new Map<string, PoolPlace[]>();
    for (const p of pool.values()) {
      const group = byName.get(p.name) ?? [];
      group.push(p);
      byName.set(p.name, group);
    }
    for (const group of byName.values()) {
      if (group.length < 2) continue;
      const heads: PoolPlace[] = [];
      for (const p of group.sort((a, b) => b.n - a.n || a.id.localeCompare(b.id))) {
        const head = p.lat !== null && p.lng !== null ? heads.find((h) => h.lat !== null && h.lng !== null && planKmBetween({ lat: h.lat, lng: h.lng }, { lat: p.lat!, lng: p.lng! }) <= MERGE_KM) : undefined;
        if (!head) {
          heads.push(p);
          continue;
        }
        head.bayes = (head.bayes * head.n + p.bayes * p.n) / (head.n + p.n);
        head.n += p.n;
        head.stayMin ??= p.stayMin;
        head.spendPp ??= p.spendPp;
        head.ids.push(p.id);
        alias.set(p.id, head.id);
        pool.delete(p.id);
      }
    }
    const poolOf = (placeId: string | null): PoolPlace | undefined => (placeId ? pool.get(alias.get(placeId) ?? placeId) : undefined);

    // 방문 한 번 훑기 — 장소별 유형·시간대·일차 위치, 여행별 요약, 지역 유형 비중, (일정 지역이면) 하루 자리 순서.
    const trips = new Map<string, TripFacts>(tripRows.map((t) => [t.id, { nights: t.nights, places: new Set<string>(), types: new Map<string, number>(), days: [] }]));
    const typeVisits = new Map<string, number>();
    let typeVisitsTotal = 0;
    const posCount = { first: 0, mid: 0, last: 0 };
    const dayStops = new Map<string, { travelId: string; pos: PlanDayPos; stops: Array<{ order: number; type: string; hour: number | null }> }>();
    const kindVotes = new Map<string, Map<string, number>>();
    for (const v of visitRows) {
      // 유형은 여행자가 방문마다 적는다 — 같은 장소도 자연·레저·산책으로 갈리므로 장소의 유형은 가장 많이 적힌 것으로 정한다.
      const place = poolOf(v.placeId);
      if (place) {
        const votes = kindVotes.get(place.id) ?? new Map<string, number>();
        kindVotes.set(place.id, votes);
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
    // 사실상 같은 곳 묶음 — 이름이 "짧은 이름 + 공백" 으로 시작하고 가까운 쌍을 잇는다(대표 = 여행이 가장 많은 쪽).
    const located = places.filter((p): p is RoutablePlace => p.lat !== null && p.lng !== null).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
    const rootOf = (p: PoolPlace): PoolPlace => {
      let cur = p;
      while (cur.group !== cur.id) cur = pool.get(cur.group)!;
      return cur;
    };
    for (const a of located) {
      for (const b of located) {
        if (a === b || !b.name.startsWith(`${a.name} `) || planKmBetween(a, b) > SIBLING_KM) continue;
        const [ra, rb] = [rootOf(a), rootOf(b)];
        if (ra === rb) continue;
        // 여행이 많은 쪽을 대표로.
        if (ra.n > rb.n || (ra.n === rb.n && ra.id < rb.id)) rb.group = ra.id;
        else ra.group = rb.id;
      }
    }
    for (const p of places) p.group = rootOf(p).id;
    let itinerary: RegionProfile['itinerary'] = null;
    if (cfg) {
      // 이동 모델 — 같은 날 이어진 두 공개 방문(비공개 경유 없음)의 직선거리 × 이동 분.
      const [coordRows, legRows] = await Promise.all([
        this.prisma.tourPlace.findMany({ where: { ...placeWhere, lat: { not: null }, lng: { not: null } } as Prisma.TourPlaceWhereInput, select: { id: true, lat: true, lng: true } }),
        this.prisma.tourTransition.findMany({
          where: { ...tourRegionTransitionWhere(region), sameDay: true, viaPrivate: false, travelMin: { not: null }, fromPlaceId: { not: null }, toPlaceId: { not: null } } as Prisma.TourTransitionWhereInput,
          select: { fromPlaceId: true, toPlaceId: true, travelMin: true, mvmnNm: true },
        }),
      ]);
      // 수단별 모델 — 차: 버스 구간만 뺀 전부(걸어서 옮긴 짧은 구간 포함), 대중교통: 버스·지하철 구간 + 걸어서 옮긴 구간.
      const coords = new Map(coordRows.map((c) => [c.id, { lat: c.lat!, lng: c.lng! }]));
      const carPairs: Array<{ km: number; min: number }> = [];
      const transitPairs: Array<{ km: number; min: number }> = [];
      for (const leg of legRows) {
        const a = coords.get(leg.fromPlaceId!);
        const b = coords.get(leg.toPlaceId!);
        if (!a || !b || leg.fromPlaceId === leg.toPlaceId) continue;
        const pair = { km: haversineM(a, b) / 1000, min: leg.travelMin! };
        const mode = legModeOf(leg.mvmnNm);
        if (mode !== 'transit') carPairs.push(pair);
        if (mode === 'transit' || mode === 'walk') transitPairs.push(pair);
      }
      const car = fitPlanLegModel(carPairs);
      const transit = fitPlanLegModel(transitPairs);
      const allDays: PlanTripDay[] = [];
      for (const t of trips.values()) allDays.push(...t.days);
      const zonePlaces = places.filter(routableIn(cfg)).filter((p) => p.bayes > PLAN_BASELINE);
      // 그날 후보 = 권역 중심에서 권역 반경(cfg.zoneKm) 안 — 이웃 권역과 겹치는 가장자리 장소는 먼저 쓰는 날이 가져간다.
      const zones = buildPlanZones(zonePlaces, cfg.zoneKm);
      const withSido = (TOUR_REGIONS[region].sidos?.length ?? 0) > 1;
      itinerary = {
        cfg,
        withSido,
        zones,
        areas: zoneAreas(zones, zonePlaces, withSido),
        legModels: { car, transit: transit.observed ? transit : { ...car, ...TRANSIT_FALLBACK } },
        skeletons: buildPlanSkeletons(allDays),
      };
    }

    return { totalTrips: tripRows.length, pool: places, excludedClosed, trips, typeVisits, typeVisitsTotal, posBase, typeStay, itinerary };
  }

  async plan(body: TourPlanBodyType): Promise<TourPlanResultType> {
    const dayWhere = tourRegionDayWhere(body.region);
    // 완화 사다리 — 표본이 20건에 못 미치면 덜 중요한 조건부터 뺀다.
    const ladder: Array<'month' | 'gender' | 'nights' | 'ageGrp'> = ['month', 'gender', 'nights', 'ageGrp'];
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

    // 취향(11차) — 고른 묶음의 유형에 가중. 목록 순위와 일정표 후보 점수에 같이 들어간다.
    const focusKinds = new Set<string>((body.focus ?? []).flatMap((f) => [...TOUR_PLAN_FOCUSES[f].kinds]));
    const scored: ScoredPlace[] = profile.pool
      .map((p) => {
        const segN = segPlace.get(p.id) ?? 0;
        const similar = personalized && segN >= TOUR_K_MIN;
        const lift = similar ? clamp((segN + LIFT_PRIOR) / ((matched * p.n) / profile.totalTrips + LIFT_PRIOR), LIFT_RANGE[0], LIFT_RANGE[1]) : typeLift(p.kind);
        const focus = focusKinds.has(p.kind) ? TOUR_PLAN_FOCUS_BOOST : 1;
        return { p, score: Math.max(0, p.bayes - PLAN_BASELINE) * Math.sqrt(p.n) * lift * focus, similarN: similar ? segN : null, lift: similar ? Math.round(lift * 10) / 10 : null };
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
    const linked = await registeredNaverIds(
      this.prisma,
      scored.filter((x) => matchable.has(x.p.kind)).flatMap((x) => x.p.ids),
    );
    // 대표 id → 네이버 placeId(합쳐진 원래 id 중 어느 것에 걸려 있든).
    const registered = new Map<string, string>();
    for (const x of scored) {
      const naverId = x.p.ids.map((id) => linked.get(id)).find((v): v is string => v !== undefined);
      if (naverId) registered.set(x.p.id, naverId);
    }

    let itinerary: TourPlanResultType['itinerary'] = null;
    if (profile.itinerary) {
      const it = profile.itinerary;
      const routable = routableIn(it.cfg);
      const byId = new Map(scored.map((x) => [x.p.id, x.p]));
      // 꼭 갈 곳·뺄 곳(11차) — 이름(+읍면동)으로 후보를 찾는다. 둘 다에 있으면 꼭 갈 곳이 이긴다.
      const resolve = (keys: TourPlanPlaceKeyType[] | undefined): Array<{ key: TourPlanPlaceKeyType; p: PoolPlace | null }> =>
        (keys ?? []).map((key) => ({ key, p: scored.filter((x) => matchesKey(x.p, key)).sort((a, b) => b.p.n - a.p.n)[0]?.p ?? null }));
      const must = resolve(body.must);
      const mustIds = new Set(must.filter((m) => m.p && routable(m.p)).map((m) => m.p!.id));
      const avoidIds = new Set(
        resolve(body.avoid)
          .map((a) => a.p?.id)
          .filter((id): id is string => id !== undefined && !mustIds.has(id)),
      );
      const candidates: PlanCandidate[] = [];
      for (const x of scored) {
        if (!routable(x.p) || avoidIds.has(x.p.id)) continue;
        candidates.push({ id: x.p.id, kind: x.p.kind, slot: slotOf(x.p.kind), lat: x.p.lat, lng: x.p.lng, score: x.score, stayMin: x.p.stayMin, bands: x.p.bands, pos: x.p.pos, registered: registered.has(x.p.id), group: x.p.group });
      }
      const transit = body.transport === 'transit';
      const legModel = transit ? it.legModels.transit : it.legModels.car;
      const stayZone = body.stayArea ? it.areas.findIndex((a) => a.label === body.stayArea) : -1;
      const nights = body.nights ?? Math.round(median(segNights) ?? 2);
      const proxKm = it.cfg.zoneKm * PROX_PER_ZONE_KM;
      const synth = synthesizePlanItinerary({
        days: tourItineraryDays(nights),
        candidates,
        zones: it.zones,
        reachKm: it.cfg.zoneKm * (transit ? TRANSIT_REACH_FACTOR : 1),
        skeletons: { similar: personalized ? buildPlanSkeletons(segDays) : emptyPlanSkeletonSet(), region: it.skeletons },
        posBase: profile.posBase,
        legModel,
        typeStay: profile.typeStay,
        lenShift: TOUR_PLAN_PACES[body.pace ?? 'normal'].lenShift,
        proxKm: transit ? Math.min(TRANSIT_PROX_KM, proxKm) : proxKm,
        pinned: mustIds,
        pinReachKm: it.cfg.zoneKm,
        stay: stayZone >= 0 ? it.zones[stayZone]! : null,
        // 거점 반경이 있는 지역은 숙소에서 그 절반 거리면 점수가 반으로 — 서울에서 잠실에 묵으면서 종로만 도는 일정이 나오지 않게.
        stayScaleKm: it.cfg.hubKm !== null ? it.cfg.hubKm / 2 : undefined,
        wetDays: new Set(body.wetDays ?? []),
        wetFactor: WET_KIND_FACTOR,
        hubKm: it.cfg.hubKm,
        mealFallback: it.cfg.mealFallback,
      });
      const toAlt = (id: string): TourPlanAltType => {
        const p = byId.get(id)!;
        return { name: p.name, kind: p.kind, n: p.n, mean: round2(p.bayes), placeId: registered.get(id) ?? null };
      };
      const out: TourPlanDayType[] = synth.days.map((d, i) => {
        const places = d.stops.map((s) => byId.get(s.id)!);
        const spends = places.map((p) => p.spendPp).filter((v): v is number => v !== null);
        return {
          day: i + 1,
          area: areaOf(places, it.withSido),
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
              pinned: s.pinned,
              alternatives: s.altIds.map(toAlt),
            };
          }),
          moveMin: d.stops.reduce((a, s) => a + (s.moveMin ?? 0), 0),
          moveKm: Math.round(d.stops.reduce((a, s) => a + (s.moveKm ?? 0), 0) * 10) / 10,
          stayMin: d.stops.reduce((a, s) => a + s.stayMin, 0),
          spendPp: spends.length > 0 ? spends.reduce((a, v) => a + v, 0) : null,
          fromStayMin: d.fromStayMin,
          toStayMin: d.toStayMin,
          wet: d.wet,
        };
      });
      if (out.length > 0) {
        // 못 넣은 꼭 갈 곳 — 후보에 없거나(이름 불일치·표본 5건 미만·폐업), 일정에 못 드는 곳(섬·좌표 없음·상점), 날이 모자란 곳.
        const unplaced = [...must.filter((m) => !m.p || !mustIds.has(m.p.id)).map((m) => m.key.name), ...synth.unplaced.map((id) => byId.get(id)!.name)];
        // 거점(13차) — 거점 반경을 쓰는 지역만. 라벨은 숙소로 정했으면 그 동네, 아니면 거점에서 보내는 날의 동네(그날을 못
        // 채웠으면 권역 라벨). 예보 지점은 지역에 적어 둔 것(제주)이 없으면 거점에서 가장 가까운 시·군·구.
        const hub = synth.hub;
        itinerary = {
          days: out,
          legBasis: legModel.observed && legModel.factor === undefined ? 'observed' : 'default',
          transport: transit ? 'transit' : 'car',
          stayArea: stayZone >= 0 ? it.areas[stayZone]!.label : null,
          unplaced: [...new Set(unplaced)],
          base: !hub ? null : stayZone >= 0 ? it.areas[stayZone]!.label : hub.day !== null ? out[hub.day]!.area : it.areas[hub.zone]!.label,
          weatherPlaceId: it.cfg.weatherPlaceId ?? (hub ? (nearestWeatherPlace(hub.lat, hub.lng)?.place.id ?? null) : null),
        };
      }
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
      regionTrips: profile.totalTrips,
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
      // 숙소 동네 선택지 — 후보가 몇 곳은 있는 권역을 방문 많은 순으로.
      areas: profile.itinerary
        ? profile.itinerary.areas
            .map((a, zi) => ({ ...a, weight: profile.itinerary!.zones[zi]!.weight }))
            .filter((a) => a.n >= AREA_MIN_PLACES)
            .sort((a, b) => b.weight - a.weight)
            .slice(0, AREA_LIMIT)
            .map(({ label, n }) => ({ label, n }))
        : [],
      excludedClosed: profile.excludedClosed,
      sampleLabel: TOUR_SAMPLE_LABEL,
      sourceNote: TOUR_SOURCE_NOTE,
    };
  }
}
