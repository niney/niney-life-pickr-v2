// 테이블링 미입점 place 어댑터 (얕은 좌표·메타 티어).
//
// /place/:objectId 에는 모바일 API 가 없고(전부 404) 서버 렌더 HTML 의 JSON-LD
// (FoodEstablishment)만 있다. 그 안에 name/좌표(geo)/주소/평점/cuisine 이 들어
// 있어 머지키(이름+좌표)는 충족하나 메뉴·리뷰는 없다. 입점 partner 와 매칭되면
// 풍부 데이터로 승격. 근거: docs/research/tabling-crawl-feasibility.md.

import type { TablingPlaceDataType } from '@repo/api-contract';

const HOST = 'https://www.tabling.co.kr';

const FETCH_TIMEOUT_MS = Number(process.env.CRAWL_TABLING_TIMEOUT_MS ?? '8000');

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class TablingPlaceError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'TablingPlaceError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const strOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

const httpUrlOrNull = (v: unknown): string | null => {
  const s = strOrNull(v);
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

// 테이블링 place 페이지는 JSON-LD 를 실제 <script> 태그로 두지 않고, Next.js
// App Router 의 RSC flight(self.__next_f.push([1,"…"])) 안에 **이중 인코딩**된
// 문자열로 박는다(클라이언트 컴포넌트 prop 으로 JSON.stringify 된 값). 그래서
// 한 단계 flight 디코드 후, FoodEstablishment 를 감싼 stringified prop 을 다시
// 한 번 파싱해야 객체를 얻는다.
const decodeFlight = (html: string): string => {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let decoded = '';
  for (const m of html.matchAll(re)) {
    const chunk = m[1];
    if (!chunk) continue;
    try {
      decoded += JSON.parse(`"${chunk}"`) as string;
    } catch {
      /* 깨진 청크는 skip */
    }
  }
  return decoded;
};

// 옛/대체 경로 — 실제 <script type="application/ld+json"> 태그가 있으면 그대로.
const extractFromScriptTag = (html: string): Record<string, unknown> | null => {
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const body = m[1];
    if (!body) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.trim());
    } catch {
      continue;
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const c of candidates) {
      if (!isObject(c)) continue;
      const t = c['@type'];
      if (t === 'FoodEstablishment' || t === 'Restaurant') return c;
    }
  }
  return null;
};

const extractFoodEstablishment = (html: string): Record<string, unknown> | null => {
  const text = decodeFlight(html);
  const src = text.includes('FoodEstablishment') ? text : html;
  const at = src.indexOf('FoodEstablishment');
  if (at >= 0) {
    // 감싸는 객체 시작 { 로 역탐색.
    let brace = at;
    while (brace >= 0 && src[brace] !== '{') brace -= 1;
    // 그 { 앞이 " 면 stringified prop — 문자열 리터럴을 떼어 두 번 파싱.
    if (brace >= 1 && src[brace - 1] === '"') {
      const strStart = brace - 1;
      let i = strStart + 1;
      for (; i < src.length; i += 1) {
        const c = src[i];
        if (c === '\\') {
          i += 1;
          continue;
        }
        if (c === '"') break;
      }
      try {
        const inner = JSON.parse(src.slice(strStart, i + 1)) as string;
        const obj = JSON.parse(inner) as unknown;
        if (isObject(obj)) return obj;
      } catch {
        /* fall through */
      }
    }
  }
  return extractFromScriptTag(html);
};

export const fetchTablingPlace = async (
  objectId: string,
  signal?: AbortSignal,
): Promise<TablingPlaceDataType> => {
  const trimmed = objectId.trim();
  if (!/^[a-f0-9]{24}$/.test(trimmed)) {
    throw new TablingPlaceError(`invalid objectId: ${objectId}`);
  }

  const ac = signal ? null : new AbortController();
  const timeoutId = ac ? setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS) : null;
  let res: Response;
  try {
    res = await fetch(`${HOST}/place/${trimmed}`, {
      headers: { Accept: 'text/html', 'User-Agent': DESKTOP_UA },
      signal: signal ?? ac?.signal,
    });
  } catch (e) {
    throw new TablingPlaceError(
      e instanceof Error ? `fetch failed: ${e.message}` : 'fetch failed',
      e,
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  if (res.status === 404) throw new TablingPlaceError(`place ${trimmed} not found (404)`);
  if (!res.ok) throw new TablingPlaceError(`status ${res.status}`);

  const html = await res.text();
  const ld = extractFoodEstablishment(html);
  if (!ld) throw new TablingPlaceError(`place ${trimmed}: JSON-LD not found`);

  const name = strOrNull(ld['name']);
  if (!name) throw new TablingPlaceError(`place ${trimmed}: name missing`);

  const addr = isObject(ld['address']) ? ld['address'] : null;
  const geo = isObject(ld['geo']) ? ld['geo'] : null;
  const agg = isObject(ld['aggregateRating']) ? ld['aggregateRating'] : null;

  const cuisinesRaw = ld['servesCuisine'];
  const cuisines = Array.isArray(cuisinesRaw)
    ? cuisinesRaw.filter((s): s is string => typeof s === 'string' && s.length > 0)
    : typeof cuisinesRaw === 'string' && cuisinesRaw.length > 0
      ? [cuisinesRaw]
      : [];

  const imagesRaw = ld['image'];
  const images = (Array.isArray(imagesRaw) ? imagesRaw : imagesRaw ? [imagesRaw] : [])
    .map((u) => httpUrlOrNull(u))
    .filter((u): u is string => u !== null);

  const reviewCount = agg ? numOrNull(agg['reviewCount']) : null;

  return {
    objectId: trimmed,
    name,
    address: addr ? strOrNull(addr['streetAddress']) : null,
    lat: geo ? numOrNull(geo['latitude']) : null,
    lng: geo ? numOrNull(geo['longitude']) : null,
    cuisines,
    rating: agg ? numOrNull(agg['ratingValue']) : null,
    reviewCount: reviewCount !== null ? Math.trunc(reviewCount) : null,
    images,
    description: strOrNull(ld['description']),
    rawSourceUrl: `https://www.tabling.co.kr/place/${trimmed}`,
    fetchedAt: new Date().toISOString(),
    source: 'jsonld',
  };
};
