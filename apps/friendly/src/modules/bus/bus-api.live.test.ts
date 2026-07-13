import { describe, expect, it } from 'vitest';
import {
  BusApiAuthError,
  BusApiError,
  getStationsByName,
  toLatLng,
  type RawBusStation,
} from './bus-api.adapter.js';

// 실 서울시 API 스모크 — BUS_API_KEY 가 설정된 환경에서만 1회 호출한다.
// 'test-bus-key' 는 bus.test.ts 가 심는 플레이스홀더 — 격리(isolate) 미사용
// 환경에서 새어 들어와도 실호출하지 않게 방어.
const KEY = process.env.BUS_API_KEY ?? '';
const runnable = KEY.length > 0 && KEY !== 'test-bus-key';

describe.skipIf(!runnable)('bus-api live smoke (BUS_API_KEY 필요)', () => {
  it(
    "getStationByName('강남') — 필드 존재 + 좌표 WGS84 범위",
    { timeout: 15_000 },
    async (ctx) => {
      let items: RawBusStation[];
      try {
        items = await getStationsByName('강남', { serviceKey: KEY });
      } catch (e) {
        // 키 미승인/동기화 지연은 코드 결함이 아니라 외부 상태 — skip.
        // cmmMsgHeader·ServiceResult headerCd=7 양쪽 모두 어댑터가
        // BusApiAuthError 로 분류한다.
        if (e instanceof BusApiAuthError) {
          console.warn(`[bus live] 키 인증 실패로 skip — ${e.message}`);
          ctx.skip();
          return;
        }
        // 업스트림 HTTP 5xx = 서울시 API 장애(2026-07-13 실관측 503) — 코드
        // 결함이 아닌 외부 상태라 skip. 지하철 live 스모크의 쿼터 초과 skip
        // (ERROR-337)과 동일 규율.
        if (e instanceof BusApiError && /bus api status 5\d\d/.test(e.message)) {
          console.warn(`[bus live] 업스트림 장애로 skip — ${e.message}`);
          ctx.skip();
          return;
        }
        throw e;
      }
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.stId.length).toBeGreaterThan(0);
        expect(item.stNm.length).toBeGreaterThan(0);
      }
      const coords = items
        .map(toLatLng)
        .filter((c): c is { lat: number; lng: number } => c !== null);
      // 전부 null 이면 TM 좌표만 내려온다는 뜻 — proj4 변환 도입 필요 신호.
      expect(coords.length).toBeGreaterThan(0);
      for (const c of coords) {
        expect(c.lat).toBeGreaterThanOrEqual(33);
        expect(c.lat).toBeLessThanOrEqual(39);
        expect(c.lng).toBeGreaterThanOrEqual(124);
        expect(c.lng).toBeLessThanOrEqual(132);
      }
    },
  );
});
