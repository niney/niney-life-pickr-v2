import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TourPlanResultType } from '@repo/api-contract';
import { weatherPlaceById } from '@repo/utils';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import prismaPlugin from '../../plugins/prisma.js';
import sensiblePlugin from '../../plugins/sensible.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { TourPlanService } from './tour-plan.service.js';
import tourPublicRoutes from './tour-public.route.js';

// 코스 일정표를 제주 밖으로(13차) — 격리 DB 에 강원 여행 44건과 네 동네(강릉 · 속초(강릉에서 52km) · 춘천(100km 넘게 떨어진 내륙,
// 식당 후보 없음) · 삼척(44km, 방문 기록 없이 후보만))의 장소를 심고 ① 같은 곳 합치기(세트가 달라 따로 잡힌 강문해변) ② 일정은 거점 동네 주변에서(거점 라벨·예보 지점)
// ③ 일정에 넣지 않는 이름(마트·아파트)과 사실상 같은 곳 묶음 ④ 숙소 동네·꼭 갈 곳이 거점을 옮긴다 ⑤ 식당 없는 동네는 볼거리로
// ⑥ 권역(여러 시도)은 라벨에 시도 ⑦ '전체' 는 여전히 장소만 ⑧ 라우트.
// 14차 다양화 — ⑨ 유명도(점수에서 여행 수의 몫) ⑩ 여행 목적(그 목적의 여행이 더 간 곳 · 목적에 맞는 곳 표시) ⑪ 풀린 조건의 선호
// ⑫ 다른 코스 보기(변형 번호 — 같은 번호는 같은 코스).
// 제주 지역의 동작은 tour-plan.service.test.ts 가 본다.

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

const SEG = { ageGrp: '30', gender: '여', accompany: '2인 여행(가족 외)', month: 6 } as const;

