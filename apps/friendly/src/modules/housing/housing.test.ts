import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  HousingComplexDetailType,
  HousingNearbyResultType,
  HousingPointsResultType,
  HousingSearchResultType,
  HousingStatusResultType,
  HousingTradesResultType,
} from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { rebuildHousingStats } from './housing-derived.service.js';

// 집값 라우트 — 격리 DB(빈 테이블)에 단지 4·거래 9 를 시드하고 ① 미적재 503 ② 상태 ③ 뷰포트 점(배지값·
// 거래 없는 단지·구간/유형 축)·셀 ④ 주변 거리순 ⑤ 단지명 검색 ⑥ 상세(altNames·구간 순서) ⑦ 거래 목록
// (구간·offset·해제 포함) ⑧ 404·계약 400 을 확인한다. 전국 집계(GROUP BY)는 실데이터가 있으면 합계가
// 흔들리므로 격리 DB 가 필수.

const qs = (p: Record<string, string>): string => new URLSearchParams(p).toString();
const pointsUrl = (p: Record<string, string>): string => `/api/v1/housing/points?${qs(p)}`;
const nearbyUrl = (p: Record<string, string>): string => `/api/v1/housing/nearby?${qs(p)}`;
const searchUrl = (p: Record<string, string>): string => `/api/v1/housing/search?${qs(p)}`;
const complexUrl = (id: string): string => `/api/v1/housing/complexes/${encodeURIComponent(id)}`;
const tradesUrl = (id: string, p: Record<string, string> = {}): string => `${complexUrl(id)}/trades?${qs(p)}`;
const STATUS_URL = '/api/v1/housing/status';

const SEOUL_BBOX = '126.970,37.560,126.990,37.575';
const KOREA_BBOX = '124,33,132,39';
const TODAY = '2026-08-30';

const COMPLEX_BASE = { source: 'reb', kind: 'apt', sido: '서울특별시', sgg: '중구', sggCd: '11140', umd: '태평로1가', baseDate: '2025-09-18' };
const TRADE_BASE = { sggCd: '11140', dealYm: '202607', dealType: 'trade', umdNm: '태평로1가', jibun: '31', aptNm: '시청아파트', rent: 0 };

