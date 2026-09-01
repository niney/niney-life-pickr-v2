import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// env.ts 는 모듈 로드 시점에 process.env 를 파싱한다 — buildApp import 전에
// (vi.hoisted) 키를 주입해야 라우트의 BusService 가 503 으로 죽지 않는다.
// .env 에 실제 키가 있으면 그대로 둔다 (어댑터는 어차피 mock 이라 호출 안 됨).
vi.hoisted(() => {
  process.env.DATA_GO_KR_API_KEY = process.env.DATA_GO_KR_API_KEY || 'test-bus-key';
});

// 실제 서울시 API 호출 차단 — 업스트림 함수 3개만 mock, 나머지(BusApiError,
// toLatLng 등)는 실구현 유지 (서비스가 instanceof / 좌표 정규화에 사용).
const mocks = vi.hoisted(() => ({
  getStationsByName: vi.fn(),
  getStationArrivals: vi.fn(),
  getBusPositionsByRouteSt: vi.fn(),
  getBusPositionsByRtid: vi.fn(),
  getStationsByPos: vi.fn(),
  getRoutePath: vi.fn(),
  getStationsByRoute: vi.fn(),
  getRouteInfo: vi.fn(),
}));
vi.mock('./bus-api.adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./bus-api.adapter.js')>();
  return { ...actual, ...mocks };
});

import type { BusRouteDetailResultType } from '@repo/api-contract';
import { buildApp } from '../../app.js';
import {
  BusApiError,
  type RawBusPosition,
  type RawBusStation,
  type RawRouteInfo,
  type RawRoutePathPoint,
  type RawRouteStation,
  type RawStationArrival,
} from './bus-api.adapter.js';
import {
  BUS_ROUTE_TTL_MS,
  BUS_SEARCH_TTL_MS,
  BusService,
  FORCE_MIN_INTERVAL_MS,
} from './bus.service.js';

// shared dev.db — 전용 prefix 로 시드하고 afterAll 에서 bus_* 테이블을 정리한다.
const KEYWORD_PREFIX = '버스테스트';
const ST_PREFIX = 'bustest-';
const stamp = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const kw = (): string => `${KEYWORD_PREFIX}${stamp()}`;

const rawStation = (over: Partial<RawBusStation> = {}): RawBusStation => ({
  stId: `${ST_PREFIX}${stamp()}`,
  arsId: '23290',
  stNm: '버스테스트정류장',
  // tmX/tmY 에 WGS84 — 실제 알려진 사례와 동일한 형태.
  tmX: 127.0276368,
  tmY: 37.4979462,
  gpsX: null,
  gpsY: null,
  posX: null,
  posY: null,
  ...over,
});

// 2026-07-02 probe:bus 실덤프(arsId=23278 / busRouteId=100100020) 형태 기반.
const rawArrival = (over: Partial<RawStationArrival> = {}): RawStationArrival => ({
  busRouteId: '100100020',
  rtNm: '141',
  staOrd: 65,
  vehId1: '109042241',
  arrmsg1: '곧 도착',
  vehId2: '109042059',
  arrmsg2: '8분후[2번째 전]',
  ...over,
});

const rawPosition = (over: Partial<RawBusPosition> = {}): RawBusPosition => ({
  vehId: '109042059',
  plainNo: '서울74사6477',
  sectOrd: 62,
  stopFlag: '1',
  dataTm: '20260702102707',
  // tmX/tmY 에 WGS84, posX/posY 에 GRS80 TM — 실구조 그대로.
  tmX: 127.047265,
  tmY: 37.493328,
  gpsX: null,
  gpsY: null,
  posX: 204179.2639923757,
  posY: 443770.69227223843,
  ...over,
});

// 5차(노선 보기) raw 팩토리 — 서비스 정규화 검증용 (좌표는 gpsX/gpsY WGS84).
const rawRoutePath = (over: Partial<RawRoutePathPoint> = {}): RawRoutePathPoint => ({
  no: 1,
  tmX: null,
  tmY: null,
  gpsX: 127.039507,
  gpsY: 37.686917,
  posX: null,
  posY: null,
  ...over,
});
const rawRouteStation = (over: Partial<RawRouteStation> = {}): RawRouteStation => ({
  seq: 1,
  stId: `${ST_PREFIX}${stamp()}`,
  arsId: '10153',
  stNm: '도봉산입구',
  direction: '염곡동',
  transYn: 'N',
  tmX: null,
  tmY: null,
  gpsX: 127.040722,
  gpsY: 37.687083,
  posX: null,
  posY: null,
  ...over,
});
const rawRouteInfo = (over: Partial<RawRouteInfo> = {}): RawRouteInfo => ({
  busRouteId: '100100020',
  busRouteNm: '141',
  busRouteAbrv: '141',
  length: '54.1',
  routeType: '3',
  stStationNm: '도봉산',
  edStationNm: '염곡동',
  term: '11',
  firstBusTm: '20260704040000',
  lastBusTm: '20260704224000',
  corpNm: '아진교통  02-955-2321',
  ...over,
});

const searchUrl = (q: string, force?: boolean): string =>
  `/api/v1/bus/stations/search?q=${encodeURIComponent(q)}${force ? '&force=true' : ''}`;
const nearbyUrl = (lat: number, lng: number, radius?: number): string =>
  `/api/v1/bus/stations/nearby?lat=${lat}&lng=${lng}${radius !== undefined ? `&radius=${radius}` : ''}`;
