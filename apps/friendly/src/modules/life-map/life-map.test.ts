import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  LifeMapItemType,
  LifeMapNearbyResultType,
  LifeMapPointsResultType,
  LifeMapStatusResultType,
} from '@repo/api-contract';
import { buildApp } from '../../app.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';

// 일상지도 라우트 — 격리 DB(빈 테이블)에 소수 시드를 넣고 ① 미적재 503 ② 상태 ③ 뷰포트 점/셀
// 모드 분기·필터·절단 ④ 주변 거리순 ⑤ 상세 404 ⑥ 계약 400 을 확인한다. 전국 집계(GROUP BY)는
// 실데이터가 있으면 합계가 흔들리므로 격리 DB 가 필수.

const qs = (p: Record<string, string>): string => new URLSearchParams(p).toString();
const pointsUrl = (p: Record<string, string>): string => `/api/v1/life-map/points?${qs(p)}`;
const nearbyUrl = (p: Record<string, string>): string => `/api/v1/life-map/nearby?${qs(p)}`;
const detailUrl = (layer: string, id: string): string => `/api/v1/life-map/${layer}/${encodeURIComponent(id)}`;
const STATUS_URL = '/api/v1/life-map/status';

// 서울시청 근방 3 + 부산 1.
const CCTV_SEED = [
  { id: 'LMT-C1', purpose: '생활방범', lat: 37.5665, lng: 126.978, orgName: '서울 중구청' },
  { id: 'LMT-C2', purpose: '어린이보호', lat: 37.567, lng: 126.979, orgName: '서울 중구청' },
  { id: 'LMT-C3', purpose: '교통단속', lat: 37.57, lng: 126.985, orgName: '서울 종로구청' },
  { id: 'LMT-C4', purpose: '생활방범', lat: 35.1796, lng: 129.0756, orgName: '부산 연제구청' },
];
const TOILET_SEED = [
  { id: 'LMT-T1', name: '시청 화장실', lat: 37.5666, lng: 126.9782, open24: true, bell: true, diaper: false, disabled: false, kids: false },
  { id: 'LMT-T2', name: '광장 화장실', lat: 37.568, lng: 126.977, open24: false, bell: false, diaper: true, disabled: true, kids: false },
  { id: 'LMT-T3', name: '좌표 없는 화장실', lat: null, lng: null, open24: true, bell: false, diaper: false, disabled: false, kids: false },
  { id: 'LMT-T4', name: '부산 화장실', lat: 35.18, lng: 129.076, open24: false, bell: false, diaper: false, disabled: false, kids: true },
];
const SEOUL_BBOX = '126.970,37.560,126.990,37.575';
const KOREA_BBOX = '124,33,132,39';

