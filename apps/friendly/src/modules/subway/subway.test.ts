import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// env 는 모듈 로드 시점에 process.env 를 파싱한다 — buildApp import 전에 키를
// 주입해야 arrivals 라우트의 SubwayService 가 503 으로 죽지 않는다. 검색은 키
// 불필요. .env 에 실제 키가 있으면 그대로 둔다(어댑터는 mock 이라 호출 안 됨).
vi.hoisted(() => {
  process.env.SUBWAY_API_KEY = process.env.SUBWAY_API_KEY || 'test-subway-key';
});

// 실 swopenAPI 호출 차단 — getRealtimeArrivals 만 mock, 나머지(에러 클래스 등)는
// 실구현 유지.
const mocks = vi.hoisted(() => ({ getRealtimeArrivals: vi.fn() }));
vi.mock('./subway-api.adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./subway-api.adapter.js')>();
  return { ...actual, ...mocks };
});

import type {
  SubwayArrivalsResultType,
  SubwayLineDetailResultType,
  SubwayNearbyResultType,
  SubwayStationSearchResultType,
} from '@repo/api-contract';
import { buildApp } from '../../app.js';
import type { RawSubwayArrival } from './subway-api.adapter.js';
import { SubwayService } from './subway.service.js';

// 공유 dev.db — 역명 prefix '지하철테스트' 로 시드하고 afterAll 에서 prefix 로
// 정리한다. PK 가 `${lineId}:${name}` 이라 name prefix 로 deleteMany 가능.
// 검색은 로컬 DB 단일 소스라 업스트림 키가 불필요 — vi.hoisted 키 주입도 불필요.
const NAME_PREFIX = '지하철테스트';
const stamp = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

interface SeedRow {
  lineId: string;
  name: string;
  lat: number;
  lng: number;
  lineName?: string;
  realtimeName?: string;
}
const seed = (app: FastifyInstance, rows: SeedRow[]) =>
  app.prisma.subwayStation.createMany({
    data: rows.map((r) => ({
      id: `${r.lineId}:${r.name}`,
      name: r.name,
      lineId: r.lineId,
      lineName: r.lineName ?? `${r.lineId}호선`,
      realtimeName: r.realtimeName ?? null,
      lat: r.lat,
      lng: r.lng,
    })),
  });

const searchUrl = (q: string): string =>
  `/api/v1/subway/stations/search?q=${encodeURIComponent(q)}`;
const arrivalsUrl = (stationId: string): string =>
  `/api/v1/subway/stations/${encodeURIComponent(stationId)}/arrivals`;
const nearbyUrl = (lat: number, lng: number, radius?: number): string =>
  `/api/v1/subway/stations/nearby?lat=${lat}&lng=${lng}${radius !== undefined ? `&radius=${radius}` : ''}`;
const lineDetailUrl = (lineId: string): string => `/api/v1/subway/lines/${lineId}/detail`;

// SubwayLineStation 시드 — stationId 는 '지하철테스트' 를 포함해 afterAll 이 정리.
const seedLineStations = (
  app: FastifyInstance,
  rows: { lineId: string; branchKey: string; branchName: string | null; seq: number; stationId: string }[],
) => app.prisma.subwayLineStation.createMany({ data: rows });

// 등거리 근사(서비스 approxDistanceM 과 동일 식) — 시드 좌표를 결정적으로 만든다.
const M_PER_LAT = 111_320;
const offsetLat = (base: number, meters: number): number => base + meters / M_PER_LAT;
const offsetLng = (baseLat: number, baseLng: number, meters: number): number =>
  baseLng + meters / (M_PER_LAT * Math.cos((baseLat * Math.PI) / 180));