interface PlaceSeed {
  id: string;
  dataset?: 'east' | 'jeju';
  name: string;
  typeShort: string;
  lat: number;
  lng: number;
  sigungu: string;
  emd: string;
  n: number;
  bayes: number;
  island?: boolean;
}
const PLACES: PlaceSeed[] = [
  // ── 강릉.
  { id: 'east:G1', name: '강문해변', typeShort: '자연', lat: 37.795, lng: 128.918, sigungu: '강릉시', emd: '강문동', n: 30, bayes: 4.5 },
  // 제주·도서 세트에도 같은 곳이 잡혀 있다(id 가 다르다) — 한 곳으로 합쳐진다.
  { id: 'J-G1', dataset: 'jeju', name: '강문해변', typeShort: '자연', lat: 37.7952, lng: 128.9181, sigungu: '강릉시', emd: '강문동', n: 8, bayes: 4.3 },
  // 이름이 "강문해변 " 으로 시작하고 60m 거리 — 따로 세지만 한 일정에는 둘 중 하나만.
  { id: 'east:G1b', name: '강문해변 솟대다리', typeShort: '자연', lat: 37.7955, lng: 128.9185, sigungu: '강릉시', emd: '강문동', n: 6, bayes: 4.4 },
  { id: 'east:G2', name: '경포해수욕장', typeShort: '자연', lat: 37.805, lng: 128.908, sigungu: '강릉시', emd: '강문동', n: 20, bayes: 4.5 },
  { id: 'east:G3', name: '강릉중앙시장', typeShort: '상업', lat: 37.754, lng: 128.898, sigungu: '강릉시', emd: '성남동', n: 30, bayes: 4.2 },
  { id: 'east:G4', name: '초당순두부', typeShort: '식당', lat: 37.79, lng: 128.915, sigungu: '강릉시', emd: '초당동', n: 20, bayes: 4.4 },
  { id: 'east:G5', name: '안목해변', typeShort: '자연', lat: 37.772, lng: 128.947, sigungu: '강릉시', emd: '견소동', n: 20, bayes: 4.6 },
  { id: 'east:G6', name: '강릉짬뽕', typeShort: '식당', lat: 37.756, lng: 128.9, sigungu: '강릉시', emd: '성남동', n: 20, bayes: 4.3 },
  // 유형은 상업·식당이지만 목적지로 권하지 않는 이름 — 목록에는 남고 일정에는 들지 않는다.
  { id: 'east:G-mart', name: '이마트 강릉점', typeShort: '상업', lat: 37.77, lng: 128.9, sigungu: '강릉시', emd: '송정동', n: 10, bayes: 4.7 },
  { id: 'east:G-apt', name: '강릉푸른아파트', typeShort: '식당', lat: 37.78, lng: 128.91, sigungu: '강릉시', emd: '초당동', n: 9, bayes: 4.8 },
  // ── 속초.
  { id: 'east:S1', name: '속초해수욕장', typeShort: '자연', lat: 38.19, lng: 128.602, sigungu: '속초시', emd: '조양동', n: 28, bayes: 4.4 },
  { id: 'east:S2', name: '속초관광수산시장', typeShort: '상업', lat: 38.205, lng: 128.59, sigungu: '속초시', emd: '중앙동', n: 30, bayes: 4.2 },
  { id: 'east:S3', name: '영금정', typeShort: '역사', lat: 38.213, lng: 128.602, sigungu: '속초시', emd: '동명동', n: 14, bayes: 4.5 },
  { id: 'east:S4', name: '속초물회', typeShort: '식당', lat: 38.192, lng: 128.604, sigungu: '속초시', emd: '조양동', n: 10, bayes: 4.5 },
  // ── 춘천(식당 후보 없음). 남이섬의 섬 표시는 제주 밖에서는 뜻이 없다 — 일정에 든다.
  { id: 'east:C1', name: '남이섬', typeShort: '자연', lat: 37.88, lng: 127.73, sigungu: '춘천시', emd: '남산면', n: 12, bayes: 4.5, island: true },
  { id: 'east:C2', name: '소양강스카이워크', typeShort: '자연', lat: 37.893, lng: 127.724, sigungu: '춘천시', emd: '근화동', n: 8, bayes: 4.3 },
  { id: 'east:C3', name: '의암호', typeShort: '산책', lat: 37.87, lng: 127.7, sigungu: '춘천시', emd: '삼천동', n: 6, bayes: 4.2 },
  // ── 삼척(강릉에서 44km — 거점 반경 38km 밖). 방문 기록이 없어 시간대·일차 선호가 없고 표본·만족도가 전부 같다 — 점수가 비슷한
  //    후보가 모인 동네(다른 코스 보기가 고르는 곳이 달라지는 조건).
  { id: 'east:M1', name: '삼척해변', typeShort: '자연', lat: 37.45, lng: 129.16, sigungu: '삼척시', emd: '교동', n: 7, bayes: 4.4 },
  { id: 'east:M2', name: '죽서루', typeShort: '역사', lat: 37.44, lng: 129.165, sigungu: '삼척시', emd: '성내동', n: 7, bayes: 4.4 },
  { id: 'east:M3', name: '이사부사자공원', typeShort: '테마', lat: 37.46, lng: 129.17, sigungu: '삼척시', emd: '교동', n: 7, bayes: 4.4 },
  { id: 'east:M4', name: '삼척장미공원', typeShort: '산책', lat: 37.445, lng: 129.175, sigungu: '삼척시', emd: '정상동', n: 7, bayes: 4.4 },
  { id: 'east:M5', name: '새천년해안도로', typeShort: '자연', lat: 37.465, lng: 129.155, sigungu: '삼척시', emd: '교동', n: 7, bayes: 4.4 },
  { id: 'east:M6', name: '삼척항', typeShort: '상업', lat: 37.435, lng: 129.185, sigungu: '삼척시', emd: '정하동', n: 7, bayes: 4.4 },
];
// 여행 하루의 방문 [장소 id, 유형, 도착 시각].
type Stop = [string, string, number];
interface TripSeed {
  id: string;
  dataset: 'east' | 'jeju';
  nights: number;
  days: Stop[][];
  // 14차 — 강릉 1박 20건은 여성·쇼핑 미션(1), 나머지 24건은 남성·역사 유적 미션(3).
  gender?: '남';
  missions?: string;
}
const OTHERS = { gender: '남', missions: '3;22' } as const;
const TRIPS: TripSeed[] = [
  // 강릉 1박 20건 — 첫날 식당 → 볼거리 → 볼거리, 떠나는 날 볼거리 → 식당.
  ...Array.from({ length: 20 }, (_, i): TripSeed => ({
    id: `east:GA${i}`,
    dataset: 'east',
    nights: 1,
    missions: '1;22',
    days: [
      [['east:G4', '식당', 12], ['east:G1', '자연', 14], ['east:G3', '상업', 17]],
      [['east:G5', '자연', 10], ['east:G6', '식당', 12]],
    ],
  })),
  // 속초 당일 10건.
  ...Array.from({ length: 10 }, (_, i): TripSeed => ({ id: `east:SA${i}`, dataset: 'east', nights: 0, ...OTHERS, days: [[['east:S4', '식당', 12], ['east:S1', '자연', 14], ['east:S2', '상업', 16], ['east:S3', '역사', 17]]] })),
  // 춘천 당일 6건 — 볼거리만.
  ...Array.from({ length: 6 }, (_, i): TripSeed => ({ id: `east:CA${i}`, dataset: 'east', nights: 0, ...OTHERS, days: [[['east:C1', '자연', 10], ['east:C2', '자연', 14], ['east:C3', '산책', 16]]] })),
  // 제주·도서 세트의 강원 여행 8건 — 강문해변만.
  ...Array.from({ length: 8 }, (_, i): TripSeed => ({ id: `JA${i}`, dataset: 'jeju', nights: 0, ...OTHERS, days: [[['J-G1', '자연', 15]]] })),
];