const arrivalsUrl = (arsId: string): string => `/api/v1/bus/stations/${arsId}/arrivals`;
const positionsUrl = (busRouteId: string, startOrd: number, endOrd: number): string =>
  `/api/v1/bus/routes/${busRouteId}/positions?startOrd=${startOrd}&endOrd=${endOrd}`;
const routeDetailUrl = (busRouteId: string): string =>
  `/api/v1/bus/routes/${busRouteId}/detail`;

// app 은 파일 단위 공유 — 검색/도착/위치 describe 모두 같은 인스턴스를 쓴다.
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
});

afterAll(async () => {
  // 검색 행 삭제가 hits 를 cascade 정리, 정류소는 prefix 로 별도 정리.
  await app.prisma.busStationSearch.deleteMany({
    where: { keyword: { startsWith: KEYWORD_PREFIX } },
  });
  await app.prisma.busStation.deleteMany({
    where: { stId: { startsWith: ST_PREFIX } },
  });
  await app.close();
});

beforeEach(() => {
  mocks.getStationsByName.mockReset();
  mocks.getStationArrivals.mockReset();
  mocks.getBusPositionsByRouteSt.mockReset();
  mocks.getBusPositionsByRtid.mockReset();
  mocks.getStationsByPos.mockReset();
  mocks.getRoutePath.mockReset();
  mocks.getStationsByRoute.mockReset();
  mocks.getRouteInfo.mockReset();
});

