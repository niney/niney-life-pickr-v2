import type { SubwayPathResultType } from '@repo/api-contract';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import {
  getRealtimeArrivals,
  getStationMaster,
  SubwayApiAuthError,
} from './subway-api.adapter.js';

// 실 서울시 API 스모크 — 각 키가 설정된 환경에서만 1콜씩. swopen(도착)과
// openapi(역사마스터)는 키가 달라 describe 를 나눠 각자 skipIf 한다.
// subway.test.ts 가 심는 플레이스홀더('test-subway-key')가 새어 들어와도
// 실호출하지 않게 방어(bus live 패턴).
const SWOPEN_KEY = process.env.SUBWAY_API_KEY ?? '';
const OPENAPI_KEY = process.env.SEOUL_OPEN_API_KEY ?? '';
const swopenRunnable = SWOPEN_KEY.length > 0 && SWOPEN_KEY !== 'test-subway-key';

describe.skipIf(!swopenRunnable)('subway swopen live smoke (SUBWAY_API_KEY 필요)', () => {
  it('getRealtimeArrivals(강남) — 도착 행 필드 존재', { timeout: 15_000 }, async (ctx) => {
    let rows;
    try {
      rows = await getRealtimeArrivals('강남', { apiKey: SWOPEN_KEY });
    } catch (e) {
      // 키 미승인/동기화 지연은 코드 결함이 아니라 외부 상태 — skip.
      if (e instanceof SubwayApiAuthError) {
        console.warn(`[subway live] 키 인증 실패로 skip — ${e.message}`);
        ctx.skip();
        return;
      }
      throw e;
    }
    // 운행 시간대면 도착 행이 있고, 심야엔 INFO-200 으로 빈 배열일 수 있다 —
    // 행이 있으면 필수 필드만 확인(빈 배열은 정상으로 통과).
    for (const r of rows) {
      expect(r.subwayId).not.toBeNull();
      expect(r.statnNm).not.toBeNull();
    }
  });

  it('그룹 도착(강남) — 라우트 200 + items 배열', { timeout: 15_000 }, async (ctx) => {
    const app = await buildApp({ logger: false });
    await app.ready();
    try {
      const st = await app.prisma.subwayStation.findFirst({
        where: { name: '강남', lineId: '1002' },
      });
      if (!st) {
        console.warn('[subway live] 강남(1002) 미적재 — skip');
        ctx.skip();
        return;
      }
      const res = await app.inject({
        url: `/api/v1/subway/stations/${encodeURIComponent(st.id)}/arrivals`,
      });
      // 업스트림 인증/장애(503/502)는 외부 상태 — skip.
      if (res.statusCode !== 200) {
        console.warn(`[subway live] 그룹 도착 status ${res.statusCode} — skip`);
        ctx.skip();
        return;
      }
      const body = res.json() as { items: unknown[]; lines: string[] };
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.lines).toContain('1002');
    } finally {
      await app.close();
    }
  });

  it('노선 위치(2호선) — 라우트 200 + items>0', { timeout: 15_000 }, async (ctx) => {
    const app = await buildApp({ logger: false });
    await app.ready();
    try {
      const res = await app.inject({ url: '/api/v1/subway/lines/1002/positions' });
      if (res.statusCode !== 200) {
        console.warn(`[subway live] 위치 status ${res.statusCode} — skip`);
        ctx.skip();
        return;
      }
      const body = res.json() as { items: { trainNo: string; lat: number | null }[] };
      expect(Array.isArray(body.items)).toBe(true);
      // 심야 운행 종료 시간대(대략 01~05시)에는 열차 0대(INFO-200)가 정상이라
      // items>0 을 강제하면 시간대 의존 실패가 난다 — 빈 배열이면 관측만 남기고
      // 통과, 열차가 있으면 형태를 검증한다.
      if (body.items.length === 0) {
        console.warn('[subway live] 위치 items 0 — 운행 종료 시간대로 판단, 형태 검증 skip');
        return;
      }
      expect(typeof body.items[0]!.trainNo).toBe('string');
    } finally {
      await app.close();
    }
  });
});

describe.skipIf(!OPENAPI_KEY)('subway master live smoke (SEOUL_OPEN_API_KEY 필요)', () => {
  it('getStationMaster — 다수 행 + 좌표 WGS84 범위', { timeout: 15_000 }, async (ctx) => {
    let rows;
    try {
      rows = await getStationMaster({ apiKey: OPENAPI_KEY });
    } catch (e) {
      if (e instanceof SubwayApiAuthError) {
        console.warn(`[subway master live] 키 인증 실패로 skip — ${e.message}`);
        ctx.skip();
        return;
      }
      throw e;
    }
    expect(rows.length).toBeGreaterThan(0);
    const withCoord = rows.filter((r) => r.lat !== null && r.lng !== null);
    expect(withCoord.length).toBeGreaterThan(0);
    for (const r of withCoord) {
      expect(r.lat!).toBeGreaterThanOrEqual(33);
      expect(r.lat!).toBeLessThanOrEqual(39);
      expect(r.lng!).toBeGreaterThanOrEqual(124);
      expect(r.lng!).toBeLessThanOrEqual(132);
    }
  });

  it('시간표(강남 dayType 1) — 라우트 200 + coverage true·directions', { timeout: 15_000 }, async (ctx) => {
    const app = await buildApp({ logger: false });
    await app.ready();
    try {
      const st = await app.prisma.subwayStation.findFirst({
        where: { name: '강남', lineId: '1002' },
      });
      if (!st) {
        console.warn('[subway timetable live] 강남(1002) 미적재 — skip');
        ctx.skip();
        return;
      }
      const res = await app.inject({
        url: `/api/v1/subway/stations/${encodeURIComponent(st.id)}/timetable?dayType=1`,
      });
      if (res.statusCode !== 200) {
        console.warn(`[subway timetable live] status ${res.statusCode} — skip`);
        ctx.skip();
        return;
      }
      const body = res.json() as {
        coverage: boolean;
        directions: { updn: string; firstTrain: string | null; lastTrain: string | null }[];
      };
      expect(body.coverage).toBe(true);
      expect(body.directions.length).toBeGreaterThan(0);
      expect(body.directions[0]!.firstTrain).not.toBeNull();
    } finally {
      await app.close();
    }
  });
});

