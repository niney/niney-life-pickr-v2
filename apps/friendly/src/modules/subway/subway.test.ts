import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SubwayStationSearchResultType } from '@repo/api-contract';
import { buildApp } from '../../app.js';
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
}
const seed = (app: FastifyInstance, rows: SeedRow[]) =>
  app.prisma.subwayStation.createMany({
    data: rows.map((r) => ({
      id: `${r.lineId}:${r.name}`,
      name: r.name,
      lineId: r.lineId,
      lineName: r.lineName ?? `${r.lineId}호선`,
      lat: r.lat,
      lng: r.lng,
    })),
  });

const searchUrl = (q: string): string =>
  `/api/v1/subway/stations/search?q=${encodeURIComponent(q)}`;

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
  // contains — 정렬 테스트의 '뒤…' 접두어 케이스도 잡는다(startsWith 로는 누락).
  await app.prisma.subwayStation.deleteMany({ where: { name: { contains: NAME_PREFIX } } });
  await app.prisma.subwayMasterSync.deleteMany({ where: { count: 0 } });
  await app.close();
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
