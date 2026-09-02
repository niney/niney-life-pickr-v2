import { describe, expect, it } from 'vitest';
import { reviewThumbnailUrl } from './thumbnail';

describe('reviewThumbnailUrl', () => {
  it('pstatic 호스트는 프록시 URL 로 감싼다', () => {
    const url = 'https://ldb-phinf.pstatic.net/20241021_64/213.jpg';
    expect(reviewThumbnailUrl(url, 160)).toBe(
      `/api/v1/media/thumbnail?${new URLSearchParams({ url, w: '160' }).toString()}`,
    );
  });

  it('quality 지정 시 q 파라미터를 붙인다', () => {
    const url = 'https://review-phinf.pstatic.net/a.jpg';
    expect(reviewThumbnailUrl(url, 300, 60)).toContain('&q=60');
  });

  it('상대경로(파노라마 로컬 사본)는 프록시를 거치지 않고 그대로 반환한다', () => {
    // 프록시 zod 가 상대 url 을 400 으로 거부하므로 감싸면 이미지가 깨진다.
    const url = '/api/v1/media/panorama/1772072886';
    expect(reviewThumbnailUrl(url, 160)).toBe(url);
  });

  it('비네이버 호스트는 원본을 그대로 반환한다', () => {
    // 프록시 ALLOWED_HOSTS(*.pstatic.net) 밖 — 감싸면 400 host_not_allowed.
    const url = 'https://img.diningcode.com/place/abc.jpg';
    expect(reviewThumbnailUrl(url, 160)).toBe(url);
  });

  it('배민 메뉴 사진 호스트는 프록시 URL 로 감싼다', () => {
    const url = 'https://imagefarm.baemin.com/smartmenuimage/upload/image/2024/1/24/abc.jpg';
    expect(reviewThumbnailUrl(url, 112)).toBe(
      `/api/v1/media/thumbnail?${new URLSearchParams({ url, w: '112' }).toString()}`,
    );
    expect(reviewThumbnailUrl('https://file.smartbaedal.com/a.jpg', 112)).toContain('/media/thumbnail?');
  });

  it('pstatic 을 흉내낸 다른 도메인은 통과시키지 않고 원본 반환', () => {
    const url = 'https://evilpstatic.net/a.jpg';
    expect(reviewThumbnailUrl(url, 160)).toBe(url);
  });
});
