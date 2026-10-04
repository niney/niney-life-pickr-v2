import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TourPlanBody, TourPlanFame, TourPlanFocus, TourPlanPace, TourPlanPurpose, TourPlanTransport, type TourPlanResultType } from '@repo/api-contract';
import {
  TOUR_PLAN_FAMES,
  TOUR_PLAN_FAME_KEYS,
  TOUR_PLAN_FOCUSES,
  TOUR_PLAN_FOCUS_KEYS,
  TOUR_PLAN_PACES,
  TOUR_PLAN_PACE_KEYS,
  TOUR_PLAN_PURPOSES,
  TOUR_PLAN_PURPOSE_KEYS,
  TOUR_PLAN_PURPOSE_MAX,
  TOUR_PLAN_TRANSPORTS,
  TOUR_PLAN_TRANSPORT_KEYS,
  TOUR_PLAN_VARIANT_MAX,
  tourSyncLayer,
} from '@repo/utils';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import prismaPlugin from '../../plugins/prisma.js';
import sensiblePlugin from '../../plugins/sensible.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { TourPlanService } from './tour-plan.service.js';
import tourPublicRoutes from './tour-public.route.js';

// 코스 추천(10차) — 격리 DB 에 제주 여행 30건(주 세그먼트 24 + 소수 6)과 세 동네(제주시내 A · 한림 B · 성산 C)의 장소를 심고
// ① 후보는 지역 표본 전체 기준(n·보정 만족도), 비슷한 여행은 가중치로만 ② 유형·표본·평가·폐업 제외 ③ 일정표 합성
// ④ 조건 없음(가중 없음·지역 뼈대) ⑤ 완화 사다리 + 소수 세그먼트 ⑥ 일정 미지원 지역·빈 지역 ⑦ 라우트·식별자·좌표 없음.
// 뼈대는 식사·볼거리 두 묶음의 순서이고, 장소 유형은 방문 기록에 가장 많이 적힌 것이다(⑧).
// 11차 입력 확장 — ⑨ 숙소 동네 선택지 ⑩ 속도 ⑪ 취향 ⑫ 이동수단 ⑬ 숙소 동네 ⑭ 꼭 갈 곳·뺄 곳 ⑮ 선택지 키 동일성. 12차 — 비 오는 날.
// 프로필 캐시 — 빈 프로필은 남기지 않고, 적재 이력(데이터 버전)이 바뀌면 버린다.
// 제주 밖 지역의 일정표(13차 — 거점 반경·같은 곳 합치기·식사 자리 대체)는 tour-plan.service.mainland.test.ts.

const FORBIDDEN_KEYS = /^(travelId|visitAreaId|travelerLabel|photoId|tourPlaceId|lat|lng|latitude|longitude)$/;
const scanKeys = (v: unknown, path: string[] = [], out: string[] = []): string[] => {
  if (Array.isArray(v)) v.forEach((x, i) => scanKeys(x, [...path, String(i)], out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.test(k)) out.push([...path, k].join('.'));
      scanKeys(x, [...path, k], out);
    }
  }
  return out;
};

const MAIN = { ageGrp: '30', gender: '여', accompany: '2인 여행(가족 외)', nights: 2, month: 6 } as const;
const MINOR = { ageGrp: '50', gender: '남', accompany: '나홀로 여행', nights: 1, month: 8 } as const;
type Seg = typeof MAIN | typeof MINOR;

