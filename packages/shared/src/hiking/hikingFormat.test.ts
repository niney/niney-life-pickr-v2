import { describe, expect, it } from 'vitest';
import type { HikingMountainSummaryType } from '@repo/api-contract';
import {
  courseOutingLabel,
  courseTimeBreakdown,
  formatAtM,
  hikingDayLabel,
  hikingDefaultPick,
  hikingStartsFor,
  hmToMin,
  minToHm,
  officialCourseLines,
  rankMountains,
} from './hikingFormat.js';

// 웹·앱 공용 등산 도우미 — 산 거르기·정렬(국립공원 이름 검색), 나들이 시간·방향별 시간 문구.

const mtn = (p: Partial<HikingMountainSummaryType> & { id: string; name: string; lat: number; lng: number }): HikingMountainSummaryType => ({
  kind: 'top100',
  subtitle: null,
  heightM: null,
  area: null,
  regions: [],
  courseCount: 1,
  minLengthM: null,
  maxLengthM: null,
  images: [],
  peaks: [],
  park: null,
  ...p,
});

describe('hikingFormat', () => {
  const items = [
    mtn({ id: 'a', name: '북한산', lat: 37.66, lng: 126.98, heightM: 836, park: '북한산국립공원', regions: ['seoul'] }),
    mtn({ id: 'b', name: '관악산', lat: 37.44, lng: 126.96, heightM: 632, regions: ['seoul'] }),
    mtn({ id: 'c', name: '설악산', lat: 38.12, lng: 128.47, heightM: 1708, park: '설악산국립공원', regions: ['gangwon'] }),
  ];

  it('rankMountains — 국립공원 이름으로 찾고, 가까운순·높은순', () => {
    expect(rankMountains(items, { q: '국립 공원', group: null, sort: 'name', origin: null }).map((r) => r.mountain.id)).toEqual(['a', 'c']);
    const near = rankMountains(items, { q: '', group: null, sort: 'near', origin: { lat: 37.44, lng: 126.96 } });
    expect(near.map((r) => r.mountain.id)).toEqual(['b', 'a', 'c']);
    expect(near[0]!.distM).toBeCloseTo(0, 0);
    expect(rankMountains(items, { q: '', group: 'capital', sort: 'height', origin: null }).map((r) => r.mountain.id)).toEqual(['a', 'b']);
  });

  it('courseOutingLabel·courseTimeBreakdown — 정상 왕복은 왕복, 형태별 방향 문구', () => {
    expect(courseOutingLabel({ shape: 'summit', timeMin: 90, timeRevMin: 60, roundTripMin: 160 })).toBe('왕복 2시간 40분');
    expect(courseOutingLabel({ shape: 'traverse', timeMin: null, timeRevMin: null, roundTripMin: null })).toBeNull();
    expect(courseTimeBreakdown({ shape: 'summit', timeMin: 90, timeRevMin: 60, roundTripMin: 160 })).toBe('오르기 1시간 30분 · 내려오기 1시간');
    expect(courseTimeBreakdown({ shape: 'loop', timeMin: 120, timeRevMin: 125, roundTripMin: null })).toBe('한 바퀴 2시간 · 반대로 돌면 2시간 10분');
  });

  it('formatAtM·officialCourseLines', () => {
    expect(formatAtM(240)).toBe('240m');
    expect(formatAtM(1460)).toBe('1.5km');
    expect(officialCourseLines(' ①A\n\n②B ')).toEqual(['①A', '②B']);
  });
});

// 날짜·출발 시각 — 산행 조건 카드·추천 입력(웹·앱 공용). 시각은 KST 기준.
describe('hiking 날짜·출발 시각', () => {
  it('분 ↔ HH:MM', () => {
    expect(minToHm(8 * 60)).toBe('08:00');
    expect(minToHm(13 * 60 + 30)).toBe('13:30');
    expect(hmToMin('0830')).toBe(510);
    expect(hmToMin('08:30')).toBe(510);
    expect(hmToMin('8시')).toBeNull();
  });

  it('날짜 라벨 — 오늘·내일·모레와 월.일(요일)', () => {
    expect(hikingDayLabel('2026-10-29', 0)).toBe('오늘 10.29(목)');
    expect(hikingDayLabel('2026-10-30', 1)).toBe('내일 10.30(금)');
  });

  it('오늘은 지금 이후 출발만, 다른 날은 04:00~18:00 전부', () => {
    const now = Date.parse('2026-10-29T12:10:00+09:00');
    const today = hikingStartsFor('2026-10-29', 0, now);
    expect(today[0]).toBe(12 * 60 + 30);
    expect(today.at(-1)).toBe(18 * 60);
    expect(hikingStartsFor('2026-10-30', 1, now)).toHaveLength(29);
  });

  it('기본 고르기 — 오늘 남은 시각이 없으면 내일 08:00', () => {
    const dates = ['2026-10-29', '2026-10-30', '2026-10-31'];
    expect(hikingDefaultPick(dates, Date.parse('2026-10-29T07:40:00+09:00'))).toEqual({ day: 0, startMin: 8 * 60 });
    expect(hikingDefaultPick(dates, Date.parse('2026-10-29T19:00:00+09:00'))).toEqual({ day: 1, startMin: 8 * 60 });
  });
});
