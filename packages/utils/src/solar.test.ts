import { describe, expect, it } from 'vitest';
import { sunTimes } from './solar.js';

// KST "HH:MM".
const kst = (d: Date | null): string | null => (d ? new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(11, 16) : null);
const minutes = (hm: string): number => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const near = (got: Date | null, want: string, tol = 2) => {
  const g = kst(got);
  expect(g).not.toBeNull();
  expect(Math.abs(minutes(g!) - minutes(want))).toBeLessThanOrEqual(tol);
};

describe('sunTimes', () => {
  it('서울 하지·동지 — 천문연 발표 시각과 2분 안', () => {
    // 천문연 서울(2024): 하지 05:11 / 19:57, 동지 07:43 / 17:17.
    const summer = sunTimes('2026-06-21', 37.5665, 126.978);
    near(summer.sunrise, '05:11');
    near(summer.sunset, '19:57');
    const winter = sunTimes('2026-12-22', 37.5665, 126.978);
    near(winter.sunrise, '07:43');
    near(winter.sunset, '17:17');
  });

  it('박명은 일출 전·일몰 뒤 반시간 안팎, 남쪽(제주)은 가을 해가 더 늦게 진다', () => {
    const s = sunTimes('2026-10-25', 37.5665, 126.978);
    const j = sunTimes('2026-10-25', 33.36, 126.53);
    const gap = (a: Date | null, b: Date | null) => (b!.getTime() - a!.getTime()) / 60_000;
    expect(gap(s.dawn, s.sunrise)).toBeGreaterThan(20);
    expect(gap(s.dawn, s.sunrise)).toBeLessThan(40);
    expect(gap(s.sunset, s.dusk)).toBeGreaterThan(20);
    expect(gap(s.sunset, s.dusk)).toBeLessThan(40);
    expect(j.sunset!.getTime()).toBeGreaterThan(s.sunset!.getTime());
  });

  it('날짜 형식이 틀리면 전부 null', () => {
    expect(sunTimes('2026/10/25', 37.5, 127)).toEqual({ dawn: null, sunrise: null, sunset: null, dusk: null });
  });
});
