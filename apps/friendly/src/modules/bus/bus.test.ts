import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// env.ts 는 모듈 로드 시점에 process.env 를 파싱한다 — buildApp import 전에
// (vi.hoisted) 키를 주입해야 라우트의 BusService 가 503 으로 죽지 않는다.
// .env 에 실제 키가 있으면 그대로 둔다 (어댑터는 어차피 mock 이라 호출 안 됨).
vi.hoisted(() => {
  process.env.BUS_API_KEY = process.env.BUS_API_KEY || 'test-bus-key';
});

// 실제 서울시 API 호출 차단 — 업스트림 함수 3개만 mock, 나머지(BusApiError,
// toLatLng 등)는 실구현 유지 (서비스가 instanceof / 좌표 정규화에 사용).
const mocks = vi.hoisted(() => ({
  getStationsByName: vi.fn(),
  getStationArrivals: vi.fn(),
  getBusPositionsByRouteSt: vi.fn(),
  getStationsByPos: vi.fn(),
}));
vi.mock('./bus-api.adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./bus-api.adapter.js')>();
  return { ...actual, ...mocks };
});

import { buildApp } from '../../app.js';
import {
  BusApiError,
  type RawBusPosition,
  type RawBusStation,
  type RawNearbyStation,
  type RawStationArrival,
} from './bus-api.adapter.js';
import {
  BUS_NEARBY_TTL_MS,
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

// 2026-07-04 probe 실덤프(getStationByPos, 강남역 반경 300m) 형태 기반 —
// nearby 응답은 tmX/tmY 없이 gpsX/gpsY(WGS84)만 온다.
const rawNearby = (over: Partial<RawNearbyStation> = {}): RawNearbyStation => ({
  stId: `${ST_PREFIX}${stamp()}`,
  arsId: '22859',
  stNm: '강남역.삼성전자',
  dist: 14,
  tmX: null,
  tmY: null,
  gpsX: 127.0278698411,
  gpsY: 37.4970515618,
  posX: 202464.18360829516,
  posY: 444183.23039598204,
  ...over,
});

const searchUrl = (q: string, force?: boolean): string =>
  `/api/v1/bus/stations/search?q=${encodeURIComponent(q)}${force ? '&force=true' : ''}`;
const nearbyUrl = (lat: number, lng: number, radius?: number): string =>
  `/api/v1/bus/stations/nearby?lat=${lat}&lng=${lng}${radius !== undefined ? `&radius=${radius}` : ''}`;
const arrivalsUrl = (arsId: string): string => `/api/v1/bus/stations/${arsId}/arrivals`;
const positionsUrl = (busRouteId: string, startOrd: number, endOrd: number): string =>
  `/api/v1/bus/routes/${busRouteId}/positions?startOrd=${startOrd}&endOrd=${endOrd}`;

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
  mocks.getStationsByPos.mockReset();
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
  // 라우트의 BusService 인스턴스는 파일 내 공유 + 셀 캐시는 DB 30일 —
  // 테스트마다 겹치지 않는 셀(0.005° 격자)을 쓴다. lng 127.775 는 테스트 전용
  // 격자(afterAll 정리 기준).
  const TEST_LNG = 127.775;
  let coordSeq = 0;
  const freshCoord = (): { lat: number; lng: number } => {
    coordSeq += 1;
    return { lat: 37.4 + coordSeq * 0.01, lng: TEST_LNG };
  };

  afterAll(async () => {
    // 셀 행 삭제가 hits 를 cascade 정리 (정류소는 파일 afterAll 의 ST_PREFIX).
    await app.prisma.busNearbyCell.deleteMany({
      where: { cellKey: { endsWith: `,${TEST_LNG.toFixed(3)}` } },
    });
  });

  it('정상 매핑 — 쿼리 지점 기준 dist 재계산·오름차순·반경 필터, 셀 중심+고정 반경 호출', async () => {
    const { lat, lng } = freshCoord();
    // 쿼리 지점과 같은 좌표(dist 0) / 북쪽 ~222m / 북쪽 ~1.1km(기본 500 밖).
    const at = rawNearby({ gpsY: lat, gpsX: lng });
    const near = rawNearby({ stId: `${ST_PREFIX}${stamp()}`, gpsY: lat + 0.002, gpsX: lng });
    const out = rawNearby({ stId: `${ST_PREFIX}${stamp()}`, gpsY: lat + 0.01, gpsX: lng });
    // 어댑터 순서와 무관하게 dist 오름차순으로 서빙된다.
    mocks.getStationsByPos.mockResolvedValueOnce([out, near, at]);

    const res = await app.inject({ url: nearbyUrl(lat, lng) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: { stId: string; dist: number; lat: number; lng: number }[];
      total: number;
      fetchedAt: string;
      source: string;
    };
    // 반경(기본 500m) 밖 정류소는 total 에서도 제외 — 셀은 1500m 로 넓게 수집
    // 하지만 응답은 쿼리 반경으로 자른다.
    expect(body.total).toBe(2);
    expect(body.source).toBe('api');
    expect(body.items.map((i) => i.stId)).toEqual([at.stId, near.stId]);
    expect(body.items[0]!.dist).toBe(0);
    expect(body.items[1]!.dist).toBeGreaterThan(200);
    expect(body.items[1]!.dist).toBeLessThan(250);
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false);
    // 업스트림은 쿼리 좌표가 아니라 셀 스냅 좌표 + 고정 반경(1500m)으로 호출 —
    // 셀 캐시를 셀 내 어떤 쿼리에도 재사용하기 위함. (freshCoord 는 0.005 의
    // 배수라 스냅 결과가 입력과 같다.)
    // 스냅은 round(v/0.005)*0.005 — 부동소수 오차가 붙을 수 있어 closeTo.
    expect(mocks.getStationsByPos).toHaveBeenCalledWith(
      expect.closeTo(lng, 6) as number,
      expect.closeTo(lat, 6) as number,
      1500,
      { serviceKey: expect.any(String) as string },
    );
  });

  it('셀 DB 캐시 — 같은 셀 재요청은 업스트림 미호출(radius 달라도), 다른 셀은 재호출', async () => {
    const { lat, lng } = freshCoord();
    mocks.getStationsByPos.mockResolvedValue([rawNearby({ gpsY: lat, gpsX: lng })]);

    expect((await app.inject({ url: nearbyUrl(lat, lng) })).statusCode).toBe(200);
    // 같은 셀 내 다른 좌표(+0.001° < 셀 반변) + 다른 radius — DB 캐시 서빙.
    const hit = await app.inject({ url: nearbyUrl(lat + 0.001, lng, 300) });
    expect((hit.json() as { source: string }).source).toBe('cache');
    expect(mocks.getStationsByPos).toHaveBeenCalledTimes(1);

    // 다른 셀(+0.005°) — 재수집.
    await app.inject({ url: nearbyUrl(lat + 0.005, lng) });
    expect(mocks.getStationsByPos).toHaveBeenCalledTimes(2);
  });

  it('만료 셀 + 업스트림 실패 → stale 로 기존 목록 반환', async () => {
    const { lat, lng } = freshCoord();
    const st = rawNearby({ gpsY: lat, gpsX: lng });
    mocks.getStationsByPos.mockResolvedValueOnce([st]);
    await app.inject({ url: nearbyUrl(lat, lng) });

    await app.prisma.busNearbyCell.update({
      where: { cellKey: `${lat.toFixed(3)},${lng.toFixed(3)}` },
      data: { fetchedAt: new Date(Date.now() - BUS_NEARBY_TTL_MS - 1000) },
    });

    mocks.getStationsByPos.mockRejectedValueOnce(new BusApiError('업스트림 장애'));
    const res = await app.inject({ url: nearbyUrl(lat, lng) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { source: string; items: { stId: string }[] };
    expect(body.source).toBe('stale');
    expect(body.items[0]?.stId).toBe(st.stId);
  });

  it('좌표 정규화 실패(TM-only) 행은 drop, 전량 실패면 502 + 셀 미기록', async () => {
    const { lat, lng } = freshCoord();
    const good = rawNearby({ gpsY: lat, gpsX: lng });
    mocks.getStationsByPos.mockResolvedValueOnce([
      rawNearby({ gpsX: null, gpsY: null }), // WGS84 쌍 없음(posX/posY TM 만)
      good,
    ]);
    const res = await app.inject({ url: nearbyUrl(lat, lng) });
    const body = res.json() as { items: { stId: string }[]; total: number };
    expect(body.items.map((i) => i.stId)).toEqual([good.stId]);
    expect(body.total).toBe(1);

    // 전량 실패 — 다른 셀에서 502, 빈 셀로 박제되지 않아야 한다.
    const { lat: lat2, lng: lng2 } = freshCoord();
    mocks.getStationsByPos.mockResolvedValueOnce([rawNearby({ gpsX: null, gpsY: null })]);
    expect((await app.inject({ url: nearbyUrl(lat2, lng2) })).statusCode).toBe(502);
    const cell = await app.prisma.busNearbyCell.findUnique({
      where: { cellKey: `${lat2.toFixed(3)},${lng2.toFixed(3)}` },
    });
    expect(cell).toBeNull();
  });

  it('lat 범위 밖(50)/radius 상한 초과(1001) → 400, 업스트림 미호출', async () => {
    expect((await app.inject({ url: nearbyUrl(50, 127.02) })).statusCode).toBe(400);
    expect((await app.inject({ url: nearbyUrl(37.5, 127.02, 1001) })).statusCode).toBe(400);
    expect(mocks.getStationsByPos).not.toHaveBeenCalled();
  });

  it('업스트림 실패 → 502 (캐시 미기록 — 재요청 시 재시도)', async () => {
    const { lat, lng } = freshCoord();
    mocks.getStationsByPos.mockRejectedValueOnce(new BusApiError('업스트림 장애'));
    const res = await app.inject({ url: nearbyUrl(lat, lng) });
    expect(res.statusCode).toBe(502);

    mocks.getStationsByPos.mockResolvedValueOnce([rawNearby()]);
    const retry = await app.inject({ url: nearbyUrl(lat, lng) });
    expect(retry.statusCode).toBe(200);
    expect(mocks.getStationsByPos).toHaveBeenCalledTimes(2);
  });

  it('일일 쿼터 공유 — 검색이 소진하면 nearby 도 503 (서비스 직접 생성)', async () => {
    const adapter = { getStationsByName: vi.fn(), getStationsByPos: vi.fn() };
    const svc = new BusService(app.prisma, {
      serviceKey: 'svc-key',
      adapter,
      dailyLimit: 1,
    });
    adapter.getStationsByName.mockResolvedValueOnce([rawStation()]);
    await svc.searchStations(kw(), false);

    await expect(svc.getNearbyStations(37.5, 127.02, 500)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(adapter.getStationsByPos).not.toHaveBeenCalled();
  });

  it('serviceKey 빈 값 → 503', async () => {
    const svc = new BusService(app.prisma, { serviceKey: '' });
    await expect(svc.getNearbyStations(37.5, 127.02, 500)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(mocks.getStationsByPos).not.toHaveBeenCalled();
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

  it('업스트림 실패 → 502 (실시간 데이터라 stale 폴백 없음)', async () => {
    mocks.getStationArrivals.mockRejectedValueOnce(new BusApiError('업스트림 장애'));
    const res = await app.inject({ url: arrivalsUrl('23278') });
    expect(res.statusCode).toBe(502);
    expect((res.json() as { statusCode: number }).statusCode).toBe(502);
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
    mocks.getBusPositionsByRouteSt.mockRejectedValueOnce(new BusApiError('업스트림 장애'));
    const res = await app.inject({ url: positionsUrl('100100020', 62, 65) });
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