interface PlaceSeed {
  id: string;
  name: string;
  typeShort: string;
  lat: number | null;
  lng: number | null;
  sigungu: string;
  emd: string;
  n: number;
  bayes: number;
  stay?: number;
  spendPp?: number;
  spendN?: number;
  island?: boolean;
}
const PLACES: PlaceSeed[] = [
  { id: 'A1', name: '동문재래시장', typeShort: '상업', lat: 33.5119, lng: 126.5262, sigungu: '제주시', emd: '일도일동', n: 24, bayes: 4.2, stay: 60 },
  { id: 'A2', name: '용두암', typeShort: '자연', lat: 33.516, lng: 126.512, sigungu: '제주시', emd: '용담이동', n: 30, bayes: 4.0, stay: 40 },
  { id: 'A3', name: '우진해장국', typeShort: '식당', lat: 33.5115, lng: 126.52, sigungu: '제주시', emd: '삼도이동', n: 24, bayes: 4.6, stay: 50, spendPp: 11000, spendN: 10 },
  { id: 'A4', name: '올래국수', typeShort: '식당', lat: 33.489, lng: 126.496, sigungu: '제주시', emd: '연동', n: 6, bayes: 4.4, stay: 40 },
  { id: 'B1', name: '협재해수욕장', typeShort: '자연', lat: 33.3941, lng: 126.2396, sigungu: '제주시', emd: '한림읍', n: 24, bayes: 4.5, stay: 90 },
  { id: 'B2', name: '한림공원', typeShort: '테마', lat: 33.3896, lng: 126.2393, sigungu: '제주시', emd: '한림읍', n: 24, bayes: 4.1, stay: 120, spendPp: 15000, spendN: 8 },
  // 결제 2건 — 1인 지출은 가린다(3건 미만).
  { id: 'B3', name: '협재 흑돼지', typeShort: '식당', lat: 33.393, lng: 126.242, sigungu: '제주시', emd: '한림읍', n: 24, bayes: 4.3, stay: 70, spendPp: 25000, spendN: 2 },
  { id: 'B4', name: '금능 카페', typeShort: '식당', lat: 33.39, lng: 126.235, sigungu: '제주시', emd: '한림읍', n: 24, bayes: 4.5, stay: 60 },
  { id: 'C1', name: '성산일출봉', typeShort: '자연', lat: 33.4581, lng: 126.9425, sigungu: '서귀포시', emd: '성산읍', n: 30, bayes: 4.6, stay: 80 },
  { id: 'C2', name: '섭지코지', typeShort: '자연', lat: 33.424, lng: 126.931, sigungu: '서귀포시', emd: '성산읍', n: 6, bayes: 4.3, stay: 60 },
  { id: 'C3', name: '성산 해녀의집', typeShort: '식당', lat: 33.46, lng: 126.936, sigungu: '서귀포시', emd: '성산읍', n: 30, bayes: 4.2, stay: 60 },
  // ── 걸러지거나 일정에는 못 드는 곳.
  { id: 'X-air', name: '제주국제공항', typeShort: '교통', lat: 33.5104, lng: 126.4914, sigungu: '제주시', emd: '용담이동', n: 30, bayes: 4.0 },
  { id: 'X-closed', name: '문닫은식당', typeShort: '식당', lat: 33.51, lng: 126.521, sigungu: '제주시', emd: '삼도이동', n: 20, bayes: 4.8 },
  { id: 'X-few', name: '표본적은곳', typeShort: '자연', lat: 33.52, lng: 126.53, sigungu: '제주시', emd: '건입동', n: 4, bayes: 4.9 },
  { id: 'X-low', name: '평가낮은곳', typeShort: '상업', lat: 33.5, lng: 126.53, sigungu: '제주시', emd: '이도이동', n: 20, bayes: 3.2 },
  { id: 'X-nocoord', name: '좌표없는박물관', typeShort: '문화', lat: null, lng: null, sigungu: '제주시', emd: '일도이동', n: 12, bayes: 4.0 },
  { id: 'X-island', name: '우도', typeShort: '자연', lat: 33.504, lng: 126.953, sigungu: '제주시', emd: '우도면', n: 15, bayes: 4.4, island: true },
  { id: 'X-mart', name: '마트', typeShort: '상점', lat: 33.49, lng: 126.5, sigungu: '제주시', emd: '연동', n: 20, bayes: 3.9 },
  // 장소 표에는 '기타' 로 올라 있지만 방문 기록은 대부분 '문화' — 유형은 방문에 가장 많이 적힌 것으로 정한다.
  { id: 'X-mixed', name: '유형갈리는미술관', typeShort: '기타', lat: 33.3, lng: 126.6, sigungu: '서귀포시', emd: '토평동', n: 8, bayes: 4.1 },
  // 장소 표에는 '식당' 이지만 방문 기록은 대부분 '숙소'(호텔 식당) — 후보에서 빠진다.
  { id: 'X-hotel', name: '호텔안식당', typeShort: '식당', lat: 33.3, lng: 126.61, sigungu: '서귀포시', emd: '토평동', n: 9, bayes: 4.5 },
];
// 여행 하루의 방문 [장소 id, 유형, 도착 시각]. 숙소('L')는 장소 표에 없다.
type Stop = [string, string, number];
const MAIN_DAYS: Stop[][] = [
  [['X-air', '교통', 11], ['A3', '식당', 12], ['A2', '자연', 14], ['A1', '상업', 16], ['L', '숙소', 20]],
  [['B1', '자연', 10], ['B3', '식당', 12], ['B2', '테마', 14], ['B4', '식당', 16], ['L', '숙소', 20]],
  [['C1', '자연', 9], ['C3', '식당', 12], ['X-air', '교통', 16]],
];
const MINOR_DAYS: Stop[][] = [
  [['X-air', '교통', 11], ['A4', '식당', 12], ['A2', '자연', 14], ['L', '숙소', 20]],
  [['C1', '자연', 10], ['C2', '자연', 11], ['C3', '식당', 13], ['X-air', '교통', 17]],
];
// 구간 기록 [from, to, 분] — 1km 미만·1~3km·25~40km 세 구간에 20건씩 넘게 쌓여 이동 모델이 실측이 된다.
// 버스 구간 기록(대중교통 모델) — 세 거리 구간에 24건씩.
const MAIN_BUS_LEGS: Array<[string, string, number]> = [
  ['A3', 'A2', 20],
  ['A2', 'A1', 30],
  ['A1', 'B1', 120],
];
const MAIN_LEGS: Array<[string, string, number]> = [
  ['A3', 'A2', 10],
  ['A2', 'A1', 10],
  ['A1', 'B1', 55],
  ['B1', 'B3', 5],
  ['B3', 'B2', 5],
  ['B2', 'B4', 5],
  ['C1', 'C3', 10],
];