describe('GET /api/v1/bus/stations/search', () => {
  it('q 1자 → 400 (zod 길이 검증)', async () => {
    const res = await app.inject({ url: searchUrl('가') });
    expect(res.statusCode).toBe(400);
    expect(mocks.getStationsByName).not.toHaveBeenCalled();
  });

  it('NFD 1글자(U+1100 U+1161) → 400 — 스키마가 NFC 정규화 후 길이 검증', async () => {
    // NFD '가' 는 코드유닛 2개라 정규화 전 min(2) 를 우회했었다.
    const res = await app.inject({ url: searchUrl('\u1100\u1161') });
    expect(res.statusCode).toBe(400);
    expect(mocks.getStationsByName).not.toHaveBeenCalled();
  });

  it('첫 호출 → source api + BusStation/BusStationSearch 행 생성', async () => {
    const keyword = kw();
    const st = rawStation();
    mocks.getStationsByName.mockResolvedValueOnce([st]);

    const res = await app.inject({ url: searchUrl(keyword) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: { stId: string; arsId: string; name: string; lat: number; lng: number }[];
      total: number;
      fetchedAt: string;
      source: string;
    };
    expect(body.source).toBe('api');
    expect(body.total).toBe(1);
    expect(body.items[0]).toEqual({
      stId: st.stId,
      arsId: st.arsId,
      name: st.stNm,
      lat: st.tmY,
      lng: st.tmX,
    });
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false);

    const dbStation = await app.prisma.busStation.findUnique({ where: { stId: st.stId } });
    expect(dbStation?.name).toBe(st.stNm);
    const dbSearch = await app.prisma.busStationSearch.findUnique({
      where: { keyword },
      include: { hits: true },
    });
    expect(dbSearch?.hits).toHaveLength(1);
    expect(dbSearch?.hits[0]?.stId).toBe(st.stId);
  });

  it('재호출 → source cache, 어댑터 미호출', async () => {
    const keyword = kw();
    mocks.getStationsByName.mockResolvedValueOnce([rawStation()]);
    await app.inject({ url: searchUrl(keyword) });
    expect(mocks.getStationsByName).toHaveBeenCalledTimes(1);

    const res = await app.inject({ url: searchUrl(keyword) });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { source: string }).source).toBe('cache');
    expect(mocks.getStationsByName).toHaveBeenCalledTimes(1);
  });

  it('force 라도 60초 내 재요청은 cache (한도 남용 가드)', async () => {
    const keyword = kw();
    mocks.getStationsByName.mockResolvedValueOnce([rawStation()]);
    await app.inject({ url: searchUrl(keyword) });

    const res = await app.inject({ url: searchUrl(keyword, true) });
    expect((res.json() as { source: string }).source).toBe('cache');
    expect(mocks.getStationsByName).toHaveBeenCalledTimes(1);
  });

  it('force + 60초 경과 → 재수집 (source api, 어댑터 재호출)', async () => {
    const keyword = kw();
    mocks.getStationsByName.mockResolvedValueOnce([rawStation()]);
    await app.inject({ url: searchUrl(keyword) });

    // 60초 경과를 DB fetchedAt 으로 시뮬레이션 — 라우트 서비스는 실시간 now.
    await app.prisma.busStationSearch.update({
      where: { keyword },
      data: { fetchedAt: new Date(Date.now() - 2 * FORCE_MIN_INTERVAL_MS) },
    });

    const st2 = rawStation();
    mocks.getStationsByName.mockResolvedValueOnce([st2]);
    const res = await app.inject({ url: searchUrl(keyword, true) });
    const body = res.json() as { source: string; items: { stId: string }[] };
    expect(body.source).toBe('api');
    expect(body.items.map((i) => i.stId)).toContain(st2.stId);
    expect(mocks.getStationsByName).toHaveBeenCalledTimes(2);
  });

  it('어댑터 실패 + 만료 캐시 → source stale 로 기존 목록 반환', async () => {
    const keyword = kw();
    const st = rawStation();
    mocks.getStationsByName.mockResolvedValueOnce([st]);
    await app.inject({ url: searchUrl(keyword) });

    // TTL(30일) 만료 상태로 변경 → 다음 호출이 재수집을 시도하게.
    await app.prisma.busStationSearch.update({
      where: { keyword },
      data: { fetchedAt: new Date(Date.now() - BUS_SEARCH_TTL_MS - 1000) },
    });

    mocks.getStationsByName.mockRejectedValueOnce(new BusApiError('업스트림 장애'));
    const res = await app.inject({ url: searchUrl(keyword) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { source: string; items: { stId: string }[] };
    expect(body.source).toBe('stale');
    expect(body.items[0]?.stId).toBe(st.stId);
  });

  it('어댑터 실패 + 캐시 없음 → 502', async () => {
    mocks.getStationsByName.mockRejectedValueOnce(new BusApiError('업스트림 장애'));
    const res = await app.inject({ url: searchUrl(kw()) });
    expect(res.statusCode).toBe(502);
    expect((res.json() as { statusCode: number }).statusCode).toBe(502);
  });

  it("arsId '0'(가상정류장) 도 정상 반환된다", async () => {
    const st = rawStation({ arsId: '0' });
    mocks.getStationsByName.mockResolvedValueOnce([st]);
    const res = await app.inject({ url: searchUrl(kw()) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: { stId: string; arsId: string }[] };
    expect(body.items[0]).toMatchObject({ stId: st.stId, arsId: '0' });
  });

  it('전량 좌표 정규화 실패(TM-only 응답) → 502 + 네거티브 캐싱 생략', async () => {
    const keyword = kw();
    mocks.getStationsByName.mockResolvedValueOnce([
      rawStation({ tmX: 200228.41, tmY: 443382.21 }),
    ]);
    const res = await app.inject({ url: searchUrl(keyword) });
    expect(res.statusCode).toBe(502);
    // 빈 결과로 30일 박제되면 안 된다 — 검색 행이 없어야 재시도 가능.
    const row = await app.prisma.busStationSearch.findUnique({ where: { keyword } });
    expect(row).toBeNull();
  });

  it('일부만 좌표 정규화 실패면 정상 행만 반환 (502 아님)', async () => {
    const good = rawStation();
    mocks.getStationsByName.mockResolvedValueOnce([
      rawStation({ tmX: 200228.41, tmY: 443382.21 }),
      good,
    ]);
    const res = await app.inject({ url: searchUrl(kw()) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: { stId: string }[]; total: number };
    expect(body.items.map((i) => i.stId)).toEqual([good.stId]);
    expect(body.total).toBe(1);
  });

  it('전량 좌표 정규화 실패 + 만료 캐시 → stale 로 기존 목록 반환', async () => {
    const keyword = kw();
    const st = rawStation();
    mocks.getStationsByName.mockResolvedValueOnce([st]);
    await app.inject({ url: searchUrl(keyword) });
    await app.prisma.busStationSearch.update({
      where: { keyword },
      data: { fetchedAt: new Date(Date.now() - BUS_SEARCH_TTL_MS - 1000) },
    });

    mocks.getStationsByName.mockResolvedValueOnce([
      rawStation({ tmX: 200228.41, tmY: 443382.21 }),
    ]);
    const res = await app.inject({ url: searchUrl(keyword) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { source: string; items: { stId: string }[] };
    expect(body.source).toBe('stale');
    expect(body.items[0]?.stId).toBe(st.stId);
  });

  it('raw 빈 결과(진짜 결과 없음)는 200 + 네거티브 캐싱 유지', async () => {
    const keyword = kw();
    mocks.getStationsByName.mockResolvedValueOnce([]);
    const res = await app.inject({ url: searchUrl(keyword) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[]; total: number };
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
    // 빈 결과도 검색 행은 남는다 — 재호출 시 cache.
    const again = await app.inject({ url: searchUrl(keyword) });
    expect((again.json() as { source: string }).source).toBe('cache');
    expect(mocks.getStationsByName).toHaveBeenCalledTimes(1);
  });

  // env 는 모듈 단일 로드라 라우트 인스턴스의 키를 비울 수 없다 — 빈 키 503 은
  // 서비스 직접 생성으로 검증 (라우트의 5xx 매핑은 위 502 케이스가 커버).
  it('serviceKey 빈 값 → statusCode 503 에러', async () => {
    const svc = new BusService(app.prisma, { serviceKey: '' });
    await expect(svc.searchStations('강남역', false)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(mocks.getStationsByName).not.toHaveBeenCalled();
  });

  // 60초/30일 경계는 deps.now 주입으로 제어 — 가짜 타이머 불필요.
  it('TTL/force 가드 경계 — deps.now 주입', async () => {
    const adapter = { getStationsByName: vi.fn() };
    let nowMs = Date.now();
    const svc = new BusService(app.prisma, {
      serviceKey: 'svc-key',
      adapter,
      now: () => new Date(nowMs),
    });
    const keyword = kw();

    adapter.getStationsByName.mockResolvedValueOnce([rawStation()]);
    expect((await svc.searchStations(keyword, false)).source).toBe('api');

    // 59초 후 force → 가드에 걸려 cache.
    nowMs += FORCE_MIN_INTERVAL_MS - 1000;
    expect((await svc.searchStations(keyword, true)).source).toBe('cache');
    expect(adapter.getStationsByName).toHaveBeenCalledTimes(1);

    // 61초 후 force → 재수집.
    nowMs += 2000;
    adapter.getStationsByName.mockResolvedValueOnce([rawStation()]);
    expect((await svc.searchStations(keyword, true)).source).toBe('api');
    expect(adapter.getStationsByName).toHaveBeenCalledTimes(2);

    // TTL 만료 + 어댑터 실패 → stale.
    nowMs += BUS_SEARCH_TTL_MS + 1000;
    adapter.getStationsByName.mockRejectedValueOnce(new BusApiError('업스트림 장애'));
    expect((await svc.searchStations(keyword, false)).source).toBe('stale');
  });

  it('일일 쿼터 가드 — 한도 초과 시 업스트림 미호출, 캐시 없으면 503 / 만료 캐시는 stale', async () => {
    const adapter = { getStationsByName: vi.fn() };
    let nowMs = Date.now();
    const svc = new BusService(app.prisma, {
      serviceKey: 'svc-key',
      adapter,
      dailyLimit: 1,
      now: () => new Date(nowMs),
    });
    const keyword1 = kw();
    const keyword2 = kw();

    adapter.getStationsByName.mockResolvedValueOnce([rawStation()]);
    expect((await svc.searchStations(keyword1, false)).source).toBe('api');

    // 한도(1) 소진 — 신규 키워드는 업스트림 호출 없이 503.
    await expect(svc.searchStations(keyword2, false)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(adapter.getStationsByName).toHaveBeenCalledTimes(1);

    // 만료 캐시가 있는 키워드는 stale 로 응답 (DB fetchedAt 만 과거로 — now 를
    // 옮기면 Asia/Seoul 날짜가 바뀌어 쿼터가 리셋되므로).
    await app.prisma.busStationSearch.update({
      where: { keyword: keyword1 },
      data: { fetchedAt: new Date(nowMs - BUS_SEARCH_TTL_MS - 1000) },
    });
    expect((await svc.searchStations(keyword1, false)).source).toBe('stale');
    expect(adapter.getStationsByName).toHaveBeenCalledTimes(1);

    // 하루 경과(Asia/Seoul 날짜 변경) → 쿼터 리셋, 다시 업스트림 호출.
    nowMs += 24 * 60 * 60 * 1000;
    adapter.getStationsByName.mockResolvedValueOnce([rawStation()]);
    expect((await svc.searchStations(keyword2, false)).source).toBe('api');
    expect(adapter.getStationsByName).toHaveBeenCalledTimes(2);
  });

  it('동일 키워드 동시 요청 → in-flight 합류로 어댑터 1회만 호출', async () => {
    const adapter = { getStationsByName: vi.fn() };
    adapter.getStationsByName.mockImplementation(
      () =>
        new Promise<RawBusStation[]>((resolve) => {
          setTimeout(() => resolve([rawStation()]), 50);
        }),
    );
    const svc = new BusService(app.prisma, { serviceKey: 'svc-key', adapter });
    const keyword = kw();

    const [a, b] = await Promise.all([
      svc.searchStations(keyword, false),
      svc.searchStations(keyword, false),
    ]);
    expect(adapter.getStationsByName).toHaveBeenCalledTimes(1);
    expect(a.source).toBe('api');
    expect(b).toEqual(a);

    // 완료 후 in-flight 해제 확인 — 재호출은 캐시 경로(어댑터 추가 호출 없음).
    expect((await svc.searchStations(keyword, false)).source).toBe('cache');
    expect(adapter.getStationsByName).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/v1/bus/stations/nearby', () => {
  // 로컬 마스터(BusStation + BusMasterSync) 바운딩박스 조회 — 업스트림 0콜.
  // lat 38.7~38.8 / lng 127.775 는 실데이터(서울)와 겹치지 않는 테스트 전용 좌표대.
  // 정류소는 ST_PREFIX(파일 afterAll 정리), sync 행은 여기 afterAll 이 id 로 정리.
  const TEST_LNG = 127.775;
  let coordSeq = 0;
  // 간격 0.05°(~5.5km) — 앞 테스트가 최대 ~1.1km 밖까지 시드해도 겹치지 않게.
  const freshCoord = (): { lat: number; lng: number } => {
    coordSeq += 1;
    return { lat: 38.0 + coordSeq * 0.05, lng: TEST_LNG };
  };
  const seedStation = async (lat: number, lng: number): Promise<string> => {
    const stId = `${ST_PREFIX}${stamp()}`;
    await app.prisma.busStation.create({
      data: { stId, arsId: '15107', name: '주변테스트정류장', lat, lng },
    });
    return stId;
  };

  let syncId: number;
  beforeAll(async () => {
    const sync = await app.prisma.busMasterSync.create({
      data: { source: 'busStopLocationXyInfo', count: 0 },
    });
    syncId = sync.id;
  });
  afterAll(async () => {
    await app.prisma.busMasterSync.delete({ where: { id: syncId } });
  });

  it('정상 매핑 — dist 계산·오름차순·반경 필터, 업스트림 미호출, source db', async () => {
    const { lat, lng } = freshCoord();
    // 쿼리 지점과 같은 좌표(dist 0) / 북쪽 ~222m / 북쪽 ~1.1km(기본 500 밖).
    const at = await seedStation(lat, lng);
    const near = await seedStation(lat + 0.002, lng);
    await seedStation(lat + 0.01, lng);

    const res = await app.inject({ url: nearbyUrl(lat, lng) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: { stId: string; dist: number }[];
      total: number;
      fetchedAt: string;
      source: string;
    };
    expect(body.total).toBe(2);
    expect(body.source).toBe('db');
    expect(body.items.map((i) => i.stId)).toEqual([at, near]);
    expect(body.items[0]!.dist).toBe(0);
    expect(body.items[1]!.dist).toBeGreaterThan(200);
    expect(body.items[1]!.dist).toBeLessThan(250);
    // fetchedAt = 마스터 적재 시각(loadedAt).
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false);
    // 로컬 조회 — 서울시 API 를 부르지 않는다.
    expect(mocks.getStationsByPos).not.toHaveBeenCalled();
  });

  it("가상정류장(arsId '0') 은 도착정보 조회 불가 — 주변 목록에서 제외", async () => {
    const { lat, lng } = freshCoord();
    await seedStation(lat, lng);
    await app.prisma.busStation.create({
      data: {
        stId: `${ST_PREFIX}${stamp()}`,
        arsId: '0',
        name: '미정차가상정류장',
        lat,
        lng,
      },
    });
    const res = await app.inject({ url: nearbyUrl(lat, lng) });
    const body = res.json() as { total: number; items: { arsId: string }[] };
    expect(body.total).toBe(1);
    expect(body.items[0]!.arsId).not.toBe('0');
  });

  it('바운딩박스 모서리(대각 ~700m)는 박스 안이어도 반경(500m) 밖 — 제외', async () => {
    const { lat, lng } = freshCoord();
    // 대각 방향 0.0045°씩 — 박스(±500m ≈ ±0.0045°) 안, 직선거리 ~700m.
    await seedStation(lat + 0.0044, lng + 0.0044 / Math.cos((lat * Math.PI) / 180));
    const res = await app.inject({ url: nearbyUrl(lat, lng) });
    const body = res.json() as { total: number };
    expect(body.total).toBe(0);
  });

  it('마스터 미적재(BusMasterSync 없음) → 503 안내', async () => {
    const fakePrisma = {
      busStation: { findMany: vi.fn().mockResolvedValue([]) },
      busMasterSync: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as typeof app.prisma;
    const svc = new BusService(fakePrisma, { serviceKey: 'svc-key' });
    await expect(svc.getNearbyStations(37.5, 127.02, 500)).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringContaining('load:bus-stations') as string,
    });
  });

  it('로컬 조회라 serviceKey·쿼터와 무관 — 빈 키/쿼터 0 이어도 200', async () => {
    const { lat, lng } = freshCoord();
    await seedStation(lat, lng);
    const svc = new BusService(app.prisma, { serviceKey: '', dailyLimit: 0 });
    const result = await svc.getNearbyStations(lat, lng, 500);
    expect(result.total).toBe(1);
    expect(result.source).toBe('db');
  });

  it('lat 범위 밖(50)/radius 상한 초과(1001) → 400', async () => {
    expect((await app.inject({ url: nearbyUrl(50, 127.02) })).statusCode).toBe(400);
    expect((await app.inject({ url: nearbyUrl(37.5, 127.02, 1001) })).statusCode).toBe(400);
  });
});

describe('GET /api/v1/bus/stations/:arsId/arrivals', () => {
  it("정상 매핑 — vehId '0' → null, arrmsg 없으면 항목 null, rtNm null → ''", async () => {
    mocks.getStationArrivals.mockResolvedValueOnce([
      rawArrival(),
      rawArrival({
        busRouteId: '104000006',
        rtNm: '242',
        staOrd: 71,
        vehId1: '0',
        arrmsg1: '운행종료',
        vehId2: null,
        arrmsg2: null,
      }),
      rawArrival({ busRouteId: '100100290', rtNm: null, staOrd: null }),
    ]);

    const res = await app.inject({ url: arrivalsUrl('23278') });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      arsId: string;
      items: unknown[];
      fetchedAt: string;
    };
    expect(body.arsId).toBe('23278');
    expect(body.items).toHaveLength(3);
    expect(body.items[0]).toEqual({
      busRouteId: '100100020',
      routeName: '141',
      staOrd: 65,
      first: { vehId: '109042241', message: '곧 도착' },
      second: { vehId: '109042059', message: '8분후[2번째 전]' },
    });
    // vehId '0'(도착예정 차량 없음) → null 정규화, 메시지 원문 보존.
    expect(body.items[1]).toMatchObject({
      first: { vehId: null, message: '운행종료' },
      second: null,
    });
    // rtNm/staOrd 누락 노선 — routeName '' + staOrd null (위치 조회 비활성 신호).
    expect(body.items[2]).toMatchObject({ routeName: '', staOrd: null });
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false);
    expect(mocks.getStationArrivals).toHaveBeenCalledWith('23278', {
      serviceKey: expect.any(String) as string,
    });
  });

  it("arsId '0'(가상정류장) → 400, 업스트림 미호출", async () => {
    const res = await app.inject({ url: arrivalsUrl('0') });
    expect(res.statusCode).toBe(400);
    expect(mocks.getStationArrivals).not.toHaveBeenCalled();
  });

  it('arsId 비숫자 → 400', async () => {
    const res = await app.inject({ url: arrivalsUrl('abc12') });
    expect(res.statusCode).toBe(400);
    expect(mocks.getStationArrivals).not.toHaveBeenCalled();
  });

  it('업스트림 실패 + last-known 없음 → 502', async () => {
    // 미사용 arsId(캐시 미스, 성공 이력 없음)로 업스트림 콜을 강제해 502 검증.
    mocks.getStationArrivals.mockRejectedValueOnce(new BusApiError('업스트림 장애'));
    const res = await app.inject({ url: arrivalsUrl('23111') });
    expect(res.statusCode).toBe(502);
    expect((res.json() as { statusCode: number }).statusCode).toBe(502);
  });

  it('업스트림 실패 + last-known(≤10분) → stale:true 로 마지막 성공본 서빙', async () => {
    const adapter = { getStationsByName: vi.fn(), getStationArrivals: vi.fn() };
    let t = new Date('2026-07-13T09:00:00Z');
    const svc = new BusService(app.prisma, { serviceKey: 'k', adapter, now: () => t });

    adapter.getStationArrivals.mockResolvedValueOnce([rawArrival()]);
    const first = await svc.getArrivals('23278');
    expect(first.stale).toBe(false);

    // 마이크로캐시(15초) 만료 후 업스트림 장애 — last-known 폴백.
    t = new Date(t.getTime() + 16_000);
    adapter.getStationArrivals.mockRejectedValueOnce(new BusApiError('bus api status 503'));
    const second = await svc.getArrivals('23278');
    expect(second.stale).toBe(true);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(second.items).toEqual(first.items);
  });

  it('last-known 이 10분 초과면 폴백 없이 502 전파', async () => {
    const adapter = { getStationsByName: vi.fn(), getStationArrivals: vi.fn() };
    let t = new Date('2026-07-13T09:00:00Z');
    const svc = new BusService(app.prisma, { serviceKey: 'k', adapter, now: () => t });

    adapter.getStationArrivals.mockResolvedValueOnce([rawArrival()]);
    await svc.getArrivals('23278');

    t = new Date(t.getTime() + 10 * 60_000 + 16_000);
    adapter.getStationArrivals.mockRejectedValueOnce(new BusApiError('bus api status 503'));
    await expect(svc.getArrivals('23278')).rejects.toMatchObject({ statusCode: 502 });
  });

  it('쿼터 소진도 last-known(≤10분) 폴백 — 503 대신 stale 서빙', async () => {
    const adapter = { getStationsByName: vi.fn(), getStationArrivals: vi.fn() };
    let t = new Date('2026-07-13T09:00:00Z');
    const svc = new BusService(app.prisma, {
      serviceKey: 'k',
      adapter,
      now: () => t,
      dailyLimit: 1,
    });

    adapter.getStationArrivals.mockResolvedValueOnce([rawArrival()]);
    await svc.getArrivals('23278');

    // 쿼터(1) 소진 상태에서 캐시 만료 — consumeQuota 503 대신 last-known.
    t = new Date(t.getTime() + 16_000);
    const res = await svc.getArrivals('23278');
    expect(res.stale).toBe(true);
    expect(adapter.getStationArrivals).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/v1/bus/routes/:busRouteId/positions', () => {
  it('정상 매핑 — 좌표 정규화 실패/vehId 누락 행은 drop', async () => {
    mocks.getBusPositionsByRouteSt.mockResolvedValueOnce([
      rawPosition(),
      // vehId 누락 — 계약(vehId min 1)을 만족 못 해 drop.
      rawPosition({ vehId: null }),
      // WGS84 쌍 없음(TM-only) — drop.
      rawPosition({ vehId: '109042999', tmX: null, tmY: null, gpsX: null, gpsY: null }),
    ]);

    const res = await app.inject({ url: positionsUrl('100100020', 62, 65) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      busRouteId: string;
      items: unknown[];
      fetchedAt: string;
    };
    expect(body.busRouteId).toBe('100100020');
    expect(body.items).toEqual([
      {
        vehId: '109042059',
        plainNo: '서울74사6477',
        lat: 37.493328,
        lng: 127.047265,
        sectOrd: 62,
        stopFlag: '1',
      },
    ]);
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false);
    // querystring 이 coerce 되어 숫자로 어댑터에 전달된다.
    expect(mocks.getBusPositionsByRouteSt).toHaveBeenCalledWith('100100020', 62, 65, {
      serviceKey: expect.any(String) as string,
    });
  });

  it('endOrd < startOrd → 400', async () => {
    const res = await app.inject({ url: positionsUrl('100100020', 5, 4) });
    expect(res.statusCode).toBe(400);
    expect(mocks.getBusPositionsByRouteSt).not.toHaveBeenCalled();
  });

  it('구간 51 정류장(> 50) → 400', async () => {
    const res = await app.inject({ url: positionsUrl('100100020', 1, 52) });
    expect(res.statusCode).toBe(400);
    expect(mocks.getBusPositionsByRouteSt).not.toHaveBeenCalled();
  });

  it('busRouteId 비숫자 → 400', async () => {
    const res = await app.inject({ url: positionsUrl('abc123', 1, 5) });
    expect(res.statusCode).toBe(400);
    expect(mocks.getBusPositionsByRouteSt).not.toHaveBeenCalled();
  });

  it('업스트림 실패 → 502', async () => {
    // 마이크로 캐시 미스(미사용 busRouteId)로 업스트림 콜을 강제.
    mocks.getBusPositionsByRouteSt.mockRejectedValueOnce(new BusApiError('업스트림 장애'));
    const res = await app.inject({ url: positionsUrl('100100099', 62, 65) });
    expect(res.statusCode).toBe(502);
  });

  // ── 노선 전체 조회 — startOrd/endOrd 둘 다 생략 시 getBusPosByRtid 분기 ──
  it('쿼리 생략 → 노선 전체(getBusPosByRtid) 호출 + 동일 매핑/drop 정책', async () => {
    mocks.getBusPositionsByRtid.mockResolvedValueOnce([
      rawPosition(),
      rawPosition({ vehId: null }), // drop
    ]);

    const res = await app.inject({ url: `/api/v1/bus/routes/100100020/positions` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { busRouteId: string; items: unknown[] };
    expect(body.busRouteId).toBe('100100020');
    expect(body.items).toHaveLength(1);
    expect(mocks.getBusPositionsByRtid).toHaveBeenCalledWith('100100020', {
      serviceKey: expect.any(String) as string,
    });
    expect(mocks.getBusPositionsByRouteSt).not.toHaveBeenCalled();
  });

  it('startOrd 만 지정(페어 깨짐) → 400, 업스트림 미호출', async () => {
    const res = await app.inject({
      url: `/api/v1/bus/routes/100100020/positions?startOrd=62`,
    });
    expect(res.statusCode).toBe(400);
    expect(mocks.getBusPositionsByRouteSt).not.toHaveBeenCalled();
    expect(mocks.getBusPositionsByRtid).not.toHaveBeenCalled();
  });

  it('전체 조회도 업스트림 실패 → 502', async () => {
    // 마이크로 캐시 미스(미사용 busRouteId)로 업스트림 콜을 강제.
    mocks.getBusPositionsByRtid.mockRejectedValueOnce(new BusApiError('업스트림 장애'));
    const res = await app.inject({ url: `/api/v1/bus/routes/100100098/positions` });
    expect(res.statusCode).toBe(502);
  });
});

describe('BusService — 도착/위치 쿼터·키 가드 (서비스 직접 생성)', () => {
  it('일일 쿼터 공유 — 검색으로 소진하면 도착/위치도 503, 리셋 후 역방향도 공유', async () => {
    const adapter = {
      getStationsByName: vi.fn(),
      getStationArrivals: vi.fn(),
      getBusPositionsByRouteSt: vi.fn(),
    };
    let nowMs = Date.now();
    const svc = new BusService(app.prisma, {
      serviceKey: 'svc-key',
      adapter,
      dailyLimit: 1,
      now: () => new Date(nowMs),
    });

    adapter.getStationsByName.mockResolvedValueOnce([rawStation()]);
    expect((await svc.searchStations(kw(), false)).source).toBe('api');

    // 검색이 소진한 카운터를 도착/위치가 그대로 본다 — 업스트림 미호출 503.
    await expect(svc.getArrivals('23278')).rejects.toMatchObject({ statusCode: 503 });
    await expect(svc.getPositions('100100020', 62, 65)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(adapter.getStationArrivals).not.toHaveBeenCalled();
    expect(adapter.getBusPositionsByRouteSt).not.toHaveBeenCalled();

    // 하루 경과(Asia/Seoul 날짜 변경) → 리셋. 도착 조회가 소진하면 검색도 503.
    nowMs += 24 * 60 * 60 * 1000;
    adapter.getStationArrivals.mockResolvedValueOnce([rawArrival()]);
    expect((await svc.getArrivals('23278')).items).toHaveLength(1);
    await expect(svc.searchStations(kw(), false)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(adapter.getStationsByName).toHaveBeenCalledTimes(1);
  });

  it('serviceKey 빈 값 → 도착/위치 모두 statusCode 503', async () => {
    const svc = new BusService(app.prisma, { serviceKey: '' });
    await expect(svc.getArrivals('23278')).rejects.toMatchObject({ statusCode: 503 });
    await expect(svc.getPositions('100100020', 62, 65)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(mocks.getStationArrivals).not.toHaveBeenCalled();
    expect(mocks.getBusPositionsByRouteSt).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/bus/routes/:busRouteId/detail (5차 노선 보기)', () => {
  // 라우트 BusService 는 파일 공유 + 캐시는 DB 30일 — 테스트마다 겹치지 않는
  // busRouteId 를 쓰고 afterAll 에서 prefix 로 정리한다(숫자여야 params 통과).
  let ridSeq = 0;
  const rid = (): string => `9990${Date.now()}${ridSeq++}`;

  afterAll(async () => {
    await app.prisma.busRouteShape.deleteMany({
      where: { busRouteId: { startsWith: '9990' } },
    });
  });

  it('miss → api + 정규화(path no정렬/station seq정렬/isTurnPoint/info 시간·회사명) + 행 생성', async () => {
    const busRouteId = rid();
    // 어댑터 입력 순서와 무관하게 no/seq 오름차순으로 서빙됨을 역순 입력으로 검증.
    mocks.getRoutePath.mockResolvedValueOnce([
      rawRoutePath({ no: 2, gpsX: 127.041, gpsY: 37.688 }),
      rawRoutePath({ no: 1, gpsX: 127.039507, gpsY: 37.686917 }),
    ]);
    mocks.getStationsByRoute.mockResolvedValueOnce([
      rawRouteStation({ seq: 2, stId: 'route-b', stNm: '정류장B', transYn: 'Y' }),
      rawRouteStation({ seq: 1, stId: 'route-a', stNm: '정류장A', transYn: 'N' }),
    ]);
    mocks.getRouteInfo.mockResolvedValueOnce(rawRouteInfo());

    const res = await app.inject({ url: routeDetailUrl(busRouteId) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BusRouteDetailResultType;
    expect(body.source).toBe('api');
    expect(body.busRouteId).toBe(busRouteId);
    // 형상: no 오름차순 → 첫 점이 no1.
    expect(body.path).toHaveLength(2);
    expect(body.path[0]).toEqual({ lat: 37.686917, lng: 127.039507 });
    // 정류소: seq 오름차순 + isTurnPoint=transYn 'Y'.
    expect(body.stations.map((s) => s.stId)).toEqual(['route-a', 'route-b']);
    expect(body.stations[0]!.isTurnPoint).toBe(false);
    expect(body.stations[1]!.isTurnPoint).toBe(true);
    expect(body.stations[0]).toMatchObject({
      seq: 1,
      name: '정류장A',
      arsId: '10153',
      direction: '염곡동',
    });
    // info 정규화: 시간 HH:mm, 회사명 연속 공백 접힘, length/term 숫자.
    expect(body.info).toMatchObject({
      routeName: '141',
      routeType: '3',
      stStationName: '도봉산',
      edStationName: '염곡동',
      lengthKm: 54.1,
      termMin: 11,
      firstBusTime: '04:00',
      lastBusTime: '22:40',
      corpName: '아진교통 02-955-2321',
    });
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false);

    const row = await app.prisma.busRouteShape.findUnique({ where: { busRouteId } });
    expect(row).not.toBeNull();
  });

  it('TTL 내 재요청 → cache, 어댑터 미호출', async () => {
    const busRouteId = rid();
    mocks.getRoutePath.mockResolvedValueOnce([rawRoutePath()]);
    mocks.getStationsByRoute.mockResolvedValueOnce([rawRouteStation()]);
    mocks.getRouteInfo.mockResolvedValueOnce(rawRouteInfo());
    await app.inject({ url: routeDetailUrl(busRouteId) });
    expect(mocks.getRouteInfo).toHaveBeenCalledTimes(1);

    const res = await app.inject({ url: routeDetailUrl(busRouteId) });
    expect((res.json() as BusRouteDetailResultType).source).toBe('cache');
    expect(mocks.getRouteInfo).toHaveBeenCalledTimes(1);
    expect(mocks.getRoutePath).toHaveBeenCalledTimes(1);
    expect(mocks.getStationsByRoute).toHaveBeenCalledTimes(1);
  });

  it('업스트림 실패 + 만료 캐시 → stale 로 기존 목록 반환', async () => {
    const busRouteId = rid();
    mocks.getRoutePath.mockResolvedValueOnce([rawRoutePath()]);
    mocks.getStationsByRoute.mockResolvedValueOnce([rawRouteStation({ stId: 'route-orig' })]);
    mocks.getRouteInfo.mockResolvedValueOnce(rawRouteInfo());
    await app.inject({ url: routeDetailUrl(busRouteId) });

    await app.prisma.busRouteShape.update({
      where: { busRouteId },
      data: { fetchedAt: new Date(Date.now() - BUS_ROUTE_TTL_MS - 1000) },
    });

    mocks.getRouteInfo.mockRejectedValueOnce(new BusApiError('업스트림 장애'));
    const res = await app.inject({ url: routeDetailUrl(busRouteId) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BusRouteDetailResultType;
    expect(body.source).toBe('stale');
    expect(body.stations[0]!.stId).toBe('route-orig');
  });

  it('업스트림 실패 + 캐시 없음 → 502', async () => {
    mocks.getRoutePath.mockResolvedValueOnce([rawRoutePath()]);
    mocks.getStationsByRoute.mockResolvedValueOnce([rawRouteStation()]);
    mocks.getRouteInfo.mockRejectedValueOnce(new BusApiError('업스트림 장애'));
    const res = await app.inject({ url: routeDetailUrl(rid()) });
    expect(res.statusCode).toBe(502);
  });

  it('getRouteInfo 결과 없음(노선 부재) → 502', async () => {
    mocks.getRoutePath.mockResolvedValueOnce([]);
    mocks.getStationsByRoute.mockResolvedValueOnce([]);
    mocks.getRouteInfo.mockResolvedValueOnce(null);
    const res = await app.inject({ url: routeDetailUrl(rid()) });
    expect(res.statusCode).toBe(502);
  });

  it('비숫자 busRouteId → 400, 어댑터 미호출', async () => {
    const res = await app.inject({ url: '/api/v1/bus/routes/abc12/detail' });
    expect(res.statusCode).toBe(400);
    expect(mocks.getRouteInfo).not.toHaveBeenCalled();
  });

  it('일일 쿼터 소진 → 503 (3콜분 확보 실패, 어댑터 미호출)', async () => {
    const adapter = {
      getRoutePath: vi.fn(),
      getStationsByRoute: vi.fn(),
      getRouteInfo: vi.fn(),
    };
    // dailyLimit 2 < 3콜 — 쿼터 확보 단계에서 503, 업스트림 미호출.
    const svc = new BusService(app.prisma, { serviceKey: 'svc-key', adapter, dailyLimit: 2 });
    await expect(svc.getRouteDetail(rid())).rejects.toMatchObject({ statusCode: 503 });
    expect(adapter.getRoutePath).not.toHaveBeenCalled();
    expect(adapter.getRouteInfo).not.toHaveBeenCalled();
  });

  it('serviceKey 빈 값 → 503', async () => {
    const svc = new BusService(app.prisma, { serviceKey: '' });
    await expect(svc.getRouteDetail(rid())).rejects.toMatchObject({ statusCode: 503 });
  });
});