describe('life-map routes (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await app.prisma.lifeCctv.createMany({
      data: CCTV_SEED.map((c) => ({
        id: c.id,
        orgCode: '3000000',
        orgName: c.orgName,
        roadAddr: '서울특별시 중구 세종대로 110',
        lotAddr: null,
        purpose: c.purpose,
        cameraCount: 2,
        pixels: 200,
        direction: '360도 전방면',
        keepDays: 30,
        installedYm: '201312',
        phone: '02-0000-0000',
        lat: c.lat,
        lng: c.lng,
        baseDate: '2026-07-30',
      })),
    });
    await app.prisma.lifeToilet.createMany({
      data: TOILET_SEED.map((t) => ({
        id: t.id,
        orgCode: '3000000',
        name: t.name,
        kind: '공중화장실',
        roadAddr: '서울특별시 중구 세종대로 110',
        lotAddr: null,
        orgName: '서울 중구청',
        phone: null,
        openType: t.open24 ? '상시' : '정시',
        openDetail: t.open24 ? null : '09:00~18:00',
        open24: t.open24,
        maleToilet: 1,
        maleUrinal: 1,
        maleDisabledToilet: t.disabled ? 1 : 0,
        femaleToilet: 2,
        femaleKidsToilet: t.kids ? 1 : 0,
        disabled: t.disabled,
        kids: t.kids,
        ownerType: '공공기관-지방자치단체',
        disposal: '수세식',
        safetyTarget: true,
        bell: t.bell,
        bellPlace: t.bell ? '여자화장실' : null,
        entranceCctv: false,
        diaper: t.diaper,
        diaperPlace: t.diaper ? '여자화장실' : null,
        installedYm: null,
        remodeledYm: null,
        baseDate: '2026-08-18',
        lat: t.lat,
        lng: t.lng,
        geoSource: t.lat === null ? null : 'road',
      })),
    });
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('미적재(적재 이력 없음) — status loaded=false, points/nearby 는 503 + 적재 명령 안내', async () => {
    const status = await app.inject({ method: 'GET', url: STATUS_URL });
    expect(status.statusCode).toBe(200);
    const body = status.json<LifeMapStatusResultType>();
    expect(body.layers.map((l) => [l.layer, l.loaded])).toEqual([
      ['cctv', false],
      ['toilet', false],
    ]);

    const points = await app.inject({ method: 'GET', url: pointsUrl({ layer: 'cctv', bbox: SEOUL_BBOX, zoom: '16' }) });
    expect(points.statusCode).toBe(503);
    expect(points.json().message).toContain('load:life-cctv');

    const nearby = await app.inject({ method: 'GET', url: nearbyUrl({ layer: 'toilet', lat: '37.5665', lng: '126.978' }) });
    expect(nearby.statusCode).toBe(503);
    expect(nearby.json().message).toContain('load:life-toilets');
  });

  it('적재 이력 기록 후 status — 건수·기준일·화장실 좌표 확보 건수', async () => {
    await app.prisma.lifeMasterSync.create({ data: { layer: 'cctv', count: 4, geocoded: null, baseDate: '2026-07-30', sourceFile: 'cctv.csv' } });
    await app.prisma.lifeMasterSync.create({ data: { layer: 'toilet', count: 4, geocoded: 3, baseDate: '2026-08-18', sourceFile: 'toilet.csv' } });
    const res = await app.inject({ method: 'GET', url: STATUS_URL });
    const body = res.json<LifeMapStatusResultType>();
    const cctv = body.layers.find((l) => l.layer === 'cctv')!;
    const toilet = body.layers.find((l) => l.layer === 'toilet')!;
    expect(cctv).toMatchObject({ loaded: true, count: 4, geocoded: null, baseDate: '2026-07-30' });
    expect(toilet).toMatchObject({ loaded: true, count: 4, geocoded: 3, baseDate: '2026-08-18' });
    expect(cctv.loadedAt).not.toBeNull();
  });

  it('points — 줌 16 좁은 bbox 는 점 모드(최소 필드), purpose 필터(쉼표 목록)', async () => {
    const res = await app.inject({ method: 'GET', url: pointsUrl({ layer: 'cctv', bbox: SEOUL_BBOX, zoom: '16.4' }) });
    expect(res.statusCode).toBe(200);
    const body = res.json<LifeMapPointsResultType>();
    expect(body.mode).toBe('points');
    expect(body.items.map((i) => i.id).sort()).toEqual(['LMT-C1', 'LMT-C2', 'LMT-C3']);
    expect(body.items[0]).toEqual(expect.objectContaining({ purpose: expect.any(String) }));
    expect(body.items[0]).not.toHaveProperty('name');
    expect(body.total).toBe(3);
    expect(body.truncated).toBe(false);
    expect(body.cells).toEqual([]);
    expect(body.minPointZoom).toBe(15);

    const filtered = await app.inject({
      method: 'GET',
      url: pointsUrl({ layer: 'cctv', bbox: SEOUL_BBOX, zoom: '16', purpose: '생활방범,교통단속,없는목적' }),
    });
    expect(filtered.json<LifeMapPointsResultType>().items.map((i) => i.id).sort()).toEqual(['LMT-C1', 'LMT-C3']);
  });

  it('points — 줌이 낮으면 셀 모드(합계 = bbox 내 건수), 줌이 높아도 bbox 가 넓으면 셀', async () => {
    const low = await app.inject({ method: 'GET', url: pointsUrl({ layer: 'cctv', bbox: KOREA_BBOX, zoom: '7' }) });
    const lowBody = low.json<LifeMapPointsResultType>();
    expect(lowBody.mode).toBe('cells');
    expect(lowBody.items).toEqual([]);
    expect(lowBody.cells.length).toBeGreaterThanOrEqual(2); // 서울 셀 + 부산 셀
    expect(lowBody.cells.reduce((a, c) => a + c.count, 0)).toBe(4);
    expect(lowBody.total).toBe(4);
    for (const c of lowBody.cells) {
      expect(c.lat).toBeGreaterThan(33);
      expect(c.lng).toBeGreaterThan(124);
    }

    const wide = await app.inject({ method: 'GET', url: pointsUrl({ layer: 'cctv', bbox: KOREA_BBOX, zoom: '16' }) });
    expect(wide.json<LifeMapPointsResultType>().mode).toBe('cells');

    // 셀 모드에도 필터가 걸린다.
    const filtered = await app.inject({ method: 'GET', url: pointsUrl({ layer: 'cctv', bbox: KOREA_BBOX, zoom: '7', purpose: '어린이보호' }) });
    expect(filtered.json<LifeMapPointsResultType>().total).toBe(1);

    // 화장실 — 좌표 없는 행은 집계에서 빠진다.
    const toilet = await app.inject({ method: 'GET', url: pointsUrl({ layer: 'toilet', bbox: KOREA_BBOX, zoom: '7' }) });
    expect(toilet.json<LifeMapPointsResultType>().total).toBe(3);
  });

  it('points — 화장실 점 모드 + 편의 필터(AND)', async () => {
    const all = await app.inject({ method: 'GET', url: pointsUrl({ layer: 'toilet', bbox: SEOUL_BBOX, zoom: '14' }) });
    const allBody = all.json<LifeMapPointsResultType>();
    expect(allBody.mode).toBe('points');
    expect(allBody.items.map((i) => i.id).sort()).toEqual(['LMT-T1', 'LMT-T2']);
    expect(allBody.items.find((i) => i.id === 'LMT-T1')).toMatchObject({ name: '시청 화장실', open24: true });
    expect(allBody.minPointZoom).toBe(13);

    const open24 = await app.inject({ method: 'GET', url: pointsUrl({ layer: 'toilet', bbox: SEOUL_BBOX, zoom: '14', open24: '1' }) });
    expect(open24.json<LifeMapPointsResultType>().items.map((i) => i.id)).toEqual(['LMT-T1']);
    const diaper = await app.inject({ method: 'GET', url: pointsUrl({ layer: 'toilet', bbox: SEOUL_BBOX, zoom: '14', diaper: 'true' }) });
    expect(diaper.json<LifeMapPointsResultType>().items.map((i) => i.id)).toEqual(['LMT-T2']);
    const none = await app.inject({ method: 'GET', url: pointsUrl({ layer: 'toilet', bbox: SEOUL_BBOX, zoom: '14', open24: '1', diaper: '1' }) });
    expect(none.json<LifeMapPointsResultType>().items).toEqual([]);
    // '0' 은 조건 없음.
    const zero = await app.inject({ method: 'GET', url: pointsUrl({ layer: 'toilet', bbox: SEOUL_BBOX, zoom: '14', open24: '0' }) });
    expect(zero.json<LifeMapPointsResultType>().items).toHaveLength(2);
  });

  it('nearby — 거리 오름차순·반경·limit·전체 건수', async () => {
    const res = await app.inject({ method: 'GET', url: nearbyUrl({ layer: 'cctv', lat: '37.5665', lng: '126.978', radius: '1000', limit: '2' }) });
    expect(res.statusCode).toBe(200);
    const body = res.json<LifeMapNearbyResultType>();
    expect(body.items.map((i) => i.id)).toEqual(['LMT-C1', 'LMT-C2']);
    expect(body.items[0]!.dist).toBe(0);
    expect(body.items[1]!.dist).toBeGreaterThan(50);
    expect(body.items[1]!.dist).toBeLessThan(200);
    expect(body.total).toBe(3); // C3(≈730m) 포함, 부산 제외
    expect(body.items[0]).toMatchObject({ layer: 'cctv', purpose: '생활방범', orgName: '서울 중구청' });

    const tight = await app.inject({ method: 'GET', url: nearbyUrl({ layer: 'cctv', lat: '37.5665', lng: '126.978', radius: '300' }) });
    expect(tight.json<LifeMapNearbyResultType>().items.map((i) => i.id)).toEqual(['LMT-C1', 'LMT-C2']);

    const toilets = await app.inject({ method: 'GET', url: nearbyUrl({ layer: 'toilet', lat: '37.5665', lng: '126.978', bell: '1' }) });
    const tb = toilets.json<LifeMapNearbyResultType>();
    expect(tb.items.map((i) => i.id)).toEqual(['LMT-T1']);
    expect(tb.items[0]).toMatchObject({ layer: 'toilet', name: '시청 화장실', fixtures: { femaleToilet: 2 }, geoSource: 'road' });
  });

  it('detail — 200 / 좌표 없는 화장실 / 404', async () => {
    const cctv = await app.inject({ method: 'GET', url: detailUrl('cctv', 'LMT-C1') });
    expect(cctv.statusCode).toBe(200);
    expect(cctv.json<LifeMapItemType>()).toMatchObject({ layer: 'cctv', id: 'LMT-C1', cameraCount: 2, keepDays: 30 });

    const toilet = await app.inject({ method: 'GET', url: detailUrl('toilet', 'LMT-T3') });
    expect(toilet.statusCode).toBe(200);
    expect(toilet.json<LifeMapItemType>()).toMatchObject({ layer: 'toilet', lat: null, lng: null, geoSource: null });

    const missing = await app.inject({ method: 'GET', url: detailUrl('cctv', 'NOPE') });
    expect(missing.statusCode).toBe(404);
    const badLayer = await app.inject({ method: 'GET', url: detailUrl('bus', 'LMT-C1') });
    expect(badLayer.statusCode).toBe(400);
  });

  it('계약 — bbox 형식·좌표 범위·radius 상한은 400', async () => {
    expect((await app.inject({ method: 'GET', url: pointsUrl({ layer: 'cctv', bbox: 'seoul', zoom: '10' }) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: pointsUrl({ layer: 'cctv', bbox: SEOUL_BBOX, zoom: '30' }) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: nearbyUrl({ layer: 'cctv', lat: '50', lng: '126.978' }) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: nearbyUrl({ layer: 'cctv', lat: '37.5', lng: '126.978', radius: '5000' }) })).statusCode).toBe(400);
  });
});
