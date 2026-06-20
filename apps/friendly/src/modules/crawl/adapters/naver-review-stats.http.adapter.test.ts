import { describe, expect, it } from 'vitest';
import {
  buildWtmHeader,
  parseVisitorReviewStats,
} from './naver-review-stats.http.adapter.js';

describe('buildWtmHeader', () => {
  it('base64(JSON{arg,type,source}) 를 패딩 없이 만든다', () => {
    const h = buildWtmHeader('20630562');
    expect(h.endsWith('=')).toBe(false);
    const decoded = JSON.parse(Buffer.from(h, 'base64').toString('utf-8'));
    expect(decoded).toEqual({
      arg: '20630562',
      type: 'restaurant',
      source: 'place',
    });
  });

  it('실제 캡처값과 일치한다(20630562)', () => {
    // 프로빙으로 캡처한 헤더값.
    expect(buildWtmHeader('20630562')).toBe(
      'eyJhcmciOiIyMDYzMDU2MiIsInR5cGUiOiJyZXN0YXVyYW50Iiwic291cmNlIjoicGxhY2UifQ',
    );
  });
});

describe('parseVisitorReviewStats', () => {
  const wrap = (stats: unknown) => [{ data: { visitorReviewStats: stats } }];

  it('배치 응답에서 방문자 리뷰(별점 제외)를 계산한다', () => {
    const r = parseVisitorReviewStats(
      wrap({
        visitorReviewsTotal: 600,
        ratingReviewsTotal: 340,
        review: { totalCount: 600, imageReviewCount: 71 },
      }),
    );
    expect(r).toEqual({
      visitorReviewsTotal: 600,
      ratingReviewsTotal: 340,
      displayReviewCount: 260, // 600 - 340
      imageReviewCount: 71,
    });
  });

  it('단일 객체 응답(비배치)도 처리한다', () => {
    const r = parseVisitorReviewStats({
      data: {
        visitorReviewStats: {
          visitorReviewsTotal: 2758,
          ratingReviewsTotal: 404,
          review: { imageReviewCount: 1001 },
        },
      },
    });
    expect(r?.displayReviewCount).toBe(2354);
    expect(r?.imageReviewCount).toBe(1001);
  });

  it('ratingReviewsTotal 누락 시 0 으로 보고 전체를 그대로 쓴다', () => {
    const r = parseVisitorReviewStats(wrap({ visitorReviewsTotal: 100 }));
    expect(r?.ratingReviewsTotal).toBe(0);
    expect(r?.displayReviewCount).toBe(100);
    expect(r?.imageReviewCount).toBeNull();
  });

  it('콤마 포함 문자열 숫자도 파싱한다', () => {
    const r = parseVisitorReviewStats(
      wrap({ visitorReviewsTotal: '5,658', ratingReviewsTotal: '640' }),
    );
    expect(r?.displayReviewCount).toBe(5018);
  });

  it('별점이 전체보다 많아도 음수가 되지 않는다', () => {
    const r = parseVisitorReviewStats(
      wrap({ visitorReviewsTotal: 10, ratingReviewsTotal: 99 }),
    );
    expect(r?.displayReviewCount).toBe(0);
  });

  it('visitorReviewsTotal 이 없으면 null', () => {
    expect(parseVisitorReviewStats(wrap({ ratingReviewsTotal: 5 }))).toBeNull();
    expect(parseVisitorReviewStats([{ data: {} }])).toBeNull();
    expect(parseVisitorReviewStats(null)).toBeNull();
    expect(parseVisitorReviewStats('nope')).toBeNull();
  });
});
