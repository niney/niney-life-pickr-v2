import { describe, expect, it } from 'vitest';
import {
  SEA_TIDE_STATIONS,
  isSeaRipSeason,
  matchSeaRipBeach,
  nearestSeaTideStation,
  seaActivityHasPeriod,
  seaIndexColor,
  seaIndexLevelOf,
  seaRipLevelOf,
  seaTideKindOf,
} from './sea.js';

describe('seaIndexLevelOf', () => {
  it('원문 5단계·체험불가, 공백 무시, 모르는 값은 null', () => {
    expect(seaIndexLevelOf('매우좋음')).toBe(5);
    expect(seaIndexLevelOf('매우 나쁨')).toBe(1);
    expect(seaIndexLevelOf('보통')).toBe(3);
    expect(seaIndexLevelOf('체험불가')).toBe(0);
    expect(seaIndexLevelOf('')).toBeNull();
    expect(seaIndexLevelOf(null)).toBeNull();
    expect(seaIndexColor(null)).toBe('#9ca3af');
  });
});

describe('이안류·조석 코드', () => {
  it('이안류 4단계와 6~9월 제공 기간', () => {
    expect(seaRipLevelOf('경계')).toBe(3);
    expect(seaRipLevelOf('없음')).toBeNull();
    expect(isSeaRipSeason(6)).toBe(true);
    expect(isSeaRipSeason(9)).toBe(true);
    expect(isSeaRipSeason(10)).toBe(false);
  });
  it('극치구분 홀수 = 만조, 짝수 = 간조', () => {
    expect(seaTideKindOf('1')).toBe('high');
    expect(seaTideKindOf(2)).toBe('low');
    expect(seaTideKindOf('3')).toBe('high');
    expect(seaTideKindOf('4')).toBe('low');
    expect(seaTideKindOf('9')).toBeNull();
  });
  it('갯벌·바다갈라짐만 오전/오후 구분이 없다', () => {
    expect(seaActivityHasPeriod('beach')).toBe(true);
    expect(seaActivityHasPeriod('mudflat')).toBe(false);
    expect(seaActivityHasPeriod('seaSplit')).toBe(false);
  });
});

describe('가까운 지점', () => {
  it('조석 예보지점 166곳 — 인천 좌표에서 인천(DT_0001)', () => {
    expect(SEA_TIDE_STATIONS).toHaveLength(166);
    const s = nearestSeaTideStation({ lat: 37.452, lng: 126.592 });
    expect(s.code).toBe('DT_0001');
    expect(s.distM).toBeLessThan(100);
  });
  it('이안류 해수욕장 — 이름(공백 무시) 우선, 없으면 2km 안 최근접, 멀면 null', () => {
    expect(matchSeaRipBeach('해운대해수욕장', { lat: 0, lng: 0 })?.code).toBe('HAE');
    expect(matchSeaRipBeach('어딘가', { lat: 36.306, lng: 126.508 })?.code).toBe('DAECHON');
    expect(matchSeaRipBeach('어딘가', { lat: 37.0, lng: 127.0 })).toBeNull();
  });
});
