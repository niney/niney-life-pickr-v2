// Build a friendly-proxy thumbnail URL for a Naver-hosted image. Centralized
// here so FE callers don't hand-stitch query strings (and we can swap the
// transport later without touching every component).
//
// 프록시 서버(/media/thumbnail)는 *.pstatic.net 호스트만 허용하고 url 파라미터에
// 절대 URL 만 받는다(그 외 400). 그래서 프록시를 못 태우는 입력은 원본을 그대로
// 반환한다 — 앱의 thumbUrl(apps/mobile/src/lib/thumbUrl.ts)과 동일한 논리:
//   - same-origin 상대경로(/api/v1/media/panorama/… — 만료되는 네이버 파노라마의
//     크롤 시점 JPEG 사본): 이미 우리 자산이라 프록시 불필요, 그대로 서빙.
//   - 비네이버 호스트(자체 호스팅·DC 등): 브라우저가 원본을 직접 로드.
const isNaverHost = (url: string): boolean => {
  const m = url.match(/^https?:\/\/([^/:?#]+)/);
  return /\.pstatic\.net$/.test(m?.[1] ?? '');
};

export const reviewThumbnailUrl = (
  originalUrl: string,
  width: number = 300,
  quality?: number,
): string => {
  if (!isNaverHost(originalUrl)) return originalUrl;
  const params = new URLSearchParams({ url: originalUrl, w: String(width) });
  if (quality !== undefined) params.set('q', String(quality));
  return `/api/v1/media/thumbnail?${params.toString()}`;
};
