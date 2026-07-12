import { describe, expect, it } from 'vitest';
import { formatDistanceM, formatRelativeMin, formatRelativeSec } from './format.js';
import { parseLatLngParam } from './geo.js';
import { isBusArrivalImminent } from './busArrival.js';

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
