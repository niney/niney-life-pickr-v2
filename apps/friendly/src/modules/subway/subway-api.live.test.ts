import { describe, expect, it } from 'vitest';
import {
  getRealtimeArrivals,
  getStationMaster,
  SubwayApiAuthError,
} from './subway-api.adapter.js';

// 실 서울시 API 스모크 — 각 키가 설정된 환경에서만 1콜씩. swopen(도착)과
// openapi(역사마스터)는 키가 달라 describe 를 나눠 각자 skipIf 한다.
const SWOPEN_KEY = process.env.SUBWAY_API_KEY ?? '';
const OPENAPI_KEY = process.env.SEOUL_OPEN_API_KEY ?? '';

describe.skipIf(!SWOPEN_KEY)('subway swopen live smoke (SUBWAY_API_KEY 필요)', () => {
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
});