describe('housing routes (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await app.prisma.housingComplex.createMany({
      data: [
        { ...COMPLEX_BASE, id: 'H1', name: '시청아파트', altNames: '시청APT|중구시청아파트', jibun: '31', addr: '서울특별시 중구 태평로1가 31', households: 500, dongCount: 5, approvedDate: '2005-03-01', lat: 37.5666, lng: 126.9782, geoSource: 'parcel' },
        { ...COMPLEX_BASE, id: 'H2', name: '광장타워', jibun: '40', addr: '서울특별시 중구 태평로1가 40', households: 120, lat: 37.568, lng: 126.977, geoSource: 'parcel' },
        { ...COMPLEX_BASE, id: 'H3', name: '좌표없는단지', jibun: '50', addr: '서울특별시 중구 태평로1가 50', households: 80, lat: null, lng: null, geoSource: null },
        { ...COMPLEX_BASE, id: 'H4', name: '부산아파트', sido: '부산광역시', sgg: '연제구', sggCd: '26470', umd: '연산동', jibun: '1', addr: '부산광역시 연제구 연산동 1', households: 300, lat: 35.18, lng: 129.076, geoSource: 'parcel' },
      ],
    });
    await app.prisma.housingTrade.createMany({
      data: [
        { ...TRADE_BASE, id: 'T1', complexId: 'H1', area: 84.97, floor: 10, price: 150000, dealDate: '2026-07-01' },
        { ...TRADE_BASE, id: 'T2', complexId: 'H1', dealYm: '202605', area: 59.9, floor: 3, price: 100000, dealDate: '2026-05-01' },
        { ...TRADE_BASE, id: 'T3', complexId: 'H1', dealYm: '202501', area: 84.97, floor: 7, price: 120000, dealDate: '2025-01-15' },
        { ...TRADE_BASE, id: 'T4', complexId: 'H1', dealYm: '202606', dealType: 'jeonse', area: 84.97, floor: 12, price: 70000, dealDate: '2026-06-01' },
        { ...TRADE_BASE, id: 'T5', complexId: 'H1', dealYm: '202606', dealType: 'monthly', area: 59.9, floor: 2, price: 10000, rent: 120, dealDate: '2026-06-10' },
        { ...TRADE_BASE, id: 'T6', complexId: 'H1', dealYm: '202608', area: 84.97, floor: 15, price: 999999, dealDate: '2026-08-01', canceled: true, canceledDate: '2026-08-10' },
        { ...TRADE_BASE, id: 'T7', complexId: 'H2', dealYm: '202603', jibun: '40', aptNm: '광장타워', area: 114.5, floor: 20, price: 200000, dealDate: '2026-03-03' },
        { ...TRADE_BASE, id: 'T8', complexId: 'H4', sggCd: '26470', dealYm: '202602', umdNm: '연산동', jibun: '1', aptNm: '부산아파트', area: 84, floor: 5, price: 50000, dealDate: '2026-02-02' },
        { ...TRADE_BASE, id: 'T9', complexId: null, dealYm: '202607', jibun: '77', aptNm: '미연결', area: 84, floor: 1, price: 1, dealDate: '2026-07-07' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('미적재(적재 이력 없음) — status loaded=false, points/nearby/search 는 503 + 적재 명령 안내', async () => {
    const status = await app.inject({ method: 'GET', url: STATUS_URL });
    expect(status.statusCode).toBe(200);
    const body = status.json<HousingStatusResultType>();
    expect(body.complexes).toMatchObject({ loaded: false, count: 0, geocoded: 0 });
    expect(body.trades.loaded).toBe(false);
    expect(body.statsAt).toBeNull();

    const points = await app.inject({ method: 'GET', url: pointsUrl({ bbox: SEOUL_BBOX, zoom: '15' }) });
    expect(points.statusCode).toBe(503);
    expect(points.json().message).toContain('load:housing-complexes');
    expect((await app.inject({ method: 'GET', url: nearbyUrl({ lat: '37.5665', lng: '126.978' }) })).statusCode).toBe(503);
    expect((await app.inject({ method: 'GET', url: searchUrl({ q: '시청' }) })).statusCode).toBe(503);
  });

  it('적재 이력·통계 뒤 status — 단지 수·좌표·유형별 거래 범위·통계 시각·보강(공시가격·K-apt·건축물대장)', async () => {
    await app.prisma.housingSync.create({ data: { kind: 'complex', count: 4, geocoded: 3, baseDate: '2025-09-18', sourceFile: 'reb-complexes.csv' } });
    await app.prisma.housingTradeSync.createMany({
      data: [
        { sggCd: '11140', dealYm: '202607', dealType: 'trade', count: 1 },
        { sggCd: '11140', dealYm: '202605', dealType: 'trade', count: 1 },
        { sggCd: '11140', dealYm: '202501', dealType: 'trade', count: 1 },
        { sggCd: '11140', dealYm: '202606', dealType: 'jeonse', count: 1 },
        { sggCd: '11140', dealYm: '202606', dealType: 'monthly', count: 1 },
      ],
    });
    await rebuildHousingStats(app.prisma, TODAY);
    // 보강 시드 — H2 공시가격(전체·85~135㎡)·K-apt 속성, H1 건축물대장 조회 표시, H4 임대단지.
    await app.prisma.housingComplexPrice.createMany({
      data: [
        { complexId: 'H2', band: 'all', year: 2025, count: 120, median: 180000, min: 150000, max: 210000, avgArea: 114.5 },
        { complexId: 'H2', band: 'b3', year: 2025, count: 120, median: 180000, min: 150000, max: 210000, avgArea: 114.5 },
      ],
    });
    await app.prisma.housingSync.create({ data: { kind: 'prices', count: 1, baseDate: '2025-01-01', sourceFile: 'gongsi-2025.zip' } });
    await app.prisma.housingComplex.update({
      where: { id: 'H2' },
      data: { pnu: '1114010200100400000', kaptCode: 'A10012345', saleType: '분양', heating: '지역난방', elevatorCount: 4, roadAddr: '서울특별시 중구 세종대로 40', parkingCount: 150, floorsMax: 25, structure: '철근콘크리트구조' },
    });
    await app.prisma.housingSync.create({ data: { kind: 'kapt', count: 1 } });
    await app.prisma.housingComplex.update({ where: { id: 'H1' }, data: { pnu: '1114010200100310000', buildingFetchedAt: new Date('2026-08-30T00:00:00Z') } });
    await app.prisma.housingComplex.update({ where: { id: 'H4' }, data: { saleType: '임대' } });

    const res = await app.inject({ method: 'GET', url: STATUS_URL });
    const body = res.json<HousingStatusResultType>();
    expect(body.complexes).toMatchObject({ loaded: true, count: 4, geocoded: 3, baseDate: '2025-09-18' });
    expect(body.trades).toMatchObject({ loaded: true, count: 3, fromYm: '202501', toYm: '202607' });
    expect(body.rents).toMatchObject({ loaded: true, count: 2, fromYm: '202606', toYm: '202606' });
    expect(body.statsAt).not.toBeNull();
    expect(body.officialPrices).toMatchObject({ loaded: true, year: 2025, complexes: 1 });
    expect(body.officialPrices.loadedAt).not.toBeNull();
    expect(body.kapt).toMatchObject({ loaded: true, matched: 1 });
    // 건축물대장 — 조회한 단지 1(H1) / PNU 보유 2(H1·H2), 실행 이력은 없음.
    expect(body.buildings).toEqual({ fetched: 1, total: 2, loadedAt: null });
  });

  it('points — 줌 15 좁은 bbox 는 점 모드: 축의 최근 거래가 배지값, 거래 없는 단지는 latest null, 좌표 없는 단지 제외', async () => {
    const res = await app.inject({ method: 'GET', url: pointsUrl({ bbox: SEOUL_BBOX, zoom: '15.6' }) });
    expect(res.statusCode).toBe(200);
    const body = res.json<HousingPointsResultType>();
    expect(body.mode).toBe('points');
    expect(body.dealType).toBe('trade');
    expect(body.band).toBe('all');
    expect(body.items.map((i) => i.id).sort()).toEqual(['H1', 'H2']);
    const h1 = body.items.find((i) => i.id === 'H1')!;
    expect(h1).toMatchObject({ name: '시청아파트', households: 500, latest: { price: 150000, rent: 0, area: 84.97, floor: 10, dealDate: '2026-07-01' } });
    expect(body.items.find((i) => i.id === 'H2')!.latest).toMatchObject({ price: 200000, area: 114.5 });
    expect(body.total).toBe(2);
    expect(body.truncated).toBe(false);
    expect(body.minPointZoom).toBe(13);

    // 60㎡ 이하 — H1 은 59.9 거래, H2 는 없음(회색 점).
    const b1 = (await app.inject({ method: 'GET', url: pointsUrl({ bbox: SEOUL_BBOX, zoom: '15', band: 'b1' }) })).json<HousingPointsResultType>();
    expect(b1.items.find((i) => i.id === 'H1')!.latest).toMatchObject({ price: 100000, area: 59.9 });
    expect(b1.items.find((i) => i.id === 'H2')!.latest).toBeNull();
    // 전세·월세 축.
    const jeonse = (await app.inject({ method: 'GET', url: pointsUrl({ bbox: SEOUL_BBOX, zoom: '15', dealType: 'jeonse' }) })).json<HousingPointsResultType>();
    expect(jeonse.items.find((i) => i.id === 'H1')!.latest).toMatchObject({ price: 70000, rent: 0 });
    expect(jeonse.items.find((i) => i.id === 'H2')!.latest).toBeNull();
    const monthly = (await app.inject({ method: 'GET', url: pointsUrl({ bbox: SEOUL_BBOX, zoom: '15', dealType: 'monthly' }) })).json<HousingPointsResultType>();
    expect(monthly.items.find((i) => i.id === 'H1')!.latest).toMatchObject({ price: 10000, rent: 120, area: 59.9 });
  });

  it('points — 줌이 낮으면 셀 모드: 단지 수·거래 있는 단지 수·평균 단위가, 축이 셀 값에 반영', async () => {
    const res = await app.inject({ method: 'GET', url: pointsUrl({ bbox: KOREA_BBOX, zoom: '7' }) });
    const body = res.json<HousingPointsResultType>();
    expect(body.mode).toBe('cells');
    expect(body.items).toEqual([]);
    expect(body.cells.length).toBeGreaterThanOrEqual(2); // 서울 + 부산
    expect(body.cells.reduce((a, c) => a + c.count, 0)).toBe(3); // 좌표 있는 단지만
    expect(body.cells.reduce((a, c) => a + c.traded, 0)).toBe(3);
    expect(body.total).toBe(3);
    for (const c of body.cells) {
      expect(c.lat).toBeGreaterThan(33);
      expect(c.lng).toBeGreaterThan(124);
      expect(c.unitPrice).not.toBeNull();
    }
    // 줌이 높아도 bbox 가 넓으면 셀.
    expect((await app.inject({ method: 'GET', url: pointsUrl({ bbox: KOREA_BBOX, zoom: '16' }) })).json<HousingPointsResultType>().mode).toBe('cells');
    // 60㎡ 이하 축 — 거래 있는 단지는 H1 뿐, 단지 수는 그대로.
    const b1 = (await app.inject({ method: 'GET', url: pointsUrl({ bbox: KOREA_BBOX, zoom: '7', band: 'b1' }) })).json<HousingPointsResultType>();
    expect(b1.cells.reduce((a, c) => a + c.count, 0)).toBe(3);
    expect(b1.cells.reduce((a, c) => a + c.traded, 0)).toBe(1);
    expect(b1.cells.some((c) => c.unitPrice === null)).toBe(true);
  });

  it('points·nearby — 축에 거래 없으면 fallback(다른 유형·전체 면적의 마지막 거래), official(공시가격 중위)·saleType 은 항상', async () => {
    // 매매·60㎡ 이하: H2 는 114.5㎡ 매매뿐 → latest null, fallback = 그 매매(dealType 'trade'). H1 은 축 거래 있음 → fallback null.
    const b1 = (await app.inject({ method: 'GET', url: pointsUrl({ bbox: SEOUL_BBOX, zoom: '15', band: 'b1' }) })).json<HousingPointsResultType>();
    const h2 = b1.items.find((i) => i.id === 'H2')!;
    expect(h2.latest).toBeNull();
    expect(h2.fallback).toEqual({ dealType: 'trade', price: 200000, rent: 0, area: 114.5, floor: 20, dealDate: '2026-03-03' });
    expect(h2.official).toEqual({ year: 2025, median: 180000, count: 120 });
    expect(h2.saleType).toBe('분양');
    const h1 = b1.items.find((i) => i.id === 'H1')!;
    expect(h1.latest).not.toBeNull();
    expect(h1.fallback).toBeNull();
    expect(h1.official).toBeNull();
    expect(h1.saleType).toBeNull();
    // 전세 축: H2 전세 없음 → fallback 은 여전히 최근 매매. H1 은 전세 있음.
    const jeonse = (await app.inject({ method: 'GET', url: pointsUrl({ bbox: SEOUL_BBOX, zoom: '15', dealType: 'jeonse' }) })).json<HousingPointsResultType>();
    expect(jeonse.items.find((i) => i.id === 'H2')!.fallback).toMatchObject({ dealType: 'trade', price: 200000 });
    expect(jeonse.items.find((i) => i.id === 'H1')!.fallback).toBeNull();
    // H1 의 폴백 행은 세 유형 중 최근인 매매(2026-07-01)여야 한다 — 축을 135㎡ 초과로 두면 H1 도 latest null.
    const b4 = (await app.inject({ method: 'GET', url: pointsUrl({ bbox: SEOUL_BBOX, zoom: '15', band: 'b4' }) })).json<HousingPointsResultType>();
    expect(b4.items.find((i) => i.id === 'H1')!.fallback).toMatchObject({ dealType: 'trade', price: 150000, dealDate: '2026-07-01' });
    // 부산 임대단지 — saleType 이 실린다.
    const busan = (await app.inject({ method: 'GET', url: pointsUrl({ bbox: '129.070,35.175,129.082,35.185', zoom: '15' }) })).json<HousingPointsResultType>();
    expect(busan.items.find((i) => i.id === 'H4')).toMatchObject({ saleType: '임대', latest: { price: 50000 }, fallback: null, official: null });

    // nearby 도 같은 규칙.
    const near = (await app.inject({ method: 'GET', url: nearbyUrl({ lat: '37.5665', lng: '126.978', band: 'b1' }) })).json<HousingNearbyResultType>();
    const n2 = near.items.find((i) => i.id === 'H2')!;
    expect(n2.latest).toBeNull();
    expect(n2.fallback).toMatchObject({ dealType: 'trade', price: 200000 });
    expect(n2.official).toEqual({ year: 2025, median: 180000, count: 120 });
    expect(n2.saleType).toBe('분양');
    const n1 = near.items.find((i) => i.id === 'H1')!;
    expect(n1.fallback).toBeNull();
    expect(n1.official).toBeNull();
  });

  it('nearby — 거리 오름차순·반경·limit·축별 최근 거래·12개월 건수', async () => {
    const res = await app.inject({ method: 'GET', url: nearbyUrl({ lat: '37.5665', lng: '126.978', radius: '1000' }) });
    expect(res.statusCode).toBe(200);
    const body = res.json<HousingNearbyResultType>();
    expect(body.items.map((i) => i.id)).toEqual(['H1', 'H2']);
    expect(body.items[0]!.dist).toBeLessThan(50);
    expect(body.items[1]!.dist).toBeGreaterThan(100);
    expect(body.items[0]).toMatchObject({
      name: '시청아파트',
      kind: 'apt',
      addr: '서울특별시 중구 태평로1가 31',
      households: 500,
      dongCount: 5,
      approvedDate: '2005-03-01',
      latest: { price: 150000, dealDate: '2026-07-01' },
      count12: 2, // T1·T2 — T3 는 12개월 밖, T6 은 해제
    });
    expect(body.total).toBe(2); // 좌표 없는 H3·부산 H4 제외

    const tight = await app.inject({ method: 'GET', url: nearbyUrl({ lat: '37.5665', lng: '126.978', radius: '100' }) });
    expect(tight.json<HousingNearbyResultType>().items.map((i) => i.id)).toEqual(['H1']);
    const limited = await app.inject({ method: 'GET', url: nearbyUrl({ lat: '37.5665', lng: '126.978', limit: '1' }) });
    expect(limited.json<HousingNearbyResultType>().items).toHaveLength(1);
    expect(limited.json<HousingNearbyResultType>().total).toBe(2);
    const b3 = await app.inject({ method: 'GET', url: nearbyUrl({ lat: '37.5665', lng: '126.978', band: 'b3' }) });
    const b3Body = b3.json<HousingNearbyResultType>();
    expect(b3Body.items.find((i) => i.id === 'H1')!.latest).toBeNull();
    expect(b3Body.items.find((i) => i.id === 'H2')!.latest).toMatchObject({ price: 200000 });
  });

  it('search — name·altNames 부분 일치, 세대수 큰 순, limit', async () => {
    const res = await app.inject({ method: 'GET', url: searchUrl({ q: '시청' }) });
    expect(res.statusCode).toBe(200);
    const body = res.json<HousingSearchResultType>();
    expect(body.items.map((i) => i.id)).toEqual(['H1']);
    expect(body.items[0]).toMatchObject({ name: '시청아파트', addr: '서울특별시 중구 태평로1가 31', lat: 37.5666, households: 500 });

    const apt = (await app.inject({ method: 'GET', url: searchUrl({ q: '아파트' }) })).json<HousingSearchResultType>();
    expect(apt.items.map((i) => i.id)).toEqual(['H1', 'H4']);
    const alt = (await app.inject({ method: 'GET', url: searchUrl({ q: 'APT' }) })).json<HousingSearchResultType>();
    expect(alt.items.map((i) => i.id)).toEqual(['H1']);
    const limited = (await app.inject({ method: 'GET', url: searchUrl({ q: '아파트', limit: '1' }) })).json<HousingSearchResultType>();
    expect(limited.items).toHaveLength(1);
  });

  it('complex — 속성·altNames·유형별 구간 통계(all→b4 순)·404', async () => {
    const res = await app.inject({ method: 'GET', url: complexUrl('H1') });
    expect(res.statusCode).toBe(200);
    const body = res.json<HousingComplexDetailType>();
    expect(body).toMatchObject({
      id: 'H1',
      name: '시청아파트',
      altNames: ['시청APT', '중구시청아파트'],
      kind: 'apt',
      sido: '서울특별시',
      sgg: '중구',
      umd: '태평로1가',
      households: 500,
      source: 'reb',
      baseDate: '2025-09-18',
    });
    expect(body.stats.trade.map((s) => s.band)).toEqual(['all', 'b1', 'b2']);
    expect(body.stats.trade[0]).toMatchObject({ latest: { price: 150000 }, count: 3, count12: 2 });
    expect(body.stats.trade[0]!.unitPrice12).toBeCloseTo((150000 / 84.97 + 100000 / 59.9) / 2, 3);
    expect(body.stats.trade[2]).toMatchObject({ band: 'b2', latest: { price: 150000 }, count: 2, count12: 1 });
    expect(body.stats.jeonse.map((s) => s.band)).toEqual(['all', 'b2']);
    expect(body.stats.monthly.map((s) => s.band)).toEqual(['all', 'b1']);
    expect(body.stats.monthly[0]!.latest).toMatchObject({ price: 10000, rent: 120 });
    // 보강 없음 — 공시가격 빈 배열, 속성 null(폴백 'any' 행은 유형별 표에 섞이지 않는다).
    expect(body.officialPrices).toEqual([]);
    expect(body).toMatchObject({ kaptCode: null, saleType: null, heating: null, elevatorCount: null, parkingCount: null, floorsMax: null, structure: null });

    // H2 — 공시가격(all → b3 순)·K-apt·건축물대장 속성.
    const h2 = (await app.inject({ method: 'GET', url: complexUrl('H2') })).json<HousingComplexDetailType>();
    expect(h2.officialPrices.map((p) => p.band)).toEqual(['all', 'b3']);
    expect(h2.officialPrices[0]).toEqual({ band: 'all', year: 2025, count: 120, median: 180000, min: 150000, max: 210000, avgArea: 114.5 });
    expect(h2).toMatchObject({
      pnu: '1114010200100400000',
      kaptCode: 'A10012345',
      saleType: '분양',
      heating: '지역난방',
      elevatorCount: 4,
      roadAddr: '서울특별시 중구 세종대로 40',
      parkingCount: 150,
      floorsMax: 25,
      structure: '철근콘크리트구조',
    });

    const noCoord = (await app.inject({ method: 'GET', url: complexUrl('H3') })).json<HousingComplexDetailType>();
    expect(noCoord).toMatchObject({ lat: null, lng: null, geoSource: null, altNames: [] });
    expect(noCoord.stats.trade).toEqual([]);
    expect((await app.inject({ method: 'GET', url: complexUrl('NOPE') })).statusCode).toBe(404);
  });

  it('trades — 계약일 내림차순·구간·offset·해제 포함·유형·404', async () => {
    const res = await app.inject({ method: 'GET', url: tradesUrl('H1') });
    expect(res.statusCode).toBe(200);
    const body = res.json<HousingTradesResultType>();
    expect(body.items.map((t) => t.dealDate)).toEqual(['2026-07-01', '2026-05-01', '2025-01-15']);
    expect(body.total).toBe(3);
    expect(body.items[0]).toMatchObject({ id: 'T1', dealType: 'trade', area: 84.97, floor: 10, price: 150000, rent: 0, canceled: false });

    const b2 = (await app.inject({ method: 'GET', url: tradesUrl('H1', { band: 'b2' }) })).json<HousingTradesResultType>();
    expect(b2.items.map((t) => t.id)).toEqual(['T1', 'T3']);
    const page = (await app.inject({ method: 'GET', url: tradesUrl('H1', { limit: '1', offset: '1' }) })).json<HousingTradesResultType>();
    expect(page.items.map((t) => t.id)).toEqual(['T2']);
    expect(page.total).toBe(3);
    const withCanceled = (await app.inject({ method: 'GET', url: tradesUrl('H1', { includeCanceled: '1' }) })).json<HousingTradesResultType>();
    expect(withCanceled.total).toBe(4);
    expect(withCanceled.items[0]).toMatchObject({ id: 'T6', canceled: true, canceledDate: '2026-08-10' });
    const monthly = (await app.inject({ method: 'GET', url: tradesUrl('H1', { dealType: 'monthly' }) })).json<HousingTradesResultType>();
    expect(monthly.items).toHaveLength(1);
    expect(monthly.items[0]).toMatchObject({ price: 10000, rent: 120 });
    expect((await app.inject({ method: 'GET', url: tradesUrl('NOPE') })).statusCode).toBe(404);
  });

  it('계약 — bbox 형식·유형 값·좌표 범위·radius 상한·빈 검색어는 400', async () => {
    expect((await app.inject({ method: 'GET', url: pointsUrl({ bbox: 'seoul', zoom: '10' }) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: pointsUrl({ bbox: SEOUL_BBOX, zoom: '10', dealType: 'sale' }) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: pointsUrl({ bbox: SEOUL_BBOX, zoom: '10', band: 'b9' }) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: nearbyUrl({ lat: '50', lng: '126.978' }) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: nearbyUrl({ lat: '37.5', lng: '126.978', radius: '5000' }) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: searchUrl({ q: '' }) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: tradesUrl('H1', { limit: '500' }) })).statusCode).toBe(400);
  });
});
