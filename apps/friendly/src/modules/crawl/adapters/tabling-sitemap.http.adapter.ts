// 테이블링 사이트맵 발견 어댑터.
//
// 테이블링은 키워드 검색 JSON API 가 없어(웹 검색은 Next.js Server Action 전용)
// 사이트맵이 사실상 유일한 전수 발견 백본이다.
//   shop:  GET /sitemap-shop.xml        → /restaurant/:idx (partner, ~4k)
//   place: GET /sitemap-place-{1..5}.xml → /place/:objectId (미입점, 각 ~45k)
//
// 둘 다 무인증 정적 XML. robots.txt 가 전체 Allow 이고 place 경로는 사이트맵으로
// 적극 노출 중. 저부하 원칙: 호출자가 결과를 직렬+간격으로 saveTablingShop 에
// 흘려보낸다. 근거: docs/research/tabling-crawl-feasibility.md.

const HOST = 'https://www.tabling.co.kr';

const FETCH_TIMEOUT_MS = Number(process.env.CRAWL_TABLING_TIMEOUT_MS ?? '8000');

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class TablingSitemapError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'TablingSitemapError';
  }
}

export interface TablingSitemapResult {
  ids: string[];
  total: number;
  elapsedMs: number;
}

const fetchXml = async (path: string, signal?: AbortSignal): Promise<string> => {
  const ac = signal ? null : new AbortController();
  const timeoutId = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
  let res: Response;
  try {
    res = await fetch(`${HOST}${path}`, {
      headers: { Accept: 'application/xml,text/xml,*/*', 'User-Agent': DESKTOP_UA },
      signal: signal ?? ac?.signal,
    });
  } catch (e) {
    throw new TablingSitemapError(
      e instanceof Error ? `fetch failed: ${e.message}` : 'fetch failed',
      e,
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  if (!res.ok) throw new TablingSitemapError(`status ${res.status}`);
  return res.text();
};

// shop 사이트맵 → /restaurant/:idx 의 숫자 idx 목록.
const SHOP_RE = /\/restaurant\/(\d+)/g;
// place 사이트맵 → /place/:objectId 의 24-hex 목록.
const PLACE_RE = /\/place\/([a-f0-9]{24})/g;

export const fetchTablingSitemap = async (
  tier: 'shop' | 'place',
  page = 1,
  signal?: AbortSignal,
): Promise<TablingSitemapResult> => {
  const t0 = Date.now();
  const path =
    tier === 'shop'
      ? '/sitemap-shop.xml'
      : `/sitemap-place-${Math.min(Math.max(Math.trunc(page), 1), 5)}.xml`;
  const xml = await fetchXml(path, signal);
  const re = tier === 'shop' ? SHOP_RE : PLACE_RE;
  const seen = new Set<string>();
  for (const m of xml.matchAll(re)) {
    const id = m[1];
    if (id) seen.add(id);
  }
  const ids = [...seen];
  return { ids, total: ids.length, elapsedMs: Date.now() - t0 };
};