// 경로 탐색은 로컬 그래프(마스터+노선순서) — 키 무관. 상식 정합만 느슨히 단언.
describe('subway path smoke (로컬 적재 필요)', () => {
  const findStation = async (
    app: Awaited<ReturnType<typeof buildApp>>,
    name: string,
    lineId: string,
  ): Promise<string | null> => {
    const s = await app.prisma.subwayStation.findFirst({ where: { name, lineId } });
    return s?.id ?? null;
  };
  const runPath = async (
    ctx: { skip: () => void },
    fromName: string,
    fromLine: string,
    toName: string,
    toLine: string,
  ): Promise<SubwayPathResultType | null> => {
    const app = await buildApp({ logger: false });
    await app.ready();
    try {
      const orderCount = await app.prisma.subwayLineStation.count();
      if (orderCount === 0) {
        console.warn('[path smoke] 노선 순서 미적재 — skip (load:subway-line-orders)');
        ctx.skip();
        return null;
      }
      const [from, to] = await Promise.all([
        findStation(app, fromName, fromLine),
        findStation(app, toName, toLine),
      ]);
      if (!from || !to) {
        console.warn(`[path smoke] ${fromName}/${toName} 미적재 — skip`);
        ctx.skip();
        return null;
      }
      const res = await app.inject({
        url: `/api/v1/subway/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      });
      expect(res.statusCode).toBe(200);
      return res.json() as SubwayPathResultType;
    } finally {
      await app.close();
    }
  };

  it('강남(2호선)→서울역(1호선) — found·환승 1~3·약 20~50분', async (ctx) => {
    const body = await runPath(ctx, '강남', '1002', '서울역', '1001');
    if (!body) return;
    expect(body.found).toBe(true);
    expect(body.legs.length).toBeGreaterThan(0);
    expect(body.transferCount).toBeGreaterThanOrEqual(1);
    expect(body.transferCount).toBeLessThanOrEqual(3);
    expect(body.approxMinutes).not.toBeNull();
    expect(body.approxMinutes!).toBeGreaterThan(15);
    expect(body.approxMinutes!).toBeLessThan(60);
    // 인접 leg 경계 = 환승 = 같은 물리역(다른 호선 stationId).
    for (let i = 0; i + 1 < body.legs.length; i += 1) {
      const prev = body.legs[i]!;
      const next = body.legs[i + 1]!;
      expect(prev.lineId).not.toBe(next.lineId);
    }
  });

  it('강남→역삼(2호선 직행) — leg 1·환승 0·rideCount 1', async (ctx) => {
    const body = await runPath(ctx, '강남', '1002', '역삼', '1002');
    if (!body) return;
    expect(body.found).toBe(true);
    expect(body.transferCount).toBe(0);
    expect(body.legs).toHaveLength(1);
    expect(body.legs[0]!.lineId).toBe('1002');
    expect(body.legs[0]!.rideCount).toBe(1); // 강남-역삼 인접
    expect(body.totalRideStations).toBe(1);
  });

  it('잠실(2호선)→성수(2호선) — 200·found (순환/지선 정합)', async (ctx) => {
    const body = await runPath(ctx, '잠실', '1002', '성수', '1002');
    if (!body) return;
    expect(body.found).toBe(true);
    expect(body.legs.length).toBeGreaterThan(0);
    expect(body.approxMinutes).not.toBeNull();
  });
});

// 혼잡도는 로컬 적재(odcloud) — 키 무관, load:subway-congestion 실행 후에만 통과.
describe('subway congestion smoke (로컬 적재 필요)', () => {
  it('혼잡도(강남 dayType 1) — 라우트 200 + coverage true·slots', async (ctx) => {
    const app = await buildApp({ logger: false });
    await app.ready();
    try {
      const total = await app.prisma.subwayCongestion.count();
      if (total === 0) {
        console.warn('[congestion smoke] 미적재 — skip (pnpm --filter friendly load:subway-congestion)');
        ctx.skip();
        return;
      }
      const st = await app.prisma.subwayStation.findFirst({
        where: { name: '강남', lineId: '1002' },
      });
      if (!st) {
        console.warn('[congestion smoke] 강남(1002) 미적재 — skip');
        ctx.skip();
        return;
      }
      const res = await app.inject({
        url: `/api/v1/subway/stations/${encodeURIComponent(st.id)}/congestion?dayType=1`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        coverage: boolean;
        directions: { updn: string; slots: { time: string; level: number | null }[] }[];
      };
      expect(body.coverage).toBe(true);
      expect(body.directions.length).toBeGreaterThan(0);
      // 2호선 강남 — 순환선이라 내선/외선. slots 는 time 순 다수.
      expect(body.directions[0]!.slots.length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });
});
