import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// env.ts 는 모듈 로드 시점에 process.env 를 파싱한다 — buildApp import 전에
// (vi.hoisted) 키를 주입해야 라우트의 BusService 가 503 으로 죽지 않는다.
// .env 에 실제 키가 있으면 그대로 둔다 (어댑터는 어차피 mock 이라 호출 안 됨).
vi.hoisted(() => {
  process.env.BUS_API_KEY = process.env.BUS_API_KEY || 'test-bus-key';
});

// 실제 서울시 API 호출 차단 — getStationsByName 만 mock, 나머지(BusApiError,
// toLatLng 등)는 실구현 유지 (서비스가 instanceof / 좌표 정규화에 사용).
const mocks = vi.hoisted(() => ({
  getStationsByName: vi.fn(),
}));
vi.mock('./bus-api.adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./bus-api.adapter.js')>();
  return { ...actual, getStationsByName: mocks.getStationsByName };
});

import { buildApp } from '../../app.js';
import { BusApiError, type RawBusStation } from './bus-api.adapter.js';
import { BUS_SEARCH_TTL_MS, BusService, FORCE_MIN_INTERVAL_MS } from './bus.service.js';

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

const searchUrl = (q: string, force?: boolean): string =>
  `/api/v1/bus/stations/search?q=${encodeURIComponent(q)}${force ? '&force=true' : ''}`;

describe('GET /api/v1/bus/stations/search', () => {
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
  });

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
