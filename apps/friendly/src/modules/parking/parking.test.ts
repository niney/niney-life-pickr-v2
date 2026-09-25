import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  EvNearbyResultType,
  EvPointsResultType,
  EvStationDetailType,
  ParkingAirportsResultType,
  ParkingLotDetailType,
  ParkingLotNearbyResultType,
  ParkingLotPointsResultType,
  ParkingStatusResultType,
  RestaurantParkingReviewsType,
} from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { applyEvStatus } from './ev-status.service.js';
import { ParkingLiveService } from './parking-live.service.js';

// 주차 라우트 — 격리 DB(빈 테이블)에 소수 시드를 넣고 ① 미적재 503 ② 상태 ③ 주차장 점/셀·필터·주변·상세(평소 혼잡도)
// ④ 충전소 점·필터·주변·상세 + 상태 반영(UPDATE … FROM) ⑤ 공항(폴링 전 빈 목록) ⑥ 맛집 리뷰 주차 집계
// ⑦ 실시간 폴러 1회(가짜 fetch) → 메모리·이력 누적(UPSERT) 을 본다.

const qs = (p: Record<string, string>): string => new URLSearchParams(p).toString();
const SEOUL_BBOX = '126.970,37.560,126.990,37.580';
const KOREA_BBOX = '124,33,132,39';

const lotRow = (p: Record<string, unknown>) => ({
  source: 'std',
  name: '주차장',
  ownership: 'public',
  lotType: 'offstreet',
  feeType: 'paid',
  totalSpaces: 100,
  wdOpen: '09:00',
  wdClose: '21:00',
  baseMin: 30,
  baseFee: 1000,
  addMin: 10,
  addFee: 500,
  lat: 37.5665,
  lng: 126.978,
  geoSource: 'source',
  baseDate: '2026-08-04',
  ...p,
});

