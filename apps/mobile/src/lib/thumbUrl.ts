import { getApiConfig } from '@repo/shared';
import { reviewThumbnailUrl } from '@repo/utils';

/**
 * 네이버 phinf 원본 이미지를 friendly `/media/thumbnail` 프록시(sharp 리사이즈 +
 * 디스크 캐시) 경유 URL 로 바꾼다. 웹(apps/web)은 이미 reviewThumbnailUrl 로
 * 같은 프록시를 쓰는데 앱만 원본(최대 1.5MB) 을 그대로 받고 있었다.
 *
 *   원본 80×80 썸네일  1,538,044 B  →  w=240  24,987 B (-98%)
 *
 * 프록시 서버는 *.pstatic.net 호스트만 허용(그 외 400)하므로, 네이버가 아닌
 * URL(자체 호스팅·DC 등)은 원본을 그대로 통과시킨다. base 가 비어있으면(설정 전)
 * 원본 반환 — 깨진 이미지 대신 원본으로 폴백.
 */
const isNaverHost = (url: string): boolean => {
  const m = url.match(/^https?:\/\/([^/:?#]+)/);
  return /\.pstatic\.net$/.test(m?.[1] ?? '');
};

export function thumbUrl(
  url: string | null | undefined,
  width: number,
  quality?: number,
): string | undefined {
  if (!url) return undefined;
  if (!isNaverHost(url)) return url;
  const base = getApiConfig().baseUrl;
  if (!base) return url;
  return base + reviewThumbnailUrl(url, width, quality);
}
