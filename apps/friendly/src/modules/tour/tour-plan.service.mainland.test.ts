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

// 코스 일정표를 제주 밖으로(13차) — 격리 DB 에 강원 여행 44건과 세 동네(강릉 · 속초(강릉에서 52km) · 춘천(100km 넘게 떨어진 내륙,
// 식당 후보 없음))의 장소를 심고 ① 같은 곳 합치기(세트가 달라 따로 잡힌 강문해변) ② 일정은 거점 동네 주변에서(거점 라벨·예보 지점)
// ③ 일정에 넣지 않는 이름(마트·아파트)과 사실상 같은 곳 묶음 ④ 숙소 동네·꼭 갈 곳이 거점을 옮긴다 ⑤ 식당 없는 동네는 볼거리로
// ⑥ 권역(여러 시도)은 라벨에 시도 ⑦ '전체' 는 여전히 장소만 ⑧ 라우트.
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
];
// 여행 하루의 방문 [장소 id, 유형, 도착 시각].
type Stop = [string, string, number];
interface TripSeed {
  id: string;
  dataset: 'east' | 'jeju';
  nights: number;
  days: Stop[][];
}
const TRIPS: TripSeed[] = [
  // 강릉 1박 20건 — 첫날 식당 → 볼거리 → 볼거리, 떠나는 날 볼거리 → 식당.
  ...Array.from({ length: 20 }, (_, i): TripSeed => ({
    id: `east:GA${i}`,
    dataset: 'east',
    nights: 1,
    days: [
      [['east:G4', '식당', 12], ['east:G1', '자연', 14], ['east:G3', '상업', 17]],
      [['east:G5', '자연', 10], ['east:G6', '식당', 12]],
    ],
  })),
  // 속초 당일 10건.
  ...Array.from({ length: 10 }, (_, i): TripSeed => ({ id: `east:SA${i}`, dataset: 'east', nights: 0, days: [[['east:S4', '식당', 12], ['east:S1', '자연', 14], ['east:S2', '상업', 16], ['east:S3', '역사', 17]]] })),
  // 춘천 당일 6건 — 볼거리만.
  ...Array.from({ length: 6 }, (_, i): TripSeed => ({ id: `east:CA${i}`, dataset: 'east', nights: 0, days: [[['east:C1', '자연', 10], ['east:C2', '자연', 14], ['east:C3', '산책', 16]]] })),
  // 제주·도서 세트의 강원 여행 8건 — 강문해변만.
  ...Array.from({ length: 8 }, (_, i): TripSeed => ({ id: `JA${i}`, dataset: 'jeju', nights: 0, days: [[['J-G1', '자연', 15]]] })),
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
    // 숙소 동네 선택지 — 권역 셋(후보 3곳 이상), 방문 많은 순.
    expect(r.areas.map((a) => a.label.split(' ')[0])).toEqual(['강릉시', '속초시', '춘천시']);
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

  it('라우트 — 식별자·좌표 키 없이 거점·예보 지점만 나간다', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/tour/public/plan', payload: { region: 'gangwon', nights: 1 } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TourPlanResultType;
    expect(scanKeys(body)).toEqual([]);
    expect(body.itinerary).toMatchObject({ base: expect.stringMatching(/^강릉시 /), weatherPlaceId: expect.any(String) });
    expect(stopNames(body).length).toBeGreaterThan(0);
  });
});
