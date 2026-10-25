import { describe, expect, it } from 'vitest';
import {
  estimateTopTemp,
  hikingCautions,
  hikingDaylight,
  hikingFireInWindow,
  hikingFireLevel,
  summarizeHikingWeather,
  windChillC,
  type HikingHourLike,
} from './hikingConditions.js';

const at = (hh: number) => `2026-10-25T${String(hh).padStart(2, '0')}:00:00+09:00`;
const ms = (hh: number, mm = 0) => Date.parse(`2026-10-25T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`);
const hour = (hh: number, p: Partial<HikingHourLike> = {}): HikingHourLike => ({
  at: at(hh),
  tmp: 10,
  topTmp: 4,
  sky: 1,
  pty: 0,
  pop: 0,
  wsd: 2,
  ...p,
});

describe('estimateTopTemp · windChillC', () => {
  it('100m 마다 0.6°C — 들머리보다 낮거나 고도를 모르면 그대로', () => {
    expect(estimateTopTemp(12, 300, 1_300)).toBe(6);
    expect(estimateTopTemp(12, 900, 600)).toBe(12);
    expect(estimateTopTemp(12, null, 1_300)).toBe(12);
    expect(estimateTopTemp(null, 300, 1_300)).toBeNull();
  });

  it('기상청 겨울철 체감온도 — 10°C 넘거나 바람이 약하면 기온 그대로', () => {
    // −5°C · 5m/s(18km/h) → 13.12 − 3.11 − 18.06 − 3.15 ≈ −11.2.
    expect(windChillC(-5, 5)).toBe(-11.2);
    expect(windChillC(15, 10)).toBe(15);
    expect(windChillC(0, 1)).toBe(0);
    expect(windChillC(0, null)).toBe(0);
  });
});

describe('summarizeHikingWeather', () => {
  const hours = [hour(8), hour(9, { pty: 1, pop: 70, wsd: 10, topTmp: -1, sky: 4 }), hour(10, { pty: 1, pop: 80 }), hour(11), hour(14, { tmp: 18 })];

  it('겹치는 칸만 접는다 — 09:30~11:30 은 9·10·11시', () => {
    const w = summarizeHikingWeather(hours, ms(9, 30), ms(11, 30))!;
    expect(w.hours).toBe(3);
    expect(w.popMax).toBe(80);
    expect(w.wetHours).toBe(2);
    expect(w.pty).toBe(1);
    expect(w.windMax).toBe(10);
    expect(w.topTmpMin).toBe(-1);
    expect(w.sky).toBe(4);
    expect(w.topChillMin).toBeLessThan(-1);
  });

  it('예보 범위 밖이면 null', () => {
    expect(summarizeHikingWeather(hours, ms(20), ms(22))).toBeNull();
  });
});

describe('산불위험', () => {
  it('면적이 있는 가장 높은 등급과 그 면적', () => {
    expect(hikingFireLevel({ d1: 100, d2: 0, d3: 0, d4: 0 })).toEqual({ level: 1, sharePct: 100 });
    expect(hikingFireLevel({ d1: 77, d2: 23, d3: 0, d4: 0 })).toEqual({ level: 2, sharePct: 23 });
    expect(hikingFireLevel({ d1: 50, d2: 30, d3: 15, d4: 5 })).toEqual({ level: 4, sharePct: 5 });
  });

  it('산행 시간대와 겹치는 3시간 칸 중 가장 높은 등급(시군구 여럿)', () => {
    const areas = [
      { name: '춘천시', slots: [{ at: at(6), d1: 100, d2: 0, d3: 0, d4: 0 }, { at: at(12), d1: 60, d2: 40, d3: 0, d4: 0 }] },
      { name: '홍천군', slots: [{ at: at(9), d1: 90, d2: 10, d3: 0, d4: 0 }, { at: at(15), d1: 0, d2: 0, d3: 100, d4: 0 }] },
    ];
    // 08~14시 → 06(08시 포함)·09·12 칸. 15시 칸은 밖.
    expect(hikingFireInWindow(areas, ms(8), ms(14))).toEqual({ level: 2, sharePct: 40, area: '춘천시', at: at(12) });
    expect(hikingFireInWindow(areas, ms(16), ms(17))?.level).toBe(3);
    expect(hikingFireInWindow(areas, ms(20), ms(21))).toBeNull();
  });
});

