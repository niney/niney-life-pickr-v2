import { describe, expect, it } from 'vitest';
import {
  formatCountdown,
  formatDistanceM,
  formatRelativeMin,
  formatRelativeSec,
  remainSecSince,
} from './format.js';
import { parseLatLngParam } from './geo.js';
import { isBusArrivalImminent, parseBusArrivalSec } from './busArrival.js';

describe('formatDistanceM', () => {
  it('1km 미만은 정수 m', () => {
    expect(formatDistanceM(0)).toBe('0m');
    expect(formatDistanceM(350)).toBe('350m');
    expect(formatDistanceM(999)).toBe('999m');
  });

  it('1km 이상은 소수 1자리 km', () => {
    expect(formatDistanceM(1000)).toBe('1.0km');
    expect(formatDistanceM(1250)).toBe('1.3km');
  });
});

describe('formatRelativeMin', () => {
  const base = Date.parse('2026-07-13T12:00:00Z');
  const at = (iso: string) => formatRelativeMin(iso, base);

  it('1분 미만은 방금 전', () => {
    expect(at('2026-07-13T11:59:30Z')).toBe('방금 전');
  });

  it('분 → 시간 → 일 티어', () => {
    expect(at('2026-07-13T11:15:00Z')).toBe('45분 전');
    expect(at('2026-07-13T09:00:00Z')).toBe('3시간 전');
    expect(at('2026-07-11T12:00:00Z')).toBe('2일 전');
  });
});

describe('formatRelativeSec', () => {
  const base = Date.parse('2026-07-13T12:00:00Z');
  const at = (iso: string) => formatRelativeSec(iso, base);

  it('10초 미만은 방금 전 (미래 시각도 0으로 클램프)', () => {
    expect(at('2026-07-13T11:59:55Z')).toBe('방금 전');
    expect(at('2026-07-13T12:00:10Z')).toBe('방금 전');
  });

  it('초 → 분 → 시간 티어', () => {
    expect(at('2026-07-13T11:59:20Z')).toBe('40초 전');
    expect(at('2026-07-13T11:57:00Z')).toBe('3분 전');
    expect(at('2026-07-13T10:00:00Z')).toBe('2시간 전');
  });
});

describe('parseLatLngParam', () => {
  it('정상 좌표 파싱', () => {
    expect(parseLatLngParam('37.5663,126.9779')).toEqual({ lat: 37.5663, lng: 126.9779 });
  });

  it('형식 불량·범위 밖은 null', () => {
    expect(parseLatLngParam(null)).toBeNull();
    expect(parseLatLngParam('')).toBeNull();
    expect(parseLatLngParam('abc,def')).toBeNull();
    expect(parseLatLngParam('37.5663')).toBeNull();
    expect(parseLatLngParam('50,127')).toBeNull(); // lat 범위 밖
    expect(parseLatLngParam('37,120')).toBeNull(); // lng 범위 밖
  });
});

describe('isBusArrivalImminent', () => {
  it('"곧 도착" 포함이면 true', () => {
    expect(isBusArrivalImminent('곧 도착')).toBe(true);
  });

  it('그 외·null·undefined 는 false', () => {
    expect(isBusArrivalImminent('3분 후 [2번째 전]')).toBe(false);
    expect(isBusArrivalImminent(null)).toBe(false);
    expect(isBusArrivalImminent(undefined)).toBe(false);
  });
});

describe('remainSecSince — 발신 시각 기준 잔여초 보정', () => {
  const t0 = Date.parse('2026-07-25T09:00:00.000Z');

  it('발신 후 흐른 만큼 깎는다', () => {
    expect(remainSecSince(180, '2026-07-25T09:00:00.000Z', t0 + 20_000)).toBe(160);
  });

  it('발신 시각이 없으면 원본 그대로', () => {
    expect(remainSecSince(180, null, t0)).toBe(180);
  });

  it('0·null 은 카운트다운이 아니라 상태 국면 — null', () => {
    expect(remainSecSince(0, '2026-07-25T09:00:00.000Z', t0)).toBeNull();
    expect(remainSecSince(null, '2026-07-25T09:00:00.000Z', t0)).toBeNull();
  });
});

describe('formatCountdown — 잔여초 표기', () => {
  it('분이 0이면 초만', () => {
    expect(formatCountdown(45)).toBe('45초');
  });

  it('분·초 병기', () => {
    expect(formatCountdown(185)).toBe('3분 5초');
  });

  it('음수는 0초로 클램프(보정이 과했을 때)', () => {
    expect(formatCountdown(-3)).toBe('0초');
  });
});

describe('parseBusArrivalSec — 도착 메시지 → 잔여초 근사', () => {
  it("'곧 도착'은 0", () => {
    expect(parseBusArrivalSec('곧 도착')).toBe(0);
  });

  it("'N분후[M번째 전]'은 분 → 초", () => {
    expect(parseBusArrivalSec('3분후[2번째 전]')).toBe(180);
    expect(parseBusArrivalSec('12분후[4번째 전]')).toBe(720);
  });

  it('운행종료·출발대기·빈 값은 null', () => {
    expect(parseBusArrivalSec('운행종료')).toBeNull();
    expect(parseBusArrivalSec('출발대기')).toBeNull();
    expect(parseBusArrivalSec(null)).toBeNull();
    expect(parseBusArrivalSec('')).toBeNull();
  });
});