describe('tour plan (격리 DB)', () => {
  let isolated: IsolatedDatabase;
  let app: FastifyInstance;
  let service: TourPlanService;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    const fastify = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    fastify.setValidatorCompiler(validatorCompiler);
    fastify.setSerializerCompiler(serializerCompiler);
    await fastify.register(sensiblePlugin);
    await fastify.register(errorHandlerPlugin);
    await fastify.register(prismaPlugin);
    await fastify.register(tourPublicRoutes);
    await fastify.ready();
    app = fastify;
    service = new TourPlanService(app.prisma);
    const p = app.prisma;

    const trips: Array<{ id: string; seg: Seg; days: Stop[][] }> = [
      ...Array.from({ length: 24 }, (_, i) => ({ id: `T${i}`, seg: MAIN, days: MAIN_DAYS })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `S${i}`, seg: MINOR, days: MINOR_DAYS })),
    ];
    await p.tourTrip.createMany({
      data: trips.map((t) => ({
        id: t.id,
        travelerLabel: t.id,
        startDate: '2023-06-01',
        endDate: '2023-06-03',
        nights: t.seg.nights,
        month: t.seg.month,
        gender: t.seg.gender,
        ageGrp: t.seg.ageGrp,
        accompany: t.seg.accompany,
        nVisits: 10,
        nPublic: 10,
        nJeju: 10,
        nIsland: 0,
        nPhotos: 0,
        nActivities: 0,
        hasGps: false,
      })),
    });
    await p.tourPlace.createMany({
      data: PLACES.map((x) => ({
        id: x.id,
        name: x.name,
        typeCd: '0',
        typeShort: x.typeShort,
        lat: x.lat,
        lng: x.lng,
        sigungu: x.sigungu,
        emd: x.emd,
        isJeju: true,
        isIsland: x.island ?? false,
        nVisits: x.n,
        nTravelers: x.n,
        nRated: x.n,
        meanDgstfn: x.bayes,
        bayesScore: x.bayes,
        stayMedian: x.stay ?? null,
        spendPpMedian: x.spendPp ?? null,
        spendN: x.spendN ?? 0,
        nPhotos: 0,
        nActivities: 0,
        nLodging: 0,
      })),
    });
    await p.tourVisit.createMany({
      data: trips.flatMap((t) => {
        let order = 0;
        return t.days.flatMap((stops, d) =>
          stops.map(([placeId, typeShort, hour]) => {
            order += 1;
            return {
              id: `${t.id}:${order}`,
              travelId: t.id,
              visitAreaId: String(order),
              visitOrder: order,
              dayIndex: d + 1,
              visitDate: '2023-06-01',
              typeCd: '0',
              typeShort,
              isPrivate: false,
              placeId,
              name: PLACES.find((x) => x.id === placeId)?.name ?? '숙소',
              isJeju: true,
              isIsland: false,
              arrivalHour: hour,
              nPhotos: 0,
              nActivities: 0,
              gender: t.seg.gender,
              ageGrp: t.seg.ageGrp,
              accompany: t.seg.accompany,
              nights: t.seg.nights,
              month: t.seg.month,
            };
          }),
        );
      }),
    });
    // 일차 기록이 없는 덧방문 — 방문마다 유형이 갈리는 두 장소(하루 순서·일차 위치 집계에는 끼지 않는다).
    const extra = (tripNo: number, placeId: string, typeShort: string) => ({
      id: `T${tripNo}:x-${placeId}`,
      travelId: `T${tripNo}`,
      visitAreaId: `x-${placeId}`,
      visitOrder: 90,
      dayIndex: null,
      visitDate: '2023-06-01',
      typeCd: '0',
      typeShort,
      isPrivate: false,
      placeId,
      name: PLACES.find((x) => x.id === placeId)!.name,
      isJeju: true,
      isIsland: false,
      nPhotos: 0,
      nActivities: 0,
    });
    await p.tourVisit.createMany({
      data: [
        ...[0, 1, 2, 3, 4, 5].map((i) => extra(i, 'X-mixed', '문화')),
        ...[6, 7].map((i) => extra(i, 'X-mixed', '기타')),
        ...[0, 1, 2, 3, 4, 5].map((i) => extra(i, 'X-hotel', '숙소')),
        ...[6, 7, 8].map((i) => extra(i, 'X-hotel', '식당')),
      ],
    });
    await p.tourTransition.createMany({
      data: trips
        .filter((t) => t.seg === MAIN)
        .flatMap((t) => [
          ...MAIN_LEGS.map(([from, to, travelMin]) => ({ travelId: t.id, fromVisitId: from, toVisitId: to, fromPlaceId: from, toPlaceId: to, travelMin, sameDay: true, viaPrivate: false, bothJeju: true })),
          ...MAIN_BUS_LEGS.map(([from, to, travelMin]) => ({ travelId: t.id, fromVisitId: from, toVisitId: to, fromPlaceId: from, toPlaceId: to, travelMin, mvmnNm: '시내/마을버스', sameDay: true, viaPrivate: false, bothJeju: true })),
        ]),
    });
    await p.tourDaySequence.createMany({
      data: trips.flatMap((t) =>
        t.days.map((stops, d) => ({
          id: `${t.id}:${d + 1}`,
          travelId: t.id,
          dayIndex: d + 1,
          nStops: stops.length,
          typeSeq: stops.map(([, type]) => type).join('>'),
          isJejuDay: true,
          isLastDay: d === t.days.length - 1,
          gender: t.seg.gender,
          ageGrp: t.seg.ageGrp,
          accompany: t.seg.accompany,
          nights: t.seg.nights,
          month: t.seg.month,
        })),
      ),
    });
    await p.tourPlaceBizStatus.create({ data: { placeId: 'X-closed', brno: '1234567890', bStt: '폐업자', checkedAt: new Date() } });
    // 우진해장국(A3)은 등록된 맛집(네이버 placeId 'n-ujin').
    await p.canonicalRestaurant.create({ data: { id: 'C-ujin', name: '우진해장국', latitude: 33.5115, longitude: 126.52 } });
    await p.restaurant.create({ data: { source: 'naver', sourceId: 'n-ujin', placeId: 'n-ujin', canonicalId: 'C-ujin', name: '우진해장국', rawSourceUrl: 'https://m.place.naver.com/restaurant/1', snapshotJson: '{}' } });
    await p.restaurantTourMatch.create({ data: { canonicalId: 'C-ujin', tourPlaceId: 'A3', placeName: '우진해장국', typeShort: '식당', distM: 10, nameScore: 1, status: 'matched', matchedAt: new Date(), lastSeenAt: new Date() } });
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  const place = (r: TourPlanResultType, name: string) => r.places.find((x) => x.name === name);

  it('추천 장소 — 숫자는 지역 표본 전체 기준, 비슷한 여행은 가중치(5건 이상 간 곳에만 similarN·lift)', async () => {
    const r = await service.plan({ region: 'jeju', ...MAIN });
    expect(r).toMatchObject({ regionTrips: 30, matchedTrips: 24, relaxed: [], insufficient: false, excludedClosed: 1 });

    // 우진해장국 — 지역 24건·보정 4.6, 비슷한 여행 24건 전부 방문 → (24+3) ÷ (24×24/30+3) = 1.2배.
    expect(place(r, '우진해장국')).toEqual({ name: '우진해장국', kind: '식당', sigungu: '제주시', emd: '삼도이동', n: 24, mean: 4.6, score: 7.7, similarN: 24, lift: 1.2, peak: '점심', stayMin: 50, spendPp: 11000, placeId: 'n-ujin', purposeFit: false });
    // 용두암은 지역 30건이 다 가는 곳이라 평균 그대로(1.0배).
    expect(place(r, '용두암')).toMatchObject({ n: 30, mean: 4, similarN: 24, lift: 1, peak: '오후', placeId: null });
    // 비슷한 여행이 가지 않은 곳도 사라지지 않는다 — 숫자는 그대로, similarN·lift 만 비운다.
    expect(place(r, '올래국수')).toMatchObject({ n: 6, mean: 4.4, similarN: null, lift: null, peak: '점심' });
    expect(place(r, '협재 흑돼지')).toMatchObject({ spendPp: null, stayMin: 70 });
    expect(place(r, '금능 카페')).toMatchObject({ peak: '오후' });
    // 방문 기록이 없는 곳은 시간대를 말하지 않는다.
    expect(place(r, '우도')).toMatchObject({ n: 15, peak: null, similarN: null });

    expect(r.places.every((x) => x.n >= 5 && (x.similarN === null || x.similarN >= 5))).toBe(true);
    const scores = r.places.map((x) => x.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(r.templates[0]).toEqual({ label: '교통>식당>자연>상업>숙소', n: 24 });
  });

  it('후보에서 빠지는 것 — 이동 유형·표본 5건 미만·만족 3.3 이하·폐업, 남는 것 — 좌표 없음·부속섬·상점', async () => {
    const r = await service.plan({ region: 'jeju', ...MAIN });
    const names = r.places.map((x) => x.name);
    for (const out of ['제주국제공항', '문닫은식당', '표본적은곳', '평가낮은곳']) expect(names).not.toContain(out);
    for (const kept of ['좌표없는박물관', '우도', '마트']) expect(names).toContain(kept);
  });

  it('장소 유형은 방문에 가장 많이 적힌 것 — 장소 표와 달라도 따르고, 대부분 숙소로 적힌 곳은 후보에서 뺀다', async () => {
    const r = await service.plan({ region: 'jeju', ...MAIN });
    // 장소 표는 '기타', 방문은 문화 6·기타 2.
    expect(place(r, '유형갈리는미술관')).toMatchObject({ kind: '문화', n: 8, similarN: 8 });
    // 장소 표는 '식당', 방문은 숙소 6·식당 3.
    expect(place(r, '호텔안식당')).toBeUndefined();
  });

  it('일정표 — 2박 3일: 첫날·마지막 날 동네, 유형·시간대에 맞는 장소, 시각·이동·합계, 대안', async () => {
    const r = await service.plan({ region: 'jeju', ...MAIN });
    const it = r.itinerary!;
    expect(it.legBasis).toBe('observed');
    // 제주는 거점 반경을 쓰지 않는다(섬 전체가 하루 거리) — 거점 없음, 예보 지점은 지역에 적어 둔 제주시.
    expect(it).toMatchObject({ base: null, weatherPlaceId: '11G00201' });
    // 뼈대는 식사·볼거리 두 묶음의 순서다(첫날 "식당>볼거리>볼거리") — 볼거리 자리에 어떤 유형이 올지는 후보가 정한다.
    // 첫날 두 볼거리는 둘 다 오후 방문이라 점수가 높은 시장이 먼저 온다. pattern 은 실제로 고른 장소의 유형.
    expect(it.days.map((d) => [d.day, d.area, d.pattern, d.patternBasis, d.stops.map((s) => s.name)])).toEqual([
      [1, '제주시 삼도이동·일도일동', '식당>상업>자연', 'similar', ['우진해장국', '동문재래시장', '용두암']],
      // 12시 식사 자리는 점심에 가는 곳, 16시 식사 자리는 오후에 가는 곳(카페).
      [2, '제주시 한림읍', '자연>식당>테마>식당', 'similar', ['협재해수욕장', '협재 흑돼지', '한림공원', '금능 카페']],
      [3, '서귀포시 성산읍', '자연>식당', 'similar', ['성산일출봉', '성산 해녀의집']],
    ]);

    const [d1, d2, d3] = it.days;
    expect(d1!.stops.map((s) => [s.arriveMin, s.stayMin, s.moveMin])).toEqual([
      [720, 50, null],
      [840, 60, 5],
      [960, 40, 10],
    ]);
    expect(d1!.stops[0]).toMatchObject({ kind: '식당', n: 24, mean: 4.6, placeId: 'n-ujin', moveKm: null, spendPp: 11000 });
    expect(d1).toMatchObject({ moveMin: 15, moveKm: 2, stayMin: 150, spendPp: 11000 });
    // 한림공원 14:00 + 120분 = 16:00, 이동 5분 → 16:05 → 10분 단위 16:10.
    expect(d2!.stops.map((s) => s.arriveMin)).toEqual([600, 720, 840, 970]);
    expect(d2).toMatchObject({ moveMin: 15, stayMin: 340, spendPp: 15000 });
    expect(d3).toMatchObject({ spendPp: null });

    // 대안 — 일정에 안 쓰인 같은 유형 후보. 부속섬(우도)·상점·좌표 없는 곳은 일정에 들지 않는다.
    expect(d1!.stops[0]!.alternatives).toEqual([{ name: '올래국수', kind: '식당', n: 6, mean: 4.4, placeId: null }]);
    expect(d3!.stops[0]!.alternatives.map((a) => a.name)).toEqual(['섭지코지']);
    const inPlan = it.days.flatMap((d) => d.stops.flatMap((s) => [s.name, ...s.alternatives.map((a) => a.name)]));
    for (const out of ['우도', '마트', '좌표없는박물관', '제주국제공항', '문닫은식당']) expect(inPlan).not.toContain(out);
    expect(it.days.every((d) => d.stops.every((s) => s.n >= 5))).toBe(true);
  });

  it('조건 없음 — 지역 여행 전체가 대상이라 가중이 없고, 일수는 박수 중앙(2박), 뼈대는 지역 전체', async () => {
    const r = await service.plan({ region: 'jeju' });
    expect(r).toMatchObject({ matchedTrips: 30, relaxed: [], insufficient: false });
    expect(r.places.every((x) => x.similarN === null && x.lift === null)).toBe(true);
    // 가중 없이 (4.6 − 3.3) × √30.
    expect(r.places[0]).toMatchObject({ name: '성산일출봉', score: 7.1 });
    expect(r.itinerary!.days.map((d) => [d.pattern, d.patternBasis])).toEqual([
      ['식당>상업>자연', 'region'],
      ['자연>식당>테마>식당', 'region'],
      ['자연>식당', 'region'],
    ]);
  });

  it('완화 사다리 + 소수 세그먼트 — 6건이라 다 풀고도 insufficient, 그래도 장소·일정(1박 2일)은 나온다', async () => {
    const r = await service.plan({ region: 'jeju', ...MINOR });
    expect(r).toMatchObject({ matchedTrips: 6, relaxed: ['month', 'gender', 'nights', 'ageGrp'], insufficient: true });
    // 6건 전부가 간 곳 — (6+3) ÷ (6×6/30+3) = 2.1 → 상한 2배.
    expect(place(r, '올래국수')).toMatchObject({ n: 6, similarN: 6, lift: 2 });
    expect(place(r, '섭지코지')).toMatchObject({ similarN: 6, lift: 2 });
    // 가지 않은 곳(한림)은 숫자 그대로 남는다.
    expect(place(r, '협재해수욕장')).toMatchObject({ n: 24, similarN: null });
    expect(r.places.length).toBeGreaterThanOrEqual(10);

    // 뼈대는 이 6건의 순서(첫날 "식당>볼거리", 마지막 날 "볼거리>볼거리>식당"). 5건 미만이 간 곳에는 가중을 주지도 깎지도
    // 않으므로, 이 여행들이 가지 않은 시장이 점수(지역 전체 기준)로 볼거리 자리에 온다.
    expect(r.itinerary!.days.map((d) => [d.pattern, d.patternBasis, d.stops.map((s) => s.name)])).toEqual([
      ['식당>상업', 'similar', ['우진해장국', '동문재래시장']],
      ['자연>자연>식당', 'similar', ['성산일출봉', '섭지코지', '성산 해녀의집']],
    ]);
    expect(r.itinerary!.days[0]!.stops[0]!.alternatives.map((a) => a.name)).toEqual(['올래국수']);
  });

  it('일정표 미지원 지역은 장소만(itinerary null), 표본 없는 지역은 빈 결과', async () => {
    const all = await service.plan({ region: 'all', ...MAIN });
    expect(all.itinerary).toBeNull();
    expect(all.places.length).toBeGreaterThan(0);

    const none = await service.plan({ region: 'busan' });
    // 적재된 여행이 없는 지역 — regionTrips 0 으로 "조건 탓이 아니라 데이터가 없다" 를 화면이 구분한다.
    expect(none).toMatchObject({ regionTrips: 0, matchedTrips: 0, relaxed: [], insufficient: true, places: [], templates: [], itinerary: null, excludedClosed: 0 });
    // 조건을 줘도 풀 만큼 풀고 0건으로 끝난다.
    expect(await service.plan({ region: 'busan', ageGrp: '30', nights: 2 })).toMatchObject({ regionTrips: 0, matchedTrips: 0, relaxed: ['nights', 'ageGrp'] });
  });

  it('미적재 지역의 빈 프로필은 캐시에 남기지 않는다 — 여행이 적재되면 10분을 기다리지 않고 곧바로 잡힌다', async () => {
    const p = app.prisma;
    expect(await service.plan({ region: 'gangwon' })).toMatchObject({ regionTrips: 0, places: [] });
    await p.tourTrip.create({
      data: { id: 'G0', dataset: 'east', travelerLabel: 'G0', startDate: '2023-06-01', endDate: '2023-06-02', nights: 1, month: 6, gender: '여', ageGrp: '30', accompany: '나홀로 여행', nVisits: 1, nPublic: 1, nJeju: 0, nIsland: 0, nPhotos: 0, nActivities: 0, hasGps: false, visitSidos: ',강원,' },
    });
    try {
      expect(await service.plan({ region: 'gangwon' })).toMatchObject({ regionTrips: 1, matchedTrips: 1 });
      // 적재된 지역의 프로필은 그대로 캐시된다 — 적재 이력 없이 지우면 10분 안에는 옛 프로필(이력이 남는 적재·제거는 아래 테스트).
      await p.tourTrip.delete({ where: { id: 'G0' } });
      expect(await service.plan({ region: 'gangwon' })).toMatchObject({ regionTrips: 1 });
      service.invalidate();
      expect(await service.plan({ region: 'gangwon' })).toMatchObject({ regionTrips: 0 });
    } finally {
      await p.tourTrip.deleteMany({ where: { id: 'G0' } });
      service.invalidate();
    }
  });

  it('데이터 버전 — 적재 이력 행이 추가되면 캐시된 프로필을 버리고 곧바로 새로 만든다', async () => {
    const p = app.prisma;
    // 프로필을 데운다 — 지역 여행 30건, 용두암은 30건이 간 곳.
    const before = await service.plan({ region: 'jeju' });
    expect(before).toMatchObject({ regionTrips: 30, matchedTrips: 30 });
    expect(place(before, '용두암')).toMatchObject({ n: 30 });
    // 재적재를 흉내 — 여행 1건을 더하고 장소 표의 집계 열을 고친다.
    await p.tourTrip.create({
      data: { id: 'N0', travelerLabel: 'N0', startDate: '2023-06-01', endDate: '2023-06-03', ...MAIN, nVisits: 0, nPublic: 0, nJeju: 1, nIsland: 0, nPhotos: 0, nActivities: 0, hasGps: false },
    });
    await p.tourPlace.update({ where: { id: 'A2' }, data: { nTravelers: 31 } });
    try {
      // 이력 행이 없으면 버전이 그대로 — 비슷한 여행은 매번 새로 세지만(31) 프로필은 캐시된 옛것(30)이다.
      const stale = await service.plan({ region: 'jeju' });
      expect(stale).toMatchObject({ regionTrips: 30, matchedTrips: 31 });
      expect(place(stale, '용두암')).toMatchObject({ n: 30 });
      // load:tour·unload:tour(다른 프로세스)가 데이터와 같은 트랜잭션에서 남기는 이력 행 — 버전이 올라 프로필을 새로 만든다.
      await p.lifeMasterSync.create({ data: { layer: tourSyncLayer('jeju'), count: PLACES.length } });
      const fresh = await service.plan({ region: 'jeju' });
      expect(fresh).toMatchObject({ regionTrips: 31, matchedTrips: 31 });
      expect(place(fresh, '용두암')).toMatchObject({ n: 31 });
    } finally {
      await p.tourTrip.delete({ where: { id: 'N0' } });
      await p.tourPlace.update({ where: { id: 'A2' }, data: { nTravelers: 30 } });
      await p.lifeMasterSync.deleteMany();
      service.invalidate();
    }
  });

  // ── 11차 입력 확장 ──────────────────────────────────────────────────────────
  it('숙소 동네 선택지(areas) — 후보가 3곳 이상인 권역을 방문 많은 순으로, 옵션이 없으면 일정에 흔적이 없다', async () => {
    const r = await service.plan({ region: 'jeju', ...MAIN });
    expect(r.areas).toEqual([
      { label: '제주시 한림읍', n: 4 },
      { label: '제주시 용담이동·삼도이동', n: 4 },
      { label: '서귀포시 성산읍', n: 3 },
    ]);
    expect(r.itinerary).toMatchObject({ transport: 'car', stayArea: null, unplaced: [] });
    expect(r.itinerary!.days.every((d) => d.fromStayMin === null && d.toStayMin === null && d.stops.every((s) => !s.pinned))).toBe(true);
    expect((await service.plan({ region: 'all', ...MAIN })).areas).toEqual([]);
  });

  it('속도 — 여유롭게는 하루 자리 수를 하나 줄이고 빽빽하게는 늘린다(그 길이의 실제 뼈대가 있을 때만)', async () => {
    const stops = async (pace: 'relaxed' | 'normal' | 'packed') => (await service.plan({ region: 'jeju', ...MAIN, pace })).itinerary!.days.map((d) => [d.stops.length, d.patternBasis]);
    expect(await stops('normal')).toEqual([[3, 'similar'], [4, 'similar'], [2, 'similar']]);
    // 첫날 3곳 → 2곳(소수 세그먼트가 만든 지역 뼈대 "식당>볼거리"). 가운데 날은 4곳짜리 뼈대뿐이라 그대로.
    expect(await stops('relaxed')).toEqual([[2, 'region'], [4, 'similar'], [2, 'similar']]);
    // 마지막 날 2곳 → 3곳(지역 뼈대 "볼거리>볼거리>식당").
    expect(await stops('packed')).toEqual([[3, 'similar'], [4, 'similar'], [3, 'region']]);
  });

  it('취향 — 고른 묶음의 유형에 1.5배(목록 점수·순위)', async () => {
    const base = await service.plan({ region: 'jeju', ...MAIN });
    const act = await service.plan({ region: 'jeju', ...MAIN, focus: ['activity'] });
    // 한림공원(테마) — (4.1 − 3.3) × √24 × 1.2 = 4.8 → × 1.5 = 7.1. 자연은 그대로.
    expect(place(base, '한림공원')!.score).toBe(4.8);
    expect(place(act, '한림공원')!.score).toBe(7.1);
    expect(place(act, '협재해수욕장')!.score).toBe(place(base, '협재해수욕장')!.score);
    const rank = (r: TourPlanResultType) => r.places.findIndex((x) => x.name === '한림공원');
    expect(rank(act)).toBeLessThan(rank(base));
  });

  it('이동수단 — 대중교통은 버스 구간 기록으로 이동 분을 낸다', async () => {
    const car = (await service.plan({ region: 'jeju', ...MAIN })).itinerary!;
    const bus = (await service.plan({ region: 'jeju', ...MAIN, transport: 'transit' })).itinerary!;
    expect(car).toMatchObject({ transport: 'car', legBasis: 'observed' });
    expect(bus).toMatchObject({ transport: 'transit', legBasis: 'observed' });
    expect(car.days[0]!.stops.map((s) => s.moveMin)).toEqual([null, 5, 10]);
    expect(bus.days[0]!.stops.map((s) => s.moveMin)).toEqual([null, 15, 30]);
    // 도착 시각은 자리의 흔한 시각이 더 늦어 그대로다.
    expect(bus.days[0]!.stops.map((s) => s.arriveMin)).toEqual([720, 840, 960]);
  });

  it('숙소 동네 — 라벨로 받은 권역을 숙소로 보고 숙소에서·숙소까지 이동 분을 붙인다', async () => {
    const r = await service.plan({ region: 'jeju', ...MAIN, stayArea: '제주시 한림읍' });
    expect(r.itinerary!.stayArea).toBe('제주시 한림읍');
    expect(r.itinerary!.days.map((d) => [d.area, d.fromStayMin, d.toStayMin])).toEqual([
      // 도착한 날은 숙소로 가는 쪽만(용두암 → 한림 약 29km).
      ['제주시 삼도이동·일도일동', null, 55],
      ['제주시 한림읍', 5, 5],
      // 떠나는 날은 숙소에서 나오는 쪽만(한림 → 성산 약 66km).
      ['서귀포시 성산읍', 110, null],
    ]);
    // 모르는 라벨은 무시한다.
    const unknown = await service.plan({ region: 'jeju', ...MAIN, stayArea: '없는 동네' });
    expect(unknown.itinerary).toMatchObject({ stayArea: null });
    expect(unknown.itinerary!.days.every((d) => d.fromStayMin === null && d.toStayMin === null)).toBe(true);
  });

  it('꼭 갈 곳·뺄 곳 — 이름으로 받아 그 동네를 가운데 날에 놓고 자리에 고정, 뺀 곳은 일정에서만 사라진다', async () => {
    const must = await service.plan({ region: 'jeju', ...MAIN, must: [{ name: '섭지코지', emd: '성산읍' }] });
    expect(must.itinerary!.unplaced).toEqual([]);
    expect(must.itinerary!.days.map((d) => d.stops.map((s) => (s.pinned ? `*${s.name}` : s.name)))).toEqual([
      ['우진해장국', '동문재래시장', '용두암'],
      // 성산이 마지막 날에서 가운데 날로 옮겨 온다.
      ['*섭지코지', '성산 해녀의집', '성산일출봉'],
      ['협재해수욕장', '협재 흑돼지'],
    ]);

    const avoid = await service.plan({ region: 'jeju', ...MAIN, avoid: [{ name: '우진해장국' }] });
    const names = avoid.itinerary!.days.flatMap((d) => d.stops.flatMap((s) => [s.name, ...s.alternatives.map((a) => a.name)]));
    expect(names).not.toContain('우진해장국');
    expect(avoid.itinerary!.days[0]!.stops[0]!.name).toBe('올래국수');
    expect(place(avoid, '우진해장국')).toBeDefined();

    // 섬(배편)·없는 이름은 못 넣었다고 알려 주고, 꼭 갈 곳과 뺄 곳에 같이 있으면 꼭 갈 곳이 이긴다.
    const mixed = await service.plan({ region: 'jeju', ...MAIN, must: [{ name: '우도' }, { name: '없는곳' }, { name: '한림공원' }], avoid: [{ name: '한림공원' }] });
    expect(mixed.itinerary!.unplaced).toEqual(['우도', '없는곳']);
    expect(mixed.itinerary!.days.flatMap((d) => d.stops.filter((s) => s.pinned).map((s) => s.name))).toEqual(['한림공원']);
    expect(scanKeys(mixed)).toEqual([]);
  });

  it('날씨(12차) — 비 오는 일차만 wet 으로 표시되고 일정 밖 번호는 무시된다', async () => {
    const dry = await service.plan({ region: 'jeju', ...MAIN });
    expect(dry.itinerary!.days.map((d) => d.wet)).toEqual([false, false, false]);
    const wet = await service.plan({ region: 'jeju', ...MAIN, wetDays: [2, 5] });
    expect(wet.itinerary!.days.map((d) => d.wet)).toEqual([false, true, false]);
    // 한림에는 볼거리가 해수욕장과 한림공원뿐이라 장소는 그대로다(유형 배수의 효과는 tour-plan-synth.test 가 고정).
    expect(wet.itinerary!.days[1]!.stops.map((s) => s.name)).toEqual(['협재해수욕장', '협재 흑돼지', '한림공원', '금능 카페']);
  });

  it('입력 선택지 키 — 계약(zod enum)과 utils 상수가 같다(순서 포함)', () => {
    expect(TourPlanPace.options).toEqual([...TOUR_PLAN_PACE_KEYS]);
    expect(TourPlanFocus.options).toEqual([...TOUR_PLAN_FOCUS_KEYS]);
    expect(TourPlanTransport.options).toEqual([...TOUR_PLAN_TRANSPORT_KEYS]);
    expect(Object.keys(TOUR_PLAN_PACES)).toEqual([...TOUR_PLAN_PACE_KEYS]);
    expect(Object.keys(TOUR_PLAN_FOCUSES)).toEqual([...TOUR_PLAN_FOCUS_KEYS]);
    expect(Object.keys(TOUR_PLAN_TRANSPORTS)).toEqual([...TOUR_PLAN_TRANSPORT_KEYS]);
    // 14차 다양화 — 유명도·여행 목적, 그리고 개수·범위 상한.
    expect(TourPlanFame.options).toEqual([...TOUR_PLAN_FAME_KEYS]);
    expect(TourPlanPurpose.options).toEqual([...TOUR_PLAN_PURPOSE_KEYS]);
    expect(Object.keys(TOUR_PLAN_FAMES)).toEqual([...TOUR_PLAN_FAME_KEYS]);
    expect(Object.keys(TOUR_PLAN_PURPOSES)).toEqual([...TOUR_PLAN_PURPOSE_KEYS]);
    const ok = (body: object): boolean => TourPlanBody.safeParse(body).success;
    expect(ok({ purposes: TOUR_PLAN_PURPOSE_KEYS.slice(0, TOUR_PLAN_PURPOSE_MAX) })).toBe(true);
    expect(ok({ purposes: TOUR_PLAN_PURPOSE_KEYS.slice(0, TOUR_PLAN_PURPOSE_MAX + 1) })).toBe(false);
    expect(ok({ variant: TOUR_PLAN_VARIANT_MAX })).toBe(true);
    expect(ok({ variant: TOUR_PLAN_VARIANT_MAX + 1 })).toBe(false);
    expect(ok({ fame: 'unknown' })).toBe(false);
  });

  it('라우트 — POST plan 200(식별자·좌표 키 없음), 잘못된 입력 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/tour/public/plan', payload: { ageGrp: '30', accompany: '2인 여행(가족 외)', nights: 2 } });
    expect(res.statusCode).toBe(200);
    const r = res.json() as TourPlanResultType;
    expect(r.matchedTrips).toBe(24);
    expect(r.itinerary!.days).toHaveLength(3);
    expect(place(r, '우진해장국')!.placeId).toBe('n-ujin');
    expect(scanKeys(r)).toEqual([]);
    expect(r.sourceNote).toContain('aihub.or.kr');
    expect((await app.inject({ method: 'POST', url: '/api/v1/tour/public/plan', payload: { nights: 9 } })).statusCode).toBe(400);

    // 11차 입력 — 옵션이 계약대로 검증되고(모르는 속도·꼭 갈 곳 9곳 400) 응답에 반영된다.
    const post = (payload: object) => app.inject({ method: 'POST', url: '/api/v1/tour/public/plan', payload });
    const opt = (await post({ ageGrp: '30', accompany: '2인 여행(가족 외)', nights: 2, pace: 'relaxed', focus: ['nature'], transport: 'transit', stayArea: '서귀포시 성산읍', must: [{ name: '한림공원' }] })).json() as TourPlanResultType;
    expect(opt.itinerary).toMatchObject({ transport: 'transit', stayArea: '서귀포시 성산읍', unplaced: [] });
    expect(scanKeys(opt)).toEqual([]);
    expect((await post({ pace: 'slow' })).statusCode).toBe(400);
    expect((await post({ focus: ['food'] })).statusCode).toBe(400);
    expect((await post({ must: Array.from({ length: 9 }, (_, i) => ({ name: `곳${i}` })) })).statusCode).toBe(400);
    expect((await post({ wetDays: [0] })).statusCode).toBe(400);
    expect((await post({ wetDays: [6] })).statusCode).toBe(400);
    expect(((await post({ nights: 2, wetDays: [1] })).json() as TourPlanResultType).itinerary!.days[0]!.wet).toBe(true);
  });
});
