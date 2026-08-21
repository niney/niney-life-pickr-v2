import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquirePosition } from './useUserLocation.js';

// 브라우저 geolocation 을 가짜로 세워 훅의 코어(acquirePosition)가 지키는 계약을 고정한다:
//  - 명시 요청은 TIMEOUT(3) 1회 재시도 후 성공하면 granted, 두 번 다 시간 초과면 'timeout'
//  - 자동 요청은 재시도 없음
//  - PERMISSION_DENIED(1) → denied, POSITION_UNAVAILABLE(2) → unavailable (재시도 없음)
//  - 옵션: enableHighAccuracy false, maximumAge 5분(측위 캐시 재사용), timeout 은 지정값
// 버스/지하철 페이지(직접 호출 10초)와 달리 공용 훅이 5초에 끊어 간헐적으로 실패하던
// 문제(2026-08-21)를 재발 방지한다.

type Success = (pos: { coords: { latitude: number; longitude: number } }) => void;
type Failure = (err: { code: number; message: string }) => void;

const installGeolocation = (
  script: Array<{ ok: true; lat: number; lng: number } | { ok: false; code: number }>,
) => {
  const calls: PositionOptions[] = [];
  let i = 0;
  const geolocation = {
    getCurrentPosition: (ok: Success, fail: Failure, opts?: PositionOptions) => {
      calls.push(opts ?? {});
      const step = script[Math.min(i, script.length - 1)]!;
      i += 1;
      queueMicrotask(() => {
        if (step.ok) ok({ coords: { latitude: step.lat, longitude: step.lng } });
        else fail({ code: step.code, message: `code ${step.code}` });
      });
    },
  };
  vi.stubGlobal('navigator', { geolocation });
  vi.stubGlobal('window', { isSecureContext: true });
  return calls;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('acquirePosition', () => {
  it('첫 시도 TIMEOUT → 명시 요청은 같은 옵션으로 1회 더 시도해 성공하면 granted', async () => {
    const calls = installGeolocation([{ ok: false, code: 3 }, { ok: true, lat: 37.57, lng: 127.0 }]);
    const result = await acquirePosition({ timeout: 10_000, maxTries: 2 });
    expect(result).toEqual({ status: 'granted', coords: { lat: 37.57, lng: 127.0 } });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 });
  });

  it('두 번 다 TIMEOUT 이면 timeout(unavailable 이 아님) — 화면이 "다시 시도"를 안내한다', async () => {
    const calls = installGeolocation([{ ok: false, code: 3 }]);
    const result = await acquirePosition({ timeout: 10_000, maxTries: 2 });
    expect(result).toEqual({ status: 'timeout' });
    expect(calls).toHaveLength(2);
  });

  it('자동 요청(maxTries 1)은 TIMEOUT 에 재시도하지 않는다', async () => {
    const calls = installGeolocation([{ ok: false, code: 3 }]);
    const result = await acquirePosition({ timeout: 5_000, maxTries: 1 });
    expect(result).toEqual({ status: 'timeout' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.timeout).toBe(5_000);
  });

  it('PERMISSION_DENIED(1) → denied, POSITION_UNAVAILABLE(2) → unavailable — 재시도 없음', async () => {
    const c1 = installGeolocation([{ ok: false, code: 1 }]);
    expect(await acquirePosition({ timeout: 10_000, maxTries: 2 })).toEqual({ status: 'denied' });
    expect(c1).toHaveLength(1);
    vi.unstubAllGlobals();
    const c2 = installGeolocation([{ ok: false, code: 2 }]);
    expect(await acquirePosition({ timeout: 10_000, maxTries: 2 })).toEqual({ status: 'unavailable' });
    expect(c2).toHaveLength(1);
  });

  it('isCancelled 가 true 를 돌려주면(언마운트/새 요청) 결과를 null 로 버린다', async () => {
    installGeolocation([{ ok: true, lat: 37.57, lng: 127.0 }]);
    const result = await acquirePosition({ timeout: 10_000, maxTries: 2, isCancelled: () => true });
    expect(result).toBeNull();
  });
});