describe('tour plan — 제주 밖 지역의 일정표(격리 DB)', () => {
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
    const placeName = new Map(PLACES.map((x) => [x.id, x.name]));

    await p.tourTrip.createMany({
      data: TRIPS.map((t) => ({
        id: t.id,
        dataset: t.dataset,
        travelerLabel: t.id,
        startDate: '2023-06-01',
        endDate: '2023-06-02',
        nights: t.nights,
        ...SEG,
        gender: t.gender ?? SEG.gender,
        missionCodes: t.missions ?? null,
        nVisits: 5,
        nPublic: 5,
        nJeju: 0,
        nIsland: 0,
        nPhotos: 0,
        nActivities: 0,
        hasGps: false,
        visitSidos: ',강원,',
      })),
    });
    await p.tourPlace.createMany({
      data: PLACES.map((x) => ({
        id: x.id,
        dataset: x.dataset ?? 'east',
        name: x.name,
        typeCd: '0',
        typeShort: x.typeShort,
        lat: x.lat,
        lng: x.lng,
        sido: '강원',
        sigungu: x.sigungu,
        emd: x.emd,
        isJeju: false,
        isIsland: x.island ?? false,
        nVisits: x.n,
        nTravelers: x.n,
        nRated: x.n,
        meanDgstfn: x.bayes,
        bayesScore: x.bayes,
        stayMedian: 60,
        spendPpMedian: null,
        spendN: 0,
        nPhotos: 0,
        nActivities: 0,
        nLodging: 0,
      })),
    });
    await p.tourVisit.createMany({
      data: TRIPS.flatMap((t) => {
        let order = 0;
        return t.days.flatMap((stops, d) =>
          stops.map(([placeId, typeShort, hour]) => {
            order += 1;
            return {
              id: `${t.id}:${order}`,
              dataset: t.dataset,
              travelId: t.id,
              visitAreaId: String(order),
              visitOrder: order,
              dayIndex: d + 1,
              visitDate: '2023-06-01',
              typeCd: '0',
              typeShort,
              isPrivate: false,
              placeId,
              name: placeName.get(placeId)!,
              sido: '강원',
              isJeju: false,
              isIsland: false,
              arrivalHour: hour,
              nPhotos: 0,
              nActivities: 0,
              nights: t.nights,
              ...SEG,
            };
          }),
        );
      }),
    });
    await p.tourDaySequence.createMany({
      data: TRIPS.flatMap((t) =>
        t.days.map((stops, d) => ({
          id: `${t.id}:${d + 1}`,
          dataset: t.dataset,
          travelId: t.id,
          dayIndex: d + 1,
          nStops: stops.length,
          typeSeq: stops.map(([, type]) => type).join('>'),
          isJejuDay: false,
          isLastDay: d === t.days.length - 1,
          sidos: ',강원,',
          nights: t.nights,
          ...SEG,
        })),
      ),
    });
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  const stopNames = (r: TourPlanResultType): string[] => r.itinerary?.days.flatMap((d) => d.stops.map((s) => s.name)) ?? [];
  const sigungus = (r: TourPlanResultType): string[] => [...new Set(r.itinerary?.days.flatMap((d) => d.stops.map((s) => s.sigungu ?? '')) ?? [])];
  const weatherName = (r: TourPlanResultType): string | undefined => weatherPlaceById(r.itinerary?.weatherPlaceId)?.name;

  it('같은 곳 합치기 — 세트가 달라 따로 잡힌 강문해변은 한 줄(여행 수는 합, 만족도는 여행 수 가중)', async () => {
    const r = await service.plan({ region: 'gangwon' });
    expect(r.regionTrips).toBe(44);
    const beaches = r.places.filter((x) => x.name === '강문해변');
    expect(beaches).toHaveLength(1);
    // (30 × 4.5 + 8 × 4.3) ÷ 38 = 4.46
    expect(beaches[0]).toMatchObject({ n: 38, mean: 4.46 });
    // 이름이 비슷할 뿐인 곳은 합치지 않는다(따로 간 사람이 있다).
    expect(r.places.find((x) => x.name === '강문해변 솟대다리')).toMatchObject({ n: 6 });
  });

  it('1박 2일 — 이틀 다 거점 동네(강릉)에서 보낸다. 점수가 높아도 52km 떨어진 속초·내륙의 춘천으로 튀지 않는다', async () => {
    const r = await service.plan({ region: 'gangwon', ...SEG, nights: 1 });
    // 1박 여행 20건이 비슷한 여행 — 뼈대(첫날 식당 → 볼거리 → 볼거리, 떠나는 날 볼거리 → 식당)가 여기서 나온다.
    expect(r).toMatchObject({ regionTrips: 44, matchedTrips: 20, relaxed: [], insufficient: false });
    const it = r.itinerary!;
    expect(it.days).toHaveLength(2);
    expect(sigungus(r)).toEqual(['강릉시']);
    // 거점 = 그날 도는 동네의 라벨, 예보 지점 = 거점에서 가장 가까운 시·군(강릉). 숙소를 정하지 않았으니 숙소 이동은 없다.
    expect(it.base).toMatch(/^강릉시 /);
    expect(it.days.map((d) => d.area)).toContain(it.base);
    expect(weatherName(r)).toBe('강릉');
    expect(it).toMatchObject({ stayArea: null, unplaced: [], legBasis: 'default' });
    expect(it.days.every((d) => d.fromStayMin === null && d.toStayMin === null)).toBe(true);
    // 숙소 동네 선택지 — 권역 넷(후보 3곳 이상), 방문 많은 순.
    expect(r.areas.map((a) => a.label.split(' ')[0])).toEqual(['강릉시', '속초시', '삼척시', '춘천시']);
  });

  it('일정에 넣지 않는 이름(마트·아파트)은 목록에만 남고, 사실상 같은 곳(강문해변·강문해변 솟대다리)은 한 일정에 하나만', async () => {
    const r = await service.plan({ region: 'gangwon', ...SEG, nights: 1 });
    // 보정 만족도가 가장 높은 두 곳이지만 일정에도 대안에도 없다.
    expect(r.places.map((x) => x.name)).toEqual(expect.arrayContaining(['이마트 강릉점', '강릉푸른아파트']));
    const shown = r.itinerary!.days.flatMap((d) => d.stops.flatMap((s) => [s.name, ...s.alternatives.map((a) => a.name)]));
    expect(shown).not.toContain('이마트 강릉점');
    expect(shown).not.toContain('강릉푸른아파트');
    expect(shown).toContain('강문해변');
    expect(shown).not.toContain('강문해변 솟대다리');
  });

  it('숙소 동네가 거점을 옮긴다 — 속초를 고르면 속초에서 짜고 예보 지점도 속초', async () => {
    const base = await service.plan({ region: 'gangwon', nights: 0 });
    const sokcho = base.areas.find((a) => a.label.startsWith('속초시'))!.label;
    const r = await service.plan({ region: 'gangwon', nights: 0, stayArea: sokcho });
    expect(r.itinerary!.days).toHaveLength(1);
    expect(sigungus(r)).toEqual(['속초시']);
    expect(r.itinerary).toMatchObject({ stayArea: sokcho, base: sokcho });
    expect(weatherName(r)).toBe('속초');
  });

  it('꼭 갈 곳이 거점을 옮기고, 식당 후보가 없는 동네는 식사 자리까지 볼거리로 채운다 — 섬 표시는 제주 밖에서 막지 않는다', async () => {
    const r = await service.plan({ region: 'gangwon', nights: 0, must: [{ name: '남이섬' }] });
    const it = r.itinerary!;
    expect(it.unplaced).toEqual([]);
    expect(it.days).toHaveLength(1);
    expect(sigungus(r)).toEqual(['춘천시']);
    const stops = it.days[0]!.stops;
    expect(stops.find((s) => s.name === '남이섬')).toMatchObject({ pinned: true });
    // 속초 당일 여행의 뼈대(식당 → 볼거리 → 볼거리 → 볼거리)를 따르지만 춘천에는 식당 후보가 없다.
    expect(stops.map((s) => s.name).sort()).toEqual(['남이섬', '소양강스카이워크', '의암호']);
    expect(stops.every((s) => s.kind !== '식당')).toBe(true);
    expect(it.base).toMatch(/^춘천시 /);
    expect(weatherName(r)).toBe('춘천');
  });

  it('권역(여러 시도를 묶은 지역)도 일정표가 나오고 동네 라벨에 시도가 붙는다', async () => {
    const r = await service.plan({ region: 'east', ...SEG, nights: 1 });
    expect(r.itinerary!.days).toHaveLength(2);
    expect(r.itinerary!.days.every((d) => d.area.startsWith('강원 강릉시 '))).toBe(true);
    expect(r.itinerary!.base).toMatch(/^강원 강릉시 /);
    expect(r.areas.every((a) => a.label.startsWith('강원 '))).toBe(true);
  });

  it("'전체' 는 어디로 갈지 정하지 않은 것 — 장소만 낸다", async () => {
    const r = await service.plan({ region: 'all' });
    expect(r.places.length).toBeGreaterThan(0);
    expect(r).toMatchObject({ itinerary: null, areas: [] });
  });

  // ── 14차 다양화 ─────────────────────────────────────────────────────────────
  const scoreOf = (r: TourPlanResultType, name: string): number => r.places.find((x) => x.name === name)!.score;

  it('유명도 — 점수에서 여행 수가 차지하는 몫을 줄인다(기본 √n · 골고루 n^¼ · 덜 알려진 곳도: 여행 수를 보지 않는다)', async () => {
    const famous = await service.plan({ region: 'gangwon' });
    const mixed = await service.plan({ region: 'gangwon', fame: 'mixed' });
    const hidden = await service.plan({ region: 'gangwon', fame: 'hidden' });
    // 강문해변(여행 38건 · 만족 4.46)과 안목해변(20건 · 4.6) — 기본은 방문 많은 강문해변이, 여행 수를 안 보면 만족도 높은 안목해변이 앞선다.
    expect(scoreOf(famous, '강문해변')).toBe(7.1);
    expect(scoreOf(famous, '안목해변')).toBe(5.8);
    expect(scoreOf(mixed, '강문해변')).toBe(2.9);
    expect(scoreOf(mixed, '안목해변')).toBe(2.7);
    expect(scoreOf(hidden, '강문해변')).toBe(1.2);
    expect(scoreOf(hidden, '안목해변')).toBe(1.3);
    // 여행 수를 안 보면 보정 만족도 순 — 표본 9건·10건인 곳이 맨 위로 온다.
    expect(famous.places[0]!.name).toBe('강문해변');
    expect(hidden.places.slice(0, 3).map((x) => x.name)).toEqual(['강릉푸른아파트', '이마트 강릉점', '안목해변']);
    // 기본값을 적어 보내도 같다.
    expect((await service.plan({ region: 'gangwon', fame: 'famous' })).places).toEqual(famous.places);
  });

  it('여행 목적 — 그 목적의 여행이 평균보다 더 간 곳을 세게 앞세우고(선호의 세제곱) "목적에 맞는 곳" 으로 표시한다', async () => {
    const plain = await service.plan({ region: 'gangwon', nights: 0 });
    const history = await service.plan({ region: 'gangwon', nights: 0, purposes: ['history'] });
    expect(plain.places.every((x) => !x.purposeFit)).toBe(true);
    // 역사 유적 미션(3) 여행 24건 — 속초물회(여행 10건)는 그 가운데 10건이 갔다: (10 + 3) ÷ (24 × 10 ÷ 44 + 3) = 1.54배 → 맞는 곳.
    // 강문해변(38건)은 8건뿐: (8 + 3) ÷ (24 × 38 ÷ 44 + 3) = 0.46 → 0.5 로 잘려 세제곱 0.125배.
    // 의암호(6건)도 6건 전부가 그 미션 여행이다: (6 + 3) ÷ (24 × 6 ÷ 44 + 3) = 1.43배. 소양강스카이워크(8건 중 6건)는 1.22배라 아니다.
    expect(history.places.filter((x) => x.purposeFit).map((x) => x.name).sort()).toEqual(['속초물회', '의암호']);
    expect(scoreOf(history, '속초물회') / scoreOf(plain, '속초물회')).toBeCloseTo(1.54 ** 3, 0);
    expect(scoreOf(history, '강문해변') / scoreOf(plain, '강문해변')).toBeCloseTo(0.125, 1);
    // 일정에 든 장소에도 같은 표시가 붙고, 볼거리 순서가 바뀐다 — 역사 유형(영금정)이 방문 많은 속초해수욕장보다 먼저 온다.
    const order = (r: TourPlanResultType): string[] => r.itinerary!.days[0]!.stops.map((x) => x.name);
    expect(order(plain)).toEqual(['속초물회', '속초해수욕장', '속초관광수산시장', '영금정']);
    expect(order(history)).toEqual(['속초물회', '영금정', '속초해수욕장', '속초관광수산시장']);
    expect(history.itinerary!.days[0]!.stops.map((x) => x.purposeFit)).toEqual([true, false, false, false]);
    expect(plain.itinerary!.days[0]!.stops.every((x) => !x.purposeFit)).toBe(true);
    // 표본이 20건에 못 미치는 목적(이 DB 에 등산 미션은 없다)은 아무 일도 하지 않는다.
    expect((await service.plan({ region: 'gangwon', nights: 0, purposes: ['hiking'] })).places).toEqual(plain.places);
  });

  it('풀린 조건도 버리지 않는다 — 그 조건 하나만 같은 여행의 선호를 순위에 남긴다(표시하는 비슷한 여행 수는 그대로)', async () => {
    const plain = await service.plan({ region: 'gangwon', nights: 1 });
    // 남성 · 1박은 0건 → 성별을 풀어 1박 20건. 남성 여행 24건은 강문해변을 8건만 갔다(평균대로면 20.7건) → 선호 0.5 배(하한).
    const relaxed = await service.plan({ region: 'gangwon', gender: '남', nights: 1 });
    expect(relaxed).toMatchObject({ matchedTrips: 20, relaxed: ['gender'] });
    expect(scoreOf(relaxed, '강문해변') / scoreOf(plain, '강문해변')).toBeCloseTo(0.5, 1);
    // 남성 여행이 평균보다 더 간 속초물회(10건 중 10건: 1.54배)는 그만큼 오른다.
    expect(scoreOf(relaxed, '속초물회') / scoreOf(plain, '속초물회')).toBeCloseTo(1.54, 1);
    const beach = (r: TourPlanResultType) => r.places.find((x) => x.name === '강문해변');
    expect(beach(plain)).toMatchObject({ similarN: 20, lift: 1.1 });
    expect(beach(relaxed)).toMatchObject({ similarN: 20, lift: 1.1 });
    // 풀린 조건이 없으면 달라지지 않는다.
    expect((await service.plan({ region: 'gangwon', gender: '여', nights: 1 })).relaxed).toEqual([]);
  });

  it('다른 코스 보기 — 변형 번호가 같으면 같은 코스, 0 은 번호를 안 준 것과 같고, 번호를 바꾸면 다른 코스가 나온다', async () => {
    const names = (r: TourPlanResultType): string => r.itinerary!.days.map((d) => d.stops.map((s) => s.name).join('→')).join(' / ');
    // 삼척 — 점수가 같은 볼거리 여섯 곳 중 네 곳을 고른다(당일 뼈대 식당 → 볼거리 셋, 식당 후보가 없어 볼거리로).
    const areas = (await service.plan({ region: 'gangwon', nights: 0 })).areas;
    const body = { region: 'gangwon', nights: 0, stayArea: areas.find((a) => a.label.startsWith('삼척시'))!.label } as const;
    const base = await service.plan(body);
    expect(base.itinerary!.days[0]!.stops).toHaveLength(4);
    expect(names(await service.plan({ ...body, variant: 0 }))).toBe(names(base));
    const variants = await Promise.all(Array.from({ length: 8 }, (_, i) => service.plan({ ...body, variant: i + 1 })));
    expect(new Set(variants.map(names)).size).toBeGreaterThan(2);
    expect(variants.some((r) => names(r) !== names(base))).toBe(true);
    expect(names(await service.plan({ ...body, variant: 5 }))).toBe(names(variants[4]!));
    // 어느 번호든 삼척 안에서만 고른다(거점은 그대로) · 목록(추천 장소)은 변형과 무관하다 — 일정에서 고르는 곳만 바뀐다.
    expect(variants.every((r) => r.itinerary!.days.every((d) => d.stops.every((x) => x.sigungu === '삼척시')))).toBe(true);
    expect(variants[4]!.places).toEqual(base.places);
    // 점수 차이가 뚜렷한 동네(강릉 — 장소마다 가는 시각·일차가 갈린다)는 번호를 바꿔도 같은 코스다: 잡음은 ±35% 로 묶여 있다.
    const rigid = await Promise.all([0, 1, 2, 3].map((variant) => service.plan({ region: 'gangwon', ...SEG, nights: 1, variant })));
    expect(new Set(rigid.map(names)).size).toBe(1);
  });

  it('라우트 — 식별자·좌표 키 없이 거점·예보 지점만 나간다', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/tour/public/plan', payload: { region: 'gangwon', nights: 1 } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TourPlanResultType;
    expect(scanKeys(body)).toEqual([]);
    expect(body.itinerary).toMatchObject({ base: expect.stringMatching(/^강릉시 /), weatherPlaceId: expect.any(String) });
    expect(stopNames(body).length).toBeGreaterThan(0);
  });
});