describe('hikingDaylight', () => {
  const sun = { sunrise: new Date(ms(6, 50)), sunset: new Date(ms(17, 40)) };

  it('여유 30분 넘으면 ok, 그 안이면 tight, 일몰 넘기면 dark — 늦어도 출발은 일몰 − 예상 − 30분', () => {
    const ok = hikingDaylight(new Date(ms(9)), 300, sun);
    expect(ok.status).toBe('ok');
    expect(ok.marginMin).toBe(220);
    expect(ok.latestStartAt!.getTime()).toBe(ms(12, 10));
    expect(hikingDaylight(new Date(ms(12, 30)), 300, sun).status).toBe('tight');
    const dark = hikingDaylight(new Date(ms(13)), 300, sun);
    expect(dark.status).toBe('dark');
    expect(dark.marginMin).toBe(-20);
  });

  it('해 뜨기 전 출발 표시, 일몰을 모르면 판단하지 않는다', () => {
    expect(hikingDaylight(new Date(ms(5)), 120, sun).beforeSunrise).toBe(true);
    const none = hikingDaylight(new Date(ms(9)), 120, { sunrise: null, sunset: null });
    expect(none.status).toBeNull();
    expect(none.latestStartAt).toBeNull();
  });
});

describe('hikingCautions', () => {
  it('어두워짐·비·바람·체감·산불·대기를 한 줄씩', () => {
    const sun = { sunrise: new Date(ms(6, 50)), sunset: new Date(ms(17, 40)) };
    const weather = summarizeHikingWeather(
      [hour(13, { pty: 1, pop: 80, wsd: 12, topTmp: -6 }), hour(14, { pty: 1, pop: 90, wsd: 12, topTmp: -6 })],
      ms(13),
      ms(15),
    );
    const out = hikingCautions({
      weather,
      fire: { level: 3, sharePct: 12, area: '춘천시', at: at(12) },
      airGrade: 3,
      daylight: hikingDaylight(new Date(ms(13)), 300, sun),
    });
    expect(out.map((c) => c.level)).toEqual(['warn', 'warn', 'warn', 'warn', 'warn', 'warn']);
    expect(out[0]!.text).toBe('해 지기 전에 내려오기 어렵습니다 — 12:10까지 출발하세요');
    expect(out[1]!.text).toBe('비 예보(2시간)');
    expect(out[2]!.text).toMatch(/^바람 12m\/s/);
    expect(out[3]!.text).toMatch(/^정상 체감 -1\d\.\d°C\(추정\)/);
    expect(out[4]!.text).toBe('산불위험 높음(춘천시 12%) — 입산 통제·화기 금지를 확인하세요');
    expect(out[5]!.text).toBe('미세먼지 나쁨');
  });

  it('맑고 여유 있으면 빈 목록, 다소높음·영하는 info', () => {
    const sun = { sunrise: new Date(ms(6, 50)), sunset: new Date(ms(17, 40)) };
    expect(
      hikingCautions({ weather: summarizeHikingWeather([hour(9)], ms(9), ms(10)), fire: null, airGrade: 1, daylight: hikingDaylight(new Date(ms(9)), 60, sun) }),
    ).toEqual([]);
    const out = hikingCautions({
      weather: summarizeHikingWeather([hour(9, { topTmp: -2, wsd: 1 })], ms(9), ms(10)),
      fire: { level: 2, sharePct: 23, area: '홍천군', at: at(9) },
      airGrade: null,
      daylight: null,
    });
    expect(out).toEqual([
      { level: 'info', text: '정상 영하(추정 -2°C) — 길이 얼 수 있습니다' },
      { level: 'info', text: '산불위험 다소높음(홍천군 23%) — 화기 금지' },
    ]);
  });
});
