import { describe, expect, it } from 'vitest';
import {
  AirKoreaApiAuthError,
  AirKoreaApiError,
  getBadStations,
  getDustForecast,
  getSidoRealtime,
  getStationList,
} from './airkorea-api.adapter.js';

// 실 에어코리아 API 스모크 — 키가 있을 때만(AIRKOREA_API_KEY, 없으면 BUS_API_KEY:
// data.go.kr 계정 공용 키). 외부 상태(키 미승인·게이트웨이 504 연타·업스트림 지연)는
// 코드 결함이 아니므로 skip 으로 처리하고, 응답 형식 자체만 확인한다. 쿼터(일 500건)
// 를 아끼기 위해 3콜만 쓴다. 실측상 첫 호출이 10초를 넘기는 일이 잦아 타임아웃은
// caller 시그널로 25초를 준다.
const KEY = process.env.AIRKOREA_API_KEY || process.env.BUS_API_KEY || '';
const runnable = KEY.length > 0 && KEY !== 'test-air-key' && KEY !== 'test-bus-key';

const opts = () => ({ serviceKey: KEY, signal: AbortSignal.timeout(25_000) });

const todayKst = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const skipIfExternal = (e: unknown, ctx: { skip: () => void }): boolean => {
  if (e instanceof AirKoreaApiAuthError) {
    console.warn(`[airkorea live] 키 미승인/권한 이슈 — skip: ${e.message}`);
    ctx.skip();
    return true;
  }
  if (
    e instanceof AirKoreaApiError &&
    (e.code === '05' ||
      e.code === '04' ||
      /5\d\d|fetch 실패|aborted|본문 읽기 실패|파싱 실패/.test(e.message))
  ) {
    console.warn(`[airkorea live] 게이트웨이/네트워크 불안정 — skip: ${e.message}`);
    ctx.skip();
    return true;
  }
  return false;
};

describe.skipIf(!runnable)('airkorea live smoke (AIRKOREA_API_KEY 또는 BUS_API_KEY 필요)', () => {
  it('getBadStations — 배열, 각 행에 stationName/addr', { timeout: 30_000 }, async (ctx) => {
    let rows;
    try {
      rows = await getBadStations(opts());
    } catch (e) {
      if (skipIfExternal(e, ctx)) return;
      throw e;
    }
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) {
      expect(typeof r.stationName).toBe('string');
      expect(typeof r.addr).toBe('string');
    }
  });

  it("getSidoRealtime('서울') — 측정소 행 + 문자열 측정값", { timeout: 30_000 }, async (ctx) => {
    let rows;
    try {
      rows = (await getSidoRealtime('서울', opts())).rows;
    } catch (e) {
      if (skipIfExternal(e, ctx)) return;
      throw e;
    }
    expect(rows.length).toBeGreaterThan(0);
    const r = rows[0]!;
    expect(r.stationName).toBeTruthy();
    expect(r.sidoName).toContain('서울');
    expect(r.dataTime === null || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(r.dataTime)).toBe(true);
  });

  // 측정소정보 API(15073877) — 활용신청 전이면 인증 30 으로 skip(안내 출력). 승인 후엔
  // dmX/dmY 가 WGS84 위·경도 범위에 들어오는지 본다(서비스 정규화의 전제).
  it('getStationList — 좌표가 WGS84 범위(위도 33~39 / 경도 124~132)', { timeout: 30_000 }, async (ctx) => {
    let rows;
    try {
      rows = (await getStationList(opts())).rows;
    } catch (e) {
      if (e instanceof AirKoreaApiAuthError) {
        console.warn(
          '[airkorea live] 측정소정보 API 미승인 — data.go.kr 15073877 활용신청 필요(같은 계정 키). skip.',
        );
        ctx.skip();
        return;
      }
      if (skipIfExternal(e, ctx)) return;
      throw e;
    }
    expect(rows.length).toBeGreaterThan(100);
    const withCoords = rows.filter((r) => r.dmX && r.dmY && r.dmX !== '-' && r.dmY !== '-');
    expect(withCoords.length).toBeGreaterThan(0);
    for (const r of withCoords.slice(0, 50)) {
      const x = Number(r.dmX);
      const y = Number(r.dmY);
      const latLng = x >= 33 && x <= 39 && y >= 124 && y <= 132;
      const lngLat = y >= 33 && y <= 39 && x >= 124 && x <= 132;
      expect(latLng || lngLat).toBe(true);
    }
  });

  it('getDustForecast(오늘) — 0건 이상, 코드는 PM10/PM25/O3', { timeout: 30_000 }, async (ctx) => {
    let rows;
    try {
      rows = await getDustForecast(todayKst(), opts());
    } catch (e) {
      if (skipIfExternal(e, ctx)) return;
      throw e;
    }
    for (const r of rows) {
      expect(['PM10', 'PM25', 'O3']).toContain(r.informCode);
      expect(r.informData).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
