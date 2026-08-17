import { describe, expect, it } from 'vitest';
import { compareReviewRecencyDesc, parseReviewVisitedAt } from './reviewDate.js';

const isoDay = (value: number | null): string | null =>
  value === null ? null : new Date(value).toISOString().slice(0, 10);

describe('parseReviewVisitedAt', () => {
  it('출처별 연도 포함 형식을 같은 날짜로 정규화한다', () => {
    expect(isoDay(parseReviewVisitedAt('2026-08-15'))).toBe('2026-08-15');
    expect(isoDay(parseReviewVisitedAt('2026.8.15.토'))).toBe('2026-08-15');
    expect(isoDay(parseReviewVisitedAt('2026년 8월 15일'))).toBe('2026-08-15');
    expect(isoDay(parseReviewVisitedAt('26.8.15.토'))).toBe('2026-08-15');
  });

  it('연도 없는 Naver 날짜는 수집 시각의 KST 연도를 사용한다', () => {
    expect(isoDay(parseReviewVisitedAt('8.15.토', '2026-08-17T10:33:14.000Z'))).toBe(
      '2026-08-15',
    );
  });

  it('1월에 관측한 12월 방문일은 미래가 아니라 전년으로 보정한다', () => {
    expect(isoDay(parseReviewVisitedAt('12.31.수', '2026-01-02T03:00:00.000Z'))).toBe(
      '2025-12-31',
    );
  });

  it('잘못된 날짜와 기준 시각 없는 연도 생략 날짜는 null이다', () => {
    expect(parseReviewVisitedAt('2.30.월', '2026-03-01T00:00:00.000Z')).toBeNull();
    expect(parseReviewVisitedAt('8.15.토')).toBeNull();
    expect(parseReviewVisitedAt('알 수 없음', '2026-08-17T00:00:00.000Z')).toBeNull();
  });
});

describe('compareReviewRecencyDesc', () => {
  it('업데이트 배치의 최근 방문 리뷰를 최초 크롤 리뷰보다 앞에 둔다', () => {
    const reviews = [
      { body: '기존', visitedAt: '6.5.금', fetchedAt: '2026-06-05T13:56:23.000Z' },
      { body: '신규', visitedAt: '8.15.토', fetchedAt: '2026-08-17T10:33:14.000Z' },
    ];
    expect([...reviews].sort(compareReviewRecencyDesc).map((r) => r.body)).toEqual([
      '신규',
      '기존',
    ]);
  });

  it('방문일을 해석할 수 없으면 최근 수집 리뷰를 먼저 둔다', () => {
    const reviews = [
      { body: '기존', visitedAt: null, fetchedAt: '2026-06-05T00:00:00.000Z' },
      { body: '신규', visitedAt: null, fetchedAt: '2026-08-17T00:00:00.000Z' },
    ];
    expect([...reviews].sort(compareReviewRecencyDesc).map((r) => r.body)).toEqual([
      '신규',
      '기존',
    ]);
  });
});
