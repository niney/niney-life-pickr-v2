const ALLOWED_HOSTS = ['naver.com', 'naver.me'];

const isAllowedHost = (hostname: string): boolean =>
  ALLOWED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));

export class UnsupportedUrlError extends Error {
  constructor(message = 'Unsupported URL format') {
    super(message);
    this.name = 'UnsupportedUrlError';
  }
}

export class RedirectFailedError extends Error {
  constructor(message = 'Failed to resolve short URL') {
    super(message);
    this.name = 'RedirectFailedError';
  }
}

const PLACE_PATH_PATTERNS: RegExp[] = [
  /\/p\/entry\/place\/(\d+)/,
  /\/place\/(\d+)/,
  /\/restaurant\/(\d+)/,
  /\/hairshop\/(\d+)/,
];

const extractPlaceIdFromUrl = (url: URL): string | null => {
  for (const pattern of PLACE_PATH_PATTERNS) {
    const m = url.pathname.match(pattern);
    if (m && m[1]) return m[1];
  }
  const queryId = url.searchParams.get('id') ?? url.searchParams.get('placeId');
  if (queryId && /^\d+$/.test(queryId)) return queryId;
  return null;
};

const followShortUrl = async (shortUrl: string): Promise<string> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5_000);
  try {
    const res = await fetch(shortUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    });
    return res.url;
  } catch (e) {
    throw new RedirectFailedError(
      e instanceof Error ? `Short URL resolve failed: ${e.message}` : 'Short URL resolve failed',
    );
  } finally {
    clearTimeout(timer);
  }
};

export interface NormalizedPlace {
  placeId: string;
  canonicalUrl: string;
}

export const normalizeToPlaceId = async (input: string): Promise<NormalizedPlace> => {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new UnsupportedUrlError('Invalid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new UnsupportedUrlError('Only http(s) URLs are supported');
  }
  if (!isAllowedHost(parsed.hostname)) {
    throw new UnsupportedUrlError(`Host not allowed: ${parsed.hostname}`);
  }

  let working = parsed;
  if (parsed.hostname === 'naver.me') {
    const finalUrl = await followShortUrl(parsed.toString());
    working = new URL(finalUrl);
    if (!isAllowedHost(working.hostname)) {
      throw new UnsupportedUrlError(`Redirect leaves naver: ${working.hostname}`);
    }
  }

  const placeId = extractPlaceIdFromUrl(working);
  if (!placeId) {
    throw new UnsupportedUrlError('Could not find place id in URL');
  }
  return {
    placeId,
    canonicalUrl: `https://m.place.naver.com/restaurant/${placeId}/home`,
  };
};