// realtimeStationArrival 원시 행 팩토리 (data/subway-probe 강남 실덤프 형태).
// barvlDt 는 어댑터가 이미 숫자화한 값(number|null)으로 온다.
const rawArrival = (over: Partial<RawSubwayArrival> = {}): RawSubwayArrival => ({
  subwayId: '1002',
  updnLine: '외선',
  trainLineNm: '성수행 - 역삼방면',
  statnFid: null,
  statnTid: null,
  statnId: '1002000222',
  statnNm: '강남',
  trnsitCo: null,
  subwayList: '1002',
  statnList: '1002000222',
  btrainSttus: '일반',
  barvlDt: 90,
  btrainNo: '2293',
  bstatnId: null,
  bstatnNm: '성수',
  recptnDt: '2026-07-06 16:01:37',
  arvlMsg2: '전역 도착',
  arvlMsg3: '교대',
  arvlCd: '5',
  lstcarAt: '0',
  ...over,
});

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
  // fetchedAt 산출용 적재 이력 1건 — 테스트 종료 시 정리.
  await app.prisma.subwayMasterSync.create({
    data: { source: 'subwayStationMaster', count: 0 },
  });
});

afterAll(async () => {
  // 노선 순서 시드 정리 — stationId 에 prefix 포함(실적재 행은 미포함이라 안전).
  await app.prisma.subwayLineStation.deleteMany({
    where: { stationId: { contains: NAME_PREFIX } },
  });
  // contains — 정렬 테스트의 '뒤…' 접두어 케이스도 잡는다(startsWith 로는 누락).
  await app.prisma.subwayStation.deleteMany({ where: { name: { contains: NAME_PREFIX } } });
  await app.prisma.subwayMasterSync.deleteMany({ where: { count: 0 } });
  await app.close();
});

beforeEach(() => {
  mocks.getRealtimeArrivals.mockReset();
});

