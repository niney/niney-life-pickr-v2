// Build a friendly-proxy thumbnail URL for a Naver-hosted image. Centralized
// here so FE callers don't hand-stitch query strings (and we can swap the
// transport later without touching every component).
export const reviewThumbnailUrl = (
  originalUrl: string,
  width: number = 300,
  quality?: number,
): string => {
  const params = new URLSearchParams({ url: originalUrl, w: String(width) });
  if (quality !== undefined) params.set('q', String(quality));
  return `/api/v1/media/thumbnail?${params.toString()}`;
};