describe('parking routes (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;

  // 격리 DB 는 dev.db(수 GB)를 통째로 복사해 비우므로 기본 훅 한도(10초)를 넘기기 쉽다.
  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
  }, 180_000);

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('미적재 — status loaded=false, 주차장·충전소 조회는 503 + 적재 명령 안내', async () => {
    const status = await app.inject({ method: 'GET', url: '/api/v1/parking/status' });
    expect(status.statusCode).toBe(200);
    const s = status.json<ParkingStatusResultType>();
    expect(s.lots.loaded).toBe(false);
    expect(s.ev.loaded).toBe(false);
    const lots = await app.inject({ method: 'GET', url: `/api/v1/parking/lots/points?${qs({ bbox: SEOUL_BBOX, zoom: '15' })}` });
    expect(lots.statusCode).toBe(503);
    expect(lots.json<{ message: string }>().message).toContain('load:parking-lots');
    const ev = await app.inject({ method: 'GET', url: `/api/v1/parking/ev/points?${qs({ bbox: SEOUL_BBOX, zoom: '16' })}` });
    expect(ev.statusCode).toBe(503);
  });

  it('주차장 — 점/셀 모드·필터·주변 거리순·상세(평소 혼잡도)·404', async () => {
    await app.prisma.parkingLot.createMany({
      data: [
        lotRow({ id: 'seoul:171721', source: 'seoul', name: '세종로 공영주차장(시)', lat: 37.5734, lng: 126.9759, liveKey: 'seoul:171721' }),
        lotRow({ id: 'std:A', name: '시청 무료주차장', feeType: 'free', baseMin: null, baseFee: null, lat: 37.5663, lng: 126.9779 }),
        lotRow({ id: 'std:B', name: '민영 빌딩 주차장', ownership: 'private', lat: 37.567, lng: 126.979 }),
        lotRow({ id: 'std:C', name: '좌표 없는 주차장', lat: null, lng: null }),
        lotRow({ id: 'std:D', name: '부산 주차장', lat: 35.18, lng: 129.076 }),
      ],
    });
    await app.prisma.parkingSync.create({ data: { kind: 'lots', count: 5, geocoded: 4, detail: JSON.stringify({ std: 4, seoul: 1, kotsa: 0 }), baseDate: '2026-08-04' } });

    const status = (await app.inject({ method: 'GET', url: '/api/v1/parking/status' })).json<ParkingStatusResultType>();
    expect(status.lots).toMatchObject({ loaded: true, count: 5, geocoded: 4, bySource: { std: 4, seoul: 1, kotsa: 0 } });

    const pts = (await app.inject({ method: 'GET', url: `/api/v1/parking/lots/points?${qs({ bbox: SEOUL_BBOX, zoom: '15' })}` })).json<ParkingLotPointsResultType>();
    expect(pts.mode).toBe('points');
    expect(pts.items.map((i) => i.id).sort()).toEqual(['seoul:171721', 'std:A', 'std:B']);
    expect(pts.items.find((i) => i.id === 'std:A')).toMatchObject({ feeType: 'free', level: null, available: null });

    const free = (await app.inject({ method: 'GET', url: `/api/v1/parking/lots/points?${qs({ bbox: SEOUL_BBOX, zoom: '15', freeOnly: '1' })}` })).json<ParkingLotPointsResultType>();
    expect(free.items.map((i) => i.id)).toEqual(['std:A']);
    const pub = (await app.inject({ method: 'GET', url: `/api/v1/parking/lots/points?${qs({ bbox: SEOUL_BBOX, zoom: '15', publicOnly: '1' })}` })).json<ParkingLotPointsResultType>();
    expect(pub.items.map((i) => i.id).sort()).toEqual(['seoul:171721', 'std:A']);
    // 실시간 연계만 — 폴링 전이라 비어 있다.
    const live = (await app.inject({ method: 'GET', url: `/api/v1/parking/lots/points?${qs({ bbox: SEOUL_BBOX, zoom: '15', liveOnly: '1' })}` })).json<ParkingLotPointsResultType>();
    expect(live.items).toEqual([]);

    const cells = (await app.inject({ method: 'GET', url: `/api/v1/parking/lots/points?${qs({ bbox: KOREA_BBOX, zoom: '7' })}` })).json<ParkingLotPointsResultType>();
    expect(cells.mode).toBe('cells');
    expect(cells.total).toBe(4);

    const near = (await app.inject({ method: 'GET', url: `/api/v1/parking/lots/nearby?${qs({ lat: '37.5665', lng: '126.978', radius: '500' })}` })).json<ParkingLotNearbyResultType>();
    expect(near.items.map((i) => i.id)).toEqual(['std:A', 'std:B']);
    expect(near.items[0]!.dist).toBeLessThan(30);
    expect(near.items[0]!.hours.wd).toEqual({ open: '09:00', close: '21:00' });

    // 평소 혼잡도 — 오늘 요일 칸 하나만 표본 충분.
    const dow = new Date(Date.now() + 9 * 3_600_000).getUTCDay();
    await app.prisma.parkingOccupancyStat.createMany({
      data: [
        { key: 'seoul:171721', dow, hour: 12, samples: 30, occSum: 27, fullCount: 3 },
        { key: 'seoul:171721', dow, hour: 13, samples: 5, occSum: 4, fullCount: 0 },
      ],
    });
    const detail = (await app.inject({ method: 'GET', url: '/api/v1/parking/lots/seoul%3A171721' })).json<ParkingLotDetailType>();
    expect(detail).toMatchObject({ id: 'seoul:171721', source: 'seoul', live: null });
    expect(detail.pattern?.dow).toBe(dow);
    expect(detail.pattern?.hours[12]).toMatchObject({ occ: 0.9, fullRatio: 0.1, samples: 30 });
    expect(detail.pattern?.hours[13]).toMatchObject({ occ: null, samples: 5 });
    const plain = (await app.inject({ method: 'GET', url: '/api/v1/parking/lots/std%3AA' })).json<ParkingLotDetailType>();
    expect(plain.pattern).toBeNull();
    expect((await app.inject({ method: 'GET', url: '/api/v1/parking/lots/std%3AZZZ' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/v1/parking/lots/points?${qs({ bbox: 'x', zoom: '15' })}` })).statusCode).toBe(400);
  });

  it('충전소 — 점·필터·주변·상세, 상태 반영은 충전기와 충전소 칸을 함께 고친다', async () => {
    const st = (p: Record<string, unknown>) => ({
      name: '충전소',
      lat: 37.5665,
      lng: 126.978,
      chargerCount: 2,
      fastCount: 1,
      availableCount: 1,
      chargingCount: 1,
      hasFast: true,
      parkingFree: true,
      limited: false,
      ...p,
    });
    await app.prisma.evStation.createMany({
      data: [
        st({ id: 'ME1', name: '시청 급속' }),
        st({ id: 'ME2', name: '아파트 완속', fastCount: 0, hasFast: false, availableCount: 0, chargingCount: 0, parkingFree: null, limited: true, limitDetail: '거주자외 출입제한', lat: 37.567, lng: 126.979 }),
        st({ id: 'ME3', name: '부산', lat: 35.18, lng: 129.076 }),
      ],
    });
    await app.prisma.evCharger.createMany({
      data: [
        { statId: 'ME1', chgerId: '01', type: '04', outputKw: 100, fast: true, stat: 2 },
        { statId: 'ME1', chgerId: '02', type: '02', outputKw: 7, fast: false, stat: 3, nowTsdt: '20260925150000' },
        { statId: 'ME2', chgerId: '01', type: '02', outputKw: 7, fast: false, stat: 4 },
        { statId: 'ME2', chgerId: '02', type: '02', outputKw: 7, fast: false, stat: 5 },
      ],
    });
    await app.prisma.parkingSync.create({ data: { kind: 'ev', count: 3, detail: '{}' } });

    const pts = (await app.inject({ method: 'GET', url: `/api/v1/parking/ev/points?${qs({ bbox: SEOUL_BBOX, zoom: '16' })}` })).json<EvPointsResultType>();
    expect(pts.mode).toBe('points');
    expect(pts.items.map((i) => [i.id, i.level, i.fast])).toEqual(
      expect.arrayContaining([
        ['ME1', 'available', true],
        ['ME2', 'offline', false],
      ]),
    );
    const open = (await app.inject({ method: 'GET', url: `/api/v1/parking/ev/points?${qs({ bbox: SEOUL_BBOX, zoom: '16', openOnly: '1', fastOnly: '1' })}` })).json<EvPointsResultType>();
    expect(open.items.map((i) => i.id)).toEqual(['ME1']);
    const cells = (await app.inject({ method: 'GET', url: `/api/v1/parking/ev/points?${qs({ bbox: KOREA_BBOX, zoom: '7', availableOnly: '1' })}` })).json<EvPointsResultType>();
    expect(cells.mode).toBe('cells');
    expect(cells.total).toBe(2);

    const near = (await app.inject({ method: 'GET', url: `/api/v1/parking/ev/nearby?${qs({ lat: '37.5665', lng: '126.978', radius: '500' })}` })).json<EvNearbyResultType>();
    expect(near.items.map((i) => i.id)).toEqual(['ME1', 'ME2']);
    expect(near.items[1]).toMatchObject({ limited: true, limitDetail: '거주자외 출입제한', level: 'offline' });

    const detail = (await app.inject({ method: 'GET', url: '/api/v1/parking/ev/ME1' })).json<EvStationDetailType>();
    expect(detail.chargers.map((c) => [c.id, c.stat, c.fast])).toEqual([
      ['01', 2, true],
      ['02', 3, false],
    ]);
    expect(detail.chargers[1]!.chargingSince).toBe('2026-09-25T06:00:00.000Z');
    expect((await app.inject({ method: 'GET', url: '/api/v1/parking/ev/NOPE' })).statusCode).toBe(404);

    // 상태 반영 — ME2 의 충전기 하나가 사용 가능으로, ME1 의 충전 중이 사용 가능으로.
    const at = new Date('2026-09-25T07:00:00.000Z');
    const changed = await applyEvStatus(
      app.prisma,
      [
        { statId: 'ME2', chgerId: '01', stat: 2, statUpdDt: '20260925155900', lastTedt: null, nowTsdt: null },
        { statId: 'ME1', chgerId: '02', stat: 2, statUpdDt: '20260925155900', lastTedt: '20260925155800', nowTsdt: null },
        { statId: 'NOPE', chgerId: '01', stat: 2, statUpdDt: null, lastTedt: null, nowTsdt: null },
      ],
      at,
    );
    expect(changed).toBe(3);
    const me2 = await app.prisma.evStation.findUniqueOrThrow({ where: { id: 'ME2' } });
    expect(me2).toMatchObject({ availableCount: 1, chargingCount: 0 });
    expect(me2.statusAt?.toISOString()).toBe(at.toISOString());
    const me1c = await app.prisma.evCharger.findUniqueOrThrow({ where: { statId_chgerId: { statId: 'ME1', chgerId: '02' } } });
    expect(me1c).toMatchObject({ stat: 2, lastTedt: '20260925155800', nowTsdt: null });
    expect((await app.prisma.evStation.findUniqueOrThrow({ where: { id: 'ME1' } })).availableCount).toBe(2);
  });

  it('공항 — 폴링 전이면 14곳 빈 목록·fetchedAt null', async () => {
    const res = (await app.inject({ method: 'GET', url: '/api/v1/parking/airports' })).json<ParkingAirportsResultType>();
    expect(res.airports).toHaveLength(14);
    expect(res.fetchedAt).toBeNull();
    expect(res.airports.every((a) => a.lots.length === 0 && a.level === null)).toBe(true);
  });

  it('맛집 리뷰 주차 — 공개 멤버 리뷰의 주차 관점 극성·주차 팁, 없는 식당 404', async () => {
    const placeId = 'PARK-T-1';
    const rest = await app.prisma.restaurant.create({
      data: { source: 'naver', sourceId: placeId, placeId, name: '주차 테스트 식당', rawSourceUrl: 'https://x', snapshotJson: '{}', canonical: { create: { name: '주차 테스트 식당' } } },
    });
    const seed = [
      { aspects: { 주차: 'neg', 맛: 'pos' }, tips: ['주차 협소', '예약 필수'] },
      { aspects: { 주차: 'neg' }, tips: ['주차 협소'] },
      { aspects: { 주차: 'pos' }, tips: ['건물 주차장 2시간 무료'] },
      { aspects: { 맛: 'pos' }, tips: [] },
    ];
    for (const [i, s] of seed.entries()) {
      const review = await app.prisma.visitorReview.create({
        data: { restaurantId: rest.id, authorName: 'a', rating: 5, body: 'b', visitedAt: null, imageUrlsJson: '[]', contentHash: `park-${i}` },
      });
      await app.prisma.reviewSummary.create({
        data: { reviewId: review.id, status: 'done', aspectsJson: JSON.stringify(s.aspects), tipsJson: JSON.stringify(s.tips) },
      });
    }
    const res = await app.inject({ method: 'GET', url: `/api/v1/restaurants/public/${placeId}/parking-reviews` });
    expect(res.statusCode).toBe(200);
    const body = res.json<RestaurantParkingReviewsType>();
    expect(body.analyzed).toBe(4);
    expect(body.aspect).toEqual({ pos: 1, neg: 2, neu: 0 });
    expect(body.tips).toEqual([
      { term: '주차 협소', count: 2 },
      { term: '건물 주차장 2시간 무료', count: 1 },
    ]);
    expect((await app.inject({ method: 'GET', url: '/api/v1/restaurants/public/NOPE-PLACE/parking-reviews' })).statusCode).toBe(404);
  });

  it('실시간 폴러 — 서울·공항 값을 메모리에 두고 이력 칸에 누적(UPSERT), 4분 안 재기록은 건너뜀', async () => {
    let now = new Date('2026-09-25T07:05:00.000Z');
    const fetchImpl = async (url: string): Promise<Response> => {
      if (url.includes('openapi.seoul.go.kr')) {
        return new Response(
          JSON.stringify({
            GetParkingInfo: {
              list_total_count: 1,
              RESULT: { CODE: 'INFO-000' },
              row: [{ PKLT_CD: '171721', PRK_STTS_YN: '1', TPKCT: 100, NOW_PRK_VHCL_CNT: 95, NOW_PRK_VHCL_UPDT_TM: '2026-09-25 16:04:00', OPER_SE_NM: '시간제 주차장' }],
            },
          }),
        );
      }
      if (url.includes('parking-congestion')) {
        return new Response(
          JSON.stringify({
            response: {
              header: { resultCode: '00' },
              body: { items: { item: [{ airportKor: '김포국제공항', parkingAirportCodeName: '국내선 제1주차장', parkingOccupiedSpace: 2279, parkingTotalSpace: 2279, sysGetdate: '2026-09-25', sysGettime: '16:03:03' }] }, totalCount: 1 },
            },
          }),
        );
      }
      return new Response(JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: [{ floor: 'T1 장기 P1 주차장', parking: '2847', parkingarea: '2769', datetm: '20260925160347.000' }], totalCount: 1 } } }));
    };
    const live = new ParkingLiveService({ prisma: app.prisma, log: app.log, cron: '', seoulKey: 'k', dataGoKrKey: 'k', fetchImpl, now: () => now });
    await live.pollOnce();
    // 같은 시각에 다시(재기동 직후 폴링 흉내) — 이력은 늘지 않는다. 5분 뒤 폴링은 쌓인다.
    await live.pollOnce();
    now = new Date('2026-09-25T07:10:00.000Z');
    await live.pollOnce();
    expect(live.getLot('seoul:171721')).toMatchObject({ available: 5, level: 'busy' });
    expect(live.airportSnapshot().lots.map((l) => `${l.airportCode}:${l.name}:${l.level}`)).toEqual(['ICN:T1 장기 P1 주차장:full', 'GMP:국내선 제1주차장:full']);
    const stats = await app.prisma.parkingOccupancyStat.findMany({ where: { dow: 5, hour: 16 }, orderBy: { key: 'asc' } });
    expect(stats.map((s) => [s.key, s.samples, Number(s.occSum.toFixed(2)), s.fullCount])).toEqual([
      ['airport:GMP:국내선 제1주차장', 2, 2, 2],
      ['airport:ICN:T1 장기 P1 주차장', 2, 2.06, 2],
      ['seoul:171721', 2, 1.9, 0],
    ]);
  });
});