describe('GET /api/v1/subway/stations/search — 입력 검증', () => {
  it('빈 q → 400 (zod 길이 검증)', async () => {
    const res = await app.inject({ url: '/api/v1/subway/stations/search?q=' });
    expect(res.statusCode).toBe(400);
  });

  it('51자 q → 400', async () => {
    const res = await app.inject({ url: searchUrl('가'.repeat(51)) });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/subway/stations/search — 검색/그룹핑', () => {
  it('검색 성공 봉투 (source:db, fetchedAt ISO)', async () => {
    const name = `${NAME_PREFIX}봉투${stamp()}`;
    await seed(app, [{ lineId: '1002', name, lat: 37.4979, lng: 127.0276 }]);

    const res = await app.inject({ url: searchUrl(name) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SubwayStationSearchResultType;
    expect(body.source).toBe('db');
    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.name).toBe(name);
    expect(body.items[0]?.lines).toHaveLength(1);
    expect(body.items[0]?.lines[0]?.lineId).toBe('1002');
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false);
  });

  it('환승 그룹 — 같은 name 근접 2행 → 1그룹, lines lineId 오름차순, 대표좌표 평균', async () => {
    const name = `${NAME_PREFIX}환승${stamp()}`;
    // 근접(같은 좌표대) 2호선 + 1호선 — lineId 는 1001 < 1002.
    await seed(app, [
      { lineId: '1002', name, lat: 37.5, lng: 127.02 },
      { lineId: '1001', name, lat: 37.5002, lng: 127.0202 },
    ]);

    const res = await app.inject({ url: searchUrl(name) });
    const body = res.json() as SubwayStationSearchResultType;
    expect(body.total).toBe(1);
    const group = body.items[0]!;
    expect(group.lines).toHaveLength(2);
    // lineId 오름차순.
    expect(group.lines.map((l) => l.lineId)).toEqual(['1001', '1002']);
    // 그룹 id = lines[0].stationId = `1001:${name}`.
    expect(group.id).toBe(`1001:${name}`);
    // 대표 좌표 = 평균.
    expect(group.lat).toBeCloseTo((37.5 + 37.5002) / 2, 5);
    expect(group.lng).toBeCloseTo((127.02 + 127.0202) / 2, 5);
  });

  it('동명이역 분리 — 같은 name 30km 격리 2행 → 2그룹', async () => {
    const name = `${NAME_PREFIX}동명${stamp()}`;
    // 경도 0.4° ≈ 35km 격리 — 1km 임계 넘어 별개 그룹.
    await seed(app, [
      { lineId: '1005', name, lat: 37.5, lng: 127.0 },
      { lineId: '1063', name, lat: 37.5, lng: 127.4 },
    ]);

    const res = await app.inject({ url: searchUrl(name) });
    const body = res.json() as SubwayStationSearchResultType;
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);
    // 각 그룹은 단일 호선.
    expect(body.items.every((g) => g.lines.length === 1)).toBe(true);
  });

  it('전방일치 그룹 우선 정렬', async () => {
    const key = `${NAME_PREFIX}정렬${stamp()}`;
    const prefixName = `${key}앞`; // key 로 시작
    const containName = `뒤${key}`; // key 를 포함하지만 앞에 접두어
    await seed(app, [
      { lineId: '1002', name: containName, lat: 37.5, lng: 127.0 },
      { lineId: '1002', name: prefixName, lat: 37.6, lng: 127.1 },
    ]);

    const res = await app.inject({ url: searchUrl(key) });
    const body = res.json() as SubwayStationSearchResultType;
    expect(body.total).toBe(2);
    // 전방일치(prefixName)가 먼저.
    expect(body.items[0]?.name).toBe(prefixName);
    expect(body.items[1]?.name).toBe(containName);
  });

  it('31그룹 → 30 절단, total 은 절단 전', async () => {
    const key = `${NAME_PREFIX}절단${stamp()}`;
    const rows: SeedRow[] = [];
    for (let i = 0; i < 31; i++) {
      // 두 자리로 맞춰 name 길이 동일 — 정렬은 name 사전순으로 안정.
      rows.push({ lineId: '1002', name: `${key}${String(i).padStart(2, '0')}`, lat: 37.5, lng: 127.0 });
    }
    await seed(app, rows);

    const res = await app.inject({ url: searchUrl(key) });
    const body = res.json() as SubwayStationSearchResultType;
    expect(body.total).toBe(31);
    expect(body.items).toHaveLength(30);
  });
});

describe('GET /api/v1/subway/stations/:stationId/arrivals — 라우트', () => {
  it('① 없는 stationId → 404', async () => {
    const res = await app.inject({ url: arrivalsUrl(`1002:${NAME_PREFIX}없음${stamp()}`) });
    expect(res.statusCode).toBe(404);
    expect(mocks.getRealtimeArrivals).not.toHaveBeenCalled();
  });

  it('② 환승 그룹 정상 — lines/정렬/normalize(arrivalSec·isLastTrain·receivedAt ISO)', async () => {
    const name = `${NAME_PREFIX}도착${stamp()}`;
    await seed(app, [
      { lineId: '1002', name, lat: 37.5, lng: 127.0 },
      { lineId: '1063', name, lat: 37.5003, lng: 127.0003 },
    ]);
    mocks.getRealtimeArrivals.mockResolvedValue([
      rawArrival({ subwayId: '1002', barvlDt: 90, lstcarAt: '1', arvlCd: '5' }),
      rawArrival({
        subwayId: '1063',
        barvlDt: 30,
        arvlCd: '1',
        bstatnNm: '문산',
        recptnDt: '2026-07-06 16:00:00',
      }),
    ]);
    const res = await app.inject({ url: arrivalsUrl(`1002:${name}`) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SubwayArrivalsResultType;
    expect(body.stationId).toBe(`1002:${name}`);
    expect(body.name).toBe(name);
    expect(body.lines).toEqual(['1002', '1063']);
    // barvlDt 오름차순 — 30(1063) 먼저.
    expect(body.items.map((i) => i.lineId)).toEqual(['1063', '1002']);
    const first = body.items[0]!;
    expect(first.arrivalSec).toBe(30);
    expect(first.destination).toBe('문산');
    // KST 16:00:00 → UTC 07:00:00Z.
    expect(first.receivedAt).toBe('2026-07-06T07:00:00.000Z');
    const second = body.items[1]!;
    expect(second.arrivalSec).toBe(90);
    expect(second.isLastTrain).toBe(true); // lstcarAt '1'
    expect(second.updnLine).toBe('외선');
  });

  it('③ 동명이역 필터 — 그룹 밖 subwayId 제거', async () => {
    const name = `${NAME_PREFIX}필터${stamp()}`;
    await seed(app, [{ lineId: '1005', name, lat: 37.5, lng: 127.0 }]);
    mocks.getRealtimeArrivals.mockResolvedValue([
      rawArrival({ subwayId: '1005', statnId: '1005000001' }),
      rawArrival({ subwayId: '1063', statnId: '1063000001' }), // 다른 물리역 오염
    ]);
    const res = await app.inject({ url: arrivalsUrl(`1005:${name}`) });
    const body = res.json() as SubwayArrivalsResultType;
    expect(body.lines).toEqual(['1005']);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.lineId).toBe('1005');
  });

  it('④ 유니크 조회명 2개 — 각 이름으로 호출 + 합본', async () => {
    const name = `${NAME_PREFIX}신촌${stamp()}`;
    const rtName = `${name}(경의중앙선)`;
    await seed(app, [
      { lineId: '1002', name, lat: 37.5, lng: 127.0 },
      { lineId: '1063', name, lat: 37.5004, lng: 127.0004, realtimeName: rtName },
    ]);
    mocks.getRealtimeArrivals.mockImplementation(async (qn: string) => {
      if (qn === name) return [rawArrival({ subwayId: '1002', statnId: '1002a' })];
      if (qn === rtName) return [rawArrival({ subwayId: '1063', statnId: '1063a' })];
      return [];
    });
    const res = await app.inject({ url: arrivalsUrl(`1002:${name}`) });
    const body = res.json() as SubwayArrivalsResultType;
    expect(mocks.getRealtimeArrivals).toHaveBeenCalledTimes(2);
    const calledNames = mocks.getRealtimeArrivals.mock.calls.map((c) => c[0] as string).sort();
    expect(calledNames).toEqual([name, rtName].sort());
    expect(body.items.map((i) => i.lineId).sort()).toEqual(['1002', '1063']);
  });

  it('⑨ INFO-200(빈 배열) → items [] 200', async () => {
    const name = `${NAME_PREFIX}빈결과${stamp()}`;
    await seed(app, [{ lineId: '1002', name, lat: 37.5, lng: 127.0 }]);
    mocks.getRealtimeArrivals.mockResolvedValue([]);
    const res = await app.inject({ url: arrivalsUrl(`1002:${name}`) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SubwayArrivalsResultType;
    expect(body.items).toEqual([]);
    expect(body.lines).toEqual(['1002']);
  });
});

describe('SubwayService — 실시간 인프라 (직접 주입)', () => {
  it('⑤ 마이크로 캐시 — TTL 내 2회 1콜, 만료 후 재조회', async () => {
    const name = `${NAME_PREFIX}캐시${stamp()}`;
    await seed(app, [{ lineId: '1002', name, lat: 37.5, lng: 127.0 }]);
    const adapter = {
      getRealtimeArrivals: vi.fn().mockResolvedValue([rawArrival({ subwayId: '1002' })]),
    };
    let nowMs = Date.now();
    const svc = new SubwayService({
      prisma: app.prisma,
      serviceKey: 'k',
      adapter,
      now: () => new Date(nowMs),
      microCacheTtlMs: 15_000,
    });
    const id = `1002:${name}`;
    await svc.getStationArrivals(id);
    await svc.getStationArrivals(id);
    expect(adapter.getRealtimeArrivals).toHaveBeenCalledTimes(1);
    nowMs += 16_000; // TTL 만료.
    await svc.getStationArrivals(id);
    expect(adapter.getRealtimeArrivals).toHaveBeenCalledTimes(2);
  });

  it('⑥ in-flight 합류 — 동시 2요청 업스트림 1콜', async () => {
    const name = `${NAME_PREFIX}인플라잇${stamp()}`;
    await seed(app, [{ lineId: '1002', name, lat: 37.5, lng: 127.0 }]);
    const adapter = {
      getRealtimeArrivals: vi.fn(
        () =>
          new Promise<RawSubwayArrival[]>((resolve) =>
            setTimeout(() => resolve([rawArrival({ subwayId: '1002' })]), 50),
          ),
      ),
    };
    const svc = new SubwayService({ prisma: app.prisma, serviceKey: 'k', adapter });
    const id = `1002:${name}`;
    const [a, b] = await Promise.all([
      svc.getStationArrivals(id),
      svc.getStationArrivals(id),
    ]);
    expect(adapter.getRealtimeArrivals).toHaveBeenCalledTimes(1);
    expect(a.items).toHaveLength(1);
    expect(b.items).toHaveLength(1);
  });

  it('⑦ 쿼터 소진 → 503 (캐시 미스 신규 조회명, 업스트림 미호출)', async () => {
    const nameA = `${NAME_PREFIX}쿼터가${stamp()}`;
    const nameB = `${NAME_PREFIX}쿼터나${stamp()}`;
    await seed(app, [
      { lineId: '1002', name: nameA, lat: 37.5, lng: 127.0 },
      { lineId: '1002', name: nameB, lat: 37.6, lng: 127.1 },
    ]);
    const adapter = {
      getRealtimeArrivals: vi.fn().mockResolvedValue([rawArrival({ subwayId: '1002' })]),
    };
    const svc = new SubwayService({ prisma: app.prisma, serviceKey: 'k', adapter, dailyLimit: 1 });
    await svc.getStationArrivals(`1002:${nameA}`); // 쿼터 1 소비
    await expect(svc.getStationArrivals(`1002:${nameB}`)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(adapter.getRealtimeArrivals).toHaveBeenCalledTimes(1);
  });

  it('⑧ serviceKey 빈 값 → 503 (역 조회 전, 업스트림 미호출)', async () => {
    const adapter = { getRealtimeArrivals: vi.fn() };
    const svc = new SubwayService({ prisma: app.prisma, serviceKey: '', adapter });
    await expect(svc.getStationArrivals('1002:아무거나')).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(adapter.getRealtimeArrivals).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/subway/stations/nearby — 주변 역', () => {
  // 시드 좌표는 서남해 앞바다(실 지하철 없음)라 박스가 테스트 시드만 잡는다.
  // 각 테스트 base 를 0.3° 이상 벌려 박스가 겹치지 않게 격리한다.
  it('① 범위 밖 입력 → 400 (radius 3001 / lat 40)', async () => {
    const over = await app.inject({ url: nearbyUrl(34.0, 125.0, 3001) });
    expect(over.statusCode).toBe(400);
    const badLat = await app.inject({ url: nearbyUrl(40.0, 125.0, 1500) });
    expect(badLat.statusCode).toBe(400);
  });

  it('② 반경 내/외 필터 + dist asc + dist 값 (대표 좌표가 박스 안이어도 반경 밖이면 제외)', async () => {
    const bLat = 34.0;
    const bLng = 125.0;
    const tag = `${NAME_PREFIX}근처${stamp()}`;
    await seed(app, [
      { lineId: '1002', name: `${tag}A`, lat: bLat, lng: bLng }, // dist 0
      { lineId: '1002', name: `${tag}B`, lat: offsetLat(bLat, 500), lng: bLng }, // dist ~500
      // 박스 안(각 축 1200<1500)이나 대각 dist ~1697 > 1500 → 반경 필터로 제외.
      {
        lineId: '1002',
        name: `${tag}D`,
        lat: offsetLat(bLat, 1200),
        lng: offsetLng(bLat, bLng, 1200),
      },
    ]);

    const res = await app.inject({ url: nearbyUrl(bLat, bLng, 1500) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SubwayNearbyResultType;
    expect(body.source).toBe('db');
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);
    // dist 오름차순.
    expect(body.items[0]!.dist).toBeLessThanOrEqual(body.items[1]!.dist);
    expect(body.items[0]!.dist).toBe(0);
    expect(body.items[1]!.dist).toBeGreaterThanOrEqual(498);
    expect(body.items[1]!.dist).toBeLessThanOrEqual(502);
    // 반경 밖(D)은 없다.
    expect(body.items.every((g) => g.dist <= 1500)).toBe(true);
  });

  it('③ 환승 그룹 — dist 는 대표(평균) 좌표 기준', async () => {
    const bLat = 34.3;
    const bLng = 125.0;
    const name = `${NAME_PREFIX}주변환승${stamp()}`;
    // 같은 name 근접 2행(500m·600m) → 1그룹, 대표 좌표 = 평균(550m 지점).
    await seed(app, [
      { lineId: '1063', name, lat: offsetLat(bLat, 500), lng: bLng },
      { lineId: '1002', name, lat: offsetLat(bLat, 600), lng: bLng },
    ]);

    const res = await app.inject({ url: nearbyUrl(bLat, bLng, 1500) });
    const body = res.json() as SubwayNearbyResultType;
    expect(body.total).toBe(1);
    const group = body.items[0]!;
    expect(group.lines.map((l) => l.lineId)).toEqual(['1002', '1063']);
    // 500 도 600 도 아닌 평균 550 — 대표 좌표 기준임을 증명.
    expect(group.dist).toBeGreaterThanOrEqual(548);
    expect(group.dist).toBeLessThanOrEqual(552);
  });

  it('④ 31그룹 → 30 절단, total 은 절단 전', async () => {
    const bLat = 34.6;
    const bLng = 125.0;
    const key = `${NAME_PREFIX}주변절단${stamp()}`;
    const rows: SeedRow[] = [];
    for (let i = 0; i < 31; i++) {
      // 모두 base 근처(≤155m)라 반경 내, 이름이 달라 31개 별개 그룹.
      rows.push({
        lineId: '1002',
        name: `${key}${String(i).padStart(2, '0')}`,
        lat: offsetLat(bLat, i * 5),
        lng: bLng,
      });
    }
    await seed(app, rows);

    const res = await app.inject({ url: nearbyUrl(bLat, bLng, 1500) });
    const body = res.json() as SubwayNearbyResultType;
    expect(body.total).toBe(31);
    expect(body.items).toHaveLength(30);
  });

  it('⑤ 전체 마스터 0행이면 503 (prisma mock)', async () => {
    const mockPrisma = {
      subwayStation: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      subwayMasterSync: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const svc = new SubwayService({ prisma: mockPrisma });
    await expect(svc.getNearbyStations(37.5, 127.0, 1500)).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});

describe('GET /api/v1/subway/lines/:lineId/detail — 노선 상세', () => {
  // 가짜 노선 '9002'(4자리, 실데이터 없음)로 조립을 검증. 실데이터 스모크는 1002.
  const FAKE = '9002';

  it('시드 — sections 조립·seq 정렬·지선 분리·isTransfer', async () => {
    // 크래시 잔여 대비 가짜 노선 순서 선제 정리(실 노선과 무관).
    await app.prisma.subwayLineStation.deleteMany({ where: { lineId: FAKE } });
    const L = `${NAME_PREFIX}노선${stamp()}`;
    await seed(app, [
      { lineId: FAKE, name: `${L}A`, lat: 37.5, lng: 127.0 },
      { lineId: FAKE, name: `${L}B`, lat: 37.5, lng: 127.0 },
      { lineId: FAKE, name: `${L}C`, lat: 37.5, lng: 127.0 },
      { lineId: FAKE, name: `${L}D`, lat: 37.5, lng: 127.0 },
      { lineId: FAKE, name: `${L}P`, lat: 37.5, lng: 127.0 },
      { lineId: FAKE, name: `${L}Q`, lat: 37.5, lng: 127.0 },
      // 환승 상대 — 같은 name(C) 다른 호선 근접 → 노선C 가 isTransfer.
      { lineId: '9003', name: `${L}C`, lat: 37.5001, lng: 127.0001 },
    ]);
    await seedLineStations(app, [
      // 삽입 순서를 섞어 seq 정렬을 검증.
      { lineId: FAKE, branchKey: 'main', branchName: null, seq: 2, stationId: `${FAKE}:${L}B` },
      { lineId: FAKE, branchKey: 'main', branchName: null, seq: 1, stationId: `${FAKE}:${L}A` },
      { lineId: FAKE, branchKey: 'main', branchName: null, seq: 4, stationId: `${FAKE}:${L}D` },
      { lineId: FAKE, branchKey: 'main', branchName: null, seq: 3, stationId: `${FAKE}:${L}C` },
      { lineId: FAKE, branchKey: 'testbr', branchName: '테스트지선', seq: 1, stationId: `${FAKE}:${L}P` },
      { lineId: FAKE, branchKey: 'testbr', branchName: '테스트지선', seq: 2, stationId: `${FAKE}:${L}Q` },
    ]);

    const res = await app.inject({ url: lineDetailUrl(FAKE) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SubwayLineDetailResultType;
    expect(body.source).toBe('db');
    expect(body.sections).toHaveLength(2);

    const main = body.sections.find((s) => s.branchKey === 'main')!;
    expect(main.branchName).toBeNull();
    expect(main.isLoop).toBe(false); // 9002:main 은 LOOP_SECTIONS 아님
    expect(main.stations.map((x) => x.seq)).toEqual([1, 2, 3, 4]);
    expect(main.stations.map((x) => x.name)).toEqual([`${L}A`, `${L}B`, `${L}C`, `${L}D`]);
    // 노선C 만 환승.
    expect(main.stations.find((x) => x.name === `${L}C`)?.isTransfer).toBe(true);
    expect(main.stations.find((x) => x.name === `${L}A`)?.isTransfer).toBe(false);

    const branch = body.sections.find((s) => s.branchKey === 'testbr')!;
    expect(branch.branchName).toBe('테스트지선');
    expect(branch.stations.map((x) => x.name)).toEqual([`${L}P`, `${L}Q`]);

    // main 이 sections[0] (본선 우선).
    expect(body.sections[0]?.branchKey).toBe('main');
  });

  it('순서 데이터 없는 lineId → 404', async () => {
    const res = await app.inject({ url: lineDetailUrl('9998') });
    expect(res.statusCode).toBe(404);
  });

  it('실데이터 스모크 — 2호선(1002) 본선 순환 + 지선', async () => {
    const res = await app.inject({ url: lineDetailUrl('1002') });
    if (res.statusCode === 404) {
      console.warn('[line detail] 1002 순서 미적재 — load:subway-line-orders 필요, skip');
      return;
    }
    expect(res.statusCode).toBe(200);
    const body = res.json() as SubwayLineDetailResultType;
    expect(body.lineName).toBe('2호선');
    // 본선 + 성수지선 + 신정지선 ≥ 3 section.
    expect(body.sections.length).toBeGreaterThanOrEqual(3);
    const main = body.sections.find((s) => s.branchKey === 'main')!;
    expect(main.isLoop).toBe(true); // 2호선 본선 순환
    expect(main.stations.some((x) => x.name === '강남')).toBe(true);
  });
});

describe('SubwayService — 마스터 미적재 503 (prisma mock 직접 주입)', () => {
  it('전체 마스터 0행이면 503', async () => {
    const mockPrisma = {
      subwayStation: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      subwayMasterSync: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;

    const svc = new SubwayService({ prisma: mockPrisma });
    await expect(svc.searchStations('강남')).rejects.toMatchObject({ statusCode: 503 });
  });
});
